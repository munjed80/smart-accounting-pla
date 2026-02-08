"""
ZZP Bank Payments API Endpoints

Endpoints for ZZP users to:
- Import bank transactions (CSV)
- View bank accounts and transactions
- Match transactions to invoices (auto or manual)
- Unmatch transactions from invoices
- Track payment status

This is distinct from the accountant bank reconciliation flow.
ZZP users work directly with their invoices.
"""
import csv
import hashlib
import io
import re
import uuid
from datetime import datetime, date
from decimal import Decimal, InvalidOperation
from typing import Annotated, Optional, List, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy import select, func, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.bank import BankAccount, BankTransaction, BankTransactionStatus
from app.models.zzp import ZZPInvoice, InvoiceStatus, ZZPBankTransactionMatch
from app.models.administration import Administration, AdministrationMember
from app.schemas.zzp import (
    ZZPBankAccountResponse,
    ZZPBankAccountListResponse,
    ZZPBankTransactionResponse,
    ZZPBankTransactionListResponse,
    ZZPBankImportResponse,
    ZZPInvoiceMatchSuggestion,
    ZZPMatchSuggestionsResponse,
    ZZPMatchInvoiceRequest,
    ZZPMatchInvoiceResponse,
    ZZPUnmatchResponse,
    ZZPBankTransactionMatchResponse,
    ZZPBankTransactionMatchListResponse,
)
from app.api.v1.deps import CurrentUser, require_zzp

router = APIRouter()


# =============================================================================
# Helper Functions
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
                "message": "Geen administratie gevonden. Voltooi eerst de onboarding."
            }
        )
    
    return administration


def compute_transaction_hash(
    administration_id: uuid.UUID,
    booking_date: date,
    amount: Decimal,
    description: str,
    reference: Optional[str] = None,
    counterparty_iban: Optional[str] = None,
) -> str:
    """Compute SHA256 hash for idempotent import."""
    parts = [
        str(administration_id),
        booking_date.isoformat(),
        f"{amount:.2f}",
        description.strip(),
        (reference or "").strip(),
        (counterparty_iban or "").strip(),
    ]
    hash_input = "|".join(parts)
    return hashlib.sha256(hash_input.encode("utf-8")).hexdigest()


def parse_amount(value: str) -> Optional[Decimal]:
    """Parse amount from various formats."""
    if not value:
        return None
    
    value = value.strip()
    
    # Handle European format (1.234,56)
    if ',' in value and '.' in value:
        if value.rfind(',') > value.rfind('.'):
            # European: 1.234,56
            value = value.replace('.', '').replace(',', '.')
        else:
            # US: 1,234.56
            value = value.replace(',', '')
    elif ',' in value:
        # Could be 1234,56 (European decimal) or 1,234 (US thousands)
        parts = value.split(',')
        if len(parts) == 2 and len(parts[1]) == 2:
            value = value.replace(',', '.')
        else:
            value = value.replace(',', '')
    
    try:
        return Decimal(value)
    except InvalidOperation:
        return None


def parse_date(value: str) -> Optional[date]:
    """Parse date from string using common formats."""
    if not value:
        return None
    
    value = value.strip()
    
    formats = [
        "%Y-%m-%d",
        "%d-%m-%Y",
        "%d/%m/%Y",
        "%Y/%m/%d",
        "%d.%m.%Y",
    ]
    
    for fmt in formats:
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    
    return None


def normalize_header(header: str) -> str:
    """Normalize CSV header for column matching."""
    return header.strip().lower().replace(" ", "_").replace("-", "_")


def resolve_csv_columns(headers: List[str]) -> Optional[dict]:
    """Resolve required columns from CSV headers."""
    normalized = {normalize_header(h): h for h in headers if h}
    
    # Column aliases for Dutch/English bank exports
    aliases = {
        "booking_date": {"date", "booking_date", "datum", "boekdatum", "transactiedatum"},
        "amount": {"amount", "bedrag", "amount_eur"},
        "description": {"description", "omschrijving", "naam_omschrijving"},
        "counterparty_iban": {"iban", "counterparty_iban", "tegenrekening"},
        "counterparty_name": {"counterparty_name", "naam_tegenpartij", "tegenpartij"},
        "reference": {"reference", "referentie", "kenmerk", "betalingskenmerk"},
        "account_iban": {"account_iban", "rekening", "rekeningnummer"},
    }

    resolved: dict = {}
    for key, options in aliases.items():
        for option in options:
            if option in normalized:
                resolved[key] = normalized[option]
                break

    # Check required columns
    required = all(resolved.get(k) for k in ("booking_date", "amount", "description"))
    return resolved if required else None


