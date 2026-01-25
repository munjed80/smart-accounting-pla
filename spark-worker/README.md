# Smart Accounting Platform - Spark OCR Processor

## Overview

The **Intelligent Invoice Processor** is a production-grade Apache Spark job that automatically processes invoice images using OCR, extracts key financial data, and creates draft accounting transactions with AI-powered ledger account prediction.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Invoice Upload                           │
│          (API uploads to /uploads or Redis queue)           │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
         ┌────────────────────────┐
         │   Spark Processor      │
         │   (processor.py)       │
         └────────┬───────────────┘
                  │
    ┌─────────────┼─────────────┐
    │             │             │
    ▼             ▼             ▼
┌────────┐   ┌────────┐   ┌──────────┐
│  OCR   │   │  AI    │   │ Database │
│Engine  │   │Predict │   │ Writer   │
└────────┘   └────────┘   └──────────┘
    │             │             │
    └─────────────┴─────────────┘
                  │
                  ▼
    ┌─────────────────────────┐
    │ Draft Transaction       │
    │ Ready for Accountant    │
    │ Approval                │
    └─────────────────────────┘
```

## Core Features

### 1. Advanced OCR Processing
- **Tesseract OCR** with Dutch + English language support
- Image preprocessing for optimal text extraction
- Handles multiple invoice formats

### 2. Intelligent Data Extraction
- **Invoice Date** - Multiple date format recognition
- **Total Amount** - Smart amount parsing from various invoice sections
- **VAT/BTW** - Automatic VAT extraction and calculation (21% Dutch standard)
- **Merchant Name** - Vendor identification from invoice header

### 3. AI-Powered Ledger Account Prediction
The system uses sophisticated keyword-based rules to predict the correct General Ledger account:

#### Supported Categories
| Account Code | Category | Example Keywords |
|-------------|----------|------------------|
| **4310** | Fuel/Brandstof | Shell, BP, Esso, Total, Texaco |
| **4300** | Car Travel | Parking, Toll, Vignette |
| **4400** | Office Supplies | Staples, Printer, Paper, Toner |
| **4500** | IT Costs | Microsoft, AWS, Azure, Hosting |
| **4510** | Software Licenses | SaaS, Subscription, License |
| **4600** | Marketing | Google Ads, Facebook, LinkedIn |
| **4710** | Business Entertainment | Restaurant, Café, Lunch |
| **4720** | Business Meals | Deliveroo, Uber Eats |
| **1450** | Private Expenses | Albert Heijn, Jumbo, Supermarket |
| **4800** | Accounting Costs | Accountant, Bookkeeper |
| **4810** | Legal Costs | Lawyer, Notary |
| **5010** | Telecom | KPN, Vodafone, T-Mobile, Ziggo |
| **4999** | Other Expenses | Fallback category |

#### Prediction Algorithm
```python
# Score = keyword_matches × (100 / priority)
# Higher priority (lower number) = more confident prediction
# Confidence score helps accountants assess prediction quality
```

### 4. Automatic Double-Entry Bookkeeping
Each invoice creates a balanced journal entry:

```
Transaction: DRAFT-1234567890
Description: AUTO: Shell - AI Confidence: 85%

Lines:
  DEBIT   4310 Brandstof          €41.32  (Net amount)
          VAT                      €8.68   (21% BTW)
  CREDIT  1600 Crediteuren         €50.00  (Total payable)
```

### 5. Two Operating Modes

#### Mode 1: Redis Queue (Recommended for Production)
```python
# API pushes jobs to Redis
redis.lpush("invoice_processing_queue", {
    "file_path": "/opt/spark-data/invoice_123.jpg",
    "document_id": "uuid-here"
})

# Processor pulls and processes
processor.run(mode="redis")
```

#### Mode 2: Folder Watching (Simpler Setup)
```python
# Processor polls /opt/spark-data every 10 seconds
# Automatically processes new .jpg, .png, .pdf files
processor.run(mode="folder")
```

## Installation & Deployment

### Prerequisites
- Docker & Docker Compose
- PostgreSQL with accounting schema
- Redis server
- Shared volume for invoice uploads

### Quick Start

1. **Build the Docker image:**
```bash
cd spark-worker
docker build -t accounting-spark-processor .
```

2. **Run standalone:**
```bash
docker run \
  -e DATABASE_URL="postgresql://user:pass@db:5432/accounting_db" \
  -e REDIS_URL="redis://redis:6379/0" \
  -e UPLOADS_PATH="/opt/spark-data" \
  -e PROCESSOR_MODE="folder" \
  -v ./uploads:/opt/spark-data \
  accounting-spark-processor
