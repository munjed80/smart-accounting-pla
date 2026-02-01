from typing import Annotated
from uuid import UUID

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import oauth2_scheme, decode_token
from app.core.roles import UserRole
from app.models.user import User
from app.models.administration import Administration, AdministrationMember, MemberRole
from app.models.accountant_dashboard import AccountantClientAssignment


# =============================================================================
# Authentication: Get current user from token
# =============================================================================

async def require_assigned_client(
    client_id: UUID,
    current_user: User,
    db: AsyncSession,
) -> Administration:
    """
    Verify user is an accountant AND is assigned to the client (server-enforced).
    
    Checks both:
    1. AdministrationMember table (direct membership)
    2. AccountantClientAssignment table (assignment-based access)
    
    Returns:
        Administration: The administration if access is granted
        
    Raises:
        HTTPException: 403 with FORBIDDEN_ROLE if user is not accountant/admin
        HTTPException: 403 with CLIENT_NOT_ASSIGNED if user is not assigned to client
    """
    # First verify role
    require_accountant(current_user)
    
    # Check via AdministrationMember (direct membership)
    result = await db.execute(
        select(Administration)
        .join(AdministrationMember)
        .where(Administration.id == client_id)
        .where(AdministrationMember.user_id == current_user.id)
        .where(AdministrationMember.role.in_([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.ACCOUNTANT]))
    )
    administration = result.scalar_one_or_none()
    
    if administration:
        return administration
    
    # Check via AccountantClientAssignment (assignment-based access)
    assignment_result = await db.execute(
        select(Administration)
        .join(AccountantClientAssignment, AccountantClientAssignment.administration_id == Administration.id)
        .where(Administration.id == client_id)
        .where(AccountantClientAssignment.accountant_id == current_user.id)
    )
    administration = assignment_result.scalar_one_or_none()
    
    if not administration:
        raise HTTPException(
            status_code=403,
            detail={"code": "CLIENT_NOT_ASSIGNED", "message": "Geen toegang tot deze klant."}
        )
    
    return administration


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """
    Extract and validate the current user from the JWT token.
    
    Raises:
        HTTP 401: If token is invalid or user not found
        HTTP 400: If user is inactive
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    payload = decode_token(token)
    if payload is None:
        raise credentials_exception
    
    user_id = payload.get("sub")
    if user_id is None:
        raise credentials_exception
    
    result = await db.execute(select(User).where(User.id == UUID(user_id)))
    user = result.scalar_one_or_none()
    
    if user is None:
        raise credentials_exception
    
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


# =============================================================================
# Common Role Guards
# =============================================================================

def require_zzp(current_user: User) -> None:
    """
    Guard: Allows ONLY users with role = ZZP.
    
    Raises:
        HTTP 403: If user role is not 'zzp'
    """
    if current_user.role != UserRole.ZZP.value:
        raise HTTPException(
            status_code=403,
            detail={"code": "FORBIDDEN_ROLE", "message": "This endpoint is only available for ZZP users"}
        )


def require_accountant(current_user: User) -> None:
    """
    Guard: Allows ONLY users with role = ACCOUNTANT.
    
    Raises:
        HTTP 403: If user role is not 'accountant'
    """
    if current_user.role != UserRole.ACCOUNTANT.value:
        raise HTTPException(
            status_code=403,
            detail={"code": "FORBIDDEN_ROLE", "message": "This endpoint is only available for accountants"}
        )


# =============================================================================
# Accountant-only Guards
# =============================================================================

async def require_assigned_client(
    client_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AccountantClientAssignment:
    """
    Guard: Requires accountant role AND active assignment to the given client.
    
    This guard:
    1. First verifies the user has accountant role
    2. Then checks that the accountant is actively assigned to the client
    
    Args:
        client_id: The administration/client UUID to check access for
        current_user: The authenticated user
        db: Database session
    
    Returns:
        The AccountantClientAssignment record if valid
        
    Raises:
        HTTP 403: If user is not accountant or not assigned to client
    """
    # First, verify accountant role
    require_accountant(current_user)
    
    # Then, check assignment in database
    result = await db.execute(
        select(AccountantClientAssignment)
        .where(AccountantClientAssignment.accountant_id == current_user.id)
        .where(AccountantClientAssignment.administration_id == client_id)
    )
    assignment = result.scalar_one_or_none()
    
    if assignment is None:
        raise HTTPException(
            status_code=403,
            detail={"code": "NOT_ASSIGNED", "message": "You are not assigned to this client"}
        )
    
    return assignment


# =============================================================================
# Administration Access (for ZZP users accessing their own administration)
# =============================================================================

async def get_admin_with_access(
    admin_id: UUID,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    required_roles: list[MemberRole] | None = None,
) -> Administration:
    """
    Get administration and verify user has access with required role.
    
    Used primarily for ZZP users accessing their own administrations.
    
    Args:
        admin_id: The administration UUID
        current_user: The authenticated user
        db: Database session
        required_roles: Optional list of required member roles
        
    Returns:
        The Administration if user has access
        
    Raises:
        HTTP 404: If administration not found
        HTTP 403: If user is not a member or lacks required role
    """
    result = await db.execute(
        select(Administration)
        .options(selectinload(Administration.members))
        .where(Administration.id == admin_id)
    )
    administration = result.scalar_one_or_none()
    
    if not administration:
        raise HTTPException(status_code=404, detail="Administration not found")
    
    # Check membership
    member = next(
        (m for m in administration.members if m.user_id == current_user.id),
        None
    )
    
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this administration")
    
    if required_roles and member.role not in required_roles:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    
    return administration
