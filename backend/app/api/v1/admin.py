import json
import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import CurrentUser, require_super_admin
from app.core.database import get_db
from app.core.security import create_access_token
from app.models.administration import Administration, AdministrationMember, MemberRole
from app.models.subscription import AdminAuditLog, Plan, Subscription, SubscriptionStatus
from app.models.transaction import Transaction
from app.models.user import User
from app.models.zzp import ZZPInvoice

router = APIRouter()
logger = logging.getLogger(__name__)


class AdminOverviewResponse(BaseModel):
    users_count: int
    administrations_count: int
    active_subscriptions_count: int
    mrr_estimate: float
    invoices_last_30_days: int


class AdministrationListItem(BaseModel):
    id: UUID
    name: str
    owner_email: str | None
    plan: str | None
    subscription_status: str | None
    created_at: datetime
    last_activity: datetime | None


class AdministrationListResponse(BaseModel):
    administrations: list[AdministrationListItem]
    total: int


class UserListItem(BaseModel):
    id: UUID
    email: str
    full_name: str
    role: str
    is_active: bool
    last_login_at: datetime | None
    administration_membership_count: int


class UserListResponse(BaseModel):
    users: list[UserListItem]
    total: int


class UpdateUserStatusRequest(BaseModel):
    is_active: bool


class UpdateSubscriptionRequest(BaseModel):
    plan_id: UUID | None = None
    status: str | None = Field(default=None, pattern="^(trial|active|past_due|canceled)$")
    starts_at: datetime | None = None
    ends_at: datetime | None = None


class ImpersonateResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    impersonated_user_id: UUID


class AdminAuditLogItem(BaseModel):
    id: UUID
    actor_user_id: UUID | None
    action: str
    target_type: str
    target_id: str
    created_at: datetime


class AdminAuditLogResponse(BaseModel):
    logs: list[AdminAuditLogItem]


def _ensure_super_admin(current_user: CurrentUser) -> User:
    require_super_admin(current_user)
    return current_user


SuperAdminUser = Annotated[User, Depends(_ensure_super_admin)]

_REQUEST_TO_SUBSCRIPTION_STATUS: dict[str, SubscriptionStatus] = {
    "trial": SubscriptionStatus.TRIALING,
    "active": SubscriptionStatus.ACTIVE,
    "past_due": SubscriptionStatus.PAST_DUE,
    "canceled": SubscriptionStatus.CANCELED,
}

_SUBSCRIPTION_STATUS_TO_RESPONSE: dict[SubscriptionStatus, str] = {
    SubscriptionStatus.TRIALING: "trial",
    SubscriptionStatus.ACTIVE: "active",
    SubscriptionStatus.PAST_DUE: "past_due",
    SubscriptionStatus.CANCELED: "canceled",
    SubscriptionStatus.EXPIRED: "canceled",
}


def _parse_subscription_status(value: str | None) -> SubscriptionStatus | None:
    if value is None:
        return None
    return _REQUEST_TO_SUBSCRIPTION_STATUS.get(value)


def _serialize_subscription_status(value: SubscriptionStatus | str | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, SubscriptionStatus):
        return _SUBSCRIPTION_STATUS_TO_RESPONSE.get(value)

    normalized = value.strip().upper()
    try:
        return _SUBSCRIPTION_STATUS_TO_RESPONSE[SubscriptionStatus(normalized)]
    except (ValueError, KeyError):
        return value.lower()


def _latest_subscription_subquery():
    return (
        select(
            Subscription.administration_id.label("administration_id"),
            func.max(Subscription.created_at).label("max_created_at"),
        )
        .group_by(Subscription.administration_id)
        .subquery("latest_subscription")
    )


async def _write_audit_log(
    db: AsyncSession,
    actor_user_id: UUID,
    action: str,
    target_type: str,
    target_id: str,
    details: dict | None = None,
) -> None:
    audit_entry = AdminAuditLog(
        actor_user_id=actor_user_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        details=json.dumps(details) if details else None,
    )
    db.add(audit_entry)


