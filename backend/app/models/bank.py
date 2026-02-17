"""
Bank Reconciliation Models

Models for bank statement import and transaction reconciliation:
- BankAccount: Bank account details per administration
- BankTransaction: Imported bank transactions with matching status
- ReconciliationAction: Audit trail for reconciliation decisions
- BankConnectionModel: PSD2/AIS provider connections
- BankMatchProposal: Persistent matching proposals with confidence scores
"""
import uuid
from datetime import datetime, date
from decimal import Decimal
from sqlalchemy import String, DateTime, Date, func, ForeignKey, Text, Numeric, Enum as SQLEnum, Boolean, Integer
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
import sqlalchemy as sa
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
    psd2_connections = relationship("BankConnectionModel", back_populates="bank_account", cascade="all, delete-orphan")



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
    match_proposals = relationship("BankMatchProposal", back_populates="bank_transaction", cascade="all, delete-orphan")
    splits = relationship("BankTransactionSplit", back_populates="bank_transaction", cascade="all, delete-orphan")



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


class BankConnectionStatus(str, enum.Enum):
    """Status of PSD2/AIS bank connection."""
    ACTIVE = "ACTIVE"              # Connection is active and can fetch data
    EXPIRED = "EXPIRED"            # Consent expired, needs re-authentication
    PENDING = "PENDING"            # Awaiting user consent
    ERROR = "ERROR"                # Connection error
    REVOKED = "REVOKED"            # User revoked consent


class BankConnectionModel(Base):
    """
    PSD2/AIS Bank Connection
    
    Stores credentials and connection details for fetching transactions
    via PSD2 APIs (e.g., Nordigen, TrueLayer).
    """
    __tablename__ = "bank_connections"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("administrations.id", ondelete="CASCADE"), nullable=False
    )
    bank_account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bank_accounts.id", ondelete="CASCADE"), nullable=True
    )
    
    # Provider information
    provider_name: Mapped[str] = mapped_column(String(50), nullable=False)  # e.g., 'nordigen', 'truelayer'
    provider_connection_id: Mapped[str] = mapped_column(String(200), nullable=False)  # Provider's connection/requisition ID
    institution_id: Mapped[str] = mapped_column(String(100), nullable=False)  # Bank identifier
    institution_name: Mapped[str] = mapped_column(String(200), nullable=False)  # Human-readable bank name
    
    # Connection status
    status: Mapped[BankConnectionStatus] = mapped_column(
        SQLEnum(BankConnectionStatus), default=BankConnectionStatus.PENDING, nullable=False
    )
    consent_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Encrypted credentials (access and refresh tokens)
    # In production, these should be encrypted at rest
    access_token: Mapped[str] = mapped_column(Text, nullable=True)
    refresh_token: Mapped[str] = mapped_column(Text, nullable=True)
    
    # Additional connection metadata
    connection_metadata: Mapped[dict] = mapped_column(JSONB, nullable=True)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    last_sync_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    administration = relationship("Administration", back_populates="bank_connections")
    bank_account = relationship("BankAccount", back_populates="psd2_connections")


class MatchRuleType(str, enum.Enum):
    """Types of matching rules."""
    INVOICE_NUMBER = "INVOICE_NUMBER"      # Match by invoice number in description
    AMOUNT_EXACT = "AMOUNT_EXACT"          # Exact amount match
    AMOUNT_TOLERANCE = "AMOUNT_TOLERANCE"  # Amount match with tolerance
    IBAN_RECURRING = "IBAN_RECURRING"      # Recurring payment from same IBAN
    DATE_PROXIMITY = "DATE_PROXIMITY"      # Date within N days
    COMBINED = "COMBINED"                  # Multiple rules combined


class ProposalStatus(str, enum.Enum):
    """Status of a match proposal."""
    SUGGESTED = "suggested"      # Newly generated proposal
    ACCEPTED = "accepted"        # User accepted the proposal
    REJECTED = "rejected"        # User rejected the proposal
    EXPIRED = "expired"          # Proposal is outdated/superseded


class BankMatchProposal(Base):
    """
    Persistent matching proposals for bank transactions.
    
    Stores suggested matches generated by the matching engine,
    with confidence scores and reasoning.
    """
    __tablename__ = "bank_match_proposals"
    __table_args__ = (
        sa.CheckConstraint('confidence_score >= 0 AND confidence_score <= 100', name='check_confidence_score_range'),
    )
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    administration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("administrations.id", ondelete="CASCADE"), nullable=False
    )
    bank_transaction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bank_transactions.id", ondelete="CASCADE"), nullable=False
    )
    
    # Match target
    entity_type: Mapped[str] = mapped_column(String(30), nullable=False)  # INVOICE, EXPENSE, TRANSFER, MANUAL
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    
    # Confidence and reasoning
    confidence_score: Mapped[int] = mapped_column(sa.Integer, nullable=False)  # 0-100
    reason: Mapped[str] = mapped_column(String(255), nullable=False)
    
    # Match details
    matched_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=True)
    matched_date: Mapped[date] = mapped_column(Date, nullable=True)
    matched_reference: Mapped[str] = mapped_column(String(200), nullable=True)
    
    # Matching rule that generated this proposal
    rule_type: Mapped[str] = mapped_column(String(50), nullable=True)
    rule_config: Mapped[dict] = mapped_column(JSONB, nullable=True)
    
    # Status
    is_applied: Mapped[bool] = mapped_column(sa.Boolean, default=False, nullable=False)
    is_dismissed: Mapped[bool] = mapped_column(sa.Boolean, default=False, nullable=False)
    status: Mapped[ProposalStatus] = mapped_column(
        SQLEnum(ProposalStatus), default=ProposalStatus.SUGGESTED, nullable=False
    )
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    
    # Relationships
    administration = relationship("Administration", back_populates="bank_match_proposals")
    bank_transaction = relationship("BankTransaction", back_populates="match_proposals")


class BankMatchRule(Base):
    """
    Bank matching rules for intelligent transaction matching.
    
    Supports both manual rules created by accountants and learned rules
    from accepted matches. Rules can auto-accept matches or boost confidence.
    """
    __tablename__ = "bank_match_rules"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("administrations.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    
    # Conditions (JSONB for flexibility)
    # Example: {"iban":"NL...","contains":"ADYEN","min_amount":10,"max_amount":500}
    conditions: Mapped[dict] = mapped_column(JSONB, nullable=False)
    
    # Action (JSONB for flexibility)
    # Example: {"auto_accept":true,"target_type":"expense","expense_category_id":"..."}
    action: Mapped[dict] = mapped_column(JSONB, nullable=False)
    
    # Audit fields
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    
    # Relationships
    administration = relationship("Administration", back_populates="bank_match_rules")


class BankTransactionSplit(Base):
    """
    Split transaction for partial matching.
    
    Allows a single bank transaction to be matched to multiple targets.
    The sum of all splits must equal the original transaction amount.
    """
    __tablename__ = "bank_transaction_splits"
    
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("administrations.id", ondelete="CASCADE"), nullable=False
    )
    transaction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bank_transactions.id", ondelete="CASCADE"), nullable=False
    )
    split_index: Mapped[int] = mapped_column(Integer, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    
    # Relationships
    administration = relationship("Administration", back_populates="bank_transaction_splits")
    bank_transaction = relationship("BankTransaction", back_populates="splits")


