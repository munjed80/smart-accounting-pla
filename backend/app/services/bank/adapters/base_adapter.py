"""
Base PSD2/AIS Adapter Interface

Provides pluggable interface for connecting to different PSD2 providers
(e.g., Nordigen, TrueLayer, Plaid, etc.) to fetch bank transactions via API.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import List, Optional, Dict, Any
from enum import Enum


class BankConnectionStatus(str, Enum):
    """Status of a bank connection."""
    ACTIVE = "ACTIVE"              # Connection is active and can fetch data
    EXPIRED = "EXPIRED"            # Consent expired, needs re-authentication
    PENDING = "PENDING"            # Awaiting user consent
    ERROR = "ERROR"                # Connection error
    REVOKED = "REVOKED"            # User revoked consent


@dataclass
class BankConnection:
    """
    Represents a connection to a bank via PSD2/AIS.
    
    This is the result of a successful OAuth flow or consent process.
    """
    provider_name: str              # e.g., "nordigen", "truelayer"
    connection_id: str              # Provider's connection/requisition ID
    institution_id: str             # Bank identifier (e.g., "ING_BANK_NL")
    institution_name: str           # Human-readable bank name
    status: BankConnectionStatus
    consent_expires_at: Optional[date] = None
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    connection_metadata: Dict[str, Any] = None  # Provider-specific metadata


@dataclass
class BankAccountInfo:
    """
    Bank account information from PSD2 API.
    """
    provider_account_id: str        # Provider's account ID
    iban: str
    currency: str
    account_name: Optional[str] = None
    account_type: Optional[str] = None  # e.g., "CURRENT", "SAVINGS"
    balance: Optional[Decimal] = None
    balance_date: Optional[date] = None


@dataclass
class PSD2Transaction:
    """
    Transaction fetched from PSD2 API.
    
    This is similar to ParsedTransaction but includes provider-specific fields.
    """
    provider_transaction_id: str
    booking_date: date
    amount: Decimal
    currency: str
    description: str
    counterparty_name: Optional[str] = None
    counterparty_iban: Optional[str] = None
    counterparty_bic: Optional[str] = None
    reference: Optional[str] = None
    value_date: Optional[date] = None
    transaction_code: Optional[str] = None
    raw_data: Optional[Dict[str, Any]] = None  # Full API response for debugging


class BasePSD2Adapter(ABC):
    """
    Abstract base class for PSD2/AIS providers.
    
    Implement this interface for each provider (Nordigen, TrueLayer, etc.)
    to enable pluggable bank connectivity.
    """
    
    @abstractmethod
    def get_provider_name(self) -> str:
        """Return provider name (e.g., 'nordigen', 'truelayer')."""
        pass
    
    @abstractmethod
    async def get_institutions(self, country_code: str = "NL") -> List[Dict[str, str]]:
        """
        Get list of supported banks/institutions.
        
        Args:
            country_code: ISO 3166-1 alpha-2 country code
            
        Returns:
            List of institutions with id, name, logo, etc.
        """
        pass
    
    @abstractmethod
    async def initiate_consent(
        self,
        institution_id: str,
        redirect_url: str,
        user_language: str = "nl",
    ) -> Dict[str, Any]:
        """
        Initiate bank consent/authentication flow.
        
        Args:
            institution_id: Bank institution ID from get_institutions()
            redirect_url: URL to redirect after consent
            user_language: User's preferred language
            
        Returns:
            Dict with 'consent_url' (where to redirect user) and 'connection_id'
        """
        pass
    
    @abstractmethod
    async def get_connection_status(self, connection_id: str) -> BankConnection:
        """
        Get current status of a bank connection.
        
        Args:
            connection_id: Connection/requisition ID from initiate_consent()
            
        Returns:
            BankConnection with current status
        """
        pass
    
    @abstractmethod
    async def get_accounts(self, connection_id: str) -> List[BankAccountInfo]:
        """
        Get list of accounts for a connection.
        
        Args:
            connection_id: Connection/requisition ID
            
        Returns:
            List of bank accounts accessible via this connection
        """
        pass
    
    @abstractmethod
    async def get_transactions(
        self,
        connection_id: str,
        provider_account_id: str,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
    ) -> List[PSD2Transaction]:
        """
        Fetch transactions for an account.
        
        Args:
            connection_id: Connection/requisition ID
            provider_account_id: Account ID from get_accounts()
            date_from: Start date (inclusive)
            date_to: End date (inclusive)
            
        Returns:
            List of transactions
        """
        pass
    
    @abstractmethod
    async def revoke_consent(self, connection_id: str) -> bool:
        """
        Revoke user consent and terminate connection.
        
        Args:
            connection_id: Connection/requisition ID
            
        Returns:
            True if successfully revoked
        """
        pass
    
    @abstractmethod
    async def refresh_access(self, connection_id: str, refresh_token: str) -> Dict[str, str]:
        """
        Refresh access token if provider supports token refresh.
        
        Args:
            connection_id: Connection/requisition ID
            refresh_token: Refresh token
            
        Returns:
            Dict with new 'access_token' and optionally 'refresh_token'
        """
        pass
