from typing import Annotated, Optional, Tuple, List
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
from app.models.accountant_dashboard import AccountantClientAssignment, PermissionScope, DEFAULT_SCOPES


# =============================================================================
# Authentication: Get current user from token
# =============================================================================

async def require_assigned_client(
    client_id: UUID,
    current_user: User,
    db: AsyncSession,
    required_scope: Optional[str] = None,
) -> Administration:
    """
    Verify user is an accountant AND is assigned to the client with ACTIVE status.
    Optionally checks if a required permission scope is granted.
    
    Checks both:
    1. AdministrationMember table (direct membership)
    2. AccountantClientAssignment table (assignment-based access with consent)
    
    For AccountantClientAssignment, only ACTIVE assignments grant access.
    PENDING assignments (awaiting client approval) do NOT grant access.
    
    Args:
        client_id: The administration UUID to check access for
        current_user: The authenticated user
        db: Database session
        required_scope: Optional scope required for this access (e.g., 'invoices', 'reports')
    
    Returns:
        Administration: The administration if access is granted
        
    Raises:
        HTTPException: 403 with FORBIDDEN_ROLE if user is not accountant/admin
        HTTPException: 403 with NOT_ASSIGNED if user is not assigned to client
        HTTPException: 403 with PENDING_APPROVAL if assignment is pending client approval
        HTTPException: 403 with SCOPE_MISSING if required scope is not granted
    """
    # First verify role
    require_accountant(current_user)
    
    # Check via AdministrationMember (direct membership) - full access, no scope check needed
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
    
    # Check via AccountantClientAssignment (assignment-based access with consent)
    # Import AssignmentStatus here to avoid circular imports
    from app.models.accountant_dashboard import AssignmentStatus
    
    assignment_result = await db.execute(
        select(Administration, AccountantClientAssignment)
        .join(AccountantClientAssignment, AccountantClientAssignment.administration_id == Administration.id)
        .where(Administration.id == client_id)
        .where(AccountantClientAssignment.accountant_id == current_user.id)
    )
    result_tuple = assignment_result.first()
    
    if not result_tuple:
        raise HTTPException(
            status_code=403,
            detail={"code": "NOT_ASSIGNED", "message": "Geen toegang tot deze klant."}
        )
    
    administration, assignment = result_tuple
    
    # Check assignment status - only ACTIVE grants access
    if assignment.status != AssignmentStatus.ACTIVE:
        if assignment.status == AssignmentStatus.PENDING:
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "PENDING_APPROVAL",
                    "message": "Toegang is in afwachting van goedkeuring door de klant."
                }
            )
        else:  # REVOKED
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "ACCESS_REVOKED",
                    "message": "Toegang is ingetrokken door de klant."
                }
            )
    
    # Check required scope if specified
    if required_scope:
        scopes = assignment.scopes or DEFAULT_SCOPES
        if required_scope not in scopes:
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "SCOPE_MISSING",
                    "message": f"Geen toegang tot deze module. Ontbrekende machtiging: {required_scope}",
                    "required_scope": required_scope,
                    "granted_scopes": scopes
                }
            )
    
    return administration


async def require_assigned_client_with_scopes(
    client_id: UUID,
    current_user: User,
    db: AsyncSession,
) -> Tuple[Administration, List[str]]:
    """
    Verify user is assigned to client and return both administration and scopes.
    
    Returns:
        Tuple of (Administration, list of granted scopes)
    """
    # First verify role
    require_accountant(current_user)
    
    # Check via AdministrationMember (direct membership) - full access
    result = await db.execute(
        select(Administration)
        .join(AdministrationMember)
        .where(Administration.id == client_id)
        .where(AdministrationMember.user_id == current_user.id)
        .where(AdministrationMember.role.in_([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.ACCOUNTANT]))
    )
    administration = result.scalar_one_or_none()
    
    if administration:
        # Direct members have full access
        return administration, DEFAULT_SCOPES.copy()
    
    # Check via AccountantClientAssignment
    from app.models.accountant_dashboard import AssignmentStatus
    
    assignment_result = await db.execute(
        select(Administration, AccountantClientAssignment)
        .join(AccountantClientAssignment, AccountantClientAssignment.administration_id == Administration.id)
        .where(Administration.id == client_id)
        .where(AccountantClientAssignment.accountant_id == current_user.id)
    )
    result_tuple = assignment_result.first()
    
    if not result_tuple:
        raise HTTPException(
            status_code=403,
            detail={"code": "NOT_ASSIGNED", "message": "Geen toegang tot deze klant."}
        )
    
    administration, assignment = result_tuple
    
    # Check assignment status
    if assignment.status != AssignmentStatus.ACTIVE:
        if assignment.status == AssignmentStatus.PENDING:
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "PENDING_APPROVAL",
                    "message": "Toegang is in afwachting van goedkeuring door de klant."
                }
            )
        else:
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "ACCESS_REVOKED",
                    "message": "Toegang is ingetrokken door de klant."
                }
            )
    
    scopes = assignment.scopes or DEFAULT_SCOPES.copy()
    return administration, scopes


def require_scope(scope: str):
    """
    Factory function to create a scope-checking dependency.
    
    Usage:
        @router.get("/invoices")
        async def get_invoices(
            administration: Administration = Depends(require_scope("invoices"))
        ):
            ...
    
    Args:
        scope: The required permission scope (e.g., 'invoices', 'reports')
    """
    async def dependency(
        client_id: UUID,
        current_user: User,
        db: AsyncSession,
    ) -> Administration:
        return await require_assigned_client(client_id, current_user, db, required_scope=scope)
    return dependency


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
    Guard: Allows users with role = ACCOUNTANT or ADMIN.
    
    Admin users are considered accountants for permission purposes,
    matching the frontend behavior (isAccountantRole).
    
    Raises:
        HTTP 403: If user role is not 'accountant' or 'admin'
    """
    if current_user.role not in (UserRole.ACCOUNTANT.value, UserRole.ADMIN.value):
        raise HTTPException(
            status_code=403,
            detail={"code": "FORBIDDEN_ROLE", "message": "This endpoint is only available for accountants"}
        )


def require_accountant_only(current_user: User) -> None:
    """
    Guard: Allows ONLY users with role = ACCOUNTANT.
    
    Raises:
        HTTP 403: If user role is not 'accountant'
    """
    if current_user.role != UserRole.ACCOUNTANT.value:
        raise HTTPException(
            status_code=403,
            detail={"code": "FORBIDDEN_ROLE", "message": "Deze endpoint is alleen beschikbaar voor accountants"}
        )




def require_super_admin(current_user: User) -> None:
    """
    Guard: Allows ONLY users with role = SUPER_ADMIN.

    Raises:
        HTTP 403: If user role is not 'super_admin'
    """
    if current_user.role != UserRole.SUPER_ADMIN.value:
        raise HTTPException(
            status_code=403,
            detail={"code": "FORBIDDEN_ROLE", "message": "This endpoint is only available for super admins"}
        )
async def require_assigned_accountant_client(
    client_id: UUID,
    current_user: User,
    db: AsyncSession,
) -> Administration:
    """
    Verify user is an accountant (not admin) AND assigned to the client.
    """
    require_accountant_only(current_user)
    return await require_assigned_client(client_id, current_user, db)


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
