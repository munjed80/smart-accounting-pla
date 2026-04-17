"""
E-commerce Integration Schemas

Pydantic models for e-commerce integration API request/response validation.
"""
from datetime import datetime
from typing import Optional, List
from uuid import UUID

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Connection schemas
# ---------------------------------------------------------------------------

class ConnectShopifyRequest(BaseModel):
    """Request to connect a Shopify store."""
    shop_url: str = Field(..., description="Shopify store URL (e.g. mystore.myshopify.com)")
    access_token: str = Field(..., description="Shopify Admin API access token from a custom app")
    shop_name: Optional[str] = Field(None, description="Display name for the connection")


class ConnectWooCommerceRequest(BaseModel):
    """Request to connect a WooCommerce store."""
    shop_url: str = Field(..., description="WooCommerce store URL (e.g. https://mystore.com)")
    consumer_key: str = Field(..., description="WooCommerce REST API consumer key")
    consumer_secret: str = Field(..., description="WooCommerce REST API consumer secret")
    shop_name: Optional[str] = Field(None, description="Display name for the connection")


class ConnectionResponse(BaseModel):
    """Response with connection details."""
    id: UUID
    provider: str
    status: str
    shop_name: Optional[str] = None
    shop_url: Optional[str] = None
    last_sync_at: Optional[datetime] = None
    last_sync_error: Optional[str] = None
    last_sync_orders_count: int = 0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ConnectionListResponse(BaseModel):
    """Response listing all connections for an administration."""
    connections: List[ConnectionResponse]


# ---------------------------------------------------------------------------
# Order schemas
# ---------------------------------------------------------------------------

class OrderResponse(BaseModel):
    """Imported e-commerce order."""
    id: UUID
    connection_id: UUID
    provider: Optional[str] = None
    external_order_id: str
    external_order_number: Optional[str] = None
    status: str
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    currency: str = "EUR"
    total_amount_cents: int = 0
    subtotal_cents: int = 0
    tax_cents: int = 0
    shipping_cents: int = 0
    discount_cents: int = 0
    ordered_at: Optional[datetime] = None
    paid_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class OrderListResponse(BaseModel):
    """Paginated list of imported orders."""
    orders: List[OrderResponse]
    total: int
    page: int
    per_page: int


# ---------------------------------------------------------------------------
# Customer schemas
# ---------------------------------------------------------------------------

class CustomerResponse(BaseModel):
    """Imported e-commerce customer."""
    id: UUID
    connection_id: UUID
    external_customer_id: str
    email: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    company: Optional[str] = None
    phone: Optional[str] = None
    total_orders: int = 0
    total_spent_cents: int = 0
    currency: str = "EUR"
    created_at: datetime

    class Config:
        from_attributes = True


class CustomerListResponse(BaseModel):
    """List of imported customers."""
    customers: List[CustomerResponse]
    total: int


# ---------------------------------------------------------------------------
# Refund schemas
# ---------------------------------------------------------------------------

class RefundResponse(BaseModel):
    """Imported e-commerce refund."""
    id: UUID
    connection_id: UUID
    external_refund_id: str
    external_order_id: Optional[str] = None
    amount_cents: int = 0
    currency: str = "EUR"
    reason: Optional[str] = None
    refunded_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class RefundListResponse(BaseModel):
    """List of imported refunds."""
    refunds: List[RefundResponse]
    total: int


# ---------------------------------------------------------------------------
# Sync log schemas
# ---------------------------------------------------------------------------

class SyncLogResponse(BaseModel):
    """Sync operation log entry."""
    id: UUID
    connection_id: UUID
    status: str
    trigger: str = "manual"
    orders_imported: int = 0
    orders_updated: int = 0
    customers_imported: int = 0
    refunds_imported: int = 0
    error_message: Optional[str] = None
    duration_ms: Optional[int] = None
    started_at: datetime
    finished_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SyncLogListResponse(BaseModel):
    """List of sync log entries."""
    logs: List[SyncLogResponse]
    total: int


# ---------------------------------------------------------------------------
# Sync trigger
# ---------------------------------------------------------------------------

class SyncTriggerResponse(BaseModel):
    """Response after triggering a sync."""
    message: str
    sync_log_id: UUID
    status: str
    orders_imported: int = 0
    orders_updated: int = 0
    customers_imported: int = 0
    refunds_imported: int = 0
    error: Optional[str] = None
