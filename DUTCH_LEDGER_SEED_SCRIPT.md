# Dutch Chart of Accounts - Database Seeding Script

## Overview
This document provides the complete Python script for initializing the PostgreSQL database with a standard Dutch Chart of Accounts (Grootboekrekeningschema) specifically designed for ZZP (Zelfstandige Zonder Personeel) entrepreneurs in the Netherlands.

## File Location
```
backend/app/seeds/init_ledger.py
```

## Complete Python Script

```python
"""
Dutch Chart of Accounts (Grootboekrekeningschema) Seeder
=========================================================
This script initializes the PostgreSQL database with standard ledger accounts
used by ZZP entrepreneurs in the Netherlands.

Author: Zzpershub.nl Development Team
Date: 2024
"""

import asyncio
import sys
from pathlib import Path
from typing import List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select

# Add parent directory to path to import models
sys.path.append(str(Path(__file__).parent.parent.parent))

from app.models import GeneralLedger
from app.core.config import settings


# Dutch Chart of Accounts for ZZP
DUTCH_CHART_OF_ACCOUNTS: List[Dict[str, Any]] = [
    # =============================================================================
    # ACTIVA (Assets) - Balans
    # =============================================================================
    {
        "code": "1100",
        "name": "Bankrekening",
        "name_en": "Bank Account",
        "category": "ASSET",
        "account_type": "BANK",
        "description": "Zakelijke bankrekening",
        "is_system": True,
        "is_active": True,
    },
    
    # =============================================================================
    # BELASTINGEN (Taxes) - Balans
    # =============================================================================
    {
        "code": "1500",
        "name": "BTW te vorderen",
        "name_en": "VAT Receivable",
        "category": "ASSET",
        "account_type": "VAT_RECEIVABLE",
        "description": "Voorbelasting / Te vorderen BTW",
        "is_system": True,
        "is_active": True,
    },
    {
        "code": "1600",
        "name": "BTW te betalen",
        "name_en": "VAT Payable",
        "category": "LIABILITY",
        "account_type": "VAT_PAYABLE",
        "description": "Af te dragen BTW aan de Belastingdienst",
        "is_system": True,
        "is_active": True,
    },
    
    # =============================================================================
    # KOSTEN (Expenses) - Winst & Verlies
    # =============================================================================
    {
        "code": "4000",
        "name": "Auto- en reiskosten",
        "name_en": "Travel & Transportation",
        "category": "EXPENSE",
        "account_type": "OPERATING_EXPENSE",
        "description": "Brandstof, parkeren, kilometervergoeding, OV",
        "is_system": False,
        "is_active": True,
    },
    {
        "code": "4100",
        "name": "Huisvestingskosten",
        "name_en": "Housing Costs",
        "category": "EXPENSE",
        "account_type": "OPERATING_EXPENSE",
        "description": "Huur kantoorruimte, energie, internet",
        "is_system": False,
        "is_active": True,
    },
    {
        "code": "4300",
        "name": "Kantoorkosten",
        "name_en": "Office Expenses",
        "category": "EXPENSE",
        "account_type": "OPERATING_EXPENSE",
        "description": "Laptop, software, bureaumateriaal",
        "is_system": False,
        "is_active": True,
    },
    {
        "code": "4500",
        "name": "Algemene kosten",
        "name_en": "General Expenses",
        "category": "EXPENSE",
        "account_type": "OPERATING_EXPENSE",
        "description": "Bankkosten, verzekeringen, administratie",
        "is_system": False,
        "is_active": True,
    },
    
    # =============================================================================
    # INKOOP (Direct Costs) - Winst & Verlies
    # =============================================================================
    {
        "code": "7000",
        "name": "Inkopen en direct kosten",
        "name_en": "Cost of Goods Sold",
        "category": "EXPENSE",
        "account_type": "COST_OF_SALES",
        "description": "Inkoop van goederen of materialen voor doorverkoop",
        "is_system": False,
        "is_active": True,
    },
    
    # =============================================================================
    # OMZET (Revenue) - Winst & Verlies
    # =============================================================================
    {
        "code": "8000",
        "name": "Omzet 21% BTW (Hoog tarief)",
        "name_en": "Revenue 21% VAT (High Rate)",
        "category": "REVENUE",
        "account_type": "SALES",
        "description": "Omzet belast met 21% BTW",
        "vat_rate": 21.0,
        "is_system": False,
        "is_active": True,
    },
    {
        "code": "8001",
        "name": "Omzet 9% BTW (Laag tarief)",
        "name_en": "Revenue 9% VAT (Low Rate)",
        "category": "REVENUE",
        "account_type": "SALES",
        "description": "Omzet belast met 9% BTW (bijvoorbeeld voedingsmiddelen)",
        "vat_rate": 9.0,
        "is_system": False,
        "is_active": True,
    },
    {
        "code": "8002",
        "name": "Omzet 0% BTW (Verlegd/Export)",
        "name_en": "Revenue 0% VAT (Reverse Charge/Export)",
        "category": "REVENUE",
        "account_type": "SALES",
        "description": "Omzet met verlegging of export (0% BTW)",
        "vat_rate": 0.0,
        "is_system": False,
        "is_active": True,
    },
]


async def init_ledger_accounts(session: AsyncSession) -> None:
    """
    Initialize the database with Dutch Chart of Accounts.
    
    This function:
    1. Checks if each account already exists (by code)
    2. Inserts only missing accounts
    3. Does NOT update existing accounts (to preserve user modifications)
    
    Args:
        session: Active async SQLAlchemy session
    """
    print("🇳🇱 Initializing Dutch Chart of Accounts (Grootboekrekeningschema)...")
    print("=" * 80)
    
    inserted_count = 0
    skipped_count = 0
    
    for account_data in DUTCH_CHART_OF_ACCOUNTS:
        # Check if account already exists
        result = await session.execute(
            select(GeneralLedger).where(GeneralLedger.code == account_data["code"])
        )
        existing_account = result.scalar_one_or_none()
        
        if existing_account:
            print(f"⏭️  Skipped: {account_data['code']} - {account_data['name']} (already exists)")
            skipped_count += 1
            continue
        
        # Create new account
        new_account = GeneralLedger(**account_data)
        session.add(new_account)
        
        print(f"✅ Inserted: {account_data['code']} - {account_data['name']}")
        inserted_count += 1
    
    # Commit all changes
    await session.commit()
    
    print("=" * 80)
    print(f"📊 Summary:")
    print(f"   • Inserted: {inserted_count} accounts")
    print(f"   • Skipped: {skipped_count} accounts")
    print(f"   • Total: {len(DUTCH_CHART_OF_ACCOUNTS)} accounts in schema")
    print("✨ Ledger initialization complete!")


async def main():
    """
    Main entry point for the seeding script.
    """
    print("\n" + "=" * 80)
    print("🚀 ZZPERSHUB.NL - Ledger Account Seeder")
    print("=" * 80 + "\n")
    
    # Create async engine
    engine = create_async_engine(
        settings.DATABASE_URL,
        echo=True,  # Set to False in production
        future=True,
    )
    
    # Create async session
    async_session = sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    
    try:
        async with async_session() as session:
            await init_ledger_accounts(session)
    except Exception as e:
        print(f"\n❌ Error during seeding: {str(e)}")
        raise
    finally:
        await engine.dispose()
        print("\n🔌 Database connection closed.\n")


if __name__ == "__main__":
    """
    Run this script with:
    
    cd backend
    python -m app.seeds.init_ledger
    """
    asyncio.run(main())
```

