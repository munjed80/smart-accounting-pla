"""Resolve the primary active ZZP administration using one membership policy."""

from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.administration import Administration, AdministrationMember


async def get_user_administration(user_id: UUID, db: AsyncSession) -> Administration:
    administration = await db.scalar(
        select(Administration)
        .join(AdministrationMember)
        .where(
            AdministrationMember.user_id == user_id, Administration.is_active.is_(True)
        )
        .order_by(Administration.created_at, Administration.id)
        .limit(1)
    )
    if administration is None:
        raise HTTPException(
            404,
            detail={
                "code": "NO_ADMINISTRATION",
                "message": "Geen administratie gevonden. Voltooi eerst de onboarding.",
            },
        )
    return administration


async def get_user_administration_id(user_id: UUID, db: AsyncSession) -> UUID:
    return (await get_user_administration(user_id, db)).id
