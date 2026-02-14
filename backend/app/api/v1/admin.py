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
from app.models.subscription import AdminAuditLog, Plan, Subscription
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


def _ensure_super_admin(current_user: CurrentUser) -> User:
    require_super_admin(current_user)
    return current_user


SuperAdminUser = Annotated[User, Depends(_ensure_super_admin)]


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
            .where(Subscription.status.in_(["active", "trial"]))
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
            .where(Subscription.status == "active")
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
        stmt = stmt.where(Subscription.status == status)
    if plan:
        stmt = stmt.where(func.lower(Plan.name) == plan.lower())

    rows = (await db.execute(stmt)).all()
    administrations = [
        AdministrationListItem(
            id=row.id,
            name=row.name,
            owner_email=row.email,
            plan=row.plan_name,
            subscription_status=row.status,
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
        subscription = Subscription(
            administration_id=admin_id,
            plan_id=payload.plan_id,
            status=payload.status or "trial",
            starts_at=payload.starts_at or datetime.now(timezone.utc),
            ends_at=payload.ends_at,
        )
        db.add(subscription)
        action = "subscription_created"
    else:
        if payload.plan_id:
            subscription.plan_id = payload.plan_id
        if payload.status:
            subscription.status = payload.status
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