@router.get("/overview", response_model=AdminOverviewResponse)
async def get_admin_overview(
    super_admin: SuperAdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
    latest_subscription_sq = _latest_subscription_subquery()

    users_count = (await db.execute(select(func.count()).select_from(User))).scalar() or 0
    administrations_count = (await db.execute(select(func.count()).select_from(Administration))).scalar() or 0

    active_subscriptions_count = (
        await db.execute(
            select(func.count())
            .select_from(Subscription)
            .join(
                latest_subscription_sq,
                and_(
                    latest_subscription_sq.c.administration_id == Subscription.administration_id,
                    latest_subscription_sq.c.max_created_at == Subscription.created_at,
                ),
            )
            .where(Subscription.status.in_([SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING]))
        )
    ).scalar() or 0

    mrr_raw = (
        await db.execute(
            select(func.coalesce(func.sum(Plan.price_monthly), Decimal("0")))
            .select_from(Subscription)
            .join(
                latest_subscription_sq,
                and_(
                    latest_subscription_sq.c.administration_id == Subscription.administration_id,
                    latest_subscription_sq.c.max_created_at == Subscription.created_at,
                ),
            )
            .join(Plan, Plan.id == Subscription.plan_id)
            .where(Subscription.status == SubscriptionStatus.ACTIVE)
        )
    ).scalar() or Decimal("0")

    invoices_last_30_days = (
        await db.execute(
            select(func.count()).select_from(ZZPInvoice).where(ZZPInvoice.created_at >= thirty_days_ago)
        )
    ).scalar() or 0

    logger.info("Admin overview requested", extra={"event": "admin_overview", "user_id": str(super_admin.id)})

    return AdminOverviewResponse(
        users_count=users_count,
        administrations_count=administrations_count,
        active_subscriptions_count=active_subscriptions_count,
        mrr_estimate=float(mrr_raw),
        invoices_last_30_days=invoices_last_30_days,
    )


@router.get("/administrations", response_model=AdministrationListResponse)
async def list_administrations(
    super_admin: SuperAdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    query: str | None = None,
    status: str | None = Query(default=None, pattern="^(trial|active|past_due|canceled)$"),
    plan: str | None = None,
):
    owner_alias = User
    latest_subscription_sq = _latest_subscription_subquery()

    stmt = (
        select(
            Administration.id,
            Administration.name,
            owner_alias.email,
            Plan.name.label("plan_name"),
            Subscription.status,
            Administration.created_at,
            func.max(Transaction.created_at).label("last_activity"),
        )
        .select_from(Administration)
        .outerjoin(
            AdministrationMember,
            and_(AdministrationMember.administration_id == Administration.id, AdministrationMember.role == MemberRole.OWNER),
        )
        .outerjoin(owner_alias, owner_alias.id == AdministrationMember.user_id)
        .outerjoin(
            latest_subscription_sq,
            latest_subscription_sq.c.administration_id == Administration.id,
        )
        .outerjoin(
            Subscription,
            and_(
                Subscription.administration_id == latest_subscription_sq.c.administration_id,
                Subscription.created_at == latest_subscription_sq.c.max_created_at,
            ),
        )
        .outerjoin(Plan, Plan.id == Subscription.plan_id)
        .outerjoin(Transaction, Transaction.administration_id == Administration.id)
        .group_by(
            Administration.id,
            Administration.name,
            owner_alias.email,
            Plan.name,
            Subscription.status,
            Administration.created_at,
        )
        .order_by(Administration.created_at.desc())
    )

    if query:
        q = f"%{query.lower()}%"
        stmt = stmt.where(
            or_(func.lower(Administration.name).like(q), func.lower(func.coalesce(owner_alias.email, "")).like(q))
        )
    if status:
        parsed_status = _parse_subscription_status(status)
        if not parsed_status:
            raise HTTPException(status_code=400, detail="Unsupported subscription status filter")
        stmt = stmt.where(Subscription.status == parsed_status)
    if plan:
        stmt = stmt.where(func.lower(Plan.name) == plan.lower())

    rows = (await db.execute(stmt)).all()
    administrations = [
        AdministrationListItem(
            id=row.id,
            name=row.name,
            owner_email=row.email,
            plan=row.plan_name,
            subscription_status=_serialize_subscription_status(row.status),
            created_at=row.created_at,
            last_activity=row.last_activity,
        )
        for row in rows
    ]

    logger.info(
        "Admin administrations list requested",
        extra={"event": "admin_administrations_list", "user_id": str(super_admin.id), "count": len(administrations)},
    )

    return AdministrationListResponse(administrations=administrations, total=len(administrations))


@router.get("/users", response_model=UserListResponse)
async def list_users(
    super_admin: SuperAdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    query: str | None = None,
    role: str | None = Query(default=None, pattern="^(super_admin|admin|accountant|zzp)$"),
):
    stmt = (
        select(
            User.id,
            User.email,
            User.full_name,
            User.role,
            User.is_active,
            User.last_login_at,
            func.count(AdministrationMember.id).label("membership_count"),
        )
        .outerjoin(AdministrationMember, AdministrationMember.user_id == User.id)
        .group_by(User.id)
        .order_by(User.created_at.desc())
    )

    if query:
        q = f"%{query.lower()}%"
        stmt = stmt.where(or_(func.lower(User.email).like(q), func.lower(User.full_name).like(q)))
    if role:
        stmt = stmt.where(User.role == role)

    rows = (await db.execute(stmt)).all()
    users = [
        UserListItem(
            id=row.id,
            email=row.email,
            full_name=row.full_name,
            role=row.role,
            is_active=row.is_active,
            last_login_at=row.last_login_at,
            administration_membership_count=row.membership_count,
        )
        for row in rows
    ]

    logger.info(
        "Admin users list requested",
        extra={"event": "admin_users_list", "user_id": str(super_admin.id), "count": len(users)},
    )

    return UserListResponse(users=users, total=len(users))


@router.get("/logs", response_model=AdminAuditLogResponse)
async def list_admin_logs(
    super_admin: SuperAdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(default=50, ge=1, le=250),
):
    rows = (
        await db.execute(
            select(AdminAuditLog)
            .order_by(AdminAuditLog.created_at.desc())
            .limit(limit)
        )
    ).scalars().all()

    logger.info(
        "Admin logs requested",
        extra={"event": "admin_logs_list", "user_id": str(super_admin.id), "count": len(rows)},
    )

    return AdminAuditLogResponse(
        logs=[
            AdminAuditLogItem(
                id=row.id,
                actor_user_id=row.actor_user_id,
                action=row.action,
                target_type=row.target_type,
                target_id=row.target_id,
                created_at=row.created_at,
            )
            for row in rows
        ]
    )


@router.patch("/users/{user_id}/status")
async def update_user_status(
    user_id: UUID,
    payload: UpdateUserStatusRequest,
    super_admin: SuperAdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    old_status = user.is_active
    user.is_active = payload.is_active

    await _write_audit_log(
        db,
        actor_user_id=super_admin.id,
        action="user_status_updated",
        target_type="user",
        target_id=str(user.id),
        details={"old_is_active": old_status, "new_is_active": payload.is_active},
    )
    await db.commit()

    logger.info(
        "Admin updated user status",
        extra={"event": "admin_user_status_updated", "actor": str(super_admin.id), "target": str(user.id)},
    )
    return {"message": "User status updated"}


@router.patch("/administrations/{admin_id}/subscription")
async def update_administration_subscription(
    admin_id: UUID,
    payload: UpdateSubscriptionRequest,
    super_admin: SuperAdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    administration = (await db.execute(select(Administration).where(Administration.id == admin_id))).scalar_one_or_none()
    if not administration:
        raise HTTPException(status_code=404, detail="Administration not found")

    subscription = (
        await db.execute(
            select(Subscription)
            .where(Subscription.administration_id == admin_id)
            .order_by(Subscription.created_at.desc())
        )
    ).scalars().first()

    if not subscription:
        if not payload.plan_id:
            raise HTTPException(status_code=400, detail="plan_id is required when creating a subscription")
        
        # Fetch the plan to get the plan_code
        plan = (await db.execute(select(Plan).where(Plan.id == payload.plan_id))).scalar_one_or_none()
        if not plan:
            raise HTTPException(status_code=400, detail="Plan not found")
        
        subscription = Subscription(
            administration_id=admin_id,
            plan_id=payload.plan_id,
            plan_code=plan.code,
            status=_parse_subscription_status(payload.status) or SubscriptionStatus.TRIALING,
            starts_at=payload.starts_at or datetime.now(timezone.utc),
            ends_at=payload.ends_at,
        )
        db.add(subscription)
        action = "subscription_created"
    else:
        if payload.plan_id:
            # If updating plan_id, also update plan_code
            plan = (await db.execute(select(Plan).where(Plan.id == payload.plan_id))).scalar_one_or_none()
            if not plan:
                raise HTTPException(status_code=400, detail="Plan not found")
            subscription.plan_id = payload.plan_id
            subscription.plan_code = plan.code
        if payload.status:
            parsed_status = _parse_subscription_status(payload.status)
            if not parsed_status:
                raise HTTPException(status_code=400, detail="Unsupported subscription status")
            subscription.status = parsed_status
        if payload.starts_at:
            subscription.starts_at = payload.starts_at
        if payload.ends_at is not None:
            subscription.ends_at = payload.ends_at
        action = "subscription_updated"

    await _write_audit_log(
        db,
        actor_user_id=super_admin.id,
        action=action,
        target_type="administration",
        target_id=str(admin_id),
        details=payload.model_dump(exclude_none=True),
    )
    await db.commit()

    logger.info(
        "Admin changed administration subscription",
        extra={"event": "admin_subscription_updated", "actor": str(super_admin.id), "administration_id": str(admin_id)},
    )
    return {"message": "Subscription updated"}


@router.post("/impersonate/{user_id}", response_model=ImpersonateResponse)
async def impersonate_user(
    user_id: UUID,
    super_admin: SuperAdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    token = create_access_token(
        data={"sub": str(user.id), "impersonated_by": str(super_admin.id), "is_impersonation": True}
    )

    await _write_audit_log(
        db,
        actor_user_id=super_admin.id,
        action="impersonation_issued",
        target_type="user",
        target_id=str(user.id),
        details={"impersonated_email": user.email},
    )
    await db.commit()

    logger.warning(
        "Impersonation token issued",
        extra={"event": "admin_impersonation", "actor": str(super_admin.id), "target": str(user.id)},
    )

    return ImpersonateResponse(access_token=token, impersonated_user_id=user.id)


# ---------------------------------------------------------------------------
# Mollie verification helpers (super_admin only)
# ---------------------------------------------------------------------------

class MollieWebhookConfigResponse(BaseModel):
    mollie_enabled: bool
    mode: str  # "TEST", "LIVE", "UNKNOWN", or "DISABLED"
    webhook_url_masked: str | None  # secret replaced with ***
    webhook_secret_configured: bool
    app_public_url: str | None
    route_path: str = "/api/v1/webhooks/mollie"
    probe_instructions: str = (
        "Send GET /api/v1/webhooks/mollie to verify the route is reachable. "
        "Mollie events arrive via POST with form body id=<payment_id>."
    )


class MollieSubscriptionInfoResponse(BaseModel):
    administration_id: UUID
    subscription_id: UUID | None
    status: str | None
    provider: str | None
    provider_customer_id: str | None
    provider_subscription_id: str | None
    trial_start_at: datetime | None
    trial_end_at: datetime | None
    current_period_start: datetime | None
    current_period_end: datetime | None
    cancel_at_period_end: bool | None
    next_payment_date: datetime | None


@router.get("/mollie/webhook-config", response_model=MollieWebhookConfigResponse)
async def get_mollie_webhook_config(
    super_admin: SuperAdminUser,
):
    """
    Return computed Mollie webhook config for verification (secret masked).

    Useful for confirming APP_PUBLIC_URL, the webhook path, and whether the
    MOLLIE_WEBHOOK_SECRET is configured without exposing the secret itself.
    """
    from app.core.config import settings as cfg

    enabled = cfg.mollie_enabled
    api_key_prefix = (cfg.MOLLIE_API_KEY or "")[:5]
    if not enabled:
        mode = "DISABLED"
    elif api_key_prefix == "live_":
        mode = "LIVE"
    elif api_key_prefix == "test_":
        mode = "TEST"
    else:
        mode = "UNKNOWN"

    secret_configured = bool(cfg.MOLLIE_WEBHOOK_SECRET)
    public_url = cfg.APP_PUBLIC_URL or cfg.APP_URL
    if public_url.endswith("/"):
        public_url = public_url[:-1]

    if secret_configured:
        webhook_url_masked = f"{public_url}/api/v1/webhooks/mollie?secret=***"
    elif enabled:
        webhook_url_masked = f"{public_url}/api/v1/webhooks/mollie"
    else:
        webhook_url_masked = None

    logger.info(
        "Admin requested Mollie webhook config",
        extra={"event": "admin_mollie_webhook_config", "user_id": str(super_admin.id)},
    )

    return MollieWebhookConfigResponse(
        mollie_enabled=enabled,
        mode=mode,
        webhook_url_masked=webhook_url_masked,
        webhook_secret_configured=secret_configured,
        app_public_url=cfg.APP_PUBLIC_URL,
    )


@router.get(
    "/mollie/subscriptions/{admin_id}",
    response_model=MollieSubscriptionInfoResponse,
)
async def get_mollie_subscription_info(
    admin_id: UUID,
    super_admin: SuperAdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Return stored Mollie subscription fields for a given administration.

    Shows provider_customer_id, provider_subscription_id and all relevant
    date fields so admins can verify they match the Mollie dashboard after
    activation.
    """
    administration = (
        await db.execute(select(Administration).where(Administration.id == admin_id))
    ).scalar_one_or_none()
    if not administration:
        raise HTTPException(status_code=404, detail="Administration not found")

    subscription = (
        await db.execute(
            select(Subscription)
            .where(Subscription.administration_id == admin_id)
            .order_by(Subscription.created_at.desc())
        )
    ).scalars().first()

    if not subscription:
        return MollieSubscriptionInfoResponse(
            administration_id=admin_id,
            subscription_id=None,
            status=None,
            provider=None,
            provider_customer_id=None,
            provider_subscription_id=None,
            trial_start_at=None,
            trial_end_at=None,
            current_period_start=None,
            current_period_end=None,
            cancel_at_period_end=None,
            next_payment_date=None,
        )

    # Best-effort next_payment_date
    next_payment_date = subscription.current_period_end or subscription.trial_end_at

    logger.info(
        "Admin requested Mollie subscription info",
        extra={
            "event": "admin_mollie_subscription_info",
            "user_id": str(super_admin.id),
            "administration_id": str(admin_id),
        },
    )

    return MollieSubscriptionInfoResponse(
        administration_id=admin_id,
        subscription_id=subscription.id,
        status=subscription.status.value if subscription.status else None,
        provider=subscription.provider,
        provider_customer_id=subscription.provider_customer_id,
        provider_subscription_id=subscription.provider_subscription_id,
        trial_start_at=subscription.trial_start_at,
        trial_end_at=subscription.trial_end_at,
        current_period_start=subscription.current_period_start,
        current_period_end=subscription.current_period_end,
        cancel_at_period_end=subscription.cancel_at_period_end,
        next_payment_date=next_payment_date,
    )
