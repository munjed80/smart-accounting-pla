"""
Admin API endpoints for user management.

This module provides secure administrative endpoints for managing users,
particularly for fixing user roles when needed.

Security:
- All endpoints require admin authentication
- Admin users must be in ADMIN_WHITELIST to access these endpoints
"""
import logging
from typing import Annotated, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, EmailStr
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.config import settings
from app.models.user import User
from app.models.administration import Administration, AdministrationMember, MemberRole
from app.models.accountant_dashboard import AccountantClientAssignment
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
    
    # Build base query filter
    base_filter = User.role == role if role else True
    if role and role not in VALID_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role filter. Must be one of: {', '.join(sorted(VALID_ROLES))}"
        )
    
    # Get total count efficiently using COUNT
    count_query = select(func.count()).select_from(User)
    if role:
        count_query = count_query.where(User.role == role)
    count_result = await db.execute(count_query)
    total = count_result.scalar() or 0
    
    # Get paginated results
    query = select(User)
    if role:
        query = query.where(User.role == role)
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


# ===========================================================================
# DEV-ONLY ENDPOINTS: Accountant-Client Assignment Seeding
# ===========================================================================
# These endpoints are available to admin/accountant users for development
# purposes to quickly set up accountant-client assignments.
# ===========================================================================


class DevAssignmentByEmailRequest(BaseModel):
    """Request body for dev assignment by email."""
    accountant_email: EmailStr = Field(..., description="Email of the accountant to assign clients to")
    client_email: Optional[EmailStr] = Field(None, description="Email of specific ZZP client (or None for all)")


class DevAssignmentResult(BaseModel):
    """Result of a single assignment operation."""
    client_email: str
    administration_name: str
    status: str  # "created", "exists", "skipped"
    message: str


class DevAssignmentResponse(BaseModel):
    """Response from dev assignment endpoint."""
    accountant_email: str
    accountant_name: str
    total_assigned: int
    total_skipped: int
    results: list[DevAssignmentResult]


class DevAssignmentsListItem(BaseModel):
    """Item in dev assignments list."""
    id: UUID
    accountant_email: str
    accountant_name: str
    administration_id: UUID
    administration_name: str
    client_user_email: Optional[str] = None
    assigned_at: str


class DevAssignmentsListResponse(BaseModel):
    """Response for listing all assignments."""
    assignments: list[DevAssignmentsListItem]
    total: int


