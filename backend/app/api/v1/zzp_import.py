"""
ZZP CSV Import Endpoints

Endpoints for importing customers, invoices, and expenses from CSV files.
Follows the same preview → confirm pattern:
  1. Upload CSV → preview first 5 rows, validate, report errors
  2. Confirm → actually create records, skip invalid rows
"""
import csv
import io
import re
import uuid
from datetime import datetime, date
from decimal import Decimal, InvalidOperation
from typing import Annotated, Optional, List, Tuple

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.zzp import ZZPCustomer, ZZPInvoice, ZZPInvoiceLine, ZZPExpense
from app.models.administration import Administration, AdministrationMember
from app.schemas.zzp import EXPENSE_CATEGORIES
from app.schemas.zzp_import import (
    ImportRowError,
    ImportPreviewRow,
    CustomerImportPreviewResponse,
    CustomerImportConfirmResponse,
    InvoiceImportPreviewResponse,
    InvoiceImportConfirmResponse,
    ExpenseImportPreviewResponse,
    ExpenseImportConfirmResponse,
)
from app.api.v1.deps import CurrentUser, require_zzp

router = APIRouter()

MAX_IMPORT_ROWS = 500


# =============================================================================
# Helper Functions (reuse bank-import patterns)
# =============================================================================

async def get_user_administration(user_id: uuid.UUID, db: AsyncSession) -> Administration:
    """Get the primary administration for a ZZP user."""
    result = await db.execute(
        select(Administration)
        .join(AdministrationMember)
        .where(AdministrationMember.user_id == user_id)
        .where(Administration.is_active == True)
        .order_by(Administration.created_at)
        .limit(1)
    )
    administration = result.scalar_one_or_none()
    if not administration:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "NO_ADMINISTRATION",
                "message": "Geen administratie gevonden. Voltooi eerst de onboarding.",
            },
        )
    return administration


def read_csv(file_bytes: bytes) -> Tuple[List[str], List[dict]]:
    """
    Read CSV from raw bytes. Auto-detects encoding (UTF-8 / Latin-1)
    and delimiter (semicolon / comma).
    Returns (headers, rows) where rows are list of dicts.
    """
    try:
        decoded = file_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        decoded = file_bytes.decode("latin-1")

    sample = decoded[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=";,")
    except csv.Error:
        dialect = csv.get_dialect("excel")

    reader = csv.DictReader(io.StringIO(decoded), dialect=dialect)
    if not reader.fieldnames:
        return [], []

    headers = [normalize_header(h) for h in reader.fieldnames if h]
    rows: List[dict] = []
    for i, row in enumerate(reader):
        if i >= MAX_IMPORT_ROWS:
            break
        # Normalize keys
        normalized = {}
        for k, v in row.items():
            if k:
                normalized[normalize_header(k)] = (v or "").strip()
        rows.append(normalized)

    return headers, rows


def normalize_header(header: str) -> str:
    """Normalize CSV header for column matching."""
    return header.strip().lower().replace(" ", "_").replace("-", "_")


def parse_date(value: str) -> Optional[date]:
    """Parse date from string using common Dutch/ISO formats."""
    if not value:
        return None
    value = value.strip()
    formats = ["%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d", "%d.%m.%Y"]
    for fmt in formats:
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


def parse_amount(value: str) -> Optional[Decimal]:
    """Parse monetary amount from various European/US formats."""
    if not value:
        return None
    value = value.strip().lstrip("€").lstrip("$").strip()
    if not value:
        return None

    # Handle European format (1.234,56)
    if "," in value and "." in value:
        if value.rfind(",") > value.rfind("."):
            value = value.replace(".", "").replace(",", ".")
        else:
            value = value.replace(",", "")
    elif "," in value:
        parts = value.split(",")
        if len(parts) == 2 and len(parts[1]) <= 2:
            value = value.replace(",", ".")
        else:
            value = value.replace(",", "")

    try:
        return Decimal(value)
    except InvalidOperation:
        return None


def amount_to_cents(amount: Decimal) -> int:
    """Convert decimal amount to cents (integer)."""
    return int((amount * 100).to_integral_value())


