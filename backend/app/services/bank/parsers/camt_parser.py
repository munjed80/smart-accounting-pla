"""
CAMT.053 Parser - ISO 20022 Bank Statement Format

Parses CAMT.053 XML files (Bank-to-Customer Account Statement).
This is the standard format used by European banks for PSD2 compliance.

Namespace: urn:iso:std:iso:20022:tech:xsd:camt.053.001.0X (X = version)
"""
import logging
import xml.etree.ElementTree as ET
from datetime import datetime
from decimal import Decimal
from typing import List, Optional

from .base_parser import BaseStatementParser, ParsedTransaction

logger = logging.getLogger(__name__)


class CAMT053Parser(BaseStatementParser):
    """
    Parser for CAMT.053 XML bank statements.
    
    Supports multiple versions (camt.053.001.02, .04, .06, .08, etc.)
    """
    
    # Common CAMT.053 namespaces
    NAMESPACES = {
        'camt': 'urn:iso:std:iso:20022:tech:xsd:camt.053.001.02',
        'camt04': 'urn:iso:std:iso:20022:tech:xsd:camt.053.001.04',
        'camt06': 'urn:iso:std:iso:20022:tech:xsd:camt.053.001.06',
        'camt08': 'urn:iso:std:iso:20022:tech:xsd:camt.053.001.08',
    }
    
    def can_parse(self, file_bytes: bytes, filename: Optional[str] = None) -> bool:
        """Check if file is CAMT.053 XML format."""
        # Check file extension
        if filename and filename.lower().endswith('.xml'):
            # Check if content looks like XML
            try:
                content = file_bytes.decode('utf-8')
                if 'camt.053' in content or 'BkToCstmrStmt' in content:
                    return True
            except UnicodeDecodeError:
                return False
        
        # Try parsing as XML
        try:
            root = ET.fromstring(file_bytes.decode('utf-8'))
            # Check if root tag contains CAMT.053 indicators
            if 'camt.053' in root.tag or 'BkToCstmrStmt' in root.tag:
                return True
        except (ET.ParseError, UnicodeDecodeError):
            return False
        
        return False
    
    def parse(self, file_bytes: bytes) -> tuple[List[ParsedTransaction], Optional[str]]:
        """Parse CAMT.053 XML file."""
        try:
            content = file_bytes.decode('utf-8')
        except UnicodeDecodeError:
            raise ValueError("Invalid encoding for CAMT.053 file (expected UTF-8)")
        
        try:
            root = ET.fromstring(content)
        except ET.ParseError as e:
            raise ValueError(f"Invalid XML format: {e}")
        
        # Detect namespace
        ns = self._detect_namespace(root)
        
        # Extract account IBAN
        account_iban = self._extract_account_iban(root, ns)
        
        # Parse transactions
        transactions = self._parse_transactions(root, ns)
        
        return transactions, account_iban
    
    def get_format_name(self) -> str:
        return "CAMT.053 (ISO 20022)"
    
    def _detect_namespace(self, root: ET.Element) -> dict:
        """Detect which CAMT.053 namespace version is used."""
        # Try to find namespace in root tag
        if '}' in root.tag:
            xmlns = root.tag.split('}')[0].strip('{')
            # Map to our namespace prefixes
            for prefix, uri in self.NAMESPACES.items():
                if xmlns == uri or 'camt.053' in xmlns:
                    return {prefix: xmlns}
        
        # Default to most common version
        return {'camt': self.NAMESPACES['camt']}
    
    def _extract_account_iban(self, root: ET.Element, ns: dict) -> Optional[str]:
        """Extract account IBAN from statement."""
        # Try multiple XPath patterns for different versions
        patterns = [
            ".//Acct/Id/IBAN",
            ".//Stmt/Acct/Id/IBAN",
            ".//{*}Acct/{*}Id/{*}IBAN",
        ]
        
        for pattern in patterns:
            try:
                elem = root.find(pattern, ns)
                if elem is not None and elem.text:
                    return elem.text.strip()
            except Exception:
                # Try without namespace
                try:
                    elem = root.find(pattern)
                    if elem is not None and elem.text:
                        return elem.text.strip()
                except Exception:
                    continue
        
        return None
    
    def _parse_transactions(self, root: ET.Element, ns: dict) -> List[ParsedTransaction]:
        """Parse all transactions from CAMT.053 XML."""
        transactions = []
        
        # Find all entry elements (transactions)
        # Try with namespace
        entries = root.findall(".//{*}Ntry")
        if not entries:
            # Try without namespace filter
            entries = root.findall(".//Ntry")
        
        for entry in entries:
            try:
                transaction = self._parse_entry(entry)
                if transaction:
                    transactions.append(transaction)
            except Exception as e:
                logger.warning(f"Failed to parse CAMT entry: {e}")
                continue
        
        return transactions
    
    def _parse_entry(self, entry: ET.Element) -> Optional[ParsedTransaction]:
        """Parse a single transaction entry."""
        # Booking date
        booking_date_elem = entry.find(".//{*}BookgDt/{*}Dt")
        if booking_date_elem is None or not booking_date_elem.text:
            booking_date_elem = entry.find(".//{*}BookgDt/{*}DtTm")
        
        if booking_date_elem is None or not booking_date_elem.text:
            return None
        
        booking_date_str = booking_date_elem.text.strip()
        booking_date = self._parse_date(booking_date_str)
        
        # Value date (optional)
        value_date = None
        value_date_elem = entry.find(".//{*}ValDt/{*}Dt")
        if value_date_elem is not None and value_date_elem.text:
            value_date = self._parse_date(value_date_elem.text.strip())
        
        # Amount
        amount_elem = entry.find(".//{*}Amt")
        if amount_elem is None or not amount_elem.text:
            return None
        
        amount_str = amount_elem.text.strip()
        amount = Decimal(amount_str)
        currency = amount_elem.get('Ccy', 'EUR')
        
        # Credit/Debit indicator
        cdt_dbt_ind_elem = entry.find(".//{*}CdtDbtInd")
        if cdt_dbt_ind_elem is not None and cdt_dbt_ind_elem.text:
            if cdt_dbt_ind_elem.text.strip() == 'DBIT':
                amount = -amount
        
        # Transaction details
        details = entry.find(".//{*}NtryDtls/{*}TxDtls")
        
        # Description
        description_parts = []
        
        # Unstructured remittance information
        ustrd_elem = entry.find(".//{*}RmtInf/{*}Ustrd")
        if details is not None:
            ustrd_elem = details.find(".//{*}RmtInf/{*}Ustrd")
        if ustrd_elem is not None and ustrd_elem.text:
            description_parts.append(ustrd_elem.text.strip())
        
        # Additional transaction info
        addtl_info_elem = entry.find(".//{*}AddtlNtryInf")
        if addtl_info_elem is not None and addtl_info_elem.text:
            description_parts.append(addtl_info_elem.text.strip())
        
        description = " / ".join(description_parts) if description_parts else "Bank transaction"
        
        # Counterparty information
        counterparty_name = None
        counterparty_iban = None
        counterparty_bic = None
        
        if details is not None:
            # Related parties
            related_party = details.find(".//{*}RltdPties")
            if related_party is not None:
                # Debtor (for credits) or Creditor (for debits)
                party = related_party.find(".//{*}Dbtr/{*}Nm")
                if party is None:
                    party = related_party.find(".//{*}Cdtr/{*}Nm")
                if party is not None and party.text:
                    counterparty_name = party.text.strip()
                
                # IBAN
                iban = related_party.find(".//{*}DbtrAcct/{*}Id/{*}IBAN")
                if iban is None:
                    iban = related_party.find(".//{*}CdtrAcct/{*}Id/{*}IBAN")
                if iban is not None and iban.text:
                    counterparty_iban = iban.text.strip()
                
                # BIC
                bic = related_party.find(".//{*}DbtrAgt/{*}FinInstnId/{*}BIC")
                if bic is None:
                    bic = related_party.find(".//{*}CdtrAgt/{*}FinInstnId/{*}BIC")
                if bic is not None and bic.text:
                    counterparty_bic = bic.text.strip()
        
        # Reference (end-to-end ID or transaction ID)
        reference = None
        if details is not None:
            ref_elem = details.find(".//{*}Refs/{*}EndToEndId")
            if ref_elem is None:
                ref_elem = details.find(".//{*}Refs/{*}TxId")
            if ref_elem is not None and ref_elem.text:
                ref_text = ref_elem.text.strip()
                if ref_text and ref_text != 'NOTPROVIDED':
                    reference = ref_text
        
        # Transaction ID
        transaction_id = None
        tx_id_elem = entry.find(".//{*}NtryRef")
        if tx_id_elem is not None and tx_id_elem.text:
            transaction_id = tx_id_elem.text.strip()
        
        return ParsedTransaction(
            booking_date=booking_date,
            amount=amount,
            currency=currency,
            description=description,
            counterparty_name=counterparty_name,
            counterparty_iban=counterparty_iban,
            counterparty_bic=counterparty_bic,
            reference=reference,
            transaction_id=transaction_id,
            value_date=value_date,
        )
    
    def _parse_date(self, date_str: str) -> datetime:
        """Parse date from ISO format."""
        # Handle both date and datetime formats
        if 'T' in date_str:
            # DateTime format: 2024-01-15T00:00:00
            return datetime.fromisoformat(date_str.split('T')[0]).date()
        else:
            # Date format: 2024-01-15
            return datetime.fromisoformat(date_str).date()