```

3. **Or use with docker-compose:**
```yaml
spark-processor:
  build: ./spark-worker
  environment:
    - DATABASE_URL=postgresql://accounting_user:${DB_PASSWORD}@db:5432/accounting_db
    - REDIS_URL=redis://redis:6379/0
    - PROCESSOR_MODE=folder
  volumes:
    - ./uploads:/opt/spark-data
  depends_on:
    - db
    - redis
    - spark-master
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://...` | PostgreSQL connection string |
| `REDIS_URL` | `redis://redis:6379/0` | Redis connection URL |
| `UPLOADS_PATH` | `/opt/spark-data` | Path to invoice files |
| `PROCESSOR_MODE` | `folder` | `redis` or `folder` |

## Database Schema Requirements

The processor expects these tables:

### `administrations`
```sql
id UUID PRIMARY KEY
is_active BOOLEAN
```

### `general_ledger`
```sql
id UUID PRIMARY KEY
administration_id UUID
account_code VARCHAR(10)
account_name VARCHAR(255)
account_type VARCHAR(50)
is_active BOOLEAN
```

### `transactions`
```sql
id UUID PRIMARY KEY
administration_id UUID
booking_number VARCHAR(50)
transaction_date DATE
description TEXT
status VARCHAR(20)  -- 'DRAFT', 'POSTED', 'VOID'
```

### `transaction_lines`
```sql
id UUID PRIMARY KEY
transaction_id UUID
ledger_account_id UUID
description VARCHAR(500)
debit NUMERIC(15,2)
credit NUMERIC(15,2)
vat_code VARCHAR(10)
vat_percentage NUMERIC(5,2)
vat_amount NUMERIC(15,2)
```

### `documents`
```sql
id UUID PRIMARY KEY
administration_id UUID
transaction_id UUID
ocr_status VARCHAR(50)
ocr_data TEXT (JSON)
ocr_processed_at TIMESTAMP
```

## Usage Examples

### Example 1: Upload Invoice via API

```python
# Backend API endpoint
@router.post("/documents/upload")
async def upload_invoice(file: UploadFile, db: Session):
    # Save file
    file_path = f"/opt/spark-data/{file.filename}"
    
    # Create document record
    doc = Document(
        id=uuid.uuid4(),
        filename=file.filename,
        file_path=file_path,
        ocr_status="PENDING"
    )
    db.add(doc)
    db.commit()
    
    # Push to Redis queue
    redis_client.lpush("invoice_processing_queue", json.dumps({
        "file_path": file_path,
        "document_id": str(doc.id)
    }))
    
    return {"message": "Invoice queued for processing"}
```

### Example 2: Check Draft Transactions

```sql
-- Find all draft transactions created by the processor
SELECT 
    t.booking_number,
    t.transaction_date,
    t.description,
    SUM(tl.debit) as total_debit,
    SUM(tl.credit) as total_credit
FROM transactions t
JOIN transaction_lines tl ON t.id = tl.transaction_id
WHERE t.status = 'DRAFT'
  AND t.description LIKE 'AUTO:%'
GROUP BY t.id, t.booking_number, t.transaction_date, t.description
ORDER BY t.created_at DESC;
```

### Example 3: Approve a Draft

```python
# Accountant reviews and approves
@router.post("/transactions/{transaction_id}/approve")
async def approve_draft(transaction_id: str, db: Session):
    transaction = db.query(Transaction).filter(
        Transaction.id == transaction_id,
        Transaction.status == "DRAFT"
    ).first()
    
    if not transaction:
        raise HTTPException(404, "Draft not found")
    
    # Change status to POSTED
    transaction.status = "POSTED"
    transaction.posted_at = datetime.utcnow()
    transaction.posted_by = current_user.id
    
    db.commit()
    
    return {"message": "Transaction posted to ledger"}
```

## Extending the AI Predictor

### Adding New Ledger Account Rules

Edit `processor.py` and add to `LedgerAccountPredictor.ACCOUNT_RULES`:

```python
'4320': {
    'name': 'Leasekosten Auto',
    'keywords': ['lease', 'leasemaatschappij', 'operational lease'],
    'priority': 1  # Lower = higher priority
}
```

