"""
GoCardless Bank Account Data Integration Service

Implements PSD2/AIS bank connection via the GoCardless (formerly Nordigen)
Bank Account Data API.

API Reference: https://developer.gocardless.com/bank-account-data/overview

Flow:
  1. Backend obtains an access token from GoCardless using secret_id/secret_key
  2. User selects a bank institution (or we default to a country list)
  3. Backend creates a "requisition" → returns a link URL
  4. User redirects to bank for consent
  5. Bank redirects back to our callback URL with the requisition ID
  6. Backend fetches account details and stores connection
  7. Manual sync pulls transactions from GoCardless → creates BankTransaction records

Security:
  - GoCardless access tokens are short-lived (24h) and refreshed as needed
  - Bank account access tokens (from GoCardless) stored in bank_connections.access_token
  - Requisition IDs stored as provider_connection_id
  - No bank credentials are ever stored; only GoCardless-issued tokens
"""
import hashlib
import logging
import uuid
from datetime import datetime, date, timedelta, timezone
from decimal import Decimal
from typing import Optional, List, Dict, Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.bank import (
    BankAccount,
    BankConnectionModel,
    BankConnectionStatus,
    BankTransaction,
    BankTransactionStatus,
)

logger = logging.getLogger(__name__)

# GoCardless Bank Account Data API base URL
GOCARDLESS_BASE_URL = "https://bankaccountdata.gocardless.com/api/v2"


class GoCardlessError(Exception):
    """Error communicating with GoCardless API."""
    def __init__(self, message: str, status_code: int = 0, detail: Any = None):
        self.message = message
        self.status_code = status_code
        self.detail = detail
        super().__init__(message)


