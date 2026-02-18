"""Seed data for Dutch VAT codes and minimal chart of accounts"""
import os
import uuid
from decimal import Decimal
import psycopg2
from psycopg2.extras import execute_values


# Dutch VAT codes (2024)
VAT_CODES = [
    {"code": "BTW_HOOG", "name": "BTW Hoog Tarief (21%)", "rate": Decimal("21.00")},
    {"code": "BTW_LAAG", "name": "BTW Laag Tarief (9%)", "rate": Decimal("9.00")},
    {"code": "BTW_NUL", "name": "BTW Nul Tarief (0%)", "rate": Decimal("0.00")},
    {"code": "BTW_VRIJ", "name": "BTW Vrijgesteld", "rate": Decimal("0.00")},
    {"code": "BTW_VERLEGD", "name": "BTW Verlegd", "rate": Decimal("0.00")},
]

# Dutch minimal chart of accounts template
CHART_OF_ACCOUNTS_TEMPLATE = [
    # Assets (Activa)
    {"code": "0100", "name": "Gebouwen", "type": "ASSET"},
    {"code": "0200", "name": "Machines & Inventaris", "type": "ASSET"},
    {"code": "0300", "name": "Transportmiddelen", "type": "ASSET"},
    {"code": "1000", "name": "Kas", "type": "ASSET"},
    {"code": "1100", "name": "Bank", "type": "ASSET"},
    {"code": "1200", "name": "Spaarrekening", "type": "ASSET"},
    {"code": "1300", "name": "Debiteuren", "type": "ASSET"},
    {"code": "1400", "name": "Voorraad", "type": "ASSET"},
    
    # Liabilities (Passiva)
    {"code": "1500", "name": "Vooruitontvangen", "type": "LIABILITY"},
    {"code": "1600", "name": "Crediteuren", "type": "LIABILITY"},
    {"code": "1700", "name": "Te betalen BTW", "type": "LIABILITY"},
    {"code": "1800", "name": "Te vorderen BTW", "type": "LIABILITY"},
    {"code": "1900", "name": "Leningen", "type": "LIABILITY"},
    
    # Equity (Eigen Vermogen)
    {"code": "2000", "name": "Kapitaal", "type": "EQUITY"},
    {"code": "2100", "name": "Privé stortingen", "type": "EQUITY"},
    {"code": "2200", "name": "Privé opnamen", "type": "EQUITY"},
    {"code": "2900", "name": "Resultaat lopend jaar", "type": "EQUITY"},
    
    # Revenue (Omzet)
    {"code": "8000", "name": "Omzet verkopen", "type": "REVENUE"},
    {"code": "8100", "name": "Omzet diensten", "type": "REVENUE"},
    {"code": "8200", "name": "Overige opbrengsten", "type": "REVENUE"},
    
    # Expenses (Kosten)
    {"code": "4000", "name": "Autokosten & Brandstof", "type": "EXPENSE"},
    {"code": "4050", "name": "Reiskosten Openbaar Vervoer", "type": "EXPENSE"},
    {"code": "4100", "name": "Huisvestingskosten", "type": "EXPENSE"},
    {"code": "4200", "name": "Verkoopkosten", "type": "EXPENSE"},
    {"code": "4300", "name": "Kantoorkosten & Apparatuur", "type": "EXPENSE"},
    {"code": "4310", "name": "Software & Licenties", "type": "EXPENSE"},
    {"code": "4400", "name": "Promotiekosten", "type": "EXPENSE"},
    {"code": "4500", "name": "Algemene kosten", "type": "EXPENSE"},
    {"code": "4550", "name": "Telefoon & Internet", "type": "EXPENSE"},
    {"code": "4600", "name": "Bankkosten", "type": "EXPENSE"},
    {"code": "4700", "name": "Verzekeringen", "type": "EXPENSE"},
    {"code": "4800", "name": "Administratiekosten", "type": "EXPENSE"},
    {"code": "4900", "name": "Afschrijvingen", "type": "EXPENSE"},
    {"code": "7000", "name": "Inkoopkosten", "type": "EXPENSE"},
    {"code": "9999", "name": "Te rubriceren", "type": "EXPENSE"},
]


