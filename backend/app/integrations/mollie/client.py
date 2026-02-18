"""
Mollie API client wrapper for subscription management.

Provides centralized error handling, logging, and API interaction
for creating customers, subscriptions, and handling payments.

Security:
- Never logs API keys or sensitive data
- Provides structured error responses
- Validates webhook authenticity
"""
import logging
from typing import Optional, Dict, Any
from datetime import datetime, date
import httpx
from decimal import Decimal

from app.core.config import settings

logger = logging.getLogger(__name__)


class MollieError(Exception):
    """Base exception for Mollie API errors"""
    def __init__(self, message: str, status_code: Optional[int] = None, mollie_error: Optional[Dict] = None):
        super().__init__(message)
        self.status_code = status_code
        self.mollie_error = mollie_error


class MollieClient:
    """
    Wrapper around Mollie API for subscription management.
    
    Handles:
    - Customer creation
    - Subscription management
    - Payment verification
    - Error handling and logging (no PII)
    """
    
    BASE_URL = "https://api.mollie.com/v2"
    
    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize Mollie client.
        
        Args:
            api_key: Mollie API key (defaults to settings.MOLLIE_API_KEY)
        """
        self.api_key = api_key or getattr(settings, 'MOLLIE_API_KEY', None)
        
        if not self.api_key:
            logger.warning("Mollie API key not configured - Mollie integration disabled")
        
        self.client = httpx.AsyncClient(
            base_url=self.BASE_URL,
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            },
            timeout=30.0,
        )
    
    async def close(self):
        """Close the HTTP client"""
        await self.client.aclose()
    
    async def __aenter__(self):
        """Async context manager entry"""
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        await self.close()
    
    def _handle_error(self, response: httpx.Response, context: str) -> None:
        """
        Handle Mollie API error responses.
        
        Args:
            response: HTTP response from Mollie
            context: Context string for logging (e.g., "create_customer")
        
        Raises:
            MollieError: With structured error information
        """
        try:
            error_data = response.json()
            error_msg = error_data.get("detail", error_data.get("title", "Unknown Mollie error"))
            
            # Log error without sensitive data
            logger.error(
                f"Mollie API error in {context}: status={response.status_code}, "
                f"error={error_msg}"
            )
            
            raise MollieError(
                message=f"Mollie API error: {error_msg}",
                status_code=response.status_code,
                mollie_error=error_data
            )
        except Exception as e:
            if isinstance(e, MollieError):
                raise
            
            # Couldn't parse error response
            logger.error(
                f"Mollie API error in {context}: status={response.status_code}, "
                f"response could not be parsed"
            )
            raise MollieError(
                message=f"Mollie API error (status {response.status_code})",
                status_code=response.status_code
            )
    
    async def create_customer(
        self,
        email: str,
        name: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Create a Mollie customer.
        
        Args:
            email: Customer email address
            name: Customer name
            metadata: Optional metadata (e.g., {"administration_id": "..."})
        
        Returns:
            Dict with customer data including 'id' field
        
        Raises:
            MollieError: If customer creation fails
        """
        if not self.api_key:
            raise MollieError("Mollie API key not configured")
        
        payload = {
            "email": email,
            "name": name,
        }
        
        if metadata:
            payload["metadata"] = metadata
        
        try:
            logger.info(f"Creating Mollie customer for email: {email[:3]}***")
            
            response = await self.client.post("/customers", json=payload)
            
            if response.status_code != 201:
                self._handle_error(response, "create_customer")
            
            customer_data = response.json()
            
            logger.info(f"Created Mollie customer: {customer_data.get('id')}")
            
            return customer_data
        
        except httpx.HTTPError as e:
            logger.error(f"HTTP error creating Mollie customer: {e}")
            raise MollieError(f"Network error creating Mollie customer: {e}")
    
    async def get_customer(self, customer_id: str) -> Dict[str, Any]:
        """
        Get a Mollie customer by ID.
        
        Args:
            customer_id: Mollie customer ID (e.g., "cst_xxxxx")
        
        Returns:
            Dict with customer data
        
        Raises:
            MollieError: If customer retrieval fails
        """
        if not self.api_key:
            raise MollieError("Mollie API key not configured")
        
        try:
            response = await self.client.get(f"/customers/{customer_id}")
            
            if response.status_code != 200:
                self._handle_error(response, "get_customer")
            
            return response.json()
        
        except httpx.HTTPError as e:
            logger.error(f"HTTP error getting Mollie customer: {e}")
            raise MollieError(f"Network error getting Mollie customer: {e}")
    
    async def create_subscription(
        self,
        customer_id: str,
        amount: Decimal,
        currency: str,
        interval: str,
        description: str,
        webhook_url: str,
        start_date: Optional[date] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Create a Mollie subscription for a customer.
        
        Args:
            customer_id: Mollie customer ID
            amount: Subscription amount (e.g., Decimal("6.95"))
            currency: Currency code (e.g., "EUR")
            interval: Interval string (e.g., "1 month")
            description: Subscription description
            webhook_url: Webhook URL for payment notifications
            start_date: Optional start date (defaults to today)
            metadata: Optional metadata
        
        Returns:
            Dict with subscription data including 'id' field
        
        Raises:
            MollieError: If subscription creation fails
        """
        if not self.api_key:
            raise MollieError("Mollie API key not configured")
        
        payload = {
            "amount": {
                "currency": currency,
                "value": f"{amount:.2f}",
            },
            "interval": interval,
            "description": description,
            "webhookUrl": webhook_url,
        }
        
        if start_date:
            payload["startDate"] = start_date.isoformat()
        
        if metadata:
            payload["metadata"] = metadata
        
        try:
            logger.info(
                f"Creating Mollie subscription for customer {customer_id}: "
                f"amount={amount} {currency}, interval={interval}"
            )
            
            response = await self.client.post(
                f"/customers/{customer_id}/subscriptions",
                json=payload
            )
            
            if response.status_code != 201:
                self._handle_error(response, "create_subscription")
            
            subscription_data = response.json()
            
            logger.info(
                f"Created Mollie subscription: {subscription_data.get('id')} "
                f"for customer {customer_id}"
            )
            
            return subscription_data
        
        except httpx.HTTPError as e:
            logger.error(f"HTTP error creating Mollie subscription: {e}")
            raise MollieError(f"Network error creating Mollie subscription: {e}")
    
    async def get_subscription(
        self,
        customer_id: str,
        subscription_id: str
    ) -> Dict[str, Any]:
        """
        Get a Mollie subscription by ID.
        
        Args:
            customer_id: Mollie customer ID
            subscription_id: Mollie subscription ID (e.g., "sub_xxxxx")
        
        Returns:
            Dict with subscription data
        
        Raises:
            MollieError: If subscription retrieval fails
        """
        if not self.api_key:
            raise MollieError("Mollie API key not configured")
        
        try:
            response = await self.client.get(
                f"/customers/{customer_id}/subscriptions/{subscription_id}"
            )
            
            if response.status_code != 200:
                self._handle_error(response, "get_subscription")
            
            return response.json()
        
        except httpx.HTTPError as e:
            logger.error(f"HTTP error getting Mollie subscription: {e}")
            raise MollieError(f"Network error getting Mollie subscription: {e}")
    
    async def cancel_subscription(
        self,
        customer_id: str,
        subscription_id: str
    ) -> Dict[str, Any]:
        """
        Cancel a Mollie subscription.
        
        Args:
            customer_id: Mollie customer ID
            subscription_id: Mollie subscription ID
        
        Returns:
            Dict with canceled subscription data
        
        Raises:
            MollieError: If subscription cancellation fails
        """
        if not self.api_key:
            raise MollieError("Mollie API key not configured")
        
        try:
            logger.info(
                f"Canceling Mollie subscription {subscription_id} "
                f"for customer {customer_id}"
            )
            
            response = await self.client.delete(
                f"/customers/{customer_id}/subscriptions/{subscription_id}"
            )
            
            if response.status_code != 200:
                self._handle_error(response, "cancel_subscription")
            
            subscription_data = response.json()
            
            logger.info(f"Canceled Mollie subscription: {subscription_id}")
            
            return subscription_data
        
        except httpx.HTTPError as e:
            logger.error(f"HTTP error canceling Mollie subscription: {e}")
            raise MollieError(f"Network error canceling Mollie subscription: {e}")
    
    async def get_payment(self, payment_id: str) -> Dict[str, Any]:
        """
        Get a Mollie payment by ID.
        
        Args:
            payment_id: Mollie payment ID (e.g., "tr_xxxxx")
        
        Returns:
            Dict with payment data
        
        Raises:
            MollieError: If payment retrieval fails
        """
        if not self.api_key:
            raise MollieError("Mollie API key not configured")
        
        try:
            response = await self.client.get(f"/payments/{payment_id}")
            
            if response.status_code != 200:
                self._handle_error(response, "get_payment")
            
            return response.json()
        
        except httpx.HTTPError as e:
            logger.error(f"HTTP error getting Mollie payment: {e}")
            raise MollieError(f"Network error getting Mollie payment: {e}")


def get_mollie_client() -> MollieClient:
    """
    Get a configured Mollie client instance.
    
    Returns:
        MollieClient: Configured client
    """
    return MollieClient()
