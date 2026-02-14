"""
Role Constants Module

This module defines the valid user roles for the Smart Accounting Platform.
It provides a single source of truth for role values across the application.

Usage:
    from app.core.roles import UserRole, VALID_ROLES, is_valid_role
    
    # Check if a role is valid
    if not is_valid_role(role):
        raise ValueError(f"Invalid role: {role}")
    
    # Use role constants
    if user.role == UserRole.ACCOUNTANT:
        ...

Rules:
- Only "zzp" and "accountant" are allowed via public registration
- "admin" can only be created via database seed or protected internal commands
- All roles are lowercase (no uppercase variants)
"""
from enum import Enum


class UserRole(str, Enum):
    """
    Enumeration of valid user roles.
    
    The roles are:
    - ZZP: Self-employed professional (ZZP'er) managing their own bookkeeping
    - ACCOUNTANT: Professional accountant managing ZZP client administrations
    - ADMIN: System administrator (cannot be created via public registration)
    """
    ZZP = "zzp"
    ACCOUNTANT = "accountant"
    ADMIN = "admin"
    SUPER_ADMIN = "super_admin"


# Set of all valid roles (lowercase)
VALID_ROLES: set[str] = {role.value for role in UserRole}

# Set of roles allowed for public registration
REGISTRATION_ROLES: set[str] = {UserRole.ZZP.value, UserRole.ACCOUNTANT.value}


def is_valid_role(role: str) -> bool:
    """
    Check if a role string is valid.
    
    Args:
        role: The role string to validate
        
    Returns:
        True if the role is valid, False otherwise
    """
    return role in VALID_ROLES


def is_registration_role(role: str) -> bool:
    """
    Check if a role is allowed for public registration.
    
    Admin role can only be assigned via internal mechanisms.
    
    Args:
        role: The role string to validate
        
    Returns:
        True if the role can be used for public registration
    """
    return role in REGISTRATION_ROLES


def normalize_role(role: str) -> str:
    """
    Normalize a role string to lowercase.
    
    This ensures consistent role handling across the application,
    even if uppercase variants are accidentally used.
    
    Args:
        role: The role string to normalize
        
    Returns:
        The lowercase role string
        
    Raises:
        ValueError: If the normalized role is not valid
    """
    normalized = role.lower().strip()
    if normalized not in VALID_ROLES:
        raise ValueError(f"Invalid role: {role}. Must be one of: {', '.join(sorted(VALID_ROLES))}")
    return normalized
