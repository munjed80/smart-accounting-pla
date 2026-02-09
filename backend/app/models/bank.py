"""
Bank Reconciliation Models

Models for bank statement import and transaction reconciliation:
- BankAccount: Bank account details per administration
- BankTransaction: Imported bank transactions with matching status
- ReconciliationAction: Audit trail for reconciliation decisions
"""
import uuid
from datetime import datetime, date
from decimal import Decimal
from sqlalchemy import String, DateTime, Date, func, ForeignKey, Text, Numeric, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from app.core.database import Base


class BankTransactionStatus(str, enum.Enum):
    """Status of a bank transaction in the reconciliation process."""
    NEW = "NEW"                    # Just imported, not yet processed
    MATCHED = "MATCHED"            # Matched to an invoice or expense
    IGNORED = "IGNORED"            # Manually ignored (e.g., internal transfers)
    NEEDS_REVIEW = "NEEDS_REVIEW"  # Flagged for accountant review


class ReconciliationActionType(str, enum.Enum):
    """Types of actions that can be taken during reconciliation."""
    APPLY_MATCH = "APPLY_MATCH"      # Apply a suggested match
    CREATE_EXPENSE = "CREATE_EXPENSE"  # Create a new expense entry
    IGNORE = "IGNORE"                # Ignore this transaction
    UNMATCH = "UNMATCH"              # Undo a previous match


class BankAccount(Base):
    """
    Bank account associated with an administration.
    
    Tracks IBAN and bank name for organizing imported transactions.
    """
    __tablename__ = "bank_accounts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("administrations.id", ondelete="CASCADE"), nullable=False
    )
    iban: Mapped[str] = mapped_column(String(34), nullable=False)
    bank_name: Mapped[str] = mapped_column(String(120), nullable=True)
    currency: Mapped[str] = mapped_column(String(3), default="EUR", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    administration = relationship("Administration", back_populates="bank_accounts")
    transactions = relationship("BankTransaction", back_populates="bank_account", cascade="all, delete-orphan")


class BankTransaction(Base):
    """
    Imported bank transaction for reconciliation.
    
    Each transaction has an import_hash for idempotent imports:
    hash = SHA256(administration_id + booking_date + amount + description + reference + counterparty_iban)
    """
    __tablename__ = "bank_transactions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("administrations.id", ondelete="CASCADE"), nullable=False
    )
    bank_account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bank_accounts.id", ondelete="CASCADE"), nullable=False
    )
    booking_date: Mapped[date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)  # Positive = credit, Negative = debit
    currency: Mapped[str] = mapped_column(String(3), default="EUR", nullable=False)
    counterparty_name: Mapped[str] = mapped_column(String(200), nullable=True)
    counterparty_iban: Mapped[str] = mapped_column(String(34), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    reference: Mapped[str] = mapped_column(String(120), nullable=True)
    import_hash: Mapped[str] = mapped_column(String(64), nullable=False)  # SHA256 hash
    status: Mapped[BankTransactionStatus] = mapped_column(
        SQLEnum(BankTransactionStatus), default=BankTransactionStatus.NEW, nullable=False
    )
    matched_entity_type: Mapped[str] = mapped_column(String(30), nullable=True)
    matched_entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    administration = relationship("Administration", back_populates="bank_transactions")
    bank_account = relationship("BankAccount", back_populates="transactions")
    reconciliation_actions = relationship("ReconciliationAction", back_populates="bank_transaction", cascade="all, delete-orphan")


class ReconciliationAction(Base):
    """
    Audit trail for reconciliation decisions.
    
    Records every action taken on a bank transaction, including:
    - Who made the decision
    - What action was taken
    - Any associated payload (e.g., VAT code, ledger account)
    """
    __tablename__ = "reconciliation_actions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("administrations.id", ondelete="CASCADE"), nullable=False
    )
    accountant_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    bank_transaction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bank_transactions.id", ondelete="CASCADE"), nullable=False
    )
    action_type: Mapped[ReconciliationActionType] = mapped_column(
        SQLEnum(ReconciliationActionType), nullable=False
    )
    payload: Mapped[dict] = mapped_column(JSONB, nullable=True)  # Extra data: entity_id, vat_code, ledger_code, notes
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Relationships
    bank_transaction = relationship("BankTransaction", back_populates="reconciliation_actions")
    administration = relationship("Administration", back_populates="reconciliation_actions")
    accountant = relationship("User", back_populates="reconciliation_actions")
