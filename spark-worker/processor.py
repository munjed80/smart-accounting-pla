"""
Smart Accounting Platform - Intelligent Invoice Processor
Production-Grade Apache Spark Job for OCR + AI-Powered Bookkeeping

Capabilities:
- Continuous monitoring of Redis queue and uploads folder
- Advanced OCR with Tesseract
- Intelligent ledger account prediction using keyword mapping
- Automatic draft transaction creation in PostgreSQL
- VAT extraction and calculation
- Merchant identification and categorization
"""

import os
import re
import time
import json
import logging
from datetime import datetime, date
from decimal import Decimal
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import uuid

import redis
import pytesseract
from PIL import Image
import psycopg2
from psycopg2.extras import RealDictCursor
from pyspark.sql import SparkSession

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class LedgerAccountPredictor:
    """
    AI-Powered Ledger Account Prediction Engine
    Uses keyword mapping and pattern matching to intelligently categorize expenses
    """
    
    ACCOUNT_RULES = {
        # Transportation & Fuel (4300-4399)
        '4310': {
            'name': 'Brandstof (Fuel)',
            'keywords': ['shell', 'bp', 'esso', 'texaco', 'total', 'tankstation', 'fuel', 'benzine', 'diesel'],
            'priority': 1
        },
        '4300': {
            'name': 'Reiskosten Auto (Car Travel)',
            'keywords': ['parkeren', 'parking', 'tolweg', 'toll', 'vignette', 'snelweg'],
            'priority': 1
        },
        
        # Office & Supplies (4400-4499)
        '4400': {
            'name': 'Kantoorbenodigdheden (Office Supplies)',
            'keywords': ['staples', 'office centre', 'viking', 'kantoor', 'printer', 'papier', 'toner', 'pen'],
            'priority': 2
        },
        
        # IT & Software (4500-4599)
        '4500': {
            'name': 'Automatiseringskosten (IT Costs)',
            'keywords': ['microsoft', 'google workspace', 'adobe', 'dropbox', 'hosting', 'domain', 'aws', 'azure', 'digitalocean', 'heroku'],
            'priority': 1
        },
        '4510': {
            'name': 'Software Licenties',
            'keywords': ['software', 'saas', 'subscription', 'license', 'licentie'],
            'priority': 2
        },
        
        # Marketing & Advertising (4600-4699)
        '4600': {
            'name': 'Reclame & Marketing',
            'keywords': ['google ads', 'facebook ads', 'meta', 'linkedin', 'advertentie', 'marketing', 'reclame'],
            'priority': 1
        },
        
        # Meals & Entertainment (4700-4799)
        '4710': {
            'name': 'Representatiekosten (Business Entertainment)',
            'keywords': ['restaurant', 'cafe', 'lunch', 'dinner', 'horeca'],
            'priority': 2
        },
        '4720': {
            'name': 'Zakelijke Maaltijden',
            'keywords': ['deliveroo', 'uber eats', 'thuisbezorgd'],
            'priority': 2
        },
        
        # Groceries (often private/mixed)
        '1450': {
            'name': 'Prive Uitgaven (Private Expenses)',
            'keywords': ['albert heijn', 'jumbo', 'lidl', 'aldi', 'plus', 'ah', 'supermarkt'],
            'priority': 3
        },
        
        # Professional Services (4800-4899)
        '4800': {
            'name': 'Accountantskosten',
            'keywords': ['accountant', 'boekhouder', 'administratie'],
            'priority': 1
        },
        '4810': {
            'name': 'Juridische Kosten',
            'keywords': ['advocaat', 'notaris', 'legal', 'rechtsbijstand'],
            'priority': 1
        },
        
        # Subscriptions & Services (4900-4999)
        '4900': {
            'name': 'Abonnementen & Diensten',
            'keywords': ['subscription', 'abonnement', 'netflix', 'spotify', 'monthly fee'],
            'priority': 3
        },
        
        # Utilities (5000-5099)
        '5010': {
            'name': 'Telefoon & Internet',
            'keywords': ['kpn', 'vodafone', 'tmobile', 'ziggo', 'telecom', 'internet', 'mobile'],
            'priority': 1
        },
        
        # Default fallback
        '4999': {
            'name': 'Overige Bedrijfskosten (Other Expenses)',
            'keywords': [],
            'priority': 99
        }
    }
    
    @classmethod
    def predict(cls, merchant_name: str, description: str = "") -> Tuple[str, str, int]:
        """
        Predict the most appropriate ledger account based on merchant and description
        
        Returns:
            Tuple[account_code, account_name, confidence_score]
        """
        text = f"{merchant_name} {description}".lower()
        
        best_match = None
        best_score = 0
        
        for account_code, rule in cls.ACCOUNT_RULES.items():
            if not rule['keywords']:
                continue
            
            matches = sum(1 for keyword in rule['keywords'] if keyword in text)
            
            if matches > 0:
                # Score = matches * (100 / priority)
                score = matches * (100 // rule['priority'])
                
                if score > best_score:
                    best_score = score
                    best_match = (account_code, rule['name'], score)
        
        # Fallback to "Overige Bedrijfskosten"
        if not best_match:
            return ('4999', cls.ACCOUNT_RULES['4999']['name'], 10)
        
        return best_match


class InvoiceOCRProcessor:
    """
    Advanced OCR Engine for Invoice Data Extraction
    Supports multiple invoice formats and Dutch accounting standards
    """
    
    # Dutch VAT rates (2024)
    VAT_RATES = {
        '21%': 0.21,  # Standard rate
        '9%': 0.09,   # Reduced rate (food, books, etc.)
        '0%': 0.00,   # Zero-rated
    }
    
    def __init__(self):
        self.date_patterns = [
            r'\b(\d{2})[/-](\d{2})[/-](\d{4})\b',  # DD-MM-YYYY or DD/MM/YYYY
            r'\b(\d{4})[/-](\d{2})[/-](\d{2})\b',  # YYYY-MM-DD
            r'\b(\d{2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})\b',  # DD Month YYYY
        ]
        
        self.amount_patterns = [
            r'totaal[:\s]+€?\s*(\d+[.,]\d{2})',
            r'total[:\s]+€?\s*(\d+[.,]\d{2})',
            r'te\s+betalen[:\s]+€?\s*(\d+[.,]\d{2})',
            r'bedrag[:\s]+€?\s*(\d+[.,]\d{2})',
            r'€\s*(\d+[.,]\d{2})\s*$',
        ]
        
        self.vat_patterns = [
            r'btw\s+21%[:\s]+€?\s*(\d+[.,]\d{2})',
            r'vat\s+21%[:\s]+€?\s*(\d+[.,]\d{2})',
            r'21%\s+btw[:\s]+€?\s*(\d+[.,]\d{2})',
        ]
    
    def extract_text(self, image_path: str) -> str:
        """Extract text from image using Tesseract OCR"""
        try:
            image = Image.open(image_path)
            
            # Optimize image for OCR
            image = image.convert('L')  # Convert to grayscale
            
            # Extract text with Dutch language support
            text = pytesseract.image_to_string(
                image,
                lang='nld+eng',
                config='--psm 6'  # Assume uniform block of text
            )
            
            logger.info(f"OCR extracted {len(text)} characters from {image_path}")
            return text
            
        except Exception as e:
            logger.error(f"OCR extraction failed for {image_path}: {e}")
            return ""
    
    def extract_date(self, text: str) -> Optional[date]:
        """Extract invoice date from OCR text"""
        text_lower = text.lower()
        
        for pattern in self.date_patterns:
            matches = re.findall(pattern, text_lower, re.IGNORECASE)
            
            if matches:
                try:
                    match = matches[0]
                    
                    # Handle DD-MM-YYYY
                    if isinstance(match, tuple) and len(match) == 3:
                        if match[0].isdigit() and match[1].isdigit() and match[2].isdigit():
                            day, month, year = int(match[0]), int(match[1]), int(match[2])
                            if day > 31:  # Likely YYYY-MM-DD
                                year, month, day = day, month, year
                            return date(year, month, day)
                    
                except (ValueError, IndexError) as e:
                    logger.debug(f"Date parsing failed for match {match}: {e}")
                    continue
        
        # Fallback to today's date
        logger.warning("No date found in invoice, using current date")
        return date.today()
    
    def extract_amount(self, text: str) -> Decimal:
        """Extract total amount from OCR text"""
        for pattern in self.amount_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            
            if matches:
                try:
                    # Take the largest amount (usually the total)
                    amounts = [Decimal(m.replace(',', '.')) for m in matches]
                    return max(amounts)
                except Exception as e:
                    logger.debug(f"Amount parsing failed: {e}")
                    continue
        
        logger.warning("No amount found in invoice")
        return Decimal('0.00')
    
    def extract_vat(self, text: str, total: Decimal) -> Tuple[Decimal, Decimal]:
        """
        Extract VAT amount and calculate net amount
        
        Returns:
            Tuple[vat_amount, net_amount]
        """
        for pattern in self.vat_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            
            if matches:
                try:
                    vat_amount = Decimal(matches[0].replace(',', '.'))
                    net_amount = total - vat_amount
                    return (vat_amount, net_amount)
                except Exception as e:
                    logger.debug(f"VAT parsing failed: {e}")
                    continue
        
        # Estimate VAT (assume 21% included in total)
        vat_amount = total * Decimal('0.21') / Decimal('1.21')
        net_amount = total - vat_amount
        
        logger.info(f"Estimated VAT: {vat_amount:.2f} from total {total:.2f}")
        return (vat_amount, net_amount)
    
    def extract_merchant(self, text: str) -> str:
        """Extract merchant/vendor name from invoice (first few lines)"""
        lines = [line.strip() for line in text.split('\n') if line.strip()]
        
        if lines:
            # Usually the merchant name is in the first 1-3 lines
            merchant = lines[0]
            
            # Clean up common OCR artifacts
            merchant = re.sub(r'[^a-zA-Z0-9\s&.-]', '', merchant)
            merchant = merchant.strip()
            
            return merchant[:100]  # Limit length
        
        return "Unknown Merchant"
    
    def process(self, image_path: str) -> Dict:
        """
        Complete OCR processing pipeline
        
        Returns:
            Dict with extracted invoice data
        """
        logger.info(f"Processing invoice: {image_path}")
        
        text = self.extract_text(image_path)
        
        merchant = self.extract_merchant(text)
        invoice_date = self.extract_date(text)
        total_amount = self.extract_amount(text)
        vat_amount, net_amount = self.extract_vat(text, total_amount)
        
        # Predict ledger account
        account_code, account_name, confidence = LedgerAccountPredictor.predict(
            merchant, text[:500]  # Use first 500 chars for context
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
            'ocr_text': text,
            'processed_at': datetime.utcnow().isoformat()
        }
        
        logger.info(f"Extracted: {merchant} - €{total_amount} - Account: {account_code} ({confidence}% confidence)")
        
        return result


class DatabaseManager:
    """
    PostgreSQL Database Manager for Draft Transaction Creation
    """
    
    def __init__(self, db_url: str):
        self.db_url = db_url
        self.conn = None
    
    def connect(self):
        """Establish database connection"""
        try:
            self.conn = psycopg2.connect(self.db_url)
            logger.info("Database connection established")
        except Exception as e:
            logger.error(f"Database connection failed: {e}")
            raise
    
    def close(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()
            logger.info("Database connection closed")
    
    def get_or_create_ledger_account(
        self,
        administration_id: str,
        account_code: str,
        account_name: str
    ) -> str:
        """
        Get existing ledger account or create new one
        
        Returns:
            ledger_account_id (UUID)
        """
        cursor = self.conn.cursor(cursor_factory=RealDictCursor)
        
        try:
            # Check if account exists
            cursor.execute("""
                SELECT id FROM general_ledger
                WHERE administration_id = %s AND account_code = %s
            """, (administration_id, account_code))
            
            result = cursor.fetchone()
            
            if result:
                return str(result['id'])
            
            # Create new account
            ledger_id = str(uuid.uuid4())
            cursor.execute("""
                INSERT INTO general_ledger
                (id, administration_id, account_code, account_name, account_type, is_active)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (ledger_id, administration_id, account_code, account_name, 'EXPENSE', True))
            
            self.conn.commit()
            logger.info(f"Created ledger account: {account_code} - {account_name}")
            
            return ledger_id
            
        except Exception as e:
            self.conn.rollback()
            logger.error(f"Failed to get/create ledger account: {e}")
            raise
        finally:
            cursor.close()
    
    def create_draft_transaction(
        self,
        administration_id: str,
        invoice_data: Dict,
        document_id: Optional[str] = None
    ) -> str:
        """
        Create a draft transaction with intelligent double-entry bookkeeping
        
        Transaction Structure:
        - DEBIT: Expense Account (predicted)
        - CREDIT: Crediteuren (Accounts Payable) - Account 1600
        
        Returns:
            transaction_id (UUID)
        """
        cursor = self.conn.cursor()
        
        try:
            transaction_id = str(uuid.uuid4())
            booking_number = f"DRAFT-{int(time.time())}"
            
            # Get or create expense ledger account
            expense_account_id = self.get_or_create_ledger_account(
                administration_id,
                invoice_data['predicted_account_code'],
                invoice_data['predicted_account_name']
            )
            
            # Get or create Accounts Payable account (1600)
            payable_account_id = self.get_or_create_ledger_account(
                administration_id,
                '1600',
                'Crediteuren (Accounts Payable)'
            )
            
            # Create transaction header
            cursor.execute("""
                INSERT INTO transactions
                (id, administration_id, booking_number, transaction_date, description, status)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (
                transaction_id,
                administration_id,
                booking_number,
                invoice_data['invoice_date'],
                f"AUTO: {invoice_data['merchant']} - AI Confidence: {invoice_data['prediction_confidence']}%",
                'DRAFT'
            ))
            
            # Create DEBIT line (Expense)
            cursor.execute("""
                INSERT INTO transaction_lines
                (id, transaction_id, ledger_account_id, description, debit, credit, vat_code, vat_percentage, vat_amount)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                str(uuid.uuid4()),
                transaction_id,
                expense_account_id,
                f"Expense: {invoice_data['merchant']}",
                float(invoice_data['net_amount']),
                0.00,
                'BTW_HOOG',
                21.0,
                float(invoice_data['vat_amount'])
            ))
            
            # Create CREDIT line (Accounts Payable)
            cursor.execute("""
                INSERT INTO transaction_lines
                (id, transaction_id, ledger_account_id, description, debit, credit, vat_code, vat_percentage, vat_amount)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (
                str(uuid.uuid4()),
                transaction_id,
                payable_account_id,
                f"Payable: {invoice_data['merchant']}",
                0.00,
                float(invoice_data['total_amount']),
                None,
                None,
                0.00
            ))
            
            # Link document to transaction if provided
            if document_id:
                cursor.execute("""
                    UPDATE documents
                    SET transaction_id = %s, ocr_status = %s, ocr_data = %s, ocr_processed_at = %s
                    WHERE id = %s
                """, (
                    transaction_id,
                    'PROCESSED',
                    json.dumps(invoice_data),
                    datetime.utcnow(),
                    document_id
                ))
            
            self.conn.commit()
            
            logger.info(f"✅ Created DRAFT transaction {booking_number} for {invoice_data['merchant']} - €{invoice_data['total_amount']}")
            
            return transaction_id
            
        except Exception as e:
            self.conn.rollback()
            logger.error(f"Failed to create draft transaction: {e}")
            raise
        finally:
            cursor.close()
    
    def get_default_administration(self) -> Optional[str]:
        """Get the first active administration (for demo purposes)"""
        cursor = self.conn.cursor(cursor_factory=RealDictCursor)
        
        try:
            cursor.execute("""
                SELECT id FROM administrations
                WHERE is_active = TRUE
                LIMIT 1
            """)
            
            result = cursor.fetchone()
            
            if result:
                return str(result['id'])
            
            logger.warning("No active administration found in database")
            return None
            
        finally:
            cursor.close()


class SparkInvoiceProcessor:
    """
    Main Spark Job Orchestrator
    Monitors Redis queue and uploads folder for new invoices
    """
    
    def __init__(
        self,
        db_url: str,
        redis_url: str,
        uploads_path: str = "/opt/spark-data",
        queue_name: str = "invoice_processing_queue"
    ):
        self.db_url = db_url
        self.redis_url = redis_url
        self.uploads_path = Path(uploads_path)
        self.queue_name = queue_name
        
        self.ocr_processor = InvoiceOCRProcessor()
        self.db_manager = DatabaseManager(db_url)
        
        # Initialize Redis
        self.redis_client = redis.from_url(redis_url)
        
        # Initialize Spark (optional for this use case, but included for scalability)
        self.spark = SparkSession.builder \
            .appName("SmartAccountingOCR") \
            .master("spark://spark-master:7077") \
            .config("spark.executor.memory", "2g") \
            .config("spark.driver.memory", "1g") \
            .getOrCreate()
        
        logger.info("Spark Invoice Processor initialized")
    
    def process_invoice_file(self, file_path: str, document_id: Optional[str] = None):
        """Process a single invoice file"""
        try:
            # OCR + AI Processing
            invoice_data = self.ocr_processor.process(file_path)
            
            # Connect to database
            self.db_manager.connect()
            
            # Get default administration (in production, this would come from the upload metadata)
            admin_id = self.db_manager.get_default_administration()
            
            if not admin_id:
                logger.error("Cannot create draft transaction: No administration found")
                return
            
            # Create draft transaction
            transaction_id = self.db_manager.create_draft_transaction(
                admin_id,
                invoice_data,
                document_id
            )
            
            logger.info(f"✅ Successfully processed {file_path} -> Transaction {transaction_id}")
            
        except Exception as e:
            logger.error(f"Failed to process invoice {file_path}: {e}")
        finally:
            self.db_manager.close()
    
    def watch_redis_queue(self):
        """Watch Redis queue for new invoice processing tasks"""
        logger.info(f"👀 Watching Redis queue: {self.queue_name}")
        
        while True:
            try:
                # Blocking pop with 5 second timeout
                message = self.redis_client.blpop(self.queue_name, timeout=5)
                
                if message:
                    _, payload = message
                    data = json.loads(payload)
                    
                    file_path = data.get('file_path')
                    document_id = data.get('document_id')
                    
                    logger.info(f"📨 Received invoice processing task: {file_path}")
                    
                    self.process_invoice_file(file_path, document_id)
                
            except Exception as e:
                logger.error(f"Redis queue error: {e}")
                time.sleep(5)
    
    def watch_uploads_folder(self):
        """Watch uploads folder for new files (polling mode)"""
        logger.info(f"👀 Watching uploads folder: {self.uploads_path}")
        
        processed_files = set()
        
        while True:
            try:
                if not self.uploads_path.exists():
                    logger.warning(f"Uploads path does not exist: {self.uploads_path}")
                    time.sleep(10)
                    continue
                
                # Find image files
                image_files = list(self.uploads_path.glob("**/*.jpg")) + \
                             list(self.uploads_path.glob("**/*.png")) + \
                             list(self.uploads_path.glob("**/*.pdf"))
                
                for file_path in image_files:
                    file_str = str(file_path)
                    
                    if file_str not in processed_files:
                        logger.info(f"📂 Found new invoice: {file_str}")
                        
                        self.process_invoice_file(file_str)
                        processed_files.add(file_str)
                
                time.sleep(10)  # Poll every 10 seconds
                
            except Exception as e:
                logger.error(f"Folder watch error: {e}")
                time.sleep(10)
    
    def run(self, mode: str = "redis"):
        """
        Start the processor
        
        Args:
            mode: 'redis' or 'folder'
        """
        logger.info(f"🚀 Starting Smart Invoice Processor in {mode} mode")
        
        if mode == "redis":
            self.watch_redis_queue()
        elif mode == "folder":
            self.watch_uploads_folder()
        else:
            logger.error(f"Invalid mode: {mode}. Use 'redis' or 'folder'")


def main():
    """Entry point for Spark job"""
    
    # Configuration from environment variables
    DB_URL = os.getenv(
        "DATABASE_URL",
        "postgresql://accounting_user:change_me@db:5432/accounting_db"
    )
    
    REDIS_URL = os.getenv(
        "REDIS_URL",
        "redis://redis:6379/0"
    )
    
    UPLOADS_PATH = os.getenv(
        "UPLOADS_PATH",
        "/opt/spark-data"
    )
    
    MODE = os.getenv("PROCESSOR_MODE", "folder")  # 'redis' or 'folder'
    
    logger.info("=" * 80)
    logger.info("Smart Accounting Platform - Intelligent Invoice Processor")
    logger.info("=" * 80)
    logger.info(f"Database: {DB_URL.split('@')[1] if '@' in DB_URL else DB_URL}")
    logger.info(f"Redis: {REDIS_URL}")
    logger.info(f"Uploads: {UPLOADS_PATH}")
    logger.info(f"Mode: {MODE}")
    logger.info("=" * 80)
    
    processor = SparkInvoiceProcessor(
        db_url=DB_URL,
        redis_url=REDIS_URL,
        uploads_path=UPLOADS_PATH
    )
    
    processor.run(mode=MODE)


if __name__ == "__main__":
    main()
