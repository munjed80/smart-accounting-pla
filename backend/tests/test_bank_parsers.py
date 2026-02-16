"""
Unit Tests for Bank Statement Parsers

Tests cover:
- CAMT.053 XML parsing
- MT940 text parsing
- Base parser interface
- Format detection
"""
import pytest
from datetime import date
from decimal import Decimal

from app.services.bank.parsers import (
    BaseStatementParser,
    ParsedTransaction,
    CAMT053Parser,
    MT940Parser,
)


class TestCAMT053Parser:
    """Tests for CAMT.053 XML parser."""
    
    def test_can_parse_camt_xml(self):
        """Test that parser correctly identifies CAMT.053 files."""
        parser = CAMT053Parser()
        
        # Valid CAMT.053 XML
        xml_content = b'''<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
    <BkToCstmrStmt>
        <Stmt>
            <Acct>
                <Id>
                    <IBAN>NL91ABNA0417164300</IBAN>
                </Id>
            </Acct>
        </Stmt>
    </BkToCstmrStmt>
</Document>'''
        
        assert parser.can_parse(xml_content, "statement.xml") is True
        assert parser.get_format_name() == "CAMT.053 (ISO 20022)"
    
    def test_cannot_parse_non_xml(self):
        """Test that parser rejects non-XML files."""
        parser = CAMT053Parser()
        
        csv_content = b"date,amount,description\n2024-01-15,123.45,Test"
        assert parser.can_parse(csv_content, "statement.csv") is False
    
    def test_parse_simple_camt_statement(self):
        """Test parsing a simple CAMT.053 statement."""
        parser = CAMT053Parser()
        
        xml_content = b'''<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
    <BkToCstmrStmt>
        <Stmt>
            <Acct>
                <Id>
                    <IBAN>NL91ABNA0417164300</IBAN>
                </Id>
            </Acct>
            <Ntry>
                <BookgDt>
                    <Dt>2024-01-15</Dt>
                </BookgDt>
                <CdtDbtInd>CRDT</CdtDbtInd>
                <Amt Ccy="EUR">123.45</Amt>
                <AddtlNtryInf>Test payment</AddtlNtryInf>
                <NtryDtls>
                    <TxDtls>
                        <RltdPties>
                            <Dbtr>
                                <Nm>John Doe</Nm>
                            </Dbtr>
                            <DbtrAcct>
                                <Id>
                                    <IBAN>NL12BANK0123456789</IBAN>
                                </Id>
                            </DbtrAcct>
                        </RltdPties>
                        <RmtInf>
                            <Ustrd>Invoice payment 2024-001</Ustrd>
                        </RmtInf>
                        <Refs>
                            <EndToEndId>E2E-REF-123</EndToEndId>
                        </Refs>
                    </TxDtls>
                </NtryDtls>
            </Ntry>
        </Stmt>
    </BkToCstmrStmt>
</Document>'''
        
        transactions, account_iban = parser.parse(xml_content)
        
        assert account_iban == "NL91ABNA0417164300"
        assert len(transactions) == 1
        
        tx = transactions[0]
        assert tx.booking_date == date(2024, 1, 15)
        assert tx.amount == Decimal("123.45")
        assert tx.currency == "EUR"
        assert "Invoice payment 2024-001" in tx.description
        assert tx.counterparty_name == "John Doe"
        assert tx.counterparty_iban == "NL12BANK0123456789"
        assert tx.reference == "E2E-REF-123"
    
    def test_parse_debit_transaction(self):
        """Test parsing a debit transaction (negative amount)."""
        parser = CAMT053Parser()
        
        xml_content = b'''<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
    <BkToCstmrStmt>
        <Stmt>
            <Acct>
                <Id>
                    <IBAN>NL91ABNA0417164300</IBAN>
                </Id>
            </Acct>
            <Ntry>
                <BookgDt>
                    <Dt>2024-01-20</Dt>
                </BookgDt>
                <CdtDbtInd>DBIT</CdtDbtInd>
                <Amt Ccy="EUR">50.00</Amt>
                <AddtlNtryInf>Bank fee</AddtlNtryInf>
            </Ntry>
        </Stmt>
    </BkToCstmrStmt>
</Document>'''
        
        transactions, _ = parser.parse(xml_content)
        
        assert len(transactions) == 1
        assert transactions[0].amount == Decimal("-50.00")


