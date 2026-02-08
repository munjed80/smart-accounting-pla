"""
ZZP AI Insights API Endpoints

Provides AI-generated insights for ZZP users.
All insights are explainable and can be dismissed by the user.
"""
from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.administration import Administration, AdministrationMember
from app.schemas.zzp import ZZPInsightsResponse
from app.services.zzp_insights import ZZPInsightsService
from app.api.v1.deps import CurrentUser, require_zzp

router = APIRouter()


async def get_user_administration(user_id: UUID, db: AsyncSession) -> Administration:
    """
    Get the primary administration for a ZZP user.
    """
    result = await db.execute(
        select(Administration)
        .join(AdministrationMember)
        .where(AdministrationMember.user_id == user_id)
        .where(Administration.is_active == True)
        .order_by(Administration.created_at)
        .limit(1)
    )
    administration = result.scalar_one_or_none()
    
    if not administration:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "NO_ADMINISTRATION",
                "message": "Geen administratie gevonden. Voltooi eerst de onboarding."
            }
        )
    
    return administration


@router.get(
    "/insights",
    response_model=ZZPInsightsResponse,
    summary="Get AI-generated insights",
    description="""
    Returns AI-generated insights and suggestions for the ZZP user.
    
    The AI uses transparent, rule-based logic:
    - Overdue invoices that need follow-up
    - Unbilled hours that could be invoiced
    - BTW deadline reminders
    - Missing business profile data
    
    All insights include an explanation of WHY they were generated.
    Users can dismiss insights they don't want to act on.
    """
)
async def get_insights(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ZZPInsightsResponse:
    """
    Get all AI insights for the current ZZP user.
    
    AI Logic Flow:
    1. Check for overdue invoices (most urgent)
    2. Check if business profile is complete
    3. Check for invoices needing follow-up
    4. Check for unbilled hours by customer
    5. Check for upcoming BTW deadlines
    6. Check for inactivity
    
    Returns insights sorted by severity (ACTION_NEEDED first).
    """
    require_zzp(current_user)
    administration = await get_user_administration(current_user.id, db)
    
    insights_service = ZZPInsightsService(db, administration.id)
    return await insights_service.generate_insights()
