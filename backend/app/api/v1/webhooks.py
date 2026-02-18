"""
Webhook endpoints for payment provider integrations.

Handles incoming webhooks from Mollie and other payment providers.
"""
import logging
from typing import Annotated

import asyncio

from fastapi import APIRouter, Depends, HTTPException, Request, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.config import settings
from app.api.v1.deps import CurrentUser

router = APIRouter()
logger = logging.getLogger(__name__)


def verify_mollie_webhook(request: Request, x_mollie_signature: str = Header(None)) -> bool:
    """
    Verify Mollie webhook authenticity.
    
    Uses secret parameter verification. In production, MOLLIE_WEBHOOK_SECRET must be set.
    
    Args:
        request: FastAPI request
        x_mollie_signature: Optional Mollie signature header
    
    Returns:
        bool: True if webhook is authentic
        
    Raises:
        HTTPException: If webhook secret is not configured
    """
    # Get webhook secret from settings
    webhook_secret = settings.MOLLIE_WEBHOOK_SECRET
    
    if not webhook_secret:
        # In production, webhook secret MUST be configured
        # Don't silently allow unverified webhooks
        logger.error("MOLLIE_WEBHOOK_SECRET not configured - rejecting webhook")
        return False
    
    # Check query parameter for secret (simple approach)
    secret_param = request.query_params.get("secret")
    
    if secret_param == webhook_secret:
        return True
    
    # Could also check x_mollie_signature header if Mollie provides signature verification
    # For now, we rely on the secret query parameter
    
    logger.warning("Mollie webhook verification failed - invalid secret")
    return False


@router.post("/webhooks/mollie")
async def mollie_webhook(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Handle Mollie webhook events.
    
    Mollie sends webhook notifications for payment and subscription status changes.
    This endpoint processes those notifications and updates our database accordingly.
    
    Query parameters:
        id: The ID of the Mollie resource (payment or subscription)
        secret: Webhook verification secret (optional, for extra security)
    
    Returns:
        200 OK if webhook is processed successfully
    """
    from app.services.mollie_subscription_service import mollie_subscription_service
    from app.integrations.mollie.client import MollieError
    
    # Verify webhook authenticity
    if not verify_mollie_webhook(request):
        raise HTTPException(
            status_code=401,
            detail={"code": "INVALID_WEBHOOK", "message": "Webhook verification failed"}
        )
    
    # Get resource ID from query parameters (Mollie standard)
    resource_id = request.query_params.get("id")
    
    if not resource_id:
        logger.error("Mollie webhook missing 'id' parameter")
        raise HTTPException(
            status_code=400,
            detail={"code": "MISSING_ID", "message": "Webhook missing resource ID"}
        )
    
    # Determine resource type (payment starts with tr_, subscription with sub_)
    payment_id = resource_id if resource_id.startswith("tr_") else None
    subscription_id = resource_id if resource_id.startswith("sub_") else None
    
    if not payment_id and not subscription_id:
        logger.error(f"Unknown Mollie resource type: {resource_id}")
        raise HTTPException(
            status_code=400,
            detail={"code": "UNKNOWN_RESOURCE", "message": "Unknown resource type"}
        )
    
    try:
        # Process webhook quickly with timeout to avoid provider retries.
        result = await asyncio.wait_for(
            mollie_subscription_service.process_webhook(
                db=db,
                payment_id=payment_id,
                subscription_id=subscription_id,
            ),
            timeout=4,
        )

        logger.info(f"Mollie webhook processed: {resource_id}, result={result}")
        return {"status": "ok", "result": result}

    except (asyncio.TimeoutError, MollieError) as exc:
        logger.warning("Webhook processing deferred for retry: resource_id=%s error=%s", resource_id, exc)
        await mollie_subscription_service.enqueue_pending_webhook_retry(
            db=db,
            resource_id=resource_id,
            resource_type="payment" if payment_id else "subscription",
            reason=str(exc),
        )
        return {"status": "accepted", "deferred": True}
    except Exception as exc:
        logger.exception(f"Error processing Mollie webhook: {exc}")
        await mollie_subscription_service.enqueue_pending_webhook_retry(
            db=db,
            resource_id=resource_id,
            resource_type="payment" if payment_id else "subscription",
            reason=str(exc),
        )
        return {"status": "accepted", "deferred": True}


@router.post("/webhooks/mollie/retry-pending")
async def retry_pending_mollie_webhooks(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Manually retry pending Mollie webhook events."""
    from app.services.mollie_subscription_service import mollie_subscription_service

    result = await mollie_subscription_service.retry_pending_webhooks(db=db)
    logger.info("Manual pending webhook retry executed by user=%s result=%s", current_user.id, result)
    return {"status": "ok", **result}