class TestMT940Parser:
    """Tests for MT940 text parser."""
    
    def test_can_parse_mt940(self):
        """Test that parser correctly identifies MT940 files."""
        parser = MT940Parser()
        
        mt940_content = b''':20:STATEMENT-001
:25:NL91ABNA0417164300
:60F:C240115EUR1000,00
:61:2401150115D123,45NMSCNONREF//1234567890
:86:/IBAN/NL12BANK0123456789/NAME/John Doe/REMI/Invoice 2024-001
:62F:C240115EUR876,55'''
        
        assert parser.can_parse(mt940_content, "statement.mt940") is True
        assert parser.get_format_name() == "MT940 (SWIFT)"
    
    def test_cannot_parse_non_mt940(self):
        """Test that parser rejects non-MT940 files."""
        parser = MT940Parser()
        
        csv_content = b"date,amount,description\n2024-01-15,123.45,Test"
        assert parser.can_parse(csv_content, "statement.csv") is False
    
    def test_parse_simple_mt940_statement(self):
        """Test parsing a simple MT940 statement."""
        parser = MT940Parser()
        
        mt940_content = b''':20:STATEMENT-001
:25:NL91ABNA0417164300
:60F:C240115EUR1000,00
:61:2401150115C123,45NMSCNONREF//REF-123
:86:/IBAN/NL12BANK0123456789/NAME/John Doe/REMI/Invoice payment 2024-001
:62F:C240115EUR1123,45'''
        
        transactions, account_iban = parser.parse(mt940_content)
        
        assert account_iban == "NL91ABNA0417164300"
        assert len(transactions) == 1
        
        tx = transactions[0]
        assert tx.booking_date == date(2024, 1, 15)
        assert tx.amount == Decimal("123.45")
        assert tx.currency == "EUR"
        assert "Invoice payment 2024-001" in tx.description
        assert tx.counterparty_name == "John Doe"
        assert tx.counterparty_iban == "NL12BANK0123456789"
        assert tx.reference == "REF-123"
    
    def test_parse_debit_transaction_mt940(self):
        """Test parsing a debit transaction."""
        parser = MT940Parser()
        
        mt940_content = b''':20:STATEMENT-002
:25:NL91ABNA0417164300
:60F:C240120EUR1000,00
:61:2401200120D50,00NMSCNONREF//FEE-001
:86:/REMI/Bank fee
:62F:C240120EUR950,00'''
        
        transactions, _ = parser.parse(mt940_content)
        
        assert len(transactions) == 1
        assert transactions[0].amount == Decimal("-50.00")
    
    def test_parse_multiple_transactions(self):
        """Test parsing multiple transactions in one statement."""
        parser = MT940Parser()
        
        mt940_content = b''':20:STATEMENT-003
:25:NL91ABNA0417164300
:60F:C240115EUR1000,00
:61:2401150115C100,00NMSCNONREF//REF-001
:86:/REMI/Payment 1
:61:2401160116C200,00NMSCNONREF//REF-002
:86:/REMI/Payment 2
:61:2401170117D50,00NMSCNONREF//REF-003
:86:/REMI/Fee
:62F:C240117EUR1250,00'''
        
        transactions, _ = parser.parse(mt940_content)
        
        assert len(transactions) == 3
        assert transactions[0].amount == Decimal("100.00")
        assert transactions[1].amount == Decimal("200.00")
        assert transactions[2].amount == Decimal("-50.00")


class TestParsedTransaction:
    """Tests for ParsedTransaction dataclass."""
    
    def test_iban_normalization(self):
        """Test that IBANs are normalized (no spaces, uppercase)."""
        tx = ParsedTransaction(
            booking_date=date(2024, 1, 15),
            amount=Decimal("100.00"),
            currency="EUR",
            description="Test",
            counterparty_iban="nl91 abna 0417 1643 00",
        )
        
        assert tx.counterparty_iban == "NL91ABNA0417164300"
    
    def test_bic_normalization(self):
        """Test that BICs are normalized (no spaces, uppercase)."""
        tx = ParsedTransaction(
            booking_date=date(2024, 1, 15),
            amount=Decimal("100.00"),
            currency="EUR",
            description="Test",
            counterparty_bic="abna nl 2a",
        )
        
        assert tx.counterparty_bic == "ABNANL2A"
