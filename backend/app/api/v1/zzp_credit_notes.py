"""Issue immutable credit notes and register refunds; no money is transferred."""

from typing import Annotated
from uuid import UUID
from fastapi import APIRouter, Depends, Header, Query, HTTPException
from fastapi.responses import Response
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool
from app.core.database import get_db
from app.api.v1.deps import CurrentUser, require_zzp
from app.services.zzp_administration import get_user_administration
from app.services.credit_notes import CreditNoteService, balance, credit_pdf_view
from app.services.invoice_rendering import render_invoice_pdf, pdf_disposition
from app.models.credit_note import ZZPCreditNote, ZZPCreditLine, ZZPCustomerRefund
from app.schemas.credit_note import CreditNoteRequest, RefundRequest

router = APIRouter()


def note_response(note, refunded_cents):
    return dict(
        id=str(note.id),
        number=note.number,
        issue_date=note.issue_date.isoformat(),
        reason=note.reason,
        subtotal_cents=note.subtotal_cents,
        vat_cents=note.vat_cents,
        total_cents=note.total_cents,
        original_invoice_number=note.snapshot["original_invoice_number"],
        refunded_cents=refunded_cents,
        lines=[
            dict(
                invoice_line_id=str(line.invoice_line_id),
                quantity=str(line.quantity),
                net_cents=line.net_cents,
                vat_cents=line.vat_cents,
                description=line.description,
                vat_rate=str(line.vat_rate),
            )
            for line in note.lines
        ],
    )


@router.get("/invoices/{invoice_id}/credits")
async def list_credits(
    invoice_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    refund_offset: int = Query(0, ge=0),
):
    require_zzp(current_user)
    admin = await get_user_administration(current_user.id, db)
    service = CreditNoteService(db, admin.id)
    invoice = await service.invoice(invoice_id)
    scope = (
        ZZPCreditNote.administration_id == admin.id,
        ZZPCreditNote.invoice_id == invoice.id,
    )
    total = await db.scalar(select(func.count(ZZPCreditNote.id)).where(*scope))
    notes = (
        await db.scalars(
            select(ZZPCreditNote)
            .where(*scope)
            .order_by(ZZPCreditNote.issue_date.desc(), ZZPCreditNote.number.desc())
            .limit(limit)
            .offset(offset)
        )
    ).all()
    refunded_by_note = (
        dict(
            (
                await db.execute(
                    select(
                        ZZPCustomerRefund.credit_note_id,
                        func.sum(ZZPCustomerRefund.amount_cents),
                    )
                    .where(
                        ZZPCustomerRefund.administration_id == admin.id,
                        ZZPCustomerRefund.credit_note_id.in_(
                            [note.id for note in notes]
                        ),
                    )
                    .group_by(ZZPCustomerRefund.credit_note_id)
                )
            ).all()
        )
        if notes
        else {}
    )
    refund_scope = (
        ZZPCustomerRefund.administration_id == admin.id,
        ZZPCustomerRefund.invoice_id == invoice.id,
    )
    refund_total = await db.scalar(
        select(func.count(ZZPCustomerRefund.id)).where(*refund_scope)
    )
    refunds = (
        await db.execute(
            select(ZZPCustomerRefund, ZZPCreditNote.number)
            .join(ZZPCreditNote)
            .where(*refund_scope)
            .order_by(ZZPCustomerRefund.refund_date.desc(), ZZPCustomerRefund.id.desc())
            .offset(refund_offset)
            .limit(20)
        )
    ).all()
    used = dict(
        (
            await db.execute(
                select(ZZPCreditLine.invoice_line_id, func.sum(ZZPCreditLine.quantity))
                .join(ZZPCreditNote)
                .where(*scope)
                .group_by(ZZPCreditLine.invoice_line_id)
            )
        ).all()
    )
    return dict(
        administration_id=str(admin.id),
        invoice_id=str(invoice.id),
        total=total,
        credited_cents=invoice.credited_cents,
        refunded_cents=invoice.refunded_cents,
        outstanding_cents=max(0, balance(invoice)),
        refund_due_cents=max(0, -balance(invoice)),
        available_lines=[
            dict(
                id=str(line.id),
                description=line.description,
                quantity=str(line.quantity),
                available_quantity=str(line.quantity - used.get(line.id, 0)),
                vat_rate=str(line.vat_rate),
                unit_price_cents=line.unit_price_cents,
                net_cents=line.line_total_cents,
                vat_cents=line.vat_amount_cents,
            )
            for line in invoice.lines
        ],
        refunds={
            "total": refund_total,
            "items": [
                dict(
                    id=str(r.id),
                    credit_note_number=number,
                    refund_date=r.refund_date.isoformat(),
                    amount_cents=r.amount_cents,
                    reference=r.reference,
                )
                for r, number in refunds
            ],
        },
        credit_notes=[
            note_response(note, refunded_by_note.get(note.id, 0)) for note in notes
        ],
    )


@router.post("/invoices/{invoice_id}/credits", status_code=201)
async def issue_credit(
    invoice_id: UUID,
    payload: CreditNoteRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    key: UUID = Header(alias="Idempotency-Key"),
):
    require_zzp(current_user)
    admin = await get_user_administration(current_user.id, db)
    try:
        note = await CreditNoteService(db, admin.id).issue(
            invoice_id, payload, key, current_user.id
        )
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return {"id": str(note.id), "number": note.number}


@router.post("/credit-notes/{note_id}/refunds", status_code=201)
async def register_refund(
    note_id: UUID,
    payload: RefundRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    key: UUID = Header(alias="Idempotency-Key"),
):
    require_zzp(current_user)
    admin = await get_user_administration(current_user.id, db)
    try:
        refund = await CreditNoteService(db, admin.id).refund(
            note_id, payload, key, current_user.id
        )
        await db.commit()
    except Exception:
        await db.rollback()
        raise
    return {
        "id": str(refund.id),
        "amount_cents": refund.amount_cents,
        "registered_only": True,
    }


@router.get("/credit-notes/{note_id}/pdf")
async def credit_pdf(
    note_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    require_zzp(current_user)
    admin = await get_user_administration(current_user.id, db)
    note = await CreditNoteService(db, admin.id).note(note_id)
    view = credit_pdf_view(note)
    try:
        data = await run_in_threadpool(render_invoice_pdf, view)
    except Exception as error:
        raise HTTPException(
            503,
            detail={
                "code": "PDF_NOT_AVAILABLE",
                "message": "PDF-generatie is tijdelijk niet beschikbaar.",
            },
        ) from error
    return Response(
        content=data,
        media_type="application/pdf",
        headers={
            "Content-Disposition": pdf_disposition(view),
            "Cache-Control": "no-store",
        },
    )
