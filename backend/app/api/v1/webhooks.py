"""
Webhook endpoints for payment provider integrations.

Handles incoming webhooks from Mollie and other payment providers.
"""
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.config import settings

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
    
    Returns 200 immediately for webhook reliability, even if Mollie API fetch fails.
    Failed fetches are stored as PENDING_WEBHOOK_RETRY for later processing.
    
    Query parameters:
        id: The ID of the Mollie resource (payment or subscription)
        secret: Webhook verification secret (optional, for extra security)
    
    Returns:
        200 OK if webhook is received (always, for Mollie reliability)
    """
    from app.services.mollie_subscription_service import mollie_subscription_service
    from app.integrations.mollie.client import MollieError
    from app.models.subscription import WebhookEvent
    import asyncio
    
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
        # Process webhook with timeout for Mollie API call
        # Use asyncio.wait_for to add a timeout
        result = await asyncio.wait_for(
            mollie_subscription_service.process_webhook(
                db=db,
                payment_id=payment_id,
                subscription_id=subscription_id,
            ),
            timeout=5.0  # 5 second timeout for Mollie API fetch
        )
        
        logger.info(f"Mollie webhook processed: {resource_id}, result={result}")
        
        return {"status": "ok", "result": result}
    
    except asyncio.TimeoutError:
        # Mollie API is slow/unresponsive - store for retry and return 200
        logger.warning(f"Mollie API timeout for webhook {resource_id}, storing for retry")
        
        # Store pending retry record
        event_type = "payment" if payment_id else "subscription"
        webhook_event = WebhookEvent(
            provider="mollie",
            event_id=f"retry_{event_type}_{resource_id}",
            event_type=f"{event_type}_retry",
            resource_id=resource_id,
            payload=f'{{"status": "PENDING_WEBHOOK_RETRY", "resource_id": "{resource_id}"}}'
        )
        db.add(webhook_event)
        await db.commit()
        
        # Return 200 to acknowledge webhook receipt
        return {"status": "retry_queued", "resource_id": resource_id}
    
    except MollieError as e:
        # Mollie API error - store for retry and return 200
        logger.error(f"Mollie error processing webhook {resource_id}: {e}, storing for retry")
        
        # Store pending retry record
        event_type = "payment" if payment_id else "subscription"
        webhook_event = WebhookEvent(
            provider="mollie",
            event_id=f"retry_{event_type}_{resource_id}",
            event_type=f"{event_type}_retry",
            resource_id=resource_id,
            payload=f'{{"status": "PENDING_WEBHOOK_RETRY", "resource_id": "{resource_id}", "error": "{str(e)}"}}'
        )
        db.add(webhook_event)
        await db.commit()
        
        # Return 200 to acknowledge webhook receipt
        return {"status": "retry_queued", "resource_id": resource_id}
    
    except Exception as e:
        # Unexpected error - log but still return 200 for webhook reliability
        logger.exception(f"Unexpected error processing Mollie webhook {resource_id}: {e}")
        
        # Store for retry
        event_type = "payment" if payment_id else "subscription"
        webhook_event = WebhookEvent(
            provider="mollie",
            event_id=f"retry_{event_type}_{resource_id}",
            event_type=f"{event_type}_retry",
            resource_id=resource_id,
            payload=f'{{"status": "PENDING_WEBHOOK_RETRY", "resource_id": "{resource_id}", "error": "{str(e)}"}}'
        )
        db.add(webhook_event)
        await db.commit()
        
        # Return 200 to acknowledge webhook receipt
        return {"status": "retry_queued", "resource_id": resource_id}


@router.post("/webhooks/mollie/retry")
async def retry_pending_webhooks(
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Retry processing of pending webhook events.
    
    This endpoint fetches webhook events marked as "*_retry" and attempts to reprocess them.
    Should be called periodically (e.g., via cron job or manual trigger) to handle
    webhooks that failed due to Mollie API timeouts or errors.
    
    Returns:
        Summary of retry results
    """
    from app.services.mollie_subscription_service import mollie_subscription_service
    from app.integrations.mollie.client import MollieError
    from app.models.subscription import WebhookEvent
    from sqlalchemy import select, delete
    import json
    
    # Find all pending retry events
    result = await db.execute(
        select(WebhookEvent)
        .where(WebhookEvent.provider == "mollie")
        .where(WebhookEvent.event_type.like("%_retry"))
        .order_by(WebhookEvent.processed_at.asc())
        .limit(50)  # Process max 50 at a time
    )
    pending_events = result.scalars().all()
    
    if not pending_events:
        logger.info("No pending webhook retries found")
        return {"status": "ok", "processed": 0, "failed": 0}
    
    logger.info(f"Found {len(pending_events)} pending webhook retries to process")
    
    processed_count = 0
    failed_count = 0
    
    for event in pending_events:
        try:
            # Parse payload to get resource_id
            payload = json.loads(event.payload) if event.payload else {}
            resource_id = payload.get("resource_id") or event.resource_id
            
            # Determine resource type
            payment_id = resource_id if resource_id.startswith("tr_") else None
            subscription_id = resource_id if resource_id.startswith("sub_") else None
            
            if not payment_id and not subscription_id:
                logger.error(f"Invalid resource ID in retry event: {resource_id}")
                # Delete invalid event
                await db.delete(event)
                failed_count += 1
                continue
            
            # Attempt to process
            try:
                await mollie_subscription_service.process_webhook(
                    db=db,
                    payment_id=payment_id,
                    subscription_id=subscription_id,
                )
                
                # Success - delete retry event
                await db.delete(event)
                processed_count += 1
                logger.info(f"Successfully processed retry webhook: {resource_id}")
                
            except MollieError as e:
                logger.warning(f"Mollie error on retry for {resource_id}: {e}")
                failed_count += 1
                # Keep event for next retry
            
        except Exception as e:
            logger.exception(f"Error processing retry event {event.id}: {e}")
            failed_count += 1
            # Keep event for next retry
    
    await db.commit()
    
    logger.info(f"Webhook retry complete: {processed_count} processed, {failed_count} failed")
    
    return {
        "status": "ok",
        "processed": processed_count,
        "failed": failed_count,
        "remaining": len(pending_events) - processed_count - failed_count
    }
