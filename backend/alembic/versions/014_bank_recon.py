"""Bank Statement Import and Reconciliation

Adds tables for bank statement import and reconciliation:
- bank_accounts
- bank_transactions
- reconciliation_actions

Revision ID: 014_bank_recon
Revises: 014_bank_reconciliation
Create Date: 2024-01-22 00:00:00.000000

IDEMPOTENCY NOTE:
This migration is designed to be idempotent (safe to re-run) for production
environments where a previous partial deployment may have created some objects
but failed before completion. All CREATE TYPE statements use DO blocks with
EXCEPTION handling for duplicate_object, and all CREATE TABLE/INDEX statements
use IF NOT EXISTS clauses. This prevents errors like:
  psycopg2.errors.DuplicateObject: type "banktransactionstatus" already exists
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
# Note: 014_bank_reconciliation is an empty placeholder to preserve the
# revision history for deployments stamped with that revision. This file
# carries the actual bank reconciliation schema changes.
revision: str = "014_bank_recon"
down_revision: Union[str, None] = "014_bank_reconciliation"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create enum types idempotently using DO blocks with exception handling.
    # This handles the case where a previous failed migration already created the type.
    op.execute(
        """
        DO $$
        BEGIN
            CREATE TYPE banktransactionstatus AS ENUM (
                'NEW',
                'MATCHED',
                'IGNORED',
                'NEEDS_REVIEW'
            );
        EXCEPTION WHEN duplicate_object THEN
            -- Type already exists from a previous partial migration; continue safely
            NULL;
        END $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            CREATE TYPE reconciliationactiontype AS ENUM (
                'APPLY_MATCH',
                'CREATE_EXPENSE',
                'IGNORE',
                'UNMATCH'
            );
        EXCEPTION WHEN duplicate_object THEN
            -- Type already exists from a previous partial migration; continue safely
            NULL;
        END $$;
        """
    )

    # Create bank_accounts table with IF NOT EXISTS for idempotency
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS bank_accounts (
            id UUID NOT NULL PRIMARY KEY,
            administration_id UUID NOT NULL REFERENCES administrations(id) ON DELETE CASCADE,
            iban VARCHAR(34) NOT NULL,
            bank_name VARCHAR(120),
            currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            CONSTRAINT uq_bank_accounts_admin_iban UNIQUE (administration_id, iban)
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_bank_accounts_administration_id 
        ON bank_accounts (administration_id)
        """
    )

    # Create bank_transactions table with IF NOT EXISTS for idempotency
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS bank_transactions (
            id UUID NOT NULL PRIMARY KEY,
            administration_id UUID NOT NULL REFERENCES administrations(id) ON DELETE CASCADE,
            bank_account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
            booking_date DATE NOT NULL,
            amount NUMERIC(14, 2) NOT NULL,
            currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
            counterparty_name VARCHAR(200),
            counterparty_iban VARCHAR(34),
            description TEXT NOT NULL,
            reference VARCHAR(120),
            import_hash CHAR(64) NOT NULL,
            status banktransactionstatus NOT NULL DEFAULT 'NEW',
            matched_entity_type VARCHAR(30),
            matched_entity_id UUID,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            CONSTRAINT uq_bank_transactions_admin_hash UNIQUE (administration_id, import_hash)
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_bank_transactions_administration_id 
        ON bank_transactions (administration_id)
        """
    )

    # Create reconciliation_actions table with IF NOT EXISTS for idempotency
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS reconciliation_actions (
            id UUID NOT NULL PRIMARY KEY,
            administration_id UUID NOT NULL REFERENCES administrations(id) ON DELETE CASCADE,
            accountant_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            bank_transaction_id UUID NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
            action_type reconciliationactiontype NOT NULL,
            payload JSONB,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_reconciliation_actions_administration_id 
        ON reconciliation_actions (administration_id)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_reconciliation_actions_bank_transaction_id 
        ON reconciliation_actions (bank_transaction_id)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_reconciliation_actions_accountant_user_id 
        ON reconciliation_actions (accountant_user_id)
        """
    )


def downgrade() -> None:
    # Drop in reverse order of creation, using IF EXISTS for idempotency
    op.execute("DROP INDEX IF EXISTS ix_reconciliation_actions_accountant_user_id")
    op.execute("DROP INDEX IF EXISTS ix_reconciliation_actions_bank_transaction_id")
    op.execute("DROP INDEX IF EXISTS ix_reconciliation_actions_administration_id")
    op.execute("DROP TABLE IF EXISTS reconciliation_actions")

    op.execute("DROP INDEX IF EXISTS ix_bank_transactions_administration_id")
    op.execute("DROP TABLE IF EXISTS bank_transactions")

    op.execute("DROP INDEX IF EXISTS ix_bank_accounts_administration_id")
    op.execute("DROP TABLE IF EXISTS bank_accounts")

    op.execute("DROP TYPE IF EXISTS reconciliationactiontype")
    op.execute("DROP TYPE IF EXISTS banktransactionstatus")