# Category mapping from Dutch labels to internal codes
CATEGORY_LABEL_MAP = {
    "algemeen": "algemeen",
    "kantoor": "kantoor",
    "kantoorbenodigdheden": "kantoor",
    "transport": "transport",
    "reiskosten": "transport",
    "vervoer": "transport",
    "marketing": "marketing",
    "reclame": "marketing",
    "hardware": "hardware",
    "software": "software",
    "opleiding": "opleiding",
    "scholing": "opleiding",
    "huisvesting": "huisvesting",
    "huur": "huisvesting",
    "telefoon": "telefoon",
    "internet": "internet",
    "overig": "overig",
    "abonnement": "Abonnement",
    "abonnementen": "Abonnement",
    "lease": "Lease",
    "lening": "Lening",
    "leningen": "Lening",
}


def resolve_category(raw: str) -> Optional[str]:
    """Resolve a Dutch category label to an internal category code."""
    if not raw:
        return "algemeen"
    key = raw.strip().lower()
    # Direct match first (case-insensitive against EXPENSE_CATEGORIES)
    for cat in EXPENSE_CATEGORIES:
        if cat.lower() == key:
            return cat
    # Label map
    return CATEGORY_LABEL_MAP.get(key)


# =============================================================================
# Customer Import
# =============================================================================

# Expected CSV columns: naam, email, adres, postcode, stad, kvk_nummer, btw_nummer
CUSTOMER_COLUMNS = {"naam"}  # required
CUSTOMER_ALL_COLUMNS = {"naam", "email", "adres", "postcode", "stad", "kvk_nummer", "btw_nummer"}


def validate_customer_row(row: dict, row_num: int) -> Tuple[dict, List[ImportRowError]]:
    """Validate and parse a single customer CSV row."""
    errors: List[ImportRowError] = []
    data: dict = {}

    naam = row.get("naam", "").strip()
    if not naam:
        errors.append(ImportRowError(row=row_num, field="naam", message="Naam is verplicht"))
    else:
        data["name"] = naam[:255]

    email = row.get("email", "").strip()
    if email:
        if "@" not in email or "." not in email.split("@")[-1]:
            errors.append(ImportRowError(row=row_num, field="email", message="Ongeldig e-mailadres"))
        else:
            data["email"] = email[:255]

    data["address_street"] = row.get("adres", "").strip()[:500] or None
    data["address_postal_code"] = row.get("postcode", "").strip()[:20] or None
    data["address_city"] = row.get("stad", "").strip()[:100] or None

    kvk = row.get("kvk_nummer", "").strip()
    if kvk:
        data["kvk_number"] = kvk[:20]

    btw = row.get("btw_nummer", "").strip()
    if btw:
        data["btw_number"] = btw[:30]

    return data, errors


