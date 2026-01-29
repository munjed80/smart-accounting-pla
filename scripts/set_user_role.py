#!/usr/bin/env python3
"""
Management script to update a user's role.

This script provides a secure way to update user roles without direct database editing.
It is intended for use by system administrators when the admin API is not accessible.

Usage:
    python scripts/set_user_role.py --email user@example.com --role accountant
    python scripts/set_user_role.py --user-id 550e8400-e29b-41d4-a716-446655440000 --role zzp

Environment:
    DATABASE_URL: PostgreSQL connection string (required)

Allowed roles: zzp, accountant, admin
"""

import argparse
import asyncio
import os
import sys
from uuid import UUID

# Add parent directory to path to import app modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker


# Valid roles
VALID_ROLES = {"zzp", "accountant", "admin"}


def get_database_url() -> str:
    """Get database URL from environment."""
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("ERROR: DATABASE_URL environment variable is not set")
        print("Example: DATABASE_URL=postgresql+asyncpg://user:pass@localhost/dbname")
        sys.exit(1)
    
    # Ensure we're using asyncpg driver
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif not url.startswith("postgresql+asyncpg://"):
        print("ERROR: DATABASE_URL must be a PostgreSQL connection string")
        sys.exit(1)
    
    return url


async def find_user(session: AsyncSession, email: str = None, user_id: str = None):
    """Find a user by email or ID."""
    # Import User model here to avoid import issues
    from app.models.user import User
    
    if email:
        result = await session.execute(select(User).where(User.email == email))
    elif user_id:
        try:
            uuid_id = UUID(user_id)
            result = await session.execute(select(User).where(User.id == uuid_id))
        except ValueError:
            print(f"ERROR: Invalid user ID format: {user_id}")
            return None
    else:
        print("ERROR: Either --email or --user-id is required")
        return None
    
    return result.scalar_one_or_none()


async def update_user_role(email: str = None, user_id: str = None, new_role: str = None, dry_run: bool = False):
    """Update a user's role."""
    if new_role not in VALID_ROLES:
        print(f"ERROR: Invalid role '{new_role}'")
        print(f"Allowed roles: {', '.join(sorted(VALID_ROLES))}")
        return False
    
    database_url = get_database_url()
    engine = create_async_engine(database_url)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        user = await find_user(session, email=email, user_id=user_id)
        
        if not user:
            identifier = email or user_id
            print(f"ERROR: User not found: {identifier}")
            return False
        
        print(f"User found:")
        print(f"  ID:    {user.id}")
        print(f"  Email: {user.email}")
        print(f"  Name:  {user.full_name}")
        print(f"  Role:  {user.role}")
        print()
        
        if user.role == new_role:
            print(f"User already has role '{new_role}'. No changes needed.")
            return True
        
        if dry_run:
            print(f"DRY RUN: Would change role from '{user.role}' to '{new_role}'")
            return True
        
        # Confirmation
        confirm = input(f"Change role from '{user.role}' to '{new_role}'? [y/N] ")
        if confirm.lower() != 'y':
            print("Cancelled.")
            return False
        
        old_role = user.role
        user.role = new_role
        await session.commit()
        
        print(f"SUCCESS: Role updated from '{old_role}' to '{new_role}'")
        return True


async def list_users(role_filter: str = None):
    """List users, optionally filtered by role."""
    database_url = get_database_url()
    engine = create_async_engine(database_url)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    # Import User model here to avoid import issues
    from app.models.user import User
    
    async with async_session() as session:
        query = select(User)
        if role_filter:
            if role_filter not in VALID_ROLES:
                print(f"ERROR: Invalid role filter '{role_filter}'")
                print(f"Allowed roles: {', '.join(sorted(VALID_ROLES))}")
                return
            query = query.where(User.role == role_filter)
        
        query = query.order_by(User.created_at.desc())
        result = await session.execute(query)
        users = result.scalars().all()
        
        if not users:
            print("No users found.")
            return
        
        print(f"Found {len(users)} user(s):")
        print("-" * 80)
        print(f"{'ID':<36}  {'Email':<30}  {'Role':<12}  {'Verified'}")
        print("-" * 80)
        
        for user in users:
            verified = "Yes" if user.is_email_verified else "No"
            print(f"{str(user.id):<36}  {user.email:<30}  {user.role:<12}  {verified}")


def main():
    parser = argparse.ArgumentParser(
        description="Manage user roles in Smart Accounting Platform",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Update a user's role by email
  %(prog)s --email user@example.com --role accountant

  # Update a user's role by ID
  %(prog)s --user-id 550e8400-e29b-41d4-a716-446655440000 --role zzp

  # Dry run (show what would happen)
  %(prog)s --email user@example.com --role accountant --dry-run

  # List all users
  %(prog)s --list

  # List users with a specific role
  %(prog)s --list --role accountant

Environment Variables:
  DATABASE_URL  PostgreSQL connection string (required)
                Example: postgresql+asyncpg://user:pass@localhost/smart_accounting
        """
    )
    
    # Mutually exclusive: either update or list
    action_group = parser.add_mutually_exclusive_group(required=True)
    action_group.add_argument(
        "--list", "-l",
        action="store_true",
        help="List users (optionally filter by --role)"
    )
    action_group.add_argument(
        "--email", "-e",
        help="User email to update"
    )
    action_group.add_argument(
        "--user-id", "-u",
        help="User UUID to update"
    )
    
    parser.add_argument(
        "--role", "-r",
        choices=sorted(VALID_ROLES),
        help="New role to assign (required for update, optional for list filter)"
    )
    
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would happen without making changes"
    )
    
    args = parser.parse_args()
    
    # Handle list action
    if args.list:
        asyncio.run(list_users(role_filter=args.role))
        return
    
    # Handle update action
    if not args.role:
        print("ERROR: --role is required when updating a user")
        sys.exit(1)
    
    success = asyncio.run(update_user_role(
        email=args.email,
        user_id=args.user_id,
        new_role=args.role,
        dry_run=args.dry_run
    ))
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
