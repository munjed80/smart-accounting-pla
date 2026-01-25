# Spark Worker - Troubleshooting Guide

## 🚨 Common Issues & Solutions

### Issue 1: Container Starts But Doesn't Process Files

**Symptoms:**
```
👀 Watching uploads folder: /app/uploads
⚠️ Uploads path does not exist: /app/uploads
```

**Cause:** Volume not mounted correctly

**Solution:**
1. Check Coolify volume configuration
2. Verify mount path is `/app/uploads`
3. Ensure shared volume with FastAPI backend
4. Test: `docker exec -it <container> ls -la /app/uploads`

---

### Issue 2: Database Connection Failed

**Symptoms:**
```
ERROR - Database connection failed: could not connect to server
```

**Cause:** Invalid `DATABASE_URL` or database not ready

**Solutions:**

**Check 1: Verify Environment Variables**
```bash
docker exec -it <container> env | grep DATABASE
```

**Check 2: Test Connection Manually**
```bash
docker exec -it <container> python3 -c "
import psycopg2
conn = psycopg2.connect('postgresql://user:pass@db:5432/accounting_db')
print('✅ Connection successful')
"
```

**Check 3: Ensure Database is Running**
```bash
docker ps | grep postgres
```

**Check 4: Network Configuration**
- Ensure Spark worker and PostgreSQL are on same Docker network
- In Coolify: Check service networking settings

---

### Issue 3: OCR Returns Empty Text

**Symptoms:**
```
OCR extracted 0 characters from /app/uploads/invoice.jpg
⚠️ No amount found in invoice
```

**Cause:** Tesseract not installed or language pack missing

**Solutions:**

**Check 1: Verify Tesseract Installation**
```bash
docker exec -it <container> tesseract --version
```

**Check 2: Check Language Packs**
```bash
docker exec -it <container> tesseract --list-langs
# Should show: nld (Dutch) and eng (English)
```

**Check 3: Test OCR Manually**
```bash
docker exec -it <container> python3 -c "
import pytesseract
from PIL import Image
img = Image.open('/app/uploads/test.jpg')
text = pytesseract.image_to_string(img, lang='nld+eng')
print(text)
"
```

**Check 4: Image Quality**
- Ensure image is clear and high resolution
- Minimum 300 DPI recommended
- Avoid heavily compressed JPEGs

---

### Issue 4: All Invoices Classified as 9999 (Te rubriceren)

**Symptoms:**
```
Predicted Account: 9999 (Te rubriceren) - Confidence: 10%
```

**Cause:** No keyword matches found

**Solutions:**

**Check 1: View OCR Text**
Add temporary logging:
```python
logger.info(f"OCR Text Preview: {text[:500]}")
```

**Check 2: Add Missing Keywords**
If merchant is "Tango" (not in list):
```python
'4550': {
    'name': 'Telefoon & Internet',
    'keywords': ['kpn', 'vodafone', 'tmobile', 'ziggo', 'tango'],  # Add here
    'priority': 1
}
```

**Check 3: Case Sensitivity**
Keywords are automatically lowercased, but verify:
```python
text = "SHELL NEDERLAND"  # Becomes "shell nederland" ✅
```

---

### Issue 5: Draft Transaction Not Created

**Symptoms:**
```
✅ OCR extraction successful
❌ Failed to create draft transaction: No administration found
```

**Cause:** No active administration in database

**Solutions:**

**Check 1: Verify Administrations Exist**
```sql
SELECT id, name, is_active FROM administrations;
```

**Check 2: Create Test Administration**
```sql
INSERT INTO administrations (id, name, is_active, created_at)
VALUES (gen_random_uuid(), 'Test ZZP', true, NOW());
```

**Check 3: Seed Database**
Ensure you've run:
```bash
python backend/seed_ledger.py
```

---

### Issue 6: Redis Connection Error

**Symptoms:**
```
ERROR - Redis queue error: Error connecting to Redis
```

**Cause:** Invalid `REDIS_URL` or Redis not running

**Solutions:**

**Check 1: Verify Redis URL**
```bash
docker exec -it <container> env | grep REDIS_URL
# Should be: redis://redis:6379/0
```

**Check 2: Test Redis Connection**
```bash
docker exec -it <container> python3 -c "
import redis
r = redis.from_url('redis://redis:6379/0')
r.ping()
print('✅ Redis connected')
"
```

**Check 3: Use Folder Mode Instead**
If Redis is not needed:
```bash
PROCESSOR_MODE=folder  # Set in Coolify
```

---

### Issue 7: VAT Amount Incorrect

**Symptoms:**
```
Total: €50.00
VAT: €8.68
Net: €41.32
```

Expected VAT for €50 at 21% = €8.68 ✅ (This is correct!)

**Understanding Dutch VAT:**

- **Gross Amount** (Totaal): €50.00 (what customer pays)
- **Net Amount** (Excl. BTW): €50.00 / 1.21 = €41.32
- **VAT Amount** (21% BTW): €50.00 - €41.32 = €8.68

**Verify:**
```
€41.32 × 1.21 = €50.00 ✅
```