@router.post("/import/customers", response_model=CustomerImportPreviewResponse)
async def preview_customer_import(
    file: Annotated[UploadFile, File(..., description="CSV-bestand met klantgegevens")],
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Upload a customer CSV file and return a preview.

    Shows first 5 rows and total counts. Reports validation errors per row.
    """
    require_zzp(current_user)
    await get_user_administration(current_user.id, db)

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Leeg bestand geüpload.")

    headers, rows = read_csv(file_bytes)
    if not headers:
        raise HTTPException(status_code=400, detail="CSV-bestand bevat geen kolommen.")

    # Check required column
    if "naam" not in headers:
        raise HTTPException(
            status_code=400,
            detail="Verplichte kolom 'naam' ontbreekt in het CSV-bestand.",
        )

    if len(rows) > MAX_IMPORT_ROWS:
        raise HTTPException(
            status_code=400,
            detail=f"Maximaal {MAX_IMPORT_ROWS} rijen per import.",
        )

    all_errors: List[ImportRowError] = []
    preview_rows: List[ImportPreviewRow] = []
    all_parsed: List[dict] = []
    valid_count = 0

    for i, row in enumerate(rows):
        row_num = i + 2  # 1-based, header is row 1
        data, row_errors = validate_customer_row(row, row_num)
        is_valid = len(row_errors) == 0
        if is_valid:
            valid_count += 1

        all_errors.extend(row_errors)
        all_parsed.append(data if is_valid else {})

        if i < 5:
            preview_rows.append(
                ImportPreviewRow(
                    row_number=row_num,
                    data=data,
                    errors=row_errors,
                    valid=is_valid,
                )
            )

    return CustomerImportPreviewResponse(
        preview_rows=preview_rows,
        total_rows=len(rows),
        valid_rows=valid_count,
        error_rows=len(rows) - valid_count,
        errors=all_errors[:50],  # Cap errors
        all_rows=all_parsed,
    )


@router.post("/import/customers/confirm", response_model=CustomerImportConfirmResponse)
async def confirm_customer_import(
    file: Annotated[UploadFile, File(..., description="CSV-bestand met klantgegevens")],
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Confirm customer CSV import. Re-upload the same CSV file.
    Creates customer records, skipping rows with validation errors.
    """
    require_zzp(current_user)
    administration = await get_user_administration(current_user.id, db)

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Leeg bestand geüpload.")

    headers, rows = read_csv(file_bytes)
    if not headers or "naam" not in headers:
        raise HTTPException(status_code=400, detail="Verplichte kolom 'naam' ontbreekt.")

    imported = 0
    skipped = 0
    errors: List[ImportRowError] = []

    for i, row in enumerate(rows):
        row_num = i + 2
        data, row_errors = validate_customer_row(row, row_num)
        if row_errors:
            skipped += 1
            errors.extend(row_errors)
            continue

        customer = ZZPCustomer(
            administration_id=administration.id,
            name=data["name"],
            email=data.get("email"),
            address_street=data.get("address_street"),
            address_postal_code=data.get("address_postal_code"),
            address_city=data.get("address_city"),
            kvk_number=data.get("kvk_number"),
            btw_number=data.get("btw_number"),
            status="active",
        )
        db.add(customer)
        imported += 1

    if imported > 0:
        await db.commit()

    return CustomerImportConfirmResponse(
        imported_count=imported,
        skipped_count=skipped,
        total_count=len(rows),
        errors=errors[:50],
        message=f"{imported} klanten geïmporteerd, {skipped} overgeslagen.",
    )


# =============================================================================
# Invoice Import (historical)
# =============================================================================

# Expected CSV columns: factuurnummer, datum, klant_naam, bedrag_incl_btw, btw_bedrag, status
INVOICE_REQUIRED_COLUMNS = {"factuurnummer", "datum", "klant_naam", "bedrag_incl_btw"}


def validate_invoice_row(row: dict, row_num: int) -> Tuple[dict, List[ImportRowError]]:
    """Validate and parse a single invoice CSV row."""
    errors: List[ImportRowError] = []
    data: dict = {}

    # factuurnummer
    nr = row.get("factuurnummer", "").strip()
    if not nr:
        errors.append(ImportRowError(row=row_num, field="factuurnummer", message="Factuurnummer is verplicht"))
    else:
        data["invoice_number"] = nr[:50]

    # datum
    datum_str = row.get("datum", "").strip()
    d = parse_date(datum_str)
    if not d:
        errors.append(ImportRowError(row=row_num, field="datum", message="Ongeldige datum (gebruik DD-MM-YYYY of YYYY-MM-DD)"))
    else:
        data["issue_date"] = d

    # klant_naam
    klant = row.get("klant_naam", "").strip()
    if not klant:
        errors.append(ImportRowError(row=row_num, field="klant_naam", message="Klantnaam is verplicht"))
    else:
        data["customer_name"] = klant[:255]

    # bedrag_incl_btw
    bedrag_str = row.get("bedrag_incl_btw", "").strip()
    bedrag = parse_amount(bedrag_str)
    if bedrag is None or bedrag <= 0:
        errors.append(ImportRowError(row=row_num, field="bedrag_incl_btw", message="Ongeldig bedrag (moet groter dan 0 zijn)"))
    else:
        data["total_cents"] = amount_to_cents(bedrag)

    # btw_bedrag (optional)
    btw_str = row.get("btw_bedrag", "").strip()
    if btw_str:
        btw = parse_amount(btw_str)
        if btw is None or btw < 0:
            errors.append(ImportRowError(row=row_num, field="btw_bedrag", message="Ongeldig BTW-bedrag"))
        else:
            data["vat_total_cents"] = amount_to_cents(btw)
    else:
        data["vat_total_cents"] = 0

    # status (optional, default: open)
    status_raw = row.get("status", "").strip().lower()
    if status_raw in ("betaald", "paid"):
        data["status"] = "paid"
    elif status_raw in ("open", "sent", "verzonden", ""):
        data["status"] = "sent"
    elif status_raw in ("concept", "draft"):
        data["status"] = "draft"
    else:
        data["status"] = "sent"

    return data, errors


@router.post("/import/invoices", response_model=InvoiceImportPreviewResponse)
async def preview_invoice_import(
    file: Annotated[UploadFile, File(..., description="CSV-bestand met factuurgegevens")],
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Upload an invoice CSV file and return a preview.

    Shows first 5 rows and total counts. Reports validation errors per row.
    Historical import only – does NOT generate ledger transactions.
    """
    require_zzp(current_user)
    await get_user_administration(current_user.id, db)

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Leeg bestand geüpload.")

    headers, rows = read_csv(file_bytes)
    if not headers:
        raise HTTPException(status_code=400, detail="CSV-bestand bevat geen kolommen.")

    missing = INVOICE_REQUIRED_COLUMNS - set(headers)
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Verplichte kolommen ontbreken: {', '.join(sorted(missing))}",
        )

    if len(rows) > MAX_IMPORT_ROWS:
        raise HTTPException(status_code=400, detail=f"Maximaal {MAX_IMPORT_ROWS} rijen per import.")

    all_errors: List[ImportRowError] = []
    preview_rows: List[ImportPreviewRow] = []
    all_parsed: List[dict] = []
    valid_count = 0

    for i, row in enumerate(rows):
        row_num = i + 2
        data, row_errors = validate_invoice_row(row, row_num)
        is_valid = len(row_errors) == 0
        if is_valid:
            valid_count += 1

        all_errors.extend(row_errors)
        # Serialize date for JSON
        serializable_data = dict(data)
        if "issue_date" in serializable_data and isinstance(serializable_data["issue_date"], date):
            serializable_data["issue_date"] = serializable_data["issue_date"].isoformat()
        all_parsed.append(serializable_data if is_valid else {})

        if i < 5:
            preview_data = dict(data)
            if "issue_date" in preview_data and isinstance(preview_data["issue_date"], date):
                preview_data["issue_date"] = preview_data["issue_date"].isoformat()
            preview_rows.append(
                ImportPreviewRow(
                    row_number=row_num,
                    data=preview_data,
                    errors=row_errors,
                    valid=is_valid,
                )
            )

    return InvoiceImportPreviewResponse(
        preview_rows=preview_rows,
        total_rows=len(rows),
        valid_rows=valid_count,
        error_rows=len(rows) - valid_count,
        errors=all_errors[:50],
        all_rows=all_parsed,
    )


@router.post("/import/invoices/confirm", response_model=InvoiceImportConfirmResponse)
async def confirm_invoice_import(
    file: Annotated[UploadFile, File(..., description="CSV-bestand met factuurgegevens")],
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Confirm invoice CSV import. Re-upload the same CSV file.
    Creates invoice records with status, skipping rows with errors.
    Does NOT generate ledger transactions (historical import).
    """
    require_zzp(current_user)
    administration = await get_user_administration(current_user.id, db)

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Leeg bestand geüpload.")

    headers, rows = read_csv(file_bytes)
    if not headers:
        raise HTTPException(status_code=400, detail="CSV-bestand bevat geen kolommen.")

    missing = INVOICE_REQUIRED_COLUMNS - set(headers)
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Verplichte kolommen ontbreken: {', '.join(sorted(missing))}",
        )

    # Build customer lookup cache (name → customer)
    cust_result = await db.execute(
        select(ZZPCustomer).where(
            ZZPCustomer.administration_id == administration.id,
            ZZPCustomer.status == "active",
        )
    )
    existing_customers = {c.name.lower(): c for c in cust_result.scalars().all()}

    imported = 0
    skipped = 0
    errors: List[ImportRowError] = []

    for i, row in enumerate(rows):
        row_num = i + 2
        data, row_errors = validate_invoice_row(row, row_num)
        if row_errors:
            skipped += 1
            errors.extend(row_errors)
            continue

        # Find or create customer
        customer_name = data["customer_name"]
        customer = existing_customers.get(customer_name.lower())
        if not customer:
            customer = ZZPCustomer(
                administration_id=administration.id,
                name=customer_name,
                status="active",
            )
            db.add(customer)
            await db.flush()
            existing_customers[customer_name.lower()] = customer

        vat_total = data.get("vat_total_cents", 0)
        total = data["total_cents"]
        subtotal = total - vat_total

        invoice = ZZPInvoice(
            administration_id=administration.id,
            customer_id=customer.id,
            invoice_number=data["invoice_number"],
            status=data["status"],
            issue_date=data["issue_date"],
            subtotal_cents=subtotal,
            vat_total_cents=vat_total,
            total_cents=total,
            amount_paid_cents=total if data["status"] == "paid" else 0,
            paid_at=datetime.utcnow() if data["status"] == "paid" else None,
            customer_name=customer_name,
            notes="Geïmporteerd via CSV",
        )
        db.add(invoice)

        # Create a single invoice line for the full amount
        line = ZZPInvoiceLine(
            invoice_id=invoice.id,
            line_number=1,
            description=f"Geïmporteerd - {data['invoice_number']}",
            quantity=Decimal("1"),
            unit_price_cents=subtotal,
            vat_rate=Decimal("21") if vat_total > 0 else Decimal("0"),
            line_total_cents=subtotal,
            vat_amount_cents=vat_total,
        )
        db.add(line)
        imported += 1

    if imported > 0:
        await db.commit()

    return InvoiceImportConfirmResponse(
        imported_count=imported,
        skipped_count=skipped,
        total_count=len(rows),
        errors=errors[:50],
        message=f"{imported} facturen geïmporteerd, {skipped} overgeslagen.",
    )


# =============================================================================
# Expense Import
# =============================================================================

# Expected CSV columns: datum, bedrag, btw_bedrag, categorie, omschrijving, leverancier
EXPENSE_REQUIRED_COLUMNS = {"datum", "bedrag", "leverancier"}


def validate_expense_row(row: dict, row_num: int) -> Tuple[dict, List[ImportRowError]]:
    """Validate and parse a single expense CSV row."""
    errors: List[ImportRowError] = []
    data: dict = {}

    # datum
    datum_str = row.get("datum", "").strip()
    d = parse_date(datum_str)
    if not d:
        errors.append(ImportRowError(row=row_num, field="datum", message="Ongeldige datum (gebruik DD-MM-YYYY of YYYY-MM-DD)"))
    else:
        data["expense_date"] = d

    # bedrag
    bedrag_str = row.get("bedrag", "").strip()
    bedrag = parse_amount(bedrag_str)
    if bedrag is None or bedrag <= 0:
        errors.append(ImportRowError(row=row_num, field="bedrag", message="Ongeldig bedrag (moet groter dan 0 zijn)"))
    else:
        data["amount_cents"] = amount_to_cents(bedrag)

    # btw_bedrag (optional)
    btw_str = row.get("btw_bedrag", "").strip()
    if btw_str:
        btw = parse_amount(btw_str)
        if btw is None or btw < 0:
            errors.append(ImportRowError(row=row_num, field="btw_bedrag", message="Ongeldig BTW-bedrag"))
        else:
            data["vat_amount_cents"] = amount_to_cents(btw)
    else:
        # Auto-calculate assuming 21% VAT
        if "amount_cents" in data:
            data["vat_amount_cents"] = calculate_vat_amount(data["amount_cents"], 21.0)
        else:
            data["vat_amount_cents"] = 0

    # categorie (optional)
    cat_raw = row.get("categorie", "").strip()
    if cat_raw:
        resolved = resolve_category(cat_raw)
        if resolved is None:
            errors.append(ImportRowError(
                row=row_num,
                field="categorie",
                message=f"Onbekende categorie '{cat_raw}'. Geldige categorieën: {', '.join(EXPENSE_CATEGORIES)}",
            ))
        else:
            data["category"] = resolved
    else:
        data["category"] = "algemeen"

    # omschrijving (optional)
    data["description"] = row.get("omschrijving", "").strip()[:500] or None

    # leverancier
    leverancier = row.get("leverancier", "").strip()
    if not leverancier:
        errors.append(ImportRowError(row=row_num, field="leverancier", message="Leverancier is verplicht"))
    else:
        data["vendor"] = leverancier[:255]

    return data, errors


def calculate_vat_amount(amount_cents: int, vat_rate: float) -> int:
    """Calculate VAT amount from total amount (including VAT)."""
    return int(Decimal(str(amount_cents)) * Decimal(str(vat_rate)) / (Decimal("100") + Decimal(str(vat_rate))))


@router.post("/import/expenses", response_model=ExpenseImportPreviewResponse)
async def preview_expense_import(
    file: Annotated[UploadFile, File(..., description="CSV-bestand met uitgaven")],
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Upload an expense CSV file and return a preview.

    Shows first 5 rows and total counts. Reports validation errors per row.
    """
    require_zzp(current_user)
    await get_user_administration(current_user.id, db)

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Leeg bestand geüpload.")

    headers, rows = read_csv(file_bytes)
    if not headers:
        raise HTTPException(status_code=400, detail="CSV-bestand bevat geen kolommen.")

    missing = EXPENSE_REQUIRED_COLUMNS - set(headers)
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Verplichte kolommen ontbreken: {', '.join(sorted(missing))}",
        )

    if len(rows) > MAX_IMPORT_ROWS:
        raise HTTPException(status_code=400, detail=f"Maximaal {MAX_IMPORT_ROWS} rijen per import.")

    all_errors: List[ImportRowError] = []
    preview_rows: List[ImportPreviewRow] = []
    all_parsed: List[dict] = []
    valid_count = 0

    for i, row in enumerate(rows):
        row_num = i + 2
        data, row_errors = validate_expense_row(row, row_num)
        is_valid = len(row_errors) == 0
        if is_valid:
            valid_count += 1

        all_errors.extend(row_errors)
        serializable_data = dict(data)
        if "expense_date" in serializable_data and isinstance(serializable_data["expense_date"], date):
            serializable_data["expense_date"] = serializable_data["expense_date"].isoformat()
        all_parsed.append(serializable_data if is_valid else {})

        if i < 5:
            preview_data = dict(data)
            if "expense_date" in preview_data and isinstance(preview_data["expense_date"], date):
                preview_data["expense_date"] = preview_data["expense_date"].isoformat()
            preview_rows.append(
                ImportPreviewRow(
                    row_number=row_num,
                    data=preview_data,
                    errors=row_errors,
                    valid=is_valid,
                )
            )

    return ExpenseImportPreviewResponse(
        preview_rows=preview_rows,
        total_rows=len(rows),
        valid_rows=valid_count,
        error_rows=len(rows) - valid_count,
        errors=all_errors[:50],
        all_rows=all_parsed,
    )


@router.post("/import/expenses/confirm", response_model=ExpenseImportConfirmResponse)
async def confirm_expense_import(
    file: Annotated[UploadFile, File(..., description="CSV-bestand met uitgaven")],
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Confirm expense CSV import. Re-upload the same CSV file.
    Creates expense records, skipping rows with errors.
    """
    require_zzp(current_user)
    administration = await get_user_administration(current_user.id, db)

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Leeg bestand geüpload.")

    headers, rows = read_csv(file_bytes)
    if not headers:
        raise HTTPException(status_code=400, detail="CSV-bestand bevat geen kolommen.")

    missing = EXPENSE_REQUIRED_COLUMNS - set(headers)
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"Verplichte kolommen ontbreken: {', '.join(sorted(missing))}",
        )

    imported = 0
    skipped = 0
    errors: List[ImportRowError] = []

    for i, row in enumerate(rows):
        row_num = i + 2
        data, row_errors = validate_expense_row(row, row_num)
        if row_errors:
            skipped += 1
            errors.extend(row_errors)
            continue

        vat_amount = data["vat_amount_cents"]

        # Determine vat_rate from amounts
        vat_rate = Decimal("21")
        if vat_amount == 0:
            vat_rate = Decimal("0")
        elif data["amount_cents"] > 0:
            # Calculate approximate rate
            excl = data["amount_cents"] - vat_amount
            if excl > 0:
                rate = Decimal(str(vat_amount)) / Decimal(str(excl)) * 100
                # Snap to nearest standard rate
                if abs(rate - 9) < 2:
                    vat_rate = Decimal("9")
                elif abs(rate - 21) < 3:
                    vat_rate = Decimal("21")
                elif abs(rate) < 1:
                    vat_rate = Decimal("0")

        expense = ZZPExpense(
            administration_id=administration.id,
            vendor=data["vendor"],
            description=data.get("description"),
            expense_date=data["expense_date"],
            amount_cents=data["amount_cents"],
            vat_rate=vat_rate,
            vat_amount_cents=vat_amount,
            category=data.get("category", "algemeen"),
        )
        db.add(expense)
        imported += 1

    if imported > 0:
        await db.commit()

    return ExpenseImportConfirmResponse(
        imported_count=imported,
        skipped_count=skipped,
        total_count=len(rows),
        errors=errors[:50],
        message=f"{imported} uitgaven geïmporteerd, {skipped} overgeslagen.",
    )
