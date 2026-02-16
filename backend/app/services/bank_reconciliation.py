"""
Bank Reconciliation Service

Handles:
- CSV file parsing and import
- CAMT.053 and MT940 file parsing
- Hash computation for idempotency
- Match suggestion generation with enhanced rules
- Reconciliation action execution
"""
import csv
import hashlib
import io
import re
import uuid
from datetime import datetime, date, timezone, timedelta
from decimal import Decimal, InvalidOperation
from typing import List, Optional, Tuple

from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bank import (
    BankAccount,
    BankTransaction,
    BankTransactionStatus,
    ReconciliationAction,
    ReconciliationActionType,
)
from app.models.subledger import OpenItem, OpenItemStatus, OpenItemAllocation
from app.models.ledger import JournalEntry, JournalLine, JournalEntryStatus, AccountingPeriod
from app.models.accounting import ChartOfAccount, VatCode
from app.models.subledger import Party
from app.schemas.bank import (
    BankImportResponse,
    MatchSuggestion,
    ApplyActionRequest,
    ReconciliationActionEnum,
)
from app.services.vat.posting import VatPostingService
from app.services.bank.parsers import (
    BaseStatementParser,
    ParsedTransaction,
    CAMT053Parser,
    MT940Parser,
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
        reference: Optional[str] = None,
        counterparty_iban: Optional[str] = None,
    ) -> str:
        """
        Compute SHA256 hash for idempotent import.
        
        Hash components:
        - administration_id
        - booking_date (YYYY-MM-DD)
        - amount (normalized to 2 decimal places)
        - description (stripped)
        - reference (optional, stripped)
        - counterparty_iban (optional, stripped)
        """
        parts = [
            str(self.administration_id),
            booking_date.isoformat(),
            f"{amount:.2f}",
            description.strip(),
            (reference or "").strip(),
            (counterparty_iban or "").strip(),
        ]
        hash_input = "|".join(parts)
        return hashlib.sha256(hash_input.encode("utf-8")).hexdigest()

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

    def _normalize_header(self, header: str) -> str:
        normalized = header.strip().lower().replace(" ", "_").replace("-", "_")
        return normalized

    def _resolve_columns(self, headers: List[str]) -> Optional[dict]:
        normalized = {self._normalize_header(h): h for h in headers if h}
        aliases = {
            "booking_date": {"date", "booking_date"},
            "amount": {"amount"},
            "description": {"description"},
            "counterparty_iban": {"iban", "counterparty_iban"},
            "counterparty_name": {"counterparty_name"},
            "reference": {"reference"},
            "account_iban": {"account_iban", "rekening", "rekeningnummer"},
        }

        resolved: dict = {}
        for key, options in aliases.items():
            for option in options:
                if option in normalized:
                    resolved[key] = normalized[option]
                    break

        required = all(resolved.get(k) for k in ("booking_date", "amount", "description"))
        return resolved if required else None

    def _build_reader(self, decoded: str) -> csv.DictReader:
        sample = decoded[:2048]
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=";,")
        except csv.Error:
            dialect = csv.get_dialect("excel")
        return csv.DictReader(io.StringIO(decoded), dialect=dialect)

    def _get_row_value(self, row: dict, key: Optional[str]) -> Optional[str]:
        if not key:
            return None
        value = row.get(key)
        if value is None:
            return None
        value = str(value).strip()
        return value or None

    def _infer_bank_account_iban(self, rows: List[dict], account_iban_column: Optional[str]) -> Optional[str]:
        if not account_iban_column:
            return None
        candidates: set[str] = set()
        for row in rows:
            value = self._get_row_value(row, account_iban_column)
            if value:
                candidates.add(value.replace(" ", "").upper())
            if len(candidates) > 1:
                break
        return candidates.pop() if len(candidates) == 1 else None

    async def _get_or_create_bank_account(
        self,
        iban: str,
        bank_name: Optional[str],
    ) -> BankAccount:
        normalized_iban = iban.replace(" ", "").upper()
        result = await self.db.execute(
            select(BankAccount)
            .where(BankAccount.administration_id == self.administration_id)
            .where(BankAccount.iban == normalized_iban)
        )
        bank_account = result.scalar_one_or_none()
        if bank_account:
            return bank_account

        bank_account = BankAccount(
            administration_id=self.administration_id,
            iban=normalized_iban,
            bank_name=bank_name,
            currency="EUR",
        )
        self.db.add(bank_account)
        await self.db.flush()
        return bank_account

    async def import_file(
        self,
        file_bytes: bytes,
        filename: Optional[str],
        bank_account_iban: Optional[str],
        bank_name: Optional[str],
    ) -> BankImportResponse:
        """
        Import bank transactions from any supported file format.
        
        Automatically detects format (CSV, CAMT.053, MT940) and uses
        appropriate parser. Falls back to CSV if no parser matches.
        
        Returns counts of imported, skipped (duplicate), and failed rows.
        """
        # Initialize parsers
        parsers: List[BaseStatementParser] = [
            CAMT053Parser(),
            MT940Parser(),
        ]
        
        # Try each parser to see if it can handle the file
        parsed_transactions: Optional[List[ParsedTransaction]] = None
        detected_iban: Optional[str] = None
        format_name = "CSV"
        
        for parser in parsers:
            if parser.can_parse(file_bytes, filename):
                try:
                    parsed_transactions, detected_iban = parser.parse(file_bytes)
                    format_name = parser.get_format_name()
                    break
                except Exception as e:
                    # Parser claimed it could handle the file but failed
                    # Try next parser
                    print(f"Parser {parser.get_format_name()} failed: {e}")
                    continue
        
        # If no parser succeeded, fall back to CSV import
        if parsed_transactions is None:
            return await self.import_csv(file_bytes, bank_account_iban, bank_name)
        
        # Use detected IBAN or provided IBAN
        effective_iban = bank_account_iban or detected_iban
        if not effective_iban:
            return BankImportResponse(
                imported_count=0,
                skipped_duplicates_count=0,
                total_in_file=len(parsed_transactions),
                errors=["Geen IBAN opgegeven en niet kunnen afleiden uit het bestand."],
                message=f"Import mislukt: IBAN ontbreekt ({format_name}).",
                bank_account_id=None,
            )
        
        # Get or create bank account
        bank_account = await self._get_or_create_bank_account(effective_iban, bank_name)
        
        # Get existing hashes for duplicate detection
        existing_hashes_result = await self.db.execute(
            select(BankTransaction.import_hash)
            .where(BankTransaction.administration_id == self.administration_id)
        )
        existing_hashes = set(row[0] for row in existing_hashes_result.fetchall())
        
        # Import transactions
        imported_count = 0
        skipped_duplicates = 0
        errors: List[str] = []
        
        for idx, parsed_tx in enumerate(parsed_transactions, start=1):
            try:
                # Compute hash for duplicate detection
                tx_hash = self._compute_hash(
                    parsed_tx.booking_date,
                    parsed_tx.amount,
                    parsed_tx.description,
                    reference=parsed_tx.reference,
                    counterparty_iban=parsed_tx.counterparty_iban,
                )
                
                if tx_hash in existing_hashes:
                    skipped_duplicates += 1
                    continue
                
                # Create transaction
                transaction = BankTransaction(
                    administration_id=self.administration_id,
                    bank_account_id=bank_account.id,
                    booking_date=parsed_tx.booking_date,
                    amount=parsed_tx.amount,
                    currency=parsed_tx.currency,
                    counterparty_name=parsed_tx.counterparty_name,
                    counterparty_iban=parsed_tx.counterparty_iban,
                    description=parsed_tx.description,
                    reference=parsed_tx.reference,
                    import_hash=tx_hash,
                    status=BankTransactionStatus.NEW,
                )
                self.db.add(transaction)
                existing_hashes.add(tx_hash)
                imported_count += 1
                
            except Exception as e:
                errors.append(f"Rij {idx}: {str(e)}")
        
        await self.db.commit()
        
        # Build response message
        if imported_count > 0 and len(errors) == 0:
            message = f"{imported_count} transacties geïmporteerd ({format_name})."
        elif imported_count > 0:
            message = f"{imported_count} transacties geïmporteerd, {len(errors)} fouten ({format_name})."
        elif skipped_duplicates > 0:
            message = f"Geen nieuwe transacties. {skipped_duplicates} duplicaten overgeslagen ({format_name})."
        else:
            message = f"Import mislukt: geen geldige transacties gevonden ({format_name})."
        
        return BankImportResponse(
            imported_count=imported_count,
            skipped_duplicates_count=skipped_duplicates,
            total_in_file=len(parsed_transactions),
            errors=errors[:10],
            message=message,
            bank_account_id=bank_account.id,
        )

    async def import_csv(
        self,
        file_bytes: bytes,
        bank_account_iban: Optional[str],
        bank_name: Optional[str],
    ) -> BankImportResponse:
        """
        Import bank transactions from a CSV file.
        
        Returns counts of imported, skipped (duplicate), and failed rows.
        """
        try:
            decoded = file_bytes.decode("utf-8-sig")
        except UnicodeDecodeError:
            decoded = file_bytes.decode("latin-1")

        reader = self._build_reader(decoded)
        if not reader.fieldnames:
            return BankImportResponse(
                imported_count=0,
                skipped_duplicates_count=0,
                total_in_file=0,
                errors=["CSV-bestand bevat geen kolommen."],
                message="Import mislukt: ontbrekende kolommen.",
                bank_account_id=None,
            )

        column_map = self._resolve_columns(reader.fieldnames)
        if not column_map:
            return BankImportResponse(
                imported_count=0,
                skipped_duplicates_count=0,
                total_in_file=0,
                errors=["CSV-bestand mist verplichte kolommen: datum, bedrag, omschrijving."],
                message="Import mislukt: ongeldige kolommen.",
                bank_account_id=None,
            )

        rows = list(reader)
        iban_from_file = self._infer_bank_account_iban(rows, column_map.get("account_iban"))
        effective_iban = bank_account_iban or iban_from_file
        if not effective_iban:
            return BankImportResponse(
                imported_count=0,
                skipped_duplicates_count=0,
                total_in_file=0,
                errors=["Geen IBAN opgegeven en niet kunnen afleiden uit het bestand."],
                message="Import mislukt: IBAN ontbreekt.",
                bank_account_id=None,
            )

        bank_account = await self._get_or_create_bank_account(effective_iban, bank_name)

        imported_count = 0
        skipped_duplicates = 0
        total_in_file = 0
        errors: List[str] = []

        existing_hashes_result = await self.db.execute(
            select(BankTransaction.import_hash)
            .where(BankTransaction.administration_id == self.administration_id)
        )
        existing_hashes = set(row[0] for row in existing_hashes_result.fetchall())

        for row_num, row in enumerate(rows, start=2):
            total_in_file += 1

            date_str = self._get_row_value(row, column_map.get("booking_date"))
            amount_str = self._get_row_value(row, column_map.get("amount"))
            description = self._get_row_value(row, column_map.get("description"))
            counterparty_iban = self._get_row_value(row, column_map.get("counterparty_iban"))
            counterparty_name = self._get_row_value(row, column_map.get("counterparty_name"))
            reference = self._get_row_value(row, column_map.get("reference"))

            booking_date = self._parse_date(date_str)
            if not booking_date:
                errors.append(f"Rij {row_num}: Ongeldige datum: {date_str}")
                continue

            amount = self._parse_amount(amount_str)
            if amount is None:
                errors.append(f"Rij {row_num}: Ongeldig bedrag: {amount_str}")
                continue

            if not description:
                errors.append(f"Rij {row_num}: Omschrijving is verplicht")
                continue

            raw_hash = self._compute_hash(
                booking_date,
                amount,
                description,
                reference=reference,
                counterparty_iban=counterparty_iban,
            )
            if raw_hash in existing_hashes:
                skipped_duplicates += 1
                continue

            transaction = BankTransaction(
                administration_id=self.administration_id,
                bank_account_id=bank_account.id,
                booking_date=booking_date,
                amount=amount,
                currency="EUR",
                counterparty_name=counterparty_name,
                counterparty_iban=counterparty_iban,
                description=description,
                reference=reference,
                import_hash=raw_hash,
                status=BankTransactionStatus.NEW,
            )
            self.db.add(transaction)
            existing_hashes.add(raw_hash)
            imported_count += 1

        await self.db.commit()

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
            skipped_duplicates_count=skipped_duplicates,
            total_in_file=total_in_file,
            errors=errors[:10],
            message=message,
            bank_account_id=bank_account.id,
        )

    async def get_match_suggestions(self, transaction_id: uuid.UUID) -> Tuple[BankTransaction, List[MatchSuggestion]]:
        """
        Generate match suggestions for a bank transaction.
        
        Enhanced matching rules:
        1. Invoice number in description/reference → very high confidence
        2. Amount + date proximity (±7 days) → high confidence
        3. Amount match (±1%) → medium confidence
        4. Recurring payment detection → medium confidence
        5. Counterparty IBAN match → lower confidence
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
        
        # Rule 1: Invoice number in description/reference (VERY HIGH confidence: 90-95)
        search_text = " ".join(filter(None, [transaction.description, transaction.reference]))
        invoice_numbers = self._extract_invoice_numbers(search_text)
        if invoice_numbers:
            for invoice_num in invoice_numbers:
                matched_items = await self._find_open_items_by_reference(invoice_num)
                for item in matched_items:
                    suggestions.append(MatchSuggestion(
                        entity_type="INVOICE",
                        entity_id=item.id,
                        entity_reference=item.document_number or invoice_num,
                        confidence_score=90,
                        amount=item.open_amount,
                        date=item.document_date,
                        explanation=f"Factuurnummer '{invoice_num}' gevonden in omschrijving of referentie",
                        proposed_action="APPLY_MATCH",
                    ))
        
        # Rule 2: Date proximity + Amount match (HIGH confidence: 75-85)
        date_proximity_matches = await self._match_by_date_proximity(transaction, days_tolerance=7)
        for match in date_proximity_matches:
            # Don't duplicate if already suggested
            if not any(s.entity_id == match.entity_id for s in suggestions):
                suggestions.append(match)
        
        # Rule 3: Amount match only (MEDIUM confidence: 60-80)
        amount_matches = await self._find_open_items_by_amount(
            abs(transaction.amount),
            tolerance_percent=1.0
        )
        for item in amount_matches:
            # Don't duplicate if already suggested
            if not any(s.entity_id == item.id for s in suggestions):
                score = 80 if item.open_amount == abs(transaction.amount) else 60
                suggestions.append(MatchSuggestion(
                    entity_type="INVOICE" if item.item_type == "RECEIVABLE" else "EXPENSE",
                    entity_id=item.id,
                    entity_reference=item.document_number or str(item.id)[:8],
                    confidence_score=score,
                    amount=item.open_amount,
                    date=item.document_date,
                    explanation=f"Bedrag €{item.open_amount:.2f} komt overeen" + 
                               (" (exact)" if item.open_amount == abs(transaction.amount) else " (binnen 1%)"),
                    proposed_action="APPLY_MATCH",
                ))
        
        # Rule 4: Recurring payment detection (MEDIUM confidence: 65-75)
        recurring_suggestions = await self._detect_recurring_payments(transaction)
        for recurring in recurring_suggestions:
            suggestions.append(recurring)
        
        # Rule 5: Counterparty IBAN match (LOWER confidence: 70)
        if transaction.counterparty_iban:
            party_matches = await self._find_parties_by_iban(transaction.counterparty_iban)
            for party in party_matches:
                # Find recent open items for this party
                party_items = await self._find_open_items_for_party(party.id)
                for item in party_items[:3]:  # Limit to 3 suggestions per party
                    if not any(s.entity_id == item.id for s in suggestions):
                        suggestions.append(MatchSuggestion(
                            entity_type="EXPENSE" if item.item_type == "PAYABLE" else "INVOICE",
                            entity_id=item.id,
                            entity_reference=item.document_number or party.name,
                            confidence_score=70,
                            amount=item.open_amount,
                            date=item.document_date,
                            explanation=f"IBAN {transaction.counterparty_iban[:8]}... behoort tot {party.name}",
                            proposed_action="APPLY_MATCH",
                        ))
        
        # Sort by confidence score descending
        suggestions.sort(key=lambda x: x.confidence_score, reverse=True)
        
        return transaction, suggestions[:5]  # Limit to top 5 suggestions


    def _extract_invoice_numbers(self, description: str) -> List[str]:
        """Extract potential invoice numbers from transaction description."""
        pattern = r"(factuur|invoice|inv)\s*[:#-]?\s*([A-Za-z0-9-]+)"
        matches = re.findall(pattern, description, re.IGNORECASE)
        numbers = [match[1] for match in matches if isinstance(match, tuple) and len(match) > 1]
        return list({n for n in numbers if n})

    async def _find_open_items_by_reference(self, reference: str) -> List[OpenItem]:
        """Find open items by document number/reference."""
        result = await self.db.execute(
            select(OpenItem)
            .where(OpenItem.administration_id == self.administration_id)
            .where(OpenItem.status.in_([OpenItemStatus.OPEN, OpenItemStatus.PARTIAL]))
            .where(
                or_(
                    OpenItem.document_number.ilike(f"%{reference}%"),
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
        """Find parties (suppliers/customers) by IBAN."""
        result = await self.db.execute(
            select(Party)
            .where(Party.administration_id == self.administration_id)
            .where(Party.iban == iban)
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
            .limit(10)
        )
        return list(result.scalars().all())
    
    async def _detect_recurring_payments(self, transaction: BankTransaction) -> List[MatchSuggestion]:
        """
        Detect recurring payments based on cadence and amount.
        
        Looks for similar transactions from the same counterparty with
        regular intervals (monthly, quarterly, etc.)
        """
        if not transaction.counterparty_iban:
            return []
        
        # Find previous transactions from same counterparty
        result = await self.db.execute(
            select(BankTransaction)
            .where(BankTransaction.administration_id == self.administration_id)
            .where(BankTransaction.counterparty_iban == transaction.counterparty_iban)
            .where(BankTransaction.id != transaction.id)
            .where(BankTransaction.status == BankTransactionStatus.MATCHED)
            .order_by(BankTransaction.booking_date.desc())
            .limit(12)  # Look at up to 12 previous transactions
        )
        previous_txs = list(result.scalars().all())
        
        if len(previous_txs) < 2:
            return []
        
        # Check for recurring pattern
        # Look for similar amounts (within 5%)
        similar_amount_txs = [
            tx for tx in previous_txs
            if abs(tx.amount) > 0 and 
            abs((abs(tx.amount) - abs(transaction.amount)) / abs(tx.amount)) < 0.05
        ]
        
        if len(similar_amount_txs) < 2:
            return []
        
        # Check for regular intervals (monthly = ~30 days, quarterly = ~90 days)
        intervals = []
        for i in range(len(similar_amount_txs) - 1):
            days_diff = (similar_amount_txs[i].booking_date - similar_amount_txs[i+1].booking_date).days
            intervals.append(days_diff)
        
        if not intervals:
            return []
        
        avg_interval = sum(intervals) / len(intervals)
        
        # Determine cadence
        cadence = None
        if 25 <= avg_interval <= 35:
            cadence = "monthly"
            confidence = 75
        elif 85 <= avg_interval <= 95:
            cadence = "quarterly"
            confidence = 70
        elif 175 <= avg_interval <= 185:
            cadence = "half-yearly"
            confidence = 70
        elif 360 <= avg_interval <= 370:
            cadence = "yearly"
            confidence = 65
        
        if not cadence:
            return []
        
        # Build suggestion based on the most recent match
        most_recent = similar_amount_txs[0]
        counterparty_name = transaction.counterparty_name or "Unknown"
        
        return [MatchSuggestion(
            entity_type="EXPENSE",
            entity_id=most_recent.matched_entity_id or uuid.uuid4(),  # Use matched entity or generate placeholder
            entity_reference=f"{counterparty_name} - {cadence} payment",
            confidence_score=confidence,
            amount=abs(transaction.amount),
            date=transaction.booking_date,
            explanation=f"Recurring {cadence} payment detected from {counterparty_name} (€{abs(transaction.amount):.2f})",
            proposed_action="CREATE_EXPENSE",
        )]
    
    async def _match_by_date_proximity(
        self,
        transaction: BankTransaction,
        days_tolerance: int = 7
    ) -> List[MatchSuggestion]:
        """
        Match transactions based on date proximity to open items.
        
        Looks for open items with dates within N days of the transaction.
        Combined with amount matching for higher confidence.
        """
        date_from = transaction.booking_date - timedelta(days=days_tolerance)
        date_to = transaction.booking_date + timedelta(days=days_tolerance)
        
        # Find open items within date range with similar amounts
        amount_tolerance = abs(transaction.amount) * Decimal("0.01")  # 1% tolerance
        min_amount = abs(transaction.amount) - amount_tolerance
        max_amount = abs(transaction.amount) + amount_tolerance
        
        result = await self.db.execute(
            select(OpenItem)
            .where(OpenItem.administration_id == self.administration_id)
            .where(OpenItem.status.in_([OpenItemStatus.OPEN, OpenItemStatus.PARTIAL]))
            .where(OpenItem.document_date.between(date_from, date_to))
            .where(OpenItem.open_amount.between(min_amount, max_amount))
            .order_by(
                # Prioritize exact date match, then closer dates
                func.abs(
                    func.extract('epoch', OpenItem.document_date - transaction.booking_date)
                )
            )
            .limit(5)
        )
        items = list(result.scalars().all())
        
        suggestions = []
        for item in items:
            days_diff = abs((item.document_date - transaction.booking_date).days)
            # Higher confidence for closer dates and exact amounts
            confidence = 85
            if days_diff > 3:
                confidence -= (days_diff - 3) * 2
            if item.open_amount != abs(transaction.amount):
                confidence -= 5
            
            suggestions.append(MatchSuggestion(
                entity_type="INVOICE" if item.item_type == "RECEIVABLE" else "EXPENSE",
                entity_id=item.id,
                entity_reference=item.document_number or str(item.id)[:8],
                confidence_score=max(60, confidence),
                amount=item.open_amount,
                date=item.document_date,
                explanation=f"Bedrag en datum komen overeen (±{days_diff} days, €{item.open_amount:.2f})",
                proposed_action="APPLY_MATCH",
            ))
        
        return suggestions


        """Find parties by bank account IBAN."""
        normalized_iban = iban.strip().upper().replace(" ", "")
        iban_column = None
        for candidate in ("bank_account", "iban", "bank_account_iban"):
            if hasattr(Party, candidate):
                iban_column = getattr(Party, candidate)
                break

        if iban_column is None:
            return []

        result = await self.db.execute(
            select(Party)
            .where(Party.administration_id == self.administration_id)
            .where(iban_column.ilike(f"%{normalized_iban}%"))
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
        if request.action_type == ReconciliationActionEnum.IGNORE:
            transaction.status = BankTransactionStatus.IGNORED
            transaction.matched_entity_type = None
            transaction.matched_entity_id = None

        elif request.action_type == ReconciliationActionEnum.APPLY_MATCH:
            if not request.match_entity_id or not request.match_entity_type:
                raise ValueError("match_entity_id en match_entity_type zijn verplicht voor APPLY_MATCH")

            open_item = await self._get_open_item(request.match_entity_id)
            if not open_item:
                raise ValueError("Gekoppelde open post niet gevonden")

            payment_entry_id = await self._create_payment_entry(transaction, open_item)
            await self._allocate_open_item(open_item, payment_entry_id, abs(transaction.amount))

            transaction.status = BankTransactionStatus.MATCHED
            transaction.matched_entity_type = request.match_entity_type
            transaction.matched_entity_id = request.match_entity_id
        
        elif request.action_type == ReconciliationActionEnum.CREATE_EXPENSE:
            # Create journal entry for the expense
            journal_entry_id = await self._create_expense_entry(transaction, request)
            transaction.status = BankTransactionStatus.MATCHED
            transaction.matched_entity_type = "JOURNAL_ENTRY"
            transaction.matched_entity_id = journal_entry_id
        
        elif request.action_type == ReconciliationActionEnum.UNMATCH:
            transaction.status = BankTransactionStatus.NEW
            transaction.matched_entity_type = None
            transaction.matched_entity_id = None
        
        # Record action for audit trail
        action = ReconciliationAction(
            administration_id=self.administration_id,
            accountant_user_id=self.user_id,
            bank_transaction_id=transaction_id,
            action_type=ReconciliationActionType(request.action_type.value),
            payload={
                "match_entity_type": request.match_entity_type,
                "match_entity_id": str(request.match_entity_id) if request.match_entity_id else None,
                "expense_category": request.expense_category,
                "vat_rate": str(request.vat_rate) if request.vat_rate is not None else None,
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

    async def _allocate_open_item(
        self,
        open_item: OpenItem,
        journal_entry_id: uuid.UUID,
        amount: Decimal,
    ) -> None:
        allocation_amount = min(amount, open_item.open_amount)
        allocation = OpenItemAllocation(
            open_item_id=open_item.id,
            payment_journal_entry_id=journal_entry_id,
            allocated_amount=allocation_amount,
            allocation_date=datetime.now(timezone.utc).date(),
        )
        self.db.add(allocation)

        open_item.paid_amount += allocation_amount
        open_item.update_status()

    async def _create_payment_entry(
        self,
        transaction: BankTransaction,
        open_item: OpenItem,
    ) -> uuid.UUID:
        period = await self._get_or_create_period(transaction.booking_date)
        bank_account = await self._get_bank_control_account()
        if not bank_account:
            raise ValueError("Bank grootboekrekening niet gevonden")

        control_type = "AR" if open_item.item_type == "RECEIVABLE" else "AP"
        counterparty_account = await self._get_control_account(control_type)
        if not counterparty_account:
            raise ValueError("Debiteuren/crediteuren rekening niet gevonden")

        entry_number = await self._generate_entry_number(transaction.booking_date)
        amount = abs(transaction.amount)

        entry = JournalEntry(
            administration_id=self.administration_id,
            period_id=period.id if period else None,
            entry_number=entry_number,
            entry_date=transaction.booking_date,
            description=f"Bankbetaling: {transaction.description[:200]}",
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

        if open_item.item_type == "RECEIVABLE":
            debit_account = bank_account
            credit_account = counterparty_account
        else:
            debit_account = counterparty_account
            credit_account = bank_account

        line1 = JournalLine(
            journal_entry_id=entry.id,
            account_id=debit_account.id,
            line_number=1,
            description=transaction.description[:200],
            debit_amount=amount,
            credit_amount=Decimal("0.00"),
        )
        line2 = JournalLine(
            journal_entry_id=entry.id,
            account_id=credit_account.id,
            line_number=2,
            description=transaction.description[:200],
            debit_amount=Decimal("0.00"),
            credit_amount=amount,
        )
        self.db.add_all([line1, line2])

        return entry.id

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
        expense_account = await self._get_account_by_code(request.expense_category or "4000")
        if not expense_account:
            raise ValueError(f"Grootboekrekening {request.expense_category or '4000'} niet gevonden")
        
        # Get bank account (control account)
        bank_account = await self._get_bank_control_account()
        if not bank_account:
            raise ValueError("Bank grootboekrekening niet gevonden")
        
        # Get VAT code if provided
        vat_code = None
        vat_amount = Decimal("0.00")
        vat_base = abs(transaction.amount)
        if request.vat_rate is not None:
            vat_service = VatPostingService(self.db, self.administration_id)
            vat_rate = Decimal(str(request.vat_rate))
            vat_base, vat_amount = vat_service.extract_base_from_gross(abs(transaction.amount), vat_rate)
            vat_code = await self._get_vat_code_by_rate(vat_rate)
        
        # Generate entry number
        entry_number = await self._generate_entry_number(transaction.booking_date)
        
        # Create journal entry
        amount = abs(transaction.amount)
        net_amount = vat_base
        
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
            vat_amount=vat_amount if vat_amount > 0 else None,
            taxable_amount=net_amount if vat_amount > 0 else None,
        )
        self.db.add(expense_line)
        
        # Line 2: Debit VAT recoverable (if applicable)
        if vat_amount > 0:
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

    async def _get_control_account(self, control_type: str) -> Optional[ChartOfAccount]:
        result = await self.db.execute(
            select(ChartOfAccount)
            .where(ChartOfAccount.administration_id == self.administration_id)
            .where(ChartOfAccount.control_type == control_type)
            .where(ChartOfAccount.is_active)
            .limit(1)
        )
        return result.scalar_one_or_none()

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
            .where(ChartOfAccount.is_active)
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def _get_bank_control_account(self) -> Optional[ChartOfAccount]:
        """Get the bank control account."""
        result = await self.db.execute(
            select(ChartOfAccount)
            .where(ChartOfAccount.administration_id == self.administration_id)
            .where(ChartOfAccount.control_type == "BANK")
            .where(ChartOfAccount.is_active)
            .limit(1)
        )
        account = result.scalar_one_or_none()
        
        # Fallback: try to find by common account codes
        if not account:
            result = await self.db.execute(
                select(ChartOfAccount)
                .where(ChartOfAccount.administration_id == self.administration_id)
                .where(ChartOfAccount.account_code.in_(["1100", "1000", "110"]))
                .where(ChartOfAccount.is_active)
                .limit(1)
            )
            account = result.scalar_one_or_none()
        
        return account

    async def _get_vat_code_by_rate(self, rate: Decimal) -> Optional[VatCode]:
        result = await self.db.execute(
            select(VatCode)
            .where(VatCode.administration_id == self.administration_id)
            .where(VatCode.is_active)
            .where(VatCode.rate == rate)
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
            .where(ChartOfAccount.is_active)
            .limit(1)
        )
        account = result.scalar_one_or_none()
        
        # Fallback: try common account codes for input VAT
        if not account:
            result = await self.db.execute(
                select(ChartOfAccount)
                .where(ChartOfAccount.administration_id == self.administration_id)
                .where(ChartOfAccount.account_code.in_(["1510", "1500", "151"]))
                .where(ChartOfAccount.is_active)
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
