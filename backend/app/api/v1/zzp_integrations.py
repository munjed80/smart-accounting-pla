"""
ZZP E-commerce Integrations API

Endpoints for managing Shopify and WooCommerce integrations.
All endpoints are gated to Pro-plan users only.
"""
import logging
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.credential_encryption import encrypt_credentials, decrypt_credentials
from app.api.v1.deps import CurrentUser, require_zzp
from app.models.administration import Administration, AdministrationMember
from app.models.ecommerce import (
    EcommerceConnection,
    EcommerceOrder,
    EcommerceCustomer,
    EcommerceRefund,
    EcommerceSyncLog,
    EcommerceProvider,
    ConnectionStatus,
)
from app.schemas.ecommerce import (
    ConnectShopifyRequest,
    ConnectWooCommerceRequest,
    ConnectionResponse,
    ConnectionListResponse,
    OrderResponse,
    OrderListResponse,
    CustomerResponse,
    CustomerListResponse,
    RefundResponse,
    RefundListResponse,
    SyncLogResponse,
    SyncLogListResponse,
    SyncTriggerResponse,
)
from app.services.subscription_service import subscription_service

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_administration(user: CurrentUser, db: AsyncSession) -> Administration:
    """Get the user's primary administration."""
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
    """
    Require that the user is a ZZP user on the Pro plan (zzp_pro).
    Returns the administration if access is granted.
    """
    require_zzp(user)
    administration = await _get_administration(user, db)

    entitlements = await subscription_service.compute_entitlements(db, administration.id)

    # Allow access if user has pro features AND is on zzp_pro plan specifically
    # During trial, all features are unlocked, so we allow trial users too
    if not entitlements.can_use_pro_features:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "PRO_PLAN_REQUIRED",
                "message": "E-commerce integraties zijn alleen beschikbaar met het Pro-abonnement.",
                "plan_code": entitlements.plan_code,
            },
        )

    # If user has an active paid subscription, must be on zzp_pro plan
    if entitlements.is_paid and entitlements.plan_code not in ("zzp_pro", "pro"):
        raise HTTPException(
            status_code=403,
            detail={
                "code": "PRO_PLAN_REQUIRED",
                "message": "E-commerce integraties zijn alleen beschikbaar met het Pro-abonnement. Upgrade je abonnement.",
                "plan_code": entitlements.plan_code,
            },
        )

    return administration


async def _get_connection(
    connection_id: UUID, administration_id: UUID, db: AsyncSession
) -> EcommerceConnection:
    """Get a connection by ID, scoped to administration."""
    result = await db.execute(
        select(EcommerceConnection).where(
            EcommerceConnection.id == connection_id,
            EcommerceConnection.administration_id == administration_id,
        )
    )
    conn = result.scalar_one_or_none()
    if not conn:
        raise HTTPException(status_code=404, detail="Integratie niet gevonden.")
    return conn


def _conn_response(conn: EcommerceConnection) -> ConnectionResponse:
    """Convert a connection model to response schema."""
    return ConnectionResponse(
        id=conn.id,
        provider=conn.provider.value,
        status=conn.status.value,
        shop_name=conn.shop_name,
        shop_url=conn.shop_url,
        last_sync_at=conn.last_sync_at,
        last_sync_error=conn.last_sync_error,
        last_sync_orders_count=conn.last_sync_orders_count,
        created_at=conn.created_at,
        updated_at=conn.updated_at,
    )


# ---------------------------------------------------------------------------
# Connection endpoints
# ---------------------------------------------------------------------------

