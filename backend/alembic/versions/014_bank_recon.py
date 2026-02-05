"""Bank Statement Import and Reconciliation

Adds tables for bank statement import and reconciliation:
- bank_accounts
- bank_transactions
- reconciliation_actions

Revision ID: 014_bank_recon
Revises: 014_bank_reconciliation
Create Date: 2024-01-22 00:00:00.000000
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
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'banktransactionstatus') THEN
                CREATE TYPE banktransactionstatus AS ENUM (
                    'NEW',
                    'MATCHED',
                    'IGNORED',
                    'NEEDS_REVIEW'
                );
            END IF;
        END
        $$;
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reconciliationactiontype') THEN
                CREATE TYPE reconciliationactiontype AS ENUM (
                    'APPLY_MATCH',
                    'CREATE_EXPENSE',
                    'IGNORE',
                    'UNMATCH'
                );
            END IF;
        END
        $$;
        """
    )

    if not inspector.has_table("bank_accounts"):
        op.create_table(
            "bank_accounts",
            sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("administration_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("iban", sa.String(34), nullable=False),
            sa.Column("bank_name", sa.String(120), nullable=True),
            sa.Column("currency", sa.String(3), server_default="EUR", nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.ForeignKeyConstraint(["administration_id"], ["administrations.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("administration_id", "iban", name="uq_bank_accounts_admin_iban"),
        )
    op.create_index("ix_bank_accounts_administration_id", "bank_accounts", ["administration_id"], checkfirst=True)

    if not inspector.has_table("bank_transactions"):
        op.create_table(
            "bank_transactions",
            sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("administration_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("bank_account_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("booking_date", sa.Date(), nullable=False),
            sa.Column("amount", sa.Numeric(14, 2), nullable=False),
            sa.Column("currency", sa.String(3), server_default="EUR", nullable=False),
            sa.Column("counterparty_name", sa.String(200), nullable=True),
            sa.Column("counterparty_iban", sa.String(34), nullable=True),
            sa.Column("description", sa.Text(), nullable=False),
            sa.Column("reference", sa.String(120), nullable=True),
            sa.Column("import_hash", sa.CHAR(64), nullable=False),
            sa.Column(
                "status",
                postgresql.ENUM(
                    "NEW",
                    "MATCHED",
                    "IGNORED",
                    "NEEDS_REVIEW",
                    name="banktransactionstatus",
                    create_type=False,
                ),
                server_default="NEW",
                nullable=False,
            ),
            sa.Column("matched_entity_type", sa.String(30), nullable=True),
            sa.Column("matched_entity_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.ForeignKeyConstraint(["administration_id"], ["administrations.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["bank_account_id"], ["bank_accounts.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("administration_id", "import_hash", name="uq_bank_transactions_admin_hash"),
        )
    op.create_index(
        "ix_bank_transactions_administration_id",
        "bank_transactions",
        ["administration_id"],
        checkfirst=True,
    )

    if not inspector.has_table("reconciliation_actions"):
        op.create_table(
            "reconciliation_actions",
            sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("administration_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("accountant_user_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("bank_transaction_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column(
                "action_type",
                postgresql.ENUM(
                    "APPLY_MATCH",
                    "CREATE_EXPENSE",
                    "IGNORE",
                    "UNMATCH",
                    name="reconciliationactiontype",
                    create_type=False,
                ),
                nullable=False,
            ),
            sa.Column("payload", postgresql.JSONB(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.ForeignKeyConstraint(["administration_id"], ["administrations.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["accountant_user_id"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["bank_transaction_id"], ["bank_transactions.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
    op.create_index(
        "ix_reconciliation_actions_administration_id",
        "reconciliation_actions",
        ["administration_id"],
        checkfirst=True,
    )
    op.create_index(
        "ix_reconciliation_actions_bank_transaction_id",
        "reconciliation_actions",
        ["bank_transaction_id"],
        checkfirst=True,
    )
    op.create_index(
        "ix_reconciliation_actions_accountant_user_id",
        "reconciliation_actions",
        ["accountant_user_id"],
        checkfirst=True,
    )


def downgrade() -> None:
    op.drop_index("ix_reconciliation_actions_accountant_user_id", table_name="reconciliation_actions")
    op.drop_index("ix_reconciliation_actions_bank_transaction_id", table_name="reconciliation_actions")
    op.drop_index("ix_reconciliation_actions_administration_id", table_name="reconciliation_actions")
    op.drop_table("reconciliation_actions")

    op.drop_index("ix_bank_transactions_administration_id", table_name="bank_transactions")
    op.drop_table("bank_transactions")

    op.drop_index("ix_bank_accounts_administration_id", table_name="bank_accounts")
    op.drop_table("bank_accounts")

    op.execute("DROP TYPE reconciliationactiontype")
    op.execute("DROP TYPE banktransactionstatus")