async def get_or_create_bank_account(
    db: AsyncSession,
    administration_id: uuid.UUID,
    iban: str,
    bank_name: Optional[str],
) -> BankAccount:
    """Get existing or create new bank account."""
    normalized_iban = iban.replace(" ", "").upper()
    
    result = await db.execute(
        select(BankAccount)
        .where(BankAccount.administration_id == administration_id)
        .where(BankAccount.iban == normalized_iban)
    )
    bank_account = result.scalar_one_or_none()
    
    if bank_account:
        return bank_account

    bank_account = BankAccount(
        administration_id=administration_id,
        iban=normalized_iban,
        bank_name=bank_name,
        currency="EUR",
    )
    db.add(bank_account)
    await db.flush()
    return bank_account


def extract_invoice_numbers(description: str) -> List[str]:
    """Extract potential invoice numbers from transaction description."""
    # Match common invoice number patterns
    patterns = [
        r"(?:factuur|invoice|inv|fact)[:\s#-]*([A-Za-z0-9-]+)",
        r"INV-\d{4}-\d{4}",  # Our format: INV-YYYY-NNNN
    ]
    
    numbers = []
    for pattern in patterns:
        matches = re.findall(pattern, description, re.IGNORECASE)
        for match in matches:
            if isinstance(match, tuple):
                numbers.extend(match)
            else:
                numbers.append(match)
    
    return list({n.strip() for n in numbers if n and n.strip()})


def transaction_to_response(
    transaction: BankTransaction,
    matched_invoice_id: Optional[uuid.UUID] = None,
    matched_invoice_number: Optional[str] = None,
) -> ZZPBankTransactionResponse:
    """Convert BankTransaction to response schema."""
    return ZZPBankTransactionResponse(
        id=transaction.id,
        administration_id=transaction.administration_id,
        bank_account_id=transaction.bank_account_id,
        booking_date=transaction.booking_date.isoformat(),
        amount_cents=int(transaction.amount * 100),
        currency=transaction.currency,
        counterparty_name=transaction.counterparty_name,
        counterparty_iban=transaction.counterparty_iban,
        description=transaction.description,
        reference=transaction.reference,
        status=transaction.status.value,
        matched_invoice_id=matched_invoice_id,
        matched_invoice_number=matched_invoice_number,
        created_at=transaction.created_at,
    )


# =============================================================================
# Bank Account Endpoints
# =============================================================================

