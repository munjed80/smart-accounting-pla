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


# ---------------------------------------------------------------------------
# Phase 2 – Review & Mapping schemas
# ---------------------------------------------------------------------------

class MappingResponse(BaseModel):
    """Response for a single ecommerce mapping record."""
    id: UUID
    administration_id: UUID
    connection_id: UUID
    order_id: Optional[UUID] = None
    refund_id: Optional[UUID] = None
    record_type: str = "order"
    review_status: str = "new"
    provider: str
    external_ref: Optional[str] = None

    # Mapped amounts
    revenue_cents: int = 0
    tax_cents: int = 0
    shipping_cents: int = 0
    discount_cents: int = 0
    refund_cents: int = 0
    net_amount_cents: int = 0

    # VAT
    vat_rate: Optional[float] = None
    vat_amount_cents: int = 0
    vat_status: str = "auto"

    currency: str = "EUR"
    accounting_date: Optional[str] = None
    notes: Optional[str] = None

    # Posting reference
    posted_entity_type: Optional[str] = None
    posted_entity_id: Optional[UUID] = None

    # Audit
    reviewed_by: Optional[UUID] = None
    reviewed_at: Optional[datetime] = None
    approved_by: Optional[UUID] = None
    approved_at: Optional[datetime] = None
    posted_by: Optional[UUID] = None
    posted_at: Optional[datetime] = None

    created_at: datetime
    updated_at: datetime

    # Denormalized source data for display
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    total_amount_cents: int = 0
    ordered_at: Optional[datetime] = None
    external_order_number: Optional[str] = None

    class Config:
        from_attributes = True


class MappingListResponse(BaseModel):
    """Paginated list of mapping records."""
    mappings: List[MappingResponse]
    total: int
    page: int
    per_page: int
    status_counts: dict = {}


class MappingActionRequest(BaseModel):
    """Request to perform an action on a mapping."""
    action: str = Field(
        ...,
        description="Action: approve, post, skip, mark_duplicate, reset, needs_review",
    )
    notes: Optional[str] = Field(None, description="Optional notes")
    vat_rate: Optional[float] = Field(None, description="Override VAT rate")
    accounting_date: Optional[str] = Field(None, description="Override accounting date (YYYY-MM-DD)")


class BulkMappingActionRequest(BaseModel):
    """Request to perform an action on multiple mappings."""
    mapping_ids: List[UUID] = Field(..., description="List of mapping IDs to act on")
    action: str = Field(
        ...,
        description="Action: approve, post, skip, mark_duplicate, reset",
    )
    notes: Optional[str] = Field(None, description="Optional notes")


class BulkMappingActionResponse(BaseModel):
    """Response after a bulk action."""
    processed: int = 0
    skipped: int = 0
    errors: int = 0
    details: List[dict] = []


class GenerateMappingsResponse(BaseModel):
    """Response after generating mapping records from imported orders/refunds."""
    created: int = 0
    skipped_existing: int = 0
    total_orders: int = 0
    total_refunds: int = 0
