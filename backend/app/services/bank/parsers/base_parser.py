"""
Base Parser Interface for Bank Statement Files

Provides abstract interface for parsing different bank statement formats
(CSV, CAMT.053, MT940, etc.) into a normalized transaction structure.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import List, Optional


@dataclass
class ParsedTransaction:
    """
    Normalized transaction data from any bank statement format.
    
    This structure provides a common format regardless of source
    (CSV, CAMT.053, MT940, PSD2 API, etc.)
    """
    booking_date: date
    amount: Decimal
    currency: str
    description: str
    counterparty_name: Optional[str] = None
    counterparty_iban: Optional[str] = None
    counterparty_bic: Optional[str] = None
    reference: Optional[str] = None
    transaction_id: Optional[str] = None  # Bank's unique identifier
    value_date: Optional[date] = None  # When funds are actually transferred
    
    def __post_init__(self):
        """Validate and normalize fields."""
        if self.counterparty_iban:
            # Normalize IBAN: remove spaces, uppercase
            self.counterparty_iban = self.counterparty_iban.replace(" ", "").upper()
        if self.counterparty_bic:
            # Normalize BIC: remove spaces, uppercase
            self.counterparty_bic = self.counterparty_bic.replace(" ", "").upper()


class BaseStatementParser(ABC):
    """
    Abstract base class for bank statement parsers.
    
    Each format (CAMT.053, MT940, CSV) should implement this interface
    to provide consistent transaction parsing across all formats.
    """
    
    @abstractmethod
    def can_parse(self, file_bytes: bytes, filename: Optional[str] = None) -> bool:
        """
        Check if this parser can handle the given file.
        
        Args:
            file_bytes: Raw file content
            filename: Optional filename for extension-based detection
            
        Returns:
            True if parser can handle this file format
        """
        pass
    
    @abstractmethod
    def parse(self, file_bytes: bytes) -> tuple[List[ParsedTransaction], Optional[str]]:
        """
        Parse bank statement file into normalized transactions.
        
        Args:
            file_bytes: Raw file content
            
        Returns:
            Tuple of (parsed_transactions, detected_account_iban)
            The account IBAN may be None if not present in the file.
            
        Raises:
            ValueError: If file format is invalid or parsing fails
        """
        pass
    
    @abstractmethod
    def get_format_name(self) -> str:
        """Return human-readable format name (e.g., 'CAMT.053', 'MT940')."""
        pass
