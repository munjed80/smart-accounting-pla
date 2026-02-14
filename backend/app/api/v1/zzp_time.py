from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import CurrentUser, require_zzp
from app.core.database import get_db
from app.models.administration import Administration, AdministrationMember
from app.models.zzp import (
    BusinessProfile,
    InvoiceStatus,
    ZZPCustomer,
    ZZPInvoice,
    ZZPInvoiceCounter,
    ZZPInvoiceLine,
    ZZPTimeEntry,
)
from app.schemas.zzp import (
    TimeEntryCreate,
    TimeEntryListResponse,
    TimeEntryOut,
    TimeEntryUpdate,
    WeeklyInvoiceCreateRequest,
    WeeklyInvoiceCreateResponse,
)

router = APIRouter()


def _to_decimal(value: Decimal | float | int | str) -> Decimal:
    return value if isinstance(value, Decimal) else Decimal(str(value))


def _to_cents(amount: Decimal) -> int:
    decimal_amount = _to_decimal(amount)
    return int((decimal_amount * Decimal("100")).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _from_cents(amount_cents: int) -> Decimal:
    return (Decimal(amount_cents) / Decimal("100")).quantize(Decimal("0.01"))


def entry_to_response(entry: ZZPTimeEntry) -> TimeEntryOut:
    return TimeEntryOut(
        id=entry.id,
        user_id=entry.user_id,
        administration_id=entry.administration_id,
        entry_date=entry.entry_date,
        description=entry.description,
        hours=entry.hours,
        project_name=entry.project_name,
        customer_id=entry.customer_id,
        project_id=entry.project_id,
        hourly_rate=entry.hourly_rate,
        hourly_rate_cents=entry.hourly_rate_cents,
        invoice_id=entry.invoice_id,
        is_invoiced=entry.is_invoiced,
        billable=entry.billable,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
    )


async def get_user_administration(user_id: UUID, db: AsyncSession) -> Administration:
    result = await db.execute(
        select(Administration)
        .join(AdministrationMember)
        .where(AdministrationMember.user_id == user_id)
        .where(Administration.is_active.is_(True))
        .order_by(Administration.created_at)
        .limit(1)
    )
    administration = result.scalar_one_or_none()
    if not administration:
        raise HTTPException(
            status_code=404,
            detail={"code": "NO_ADMINISTRATION", "message": "Geen administratie gevonden."},
        )
    return administration


async def generate_invoice_number(admin_id: UUID, db: AsyncSession) -> str:
    current_year = date.today().year
    result = await db.execute(
        select(ZZPInvoiceCounter)
        .where(ZZPInvoiceCounter.administration_id == admin_id)
        .with_for_update()
    )
    counter = result.scalar_one_or_none()
    if counter:
        if counter.year != current_year:
            counter.year = current_year
            counter.counter = 1
        else:
            counter.counter += 1
    else:
        counter = ZZPInvoiceCounter(administration_id=admin_id, year=current_year, counter=1)
        db.add(counter)
    await db.flush()
    return f"INV-{counter.year}-{counter.counter:04d}"


@router.post("/time-entries", response_model=TimeEntryOut, status_code=201)
async def create_time_entry(
    entry_in: TimeEntryCreate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    require_zzp(current_user)
    administration = await get_user_administration(current_user.id, db)

    if entry_in.customer_id:
        customer = await db.scalar(
            select(ZZPCustomer).where(
                ZZPCustomer.id == entry_in.customer_id,
                ZZPCustomer.administration_id == administration.id,
            )
        )
        if not customer:
            raise HTTPException(status_code=404, detail={"code": "CUSTOMER_NOT_FOUND", "message": "Klant niet gevonden."})

    entry = ZZPTimeEntry(
        user_id=current_user.id,
        administration_id=administration.id,
        entry_date=date.fromisoformat(entry_in.entry_date),
        description=entry_in.description,
        hours=entry_in.hours,
        project_name=entry_in.project_name,
        customer_id=entry_in.customer_id,
        project_id=entry_in.project_id,
        hourly_rate=entry_in.hourly_rate,
        hourly_rate_cents=_to_cents(entry_in.hourly_rate) if entry_in.hourly_rate is not None else None,
        billable=entry_in.billable,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry_to_response(entry)


@router.patch("/time-entries/{entry_id}", response_model=TimeEntryOut)
async def update_time_entry(
    entry_id: UUID,
    entry_in: TimeEntryUpdate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    require_zzp(current_user)
    administration = await get_user_administration(current_user.id, db)

    entry = await db.scalar(
        select(ZZPTimeEntry).where(
            ZZPTimeEntry.id == entry_id,
            ZZPTimeEntry.administration_id == administration.id,
        )
    )
    if not entry:
        raise HTTPException(status_code=404, detail={"code": "TIME_ENTRY_NOT_FOUND", "message": "Uren niet gevonden."})

    if entry.invoice_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "TIME_ENTRY_INVOICED", "message": "Gefactureerde uren kunnen niet worden gewijzigd."},
        )

    for field, value in entry_in.model_dump(exclude_unset=True).items():
        if field == "entry_date" and isinstance(value, str):
            value = date.fromisoformat(value)
        setattr(entry, field, value)

    if "hourly_rate" in entry_in.model_dump(exclude_unset=True):
        entry.hourly_rate_cents = _to_cents(entry.hourly_rate) if entry.hourly_rate is not None else None

    await db.commit()
    await db.refresh(entry)
    return entry_to_response(entry)


@router.get("/time-entries/open", response_model=list[TimeEntryOut])
async def list_open_time_entries(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    customer_id: Optional[UUID] = Query(None),
    period_start: Optional[date] = Query(None),
    period_end: Optional[date] = Query(None),
):
    require_zzp(current_user)
    administration = await get_user_administration(current_user.id, db)

    clauses = [
        ZZPTimeEntry.administration_id == administration.id,
        ZZPTimeEntry.invoice_id.is_(None),
    ]
    if customer_id:
        clauses.append(ZZPTimeEntry.customer_id == customer_id)
    if period_start:
        clauses.append(ZZPTimeEntry.entry_date >= period_start)
    if period_end:
        clauses.append(ZZPTimeEntry.entry_date <= period_end)

    result = await db.execute(select(ZZPTimeEntry).where(and_(*clauses)).order_by(ZZPTimeEntry.entry_date.asc()))
    return [entry_to_response(e) for e in result.scalars().all()]


@router.get("/time-entries/invoiced", response_model=list[TimeEntryOut])
async def list_invoiced_time_entries(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    customer_id: Optional[UUID] = Query(None),
    period_start: Optional[date] = Query(None),
    period_end: Optional[date] = Query(None),
):
    require_zzp(current_user)
    administration = await get_user_administration(current_user.id, db)

    clauses = [
        ZZPTimeEntry.administration_id == administration.id,
        ZZPTimeEntry.invoice_id.is_not(None),
    ]
    if customer_id:
        clauses.append(ZZPTimeEntry.customer_id == customer_id)
    if period_start:
        clauses.append(ZZPTimeEntry.entry_date >= period_start)
    if period_end:
        clauses.append(ZZPTimeEntry.entry_date <= period_end)

    result = await db.execute(select(ZZPTimeEntry).where(and_(*clauses)).order_by(ZZPTimeEntry.entry_date.asc()))
    return [entry_to_response(e) for e in result.scalars().all()]


@router.get("/time-entries", response_model=TimeEntryListResponse)
async def list_time_entries(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    customer_id: Optional[UUID] = Query(None),
    period_start: Optional[date] = Query(None),
    period_end: Optional[date] = Query(None),
):
    open_entries = await list_open_time_entries(current_user, db, customer_id, period_start, period_end)
    invoiced_entries = await list_invoiced_time_entries(current_user, db, customer_id, period_start, period_end)
    all_entries = [*open_entries, *invoiced_entries]
    return TimeEntryListResponse(
        entries=all_entries,
        total=len(all_entries),
        total_hours=sum((e.hours for e in all_entries), Decimal("0")),
        total_billable_hours=sum((e.hours for e in all_entries if e.billable), Decimal("0")),
        open_entries=open_entries,
        invoiced_entries=invoiced_entries,
    )


@router.post("/time-entries/invoice-week", response_model=WeeklyInvoiceCreateResponse, status_code=201)
async def invoice_week(
    payload: WeeklyInvoiceCreateRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    require_zzp(current_user)

    if payload.period_start > payload.period_end:
        raise HTTPException(status_code=400, detail={"code": "INVALID_PERIOD", "message": "period_start moet <= period_end zijn."})

    administration = await get_user_administration(current_user.id, db)
    customer = await db.scalar(
        select(ZZPCustomer).where(
            ZZPCustomer.id == payload.customer_id,
            ZZPCustomer.administration_id == administration.id,
        )
    )
    if not customer:
        raise HTTPException(status_code=404, detail={"code": "CUSTOMER_NOT_FOUND", "message": "Klant niet gevonden."})

    try:
        query = (
            select(ZZPTimeEntry)
            .where(
                ZZPTimeEntry.administration_id == administration.id,
                ZZPTimeEntry.customer_id == payload.customer_id,
                ZZPTimeEntry.billable.is_(True),
                ZZPTimeEntry.is_invoiced.is_(False),
                ZZPTimeEntry.entry_date >= payload.period_start,
                ZZPTimeEntry.entry_date <= payload.period_end,
            )
            .order_by(ZZPTimeEntry.entry_date.asc(), ZZPTimeEntry.created_at.asc())
            .with_for_update()
        )
        entries_result = await db.execute(query)
        entries = entries_result.scalars().all()

        if not entries:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "NO_TIME_ENTRIES",
                    "message": "Geen factureerbare uren gevonden voor deze periode en klant.",
                },
            )

        total_hours = sum((_to_decimal(e.hours) for e in entries), Decimal("0"))

        rate = payload.hourly_rate
        if rate is None:
            profile = await db.scalar(select(BusinessProfile).where(BusinessProfile.administration_id == administration.id))
            rate = profile.default_hourly_rate if profile else None
            if rate is None:
                first_rate = next((e.hourly_rate for e in entries if e.hourly_rate is not None), None)
                rate = first_rate
        if rate is None:
            raise HTTPException(
                status_code=400,
                detail={"code": "MISSING_HOURLY_RATE", "message": "Geen uurtarief opgegeven en geen standaardtarief gevonden."},
            )
        rate = _to_decimal(rate)

        invoice_number = await generate_invoice_number(administration.id, db)
        issue_date = date.today()
        due_date = issue_date + timedelta(days=30)
        subtotal = (total_hours * rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        vat_rate = Decimal("21.00")
        vat_amount = (subtotal * vat_rate / Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        total_amount = subtotal + vat_amount

        invoice = ZZPInvoice(
            administration_id=administration.id,
            customer_id=customer.id,
            invoice_number=invoice_number,
            status=InvoiceStatus.DRAFT.value,
            issue_date=issue_date,
            due_date=due_date,
            seller_company_name=None,
            customer_name=customer.name,
            customer_address_street=customer.address_street,
            customer_address_postal_code=customer.address_postal_code,
            customer_address_city=customer.address_city,
            customer_address_country=customer.address_country,
            customer_kvk_number=customer.kvk_number,
            customer_btw_number=customer.btw_number,
            subtotal_cents=_to_cents(subtotal),
            vat_total_cents=_to_cents(vat_amount),
            total_cents=_to_cents(total_amount),
        )
        db.add(invoice)
        await db.flush()

        week_number = payload.period_start.isocalendar()[1]
        line_description = (
            f"Week {week_number} ({payload.period_start.isoformat()} - {payload.period_end.isoformat()}) "
            f"– {total_hours}h × {rate}"
        )
        line = ZZPInvoiceLine(
            invoice_id=invoice.id,
            line_number=1,
            description=line_description,
            quantity=total_hours,
            unit_price_cents=_to_cents(rate),
            vat_rate=vat_rate,
            line_total_cents=_to_cents(subtotal),
            vat_amount_cents=_to_cents(vat_amount),
        )
        db.add(line)

        entry_ids = [e.id for e in entries]
        update_values = {
            "invoice_id": invoice.id,
            "is_invoiced": True,
        }
        result = await db.execute(
            update(ZZPTimeEntry)
            .where(ZZPTimeEntry.id.in_(entry_ids), ZZPTimeEntry.invoice_id.is_(None))
            .values(**update_values)
        )
        if result.rowcount != len(entry_ids):
            raise HTTPException(
                status_code=409,
                detail={"code": "INVOICE_RACE_CONDITION", "message": "Een of meer uren zijn intussen al gefactureerd."},
            )

        await db.execute(
            update(ZZPTimeEntry)
            .where(ZZPTimeEntry.id.in_(entry_ids), ZZPTimeEntry.hourly_rate.is_(None))
            .values(hourly_rate=rate, hourly_rate_cents=_to_cents(rate))
        )

        await db.commit()
    except Exception:
        await db.rollback()
        raise

    await db.refresh(invoice)
    return WeeklyInvoiceCreateResponse(
        invoice_id=invoice.id,
        invoice_number=invoice.invoice_number,
        total_hours=total_hours,
        rate=rate,
        total_amount=invoice.total_cents,
    )