If VAT is 0:
- Invoice may be 0% VAT (exports, education)
- OCR didn't find VAT text (system estimates 21%)

---

### Issue 8: Permission Denied on /app/uploads

**Symptoms:**
```
PermissionError: [Errno 13] Permission denied: '/app/uploads/invoice.jpg'
```

**Cause:** File ownership/permissions issue

**Solutions:**

**Check 1: File Permissions**
```bash
docker exec -it <container> ls -la /app/uploads
```

**Check 2: Fix Permissions**
```bash
docker exec -it <container> chmod -R 755 /app/uploads
docker exec -it <container> chown -R root:root /app/uploads
```

**Check 3: Dockerfile USER Directive**
Ensure Dockerfile doesn't run as restricted user:
```dockerfile
# Run as root (default)
USER root
```

---

### Issue 9: Spark Master Connection Failed

**Symptoms:**
```
ERROR - Failed to connect to Spark master at spark://spark-master:7077
```

**Cause:** Spark cluster not configured (optional component)

**Solution:**

The processor works **WITHOUT** Apache Spark for small-scale deployments.

**Option 1: Disable Spark Session (Recommended)**
Comment out in `processor.py`:
```python
# self.spark = SparkSession.builder \
#     .appName("SmartAccountingOCR") \
#     .master("spark://spark-master:7077") \
#     .getOrCreate()
```

**Option 2: Deploy Spark Cluster**
Only needed for processing 1000+ invoices/day:
- Add `spark-master` service to docker-compose
- Add `spark-worker` service
- Configure `SPARK_MASTER_URL` environment variable

---

### Issue 10: Date Parsing Returns Current Date

**Symptoms:**
```
⚠️ No date found in invoice, using current date
Invoice Date: 2024-01-25 (but invoice is from 2023-12-15)
```

**Cause:** Date format not recognized by regex

**Solutions:**

**Check 1: View OCR Text**
```python
logger.info(f"Full OCR text: {text}")
```

**Check 2: Add New Date Pattern**
If date is "15 Dec 2023":
```python
self.date_patterns = [
    r'\b(\d{2})[/-](\d{2})[/-](\d{4})\b',  # DD-MM-YYYY
    r'\b(\d{2})\s+(dec|jan|feb)[a-z]*\s+(\d{4})\b',  # 15 Dec 2023
]
```

**Check 3: Manual Date Entry**
Accountant can edit the date in the dashboard before approving.

---

## 🔍 Debugging Tools

### Enable Debug Logging

Edit `processor.py`:
```python
logging.basicConfig(
    level=logging.DEBUG,  # Changed from INFO
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
```

### View Full OCR Output

Add to `InvoiceOCRProcessor.process()`:
```python
with open('/tmp/ocr_debug.txt', 'w') as f:
    f.write(text)
logger.info("OCR text saved to /tmp/ocr_debug.txt")
```

### Test Single Invoice

```python
from processor import InvoiceOCRProcessor

ocr = InvoiceOCRProcessor()
result = ocr.process('/app/uploads/test_invoice.jpg')

print("Merchant:", result['merchant'])
print("Amount:", result['total_amount'])
print("Account:", result['predicted_account_code'])
print("Confidence:", result['prediction_confidence'])
```

---

## 📊 Performance Monitoring

### Check Processing Speed

```bash
# Count processed invoices
docker logs <container> | grep "✅ Successfully processed" | wc -l

# Average processing time
docker logs <container> | grep "Processing invoice" -A 5
```

### Memory Usage

```bash
docker stats <container>
```

If memory > 1GB:
- Reduce image resolution before OCR
- Clear processed files from `/app/uploads`

---

## 🆘 Getting Help

### Collect Diagnostic Info

```bash
# Environment variables (redact passwords!)
docker exec -it <container> env | grep -E "DATABASE|REDIS|UPLOADS"

# Container status
docker ps -a | grep spark-worker

# Recent logs (last 100 lines)
docker logs --tail 100 <container>

# Test file access
docker exec -it <container> ls -la /app/uploads

# Network connectivity
docker exec -it <container> ping db
docker exec -it <container> ping redis
```

### Support Checklist

Before requesting support, verify:

- [ ] Environment variables are set correctly
- [ ] Database connection works
- [ ] `/app/uploads` directory is accessible
- [ ] Tesseract is installed (`tesseract --version`)
- [ ] Sample invoice uploaded to uploads folder
- [ ] Container logs reviewed (last 100 lines)

---

## ✅ Health Check Commands

Run these to verify everything works:

```bash
# 1. Container is running
docker ps | grep spark-worker

# 2. Environment variables loaded
docker exec -it <container> env | grep DATABASE_URL

# 3. Database reachable
docker exec -it <container> python3 -c "import psycopg2; psycopg2.connect('$DATABASE_URL')"

# 4. Tesseract installed
docker exec -it <container> tesseract --version

# 5. Uploads folder exists
docker exec -it <container> ls /app/uploads

# 6. Process a test invoice
docker exec -it <container> python3 /app/test_processor.py
```

All green? Your Spark Worker is healthy! 🎉

---

**Last Updated**: 2024-01-25  
**Version**: 1.0.0
