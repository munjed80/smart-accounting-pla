#!/usr/bin/env python3
"""
Dev Seed Script: Assign ZZP Clients to Accountants

This script creates accountant-client assignments in the database, enabling the
accountant workflow end-to-end with real data.

Usage:
    # Assign all ZZP users with administrations to a specific accountant
    python scripts/seed_accountant_clients.py --accountant-email boekhouder@example.com

    # Assign specific ZZP client emails to an accountant
    python scripts/seed_accountant_clients.py --accountant-email boekhouder@example.com \
        --client-emails zzp1@example.com,zzp2@example.com

    # List current assignments
    python scripts/seed_accountant_clients.py --list-assignments

    # List all users by role
    python scripts/seed_accountant_clients.py --list-users

Environment:
    DATABASE_URL: PostgreSQL connection string (required)

This script:
1. Verifies the accountant exists and has role=accountant or role=admin
2. Finds ZZP users who have administrations
3. Creates AccountantClientAssignment records
4. Is idempotent (skips existing assignments)
"""

import argparse
import asyncio
import os
import sys
from uuid import UUID
from datetime import datetime, timezone

# Add parent directory to path to import app modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, selectinload


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


async def list_users_by_role():
    """List all users grouped by role."""
    database_url = get_database_url()
    engine = create_async_engine(database_url)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    from app.models.user import User
    
    try:
        async with async_session() as session:
            result = await session.execute(select(User).order_by(User.role, User.email))
            users = result.scalars().all()
            
            if not users:
                print("No users found in database.")
                return
            
            print("\n" + "=" * 80)
            print("USERS BY ROLE")
            print("=" * 80)
            
            current_role = None
            for user in users:
                if user.role != current_role:
                    current_role = user.role
                    print(f"\n--- {current_role.upper()} USERS ---")
                    print(f"{'ID':<36}  {'Email':<35}  {'Name'}")
                    print("-" * 80)
                
                print(f"{str(user.id):<36}  {user.email:<35}  {user.full_name}")
            
            # Summary
            role_counts = {}
            for user in users:
                role_counts[user.role] = role_counts.get(user.role, 0) + 1
            
            print("\n" + "=" * 80)
            print("SUMMARY:")
            for role, count in sorted(role_counts.items()):
                print(f"  {role}: {count} user(s)")
            print("=" * 80)
    finally:
        await engine.dispose()


async def list_assignments():
    """List all accountant-client assignments."""
    database_url = get_database_url()
    engine = create_async_engine(database_url)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    from app.models.user import User
    from app.models.administration import Administration
    from app.models.accountant_dashboard import AccountantClientAssignment
    
    try:
        async with async_session() as session:
            result = await session.execute(
                select(AccountantClientAssignment)
                .options(
                    selectinload(AccountantClientAssignment.accountant),
                    selectinload(AccountantClientAssignment.administration)
                )
                .order_by(AccountantClientAssignment.assigned_at.desc())
            )
            assignments = result.scalars().all()
            
            if not assignments:
                print("\n" + "=" * 80)
                print("NO ACCOUNTANT-CLIENT ASSIGNMENTS FOUND")
                print("=" * 80)
                print("\nTo create assignments, run:")
                print("  python scripts/seed_accountant_clients.py --accountant-email <email>")
                return
            
            print("\n" + "=" * 80)
            print("ACCOUNTANT-CLIENT ASSIGNMENTS")
            print("=" * 80)
            print(f"{'Accountant':<30}  {'Client/Administration':<35}  {'Assigned At'}")
            print("-" * 80)
            
            for assignment in assignments:
                accountant_name = assignment.accountant.email if assignment.accountant else "Unknown"
                admin_name = assignment.administration.name if assignment.administration else "Unknown"
                assigned_at = assignment.assigned_at.strftime("%Y-%m-%d %H:%M") if assignment.assigned_at else "N/A"
                
                print(f"{accountant_name:<30}  {admin_name:<35}  {assigned_at}")
            
            print("=" * 80)
            print(f"Total assignments: {len(assignments)}")
    finally:
        await engine.dispose()