---

## Database Model Requirements

The script assumes your `GeneralLedger` model has the following structure:

```python
# backend/app/models.py

from sqlalchemy import Column, Integer, String, Boolean, Numeric, DateTime
from sqlalchemy.sql import func
from app.database import Base


class GeneralLedger(Base):
    __tablename__ = "general_ledger"
    
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(10), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    name_en = Column(String(255), nullable=True)
    category = Column(String(50), nullable=False)  # ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
    account_type = Column(String(50), nullable=False)  # BANK, VAT_PAYABLE, SALES, etc.
    description = Column(String(500), nullable=True)
    vat_rate = Column(Numeric(5, 2), nullable=True)  # e.g., 21.00, 9.00, 0.00
    is_system = Column(Boolean, default=False)  # System accounts can't be deleted
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
```

---

## Configuration Setup

Ensure your `backend/app/core/config.py` has the database URL:

```python
# backend/app/core/config.py

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://user:password@db:5432/accounting"
    
    class Config:
        env_file = ".env"


settings = Settings()
```

---

## Running the Script

### Option 1: Directly via Python
```bash
cd backend
python -m app.seeds.init_ledger
```

### Option 2: Via Docker Compose
```bash
docker-compose exec api python -m app.seeds.init_ledger
```

### Option 3: Add to Alembic Migration
```python
# In an Alembic migration file
from app.seeds.init_ledger import init_ledger_accounts

def upgrade():
    # ... other migration code ...
    
    # Seed the ledger accounts
    from sqlalchemy.ext.asyncio import AsyncSession
    import asyncio
    
    async def seed():
        async with AsyncSession(op.get_bind()) as session:
            await init_ledger_accounts(session)
    
    asyncio.run(seed())
```