DEFAULT_PLANS = [
    {"code": "free", "name": "FREE", "price_monthly": Decimal("0.00"), "trial_days": 0, "max_invoices": 25, "max_storage_mb": 256, "max_users": 1},
    {"code": "trial", "name": "TRIAL", "price_monthly": Decimal("0.00"), "trial_days": 30, "max_invoices": 200, "max_storage_mb": 1024, "max_users": 2},
    {"code": "zzp_basic", "name": "ZZP Basic", "price_monthly": Decimal("6.95"), "trial_days": 30, "max_invoices": 999999, "max_storage_mb": 5120, "max_users": 1},  # 999999 = unlimited invoices
    {"code": "basic", "name": "BASIC", "price_monthly": Decimal("19.00"), "trial_days": 30, "max_invoices": 500, "max_storage_mb": 2048, "max_users": 3},
    {"code": "pro", "name": "PRO", "price_monthly": Decimal("49.00"), "trial_days": 30, "max_invoices": 5000, "max_storage_mb": 10240, "max_users": 15},
]


def get_db_connection():
    """Get database connection from environment"""
    db_url = os.environ.get(
        "DATABASE_URL_SYNC",
        os.environ.get(
            "DATABASE_URL",
            "postgresql://accounting_user:change_me@localhost:5432/accounting_db"
        )
    )
    
    # Parse URL or use direct connection
    if db_url.startswith("postgresql"):
        return psycopg2.connect(db_url)
    
    return psycopg2.connect(
        host=os.environ.get("DB_HOST", "localhost"),
        port=os.environ.get("DB_PORT", "5432"),
        database=os.environ.get("POSTGRES_DB", "accounting_db"),
        user=os.environ.get("POSTGRES_USER", "accounting_user"),
        password=os.environ.get("POSTGRES_PASSWORD", "change_me"),
    )


def seed_vat_codes(conn):
    """Seed VAT codes if they don't exist"""
    cursor = conn.cursor()
    
    # Check if already seeded
    cursor.execute("SELECT COUNT(*) FROM vat_codes")
    count = cursor.fetchone()[0]
    if count > 0:
        print(f"VAT codes already seeded ({count} records)")
        cursor.close()
        return
    
    # Insert VAT codes
    values = [
        (str(uuid.uuid4()), v["code"], v["name"], v["rate"], True)
        for v in VAT_CODES
    ]
    
    execute_values(
        cursor,
        "INSERT INTO vat_codes (id, code, name, rate, is_active) VALUES %s",
        values
    )
    
    conn.commit()
    print(f"Seeded {len(VAT_CODES)} VAT codes")
    cursor.close()


def seed_chart_of_accounts(conn, administration_id: str):
    """Seed chart of accounts for an administration"""
    cursor = conn.cursor()
    
    # Check if already seeded for this administration
    cursor.execute(
        "SELECT COUNT(*) FROM chart_of_accounts WHERE administration_id = %s",
        (administration_id,)
    )
    count = cursor.fetchone()[0]
    if count > 0:
        print(f"Chart of accounts already seeded for administration ({count} records)")
        cursor.close()
        return
    
    # Insert accounts
    values = [
        (str(uuid.uuid4()), administration_id, acc["code"], acc["name"], acc["type"], True)
        for acc in CHART_OF_ACCOUNTS_TEMPLATE
    ]
    
    execute_values(
        cursor,
        """INSERT INTO chart_of_accounts 
           (id, administration_id, account_code, account_name, account_type, is_active) 
           VALUES %s""",
        values
    )
    
    conn.commit()
    print(f"Seeded {len(CHART_OF_ACCOUNTS_TEMPLATE)} chart of accounts for administration {administration_id}")
    cursor.close()


