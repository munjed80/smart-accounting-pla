"""
ZZP E-commerce Sales Review API – Phase 2

Review-and-map workspace for imported Shopify/WooCommerce data.
All endpoints are Pro-plan gated.

Workflow:
  1. Sync imports orders/refunds (Phase 1)
  2. User opens review workspace → generates mapping rows automatically
  3. User reviews, approves, and (optionally) posts to bookkeeping
"""
import logging
from datetime import datetime, date, timezone
from decimal import Decimal
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, desc, and_, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.v1.deps import CurrentUser, require_zzp
from app.models.administration import Administration, AdministrationMember
from app.models.audit_log import AuditLog
from app.models.ecommerce import (
    EcommerceConnection,
    EcommerceOrder,
    EcommerceRefund,
    EcommerceMapping,
    EcommerceProvider,
    ConnectionStatus,
    MappingReviewStatus,
    EcommerceOrderStatus,
)
from app.schemas.ecommerce import (
    MappingResponse,
    MappingListResponse,
    MappingActionRequest,
    BulkMappingActionRequest,
    BulkMappingActionResponse,
    GenerateMappingsResponse,
)
from app.services.subscription_service import subscription_service

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers (reused from zzp_integrations.py pattern)
# ---------------------------------------------------------------------------

async def _get_administration(user: CurrentUser, db: AsyncSession) -> Administration:
    result = await db.execute(
        select(Administration)
        .join(AdministrationMember)
        .where(AdministrationMember.user_id == user.id)
        .order_by(AdministrationMember.created_at.asc())
    )
    admin = result.scalar_one_or_none()
    if not admin:
        raise HTTPException(status_code=404, detail="Geen administratie gevonden.")
    return admin


async def _require_pro_plan(user: CurrentUser, db: AsyncSession) -> Administration:
    require_zzp(user)
    administration = await _get_administration(user, db)
    entitlements = await subscription_service.compute_entitlements(db, administration.id)

    if not entitlements.can_use_pro_features:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "PRO_PLAN_REQUIRED",
                "message": "E-commerce functies zijn alleen beschikbaar met het Pro-abonnement.",
                "plan_code": entitlements.plan_code,
            },
        )
    if entitlements.is_paid and entitlements.plan_code not in ("zzp_pro", "pro"):
        raise HTTPException(
            status_code=403,
            detail={
                "code": "PRO_PLAN_REQUIRED",
                "message": "Upgrade je abonnement naar Pro om e-commerce functies te gebruiken.",
                "plan_code": entitlements.plan_code,
            },
        )
    return administration


def _mapping_to_response(m: EcommerceMapping, order: Optional[EcommerceOrder] = None) -> MappingResponse:
    """Build a MappingResponse from a mapping row and optional order data."""
    return MappingResponse(
        id=m.id,
        administration_id=m.administration_id,
        connection_id=m.connection_id,
        order_id=m.order_id,
        refund_id=m.refund_id,
        record_type=m.record_type,
        review_status=m.review_status.value if isinstance(m.review_status, MappingReviewStatus) else m.review_status,
        provider=m.provider,
        external_ref=m.external_ref,
        revenue_cents=m.revenue_cents,
        tax_cents=m.tax_cents,
        shipping_cents=m.shipping_cents,
        discount_cents=m.discount_cents,
        refund_cents=m.refund_cents,
        net_amount_cents=m.net_amount_cents,
        vat_rate=float(m.vat_rate) if m.vat_rate is not None else None,
        vat_amount_cents=m.vat_amount_cents,
        vat_status=m.vat_status,
        currency=m.currency,
        accounting_date=str(m.accounting_date) if m.accounting_date else None,
        notes=m.notes,
        posted_entity_type=m.posted_entity_type,
        posted_entity_id=m.posted_entity_id,
        reviewed_by=m.reviewed_by,
        reviewed_at=m.reviewed_at,
        approved_by=m.approved_by,
        approved_at=m.approved_at,
        posted_by=m.posted_by,
        posted_at=m.posted_at,
        created_at=m.created_at,
        updated_at=m.updated_at,
        # Denormalized source info
        customer_name=getattr(order, "customer_name", None) if order else None,
        customer_email=getattr(order, "customer_email", None) if order else None,
        total_amount_cents=getattr(order, "total_amount_cents", 0) if order else m.revenue_cents,
        ordered_at=getattr(order, "ordered_at", None) if order else None,
        external_order_number=getattr(order, "external_order_number", None) if order else None,
    )


