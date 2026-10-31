"""
Shopify Integration Service

Handles connecting to Shopify Admin API, fetching orders/customers/refunds,
and performing idempotent imports into the local database.

Phase 1 uses Shopify Admin REST API via a custom-app access token.
"""
import logging
import json
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List, Tuple
from uuid import UUID

import httpx
from app.services.ecommerce_http import cents, normalize_store_url, store_get
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

# Shopify API version (use stable version)
SHOPIFY_API_VERSION = "2026-10"


def _map_shopify_financial_status(financial_status: Optional[str]) -> EcommerceOrderStatus:
    """Map Shopify financial_status to our order status."""
    mapping = {
        "pending": EcommerceOrderStatus.OPEN,
        "authorized": EcommerceOrderStatus.OPEN,
        "paid": EcommerceOrderStatus.PAID,
        "partially_paid": EcommerceOrderStatus.PARTIALLY_PAID,
        "refunded": EcommerceOrderStatus.REFUNDED,
        "partially_refunded": EcommerceOrderStatus.PARTIALLY_REFUNDED,
        "voided": EcommerceOrderStatus.CANCELLED,
    }
    return mapping.get(financial_status or "", EcommerceOrderStatus.OPEN)


_cents = cents


def _parse_dt(dt_str: Optional[str]) -> Optional[datetime]:
    """Parse Shopify ISO datetime string."""
    if not dt_str:
        return None
    try:
        return datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None