def seed_default_plans(conn):
    """Seed default subscription plans idempotently."""
    cursor = conn.cursor()

    for plan in DEFAULT_PLANS:
        cursor.execute(
            """
            INSERT INTO plans (id, code, name, price_monthly, trial_days, max_invoices, max_storage_mb, max_users)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (code) DO UPDATE SET
                name = EXCLUDED.name,
                price_monthly = EXCLUDED.price_monthly,
                trial_days = EXCLUDED.trial_days,
                max_invoices = EXCLUDED.max_invoices,
                max_storage_mb = EXCLUDED.max_storage_mb,
                max_users = EXCLUDED.max_users
            """,
            (str(uuid.uuid4()), plan["code"], plan["name"], plan["price_monthly"], plan["trial_days"], plan["max_invoices"], plan["max_storage_mb"], plan["max_users"])
        )

    conn.commit()
    print(f"Seeded/updated {len(DEFAULT_PLANS)} default plans")
    cursor.close()


def _hash_password(password: str) -> str:
    """Hash a plain-text password using bcrypt (or passlib fallback)."""
    try:
        import bcrypt

        return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    except ImportError:
        print("WARNING: bcrypt not available, using passlib")
        from passlib.context import CryptContext

        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        return pwd_context.hash(password)


def seed_admin_user(conn, email: str, password: str, full_name: str = "System Administrator", role: str = "admin"):
    """
    Seed an admin user in the database.
    
    IMPORTANT: This is the ONLY supported way to create admin users.
    Admin role is NOT available via public registration for security reasons.
    
    Args:
        conn: Database connection
        email: Admin user's email address
        password: Plain text password (will be hashed)
        full_name: Admin user's full name (default: "System Administrator")
    
    Returns:
        str: The UUID of the created/existing admin user
        
    Example usage from CLI:
        python -c "from seed import seed_admin_user, get_db_connection; \\
                   conn = get_db_connection(); \\
                   seed_admin_user(conn, 'admin@example.com', 'SecurePass123'); \\
                   conn.close()"
    """
    from datetime import datetime, timezone
    
    cursor = conn.cursor()
    
    # Hash password once so both create and update paths use the current env secret.
    hashed_password = _hash_password(password)

    # Check if user already exists
    cursor.execute("SELECT id, role FROM users WHERE email = %s", (email.lower(),))
    existing = cursor.fetchone()
    
    if existing:
        user_id, existing_role = existing
        now = datetime.now(timezone.utc)
        cursor.execute(
            """
            UPDATE users
            SET role = %s,
                hashed_password = %s,
                full_name = %s,
                is_active = %s,
                email_verified_at = COALESCE(email_verified_at, %s),
                updated_at = %s
            WHERE id = %s
            """,
            (role, hashed_password, full_name, True, now, now, user_id),
        )
        conn.commit()
        if existing_role == role:
            print(f"Privileged user already exists and was refreshed from env: {email} ({role})")
        else:
            print(f"Updated existing user to role {role} and refreshed credentials: {email}")
        cursor.close()
        return str(user_id)
    
    # Create new admin user
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    
    cursor.execute(
        """INSERT INTO users (id, email, hashed_password, full_name, role, is_active, email_verified_at, created_at, updated_at)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
        (user_id, email.lower(), hashed_password, full_name, role, True, now, now, now)
    )
    
    conn.commit()
    print(f"Created privileged user ({role}): {email}")
    print(f"IMPORTANT: Add this email to ADMIN_WHITELIST environment variable to allow login!")
    cursor.close()
    
    return user_id



def seed_approved_mandate(conn, accountant_email: str, client_company_id: str):
    """Create/update an approved mandate between accountant and client company."""
    cursor = conn.cursor()

    cursor.execute("SELECT id FROM users WHERE email = %s", (accountant_email.lower().strip(),))
    accountant = cursor.fetchone()
    if not accountant:
        raise ValueError(f"Accountant niet gevonden: {accountant_email}")
    accountant_id = accountant[0]

    cursor.execute(
        """
        SELECT am.user_id
        FROM administration_members am
        JOIN users u ON u.id = am.user_id
        WHERE am.administration_id = %s AND am.role = 'OWNER' AND u.role = 'zzp'
        LIMIT 1
        """,
        (client_company_id,),
    )
    owner = cursor.fetchone()
    if not owner:
        raise ValueError(f"Geen ZZP eigenaar gevonden voor administratie {client_company_id}")
    client_user_id = owner[0]

    cursor.execute(
        """
        INSERT INTO accountant_client_assignments (
          id, accountant_id, client_user_id, administration_id, status, invited_by, is_primary,
          assigned_by_id, assigned_at, approved_at, updated_at, notes, scopes
        )
        VALUES (%s, %s, %s, %s, 'ACTIVE', 'ACCOUNTANT', TRUE, %s, NOW(), NOW(), NOW(), %s,
          ARRAY['invoices','customers','expenses','hours','documents','bookkeeping','settings','vat','reports'])
        ON CONFLICT (accountant_id, administration_id)
        DO UPDATE SET status='ACTIVE', client_user_id=EXCLUDED.client_user_id, approved_at=NOW(), revoked_at=NULL, updated_at=NOW()
        """,
        (str(uuid.uuid4()), accountant_id, client_user_id, client_company_id, accountant_id, 'Seeded approved mandate'),
    )
    conn.commit()
    cursor.close()
    print(f"Seeded approved mandate: {accountant_email} -> {client_company_id}")


def main():
    """Main seed script entry point"""
    print("=" * 60)
    print("Smart Accounting Platform - Database Seed Script")
    print("=" * 60)
    
    try:
        conn = get_db_connection()
        print("Connected to database")
        
        # Seed VAT codes
        seed_vat_codes(conn)
        seed_default_plans(conn)
        
        # Check for administrations and seed chart of accounts
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM administrations WHERE is_active = TRUE")
        administrations = cursor.fetchall()
        cursor.close()
        
        for (admin_id,) in administrations:
            seed_chart_of_accounts(conn, str(admin_id))
        
        if not administrations:
            print("No administrations found. Chart of accounts will be seeded when first administration is created.")
        
        # Check for admin seeding via environment variables
        admin_email = os.environ.get("SEED_ADMIN_EMAIL")
        admin_password = os.environ.get("SEED_ADMIN_PASSWORD")
        admin_name = os.environ.get("SEED_ADMIN_NAME", "System Administrator")
        
        if admin_email and admin_password:
            print("\n--- Admin User Seeding ---")
            seed_admin_user(conn, admin_email, admin_password, admin_name, role="admin")

        super_admin_email = os.environ.get("SEED_SUPER_ADMIN_EMAIL")
        super_admin_password = os.environ.get("SEED_SUPER_ADMIN_PASSWORD")
        super_admin_name = os.environ.get("SEED_SUPER_ADMIN_NAME", "Platform Super Admin")
        if super_admin_email and super_admin_password:
            print("\n--- Super Admin User Seeding ---")
            seed_admin_user(conn, super_admin_email, super_admin_password, super_admin_name, role="super_admin")

        mandate_accountant_email = os.environ.get("SEED_MANDATE_ACCOUNTANT_EMAIL")
        mandate_client_company_id = os.environ.get("SEED_MANDATE_CLIENT_COMPANY_ID")
        if mandate_accountant_email and mandate_client_company_id:
            print("\n--- Approved Mandate Seeding ---")
            seed_approved_mandate(conn, mandate_accountant_email, mandate_client_company_id)
        
        conn.close()
        print("=" * 60)
        print("Seeding complete!")
        print("=" * 60)
        
    except Exception as e:
        print(f"Error: {e}")
        raise


if __name__ == "__main__":
    main()