def _compute_vat(tax_cents: int, subtotal_cents: int) -> tuple[Optional[Decimal], str]:
    """
    Attempt to infer Dutch VAT rate from tax/subtotal ratio.
    Returns (vat_rate, vat_status).
    """
    if subtotal_cents <= 0 or tax_cents <= 0:
        return None, "unknown"

    ratio = tax_cents / subtotal_cents
    # Dutch VAT: 21% (standard) or 9% (reduced)
    if 0.20 <= ratio <= 0.22:
        return Decimal("21.00"), "auto"
    elif 0.08 <= ratio <= 0.10:
        return Decimal("9.00"), "auto"
    elif ratio < 0.01:
        return Decimal("0.00"), "auto"
    else:
        # Mixed or non-standard: flag for manual review
        return None, "needs_review"


async def _write_audit_log(
    db: AsyncSession,
    administration_id: UUID,
    entity_type: str,
    entity_id: UUID,
    action: str,
    user_id: Optional[UUID],
    old_value: Optional[dict] = None,
    new_value: Optional[dict] = None,
) -> None:
    """Best-effort audit log entry."""
    try:
        log = AuditLog(
            client_id=administration_id,
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            user_id=user_id,
            user_role="zzp",
            old_value=old_value,
            new_value=new_value,
        )
        db.add(log)
    except Exception:
        logger.warning("Failed to write audit log", exc_info=True)


# ---------------------------------------------------------------------------
# Generate mappings from imported data
# ---------------------------------------------------------------------------

@router.post("/integrations/sales-review/generate", response_model=GenerateMappingsResponse)
async def generate_mappings(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    connection_id: Optional[UUID] = Query(None, description="Limit to specific connection"),
):
    """
    Generate mapping rows for all imported orders/refunds that don't have one yet.
    This is the entry point for the review workflow after syncing.
    Safe to call repeatedly – skips records that already have a mapping.
    """
    administration = await _require_pro_plan(current_user, db)

    # Build connection filter
    conn_filter = [EcommerceConnection.administration_id == administration.id]
    if connection_id:
        conn_filter.append(EcommerceConnection.id == connection_id)

    connections_result = await db.execute(
        select(EcommerceConnection).where(*conn_filter)
    )
    connections = connections_result.scalars().all()

    created = 0
    skipped = 0
    total_orders = 0
    total_refunds = 0

    for conn in connections:
        # Orders
        orders_result = await db.execute(
            select(EcommerceOrder).where(EcommerceOrder.connection_id == conn.id)
        )
        orders = orders_result.scalars().all()
        total_orders += len(orders)

        for order in orders:
            # Check if mapping already exists
            existing = (await db.execute(
                select(EcommerceMapping.id).where(EcommerceMapping.order_id == order.id)
            )).scalar_one_or_none()

            if existing:
                skipped += 1
                continue

            # Compute initial VAT from source data
            vat_rate, vat_status = _compute_vat(order.tax_cents, order.subtotal_cents)

            # Determine initial review status
            review_status = MappingReviewStatus.NEW
            if vat_status == "needs_review":
                review_status = MappingReviewStatus.NEEDS_REVIEW

            mapping = EcommerceMapping(
                administration_id=administration.id,
                connection_id=conn.id,
                order_id=order.id,
                record_type="order",
                review_status=review_status,
                provider=conn.provider.value,
                external_ref=order.external_order_number or order.external_order_id,
                revenue_cents=order.subtotal_cents,
                tax_cents=order.tax_cents,
                shipping_cents=order.shipping_cents,
                discount_cents=order.discount_cents,
                refund_cents=0,
                net_amount_cents=order.total_amount_cents,
                vat_rate=vat_rate,
                vat_amount_cents=order.tax_cents,
                vat_status=vat_status,
                currency=order.currency,
                accounting_date=order.ordered_at.date() if order.ordered_at else None,
            )
            db.add(mapping)
            created += 1

        # Refunds
        refunds_result = await db.execute(
            select(EcommerceRefund).where(EcommerceRefund.connection_id == conn.id)
        )
        refunds = refunds_result.scalars().all()
        total_refunds += len(refunds)

        for refund in refunds:
            existing = (await db.execute(
                select(EcommerceMapping.id).where(EcommerceMapping.refund_id == refund.id)
            )).scalar_one_or_none()

            if existing:
                skipped += 1
                continue

            mapping = EcommerceMapping(
                administration_id=administration.id,
                connection_id=conn.id,
                refund_id=refund.id,
                record_type="refund",
                review_status=MappingReviewStatus.NEW,
                provider=conn.provider.value,
                external_ref=refund.external_order_id or refund.external_refund_id,
                revenue_cents=0,
                tax_cents=0,
                shipping_cents=0,
                discount_cents=0,
                refund_cents=refund.amount_cents,
                net_amount_cents=-refund.amount_cents,
                vat_rate=None,
                vat_amount_cents=0,
                vat_status="unknown",
                currency=refund.currency,
                accounting_date=refund.refunded_at.date() if refund.refunded_at else None,
            )
            db.add(mapping)
            created += 1

    await db.commit()

    return GenerateMappingsResponse(
        created=created,
        skipped_existing=skipped,
        total_orders=total_orders,
        total_refunds=total_refunds,
    )


