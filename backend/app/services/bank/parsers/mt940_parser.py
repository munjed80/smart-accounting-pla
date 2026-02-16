"""
MT940 Parser - SWIFT Bank Statement Format

Parses MT940 text files (Statement Message).
This is a legacy but widely-used format for bank statements.

Format: Plain text with tags like :20:, :25:, :60F:, :61:, :86:, :62F:
"""
import re
from datetime import datetime, date
from decimal import Decimal
from typing import List, Optional, Dict

from .base_parser import BaseStatementParser, ParsedTransaction


class MT940Parser(BaseStatementParser):
    """
    Parser for MT940 SWIFT bank statements.
    
    MT940 is a plain text format with specific tags for transaction data.
    Each statement contains:
    - :20: Transaction Reference Number
    - :25: Account Identification
    - :60F: Opening Balance
    - :61: Statement Line (transaction)
    - :86: Information to Account Owner (description)
    - :62F: Closing Balance
    """
    
    def can_parse(self, file_bytes: bytes, filename: Optional[str] = None) -> bool:
        """Check if file is MT940 format."""
        # Check file extension
        if filename and (filename.lower().endswith('.sta') or filename.lower().endswith('.mt940') or filename.lower().endswith('.txt')):
            try:
                content = file_bytes.decode('utf-8')
                # Check for MT940 markers
                if ':20:' in content and ':61:' in content:
                    return True
            except UnicodeDecodeError:
                return False
        
        # Try decoding and checking for MT940 tags
        try:
            content = file_bytes.decode('utf-8')
            # MT940 files must have transaction reference and statement lines
            if ':20:' in content and ':61:' in content:
                return True
        except UnicodeDecodeError:
            try:
                content = file_bytes.decode('latin-1')
                if ':20:' in content and ':61:' in content:
                    return True
            except UnicodeDecodeError:
                return False
        
        return False
    
    def parse(self, file_bytes: bytes) -> tuple[List[ParsedTransaction], Optional[str]]:
        """Parse MT940 file."""
        # Try UTF-8 first, then latin-1
        try:
            content = file_bytes.decode('utf-8')
        except UnicodeDecodeError:
            try:
                content = file_bytes.decode('latin-1')
            except UnicodeDecodeError:
                raise ValueError("Invalid encoding for MT940 file")
        
        # Extract account IBAN
        account_iban = self._extract_account_iban(content)
        
        # Parse transactions
        transactions = self._parse_transactions(content)
        
        return transactions, account_iban
    
    def get_format_name(self) -> str:
        return "MT940 (SWIFT)"
    
    def _extract_account_iban(self, content: str) -> Optional[str]:
        """Extract account IBAN from :25: tag."""
        # :25: tag contains account identification
        match = re.search(r':25:([^\n]+)', content)
        if match:
            account_info = match.group(1).strip()
            # IBAN is usually after a space or slash
            # Format can be: :25:NL91ABNA0417164300 or :25:12345/NL91ABNA0417164300
            parts = re.split(r'[/\s]', account_info)
            for part in parts:
                # Check if this looks like an IBAN (starts with 2 letters)
                if len(part) > 10 and part[:2].isalpha() and part[2:].replace(' ', '').isalnum():
                    return part.replace(' ', '').upper()
        
        return None
    
    def _parse_transactions(self, content: str) -> List[ParsedTransaction]:
        """Parse all transactions from MT940 content."""
        transactions = []
        
        # Split content by :61: tags (statement lines)
        # Each :61: represents a transaction
        lines = content.split('\n')
        
        current_transaction = None
        current_description_lines = []
        
        i = 0
        while i < len(lines):
            line = lines[i].strip()
            
            # New transaction starts with :61:
            if line.startswith(':61:'):
                # Save previous transaction if exists
                if current_transaction:
                    description = self._build_description(current_description_lines)
                    if description:
                        current_transaction['description'] = description
                    try:
                        parsed = self._create_transaction(current_transaction)
                        if parsed:
                            transactions.append(parsed)
                    except Exception as e:
                        print(f"Warning: Failed to parse MT940 transaction: {e}")
                
                # Start new transaction
                current_transaction = self._parse_statement_line(line)
                current_description_lines = []
            
            # Description follows with :86: tag
            elif line.startswith(':86:') and current_transaction:
                desc = line[4:].strip()  # Remove :86: prefix
                if desc:
                    current_description_lines.append(desc)
            
            # Multi-line description continuation
            elif current_description_lines and not line.startswith(':') and line:
                current_description_lines.append(line)
            
            # End of statement
            elif line.startswith(':62') and current_transaction:
                # Save last transaction
                description = self._build_description(current_description_lines)
                if description:
                    current_transaction['description'] = description
                try:
                    parsed = self._create_transaction(current_transaction)
                    if parsed:
                        transactions.append(parsed)
                except Exception as e:
                    print(f"Warning: Failed to parse MT940 transaction: {e}")
                current_transaction = None
                current_description_lines = []
            
            i += 1
        
        # Handle last transaction if not closed by :62:
        if current_transaction:
            description = self._build_description(current_description_lines)
            if description:
                current_transaction['description'] = description
            try:
                parsed = self._create_transaction(current_transaction)
                if parsed:
                    transactions.append(parsed)
            except Exception:
                pass
        
        return transactions
    
    def _parse_statement_line(self, line: str) -> Dict:
        """
        Parse :61: statement line.
        
        Format: :61:YYMMDD[MMDD]C/D[C]amount[Nxxx]//reference[//additional]
        Example: :61:2401150115D123,45NMSCNONREF//1234567890
        
        Components:
        - YYMMDD: Value date
        - MMDD (optional): Booking date
        - C/D: Credit/Debit
        - C (optional): Reversal indicator
        - amount: Transaction amount
        - Nxxx: Transaction type code
        - reference: Bank reference
        """
        # Remove :61: prefix
        data = line[4:].strip()
        
        # Extract value date (first 6 digits: YYMMDD)
        value_date_str = data[:6]
        value_date = self._parse_mt940_date(value_date_str)
        
        # Check if booking date follows (next 4 digits: MMDD)
        booking_date = value_date  # Default to value date
        offset = 6
        if len(data) > 10 and data[6:10].isdigit():
            booking_date_str = value_date_str[:2] + data[6:10]  # YYMMDD
            booking_date = self._parse_mt940_date(booking_date_str)
            offset = 10
        
        # Extract debit/credit indicator
        remaining = data[offset:]
        debit_credit = remaining[0] if remaining else 'C'
        remaining = remaining[1:]
        
        # Skip reversal indicator if present
        if remaining and remaining[0] in ('R', 'C'):
            remaining = remaining[1:]
        
        # Extract amount (ends with first letter or 'N')
        amount_match = re.match(r'([0-9,\.]+)', remaining)
        if not amount_match:
            raise ValueError(f"Cannot parse amount from: {remaining}")
        
        amount_str = amount_match.group(1)
        amount = self._parse_amount(amount_str)
        
        # Apply debit/credit
        if debit_credit == 'D':
            amount = -amount
        
        remaining = remaining[len(amount_str):]
        
        # Skip transaction type code (Nxxx or similar)
        type_match = re.match(r'[A-Z][A-Z0-9]{2,3}', remaining)
        if type_match:
            remaining = remaining[len(type_match.group(0)):]
        
        # Extract reference (after //)
        reference = None
        if '//' in remaining:
            ref_parts = remaining.split('//')
            if len(ref_parts) > 1:
                reference = ref_parts[1].strip()
        
        return {
            'booking_date': booking_date,
            'value_date': value_date,
            'amount': amount,
            'reference': reference,
            'currency': 'EUR',  # MT940 usually doesn't specify, assume EUR
        }
    
    def _build_description(self, lines: List[str]) -> str:
        """Build description from :86: tag lines."""
        if not lines:
            return "Bank transaction"
        
        # Join lines, but try to extract structured information
        full_text = ' '.join(lines)
        
        # MT940 :86: often has structured codes like:
        # /IBAN/NL12BANK0123456789/NAME/John Doe/REMI/Payment for invoice 123
        # We'll extract the most relevant parts
        
        parts = []
        
        # Extract REMI (remittance information)
        remi_match = re.search(r'/REMI/([^/]+)', full_text)
        if remi_match:
            parts.append(remi_match.group(1).strip())
        
        # Extract EREF (end-to-end reference)
        eref_match = re.search(r'/EREF/([^/]+)', full_text)
        if eref_match:
            parts.append(eref_match.group(1).strip())
        
        # If no structured data found, use full text
        if not parts:
            # Remove common prefixes
            cleaned = re.sub(r'^/[A-Z]{3,4}/', '', full_text)
            parts.append(cleaned.strip())
        
        return ' / '.join(parts) if parts else full_text
    
    def _create_transaction(self, data: Dict) -> Optional[ParsedTransaction]:
        """Create ParsedTransaction from parsed data."""
        if not data.get('booking_date') or data.get('amount') is None:
            return None
        
        # Extract counterparty info from description if available
        description = data.get('description', '')
        counterparty_name = self._extract_counterparty_name(description)
        counterparty_iban = self._extract_counterparty_iban(description)
        
        return ParsedTransaction(
            booking_date=data['booking_date'],
            amount=data['amount'],
            currency=data.get('currency', 'EUR'),
            description=description or "Bank transaction",
            counterparty_name=counterparty_name,
            counterparty_iban=counterparty_iban,
            reference=data.get('reference'),
            value_date=data.get('value_date'),
        )
    
    def _extract_counterparty_name(self, description: str) -> Optional[str]:
        """Extract counterparty name from description."""
        # Look for /NAME/ tag
        match = re.search(r'/NAME/([^/]+)', description)
        if match:
            return match.group(1).strip()
        
        # Look for /BENM/ tag (beneficiary)
        match = re.search(r'/BENM/([^/]+)', description)
        if match:
            return match.group(1).strip()
        
        return None
    
    def _extract_counterparty_iban(self, description: str) -> Optional[str]:
        """Extract counterparty IBAN from description."""
        # Look for /IBAN/ tag
        match = re.search(r'/IBAN/([A-Z]{2}[0-9A-Z]+)', description)
        if match:
            return match.group(1).strip()
        
        return None
    
    def _parse_mt940_date(self, date_str: str) -> date:
        """
        Parse MT940 date format (YYMMDD).
        
        Assumes dates in range 00-49 are 2000-2049,
        and dates 50-99 are 1950-1999.
        """
        year = int(date_str[:2])
        month = int(date_str[2:4])
        day = int(date_str[4:6])
        
        # Y2K pivot: 00-49 -> 2000-2049, 50-99 -> 1950-1999
        full_year = 2000 + year if year < 50 else 1900 + year
        
        return date(full_year, month, day)
    
    def _parse_amount(self, amount_str: str) -> Decimal:
        """Parse amount from MT940 format."""
        # MT940 uses comma as decimal separator
        # Example: 123,45 or 1234,56
        amount_str = amount_str.replace(',', '.')
        return Decimal(amount_str)