---

## Dutch Accounting Categories Explained

### Revenue (Omzet)
- **8000**: 21% BTW - Standard rate for most services
- **8001**: 9% BTW - Reduced rate (food, books, etc.)
- **8002**: 0% BTW - Reverse charge or exports

### Expenses (Kosten)
- **4000**: Auto/Travel - Fuel, parking, public transport
- **4100**: Housing - Rent, utilities, internet
- **4300**: Office - Laptop, software, supplies
- **4500**: General - Bank fees, insurance, accounting

### Direct Costs (Inkoop)
- **7000**: Cost of goods sold or materials

### VAT (BTW)
- **1500**: VAT Receivable (Voorbelasting)
- **1600**: VAT Payable (Af te dragen)

### Bank
- **1100**: Business bank account

---

## Integration with Spark OCR Processor

When your Spark processor extracts invoice data, it should use this mapping:

```python
# spark-worker/processor.py

VENDOR_TO_LEDGER_MAPPING = {
    # Travel & Transportation (4000)
    "shell": "4000",
    "bp": "4000",
    "ns": "4000",  # Dutch Railways
    "ov-chipkaart": "4000",
    
    # Office Expenses (4300)
    "microsoft": "4300",
    "adobe": "4300",
    "bol.com": "4300",
    
    # Housing (4100)
    "ziggo": "4100",
    "kpn": "4100",
    
    # General Expenses (4500)
    "ing": "4500",
    "abn amro": "4500",
    "verzekering": "4500",
    
    # Default fallback
    "default": "4500",
}

def predict_ledger_code(vendor_name: str) -> str:
    """
    Predict the ledger account code based on vendor name.
    """
    vendor_lower = vendor_name.lower()
    
    for keyword, code in VENDOR_TO_LEDGER_MAPPING.items():
        if keyword in vendor_lower:
            return code
    
    return VENDOR_TO_LEDGER_MAPPING["default"]
```

---

## Testing the Seeded Data

```sql
-- Verify all accounts were created
SELECT code, name, category, account_type 
FROM general_ledger 
ORDER BY code;

-- Check revenue accounts
SELECT code, name, vat_rate 
FROM general_ledger 
WHERE category = 'REVENUE';

-- Check expense accounts
SELECT code, name 
FROM general_ledger 
WHERE category = 'EXPENSE';

-- Check VAT accounts
SELECT code, name 
FROM general_ledger 
WHERE account_type IN ('VAT_RECEIVABLE', 'VAT_PAYABLE');
```

---

## Next Steps

1. **Run the seeder** after your database migrations
2. **Update the Spark processor** to use these codes
3. **Create API endpoints** to fetch available ledger accounts
4. **Build the frontend dropdown** to display these accounts for manual booking

---

## Notes for Production

- ✅ Script is **idempotent** - safe to run multiple times
- ✅ Preserves existing accounts - only inserts missing ones
- ✅ System accounts (`is_system=True`) should not be deletable via UI
- ✅ Accounts can be extended by adding more entries to the list
- ⚠️ Set `echo=False` on the engine in production to reduce logs

---

## Support

For questions or issues, contact the Zzpershub.nl development team.

**Version:** 1.0  
**Last Updated:** January 2025  
**License:** Proprietary - Zzpershub.nl
