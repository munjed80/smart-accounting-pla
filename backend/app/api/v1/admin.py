"""
Admin API endpoints for user management.

This module provides secure administrative endpoints for managing users,
particularly for fixing user roles when needed.

Security:
- All endpoints require admin authentication
- Admin users must be in ADMIN_WHITELIST to access these endpoints
"""
import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.config import settings
from app.models.user import User
from app.api.v1.deps import CurrentUser


router = APIRouter()
logger = logging.getLogger(__name__)


# Valid roles that can be assigned
VALID_ROLES = {"zzp", "accountant", "admin"}


class UpdateRoleRequest(BaseModel):
    """Request body for updating a user's role."""
    role: str = Field(..., pattern="^(zzp|accountant|admin)$", description="New role for the user")


class UpdateRoleResponse(BaseModel):
    """Response after successfully updating a user's role."""
    message: str
    user_id: UUID
    old_role: str
    new_role: str


class UserListItem(BaseModel):
    """User item for list response."""
    id: UUID
    email: str
    full_name: str
    role: str
    is_active: bool
    is_email_verified: bool

    class Config:
        from_attributes = True


class UserListResponse(BaseModel):
    """Response for listing users."""
    users: list[UserListItem]
    total: int


def require_admin(current_user: CurrentUser) -> User:
    """
    Dependency to require admin access.
    
    Verifies the current user is an admin AND is in the admin whitelist.
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    # Also check whitelist for extra security
    whitelist = settings.admin_whitelist_list
    if current_user.email.lower() not in whitelist:
        logger.warning(
            "Admin endpoint access attempted by non-whitelisted admin",
            extra={
                "event": "admin_access_blocked",
                "user_id": str(current_user.id),
                "email": current_user.email,
            }
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access is restricted to whitelisted users"
        )
    
    return current_user


AdminUser = Annotated[User, Depends(require_admin)]


@router.patch("/users/{user_id}/role", response_model=UpdateRoleResponse)
async def update_user_role(
    user_id: UUID,
    request: UpdateRoleRequest,
    admin_user: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Update a user's role.
    
    This endpoint allows administrators to change a user's role.
    Use this to fix accounts that were created with the wrong role.
    
    Security:
    - Requires admin authentication
    - Admin must be in ADMIN_WHITELIST
    - Cannot demote yourself (prevents lockout)
    
    Args:
        user_id: UUID of the user to update
        request: Request body containing the new role
        
    Returns:
        UpdateRoleResponse with the old and new roles
        
    Raises:
        404: User not found
        400: Invalid role or self-demotion attempt
        403: Not authorized (not admin or not whitelisted)
    """
    # Find the target user
    result = await db.execute(select(User).where(User.id == user_id))
    target_user = result.scalar_one_or_none()
    
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Validate role
    if request.role not in VALID_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role. Must be one of: {', '.join(sorted(VALID_ROLES))}"
        )
    
    # Prevent self-demotion from admin (to avoid lockout)
    if admin_user.id == target_user.id and request.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot demote yourself from admin. Ask another admin to do this."
        )
    
    # Store old role for response
    old_role = target_user.role
    
    # Update the role
    target_user.role = request.role
    await db.commit()
    
    logger.info(
        "User role updated",
        extra={
            "event": "user_role_updated",
            "admin_user_id": str(admin_user.id),
            "target_user_id": str(target_user.id),
            "old_role": old_role,
            "new_role": request.role,
        }
    )
    
    return UpdateRoleResponse(
        message=f"Role updated successfully from '{old_role}' to '{request.role}'",
        user_id=target_user.id,
        old_role=old_role,
        new_role=request.role,
    )


@router.get("/users", response_model=UserListResponse)
async def list_users(
    admin_user: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    role: str | None = None,
    limit: int = 100,
    offset: int = 0,
):
    """
    List all users.
    
    Returns a paginated list of users with optional role filtering.
    
    Args:
        role: Optional filter by role (zzp, accountant, admin)
        limit: Maximum number of users to return (default 100, max 500)
        offset: Number of users to skip for pagination
        
    Returns:
        UserListResponse with list of users and total count
    """
    # Validate and cap limit
    limit = min(limit, 500)
    
    # Build query
    query = select(User)
    if role:
        if role not in VALID_ROLES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid role filter. Must be one of: {', '.join(sorted(VALID_ROLES))}"
            )
        query = query.where(User.role == role)
    
    # Get total count
    count_result = await db.execute(select(User.id).where(User.role == role if role else True))
    total = len(count_result.all())
    
    # Get paginated results
    query = query.order_by(User.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(query)
    users = result.scalars().all()
    
    return UserListResponse(
        users=[
            UserListItem(
                id=user.id,
                email=user.email,
                full_name=user.full_name,
                role=user.role,
                is_active=user.is_active,
                is_email_verified=user.is_email_verified,
            )
            for user in users
        ],
        total=total,
    )


@router.get("/users/{user_id}", response_model=UserListItem)
async def get_user(
    user_id: UUID,
    admin_user: AdminUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Get details of a specific user.
    
    Args:
        user_id: UUID of the user to retrieve
        
    Returns:
        UserListItem with user details
        
    Raises:
        404: User not found
    """
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    return UserListItem(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        is_active=user.is_active,
        is_email_verified=user.is_email_verified,
    )
