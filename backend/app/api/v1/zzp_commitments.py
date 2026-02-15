from datetime import date, timedelta
from decimal import Decimal
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import CurrentUser, require_zzp
from app.core.database import get_db
from app.models.administration import Administration, AdministrationMember
from app.models.bank import BankTransaction
from app.models.financial_commitment import CommitmentType, FinancialCommitment, RecurringFrequency
from app.schemas.commitments import (
    AmortizationRow,
    CommitmentCreate,
    CommitmentListResponse,
    CommitmentOverviewResponse,
    CommitmentResponse,
    CommitmentSuggestionsResponse,
    CommitmentUpdate,
)

router = APIRouter(prefix="/commitments")


async def get_user_administration(user_id: UUID, db: AsyncSession) -> Administration:
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
        raise HTTPException(status_code=404, detail={"code": "NO_ADMINISTRATION", "message": "Geen administratie gevonden."})
    return administration


def to_response(item: FinancialCommitment) -> CommitmentResponse:
    return CommitmentResponse(
        id=item.id,
        administration_id=item.administration_id,
        type=item.type.value,
        name=item.name,
        amount_cents=item.amount_cents,
        monthly_payment_cents=item.monthly_payment_cents,
        principal_amount_cents=item.principal_amount_cents,
        interest_rate=float(item.interest_rate) if item.interest_rate is not None else None,
        recurring_frequency=item.recurring_frequency.value if item.recurring_frequency else None,
        start_date=item.start_date,
        end_date=item.end_date,
        contract_term_months=item.contract_term_months,
        renewal_date=item.renewal_date,
        btw_rate=float(item.btw_rate) if item.btw_rate is not None else None,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


@router.get("", response_model=CommitmentListResponse)
async def list_commitments(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    type: Optional[str] = Query(None),
):
    require_zzp(current_user)
    administration = await get_user_administration(current_user.id, db)

    query = select(FinancialCommitment).where(FinancialCommitment.administration_id == administration.id)
    if type:
        query = query.where(FinancialCommitment.type == CommitmentType(type))

    result = await db.execute(query.order_by(FinancialCommitment.created_at.desc()))
    commitments = result.scalars().all()
    return CommitmentListResponse(commitments=[to_response(item) for item in commitments], total=len(commitments))


@router.post("", response_model=CommitmentResponse, status_code=status.HTTP_201_CREATED)
async def create_commitment(
    payload: CommitmentCreate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    require_zzp(current_user)
    administration = await get_user_administration(current_user.id, db)

    item = FinancialCommitment(
        administration_id=administration.id,
        type=CommitmentType(payload.type),
        name=payload.name,
        amount_cents=payload.amount_cents,
        monthly_payment_cents=payload.monthly_payment_cents,
        principal_amount_cents=payload.principal_amount_cents,
        interest_rate=Decimal(str(payload.interest_rate)) if payload.interest_rate is not None else None,
        recurring_frequency=RecurringFrequency(payload.recurring_frequency) if payload.recurring_frequency else None,
        start_date=payload.start_date,
        end_date=payload.end_date,
        contract_term_months=payload.contract_term_months,
        renewal_date=payload.renewal_date,
        btw_rate=Decimal(str(payload.btw_rate)) if payload.btw_rate is not None else None,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return to_response(item)


@router.get("/{commitment_id}", response_model=CommitmentResponse)
async def get_commitment(commitment_id: UUID, current_user: CurrentUser, db: Annotated[AsyncSession, Depends(get_db)]):
    require_zzp(current_user)
    administration = await get_user_administration(current_user.id, db)
    result = await db.execute(
        select(FinancialCommitment).where(
            FinancialCommitment.id == commitment_id,
            FinancialCommitment.administration_id == administration.id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail={"code": "COMMITMENT_NOT_FOUND", "message": "Verplichting niet gevonden."})
    return to_response(item)


@router.patch("/{commitment_id}", response_model=CommitmentResponse)
async def patch_commitment(
    commitment_id: UUID,
    payload: CommitmentUpdate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    require_zzp(current_user)
    administration = await get_user_administration(current_user.id, db)
    result = await db.execute(
        select(FinancialCommitment).where(
            FinancialCommitment.id == commitment_id,
            FinancialCommitment.administration_id == administration.id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail={"code": "COMMITMENT_NOT_FOUND", "message": "Verplichting niet gevonden."})

    for key, value in payload.model_dump(exclude_unset=True).items():
        if key == "type" and value:
            setattr(item, key, CommitmentType(value))
        elif key in {"interest_rate", "btw_rate"} and value is not None:
            setattr(item, key, Decimal(str(value)))
        elif key == "recurring_frequency" and value:
            setattr(item, key, RecurringFrequency(value))
        else:
            setattr(item, key, value)

    await db.commit()
    await db.refresh(item)
    return to_response(item)


@router.delete("/{commitment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_commitment(commitment_id: UUID, current_user: CurrentUser, db: Annotated[AsyncSession, Depends(get_db)]):
    require_zzp(current_user)
    administration = await get_user_administration(current_user.id, db)
    result = await db.execute(
        select(FinancialCommitment).where(
            FinancialCommitment.id == commitment_id,
            FinancialCommitment.administration_id == administration.id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail={"code": "COMMITMENT_NOT_FOUND", "message": "Verplichting niet gevonden."})
    await db.delete(item)
    await db.commit()


@router.get("/{commitment_id}/amortization", response_model=list[AmortizationRow])
async def amortization_schedule(commitment_id: UUID, current_user: CurrentUser, db: Annotated[AsyncSession, Depends(get_db)]):
    require_zzp(current_user)
    administration = await get_user_administration(current_user.id, db)
    result = await db.execute(
        select(FinancialCommitment).where(
            FinancialCommitment.id == commitment_id,
            FinancialCommitment.administration_id == administration.id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail={"code": "COMMITMENT_NOT_FOUND", "message": "Verplichting niet gevonden."})
    if item.type not in {CommitmentType.LEASE, CommitmentType.LOAN}:
        return []

    principal = item.principal_amount_cents or item.amount_cents
    payment = item.monthly_payment_cents or item.amount_cents
    if principal <= 0 or payment <= 0:
        return []

    monthly_rate = float(item.interest_rate or 0) / 100 / 12
    rows: list[AmortizationRow] = []
    remaining = principal
    horizon = item.contract_term_months or 120
    due_date = item.start_date

    for idx in range(1, horizon + 1):
        interest = int(round(remaining * monthly_rate))
        principal_part = max(0, min(payment - interest, remaining))
        remaining = max(0, remaining - principal_part)

        rows.append(
            AmortizationRow(
                month_index=idx,
                due_date=due_date,
                payment_cents=payment,
                interest_cents=interest,
                principal_cents=principal_part,
                remaining_balance_cents=remaining,
            )
        )
        if remaining == 0:
            break
        due_date = due_date + timedelta(days=30)

    return rows


@router.get("/overview/summary", response_model=CommitmentOverviewResponse)
async def commitment_overview(current_user: CurrentUser, db: Annotated[AsyncSession, Depends(get_db)]):
    require_zzp(current_user)
    administration = await get_user_administration(current_user.id, db)
    result = await db.execute(select(FinancialCommitment).where(FinancialCommitment.administration_id == administration.id))
    items = result.scalars().all()

    today = date.today()
    next_30 = today + timedelta(days=30)
    upcoming = [i for i in items if i.start_date <= next_30 and (i.end_date is None or i.end_date >= today)]
    monthly_total = sum(i.monthly_payment_cents or i.amount_cents for i in items if i.type != CommitmentType.SUBSCRIPTION)
    monthly_total += sum((i.amount_cents // 12) if i.recurring_frequency and i.recurring_frequency.value == "yearly" else i.amount_cents for i in items if i.type == CommitmentType.SUBSCRIPTION)

    warning_count = len([i for i in upcoming if (i.monthly_payment_cents or i.amount_cents) >= 150000])
    by_type = {"lease": 0, "loan": 0, "subscription": 0}
    for item in items:
        by_type[item.type.value] += item.monthly_payment_cents or item.amount_cents

    return CommitmentOverviewResponse(
        monthly_total_cents=monthly_total,
        upcoming_total_cents=sum(i.monthly_payment_cents or i.amount_cents for i in upcoming),
        warning_count=warning_count,
        by_type=by_type,
        upcoming=[to_response(i) for i in sorted(upcoming, key=lambda x: x.start_date)[:8]],
    )


@router.get("/subscriptions/suggestions", response_model=CommitmentSuggestionsResponse)
async def subscription_suggestions(current_user: CurrentUser, db: Annotated[AsyncSession, Depends(get_db)]):
    require_zzp(current_user)
    administration = await get_user_administration(current_user.id, db)
    since = date.today() - timedelta(days=120)

    result = await db.execute(
        select(BankTransaction)
        .where(
            and_(
                BankTransaction.administration_id == administration.id,
                BankTransaction.booking_date >= since,
                BankTransaction.amount < 0,
            )
        )
        .order_by(BankTransaction.booking_date.desc())
        .limit(100)
    )
    txs = result.scalars().all()

    seen: dict[str, list[BankTransaction]] = {}
    for tx in txs:
        key = (tx.counterparty_name or tx.description[:30] or "onbekend").lower()
        seen.setdefault(key, []).append(tx)

    suggestions = []
    for transactions in seen.values():
        if len(transactions) < 2:
            continue
        avg = int(abs(sum(int(t.amount * 100) for t in transactions) / len(transactions)))
        suggestions.append(
            {
                "bank_transaction_id": transactions[0].id,
                "booking_date": transactions[0].booking_date,
                "amount_cents": avg,
                "description": transactions[0].counterparty_name or transactions[0].description,
                "confidence": min(0.95, 0.4 + (len(transactions) * 0.12)),
            }
        )

    return CommitmentSuggestionsResponse(suggestions=suggestions[:10])