# ---------------------------------------------------------------------------
# List mappings (review workspace)
# ---------------------------------------------------------------------------

@router.get("/integrations/sales-review", response_model=MappingListResponse)
async def list_mappings(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    review_status: Optional[str] = Query(None, description="Filter by review status"),
    record_type: Optional[str] = Query(None, description="Filter: order or refund"),
    provider: Optional[str] = Query(None, description="Filter: shopify or woocommerce"),
    connection_id: Optional[UUID] = Query(None, description="Filter by connection"),
):
    """List mapping records with status counts for the review workspace."""
    administration = await _require_pro_plan(current_user, db)

    base_filter = [EcommerceMapping.administration_id == administration.id]
    if review_status:
        base_filter.append(EcommerceMapping.review_status == review_status)
    if record_type:
        base_filter.append(EcommerceMapping.record_type == record_type)
    if provider:
        base_filter.append(EcommerceMapping.provider == provider)
    if connection_id:
        base_filter.append(EcommerceMapping.connection_id == connection_id)

    # Total count with filters
    total_result = await db.execute(
        select(func.count()).select_from(EcommerceMapping).where(*base_filter)
    )
    total = total_result.scalar() or 0

    # Status counts (unfiltered by status for the sidebar)
    admin_filter = [EcommerceMapping.administration_id == administration.id]
    if connection_id:
        admin_filter.append(EcommerceMapping.connection_id == connection_id)
    counts_result = await db.execute(
        select(
            EcommerceMapping.review_status,
            func.count().label("cnt"),
        )
        .where(*admin_filter)
        .group_by(EcommerceMapping.review_status)
    )
    status_counts = {}
    for row in counts_result:
        key = row[0].value if isinstance(row[0], MappingReviewStatus) else str(row[0])
        status_counts[key] = row[1]

    # Fetch page with order join for denormalized data
    query = (
        select(EcommerceMapping, EcommerceOrder)
        .outerjoin(EcommerceOrder, EcommerceMapping.order_id == EcommerceOrder.id)
        .where(*base_filter)
        .order_by(desc(EcommerceMapping.created_at))
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    result = await db.execute(query)
    rows = result.all()

    mappings = [_mapping_to_response(m, order) for m, order in rows]

    return MappingListResponse(
        mappings=mappings,
        total=total,
        page=page,
        per_page=per_page,
        status_counts=status_counts,
    )


# ---------------------------------------------------------------------------
# Get single mapping
# ---------------------------------------------------------------------------

@router.get("/integrations/sales-review/{mapping_id}", response_model=MappingResponse)
async def get_mapping(
    mapping_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get a single mapping with source data."""
    administration = await _require_pro_plan(current_user, db)

    result = await db.execute(
        select(EcommerceMapping, EcommerceOrder)
        .outerjoin(EcommerceOrder, EcommerceMapping.order_id == EcommerceOrder.id)
        .where(
            EcommerceMapping.id == mapping_id,
            EcommerceMapping.administration_id == administration.id,
        )
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Mapping niet gevonden.")

    return _mapping_to_response(row[0], row[1])


# ---------------------------------------------------------------------------
# Action on a single mapping
# ---------------------------------------------------------------------------

VALID_ACTIONS = {"approve", "post", "skip", "mark_duplicate", "reset", "needs_review"}

# State machine: allowed transitions
ALLOWED_TRANSITIONS = {
    "approve": {MappingReviewStatus.NEW, MappingReviewStatus.NEEDS_REVIEW, MappingReviewStatus.MAPPED},
    "post": {MappingReviewStatus.APPROVED},
    "skip": {MappingReviewStatus.NEW, MappingReviewStatus.NEEDS_REVIEW, MappingReviewStatus.MAPPED, MappingReviewStatus.APPROVED},
    "mark_duplicate": {MappingReviewStatus.NEW, MappingReviewStatus.NEEDS_REVIEW, MappingReviewStatus.MAPPED},
    "reset": {MappingReviewStatus.SKIPPED, MappingReviewStatus.DUPLICATE, MappingReviewStatus.ERROR, MappingReviewStatus.APPROVED},
    "needs_review": {MappingReviewStatus.NEW, MappingReviewStatus.MAPPED},
}


@router.post("/integrations/sales-review/{mapping_id}/action", response_model=MappingResponse)
async def mapping_action(
    mapping_id: UUID,
    body: MappingActionRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Perform an action on a mapping: approve, post, skip, mark_duplicate, reset, needs_review.

    Duplicate-safe posting: if already posted, re-post is blocked.
    """
    administration = await _require_pro_plan(current_user, db)

    result = await db.execute(
        select(EcommerceMapping, EcommerceOrder)
        .outerjoin(EcommerceOrder, EcommerceMapping.order_id == EcommerceOrder.id)
        .where(
            EcommerceMapping.id == mapping_id,
            EcommerceMapping.administration_id == administration.id,
        )
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Mapping niet gevonden.")

    mapping, order = row[0], row[1]
    action = body.action.lower()
    now = datetime.now(timezone.utc)

    if action not in VALID_ACTIONS:
        raise HTTPException(status_code=400, detail=f"Ongeldige actie: {action}")

    current_status = mapping.review_status
    if isinstance(current_status, str):
        current_status = MappingReviewStatus(current_status)

    # Check state transition is allowed
    allowed_from = ALLOWED_TRANSITIONS.get(action, set())
    if current_status not in allowed_from:
        raise HTTPException(
            status_code=409,
            detail=f"Actie '{action}' is niet toegestaan vanuit status '{current_status.value}'.",
        )

    old_status = current_status.value

    if action == "approve":
        # Override VAT if provided
        if body.vat_rate is not None:
            mapping.vat_rate = Decimal(str(body.vat_rate))
            mapping.vat_status = "manual"
        if body.accounting_date:
            mapping.accounting_date = date.fromisoformat(body.accounting_date)
        mapping.review_status = MappingReviewStatus.APPROVED
        mapping.approved_by = current_user.id
        mapping.approved_at = now
        mapping.reviewed_by = current_user.id
        mapping.reviewed_at = now

    elif action == "post":
        # Duplicate-safe: prevent re-posting
        if mapping.posted_entity_id is not None:
            raise HTTPException(
                status_code=409,
                detail="Dit record is al geboekt. Verwijder eerst de bestaande boeking.",
            )
        # Phase 2: mark as posted (intermediate layer – no direct journal posting yet)
        # This creates a reviewable "ready to post" state.
        # Full journal posting will be added in Phase 3.
        mapping.review_status = MappingReviewStatus.POSTED
        mapping.posted_by = current_user.id
        mapping.posted_at = now
        mapping.posted_entity_type = "pending_revenue"
        mapping.posted_entity_id = mapping.id  # self-reference as placeholder

    elif action == "skip":
        mapping.review_status = MappingReviewStatus.SKIPPED
        mapping.reviewed_by = current_user.id
        mapping.reviewed_at = now

    elif action == "mark_duplicate":
        mapping.review_status = MappingReviewStatus.DUPLICATE
        mapping.reviewed_by = current_user.id
        mapping.reviewed_at = now

    elif action == "reset":
        mapping.review_status = MappingReviewStatus.NEW
        mapping.approved_by = None
        mapping.approved_at = None
        mapping.reviewed_by = None
        mapping.reviewed_at = None
        # Only reset posting if not actually posted to accounting
        if mapping.posted_entity_type == "pending_revenue":
            mapping.posted_by = None
            mapping.posted_at = None
            mapping.posted_entity_type = None
            mapping.posted_entity_id = None

    elif action == "needs_review":
        mapping.review_status = MappingReviewStatus.NEEDS_REVIEW
        mapping.reviewed_by = current_user.id
        mapping.reviewed_at = now

    if body.notes:
        mapping.notes = body.notes

    # Audit log
    await _write_audit_log(
        db,
        administration_id=administration.id,
        entity_type="ecommerce_mapping",
        entity_id=mapping.id,
        action=f"mapping_{action}",
        user_id=current_user.id,
        old_value={"review_status": old_status},
        new_value={"review_status": mapping.review_status.value if isinstance(mapping.review_status, MappingReviewStatus) else mapping.review_status},
    )

    await db.commit()
    await db.refresh(mapping)

    return _mapping_to_response(mapping, order)


# ---------------------------------------------------------------------------
# Bulk actions
# ---------------------------------------------------------------------------

@router.post("/integrations/sales-review/bulk-action", response_model=BulkMappingActionResponse)
async def bulk_mapping_action(
    body: BulkMappingActionRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Perform an action on multiple mapping records at once.
    Supported: approve, skip, mark_duplicate, reset.
    'post' must be done individually for safety.
    """
    administration = await _require_pro_plan(current_user, db)
    action = body.action.lower()

    if action not in VALID_ACTIONS:
        raise HTTPException(status_code=400, detail=f"Ongeldige actie: {action}")

    if action == "post":
        raise HTTPException(
            status_code=400,
            detail="Boeken in bulk is niet toegestaan. Boek records individueel.",
        )

    processed = 0
    skipped = 0
    errors = 0
    details = []

    for mid in body.mapping_ids:
        mapping_result = await db.execute(
            select(EcommerceMapping).where(
                EcommerceMapping.id == mid,
                EcommerceMapping.administration_id == administration.id,
            )
        )
        mapping = mapping_result.scalar_one_or_none()
        if not mapping:
            skipped += 1
            details.append({"id": str(mid), "status": "not_found"})
            continue

        current_status = mapping.review_status
        if isinstance(current_status, str):
            current_status = MappingReviewStatus(current_status)

        allowed_from = ALLOWED_TRANSITIONS.get(action, set())
        if current_status not in allowed_from:
            skipped += 1
            details.append({"id": str(mid), "status": "invalid_transition"})
            continue

        now = datetime.now(timezone.utc)

        if action == "approve":
            mapping.review_status = MappingReviewStatus.APPROVED
            mapping.approved_by = current_user.id
            mapping.approved_at = now
            mapping.reviewed_by = current_user.id
            mapping.reviewed_at = now
        elif action == "skip":
            mapping.review_status = MappingReviewStatus.SKIPPED
            mapping.reviewed_by = current_user.id
            mapping.reviewed_at = now
        elif action == "mark_duplicate":
            mapping.review_status = MappingReviewStatus.DUPLICATE
            mapping.reviewed_by = current_user.id
            mapping.reviewed_at = now
        elif action == "reset":
            mapping.review_status = MappingReviewStatus.NEW
            mapping.approved_by = None
            mapping.approved_at = None
            mapping.reviewed_by = None
            mapping.reviewed_at = None
            if mapping.posted_entity_type == "pending_revenue":
                mapping.posted_by = None
                mapping.posted_at = None
                mapping.posted_entity_type = None
                mapping.posted_entity_id = None
        elif action == "needs_review":
            mapping.review_status = MappingReviewStatus.NEEDS_REVIEW
            mapping.reviewed_by = current_user.id
            mapping.reviewed_at = now

        if body.notes:
            mapping.notes = body.notes

        processed += 1
        details.append({"id": str(mid), "status": "ok"})

    await db.commit()

    return BulkMappingActionResponse(
        processed=processed,
        skipped=skipped,
        errors=errors,
        details=details,
    )


# ---------------------------------------------------------------------------
# Status summary
# ---------------------------------------------------------------------------

@router.get("/integrations/sales-review/summary")
async def mapping_summary(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Get aggregate status counts for the review workspace dashboard."""
    administration = await _require_pro_plan(current_user, db)

    counts_result = await db.execute(
        select(
            EcommerceMapping.review_status,
            func.count().label("cnt"),
        )
        .where(EcommerceMapping.administration_id == administration.id)
        .group_by(EcommerceMapping.review_status)
    )

    status_counts = {}
    total = 0
    for row in counts_result:
        key = row[0].value if isinstance(row[0], MappingReviewStatus) else str(row[0])
        status_counts[key] = row[1]
        total += row[1]

    return {
        "total": total,
        "status_counts": status_counts,
    }
