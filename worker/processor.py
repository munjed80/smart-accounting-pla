"""
Smart Accounting Platform - Worker Service
Processes documents from Redis Streams and creates draft transactions
"""
import os
import re
import time
import json
import logging
import uuid
from datetime import datetime, date
from decimal import Decimal
from pathlib import Path
from typing import Dict, Optional, Tuple

import redis
import psycopg2
from psycopg2.extras import RealDictCursor

try:
    import pytesseract
    from PIL import Image
    HAS_OCR = True
except ImportError:
    HAS_OCR = False

try:
    import pdfplumber
    HAS_PDF = True
except ImportError:
    HAS_PDF = False

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class LedgerAccountPredictor:
    """AI-Powered Ledger Account Prediction Engine"""
    
    ACCOUNT_RULES = {
        '4000': {
            'name': 'Autokosten & Brandstof',
            'keywords': ['shell', 'bp', 'esso', 'texaco', 'total', 'tankstation', 'fuel', 'benzine', 'diesel', 'parkeren', 'parking'],
            'priority': 1
        },
        '4050': {
            'name': 'Reiskosten Openbaar Vervoer',
            'keywords': ['ns', 'ov', 'chipkaart', 'trein', 'train', 'metro', 'tram', 'bus'],
            'priority': 1
        },
        '4100': {
            'name': 'Huisvestingskosten',
            'keywords': ['huur', 'rent', 'kantoor', 'office', 'workspace'],
            'priority': 1
        },
        '4300': {
            'name': 'Kantoorkosten & Apparatuur',
            'keywords': ['laptop', 'computer', 'monitor', 'keyboard', 'mouse', 'desk', 'chair', 'mediamarkt', 'coolblue', 'bol.com'],
            'priority': 1
        },
        '4310': {
            'name': 'Software & Licenties',
            'keywords': ['microsoft', 'google workspace', 'adobe', 'dropbox', 'hosting', 'domain', 'aws', 'azure', 'digitalocean', 'heroku', 'github', 'saas', 'software'],
            'priority': 1
        },
        '4500': {
            'name': 'Algemene kosten',
            'keywords': ['albert heijn', 'jumbo', 'lidl', 'aldi', 'plus', 'ah to go', 'supermarkt', 'restaurant', 'lunch', 'cafe', 'horeca'],
            'priority': 2
        },
        '4550': {
            'name': 'Telefoon & Internet',
            'keywords': ['kpn', 'vodafone', 'tmobile', 'ziggo', 'telecom', 'internet', 'mobile', 'phone', 'sim'],
            'priority': 1
        },
        '4600': {
            'name': 'Bankkosten',
            'keywords': ['bank', 'ing', 'rabobank', 'abn amro', 'transaction fee', 'bankcosts'],
            'priority': 1
        },
        '4800': {
            'name': 'Administratiekosten',
            'keywords': ['accountant', 'boekhouder', 'administratie', 'bookkeeping'],
            'priority': 1
        },
        '7000': {
            'name': 'Inkoopkosten',
            'keywords': ['inkoop', 'purchase', 'supplier', 'leverancier', 'groothandel'],
            'priority': 2
        },
        '9999': {
            'name': 'Te rubriceren',
            'keywords': [],
            'priority': 99
        }
    }
    
    @classmethod
    def predict(cls, merchant_name: str, description: str = "") -> Tuple[str, str, int]:
        """Predict the most appropriate ledger account"""
        text = f"{merchant_name} {description}".lower()
        
        best_match = None
        best_score = 0
        
        for account_code, rule in cls.ACCOUNT_RULES.items():
            if not rule['keywords']:
                continue
            
            matches = sum(1 for keyword in rule['keywords'] if keyword in text)
            
            if matches > 0:
                score = matches * (100 // rule['priority'])
                if score > best_score:
                    best_score = score
                    best_match = (account_code, rule['name'], min(score, 100))
        
        if not best_match:
            return ('9999', cls.ACCOUNT_RULES['9999']['name'], 10)
        
        return best_match


class DocumentProcessor:
    """Document text extraction and parsing"""
    
    def __init__(self):
        self.date_patterns = [
            r'\b(\d{2})[/-](\d{2})[/-](\d{4})\b',
            r'\b(\d{4})[/-](\d{2})[/-](\d{2})\b',
        ]
        
        self.amount_patterns = [
            r'totaal[:\s]+€?\s*(\d+[.,]\d{2})',
            r'total[:\s]+€?\s*(\d+[.,]\d{2})',
            r'te\s+betalen[:\s]+€?\s*(\d+[.,]\d{2})',
            r'bedrag[:\s]+€?\s*(\d+[.,]\d{2})',
            r'€\s*(\d+[.,]\d{2})',
        ]
        
        self.vat_patterns = [
            r'btw\s+21%[:\s]+€?\s*(\d+[.,]\d{2})',
            r'vat\s+21%[:\s]+€?\s*(\d+[.,]\d{2})',
            r'21%\s+btw[:\s]+€?\s*(\d+[.,]\d{2})',
        ]
    
    def extract_text(self, file_path: str) -> str:
        """Extract text from document"""
        path = Path(file_path)
        
        if not path.exists():
            logger.error(f"File not found: {file_path}")
            return ""
        
        # PDF files
        if path.suffix.lower() == '.pdf' and HAS_PDF:
            try:
                with pdfplumber.open(file_path) as pdf:
                    text = ""
                    for page in pdf.pages:
                        page_text = page.extract_text()
                        if page_text:
                            text += page_text + "\n"
                    if text.strip():
                        logger.info(f"Extracted {len(text)} chars from PDF")
                        return text
            except Exception as e:
                logger.warning(f"PDF extraction failed: {e}")
        
        # Image files - OCR
        if HAS_OCR and path.suffix.lower() in ['.png', '.jpg', '.jpeg']:
            try:
                image = Image.open(file_path).convert('L')
                text = pytesseract.image_to_string(
                    image,
                    lang='nld+eng',
                    config='--psm 6'
                )
                logger.info(f"OCR extracted {len(text)} chars")
                return text
            except Exception as e:
                logger.warning(f"OCR extraction failed: {e}")
        
        # Fallback: try reading as text
        try:
            with open(file_path, 'r', errors='ignore') as f:
                return f.read()
        except Exception:
            pass
        
        return ""
    
    def extract_date(self, text: str) -> Optional[date]:
        """Extract invoice date from text"""
        for pattern in self.date_patterns:
            matches = re.findall(pattern, text.lower())
            if matches:
                try:
                    match = matches[0]
                    if len(match) == 3:
                        if match[0].isdigit() and match[1].isdigit() and match[2].isdigit():
                            part1, part2, part3 = int(match[0]), int(match[1]), int(match[2])
                            # Handle YYYY-MM-DD format (first part > 31)
                            if part1 > 31:
                                year, month, day = part1, part2, part3
                            else:
                                # DD-MM-YYYY format
                                day, month, year = part1, part2, part3
                            return date(year, month, day)
                except (ValueError, IndexError):
                    continue
        return date.today()
    
    def extract_amount(self, text: str) -> Decimal:
        """Extract total amount from text"""
        for pattern in self.amount_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            if matches:
                try:
                    amounts = [Decimal(m.replace(',', '.')) for m in matches]
                    return max(amounts)
                except Exception:
                    continue
        return Decimal('0.00')
    
    def extract_vat(self, text: str, total: Decimal, default_rate: Decimal = Decimal('0.21')) -> Tuple[Decimal, Decimal]:
        """Extract VAT amount and calculate net
        
        Args:
            text: OCR extracted text
            total: Total invoice amount
            default_rate: Default VAT rate to use if not found (default 21% for Netherlands)
        """
        for pattern in self.vat_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            if matches:
                try:
                    vat_amount = Decimal(matches[0].replace(',', '.'))
                    net_amount = total - vat_amount
                    return (vat_amount, net_amount)
                except Exception:
                    continue
        
        # Estimate VAT using default rate (21% for Netherlands)
        vat_amount = total * default_rate / (Decimal('1') + default_rate)
        net_amount = total - vat_amount
        return (vat_amount.quantize(Decimal('0.01')), net_amount.quantize(Decimal('0.01')))
    
    def extract_merchant(self, text: str) -> str:
        """Extract merchant name"""
        lines = [line.strip() for line in text.split('\n') if line.strip()]
        if lines:
            merchant = lines[0]
            merchant = re.sub(r'[^a-zA-Z0-9\s&.-]', '', merchant)
            return merchant.strip()[:100] or "Unknown Merchant"
        return "Unknown Merchant"
    
    def process(self, file_path: str, original_filename: str = "") -> Dict:
        """Complete processing pipeline"""
        logger.info(f"Processing document: {file_path}")
        
        text = self.extract_text(file_path)
        
        if not text.strip():
            # Use filename as fallback
            text = original_filename
        
        merchant = self.extract_merchant(text)
        invoice_date = self.extract_date(text)
        total_amount = self.extract_amount(text)
        
        if total_amount == Decimal('0.00'):
            total_amount = Decimal('100.00')  # Default for demo
        
        vat_amount, net_amount = self.extract_vat(text, total_amount)
        
        account_code, account_name, confidence = LedgerAccountPredictor.predict(
            merchant, text[:500]
        )
        
        result = {
            'merchant': merchant,
            'invoice_date': invoice_date.isoformat(),
            'total_amount': float(total_amount),
            'vat_amount': float(vat_amount),
            'net_amount': float(net_amount),
            'predicted_account_code': account_code,
            'predicted_account_name': account_name,
            'prediction_confidence': confidence,
            'ocr_text': text[:2000],
            'processed_at': datetime.utcnow().isoformat()
        }
        
        logger.info(f"Extracted: {merchant} - €{total_amount} - Account: {account_code}")
        return result


class DatabaseManager:
    """PostgreSQL database operations"""
    
    def __init__(self, db_url: str):
        self.db_url = db_url
        self.conn = None
    
    def connect(self):
        """Establish database connection"""
        self.conn = psycopg2.connect(self.db_url)
        logger.info("Database connection established")
    
    def close(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()
    
    def get_or_create_account(self, administration_id: str, account_code: str, account_name: str) -> str:
        """Get or create ledger account"""
        cursor = self.conn.cursor(cursor_factory=RealDictCursor)
        
        try:
            cursor.execute("""
                SELECT id FROM chart_of_accounts
                WHERE administration_id = %s AND account_code = %s
            """, (administration_id, account_code))
            
            result = cursor.fetchone()
            if result:
                return str(result['id'])
            
            account_id = str(uuid.uuid4())
            cursor.execute("""
                INSERT INTO chart_of_accounts
                (id, administration_id, account_code, account_name, account_type, is_active)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (account_id, administration_id, account_code, account_name, 'EXPENSE', True))
            
            self.conn.commit()
            return account_id
            
        finally:
            cursor.close()
    
    def get_vat_code_id(self, code: str = 'BTW_HOOG') -> Optional[str]:
        """Get VAT code ID"""
        cursor = self.conn.cursor(cursor_factory=RealDictCursor)
        try:
            cursor.execute("SELECT id FROM vat_codes WHERE code = %s", (code,))
            result = cursor.fetchone()
            return str(result['id']) if result else None
        finally:
            cursor.close()
    
    def check_existing_transaction(self, document_id: str) -> bool:
        """Check if transaction already exists for document (idempotency)"""
        cursor = self.conn.cursor()
        try:
            cursor.execute(
                "SELECT id FROM transactions WHERE document_id = %s",
                (document_id,)
            )
            return cursor.fetchone() is not None
        finally:
            cursor.close()
    
    def create_draft_transaction(
        self,
        administration_id: str,
        document_id: str,
        invoice_data: Dict
    ) -> str:
        """Create draft transaction with double-entry bookkeeping"""
        cursor = self.conn.cursor()
        
        try:
            transaction_id = str(uuid.uuid4())
            booking_number = f"DRAFT-{int(time.time())}"
            
            # Get expense account
            expense_account_id = self.get_or_create_account(
                administration_id,
                invoice_data['predicted_account_code'],
                invoice_data['predicted_account_name']
            )
            
            # Get crediteuren account
            payable_account_id = self.get_or_create_account(
                administration_id,
                '1600',
                'Crediteuren'
            )
            
            # Get VAT code
            vat_code_id = self.get_vat_code_id('BTW_HOOG')
            
            # Create transaction
            cursor.execute("""
                INSERT INTO transactions
                (id, administration_id, document_id, booking_number, transaction_date, description, status, ai_confidence_score)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                transaction_id,
                administration_id,
                document_id,
                booking_number,
                invoice_data['invoice_date'],
                f"AUTO: {invoice_data['merchant']}",
                'DRAFT',
                invoice_data['prediction_confidence']
            ))
            
            # DEBIT line (Expense - net amount)
            cursor.execute("""
                INSERT INTO transaction_lines
                (id, transaction_id, account_id, vat_code_id, description, debit_amount, credit_amount)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (
                str(uuid.uuid4()),
                transaction_id,
                expense_account_id,
                vat_code_id,
                f"Expense: {invoice_data['merchant']}",
                float(invoice_data['net_amount']),
                0.00
            ))
            
            # DEBIT line (VAT receivable)
            vat_account_id = self.get_or_create_account(
                administration_id,
                '1800',
                'Te vorderen BTW'
            )
            cursor.execute("""
                INSERT INTO transaction_lines
                (id, transaction_id, account_id, description, debit_amount, credit_amount)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (
                str(uuid.uuid4()),
                transaction_id,
                vat_account_id,
                f"BTW: {invoice_data['merchant']}",
                float(invoice_data['vat_amount']),
                0.00
            ))
            
            # CREDIT line (Crediteuren - total amount)
            cursor.execute("""
                INSERT INTO transaction_lines
                (id, transaction_id, account_id, description, debit_amount, credit_amount)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (
                str(uuid.uuid4()),
                transaction_id,
                payable_account_id,
                f"Payable: {invoice_data['merchant']}",
                0.00,
                float(invoice_data['total_amount'])
            ))
            
            self.conn.commit()
            logger.info(f"Created DRAFT transaction {booking_number}")
            return transaction_id
            
        except Exception as e:
            self.conn.rollback()
            logger.error(f"Failed to create transaction: {e}")
            raise
        finally:
            cursor.close()
    
    def update_document_status(self, document_id: str, status: str, error_message: str = None):
        """Update document status"""
        cursor = self.conn.cursor()
        try:
            if error_message:
                cursor.execute("""
                    UPDATE documents
                    SET status = %s, error_message = %s, updated_at = NOW()
                    WHERE id = %s
                """, (status, error_message, document_id))
            else:
                cursor.execute("""
                    UPDATE documents
                    SET status = %s, updated_at = NOW()
                    WHERE id = %s
                """, (status, document_id))
            self.conn.commit()
        finally:
            cursor.close()
    
    def save_extracted_fields(self, document_id: str, invoice_data: Dict):
        """Save extracted fields"""
        cursor = self.conn.cursor()
        try:
            fields = [
                ('merchant', invoice_data['merchant'], invoice_data['prediction_confidence']),
                ('invoice_date', invoice_data['invoice_date'], 80),
                ('total_amount', str(invoice_data['total_amount']), 70),
                ('vat_amount', str(invoice_data['vat_amount']), 60),
                ('net_amount', str(invoice_data['net_amount']), 60),
                ('predicted_account', f"{invoice_data['predicted_account_code']} - {invoice_data['predicted_account_name']}", invoice_data['prediction_confidence']),
            ]
            
            for field_name, field_value, confidence in fields:
                cursor.execute("""
                    INSERT INTO extracted_fields
                    (id, document_id, field_name, field_value, confidence, raw_json)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (
                    str(uuid.uuid4()),
                    document_id,
                    field_name,
                    field_value,
                    confidence,
                    json.dumps(invoice_data)
                ))
            
            self.conn.commit()
        finally:
            cursor.close()


class Worker:
    """Redis Streams worker"""
    
    def __init__(self, db_url: str, redis_url: str, stream_name: str = "document_processing_stream"):
        self.db_url = db_url
        self.redis_url = redis_url
        self.stream_name = stream_name
        self.consumer_group = "workers"
        self.consumer_name = f"worker-{uuid.uuid4().hex[:8]}"
        
        self.processor = DocumentProcessor()
        self.db_manager = DatabaseManager(db_url)
    
    def setup_redis(self):
        """Setup Redis client and consumer group"""
        self.redis_client = redis.from_url(self.redis_url)
        
        try:
            self.redis_client.xgroup_create(
                self.stream_name,
                self.consumer_group,
                id='0',
                mkstream=True
            )
            logger.info(f"Created consumer group: {self.consumer_group}")
        except redis.ResponseError as e:
            if "BUSYGROUP" not in str(e):
                raise
            logger.info(f"Consumer group already exists: {self.consumer_group}")
    
    def process_job(self, job_data: Dict):
        """Process a single document job"""
        document_id = job_data.get('document_id')
        administration_id = job_data.get('administration_id')
        storage_path = job_data.get('storage_path')
        original_filename = job_data.get('original_filename', '')
        
        logger.info(f"Processing job: document={document_id}")
        
        try:
            self.db_manager.connect()
            
            # Check idempotency
            if self.db_manager.check_existing_transaction(document_id):
                logger.info(f"Transaction already exists for document {document_id}, skipping")
                return
            
            # Mark as processing
            self.db_manager.update_document_status(document_id, 'PROCESSING')
            
            # Process document
            invoice_data = self.processor.process(storage_path, original_filename)
            
            # Save extracted fields
            self.db_manager.save_extracted_fields(document_id, invoice_data)
            
            # Create draft transaction
            self.db_manager.create_draft_transaction(
                administration_id,
                document_id,
                invoice_data
            )
            
            # Mark as ready
            self.db_manager.update_document_status(document_id, 'DRAFT_READY')
            logger.info(f"Successfully processed document {document_id}")
            
        except Exception as e:
            logger.error(f"Failed to process document {document_id}: {e}")
            try:
                self.db_manager.update_document_status(document_id, 'FAILED', str(e))
            except Exception:
                pass
        finally:
            self.db_manager.close()
    
    def run(self):
        """Main worker loop"""
        logger.info("=" * 60)
        logger.info("Smart Accounting Platform - Worker Service")
        logger.info("=" * 60)
        logger.info(f"Stream: {self.stream_name}")
        logger.info(f"Consumer Group: {self.consumer_group}")
        logger.info(f"Consumer Name: {self.consumer_name}")
        logger.info("=" * 60)
        
        self.setup_redis()
        
        while True:
            try:
                # Read from stream
                messages = self.redis_client.xreadgroup(
                    self.consumer_group,
                    self.consumer_name,
                    {self.stream_name: '>'},
                    count=1,
                    block=5000  # 5 second timeout
                )
                
                if messages:
                    for stream, msg_list in messages:
                        for msg_id, msg_data in msg_list:
                            try:
                                # Decode bytes to string
                                job_data = {
                                    k.decode() if isinstance(k, bytes) else k: 
                                    v.decode() if isinstance(v, bytes) else v
                                    for k, v in msg_data.items()
                                }
                                
                                logger.info(f"Received job: {msg_id}")
                                self.process_job(job_data)
                                
                                # Acknowledge message
                                self.redis_client.xack(
                                    self.stream_name,
                                    self.consumer_group,
                                    msg_id
                                )
                            except Exception as e:
                                logger.error(f"Error processing message {msg_id}: {e}")
                
            except redis.ConnectionError as e:
                logger.error(f"Redis connection error: {e}")
                time.sleep(5)
            except Exception as e:
                logger.error(f"Worker error: {e}")
                time.sleep(5)


def main():
    """Entry point"""
    db_url = os.environ.get(
        "DATABASE_URL",
        "postgresql://accounting_user:change_me@db:5432/accounting_db"
    )
    redis_url = os.environ.get(
        "REDIS_URL",
        "redis://redis:6379/0"
    )
    
    worker = Worker(db_url, redis_url)
    worker.run()


if __name__ == "__main__":
    main()
