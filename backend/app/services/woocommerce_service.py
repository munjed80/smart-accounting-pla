"""
WooCommerce Integration Service

Handles connecting to WooCommerce REST API, fetching orders/customers/refunds,
and performing idempotent imports into the local database.

Phase 1 uses WooCommerce REST API v3 via consumer key/secret (HTTP Basic auth).
"""
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List, Tuple
from uuid import UUID

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ecommerce import (
    EcommerceConnection,
    EcommerceOrder,
    EcommerceCustomer,
    EcommerceRefund,
    EcommerceSyncLog,
    EcommerceProvider,
    ConnectionStatus,
    SyncStatus,
    EcommerceOrderStatus,
)

logger = logging.getLogger(__name__)

WC_API_VERSION = "wc/v3"


def _map_wc_status(wc_status: Optional[str]) -> EcommerceOrderStatus:
    """Map WooCommerce order status to our order status."""
    mapping = {
        "pending": EcommerceOrderStatus.OPEN,
        "processing": EcommerceOrderStatus.PAID,
        "on-hold": EcommerceOrderStatus.OPEN,
        "completed": EcommerceOrderStatus.PAID,
        "cancelled": EcommerceOrderStatus.CANCELLED,
        "refunded": EcommerceOrderStatus.REFUNDED,
        "failed": EcommerceOrderStatus.CANCELLED,
    }
    return mapping.get(wc_status or "", EcommerceOrderStatus.OPEN)


def _cents(amount: Any) -> int:
    """Convert WooCommerce amount (string or number) to cents."""
    if amount is None:
        return 0
    try:
        return int(round(float(str(amount)) * 100))
    except (ValueError, TypeError):
        return 0


def _parse_dt(dt_str: Optional[str]) -> Optional[datetime]:
    """Parse WooCommerce datetime string (ISO 8601)."""
    if not dt_str:
        return None
    try:
        dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, TypeError):
        return None