class GoCardlessService:
    """
    Service for GoCardless Bank Account Data API integration.

    Usage:
        service = GoCardlessService(db, administration_id)
        link_url = await service.create_requisition("ING_NL", redirect_url)
        # ... user authorizes at bank ...
        connection = await service.handle_callback(requisition_id)
        result = await service.sync_transactions(connection.id)
    """

    def __init__(self, db: AsyncSession, administration_id: uuid.UUID):
        self.db = db
        self.administration_id = administration_id
        self._access_token: Optional[str] = None

    # ------------------------------------------------------------------
    # GoCardless Authentication
    # ------------------------------------------------------------------

    async def _get_access_token(self) -> str:
        """
        Obtain a GoCardless API access token.

        Tokens are short-lived (24h). We request a new one each time
        since this is called infrequently (connect + sync).
        """
        if not settings.gocardless_enabled:
            raise GoCardlessError("GoCardless is niet geconfigureerd", status_code=503)

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{GOCARDLESS_BASE_URL}/token/new/",
                json={
                    "secret_id": settings.GOCARDLESS_SECRET_ID,
                    "secret_key": settings.GOCARDLESS_SECRET_KEY,
                },
            )

        if response.status_code != 200:
            logger.error("GoCardless token request failed: %s %s", response.status_code, response.text)
            raise GoCardlessError(
                "Kan geen toegangstoken verkrijgen van GoCardless",
                status_code=response.status_code,
                detail=response.text,
            )

        data = response.json()
        self._access_token = data["access"]
        return self._access_token

    async def _api_request(
        self,
        method: str,
        path: str,
        json: Optional[dict] = None,
        params: Optional[dict] = None,
    ) -> dict:
        """Make an authenticated request to the GoCardless API."""
        if not self._access_token:
            await self._get_access_token()

        url = f"{GOCARDLESS_BASE_URL}{path}"
        headers = {"Authorization": f"Bearer {self._access_token}"}

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.request(
                method, url, headers=headers, json=json, params=params
            )

        if response.status_code == 401:
            # Token expired, retry once with fresh token
            await self._get_access_token()
            headers = {"Authorization": f"Bearer {self._access_token}"}
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.request(
                    method, url, headers=headers, json=json, params=params
                )

        if response.status_code >= 400:
            logger.error("GoCardless API error: %s %s → %s", method, path, response.text)
            raise GoCardlessError(
                f"GoCardless API fout: {response.status_code}",
                status_code=response.status_code,
                detail=response.text,
            )

        return response.json()

    # ------------------------------------------------------------------
    # Institution Discovery
    # ------------------------------------------------------------------

    async def list_institutions(self, country: str = "NL") -> List[dict]:
        """
        List available bank institutions for a country.

        Returns a list of dicts with id, name, logo, etc.
        """
        data = await self._api_request("GET", "/institutions/", params={"country": country})
        return data if isinstance(data, list) else data.get("results", data)

    # ------------------------------------------------------------------
    # Requisition (Bank Connection) Flow
    # ------------------------------------------------------------------

    async def create_requisition(
        self,
        institution_id: str,
        redirect_url: str,
    ) -> dict:
        """
        Create a GoCardless requisition and return the authorization link.

        The requisition represents a request for the user to authorize
        access to their bank account.

        Returns:
            {
                "requisition_id": str,
                "link": str,  # URL to redirect user to
                "institution_name": str,
            }
        """
        # Build end-user agreement (90-day access, transactions)
        agreement_data = await self._api_request("POST", "/agreements/enduser/", json={
            "institution_id": institution_id,
            "max_historical_days": 90,
            "access_valid_for_days": 90,
            "access_scope": ["balances", "details", "transactions"],
        })
        agreement_id = agreement_data["id"]

        # Create requisition
        requisition_data = await self._api_request("POST", "/requisitions/", json={
            "redirect": redirect_url,
            "institution_id": institution_id,
            "agreement": agreement_id,
            "user_language": "NL",
        })

        requisition_id = requisition_data["id"]
        link = requisition_data["link"]

        # Look up institution name
        institution_name = institution_id
        try:
            inst_data = await self._api_request("GET", f"/institutions/{institution_id}/")
            institution_name = inst_data.get("name", institution_id)
        except GoCardlessError:
            pass

        # Create PENDING connection record
        connection = BankConnectionModel(
            administration_id=self.administration_id,
            provider_name="gocardless",
            provider_connection_id=requisition_id,
            institution_id=institution_id,
            institution_name=institution_name,
            status=BankConnectionStatus.PENDING,
            consent_expires_at=datetime.now(timezone.utc) + timedelta(days=90),
            connection_metadata={
                "agreement_id": agreement_id,
            },
        )
        self.db.add(connection)
        await self.db.commit()
        await self.db.refresh(connection)

        return {
            "requisition_id": requisition_id,
            "link": link,
            "institution_name": institution_name,
            "connection_id": str(connection.id),
        }

    async def handle_callback(self, requisition_id: str) -> BankConnectionModel:
        """
        Handle the callback after user authorizes at bank.

        Fetches the requisition status and linked account IDs from GoCardless,
        creates/links a BankAccount, and activates the connection.
        """
        # Find our connection record
        result = await self.db.execute(
            select(BankConnectionModel).where(
                BankConnectionModel.administration_id == self.administration_id,
                BankConnectionModel.provider_connection_id == requisition_id,
                BankConnectionModel.provider_name == "gocardless",
            )
        )
        connection = result.scalar_one_or_none()

        if not connection:
            raise GoCardlessError("Bankkoppeling niet gevonden", status_code=404)

        # Get requisition details from GoCardless
        req_data = await self._api_request("GET", f"/requisitions/{requisition_id}/")

        gc_status = req_data.get("status", "").upper()
        accounts = req_data.get("accounts", [])

        if gc_status not in ("LN", "CR"):
            # Not linked — user may have cancelled
            connection.status = BankConnectionStatus.ERROR
            connection.connection_metadata = {
                **(connection.connection_metadata or {}),
                "gc_status": gc_status,
                "gc_status_detail": req_data.get("status", "unknown"),
            }
            await self.db.commit()
            await self.db.refresh(connection)
            raise GoCardlessError(
                f"Bankverificatie niet voltooid (status: {gc_status})",
                status_code=400,
            )

        if not accounts:
            connection.status = BankConnectionStatus.ERROR
            await self.db.commit()
            raise GoCardlessError("Geen bankrekeningen gevonden na autorisatie", status_code=400)

        # Use the first account
        gc_account_id = accounts[0]

        # Get account details (IBAN, owner name)
        account_details = await self._api_request("GET", f"/accounts/{gc_account_id}/details/")
        account_data = account_details.get("account", {})
        iban = account_data.get("iban", "")
        owner_name = account_data.get("ownerName", "")

        # Create or link BankAccount
        if iban:
            normalized_iban = iban.replace(" ", "").upper()
            ba_result = await self.db.execute(
                select(BankAccount).where(
                    BankAccount.administration_id == self.administration_id,
                    BankAccount.iban == normalized_iban,
                )
            )
            bank_account = ba_result.scalar_one_or_none()

            if not bank_account:
                bank_account = BankAccount(
                    administration_id=self.administration_id,
                    iban=normalized_iban,
                    bank_name=connection.institution_name,
                    currency=account_data.get("currency", "EUR"),
                )
                self.db.add(bank_account)
                await self.db.flush()

            connection.bank_account_id = bank_account.id

        # Activate connection
        connection.status = BankConnectionStatus.ACTIVE
        connection.access_token = gc_account_id  # GoCardless account ID used for fetching
        connection.connection_metadata = {
            **(connection.connection_metadata or {}),
            "gc_status": gc_status,
            "gc_account_id": gc_account_id,
            "iban": iban,
            "owner_name": owner_name,
            "all_accounts": accounts,
        }

        await self.db.commit()
        await self.db.refresh(connection)
        return connection

    # ------------------------------------------------------------------
    # Transaction Sync
    # ------------------------------------------------------------------

    async def sync_transactions(
        self,
        connection_id: uuid.UUID,
        date_from: Optional[date] = None,
    ) -> dict:
        """
        Pull transactions from GoCardless and create BankTransaction records.

        Uses idempotent import hashing to avoid duplicates.

        Returns:
            {
                "imported_count": int,
                "skipped_count": int,
                "total_fetched": int,
            }
        """
        # Get connection
        result = await self.db.execute(
            select(BankConnectionModel).where(
                BankConnectionModel.id == connection_id,
                BankConnectionModel.administration_id == self.administration_id,
            )
        )
        connection = result.scalar_one_or_none()

        if not connection:
            raise GoCardlessError("Bankkoppeling niet gevonden", status_code=404)

        if connection.status != BankConnectionStatus.ACTIVE:
            raise GoCardlessError(
                f"Bankkoppeling is niet actief (status: {connection.status.value})",
                status_code=400,
            )

        gc_account_id = connection.access_token
        if not gc_account_id:
            raise GoCardlessError("Geen GoCardless account ID beschikbaar", status_code=400)

        # Determine date range
        if not date_from:
            if connection.last_sync_at:
                date_from = connection.last_sync_at.date() - timedelta(days=2)  # Overlap for safety
            else:
                date_from = date.today() - timedelta(days=90)

        # Fetch transactions from GoCardless
        params: Dict[str, str] = {"date_from": date_from.isoformat()}
        try:
            tx_data = await self._api_request(
                "GET",
                f"/accounts/{gc_account_id}/transactions/",
                params=params,
            )
        except GoCardlessError as e:
            if e.status_code == 409:
                # Consent expired
                connection.status = BankConnectionStatus.EXPIRED
                await self.db.commit()
                raise GoCardlessError("Banktoegang is verlopen. Koppel je bank opnieuw.", status_code=409)
            raise

        # Parse booked transactions
        booked = tx_data.get("transactions", {}).get("booked", [])
        if not booked:
            connection.last_sync_at = datetime.now(timezone.utc)
            await self.db.commit()
            return {"imported_count": 0, "skipped_count": 0, "total_fetched": 0}

        # Get existing hashes for duplicate detection
        existing_hashes_result = await self.db.execute(
            select(BankTransaction.import_hash).where(
                BankTransaction.administration_id == self.administration_id,
            )
        )
        existing_hashes = set(row[0] for row in existing_hashes_result.fetchall())

        imported = 0
        skipped = 0

        for tx in booked:
            # Parse GoCardless transaction format
            booking_date_str = tx.get("bookingDate") or tx.get("valueDate", "")
            if not booking_date_str:
                continue

            try:
                booking_date_parsed = date.fromisoformat(booking_date_str)
            except ValueError:
                continue

            # Amount
            amount_data = tx.get("transactionAmount", {})
            try:
                amount = Decimal(str(amount_data.get("amount", "0")))
            except Exception:
                continue

            # Description — combine available info
            remittance = tx.get("remittanceInformationUnstructured", "")
            remittance_array = tx.get("remittanceInformationUnstructuredArray", [])
            additional_info = tx.get("additionalInformation", "")
            description = remittance or " ".join(remittance_array) or additional_info or "Geen omschrijving"

            # Counterparty
            creditor = tx.get("creditorName", "")
            debtor = tx.get("debtorName", "")
            counterparty_name = creditor or debtor or None

            creditor_account = tx.get("creditorAccount", {})
            debtor_account = tx.get("debtorAccount", {})
            counterparty_iban = (
                creditor_account.get("iban")
                or debtor_account.get("iban")
                or None
            )

            # Reference
            reference = tx.get("entryReference") or tx.get("transactionId") or None

            # Compute idempotency hash
            hash_parts = [
                str(self.administration_id),
                booking_date_parsed.isoformat(),
                f"{amount:.2f}",
                description.strip(),
                (reference or "").strip(),
                (counterparty_iban or "").strip(),
            ]
            import_hash = hashlib.sha256("|".join(hash_parts).encode("utf-8")).hexdigest()

            if import_hash in existing_hashes:
                skipped += 1
                continue

            # Create transaction
            bank_tx = BankTransaction(
                administration_id=self.administration_id,
                bank_account_id=connection.bank_account_id,
                booking_date=booking_date_parsed,
                amount=amount,
                currency=amount_data.get("currency", "EUR"),
                counterparty_name=counterparty_name,
                counterparty_iban=counterparty_iban,
                description=description,
                reference=reference,
                import_hash=import_hash,
                status=BankTransactionStatus.NEW,
            )
            self.db.add(bank_tx)
            existing_hashes.add(import_hash)
            imported += 1

        # Update last sync timestamp
        connection.last_sync_at = datetime.now(timezone.utc)
        await self.db.commit()

        logger.info(
            "GoCardless sync complete for connection %s: imported=%d, skipped=%d, total=%d",
            connection_id, imported, skipped, len(booked),
        )

        return {
            "imported_count": imported,
            "skipped_count": skipped,
            "total_fetched": len(booked),
        }

    # ------------------------------------------------------------------
    # Connection Status
    # ------------------------------------------------------------------

    async def get_connection_status(self) -> Optional[dict]:
        """
        Get the current PSD2 connection status for this administration.

        Returns None if no connection exists.
        """
        result = await self.db.execute(
            select(BankConnectionModel).where(
                BankConnectionModel.administration_id == self.administration_id,
                BankConnectionModel.provider_name == "gocardless",
            ).order_by(BankConnectionModel.created_at.desc()).limit(1)
        )
        connection = result.scalar_one_or_none()

        if not connection:
            return None

        return {
            "id": str(connection.id),
            "institution_name": connection.institution_name,
            "institution_id": connection.institution_id,
            "status": connection.status.value,
            "last_sync_at": connection.last_sync_at.isoformat() if connection.last_sync_at else None,
            "consent_expires_at": connection.consent_expires_at.isoformat() if connection.consent_expires_at else None,
            "iban": (connection.connection_metadata or {}).get("iban"),
            "created_at": connection.created_at.isoformat(),
        }
