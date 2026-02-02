"""
Bank Reconciliation Service

Handles:
- CSV file parsing and import
- Hash computation for idempotency
- Match suggestion generation
- Reconciliation action execution
"""
import base64
import csv
import hashlib
import io
import re
import uuid
from datetime import datetime, date, timezone
from decimal import Decimal, InvalidOperation
from typing import List, Optional, Tuple, Dict, Any

from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.bank import (
    BankAccount,
    BankTransaction,
    BankTransactionStatus,
    MatchedType,
    ReconciliationAction,
    ReconciliationActionType,
)
from app.models.subledger import OpenItem, OpenItemStatus
from app.models.ledger import JournalEntry, JournalLine, JournalEntryStatus, AccountingPeriod
from app.models.accounting import ChartOfAccount, VatCode
from app.models.subledger import Party
from app.schemas.bank import (
    BankImportRequest,
    BankImportResponse,
    ColumnMapping,
    MatchSuggestion,
    MatchedTypeEnum,
    ApplyActionRequest,
    ReconciliationActionEnum,
    BankTransactionStatusEnum,
)


class BankReconciliationService:
    """Service for bank statement import and reconciliation."""

    def __init__(self, db: AsyncSession, administration_id: uuid.UUID, user_id: uuid.UUID):
        self.db = db
        self.administration_id = administration_id
        self.user_id = user_id

    def _compute_hash(
        self,
        booking_date: date,
        amount: Decimal,
        description: str,
        reference: Optional[str] = None
    ) -> str:
        """
        Compute SHA256 hash for idempotent import.
        
        Hash components:
        - administration_id
        - booking_date (YYYY-MM-DD)
        - amount (normalized to 2 decimal places)
        - description (stripped)
        - reference (optional, stripped)
        """
        parts = [
            str(self.administration_id),
            booking_date.isoformat(),
            f"{amount:.2f}",
            description.strip(),
            (reference or "").strip(),
        ]
        hash_input = "|".join(parts)
        return hashlib.sha256(hash_input.encode('utf-8')).hexdigest()

    def _parse_amount(self, value: str) -> Optional[Decimal]:
        """Parse amount from various formats."""
        if not value:
            return None
        
        # Remove whitespace
        value = value.strip()
        
        # Handle European format (1.234,56)
        if ',' in value and '.' in value:
            # Check which is the decimal separator
            if value.rfind(',') > value.rfind('.'):
                # European: 1.234,56
                value = value.replace('.', '').replace(',', '.')
            else:
                # US: 1,234.56
                value = value.replace(',', '')
        elif ',' in value:
            # Could be 1234,56 (European decimal) or 1,234 (US thousands)
            # Assume European decimal if there are exactly 2 digits after comma
            parts = value.split(',')
            if len(parts) == 2 and len(parts[1]) == 2:
                value = value.replace(',', '.')
            else:
                value = value.replace(',', '')
        
        try:
            return Decimal(value)
        except InvalidOperation:
            return None

    def _parse_date(self, value: str, date_format: str = "%Y-%m-%d") -> Optional[date]:
        """Parse date from string using specified format."""
        if not value:
            return None
        
        value = value.strip()
        
        # Try specified format first
        try:
            return datetime.strptime(value, date_format).date()
        except ValueError:
            pass
        
        # Try common formats
        formats = [
            "%Y-%m-%d",
            "%d-%m-%Y",
            "%d/%m/%Y",
            "%Y/%m/%d",
            "%d.%m.%Y",
        ]
        
        for fmt in formats:
            try:
                return datetime.strptime(value, fmt).date()
            except ValueError:
                continue
        
        return None

    async def import_csv(self, request: BankImportRequest) -> BankImportResponse:
        """
        Import bank transactions from a CSV file.
        
        Returns counts of imported, skipped (duplicate), and failed rows.
        """
        # Decode base64 file content
        try:
            file_content = base64.b64decode(request.file_base64).decode('utf-8')
        except Exception as e:
            return BankImportResponse(
                imported_count=0,
                skipped_duplicates=0,
                total_in_file=0,
                errors=[f"Bestand kon niet worden gedecodeerd: {str(e)}"],
                message="Import mislukt: ongeldig bestandsformaat"
            )
        
        # Parse CSV
        mapping = request.mapping or ColumnMapping()
        date_format = request.date_format or "%Y-%m-%d"
        
        reader = csv.DictReader(io.StringIO(file_content))
        
        imported_count = 0
        skipped_duplicates = 0
        total_in_file = 0
        errors: List[str] = []
        
        # Get existing hashes for this administration
        existing_hashes_result = await self.db.execute(
            select(BankTransaction.raw_hash)
            .where(BankTransaction.administration_id == self.administration_id)
        )
        existing_hashes = set(row[0] for row in existing_hashes_result.fetchall())
        
        for row_num, row in enumerate(reader, start=2):  # Start at 2 (header is row 1)
            total_in_file += 1
            
            # Extract fields with mapping
            try:
                date_str = row.get(mapping.date_column, "")
                amount_str = row.get(mapping.amount_column, "")
                description = row.get(mapping.description_column, "")
                counterparty_name = row.get(mapping.name_column, "") if mapping.name_column else None
                counterparty_iban = row.get(mapping.iban_column, "") if mapping.iban_column else None
                reference = row.get(mapping.reference_column, "") if mapping.reference_column else None
            except KeyError as e:
                errors.append(f"Rij {row_num}: Kolom niet gevonden: {e}")
                continue
            
            # Parse date
            booking_date = self._parse_date(date_str, date_format)
            if not booking_date:
                errors.append(f"Rij {row_num}: Ongeldige datum: {date_str}")
                continue
            
            # Parse amount
            amount = self._parse_amount(amount_str)
            if amount is None:
                errors.append(f"Rij {row_num}: Ongeldig bedrag: {amount_str}")
                continue
            
            # Validate description
            if not description or not description.strip():
                errors.append(f"Rij {row_num}: Omschrijving is verplicht")
                continue
            
            # Compute hash
            raw_hash = self._compute_hash(booking_date, amount, description, reference)
            
            # Check for duplicate
            if raw_hash in existing_hashes:
                skipped_duplicates += 1
                continue
            
            # Create transaction
            transaction = BankTransaction(
                administration_id=self.administration_id,
                booking_date=booking_date,
                amount=amount,
                counterparty_name=counterparty_name.strip() if counterparty_name else None,
                counterparty_iban=counterparty_iban.strip().upper() if counterparty_iban else None,
                description=description.strip(),
                reference=reference.strip() if reference else None,
                raw_hash=raw_hash,
                status=BankTransactionStatus.NEW,
            )
            
            self.db.add(transaction)
            existing_hashes.add(raw_hash)  # Prevent duplicates within same file
            imported_count += 1
        
        await self.db.commit()
        
        # Create message
        if imported_count > 0 and len(errors) == 0:
            message = f"{imported_count} transacties geïmporteerd."
        elif imported_count > 0:
            message = f"{imported_count} transacties geïmporteerd, {len(errors)} fouten."
        elif skipped_duplicates > 0:
            message = f"Geen nieuwe transacties. {skipped_duplicates} duplicaten overgeslagen."
        else:
            message = "Import mislukt: geen geldige transacties gevonden."
        
        return BankImportResponse(
            imported_count=imported_count,
            skipped_duplicates=skipped_duplicates,
            total_in_file=total_in_file,
            errors=errors[:10],  # Limit errors to first 10
            message=message,
        )

    async def get_match_suggestions(self, transaction_id: uuid.UUID) -> Tuple[BankTransaction, List[MatchSuggestion]]:
        """
        Generate match suggestions for a bank transaction.
        
        Matching rules:
        1. Invoice number in description → suggest invoice
        2. Amount matches open invoice (±1%) → suggest invoice
        3. Counterparty IBAN matches known vendor → suggest expense
        """
        # Get transaction
        result = await self.db.execute(
            select(BankTransaction)
            .where(BankTransaction.id == transaction_id)
            .where(BankTransaction.administration_id == self.administration_id)
        )
        transaction = result.scalar_one_or_none()
        
        if not transaction:
            raise ValueError("Transactie niet gevonden")
        
        suggestions: List[MatchSuggestion] = []
        
        # Rule 1: Invoice number in description
        invoice_numbers = self._extract_invoice_numbers(transaction.description)
        if invoice_numbers:
            for invoice_num in invoice_numbers:
                matched_items = await self._find_open_items_by_reference(invoice_num)
                for item in matched_items:
                    suggestions.append(MatchSuggestion(
                        entity_type=MatchedTypeEnum.INVOICE,
                        entity_id=item.id,
                        entity_reference=item.document_number or invoice_num,
                        confidence_score=90,
                        amount=item.open_amount,
                        date=item.document_date,
                        explanation=f"Factuurnummer '{invoice_num}' gevonden in omschrijving",
                    ))
        
        # Rule 2: Amount match for open items
        amount_matches = await self._find_open_items_by_amount(
            abs(transaction.amount),
            tolerance_percent=1.0
        )
        for item in amount_matches:
            # Don't duplicate if already suggested by invoice number
            if not any(s.entity_id == item.id for s in suggestions):
                score = 80 if item.open_amount == abs(transaction.amount) else 60
                suggestions.append(MatchSuggestion(
                    entity_type=MatchedTypeEnum.INVOICE if item.item_type == "RECEIVABLE" else MatchedTypeEnum.EXPENSE,
                    entity_id=item.id,
                    entity_reference=item.document_number or str(item.id)[:8],
                    confidence_score=score,
                    amount=item.open_amount,
                    date=item.document_date,
                    explanation=f"Bedrag €{item.open_amount:.2f} komt overeen" + 
                               (" (exact)" if item.open_amount == abs(transaction.amount) else " (binnen 1%)"),
                ))
        
        # Rule 3: Counterparty IBAN match
        if transaction.counterparty_iban:
            party_matches = await self._find_parties_by_iban(transaction.counterparty_iban)
            for party in party_matches:
                # Find recent open items for this party
                party_items = await self._find_open_items_for_party(party.id)
                for item in party_items[:3]:  # Limit to 3 suggestions per party
                    if not any(s.entity_id == item.id for s in suggestions):
                        suggestions.append(MatchSuggestion(
                            entity_type=MatchedTypeEnum.EXPENSE if item.item_type == "PAYABLE" else MatchedTypeEnum.INVOICE,
                            entity_id=item.id,
                            entity_reference=item.document_number or party.name,
                            confidence_score=70,
                            amount=item.open_amount,
                            date=item.document_date,
                            explanation=f"IBAN {transaction.counterparty_iban[:8]}... behoort tot {party.name}",
                        ))
        
        # Sort by confidence score descending
        suggestions.sort(key=lambda x: x.confidence_score, reverse=True)
        
        return transaction, suggestions[:5]  # Limit to top 5 suggestions

    def _extract_invoice_numbers(self, description: str) -> List[str]:
        """Extract potential invoice numbers from transaction description."""
        patterns = [
            r'(?:factuur|invoice|inv|fac)[.\s:#-]*(\d+)',
            r'(?:F|INV)[-]?(\d{4,})',
            r'\b(\d{4}-\d{4})\b',  # Format like 2024-0001
            r'\b(\d{6,})\b',  # Long numbers that could be invoice numbers
        ]
        
        numbers = []
        for pattern in patterns:
            matches = re.findall(pattern, description, re.IGNORECASE)
            numbers.extend(matches)
        
        return list(set(numbers))

    async def _find_open_items_by_reference(self, reference: str) -> List[OpenItem]:
        """Find open items by document number/reference."""
        result = await self.db.execute(
            select(OpenItem)
            .where(OpenItem.administration_id == self.administration_id)
            .where(OpenItem.status.in_([OpenItemStatus.OPEN, OpenItemStatus.PARTIAL]))
            .where(
                or_(
                    OpenItem.document_number.ilike(f"%{reference}%"),
                    OpenItem.reference.ilike(f"%{reference}%"),
                )
            )
            .limit(5)
        )
        return list(result.scalars().all())

    async def _find_open_items_by_amount(
        self,
        amount: Decimal,
        tolerance_percent: float = 1.0
    ) -> List[OpenItem]:
        """Find open items matching amount within tolerance."""
        tolerance = amount * Decimal(str(tolerance_percent / 100))
        min_amount = amount - tolerance
        max_amount = amount + tolerance
        
        result = await self.db.execute(
            select(OpenItem)
            .where(OpenItem.administration_id == self.administration_id)
            .where(OpenItem.status.in_([OpenItemStatus.OPEN, OpenItemStatus.PARTIAL]))
            .where(OpenItem.open_amount.between(min_amount, max_amount))
            .order_by(
                # Exact matches first
                func.abs(OpenItem.open_amount - amount)
            )
            .limit(5)
        )
        return list(result.scalars().all())

    async def _find_parties_by_iban(self, iban: str) -> List[Party]:
        """Find parties by bank account IBAN."""
        # Normalize IBAN for comparison
        normalized_iban = iban.strip().upper().replace(" ", "")
        
        result = await self.db.execute(
            select(Party)
            .where(Party.administration_id == self.administration_id)
            .where(Party.bank_account.ilike(f"%{normalized_iban}%"))
            .limit(3)
        )
        return list(result.scalars().all())

    async def _find_open_items_for_party(self, party_id: uuid.UUID) -> List[OpenItem]:
        """Find open items for a specific party."""
        result = await self.db.execute(
            select(OpenItem)
            .where(OpenItem.administration_id == self.administration_id)
            .where(OpenItem.party_id == party_id)
            .where(OpenItem.status.in_([OpenItemStatus.OPEN, OpenItemStatus.PARTIAL]))
            .order_by(OpenItem.document_date.desc())
            .limit(5)
        )
        return list(result.scalars().all())

    async def apply_action(
        self,
        transaction_id: uuid.UUID,
        request: ApplyActionRequest
    ) -> Tuple[BankTransaction, Optional[uuid.UUID]]:
        """
        Apply a reconciliation action to a bank transaction.
        
        Returns the updated transaction and optional created journal entry ID.
        """
        # Get transaction
        result = await self.db.execute(
            select(BankTransaction)
            .where(BankTransaction.id == transaction_id)
            .where(BankTransaction.administration_id == self.administration_id)
        )
        transaction = result.scalar_one_or_none()
        
        if not transaction:
            raise ValueError("Transactie niet gevonden")
        
        journal_entry_id = None
        
        # Process action
        if request.action == ReconciliationActionEnum.IGNORE:
            transaction.status = BankTransactionStatus.IGNORED
            transaction.matched_type = None
            transaction.matched_entity_id = None
        
        elif request.action == ReconciliationActionEnum.ACCEPT_MATCH:
            if not request.entity_id:
                raise ValueError("entity_id is verplicht voor ACCEPT_MATCH")
            transaction.status = BankTransactionStatus.MATCHED
            # Determine matched type from the entity
            open_item = await self._get_open_item(request.entity_id)
            if open_item:
                transaction.matched_type = (
                    MatchedType.INVOICE if open_item.item_type == "RECEIVABLE"
                    else MatchedType.EXPENSE
                )
                transaction.matched_entity_id = request.entity_id
        
        elif request.action == ReconciliationActionEnum.LINK_INVOICE:
            if not request.entity_id:
                raise ValueError("entity_id is verplicht voor LINK_INVOICE")
            transaction.status = BankTransactionStatus.MATCHED
            transaction.matched_type = MatchedType.INVOICE
            transaction.matched_entity_id = request.entity_id
        
        elif request.action == ReconciliationActionEnum.CREATE_EXPENSE:
            # Create journal entry for the expense
            journal_entry_id = await self._create_expense_entry(transaction, request)
            transaction.status = BankTransactionStatus.MATCHED
            transaction.matched_type = MatchedType.MANUAL
            transaction.matched_entity_id = journal_entry_id
        
        elif request.action == ReconciliationActionEnum.UNMATCH:
            transaction.status = BankTransactionStatus.NEW
            transaction.matched_type = None
            transaction.matched_entity_id = None
        
        # Record action for audit trail
        action = ReconciliationAction(
            bank_transaction_id=transaction_id,
            user_id=self.user_id,
            action=ReconciliationActionType(request.action.value),
            payload={
                "entity_id": str(request.entity_id) if request.entity_id else None,
                "vat_code": request.vat_code,
                "ledger_code": request.ledger_code,
                "notes": request.notes,
                "journal_entry_id": str(journal_entry_id) if journal_entry_id else None,
            }
        )
        self.db.add(action)
        
        await self.db.commit()
        await self.db.refresh(transaction)
        
        return transaction, journal_entry_id

    async def _get_open_item(self, item_id: uuid.UUID) -> Optional[OpenItem]:
        """Get an open item by ID."""
        result = await self.db.execute(
            select(OpenItem)
            .where(OpenItem.id == item_id)
            .where(OpenItem.administration_id == self.administration_id)
        )
        return result.scalar_one_or_none()

    async def _create_expense_entry(
        self,
        transaction: BankTransaction,
        request: ApplyActionRequest
    ) -> uuid.UUID:
        """
        Create a journal entry for an expense from a bank transaction.
        
        Debit: Expense account (based on ledger_code)
        Credit: Bank account
        """
        # Get or create accounting period
        period = await self._get_or_create_period(transaction.booking_date)
        
        # Get expense account
        expense_account = await self._get_account_by_code(request.ledger_code or "4000")
        if not expense_account:
            raise ValueError(f"Grootboekrekening {request.ledger_code or '4000'} niet gevonden")
        
        # Get bank account (control account)
        bank_account = await self._get_bank_control_account()
        if not bank_account:
            raise ValueError("Bank grootboekrekening niet gevonden")
        
        # Get VAT code if provided
        vat_code = None
        vat_amount = Decimal("0.00")
        if request.vat_code:
            vat_code = await self._get_vat_code(request.vat_code)
            if vat_code:
                # Calculate VAT (reverse calculation from gross amount)
                vat_rate = vat_code.rate / Decimal("100")
                vat_amount = abs(transaction.amount) * vat_rate / (1 + vat_rate)
        
        # Generate entry number
        entry_number = await self._generate_entry_number(transaction.booking_date)
        
        # Create journal entry
        amount = abs(transaction.amount)
        net_amount = amount - vat_amount
        
        entry = JournalEntry(
            administration_id=self.administration_id,
            period_id=period.id if period else None,
            entry_number=entry_number,
            entry_date=transaction.booking_date,
            description=f"Bankafschrift: {transaction.description[:200]}",
            reference=transaction.reference,
            status=JournalEntryStatus.POSTED,
            total_debit=amount,
            total_credit=amount,
            is_balanced=True,
            source_type="BANK_RECONCILIATION",
            source_id=transaction.id,
            posted_at=datetime.now(timezone.utc),
            posted_by_id=self.user_id,
        )
        self.db.add(entry)
        await self.db.flush()
        
        # Create journal lines
        # Line 1: Debit expense account (net amount if VAT applies)
        expense_line = JournalLine(
            journal_entry_id=entry.id,
            account_id=expense_account.id,
            line_number=1,
            description=transaction.description[:200],
            debit_amount=net_amount if vat_code else amount,
            credit_amount=Decimal("0.00"),
            vat_code_id=vat_code.id if vat_code else None,
            vat_amount=vat_amount if vat_code else None,
            taxable_amount=net_amount if vat_code else None,
        )
        self.db.add(expense_line)
        
        # Line 2: Debit VAT recoverable (if applicable)
        if vat_code and vat_amount > 0:
            vat_account = await self._get_vat_recoverable_account()
            if vat_account:
                vat_line = JournalLine(
                    journal_entry_id=entry.id,
                    account_id=vat_account.id,
                    line_number=2,
                    description=f"BTW {vat_code.code}",
                    debit_amount=vat_amount,
                    credit_amount=Decimal("0.00"),
                )
                self.db.add(vat_line)
        
        # Line 3: Credit bank account
        bank_line = JournalLine(
            journal_entry_id=entry.id,
            account_id=bank_account.id,
            line_number=3 if vat_code else 2,
            description=f"Bank: {transaction.counterparty_name or 'Onbekend'}",
            debit_amount=Decimal("0.00"),
            credit_amount=amount,
        )
        self.db.add(bank_line)
        
        return entry.id

    async def _get_or_create_period(self, entry_date: date) -> Optional[AccountingPeriod]:
        """Get accounting period for a date."""
        result = await self.db.execute(
            select(AccountingPeriod)
            .where(AccountingPeriod.administration_id == self.administration_id)
            .where(AccountingPeriod.start_date <= entry_date)
            .where(AccountingPeriod.end_date >= entry_date)
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def _get_account_by_code(self, code: str) -> Optional[ChartOfAccount]:
        """Get chart of account by code."""
        result = await self.db.execute(
            select(ChartOfAccount)
            .where(ChartOfAccount.administration_id == self.administration_id)
            .where(ChartOfAccount.account_code == code)
            .where(ChartOfAccount.is_active == True)
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def _get_bank_control_account(self) -> Optional[ChartOfAccount]:
        """Get the bank control account."""
        result = await self.db.execute(
            select(ChartOfAccount)
            .where(ChartOfAccount.administration_id == self.administration_id)
            .where(ChartOfAccount.control_type == "BANK")
            .where(ChartOfAccount.is_active == True)
            .limit(1)
        )
        account = result.scalar_one_or_none()
        
        # Fallback: try to find by common account codes
        if not account:
            result = await self.db.execute(
                select(ChartOfAccount)
                .where(ChartOfAccount.administration_id == self.administration_id)
                .where(ChartOfAccount.account_code.in_(["1100", "1000", "110"]))
                .where(ChartOfAccount.is_active == True)
                .limit(1)
            )
            account = result.scalar_one_or_none()
        
        return account

    async def _get_vat_code(self, code: str) -> Optional[VatCode]:
        """Get VAT code by code."""
        result = await self.db.execute(
            select(VatCode)
            .where(VatCode.code == code)
            .where(VatCode.is_active == True)
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def _get_vat_recoverable_account(self) -> Optional[ChartOfAccount]:
        """Get the VAT recoverable (input VAT) account."""
        result = await self.db.execute(
            select(ChartOfAccount)
            .where(ChartOfAccount.administration_id == self.administration_id)
            .where(ChartOfAccount.control_type == "VAT")
            .where(ChartOfAccount.account_type == "ASSET")  # VAT recoverable is an asset
            .where(ChartOfAccount.is_active == True)
            .limit(1)
        )
        account = result.scalar_one_or_none()
        
        # Fallback: try common account codes for input VAT
        if not account:
            result = await self.db.execute(
                select(ChartOfAccount)
                .where(ChartOfAccount.administration_id == self.administration_id)
                .where(ChartOfAccount.account_code.in_(["1510", "1500", "151"]))
                .where(ChartOfAccount.is_active == True)
                .limit(1)
            )
            account = result.scalar_one_or_none()
        
        return account

    async def _generate_entry_number(self, entry_date: date) -> str:
        """Generate a unique journal entry number."""
        year = entry_date.year
        
        # Get count of entries for this year
        result = await self.db.execute(
            select(func.count(JournalEntry.id))
            .where(JournalEntry.administration_id == self.administration_id)
            .where(func.extract('year', JournalEntry.entry_date) == year)
        )
        count = result.scalar() or 0
        
        return f"BNK-{year}-{count + 1:05d}"
