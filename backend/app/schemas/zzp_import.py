"""
ZZP Import Schemas

Pydantic schemas for CSV import preview and confirm flows
for customers, invoices, and expenses.
"""
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel


# ============================================================================
# Shared Import Schemas
# ============================================================================

class ImportRowError(BaseModel):
    """Error for a specific row during import."""
    row: int
    field: str
    message: str


class ImportPreviewRow(BaseModel):
    """A single parsed row for preview display."""
    row_number: int
    data: dict
    errors: List[ImportRowError] = []
    valid: bool = True


# ============================================================================
# Customer Import Schemas
# ============================================================================

class CustomerImportPreviewResponse(BaseModel):
    """Preview response for customer CSV import."""
    preview_rows: List[ImportPreviewRow]
    total_rows: int
    valid_rows: int
    error_rows: int
    errors: List[ImportRowError] = []
    # Store all parsed data for confirm step
    all_rows: List[dict] = []


class CustomerImportConfirmRequest(BaseModel):
    """Confirm request for customer CSV import – re-upload CSV."""
    pass


class CustomerImportConfirmResponse(BaseModel):
    """Result of confirmed customer import."""
    imported_count: int
    skipped_count: int
    total_count: int
    errors: List[ImportRowError] = []
    message: str


# ============================================================================
# Invoice Import Schemas
# ============================================================================

class InvoiceImportPreviewResponse(BaseModel):
    """Preview response for invoice CSV import."""
    preview_rows: List[ImportPreviewRow]
    total_rows: int
    valid_rows: int
    error_rows: int
    errors: List[ImportRowError] = []
    all_rows: List[dict] = []


class InvoiceImportConfirmResponse(BaseModel):
    """Result of confirmed invoice import."""
    imported_count: int
    skipped_count: int
    total_count: int
    errors: List[ImportRowError] = []
    message: str


# ============================================================================
# Expense Import Schemas
# ============================================================================

class ExpenseImportPreviewResponse(BaseModel):
    """Preview response for expense CSV import."""
    preview_rows: List[ImportPreviewRow]
    total_rows: int
    valid_rows: int
    error_rows: int
    errors: List[ImportRowError] = []
    all_rows: List[dict] = []


class ExpenseImportConfirmResponse(BaseModel):
    """Result of confirmed expense import."""
    imported_count: int
    skipped_count: int
    total_count: int
    errors: List[ImportRowError] = []
    message: str