@router.post("/dev/seed-assignments", response_model=DevAssignmentResponse)
async def dev_seed_assignments(
    request: DevAssignmentByEmailRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    DEV ENDPOINT: Create accountant-client assignments.
    
    This endpoint is for development purposes to quickly set up accountant-client
    assignments. It:
    1. Finds the accountant by email
    2. Finds ZZP users (specific one or all) with administrations
    3. Creates AccountantClientAssignment records
    4. Is idempotent (skips existing assignments)
    
    Access: Requires accountant or admin role.
    
    Args:
        accountant_email: Email of the accountant to assign clients to
        client_email: Optional email of specific ZZP client (None = all ZZP users)
    
    Returns:
        DevAssignmentResponse with list of results
    """
    # Verify caller is accountant or admin
    if current_user.role not in ["accountant", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This endpoint requires accountant or admin role"
        )
    
    # 1. Find the accountant
    accountant_result = await db.execute(
        select(User).where(User.email == request.accountant_email.lower().strip())
    )
    accountant = accountant_result.scalar_one_or_none()
    
    if not accountant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "ACCOUNTANT_NOT_FOUND", "message": f"Accountant not found: {request.accountant_email}"}
        )
    
    if accountant.role not in ["accountant", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "NOT_ACCOUNTANT", "message": f"User {request.accountant_email} has role '{accountant.role}', not accountant"}
        )
    
    # 2. Find ZZP users
    if request.client_email:
        zzp_query = select(User).where(
            User.email == request.client_email.lower().strip(),
            User.role == "zzp"
        )
    else:
        zzp_query = select(User).where(User.role == "zzp")
    
    zzp_result = await db.execute(zzp_query)
    zzp_users = zzp_result.scalars().all()
    
    if not zzp_users:
        if request.client_email:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "ZZP_NOT_FOUND", "message": f"No ZZP user found with email: {request.client_email}"}
            )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "NO_ZZP_USERS", "message": "No ZZP users found in database"}
        )
    
    # 3. Process each ZZP user
    results = []
    total_assigned = 0
    total_skipped = 0
    
    for zzp_user in zzp_users:
        # Find administrations where this user is OWNER
        admin_member_result = await db.execute(
            select(AdministrationMember)
            .options(selectinload(AdministrationMember.administration))
            .where(AdministrationMember.user_id == zzp_user.id)
            .where(AdministrationMember.role == MemberRole.OWNER)
        )
        admin_members = admin_member_result.scalars().all()
        
        if not admin_members:
            results.append(DevAssignmentResult(
                client_email=zzp_user.email,
                administration_name="N/A",
                status="skipped",
                message="No administration found (user needs to complete onboarding)"
            ))
            total_skipped += 1
            continue
        
        for member in admin_members:
            administration = member.administration
            if not administration:
                continue
            
            # Check if assignment already exists
            existing_result = await db.execute(
                select(AccountantClientAssignment)
                .where(AccountantClientAssignment.accountant_id == accountant.id)
                .where(AccountantClientAssignment.administration_id == administration.id)
            )
            existing = existing_result.scalar_one_or_none()
            
            if existing:
                results.append(DevAssignmentResult(
                    client_email=zzp_user.email,
                    administration_name=administration.name,
                    status="exists",
                    message="Assignment already exists"
                ))
                total_skipped += 1
                continue
            
            # Create assignment
            assignment = AccountantClientAssignment(
                accountant_id=accountant.id,
                administration_id=administration.id,
                is_primary=True,
                assigned_by_id=current_user.id,
                notes=f"Created via dev/seed-assignments API for {zzp_user.email}",
            )
            db.add(assignment)
            
            results.append(DevAssignmentResult(
                client_email=zzp_user.email,
                administration_name=administration.name,
                status="created",
                message="Assignment created successfully"
            ))
            total_assigned += 1
    
    await db.commit()
    
    return DevAssignmentResponse(
        accountant_email=accountant.email,
        accountant_name=accountant.full_name,
        total_assigned=total_assigned,
        total_skipped=total_skipped,
        results=results,
    )


@router.get("/dev/assignments", response_model=DevAssignmentsListResponse)
async def dev_list_assignments(
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    accountant_email: Optional[str] = None,
):
    """
    DEV ENDPOINT: List all accountant-client assignments.
    
    Returns all assignments in the system for debugging/verification.
    
    Access: Requires accountant or admin role.
    
    Args:
        accountant_email: Optional filter by accountant email
    
    Returns:
        DevAssignmentsListResponse with list of all assignments
    """
    # Verify caller is accountant or admin
    if current_user.role not in ["accountant", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This endpoint requires accountant or admin role"
        )
    
    query = (
        select(AccountantClientAssignment)
        .options(
            selectinload(AccountantClientAssignment.accountant),
            selectinload(AccountantClientAssignment.administration),
        )
        .order_by(AccountantClientAssignment.assigned_at.desc())
    )
    
    if accountant_email:
        # Filter by accountant email via subquery
        accountant_subquery = select(User.id).where(User.email == accountant_email.lower().strip())
        query = query.where(AccountantClientAssignment.accountant_id.in_(accountant_subquery))
    
    result = await db.execute(query)
    assignments = result.scalars().all()
    
    items = []
    for assignment in assignments:
        # Get client user email if possible
        client_email = None
        if assignment.administration:
            # Find the owner of the administration
            owner_result = await db.execute(
                select(AdministrationMember)
                .options(selectinload(AdministrationMember.user))
                .where(AdministrationMember.administration_id == assignment.administration_id)
                .where(AdministrationMember.role == MemberRole.OWNER)
                .limit(1)
            )
            owner_member = owner_result.scalar_one_or_none()
            if owner_member and owner_member.user:
                client_email = owner_member.user.email
        
        items.append(DevAssignmentsListItem(
            id=assignment.id,
            accountant_email=assignment.accountant.email if assignment.accountant else "Unknown",
            accountant_name=assignment.accountant.full_name if assignment.accountant else "Unknown",
            administration_id=assignment.administration_id,
            administration_name=assignment.administration.name if assignment.administration else "Unknown",
            client_user_email=client_email,
            assigned_at=assignment.assigned_at.isoformat() if assignment.assigned_at else "N/A",
        ))
    
    return DevAssignmentsListResponse(
        assignments=items,
        total=len(items),
    )