async def seed_assignments(
    accountant_email: str, 
    client_emails: list[str] = None,
    dry_run: bool = False
):
    """Create accountant-client assignments."""
    database_url = get_database_url()
    engine = create_async_engine(database_url)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    from app.models.user import User
    from app.models.administration import Administration, AdministrationMember, MemberRole
    from app.models.accountant_dashboard import AccountantClientAssignment
    
    try:
        async with async_session() as session:
            # 1. Find the accountant
            accountant_result = await session.execute(
                select(User).where(User.email == accountant_email.lower().strip())
            )
            accountant = accountant_result.scalar_one_or_none()
            
            if not accountant:
                print(f"ERROR: Accountant not found with email: {accountant_email}")
                print("Use --list-users to see available users.")
                return False
            
            if accountant.role not in ["accountant", "admin"]:
                print(f"ERROR: User '{accountant_email}' has role '{accountant.role}', not 'accountant' or 'admin'")
                print("Use scripts/set_user_role.py to change their role first.")
                return False
            
            print(f"\nAccountant: {accountant.full_name} ({accountant.email})")
            print(f"Role: {accountant.role}")
            print()
            
            # 2. Find ZZP users with administrations
            if client_emails:
                # Find specific clients
                client_emails_lower = [e.lower().strip() for e in client_emails]
                zzp_result = await session.execute(
                    select(User).where(
                        User.email.in_(client_emails_lower),
                        User.role == "zzp"
                    )
                )
                zzp_users = zzp_result.scalars().all()
                
                if not zzp_users:
                    print(f"ERROR: No ZZP users found with emails: {client_emails}")
                    return False
                
                # Verify all requested emails were found
                found_emails = {u.email for u in zzp_users}
                missing = set(client_emails_lower) - found_emails
                if missing:
                    print(f"WARNING: Some emails not found or not ZZP users: {missing}")
            else:
                # Find all ZZP users
                zzp_result = await session.execute(
                    select(User).where(User.role == "zzp")
                )
                zzp_users = zzp_result.scalars().all()
            
            if not zzp_users:
                print("No ZZP users found in database.")
                return False
            
            print(f"Found {len(zzp_users)} ZZP user(s)")
            print()
            
            # 3. For each ZZP user, find their administration(s)
            assignments_to_create = []
            skipped_existing = 0
            skipped_no_admin = 0
            
            for zzp_user in zzp_users:
                # Find administrations where this user is OWNER
                admin_member_result = await session.execute(
                    select(AdministrationMember)
                    .options(selectinload(AdministrationMember.administration))
                    .where(AdministrationMember.user_id == zzp_user.id)
                    .where(AdministrationMember.role == MemberRole.OWNER)
                )
                admin_members = admin_member_result.scalars().all()
                
                if not admin_members:
                    print(f"  ⚠ {zzp_user.email}: No administration found (skipping)")
                    skipped_no_admin += 1
                    continue
                
                for member in admin_members:
                    administration = member.administration
                    if not administration:
                        continue
                    
                    # Check if assignment already exists
                    existing_result = await session.execute(
                        select(AccountantClientAssignment)
                        .where(AccountantClientAssignment.accountant_id == accountant.id)
                        .where(AccountantClientAssignment.administration_id == administration.id)
                    )
                    existing = existing_result.scalar_one_or_none()
                    
                    if existing:
                        print(f"  ✓ {zzp_user.email} → {administration.name}: Already assigned")
                        skipped_existing += 1
                        continue
                    
                    assignments_to_create.append({
                        "accountant": accountant,
                        "administration": administration,
                        "zzp_user": zzp_user,
                    })
                    print(f"  + {zzp_user.email} → {administration.name}: Will be assigned")
            
            print()
            
            # 4. Create assignments
            if not assignments_to_create:
                print("No new assignments to create.")
                if skipped_existing > 0:
                    print(f"  (Skipped {skipped_existing} existing assignment(s))")
                return True
            
            if dry_run:
                print(f"DRY RUN: Would create {len(assignments_to_create)} assignment(s)")
                return True
            
            print(f"Creating {len(assignments_to_create)} assignment(s)...")
            
            for item in assignments_to_create:
                assignment = AccountantClientAssignment(
                    accountant_id=item["accountant"].id,
                    administration_id=item["administration"].id,
                    is_primary=True,
                    assigned_by_id=item["accountant"].id,  # Self-assigned via seed script
                    notes=f"Seeded via seed_accountant_clients.py for {item['zzp_user'].email}",
                )
                session.add(assignment)
            
            await session.commit()
            
            print()
            print("=" * 80)
            print(f"SUCCESS: Created {len(assignments_to_create)} assignment(s)")
            if skipped_existing > 0:
                print(f"         Skipped {skipped_existing} existing assignment(s)")
            if skipped_no_admin > 0:
                print(f"         Skipped {skipped_no_admin} user(s) without administrations")
            print("=" * 80)
            
            # Verify with SQL-like output
            print("\nVerification query (current assignments):")
            await list_assignments()
            
            return True
    finally:
        await engine.dispose()


def main():
    parser = argparse.ArgumentParser(
        description="Seed accountant-client assignments for development",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # List all users by role
  %(prog)s --list-users

  # List current assignments
  %(prog)s --list-assignments

  # Assign all ZZP users to an accountant
  %(prog)s --accountant-email boekhouder@example.com

  # Assign specific ZZP clients to an accountant
  %(prog)s --accountant-email boekhouder@example.com --client-emails zzp1@example.com,zzp2@example.com

  # Dry run (show what would happen)
  %(prog)s --accountant-email boekhouder@example.com --dry-run

Environment Variables:
  DATABASE_URL  PostgreSQL connection string (required)
                Example: postgresql+asyncpg://user:pass@localhost/smart_accounting
        """
    )
    
    # Actions
    action_group = parser.add_mutually_exclusive_group(required=True)
    action_group.add_argument(
        "--list-users",
        action="store_true",
        help="List all users grouped by role"
    )
    action_group.add_argument(
        "--list-assignments",
        action="store_true",
        help="List current accountant-client assignments"
    )
    action_group.add_argument(
        "--accountant-email",
        help="Email of the accountant to assign clients to"
    )
    
    # Options for assignment
    parser.add_argument(
        "--client-emails",
        help="Comma-separated list of ZZP client emails (default: all ZZP users)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would happen without making changes"
    )
    
    args = parser.parse_args()
    
    # Handle actions
    if args.list_users:
        asyncio.run(list_users_by_role())
        return
    
    if args.list_assignments:
        asyncio.run(list_assignments())
        return
    
    # Handle assignment seeding
    client_emails = None
    if args.client_emails:
        client_emails = [e.strip() for e in args.client_emails.split(",")]
    
    success = asyncio.run(seed_assignments(
        accountant_email=args.accountant_email,
        client_emails=client_emails,
        dry_run=args.dry_run
    ))
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
