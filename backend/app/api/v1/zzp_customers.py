"""
ZZP Customers API Endpoints

CRUD operations for ZZP customers with validation.
Scoped to the user's administration.
"""
from typing import Annotated, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.zzp import ZZPCustomer
from app.models.administration import Administration, AdministrationMember
from app.schemas.zzp import (
    CustomerCreate,
    CustomerUpdate,
    CustomerResponse,
    CustomerListResponse,
)
from app.api.v1.deps import CurrentUser, require_zzp

router = APIRouter()


async def get_user_administration(user_id: UUID, db: AsyncSession) -> Administration:
    """
    Get the primary administration for a ZZP user.
    
    ZZP users typically have one administration (their own business).
    Returns the first active administration where the user is a member.
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


@router.get("/customers", response_model=CustomerListResponse)
async def list_customers(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    status: str = Query(None, pattern=r'^(active|inactive)$', description="Filter by status"),
    search: str = Query(None, max_length=100, description="Search by name, email, or phone"),
):
    """
    List all customers for the current user's administration.
    
    Supports filtering by status and searching by name/email/phone.
    """
    require_zzp(current_user)
    
    # Get user's administration
    administration = await get_user_administration(current_user.id, db)
    
    # Build query
    query = select(ZZPCustomer).where(
        ZZPCustomer.administration_id == administration.id
    )
    
    # Apply status filter
    if status:
        query = query.where(ZZPCustomer.status == status)
    
    # Apply search filter
    if search:
        search_term = f"%{search.lower()}%"
        query = query.where(
            (func.lower(ZZPCustomer.name).like(search_term)) |
            (func.lower(ZZPCustomer.email).like(search_term)) |
            (func.lower(ZZPCustomer.phone).like(search_term))
        )
    
    # Execute query
    query = query.order_by(ZZPCustomer.name)
    result = await db.execute(query)
    customers = result.scalars().all()
    
    return CustomerListResponse(
        customers=[CustomerResponse.model_validate(c) for c in customers],
        total=len(customers)
    )


@router.post("/customers", response_model=CustomerResponse, status_code=201)
async def create_customer(
    customer_in: CustomerCreate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Create a new customer for the current user's administration.
    """
    require_zzp(current_user)
    
    # Get user's administration
    administration = await get_user_administration(current_user.id, db)
    
    # Create customer
    customer = ZZPCustomer(
        administration_id=administration.id,
        **customer_in.model_dump()
    )
    
    db.add(customer)
    await db.commit()
    await db.refresh(customer)
    
    return CustomerResponse.model_validate(customer)


@router.get("/customers/{customer_id}", response_model=CustomerResponse)
async def get_customer(
    customer_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get a specific customer by ID.
    """
    require_zzp(current_user)
    
    # Get user's administration
    administration = await get_user_administration(current_user.id, db)
    
    # Find customer
    result = await db.execute(
        select(ZZPCustomer).where(
            ZZPCustomer.id == customer_id,
            ZZPCustomer.administration_id == administration.id
        )
    )
    customer = result.scalar_one_or_none()
    
    if not customer:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "CUSTOMER_NOT_FOUND",
                "message": "Klant niet gevonden."
            }
        )
    
    return CustomerResponse.model_validate(customer)


@router.put("/customers/{customer_id}", response_model=CustomerResponse)
async def update_customer(
    customer_id: UUID,
    customer_in: CustomerUpdate,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Update a customer.
    
    Only provided fields will be updated (partial update).
    """
    require_zzp(current_user)
    
    # Get user's administration
    administration = await get_user_administration(current_user.id, db)
    
    # Find customer
    result = await db.execute(
        select(ZZPCustomer).where(
            ZZPCustomer.id == customer_id,
            ZZPCustomer.administration_id == administration.id
        )
    )
    customer = result.scalar_one_or_none()
    
    if not customer:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "CUSTOMER_NOT_FOUND",
                "message": "Klant niet gevonden."
            }
        )
    
    # Update only provided fields
    update_data = customer_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(customer, field, value)
    
    await db.commit()
    await db.refresh(customer)
    
    return CustomerResponse.model_validate(customer)


@router.delete("/customers/{customer_id}", status_code=204)
async def delete_customer(
    customer_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Delete a customer.
    
    Note: This is a hard delete. Consider soft delete in future
    if customers are linked to invoices.
    """
    require_zzp(current_user)
    
    # Get user's administration
    administration = await get_user_administration(current_user.id, db)
    
    # Find customer
    result = await db.execute(
        select(ZZPCustomer).where(
            ZZPCustomer.id == customer_id,
            ZZPCustomer.administration_id == administration.id
        )
    )
    customer = result.scalar_one_or_none()
    
    if not customer:
        raise HTTPException(
            status_code=404,
            detail={
                "code": "CUSTOMER_NOT_FOUND",
                "message": "Klant niet gevonden."
            }
        )
    
    await db.delete(customer)
    await db.commit()
    
    return None
