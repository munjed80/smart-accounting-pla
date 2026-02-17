# ImportError Fix: CommitmentCadence

## Problem
The code was attempting to import `CommitmentCadence` from `app.models.financial_commitment`, but this enum didn't exist, causing an ImportError that broke the build.

## Root Cause
When the bank matching engine was implemented, it referenced field names and enum values that didn't match the actual `FinancialCommitment` model definition. Specifically:

1. **Enum name mismatch**: Code used `CommitmentCadence` but the actual enum was `RecurringFrequency`
2. **Field name mismatches**: Multiple fields were referenced with incorrect names

## Changes Made

### File: `backend/app/services/bank_matching_engine.py`

#### 1. Import Statement (Line 34)
**Before:**
```python
from app.models.financial_commitment import FinancialCommitment, CommitmentCadence
```

**After:**
```python
from app.models.financial_commitment import FinancialCommitment, RecurringFrequency, CommitmentStatus
```

#### 2. Field References in `_match_commitments()` method

| Incorrect Field | Correct Field | Notes |
|----------------|---------------|-------|
| `commitment.client_id` | `commitment.administration_id` | Table uses administration_id |
| `commitment.is_active` | `commitment.status == CommitmentStatus.ACTIVE` | Status is an enum field |
| `commitment.amount` | `commitment.amount_cents` | Amount stored in cents (integer) |
| `commitment.vendor_name` | `commitment.provider` | Provider field contains vendor name |
| `commitment.cadence` | `commitment.recurring_frequency` | Frequency field for recurring payments |
| `CommitmentCadence.MONTHLY` | `RecurringFrequency.MONTHLY` | Correct enum name |
| `CommitmentCadence.YEARLY` | `RecurringFrequency.YEARLY` | Correct enum name |

#### 3. Amount Conversion
Added proper conversion from cents (integer) to Decimal:
```python
# Convert amount_cents to Decimal for comparison
commitment_amount = Decimal(commitment.amount_cents) / 100
```

## Actual Schema (from financial_commitment.py)

```python
class RecurringFrequency(str, enum.Enum):
    MONTHLY = "monthly"
    YEARLY = "yearly"

class CommitmentStatus(str, enum.Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    ENDED = "ended"

class FinancialCommitment(Base):
    administration_id: Mapped[uuid.UUID]
    amount_cents: Mapped[int]
    provider: Mapped[Optional[str]]
    recurring_frequency: Mapped[Optional[RecurringFrequency]]
    status: Mapped[CommitmentStatus]
    # ... other fields
```

## Verification
- ✅ Python syntax validation passes
- ✅ File compiles without errors
- ✅ All field references now match the actual model
- ✅ Proper type conversions for amount (cents to Decimal)

## Impact
This fix resolves the ImportError and allows the bank matching engine to:
- Query active financial commitments correctly
- Compare transaction amounts with commitment amounts
- Match recurring payments based on frequency (monthly/yearly)
- Check provider/vendor name similarity

No data migration required - only code changes to match existing schema.
