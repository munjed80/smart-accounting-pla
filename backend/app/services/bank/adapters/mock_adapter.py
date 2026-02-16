"""
Mock PSD2 Adapter for Testing

Simulates a PSD2 provider without making real API calls.
Useful for development and testing.
"""
import uuid
from datetime import date, timedelta
from decimal import Decimal
from typing import List, Optional, Dict, Any

from .base_adapter import (
    BasePSD2Adapter,
    BankConnection,
    BankConnectionStatus,
    BankAccountInfo,
    PSD2Transaction,
)


class MockPSD2Adapter(BasePSD2Adapter):
    """
    Mock PSD2 adapter for testing.
    
    Returns fake but realistic data without making external API calls.
    """
    
    def __init__(self):
        # In-memory storage for mock connections
        self._connections: Dict[str, Dict[str, Any]] = {}
        self._mock_institutions = [
            {
                "id": "ING_BANK_NL",
                "name": "ING Bank",
                "country": "NL",
                "logo": "https://example.com/ing-logo.png",
            },
            {
                "id": "RABOBANK_NL",
                "name": "Rabobank",
                "country": "NL",
                "logo": "https://example.com/rabo-logo.png",
            },
            {
                "id": "ABN_AMRO_NL",
                "name": "ABN AMRO",
                "country": "NL",
                "logo": "https://example.com/abnamro-logo.png",
            },
        ]
    
    def get_provider_name(self) -> str:
        return "mock"
    
    async def get_institutions(self, country_code: str = "NL") -> List[Dict[str, str]]:
        """Return mock list of banks."""
        return [
            inst for inst in self._mock_institutions
            if inst["country"] == country_code
        ]
    
    async def initiate_consent(
        self,
        institution_id: str,
        redirect_url: str,
        user_language: str = "nl",
    ) -> Dict[str, Any]:
        """Create mock consent flow."""
        connection_id = f"mock-connection-{uuid.uuid4()}"
        
        # Store connection info
        self._connections[connection_id] = {
            "institution_id": institution_id,
            "status": BankConnectionStatus.ACTIVE,
            "created_at": date.today(),
            "consent_expires_at": date.today() + timedelta(days=90),
        }
        
        # In real implementation, this would be the bank's OAuth URL
        consent_url = f"https://mock-bank.example.com/consent?connection_id={connection_id}&redirect={redirect_url}"
        
        return {
            "connection_id": connection_id,
            "consent_url": consent_url,
        }
    
    async def get_connection_status(self, connection_id: str) -> BankConnection:
        """Get mock connection status."""
        if connection_id not in self._connections:
            raise ValueError(f"Connection not found: {connection_id}")
        
        conn_data = self._connections[connection_id]
        institution_id = conn_data["institution_id"]
        
        # Find institution name
        institution = next(
            (inst for inst in self._mock_institutions if inst["id"] == institution_id),
            None
        )
        institution_name = institution["name"] if institution else institution_id
        
        return BankConnection(
            provider_name=self.get_provider_name(),
            connection_id=connection_id,
            institution_id=institution_id,
            institution_name=institution_name,
            status=conn_data["status"],
            consent_expires_at=conn_data.get("consent_expires_at"),
            access_token=f"mock-access-token-{connection_id}",
            refresh_token=f"mock-refresh-token-{connection_id}",
        )
    
    async def get_accounts(self, connection_id: str) -> List[BankAccountInfo]:
        """Return mock bank accounts."""
        if connection_id not in self._connections:
            raise ValueError(f"Connection not found: {connection_id}")
        
        # Return 2 mock accounts
        return [
            BankAccountInfo(
                provider_account_id=f"mock-account-1-{connection_id}",
                iban="NL91ABNA0417164300",
                currency="EUR",
                account_name="Zakelijke Rekening",
                account_type="CURRENT",
                balance=Decimal("5432.10"),
                balance_date=date.today(),
            ),
            BankAccountInfo(
                provider_account_id=f"mock-account-2-{connection_id}",
                iban="NL02ABNA0123456789",
                currency="EUR",
                account_name="Spaarrekening",
                account_type="SAVINGS",
                balance=Decimal("12000.00"),
                balance_date=date.today(),
            ),
        ]
    
    async def get_transactions(
        self,
        connection_id: str,
        provider_account_id: str,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
    ) -> List[PSD2Transaction]:
        """Return mock transactions."""
        if connection_id not in self._connections:
            raise ValueError(f"Connection not found: {connection_id}")
        
        # Generate mock transactions for the last 30 days
        today = date.today()
        transactions = []
        
        # Mock transaction 1: Invoice payment
        transactions.append(PSD2Transaction(
            provider_transaction_id=f"mock-tx-1-{connection_id}",
            booking_date=today - timedelta(days=5),
            amount=Decimal("1250.00"),
            currency="EUR",
            description="Betaling factuur 2024-001",
            counterparty_name="ABC Leverancier B.V.",
            counterparty_iban="NL12RABO0123456789",
            reference="INVOICE-2024-001",
            value_date=today - timedelta(days=5),
        ))
        
        # Mock transaction 2: Client payment
        transactions.append(PSD2Transaction(
            provider_transaction_id=f"mock-tx-2-{connection_id}",
            booking_date=today - timedelta(days=3),
            amount=Decimal("850.50"),
            currency="EUR",
            description="Project XYZ invoice payment",
            counterparty_name="Client Corp N.V.",
            counterparty_iban="NL34INGB0987654321",
            reference="REF-2024-045",
            value_date=today - timedelta(days=3),
        ))
        
        # Mock transaction 3: Bank fee
        transactions.append(PSD2Transaction(
            provider_transaction_id=f"mock-tx-3-{connection_id}",
            booking_date=today - timedelta(days=1),
            amount=Decimal("-2.50"),
            currency="EUR",
            description="Bankkosten",
            reference="FEE-202402",
            value_date=today - timedelta(days=1),
        ))
        
        # Mock transaction 4: Recurring expense
        transactions.append(PSD2Transaction(
            provider_transaction_id=f"mock-tx-4-{connection_id}",
            booking_date=today - timedelta(days=10),
            amount=Decimal("-45.00"),
            currency="EUR",
            description="Microsoft 365 subscription",
            counterparty_name="Microsoft Ireland",
            counterparty_iban="IE29AIBK93115212345678",
            reference="MS-SUB-2024-02",
            value_date=today - timedelta(days=10),
        ))
        
        # Filter by date range if provided
        if date_from:
            transactions = [tx for tx in transactions if tx.booking_date >= date_from]
        if date_to:
            transactions = [tx for tx in transactions if tx.booking_date <= date_to]
        
        return transactions
    
    async def revoke_consent(self, connection_id: str) -> bool:
        """Revoke mock consent."""
        if connection_id in self._connections:
            self._connections[connection_id]["status"] = BankConnectionStatus.REVOKED
            return True
        return False
    
    async def refresh_access(self, connection_id: str, refresh_token: str) -> Dict[str, str]:
        """Refresh mock access token."""
        return {
            "access_token": f"mock-new-access-token-{connection_id}",
            "refresh_token": f"mock-new-refresh-token-{connection_id}",
        }
