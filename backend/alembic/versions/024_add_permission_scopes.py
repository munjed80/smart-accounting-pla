"""Add permission scopes to accountant client assignments

Revision ID: 024_add_permission_scopes
Revises: 023_add_invoice_paid_at
Create Date: 2026-02-09

This migration adds a scopes column to accountant_client_assignments table
to track which modules an accountant has access to for each client.

Available scopes:
- invoices: Access to invoices
- customers: Access to customer data
- expenses: Access to expenses
- hours: Access to time tracking
- documents: Access to documents
- bookkeeping: Access to journal entries and transactions
- settings: Access to settings
- vat: Access to VAT/BTW filing
- reports: Access to financial reports

By default, all scopes are granted to maintain backward compatibility.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY


# revision identifiers, used by Alembic.
revision: str = '024_add_permission_scopes'
down_revision: Union[str, None] = '023_add_invoice_paid_at'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Default scopes for backward compatibility - all access granted
DEFAULT_SCOPES = [
    'invoices',
    'customers',
    'expenses',
    'hours',
    'documents',
    'bookkeeping',
    'settings',
    'vat',
    'reports'
]


def upgrade() -> None:
    # Add scopes column as array of strings with default of all scopes
    op.add_column(
        'accountant_client_assignments',
        sa.Column(
            'scopes',
            ARRAY(sa.String(50)),
            nullable=False,
            server_default='{' + ','.join(DEFAULT_SCOPES) + '}'
        )
    )


def downgrade() -> None:
    # Remove scopes column
    op.drop_column('accountant_client_assignments', 'scopes')