@router.get("/bank/accounts", response_model=ZZPBankAccountListResponse)
async def list_bank_accounts(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    List all bank accounts for the current user's administration.
    """
    require_zzp(current_user)
    administration = await get_user_administration(current_user.id, db)
    
    result = await db.execute(
        select(BankAccount)
        .where(BankAccount.administration_id == administration.id)
        .order_by(BankAccount.created_at.desc())
    )
    accounts = result.scalars().all()
    
    return ZZPBankAccountListResponse(
        accounts=[ZZPBankAccountResponse.model_validate(a) for a in accounts],
        total=len(accounts),
    )


# =============================================================================
# Bank Import Endpoint
# =============================================================================

@router.post("/bank/import", response_model=ZZPBankImportResponse)
async def import_bank_file(
    file: Annotated[UploadFile, File(..., description="CSV-bestand met banktransacties")],
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    bank_account_iban: Optional[str] = Form(None, description="IBAN van de bankrekening"),
    bank_name: Optional[str] = Form(None, description="Naam van de bank"),
):
    """
    Import bank transactions from a CSV file.
    
    Supports common Dutch bank export formats (ING, ABN AMRO, Rabobank).
    Transactions are imported idempotently - duplicates are silently skipped.
    
    Required CSV columns: date/datum, amount/bedrag, description/omschrijving
    Optional: counterparty IBAN, counterparty name, reference
    """
    require_zzp(current_user)
    administration = await get_user_administration(current_user.id, db)
    
    # Read and decode file
    file_bytes = await file.read()
    try:
        decoded = file_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        decoded = file_bytes.decode("latin-1")
    
    # Parse CSV
    sample = decoded[:2048]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=";,")
    except csv.Error:
        dialect = csv.get_dialect("excel")
    
    reader = csv.DictReader(io.StringIO(decoded), dialect=dialect)
    if not reader.fieldnames:
        return ZZPBankImportResponse(
            imported_count=0,
            skipped_duplicates_count=0,
            total_in_file=0,
            errors=["CSV-bestand bevat geen kolommen."],
            message="Import mislukt: ontbrekende kolommen.",
            bank_account_id=None,
        )
    
    # Resolve columns
    column_map = resolve_csv_columns(reader.fieldnames)
    if not column_map:
        return ZZPBankImportResponse(
            imported_count=0,
            skipped_duplicates_count=0,
            total_in_file=0,
            errors=["CSV-bestand mist verplichte kolommen: datum, bedrag, omschrijving."],
            message="Import mislukt: ongeldige kolommen.",
            bank_account_id=None,
        )
    
    rows = list(reader)
    
    # Try to infer IBAN from file
    effective_iban = bank_account_iban
    if not effective_iban and column_map.get("account_iban"):
        for row in rows:
            value = row.get(column_map["account_iban"])
            if value:
                effective_iban = value.replace(" ", "").upper()
                break
    
    if not effective_iban:
        return ZZPBankImportResponse(
            imported_count=0,
            skipped_duplicates_count=0,
            total_in_file=0,
            errors=["Geen IBAN opgegeven en niet kunnen afleiden uit het bestand."],
            message="Import mislukt: IBAN ontbreekt.",
            bank_account_id=None,
        )
    
    bank_account = await get_or_create_bank_account(db, administration.id, effective_iban, bank_name)
    
    # Get existing hashes for duplicate detection
    existing_hashes_result = await db.execute(
        select(BankTransaction.import_hash)
        .where(BankTransaction.administration_id == administration.id)
    )
    existing_hashes = set(row[0] for row in existing_hashes_result.fetchall())
    
    imported_count = 0
    skipped_duplicates = 0
    total_in_file = 0
    errors: List[str] = []
    
    for row_num, row in enumerate(rows, start=2):
        total_in_file += 1
        
        # Extract values
        date_str = row.get(column_map.get("booking_date", ""), "").strip()
        amount_str = row.get(column_map.get("amount", ""), "").strip()
        description = row.get(column_map.get("description", ""), "").strip()
        counterparty_iban = row.get(column_map.get("counterparty_iban", ""), "").strip() or None
        counterparty_name = row.get(column_map.get("counterparty_name", ""), "").strip() or None
        reference = row.get(column_map.get("reference", ""), "").strip() or None
        
        # Parse and validate
        booking_date = parse_date(date_str)
        if not booking_date:
            errors.append(f"Rij {row_num}: Ongeldige datum: {date_str}")
            continue
        
        amount = parse_amount(amount_str)
        if amount is None:
            errors.append(f"Rij {row_num}: Ongeldig bedrag: {amount_str}")
            continue
        
        if not description:
            errors.append(f"Rij {row_num}: Omschrijving is verplicht")
            continue
        
        # Compute hash for idempotency
        raw_hash = compute_transaction_hash(
            administration.id,
            booking_date,
            amount,
            description,
            reference=reference,
            counterparty_iban=counterparty_iban,
        )
        
        if raw_hash in existing_hashes:
            skipped_duplicates += 1
            continue
        
        # Create transaction
        transaction = BankTransaction(
            administration_id=administration.id,
            bank_account_id=bank_account.id,
            booking_date=booking_date,
            amount=amount,
            currency="EUR",
            counterparty_name=counterparty_name,
            counterparty_iban=counterparty_iban,
            description=description,
            reference=reference,
            import_hash=raw_hash,
            status=BankTransactionStatus.NEW,
        )
        db.add(transaction)
        existing_hashes.add(raw_hash)
        imported_count += 1
    
    await db.commit()
    
    # Build message
    if imported_count > 0 and len(errors) == 0:
        message = f"{imported_count} transacties geïmporteerd."
    elif imported_count > 0:
        message = f"{imported_count} transacties geïmporteerd, {len(errors)} fouten."
    elif skipped_duplicates > 0:
        message = f"Geen nieuwe transacties. {skipped_duplicates} duplicaten overgeslagen."
    else:
        message = "Import mislukt: geen geldige transacties gevonden."
    
    return ZZPBankImportResponse(
        imported_count=imported_count,
        skipped_duplicates_count=skipped_duplicates,
        total_in_file=total_in_file,
        errors=errors[:10],  # Limit error count
        message=message,
        bank_account_id=bank_account.id,
    )


# =============================================================================
# Bank Transactions Endpoints
# =============================================================================

@router.get("/bank/transactions", response_model=ZZPBankTransactionListResponse)
async def list_bank_transactions(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    status: Optional[str] = Query(None, pattern=r'^(NEW|MATCHED|IGNORED|NEEDS_REVIEW)$'),
    bank_account_id: Optional[uuid.UUID] = Query(None),
    date_from: Optional[str] = Query(None, description="Filter from date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="Filter to date (YYYY-MM-DD)"),
    q: Optional[str] = Query(None, description="Search in description/counterparty"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    """
    List bank transactions for the current user's administration.
    """
    require_zzp(current_user)
    administration = await get_user_administration(current_user.id, db)
    
    # Base query
    query = (
        select(BankTransaction)
        .where(BankTransaction.administration_id == administration.id)
        .order_by(BankTransaction.booking_date.desc(), BankTransaction.created_at.desc())
    )
    
    count_query = (
        select(func.count(BankTransaction.id))
        .where(BankTransaction.administration_id == administration.id)
    )
    
    # Apply filters
    if status:
        query = query.where(BankTransaction.status == BankTransactionStatus(status))
        count_query = count_query.where(BankTransaction.status == BankTransactionStatus(status))
    
    if bank_account_id:
        query = query.where(BankTransaction.bank_account_id == bank_account_id)
        count_query = count_query.where(BankTransaction.bank_account_id == bank_account_id)
    
    if date_from:
        from_date = date.fromisoformat(date_from)
        query = query.where(BankTransaction.booking_date >= from_date)
        count_query = count_query.where(BankTransaction.booking_date >= from_date)
    
    if date_to:
        to_date = date.fromisoformat(date_to)
        query = query.where(BankTransaction.booking_date <= to_date)
        count_query = count_query.where(BankTransaction.booking_date <= to_date)
    
    if q:
        search_term = f"%{q}%"
        query = query.where(
            (BankTransaction.description.ilike(search_term)) |
            (BankTransaction.counterparty_name.ilike(search_term)) |
            (BankTransaction.reference.ilike(search_term))
        )
        count_query = count_query.where(
            (BankTransaction.description.ilike(search_term)) |
            (BankTransaction.counterparty_name.ilike(search_term)) |
            (BankTransaction.reference.ilike(search_term))
        )
    
    # Get total count
    count_result = await db.execute(count_query)
    total = count_result.scalar() or 0
    
    # Apply pagination
    offset = (page - 1) * page_size
    query = query.limit(page_size).offset(offset)
    
    result = await db.execute(query)
    transactions = result.scalars().all()
    
    # Get matched invoice info for each transaction
    response_transactions = []
    for t in transactions:
        matched_invoice_id = None
        matched_invoice_number = None
        
        if t.status == BankTransactionStatus.MATCHED:
            # Get the match record
            match_result = await db.execute(
                select(ZZPBankTransactionMatch)
                .where(ZZPBankTransactionMatch.bank_transaction_id == t.id)
                .order_by(ZZPBankTransactionMatch.created_at.desc())
                .limit(1)
            )
            match = match_result.scalar_one_or_none()
            if match:
                matched_invoice_id = match.invoice_id
                # Get invoice number
                invoice_result = await db.execute(
                    select(ZZPInvoice.invoice_number)
                    .where(ZZPInvoice.id == match.invoice_id)
                )
                row = invoice_result.first()
                if row:
                    matched_invoice_number = row[0]
        
        response_transactions.append(
            transaction_to_response(t, matched_invoice_id, matched_invoice_number)
        )
    
    return ZZPBankTransactionListResponse(
        transactions=response_transactions,
        total=total,
        page=page,
        page_size=page_size,
    )


# =============================================================================
# Match Suggestions Endpoint
# =============================================================================

@router.get("/bank/transactions/{transaction_id}/suggestions", response_model=ZZPMatchSuggestionsResponse)
async def get_match_suggestions(
    transaction_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get match suggestions for a bank transaction.
    
    Matching rules:
    1. Invoice number in description/reference → high confidence
    2. Exact amount match on open invoices → medium-high confidence
    3. Similar amount (±1%) on open invoices → medium confidence
    """
    require_zzp(current_user)
    administration = await get_user_administration(current_user.id, db)
    
    # Get transaction
    result = await db.execute(
        select(BankTransaction)
        .where(BankTransaction.id == transaction_id)
        .where(BankTransaction.administration_id == administration.id)
    )
    transaction = result.scalar_one_or_none()
    
    if not transaction:
        raise HTTPException(
            status_code=404,
            detail={"code": "TRANSACTION_NOT_FOUND", "message": "Transactie niet gevonden."}
        )
    
    suggestions: List[ZZPInvoiceMatchSuggestion] = []
    transaction_amount_cents = abs(int(transaction.amount * 100))
    
    # Only suggest matches for credit transactions (positive amounts = incoming payments)
    if transaction.amount <= 0:
        return ZZPMatchSuggestionsResponse(
            transaction_id=transaction_id,
            suggestions=[],
            message="Alleen inkomende betalingen (bijschrijvingen) kunnen worden gematcht aan facturen.",
        )
    
    # Get open invoices (sent or overdue status)
    open_invoices_result = await db.execute(
        select(ZZPInvoice)
        .where(ZZPInvoice.administration_id == administration.id)
        .where(ZZPInvoice.status.in_([InvoiceStatus.SENT.value, InvoiceStatus.OVERDUE.value]))
    )
    open_invoices = open_invoices_result.scalars().all()
    
    # Rule 1: Invoice number in description/reference
    search_text = " ".join(filter(None, [transaction.description, transaction.reference]))
    invoice_numbers = extract_invoice_numbers(search_text)
    
    for inv in open_invoices:
        open_amount_cents = inv.total_cents - inv.amount_paid_cents
        if open_amount_cents <= 0:
            continue
        
        confidence = 0
        reason = ""
        
        # Check invoice number match
        if any(num.upper() == inv.invoice_number.upper() or inv.invoice_number.upper() in num.upper() or num.upper() in inv.invoice_number.upper() for num in invoice_numbers):
            confidence = 95
            reason = f"Factuurnummer '{inv.invoice_number}' gevonden in omschrijving"
        # Check exact amount match
        elif transaction_amount_cents == open_amount_cents:
            confidence = 85
            reason = f"Bedrag €{open_amount_cents/100:.2f} komt exact overeen"
        # Check near amount match (±1%)
        elif abs(transaction_amount_cents - open_amount_cents) <= open_amount_cents * 0.01:
            confidence = 70
            reason = f"Bedrag komt bijna overeen (verschil: €{abs(transaction_amount_cents - open_amount_cents)/100:.2f})"
        
        if confidence > 0:
            suggestions.append(ZZPInvoiceMatchSuggestion(
                invoice_id=inv.id,
                invoice_number=inv.invoice_number,
                customer_name=inv.customer_name,
                invoice_total_cents=inv.total_cents,
                invoice_open_cents=open_amount_cents,
                invoice_date=inv.issue_date.isoformat(),
                confidence_score=confidence,
                match_reason=reason,
            ))
    
    # Sort by confidence descending
    suggestions.sort(key=lambda x: x.confidence_score, reverse=True)
    suggestions = suggestions[:5]  # Limit to top 5
    
    message = (
        f"{len(suggestions)} suggestie(s) gevonden" if suggestions
        else "Geen suggesties gevonden voor deze transactie"
    )
    
    return ZZPMatchSuggestionsResponse(
        transaction_id=transaction_id,
        suggestions=suggestions,
        message=message,
    )


# =============================================================================
# Match / Unmatch Endpoints
# =============================================================================

@router.post("/bank/transactions/{transaction_id}/match", response_model=ZZPMatchInvoiceResponse)
async def match_transaction_to_invoice(
    transaction_id: uuid.UUID,
    request: ZZPMatchInvoiceRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Match a bank transaction to an invoice.
    
    - Updates invoice amount_paid_cents
    - Auto-marks invoice as Paid if fully paid
    - Handles partial payments (invoice stays Sent/Overdue if partially paid)
    - Handles overpayments (amount_paid can exceed total)
    """
    require_zzp(current_user)
    administration = await get_user_administration(current_user.id, db)
    
    # Get transaction
    tx_result = await db.execute(
        select(BankTransaction)
        .where(BankTransaction.id == transaction_id)
        .where(BankTransaction.administration_id == administration.id)
    )
    transaction = tx_result.scalar_one_or_none()
    
    if not transaction:
        raise HTTPException(
            status_code=404,
            detail={"code": "TRANSACTION_NOT_FOUND", "message": "Transactie niet gevonden."}
        )
    
    if transaction.amount <= 0:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_TRANSACTION", "message": "Alleen inkomende betalingen kunnen worden gematcht."}
        )
    
    # Get invoice
    inv_result = await db.execute(
        select(ZZPInvoice)
        .where(ZZPInvoice.id == request.invoice_id)
        .where(ZZPInvoice.administration_id == administration.id)
    )
    invoice = inv_result.scalar_one_or_none()
    
    if not invoice:
        raise HTTPException(
            status_code=404,
            detail={"code": "INVOICE_NOT_FOUND", "message": "Factuur niet gevonden."}
        )
    
    if invoice.status not in [InvoiceStatus.SENT.value, InvoiceStatus.OVERDUE.value, InvoiceStatus.PAID.value]:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_INVOICE_STATUS", "message": "Alleen verzonden of openstaande facturen kunnen worden gematcht."}
        )
    
    # Determine amount to match
    transaction_amount_cents = int(transaction.amount * 100)
    amount_to_match = request.amount_cents if request.amount_cents else transaction_amount_cents
    
    if amount_to_match <= 0:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_AMOUNT", "message": "Bedrag moet positief zijn."}
        )
    
    # Create match record
    match = ZZPBankTransactionMatch(
        administration_id=administration.id,
        bank_transaction_id=transaction.id,
        invoice_id=invoice.id,
        user_id=current_user.id,
        amount_cents=amount_to_match,
        match_type="manual",
        notes=request.notes,
    )
    db.add(match)
    
    # Update transaction status
    transaction.status = BankTransactionStatus.MATCHED
    transaction.matched_entity_type = "INVOICE"
    transaction.matched_entity_id = invoice.id
    
    # Update invoice amount_paid_cents
    invoice.amount_paid_cents += amount_to_match
    
    # Auto-update invoice status based on payment
    if invoice.amount_paid_cents >= invoice.total_cents:
        invoice.status = InvoiceStatus.PAID.value
    
    await db.commit()
    await db.refresh(invoice)
    
    # Build message
    if invoice.status == InvoiceStatus.PAID.value:
        if invoice.amount_paid_cents > invoice.total_cents:
            overpaid = (invoice.amount_paid_cents - invoice.total_cents) / 100
            message = f"Factuur {invoice.invoice_number} gemarkeerd als betaald. Overbetaling: €{overpaid:.2f}"
        else:
            message = f"Factuur {invoice.invoice_number} gemarkeerd als betaald."
    else:
        remaining = (invoice.total_cents - invoice.amount_paid_cents) / 100
        message = f"Betaling €{amount_to_match/100:.2f} gekoppeld aan factuur {invoice.invoice_number}. Nog te ontvangen: €{remaining:.2f}"
    
    return ZZPMatchInvoiceResponse(
        transaction_id=transaction.id,
        invoice_id=invoice.id,
        invoice_number=invoice.invoice_number,
        amount_matched_cents=amount_to_match,
        invoice_new_status=invoice.status,
        invoice_amount_paid_cents=invoice.amount_paid_cents,
        invoice_total_cents=invoice.total_cents,
        message=message,
    )


@router.post("/bank/transactions/{transaction_id}/unmatch", response_model=ZZPUnmatchResponse)
async def unmatch_transaction_from_invoice(
    transaction_id: uuid.UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Unmatch a bank transaction from its matched invoice.
    
    - Reverses the payment tracking on the invoice
    - Updates invoice status if needed (paid → sent if no longer fully paid)
    """
    require_zzp(current_user)
    administration = await get_user_administration(current_user.id, db)
    
    # Get transaction
    tx_result = await db.execute(
        select(BankTransaction)
        .where(BankTransaction.id == transaction_id)
        .where(BankTransaction.administration_id == administration.id)
    )
    transaction = tx_result.scalar_one_or_none()
    
    if not transaction:
        raise HTTPException(
            status_code=404,
            detail={"code": "TRANSACTION_NOT_FOUND", "message": "Transactie niet gevonden."}
        )
    
    if transaction.status != BankTransactionStatus.MATCHED:
        raise HTTPException(
            status_code=400,
            detail={"code": "NOT_MATCHED", "message": "Deze transactie is niet gematcht aan een factuur."}
        )
    
    # Get the match record
    match_result = await db.execute(
        select(ZZPBankTransactionMatch)
        .where(ZZPBankTransactionMatch.bank_transaction_id == transaction.id)
        .order_by(ZZPBankTransactionMatch.created_at.desc())
        .limit(1)
    )
    match = match_result.scalar_one_or_none()
    
    if not match:
        raise HTTPException(
            status_code=400,
            detail={"code": "MATCH_NOT_FOUND", "message": "Match record niet gevonden."}
        )
    
    # Get invoice
    inv_result = await db.execute(
        select(ZZPInvoice)
        .where(ZZPInvoice.id == match.invoice_id)
    )
    invoice = inv_result.scalar_one_or_none()
    
    if not invoice:
        raise HTTPException(
            status_code=404,
            detail={"code": "INVOICE_NOT_FOUND", "message": "Factuur niet gevonden."}
        )
    
    amount_unmatched = match.amount_cents
    
    # Reverse the payment
    invoice.amount_paid_cents = max(0, invoice.amount_paid_cents - amount_unmatched)
    
    # Update invoice status if no longer fully paid
    if invoice.status == InvoiceStatus.PAID.value and invoice.amount_paid_cents < invoice.total_cents:
        # Check if overdue
        if invoice.due_date and invoice.due_date < date.today():
            invoice.status = InvoiceStatus.OVERDUE.value
        else:
            invoice.status = InvoiceStatus.SENT.value
    
    # Delete match record
    await db.delete(match)
    
    # Update transaction status
    transaction.status = BankTransactionStatus.NEW
    transaction.matched_entity_type = None
    transaction.matched_entity_id = None
    
    await db.commit()
    await db.refresh(invoice)
    
    message = f"Match ongedaan gemaakt. €{amount_unmatched/100:.2f} verwijderd van factuur {invoice.invoice_number}."
    
    return ZZPUnmatchResponse(
        transaction_id=transaction.id,
        invoice_id=invoice.id,
        invoice_number=invoice.invoice_number,
        amount_unmatched_cents=amount_unmatched,
        invoice_new_status=invoice.status,
        invoice_amount_paid_cents=invoice.amount_paid_cents,
        message=message,
    )


# =============================================================================
# Match History Endpoint
# =============================================================================

@router.get("/bank/matches", response_model=ZZPBankTransactionMatchListResponse)
async def list_matches(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    invoice_id: Optional[uuid.UUID] = Query(None),
):
    """
    List all bank transaction matches for audit purposes.
    """
    require_zzp(current_user)
    administration = await get_user_administration(current_user.id, db)
    
    query = (
        select(ZZPBankTransactionMatch)
        .where(ZZPBankTransactionMatch.administration_id == administration.id)
        .order_by(ZZPBankTransactionMatch.created_at.desc())
    )
    
    if invoice_id:
        query = query.where(ZZPBankTransactionMatch.invoice_id == invoice_id)
    
    result = await db.execute(query)
    matches = result.scalars().all()
    
    # Get invoice numbers for each match
    response_matches = []
    for m in matches:
        inv_result = await db.execute(
            select(ZZPInvoice.invoice_number)
            .where(ZZPInvoice.id == m.invoice_id)
        )
        row = inv_result.first()
        invoice_number = row[0] if row else "N/A"
        
        response_matches.append(ZZPBankTransactionMatchResponse(
            id=m.id,
            bank_transaction_id=m.bank_transaction_id,
            invoice_id=m.invoice_id,
            invoice_number=invoice_number,
            amount_cents=m.amount_cents,
            match_type=m.match_type,
            confidence_score=m.confidence_score,
            notes=m.notes,
            created_at=m.created_at,
            user_id=m.user_id,
        ))
    
    return ZZPBankTransactionMatchListResponse(
        matches=response_matches,
        total=len(response_matches),
    )