class WooCommerceService:
    """Service for WooCommerce store integration."""

    async def verify_connection(
        self, shop_url: str, consumer_key: str, consumer_secret: str
    ) -> Dict[str, Any]:
        """
        Verify WooCommerce credentials by calling the system status endpoint.
        """
        url = self._build_url(shop_url, "system_status")
        auth = (consumer_key, consumer_secret)

        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(url, auth=auth)
            if resp.status_code == 401:
                raise ValueError(
                    "Ongeldige WooCommerce API-sleutels. Controleer je consumer key en secret."
                )
            if resp.status_code == 404:
                raise ValueError(
                    "WooCommerce API niet gevonden. Controleer de URL en zorg dat de REST API is ingeschakeld."
                )
            resp.raise_for_status()
            data = resp.json()
            return {
                "store_url": shop_url,
                "wc_version": data.get("environment", {}).get("version", "unknown"),
            }

    async def sync_all(
        self,
        db: AsyncSession,
        connection: EcommerceConnection,
        consumer_key: str,
        consumer_secret: str,
    ) -> EcommerceSyncLog:
        """
        Full sync: fetch orders, customers, and refunds from WooCommerce.
        Idempotent – uses upsert logic based on external IDs.
        """
        sync_log = EcommerceSyncLog(
            connection_id=connection.id,
            administration_id=connection.administration_id,
            status=SyncStatus.RUNNING,
            trigger="manual",
        )
        db.add(sync_log)
        await db.flush()

        start = datetime.now(timezone.utc)
        orders_imported = 0
        orders_updated = 0
        customers_imported = 0
        refunds_imported = 0
        error_msg = None

        try:
            shop_url = connection.shop_url or ""
            auth = (consumer_key, consumer_secret)

            # --- Orders ---
            oi, ou, order_ids = await self._sync_orders(db, connection, shop_url, auth)
            orders_imported += oi
            orders_updated += ou

            # --- Customers ---
            ci = await self._sync_customers(db, connection, shop_url, auth)
            customers_imported += ci

            # --- Refunds ---
            ri = await self._sync_refunds(db, connection, shop_url, auth, order_ids)
            refunds_imported += ri

            sync_log.status = SyncStatus.SUCCESS
        except Exception as e:
            logger.exception(f"WooCommerce sync failed for connection {connection.id}")
            error_msg = str(e)[:1000]
            sync_log.status = SyncStatus.FAILED
            sync_log.error_message = error_msg

        end = datetime.now(timezone.utc)
        sync_log.orders_imported = orders_imported
        sync_log.orders_updated = orders_updated
        sync_log.customers_imported = customers_imported
        sync_log.refunds_imported = refunds_imported
        sync_log.finished_at = end
        sync_log.duration_ms = int((end - start).total_seconds() * 1000)

        # Update connection metadata
        connection.last_sync_at = end
        connection.last_sync_error = error_msg
        connection.last_sync_orders_count = orders_imported + orders_updated

        await db.commit()
        await db.refresh(sync_log)
        return sync_log

    # -----------------------------------------------------------------------
    # Private helpers
    # -----------------------------------------------------------------------

    async def _sync_orders(
        self,
        db: AsyncSession,
        connection: EcommerceConnection,
        shop_url: str,
        auth: Tuple[str, str],
    ) -> Tuple[int, int, List[str]]:
        """Fetch and upsert orders. Returns (imported, updated, list_of_ext_order_ids)."""
        imported = 0
        updated = 0
        order_ids: List[str] = []
        page = 1

        async with httpx.AsyncClient(timeout=30) as client:
            while True:
                url = self._build_url(shop_url, f"orders?per_page=100&page={page}")
                resp = await client.get(url, auth=auth)
                resp.raise_for_status()
                orders = resp.json()

                if not orders:
                    break

                for order in orders:
                    ext_id = str(order.get("id", ""))
                    if not ext_id:
                        continue
                    order_ids.append(ext_id)

                    existing = (await db.execute(
                        select(EcommerceOrder).where(
                            EcommerceOrder.connection_id == connection.id,
                            EcommerceOrder.external_order_id == ext_id,
                        )
                    )).scalar_one_or_none()

                    billing = order.get("billing", {}) or {}
                    customer_name = f"{billing.get('first_name', '')} {billing.get('last_name', '')}".strip() or None

                    # WC shipping total
                    shipping_cents = _cents(order.get("shipping_total"))
                    discount_cents = _cents(order.get("discount_total"))

                    order_data = {
                        "external_order_number": str(order.get("number", "")),
                        "status": _map_wc_status(order.get("status")),
                        "customer_name": customer_name,
                        "customer_email": billing.get("email"),
                        "currency": order.get("currency", "EUR"),
                        "total_amount_cents": _cents(order.get("total")),
                        "subtotal_cents": sum(_cents(li.get("subtotal")) for li in (order.get("line_items") or [])),
                        "tax_cents": _cents(order.get("total_tax")),
                        "shipping_cents": shipping_cents,
                        "discount_cents": discount_cents,
                        "ordered_at": _parse_dt(order.get("date_created_gmt") or order.get("date_created")),
                        "paid_at": _parse_dt(order.get("date_paid_gmt") or order.get("date_paid")),
                    }

                    if existing:
                        for k, v in order_data.items():
                            setattr(existing, k, v)
                        updated += 1
                    else:
                        new_order = EcommerceOrder(
                            connection_id=connection.id,
                            administration_id=connection.administration_id,
                            external_order_id=ext_id,
                            **order_data,
                        )
                        db.add(new_order)
                        imported += 1

                page += 1

        await db.flush()
        return imported, updated, order_ids

    async def _sync_customers(
        self,
        db: AsyncSession,
        connection: EcommerceConnection,
        shop_url: str,
        auth: Tuple[str, str],
    ) -> int:
        """Fetch and upsert customers."""
        imported = 0
        page = 1

        async with httpx.AsyncClient(timeout=30) as client:
            while True:
                url = self._build_url(shop_url, f"customers?per_page=100&page={page}")
                resp = await client.get(url, auth=auth)
                resp.raise_for_status()
                customers = resp.json()

                if not customers:
                    break

                for cust in customers:
                    ext_id = str(cust.get("id", ""))
                    if not ext_id:
                        continue

                    existing = (await db.execute(
                        select(EcommerceCustomer).where(
                            EcommerceCustomer.connection_id == connection.id,
                            EcommerceCustomer.external_customer_id == ext_id,
                        )
                    )).scalar_one_or_none()

                    billing = cust.get("billing", {}) or {}
                    cust_data = {
                        "email": cust.get("email"),
                        "first_name": cust.get("first_name"),
                        "last_name": cust.get("last_name"),
                        "company": billing.get("company"),
                        "phone": billing.get("phone"),
                        "total_orders": cust.get("orders_count", 0) or 0,
                        "total_spent_cents": _cents(cust.get("total_spent")),
                        "currency": "EUR",
                    }

                    if existing:
                        for k, v in cust_data.items():
                            setattr(existing, k, v)
                    else:
                        new_cust = EcommerceCustomer(
                            connection_id=connection.id,
                            administration_id=connection.administration_id,
                            external_customer_id=ext_id,
                            **cust_data,
                        )
                        db.add(new_cust)
                        imported += 1

                page += 1

        await db.flush()
        return imported

    async def _sync_refunds(
        self,
        db: AsyncSession,
        connection: EcommerceConnection,
        shop_url: str,
        auth: Tuple[str, str],
        order_ids: List[str],
    ) -> int:
        """Fetch refunds for orders that have them."""
        imported = 0

        async with httpx.AsyncClient(timeout=30) as client:
            for order_ext_id in order_ids:
                url = self._build_url(shop_url, f"orders/{order_ext_id}/refunds")
                resp = await client.get(url, auth=auth)
                if resp.status_code == 404:
                    continue
                resp.raise_for_status()
                refunds = resp.json()

                for refund in refunds:
                    ext_id = str(refund.get("id", ""))
                    if not ext_id:
                        continue

                    existing = (await db.execute(
                        select(EcommerceRefund).where(
                            EcommerceRefund.connection_id == connection.id,
                            EcommerceRefund.external_refund_id == ext_id,
                        )
                    )).scalar_one_or_none()

                    if existing:
                        continue

                    new_refund = EcommerceRefund(
                        connection_id=connection.id,
                        administration_id=connection.administration_id,
                        external_refund_id=ext_id,
                        external_order_id=order_ext_id,
                        amount_cents=abs(_cents(refund.get("amount"))),
                        currency="EUR",
                        reason=refund.get("reason"),
                        refunded_at=_parse_dt(refund.get("date_created_gmt") or refund.get("date_created")),
                    )
                    db.add(new_refund)
                    imported += 1

        await db.flush()
        return imported

    # -----------------------------------------------------------------------
    # URL helpers
    # -----------------------------------------------------------------------

    @staticmethod
    def _build_url(shop_url: str, path: str) -> str:
        """Build WooCommerce REST API URL."""
        base = shop_url.rstrip("/")
        if not base.startswith("http"):
            base = f"https://{base}"
        return f"{base}/wp-json/{WC_API_VERSION}/{path}"


# Singleton instance
woocommerce_service = WooCommerceService()
