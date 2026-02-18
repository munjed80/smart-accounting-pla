"""
Tests for Mollie client with mocked API responses.

Tests customer creation, subscription management, and error handling
without making real API calls.
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from datetime import date
from decimal import Decimal

from app.integrations.mollie.client import MollieClient, MollieError


@pytest.mark.asyncio
async def test_create_customer_success():
    """Test successful Mollie customer creation"""
    # Mock response
    mock_response = MagicMock()
    mock_response.status_code = 201
    mock_response.json.return_value = {
        "id": "cst_test123",
        "name": "Test User",
        "email": "test@example.com",
    }
    
    with patch("httpx.AsyncClient.post", return_value=mock_response):
        async with MollieClient(api_key="test_key") as client:
            result = await client.create_customer(
                email="test@example.com",
                name="Test User",
                metadata={"administration_id": "123"}
            )
            
            assert result["id"] == "cst_test123"
            assert result["email"] == "test@example.com"


@pytest.mark.asyncio
async def test_create_customer_error():
    """Test Mollie customer creation error handling"""
    # Mock error response
    mock_response = MagicMock()
    mock_response.status_code = 400
    mock_response.json.return_value = {
        "detail": "Invalid email address",
        "title": "Bad Request"
    }
    
    with patch("httpx.AsyncClient.post", return_value=mock_response):
        async with MollieClient(api_key="test_key") as client:
            with pytest.raises(MollieError) as exc_info:
                await client.create_customer(
                    email="invalid-email",
                    name="Test User"
                )
            
            assert "Invalid email address" in str(exc_info.value)
            assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_create_subscription_success():
    """Test successful Mollie subscription creation"""
    # Mock response
    mock_response = MagicMock()
    mock_response.status_code = 201
    mock_response.json.return_value = {
        "id": "sub_test123",
        "customerId": "cst_test123",
        "status": "active",
        "amount": {
            "currency": "EUR",
            "value": "6.95"
        },
        "interval": "1 month",
        "startDate": "2026-03-20",
    }
    
    with patch("httpx.AsyncClient.post", return_value=mock_response):
        async with MollieClient(api_key="test_key") as client:
            result = await client.create_subscription(
                customer_id="cst_test123",
                amount=Decimal("6.95"),
                currency="EUR",
                interval="1 month",
                description="ZZP Basic",
                webhook_url="https://example.com/webhook",
                start_date=date(2026, 3, 20),
            )
            
            assert result["id"] == "sub_test123"
            assert result["status"] == "active"


@pytest.mark.asyncio
async def test_create_subscription_without_api_key():
    """Test subscription creation fails without API key"""
    client = MollieClient(api_key=None)
    
    with pytest.raises(MollieError) as exc_info:
        await client.create_subscription(
            customer_id="cst_test123",
            amount=Decimal("6.95"),
            currency="EUR",
            interval="1 month",
            description="Test",
            webhook_url="https://example.com/webhook",
        )
    
    assert "not configured" in str(exc_info.value)


@pytest.mark.asyncio
async def test_get_payment_success():
    """Test successful payment retrieval"""
    # Mock response
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "id": "tr_test123",
        "status": "paid",
        "amount": {
            "currency": "EUR",
            "value": "6.95"
        },
        "subscriptionId": "sub_test123",
    }
    
    with patch("httpx.AsyncClient.get", return_value=mock_response):
        async with MollieClient(api_key="test_key") as client:
            result = await client.get_payment("tr_test123")
            
            assert result["id"] == "tr_test123"
            assert result["status"] == "paid"


@pytest.mark.asyncio
async def test_cancel_subscription_success():
    """Test successful subscription cancellation"""
    # Mock response
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "id": "sub_test123",
        "customerId": "cst_test123",
        "status": "canceled",
    }
    
    with patch("httpx.AsyncClient.delete", return_value=mock_response):
        async with MollieClient(api_key="test_key") as client:
            result = await client.cancel_subscription(
                customer_id="cst_test123",
                subscription_id="sub_test123"
            )
            
            assert result["id"] == "sub_test123"
            assert result["status"] == "canceled"


@pytest.mark.asyncio
async def test_get_subscription_success():
    """Test successful subscription retrieval"""
    # Mock response
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "id": "sub_test123",
        "customerId": "cst_test123",
        "status": "active",
        "amount": {
            "currency": "EUR",
            "value": "6.95"
        },
    }
    
    with patch("httpx.AsyncClient.get", return_value=mock_response):
        async with MollieClient(api_key="test_key") as client:
            result = await client.get_subscription(
                customer_id="cst_test123",
                subscription_id="sub_test123"
            )
            
            assert result["id"] == "sub_test123"
            assert result["status"] == "active"
