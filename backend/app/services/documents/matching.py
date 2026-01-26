"""
Document Matching Service

Provides deterministic matching logic for documents:
- Duplicate detection (invoice number + supplier + amount + date tolerance)
- Match to open items (AR/AP)
- Auto-suggest actions based on document content
"""
import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Optional, List, Tuple
from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.document import (
    Document, 
    DocumentStatus, 
    DocumentSuggestedAction,
    DocumentSuggestedActionType,
)
from app.models.subledger import Party, OpenItem, OpenItemStatus
from app.models.assets import FixedAsset


# Matching thresholds
DUPLICATE_DATE_TOLERANCE_DAYS = 3
HIGH_MATCH_CONFIDENCE = Decimal("0.85")
MEDIUM_MATCH_CONFIDENCE = Decimal("0.65")
LOW_MATCH_CONFIDENCE = Decimal("0.40")


class DocumentMatchingService:
    """
    Service for matching documents to existing data.
    
    Responsibilities:
    - Detect duplicate documents
    - Match documents to open items (AR/AP)
    - Match documents to parties (suppliers/customers)
    - Generate suggested actions based on matching results
    """
    
    def __init__(self, db: AsyncSession, administration_id: uuid.UUID):
        self.db = db
        self.administration_id = administration_id
    
    async def run_matching(self, document_id: uuid.UUID) -> Document:
        """
        Run all matching logic for a document.
        
        This is idempotent - can be run multiple times safely.
        """
        # Load document with extracted fields
        result = await self.db.execute(
            select(Document)
            .where(Document.id == document_id)
            .where(Document.administration_id == self.administration_id)
            .options(selectinload(Document.extracted_fields))
        )
        document = result.scalar_one_or_none()
        
        if not document:
            raise ValueError(f"Document {document_id} not found")
        
        # Clear existing suggested actions for idempotency
        await self.db.execute(
            select(DocumentSuggestedAction)
            .where(DocumentSuggestedAction.document_id == document_id)
        )
        existing_actions = await self.db.execute(
            select(DocumentSuggestedAction)
            .where(DocumentSuggestedAction.document_id == document_id)
        )
        for action in existing_actions.scalars().all():
            await self.db.delete(action)
        
        # Run matching steps
        await self._check_duplicates(document)
        await self._match_party(document)
        await self._match_open_items(document)
        await self._check_asset_purchase(document)
        await self._generate_default_suggestions(document)
        
        # Update document status if needed
        if document.status == DocumentStatus.EXTRACTED:
            document.status = DocumentStatus.NEEDS_REVIEW
        
        document.last_processed_at = datetime.now(timezone.utc)
        document.process_count += 1
        
        await self.db.flush()
        return document
    
    async def _check_duplicates(self, document: Document) -> None:
        """
        Check for duplicate documents.
        
        Duplicates are detected based on:
        - Same supplier name (fuzzy)
        - Same invoice number
        - Same or similar amount
        - Date within tolerance
        """
        if not document.invoice_number or not document.supplier_name:
            return
        
        # Query for potential duplicates
        query = (
            select(Document)
            .where(Document.administration_id == self.administration_id)
            .where(Document.id != document.id)
            .where(Document.invoice_number == document.invoice_number)
            .where(Document.status.in_([
                DocumentStatus.EXTRACTED,
                DocumentStatus.NEEDS_REVIEW,
                DocumentStatus.POSTED,
            ]))
        )
        
        # Add supplier name filter (exact match for now)
        if document.supplier_name:
            query = query.where(
                func.lower(Document.supplier_name) == func.lower(document.supplier_name)
            )
        
        result = await self.db.execute(query)
        potential_duplicates = result.scalars().all()
        
        for dup in potential_duplicates:
            # Check amount similarity
            amount_match = self._amounts_similar(document.total_amount, dup.total_amount)
            
            # Check date proximity
            date_match = self._dates_within_tolerance(
                document.invoice_date, 
                dup.invoice_date,
                DUPLICATE_DATE_TOLERANCE_DAYS
            )
            
            if amount_match and date_match:
                # Mark as duplicate
                document.is_duplicate = True
                document.duplicate_of_id = dup.id
                document.match_confidence = HIGH_MATCH_CONFIDENCE
                
                # Create suggestion
                suggestion = DocumentSuggestedAction(
                    document_id=document.id,
                    action_type=DocumentSuggestedActionType.MARK_DUPLICATE,
                    title="Potential duplicate detected",
                    explanation=f"This document appears to be a duplicate of document uploaded on {dup.created_at.date()}. "
                              f"Same invoice number ({document.invoice_number}), supplier ({document.supplier_name}), "
                              f"and amount ({document.total_amount}).",
                    confidence_score=HIGH_MATCH_CONFIDENCE,
                    parameters={
                        "duplicate_of_id": str(dup.id),
                        "duplicate_filename": dup.original_filename,
                    },
                    priority=1,
                )
                self.db.add(suggestion)
                break  # Only flag first duplicate found
    
    async def _match_party(self, document: Document) -> None:
        """Match document to a party (supplier/customer)."""
        if not document.supplier_name:
            return
        
        # Try exact match first
        result = await self.db.execute(
            select(Party)
            .where(Party.administration_id == self.administration_id)
            .where(func.lower(Party.name) == func.lower(document.supplier_name))
            .where(Party.is_active == True)
        )
        party = result.scalar_one_or_none()
        
        if party:
            document.matched_party_id = party.id
            document.match_confidence = HIGH_MATCH_CONFIDENCE
            return
        
        # Try partial match
        result = await self.db.execute(
            select(Party)
            .where(Party.administration_id == self.administration_id)
            .where(Party.is_active == True)
            .where(
                or_(
                    func.lower(Party.name).contains(func.lower(document.supplier_name)),
                    func.lower(document.supplier_name).contains(func.lower(Party.name)),
                )
            )
        )
        parties = result.scalars().all()
        
        if len(parties) == 1:
            document.matched_party_id = parties[0].id
            document.match_confidence = MEDIUM_MATCH_CONFIDENCE
    
    async def _match_open_items(self, document: Document) -> None:
        """Match document to open items (AR/AP)."""
        if not document.total_amount or not document.matched_party_id:
            return
        
        # Look for open items from this party with matching amount
        result = await self.db.execute(
            select(OpenItem)
            .where(OpenItem.administration_id == self.administration_id)
            .where(OpenItem.party_id == document.matched_party_id)
            .where(OpenItem.status.in_([OpenItemStatus.OPEN, OpenItemStatus.PARTIAL]))
            .where(OpenItem.open_amount == document.total_amount)
        )
        matching_items = result.scalars().all()
        
        if len(matching_items) == 1:
            # Exact match - high confidence
            item = matching_items[0]
            document.matched_open_item_id = item.id
            document.match_confidence = HIGH_MATCH_CONFIDENCE
            
            # Create allocation suggestion
            suggestion = DocumentSuggestedAction(
                document_id=document.id,
                action_type=DocumentSuggestedActionType.ALLOCATE_OPEN_ITEM,
                title="Match to open item",
                explanation=f"This document matches open item {item.document_number or 'N/A'} "
                          f"from {item.document_date} with amount {item.open_amount}. "
                          f"Posting will allocate this payment.",
                confidence_score=HIGH_MATCH_CONFIDENCE,
                parameters={
                    "open_item_id": str(item.id),
                    "open_item_amount": str(item.open_amount),
                    "open_item_document_number": item.document_number,
                },
                priority=2,
            )
            self.db.add(suggestion)
            return
        
        # Check for partial matches (amount within 10%)
        tolerance = document.total_amount * Decimal("0.10")
        result = await self.db.execute(
            select(OpenItem)
            .where(OpenItem.administration_id == self.administration_id)
            .where(OpenItem.party_id == document.matched_party_id)
            .where(OpenItem.status.in_([OpenItemStatus.OPEN, OpenItemStatus.PARTIAL]))
            .where(
                and_(
                    OpenItem.open_amount >= document.total_amount - tolerance,
                    OpenItem.open_amount <= document.total_amount + tolerance,
                )
            )
        )
        partial_matches = result.scalars().all()
        
        for item in partial_matches:
            # Create suggestion with lower confidence
            suggestion = DocumentSuggestedAction(
                document_id=document.id,
                action_type=DocumentSuggestedActionType.ALLOCATE_OPEN_ITEM,
                title="Possible match to open item",
                explanation=f"This document may match open item {item.document_number or 'N/A'} "
                          f"(amount: {item.open_amount} vs document: {document.total_amount}). "
                          f"Review before allocating.",
                confidence_score=MEDIUM_MATCH_CONFIDENCE,
                parameters={
                    "open_item_id": str(item.id),
                    "open_item_amount": str(item.open_amount),
                    "open_item_document_number": item.document_number,
                },
                priority=3,
            )
            self.db.add(suggestion)
    
    async def _check_asset_purchase(self, document: Document) -> None:
        """
        Check if document indicates an asset purchase.
        
        Heuristics:
        - Amount above threshold (e.g., €450 for Dutch tax rules)
        - Keywords in description/filename suggesting equipment/assets
        """
        ASSET_THRESHOLD = Decimal("450.00")  # Dutch tax threshold
        
        if not document.total_amount or document.total_amount < ASSET_THRESHOLD:
            return
        
        # Check for asset-related keywords
        asset_keywords = [
            'laptop', 'computer', 'machine', 'equipment', 'vehicle', 'car', 'auto',
            'furniture', 'meubel', 'kantoor', 'printer', 'server', 'telefoon',
            'phone', 'iphone', 'macbook', 'desk', 'bureau', 'stoel', 'chair',
        ]
        
        filename_lower = document.original_filename.lower()
        supplier_lower = (document.supplier_name or '').lower()
        
        is_potential_asset = any(
            keyword in filename_lower or keyword in supplier_lower
            for keyword in asset_keywords
        )
        
        # Also check if amount is unusually high (>€1000) for regular expense
        if document.total_amount >= Decimal("1000.00"):
            is_potential_asset = True
        
        if is_potential_asset:
            suggestion = DocumentSuggestedAction(
                document_id=document.id,
                action_type=DocumentSuggestedActionType.RECLASSIFY_TO_ASSET,
                title="Possible asset purchase",
                explanation=f"This document has a high amount ({document.total_amount}) "
                          f"and may represent a fixed asset purchase. Consider capitalizing "
                          f"instead of expensing for tax purposes.",
                confidence_score=MEDIUM_MATCH_CONFIDENCE if document.total_amount >= Decimal("1000.00") else LOW_MATCH_CONFIDENCE,
                parameters={
                    "amount": str(document.total_amount),
                    "suggested_asset_type": "Equipment",
                },
                priority=4,
            )
            self.db.add(suggestion)
    
    async def _generate_default_suggestions(self, document: Document) -> None:
        """Generate default suggestions for documents without specific matches."""
        # Check if any suggestions already exist
        result = await self.db.execute(
            select(func.count(DocumentSuggestedAction.id))
            .where(DocumentSuggestedAction.document_id == document.id)
        )
        suggestion_count = result.scalar() or 0
        
        if suggestion_count == 0 and document.total_amount:
            # Add default expense posting suggestion
            suggestion = DocumentSuggestedAction(
                document_id=document.id,
                action_type=DocumentSuggestedActionType.POST_AS_EXPENSE,
                title="Post as expense",
                explanation=f"No specific matches found. This document can be posted as a regular "
                          f"expense with amount {document.total_amount}.",
                confidence_score=LOW_MATCH_CONFIDENCE,
                parameters={
                    "amount": str(document.total_amount),
                    "vat_amount": str(document.vat_amount) if document.vat_amount else None,
                },
                priority=5,
            )
            self.db.add(suggestion)
        
        # Add manual review suggestion if extraction confidence is low
        if document.extraction_confidence and document.extraction_confidence < Decimal("0.70"):
            suggestion = DocumentSuggestedAction(
                document_id=document.id,
                action_type=DocumentSuggestedActionType.NEEDS_MANUAL_REVIEW,
                title="Low extraction confidence",
                explanation=f"Document extraction confidence is {document.extraction_confidence}. "
                          f"Please verify extracted fields before posting.",
                confidence_score=LOW_MATCH_CONFIDENCE,
                parameters={
                    "extraction_confidence": str(document.extraction_confidence),
                },
                priority=1,
            )
            self.db.add(suggestion)
    
    def _amounts_similar(
        self, 
        amount1: Optional[Decimal], 
        amount2: Optional[Decimal],
        tolerance: Decimal = Decimal("0.01")
    ) -> bool:
        """Check if two amounts are similar within tolerance."""
        if amount1 is None or amount2 is None:
            return False
        return abs(amount1 - amount2) <= tolerance
    
    def _dates_within_tolerance(
        self,
        date1: Optional[datetime],
        date2: Optional[datetime],
        tolerance_days: int
    ) -> bool:
        """Check if two dates are within tolerance."""
        if date1 is None or date2 is None:
            return True  # If dates missing, don't fail on date check
        
        diff = abs((date1 - date2).days)
        return diff <= tolerance_days
    
    async def find_duplicates(
        self,
        invoice_number: str,
        supplier_name: str,
        amount: Decimal,
        exclude_doc_id: Optional[uuid.UUID] = None,
    ) -> List[Document]:
        """
        Find potential duplicate documents.
        
        Returns list of documents that might be duplicates.
        """
        query = (
            select(Document)
            .where(Document.administration_id == self.administration_id)
            .where(Document.invoice_number == invoice_number)
            .where(Document.status.in_([
                DocumentStatus.EXTRACTED,
                DocumentStatus.NEEDS_REVIEW,
                DocumentStatus.POSTED,
            ]))
        )
        
        if supplier_name:
            query = query.where(
                func.lower(Document.supplier_name) == func.lower(supplier_name)
            )
        
        if exclude_doc_id:
            query = query.where(Document.id != exclude_doc_id)
        
        result = await self.db.execute(query)
        candidates = result.scalars().all()
        
        # Filter by amount similarity
        duplicates = []
        for doc in candidates:
            if self._amounts_similar(amount, doc.total_amount, Decimal("0.01")):
                duplicates.append(doc)
        
        return duplicates