@router.get("/integrations", response_model=ConnectionListResponse)
async def list_connections(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List all e-commerce connections for the user's administration."""
    require_zzp(current_user)
    administration = await _get_administration(current_user, db)

    # Check entitlements to determine if user can actually use integrations
    entitlements = await subscription_service.compute_entitlements(db, administration.id)

    result = await db.execute(
        select(EcommerceConnection)
        .where(EcommerceConnection.administration_id == administration.id)
        .order_by(EcommerceConnection.created_at)
    )
    connections = result.scalars().all()

    return ConnectionListResponse(
        connections=[_conn_response(c) for c in connections],
    )


@router.get("/integrations/entitlements")
async def check_integration_entitlements(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Check if the user can use e-commerce integrations (Pro plan check)."""
    require_zzp(current_user)
    administration = await _get_administration(current_user, db)
    entitlements = await subscription_service.compute_entitlements(db, administration.id)

    is_pro = entitlements.plan_code in ("zzp_pro", "pro")
    can_use = entitlements.can_use_pro_features and (entitlements.in_trial or is_pro)

    return {
        "can_use_integrations": can_use,
        "plan_code": entitlements.plan_code,
        "is_pro": is_pro,
        "in_trial": entitlements.in_trial,
        "status": entitlements.status,
    }


@router.post("/integrations/shopify", response_model=ConnectionResponse, status_code=201)
async def connect_shopify(
    body: ConnectShopifyRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Connect a Shopify store. Requires Pro plan."""
    administration = await _require_pro_plan(current_user, db)

    # Check if already connected
    existing = (await db.execute(
        select(EcommerceConnection).where(
            EcommerceConnection.administration_id == administration.id,
            EcommerceConnection.provider == EcommerceProvider.SHOPIFY,
        )
    )).scalar_one_or_none()

    if existing and existing.status == ConnectionStatus.CONNECTED:
        raise HTTPException(
            status_code=409,
            detail="Shopify is al gekoppeld. Ontkoppel eerst voordat je opnieuw verbindt.",
        )

    # Verify credentials with Shopify API
    from app.services.shopify_service import shopify_service
    try:
        shop_info = await shopify_service.verify_connection(body.shop_url, body.access_token)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Shopify connection verification failed")
        raise HTTPException(
            status_code=502,
            detail="Kan geen verbinding maken met Shopify. Controleer de URL en token.",
        )

    # Encrypt and store credentials
    creds = encrypt_credentials({"access_token": body.access_token})
    shop_name = body.shop_name or shop_info.get("name", body.shop_url)

    if existing:
        existing.status = ConnectionStatus.CONNECTED
        existing.shop_name = shop_name
        existing.shop_url = body.shop_url
        existing.encrypted_credentials = creds
        existing.last_sync_error = None
        conn = existing
    else:
        conn = EcommerceConnection(
            administration_id=administration.id,
            provider=EcommerceProvider.SHOPIFY,
            status=ConnectionStatus.CONNECTED,
            shop_name=shop_name,
            shop_url=body.shop_url,
            encrypted_credentials=creds,
        )
        db.add(conn)

    await db.commit()
    await db.refresh(conn)
    return _conn_response(conn)


@router.post("/integrations/woocommerce", response_model=ConnectionResponse, status_code=201)
async def connect_woocommerce(
    body: ConnectWooCommerceRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Connect a WooCommerce store. Requires Pro plan."""
    administration = await _require_pro_plan(current_user, db)

    # Check if already connected
    existing = (await db.execute(
        select(EcommerceConnection).where(
            EcommerceConnection.administration_id == administration.id,
            EcommerceConnection.provider == EcommerceProvider.WOOCOMMERCE,
        )
    )).scalar_one_or_none()

    if existing and existing.status == ConnectionStatus.CONNECTED:
        raise HTTPException(
            status_code=409,
            detail="WooCommerce is al gekoppeld. Ontkoppel eerst voordat je opnieuw verbindt.",
        )

    # Verify credentials with WooCommerce API
    from app.services.woocommerce_service import woocommerce_service
    try:
        shop_info = await woocommerce_service.verify_connection(
            body.shop_url, body.consumer_key, body.consumer_secret
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("WooCommerce connection verification failed")
        raise HTTPException(
            status_code=502,
            detail="Kan geen verbinding maken met WooCommerce. Controleer de URL en API-sleutels.",
        )

    # Encrypt and store credentials
    creds = encrypt_credentials({
        "consumer_key": body.consumer_key,
        "consumer_secret": body.consumer_secret,
    })
    shop_name = body.shop_name or body.shop_url

    if existing:
        existing.status = ConnectionStatus.CONNECTED
        existing.shop_name = shop_name
        existing.shop_url = body.shop_url
        existing.encrypted_credentials = creds
        existing.last_sync_error = None
        conn = existing
    else:
        conn = EcommerceConnection(
            administration_id=administration.id,
            provider=EcommerceProvider.WOOCOMMERCE,
            status=ConnectionStatus.CONNECTED,
            shop_name=shop_name,
            shop_url=body.shop_url,
            encrypted_credentials=creds,
        )
        db.add(conn)

    await db.commit()
    await db.refresh(conn)
    return _conn_response(conn)


@router.post("/integrations/{connection_id}/sync", response_model=SyncTriggerResponse)
async def trigger_sync(
    connection_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Trigger a manual sync for an e-commerce connection. Requires Pro plan."""
    administration = await _require_pro_plan(current_user, db)
    conn = await _get_connection(connection_id, administration.id, db)

    if conn.status != ConnectionStatus.CONNECTED:
        raise HTTPException(
            status_code=400,
            detail="Integratie is niet actief. Verbind opnieuw.",
        )

    # Decrypt credentials
    if not conn.encrypted_credentials:
        raise HTTPException(status_code=400, detail="Geen opgeslagen inloggegevens.")
    creds = decrypt_credentials(conn.encrypted_credentials)

    # Dispatch to provider-specific service
    if conn.provider == EcommerceProvider.SHOPIFY:
        from app.services.shopify_service import shopify_service
        sync_log = await shopify_service.sync_all(db, conn, creds["access_token"])
    elif conn.provider == EcommerceProvider.WOOCOMMERCE:
        from app.services.woocommerce_service import woocommerce_service
        sync_log = await woocommerce_service.sync_all(
            db, conn, creds["consumer_key"], creds["consumer_secret"]
        )
    else:
        raise HTTPException(status_code=400, detail="Onbekende provider.")

    return SyncTriggerResponse(
        message="Synchronisatie voltooid." if sync_log.status.value == "success" else "Synchronisatie mislukt.",
        sync_log_id=sync_log.id,
        status=sync_log.status.value,
        orders_imported=sync_log.orders_imported,
        orders_updated=sync_log.orders_updated,
        customers_imported=sync_log.customers_imported,
        refunds_imported=sync_log.refunds_imported,
        error=sync_log.error_message,
    )


@router.post("/integrations/{connection_id}/disconnect", response_model=ConnectionResponse)
async def disconnect_integration(
    connection_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Disconnect an e-commerce integration. Clears credentials but keeps imported data."""
    administration = await _require_pro_plan(current_user, db)
    conn = await _get_connection(connection_id, administration.id, db)

    conn.status = ConnectionStatus.DISCONNECTED
    conn.encrypted_credentials = None
    conn.last_sync_error = None

    await db.commit()
    await db.refresh(conn)
    return _conn_response(conn)


@router.delete("/integrations/{connection_id}", status_code=204)
async def delete_integration(
    connection_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Completely remove an integration and all its imported data."""
    administration = await _require_pro_plan(current_user, db)
    conn = await _get_connection(connection_id, administration.id, db)

    await db.delete(conn)
    await db.commit()


# ---------------------------------------------------------------------------
# Data endpoints
# ---------------------------------------------------------------------------

@router.get("/integrations/{connection_id}/orders", response_model=OrderListResponse)
async def list_orders(
    connection_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
):
    """List imported orders for a connection."""
    administration = await _require_pro_plan(current_user, db)
    conn = await _get_connection(connection_id, administration.id, db)

    # Count
    total_result = await db.execute(
        select(func.count()).select_from(EcommerceOrder).where(
            EcommerceOrder.connection_id == conn.id,
        )
    )
    total = total_result.scalar() or 0

    # Fetch page
    result = await db.execute(
        select(EcommerceOrder)
        .where(EcommerceOrder.connection_id == conn.id)
        .order_by(desc(EcommerceOrder.ordered_at))
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    orders = result.scalars().all()

    return OrderListResponse(
        orders=[
            OrderResponse(
                id=o.id,
                connection_id=o.connection_id,
                provider=conn.provider.value,
                external_order_id=o.external_order_id,
                external_order_number=o.external_order_number,
                status=o.status.value,
                customer_name=o.customer_name,
                customer_email=o.customer_email,
                currency=o.currency,
                total_amount_cents=o.total_amount_cents,
                subtotal_cents=o.subtotal_cents,
                tax_cents=o.tax_cents,
                shipping_cents=o.shipping_cents,
                discount_cents=o.discount_cents,
                ordered_at=o.ordered_at,
                paid_at=o.paid_at,
                created_at=o.created_at,
            )
            for o in orders
        ],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/integrations/{connection_id}/customers", response_model=CustomerListResponse)
async def list_customers(
    connection_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List imported customers for a connection."""
    administration = await _require_pro_plan(current_user, db)
    conn = await _get_connection(connection_id, administration.id, db)

    result = await db.execute(
        select(EcommerceCustomer)
        .where(EcommerceCustomer.connection_id == conn.id)
        .order_by(EcommerceCustomer.last_name, EcommerceCustomer.first_name)
    )
    customers = result.scalars().all()

    return CustomerListResponse(
        customers=[
            CustomerResponse(
                id=c.id,
                connection_id=c.connection_id,
                external_customer_id=c.external_customer_id,
                email=c.email,
                first_name=c.first_name,
                last_name=c.last_name,
                company=c.company,
                phone=c.phone,
                total_orders=c.total_orders,
                total_spent_cents=c.total_spent_cents,
                currency=c.currency,
                created_at=c.created_at,
            )
            for c in customers
        ],
        total=len(customers),
    )


@router.get("/integrations/{connection_id}/refunds", response_model=RefundListResponse)
async def list_refunds(
    connection_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """List imported refunds for a connection."""
    administration = await _require_pro_plan(current_user, db)
    conn = await _get_connection(connection_id, administration.id, db)

    result = await db.execute(
        select(EcommerceRefund)
        .where(EcommerceRefund.connection_id == conn.id)
        .order_by(desc(EcommerceRefund.refunded_at))
    )
    refunds = result.scalars().all()

    return RefundListResponse(
        refunds=[
            RefundResponse(
                id=r.id,
                connection_id=r.connection_id,
                external_refund_id=r.external_refund_id,
                external_order_id=r.external_order_id,
                amount_cents=r.amount_cents,
                currency=r.currency,
                reason=r.reason,
                refunded_at=r.refunded_at,
                created_at=r.created_at,
            )
            for r in refunds
        ],
        total=len(refunds),
    )


@router.get("/integrations/{connection_id}/sync-logs", response_model=SyncLogListResponse)
async def list_sync_logs(
    connection_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(20, ge=1, le=100),
):
    """List sync history for a connection."""
    administration = await _require_pro_plan(current_user, db)
    conn = await _get_connection(connection_id, administration.id, db)

    result = await db.execute(
        select(EcommerceSyncLog)
        .where(EcommerceSyncLog.connection_id == conn.id)
        .order_by(desc(EcommerceSyncLog.started_at))
        .limit(limit)
    )
    logs = result.scalars().all()

    return SyncLogListResponse(
        logs=[
            SyncLogResponse(
                id=l.id,
                connection_id=l.connection_id,
                status=l.status.value,
                trigger=l.trigger,
                orders_imported=l.orders_imported,
                orders_updated=l.orders_updated,
                customers_imported=l.customers_imported,
                refunds_imported=l.refunds_imported,
                error_message=l.error_message,
                duration_ms=l.duration_ms,
                started_at=l.started_at,
                finished_at=l.finished_at,
            )
            for l in logs
        ],
        total=len(logs),
    )
