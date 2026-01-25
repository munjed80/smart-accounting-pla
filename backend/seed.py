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
        
        # Check for administrations and seed chart of accounts
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM administrations WHERE is_active = TRUE")
        administrations = cursor.fetchall()
        cursor.close()
        
        for (admin_id,) in administrations:
            seed_chart_of_accounts(conn, str(admin_id))
        
        if not administrations:
            print("No administrations found. Chart of accounts will be seeded when first administration is created.")
        
        conn.close()
        print("=" * 60)
        print("Seeding complete!")
        print("=" * 60)
        
    except Exception as e:
        print(f"Error: {e}")
        raise


if __name__ == "__main__":
    main()