class ShopifyService:
    """Service for Shopify store integration."""

    async def verify_connection(self, shop_url: str, access_token: str) -> Dict[str, Any]:
        """
        Verify Shopify credentials by calling /admin/api/{version}/shop.json.
        Returns shop info on success, raises on failure.
        """
        url = self._build_url(shop_url, "shop.json")
        headers = self._headers(access_token)

        async with httpx.AsyncClient(timeout=15, trust_env=False) as client:
            resp = await store_get(client, url, headers=headers, origin=shop_url)
            if resp.status_code == 401:
                raise ValueError("Ongeldige Shopify-toegangstoken. Controleer je API-token.")
            if resp.status_code == 404:
                raise ValueError("Shopify-winkel niet gevonden. Controleer de URL.")
            resp.raise_for_status()
            data = resp.json()
            scopes_response = await store_get(client, normalize_store_url(shop_url, shopify=True) + "/admin/oauth/access_scopes.json", headers=headers, origin=shop_url)
            scopes_response.raise_for_status()
            scopes = {scope['handle'] for scope in scopes_response.json().get('access_scopes', [])}
            if not ({'read_orders', 'write_orders'} & scopes) or not ({'read_customers', 'write_customers'} & scopes):
                raise ValueError("Geef de app leestoegang tot bestellingen en klanten. Voor oudere bestellingen is read_all_orders nodig.")
            return data.get("shop", {})

    async def sync_all(
        self,
        db: AsyncSession,
        connection: EcommerceConnection,
        access_token: str,
    ) -> EcommerceSyncLog:
        """
        Full sync: fetch orders, customers, and refunds from Shopify.
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
            async with db.begin_nested():
                shop_url = connection.shop_url or ""
                headers = self._headers(access_token)

                # --- Orders ---
                oi, ou, refunds_from_orders = await self._sync_orders(db, connection, shop_url, headers)
                orders_imported += oi
                orders_updated += ou

                # --- Customers ---
                ci = await self._sync_customers(db, connection, shop_url, headers)
                customers_imported += ci

                # --- Refunds (from orders that have refunds) ---
                ri = await self._sync_refunds(db, connection, refunds_from_orders)
                refunds_imported += ri
                from app.services.ecommerce_review_refresh import refresh_reviews
                await refresh_reviews(db, connection)

            sync_log.status = SyncStatus.SUCCESS
        except Exception as e:
            logger.exception(f"Shopify sync failed for connection {connection.id}")
            orders_imported = orders_updated = customers_imported = refunds_imported = 0
            error_msg = "Synchronisatie afgebroken; wijzigingen zijn teruggedraaid. Controleer de toegang en probeer opnieuw."
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
        headers: Dict,
    ) -> Tuple[int, int, List[Dict]]:
        """Fetch and upsert orders. Returns (imported, updated, refunds_raw)."""
        imported = 0
        updated = 0
        all_refunds: List[Dict] = []
        url = self._build_url(shop_url, "orders.json?status=any&limit=250")

        async with httpx.AsyncClient(timeout=30, trust_env=False) as client:
            visited = set()
            while url:
                if url in visited or len(visited) >= 1000:
                    raise ValueError("Invalid or excessive pagination")
                visited.add(url)
                resp = await store_get(client, url, headers=headers, origin=shop_url)
                resp.raise_for_status()
                data = resp.json()
                orders = data.get("orders", [])

                for order in orders:
                    ext_id = str(order.get("id", ""))
                    if not ext_id:
                        continue

                    # Collect refunds attached to orders
                    if order.get("refunds"):
                        for refund in order["refunds"]:
                            refund["_parent_order_id"] = ext_id
                            refund["currency"] = order.get("currency", "EUR")
                            all_refunds.append(refund)

                    # Check if exists
                    existing = (await db.execute(
                        select(EcommerceOrder).where(
                            EcommerceOrder.connection_id == connection.id,
                            EcommerceOrder.external_order_id == ext_id,
                        )
                    )).scalar_one_or_none()

                    customer = order.get("customer", {}) or {}
                    order_data = {
                        "external_order_number": str(order.get("order_number", "")),
                        "status": EcommerceOrderStatus.CANCELLED if order.get("cancelled_at") else _map_shopify_financial_status(order.get("financial_status")),
                        "customer_name": f"{customer.get('first_name', '')} {customer.get('last_name', '')}".strip() or None,
                        "customer_email": customer.get("email") or order.get("email"),
                        "currency": order.get("currency", "EUR"),
                        "total_amount_cents": _cents(order.get("total_price")),
                        "subtotal_cents": _cents(order.get("subtotal_price")),
                        "tax_cents": _cents(order.get("total_tax")),
                        "shipping_cents": sum(_cents(sl.get("price")) for sl in (order.get("shipping_lines") or [])),
                        "discount_cents": abs(_cents(order.get("total_discounts"))),
                        "ordered_at": _parse_dt(order.get("created_at")),
                        "paid_at": None,  # closed_at is fulfillment closure, not a payment timestamp
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

                # Pagination via Link header
                url = self._next_page_url(resp)

        await db.flush()
        return imported, updated, all_refunds

    async def _sync_customers(
        self,
        db: AsyncSession,
        connection: EcommerceConnection,
        shop_url: str,
        headers: Dict,
    ) -> int:
        """Fetch and upsert customers."""
        imported = 0
        url = self._build_url(shop_url, "customers.json?limit=250")

        async with httpx.AsyncClient(timeout=30, trust_env=False) as client:
            visited = set()
            while url:
                if url in visited or len(visited) >= 1000:
                    raise ValueError("Invalid or excessive pagination")
                visited.add(url)
                resp = await store_get(client, url, headers=headers, origin=shop_url)
                resp.raise_for_status()
                data = resp.json()

                for cust in data.get("customers", []):
                    ext_id = str(cust.get("id", ""))
                    if not ext_id:
                        continue

                    existing = (await db.execute(
                        select(EcommerceCustomer).where(
                            EcommerceCustomer.connection_id == connection.id,
                            EcommerceCustomer.external_customer_id == ext_id,
                        )
                    )).scalar_one_or_none()

                    cust_data = {
                        "email": cust.get("email"),
                        "first_name": cust.get("first_name"),
                        "last_name": cust.get("last_name"),
                        "company": cust.get("default_address", {}).get("company") if cust.get("default_address") else None,
                        "phone": cust.get("phone"),
                        "total_orders": cust.get("orders_count", 0),
                        "total_spent_cents": _cents(cust.get("total_spent")),
                        "currency": cust.get("currency", "EUR"),
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

                url = self._next_page_url(resp)

        await db.flush()
        return imported

    async def _sync_refunds(
        self,
        db: AsyncSession,
        connection: EcommerceConnection,
        refunds_raw: List[Dict],
    ) -> int:
        """Upsert refunds collected from orders."""
        imported = 0
        for refund in refunds_raw:
            ext_id = str(refund.get("id", ""))
            if not ext_id:
                continue

            existing = (await db.execute(
                select(EcommerceRefund).where(
                    EcommerceRefund.connection_id == connection.id,
                    EcommerceRefund.external_refund_id == ext_id,
                )
            )).scalar_one_or_none()

            # Sum refund line items
            amount_cents = 0
            for tx in refund.get("transactions", []):
                if tx.get("kind") == "refund" and tx.get("status") == "success":
                    amount_cents += _cents(tx.get("amount"))

            if existing:
                existing.amount_cents = amount_cents
                existing.currency = refund.get("currency", "EUR")
                continue

            new_refund = EcommerceRefund(
                connection_id=connection.id,
                administration_id=connection.administration_id,
                external_refund_id=ext_id,
                external_order_id=str(refund.get("_parent_order_id", "")),
                amount_cents=amount_cents,
                currency=refund.get("currency", "EUR"),
                reason=refund.get("note"),
                refunded_at=_parse_dt(refund.get("created_at")),
            )
            db.add(new_refund)
            imported += 1

        await db.flush()
        return imported

    # -----------------------------------------------------------------------
    # URL / header helpers
    # -----------------------------------------------------------------------

    @staticmethod
    def _build_url(shop_url: str, path: str) -> str:
        """Build Shopify Admin API URL."""
        shop = normalize_store_url(shop_url, shopify=True)
        return f"{shop}/admin/api/{SHOPIFY_API_VERSION}/{path}"

    @staticmethod
    def _headers(access_token: str) -> Dict[str, str]:
        return {
            "X-Shopify-Access-Token": access_token,
            "Content-Type": "application/json",
        }

    @staticmethod
    def _next_page_url(resp: httpx.Response) -> Optional[str]:
        """Extract next page URL from Shopify Link header pagination."""
        link_header = resp.headers.get("link", "")
        if not link_header:
            return None
        for part in link_header.split(","):
            if 'rel="next"' in part:
                url = part.split(";")[0].strip().strip("<>")
                return url
        return None


# Singleton instance
shopify_service = ShopifyService()