### Custom Prediction Logic

You can replace the keyword system with machine learning:

```python
class MLLedgerPredictor:
    def __init__(self):
        self.model = load_trained_model('ledger_classifier.pkl')
    
    def predict(self, merchant: str, description: str):
        features = self.extract_features(merchant, description)
        prediction = self.model.predict([features])
        return prediction[0]
```

## Monitoring & Logging

### Log Levels
```bash
# Set log level
export LOG_LEVEL=DEBUG  # DEBUG, INFO, WARNING, ERROR

# Logs show:
# - OCR text extraction progress
# - Merchant identification
# - AI prediction confidence scores
# - Database transaction creation
# - Error details
```

### Example Logs
```
2024-01-15 10:30:45 - INFO - Processing invoice: /opt/spark-data/shell_receipt.jpg
2024-01-15 10:30:47 - INFO - OCR extracted 342 characters
2024-01-15 10:30:47 - INFO - Extracted: Shell - €50.00 - Account: 4310 (85% confidence)
2024-01-15 10:30:47 - INFO - Created ledger account: 4310 - Brandstof (Fuel)
2024-01-15 10:30:47 - INFO - ✅ Created DRAFT transaction DRAFT-1705315847 for Shell - €50.00
2024-01-15 10:30:47 - INFO - ✅ Successfully processed shell_receipt.jpg -> Transaction abc-123-def
```

## Performance & Scalability

### Current Setup
- Processes 1 invoice in ~2-5 seconds
- Single worker can handle ~10-20 invoices/minute
- OCR is CPU-intensive (Tesseract)

### Scaling Strategies

1. **Horizontal Scaling:**
```yaml
# Add more Spark workers
spark-processor-2:
  build: ./spark-worker
  environment:
    - PROCESSOR_MODE=redis
  # All pull from same Redis queue
```

2. **Spark Cluster:**
```python
# Distribute OCR across Spark executors
from pyspark.sql import Row

invoices_df = spark.createDataFrame([
    Row(path="/data/invoice1.jpg"),
    Row(path="/data/invoice2.jpg"),
])

results = invoices_df.rdd.map(lambda row: process_invoice(row.path))
```

3. **GPU Acceleration:**
Replace Tesseract with GPU-accelerated OCR (EasyOCR, PaddleOCR)

## Troubleshooting

### Issue: No text extracted from invoice

**Solution:**
- Check image quality (min 300 DPI recommended)
- Ensure image is not rotated
- Install additional Tesseract language packs

### Issue: Poor ledger account predictions

**Solution:**
- Add more keywords to `ACCOUNT_RULES`
- Lower priority number for important categories
- Review OCR text quality (check `ocr_data` in database)

### Issue: Database connection errors

**Solution:**
```bash
# Test connection manually
docker exec spark-processor python3 -c "
import psycopg2
conn = psycopg2.connect('postgresql://...')
print('Connected!')
"
```

### Issue: No drafts being created

**Solution:**
- Check if an `administrations` record exists and `is_active = TRUE`
- Review processor logs for errors
- Verify database schema matches expected structure

## Production Checklist

- [ ] Configure proper database credentials (not default passwords)
- [ ] Set up Redis authentication
- [ ] Implement file upload size limits
- [ ] Add monitoring (Prometheus metrics)
- [ ] Set up log aggregation (ELK Stack)
- [ ] Configure backup strategy for `uploads/` folder
- [ ] Add rate limiting on invoice processing
- [ ] Implement duplicate detection
- [ ] Set up alerting for processing failures
- [ ] Create admin dashboard for draft review
- [ ] Add audit trail for approved transactions
- [ ] Configure retention policy for processed invoices

## Future Enhancements

1. **Advanced OCR:**
   - PDF multi-page support
   - Table extraction for itemized invoices
   - Handwriting recognition

2. **Smarter AI:**
   - Train ML model on historical transactions
   - Context-aware predictions (date, amount, merchant patterns)
   - Anomaly detection (unusual expenses)

3. **Integration:**
   - Email inbox monitoring (process invoices from email)
   - WhatsApp Business API integration
   - Export to external accounting software (SnelStart, Exact)

4. **Validation:**
   - IBAN validation for payment details
   - KVK number verification
   - BTW number validation against EU VIES

## License

Part of the Smart Accounting Platform.
See main LICENSE file in project root.

## Support

For issues, questions, or feature requests, contact the development team.
