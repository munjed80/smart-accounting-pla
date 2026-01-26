"""
Evidence Pack Service

Service layer for generating VAT compliance evidence packs.

Evidence packs contain:
- Summary of VAT boxes
- List of relevant journal entries
- List of invoices/documents used in VAT calculation
- Validation status + acknowledged issues
- Period snapshot hash/id
"""
import uuid
import os
import json
import hashlib
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List
from decimal import Decimal
from pathlib import Path
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.administration import Administration
from app.models.ledger import AccountingPeriod, PeriodStatus, JournalEntry, JournalEntryStatus
from app.models.document import Document, DocumentStatus
from app.models.issues import ClientIssue, IssueSeverity
from app.models.accountant_dashboard import AccountantClientAssignment
from app.models.work_queue import EvidencePack, DashboardAuditLog


# Storage configuration
EVIDENCE_STORAGE_PATH = os.environ.get("EVIDENCE_STORAGE_PATH", "/data/evidence")


class EvidencePackServiceError(Exception):
    """Base exception for evidence pack service operations."""
    pass


class RateLimitExceededError(EvidencePackServiceError):
    """Raised when rate limit is exceeded."""
    pass


class UnauthorizedClientError(EvidencePackServiceError):
    """Raised when accessing unassigned client."""
    pass


class DecimalEncoder(json.JSONEncoder):
    """JSON encoder that handles Decimal objects."""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return float(obj)
        return super().default(obj)


class EvidencePackService:
    """
    Service for generating VAT evidence packs.
    
    Supports:
    - VAT_EVIDENCE: Full VAT compliance pack
    - AUDIT_TRAIL: Period audit trail
    """
    
    # Rate limit: max packs per minute per accountant
    RATE_LIMIT_WINDOW_SECONDS = 60
    RATE_LIMIT_MAX_PACKS = 5
    
    def __init__(self, db: AsyncSession, accountant_id: uuid.UUID):
        self.db = db
        self.accountant_id = accountant_id
        self.storage_path = Path(EVIDENCE_STORAGE_PATH)
    
    async def check_rate_limit(self) -> bool:
        """Check if rate limit allows new pack generation."""
        from datetime import timedelta
        window_start = datetime.now(timezone.utc) - timedelta(seconds=self.RATE_LIMIT_WINDOW_SECONDS)
        
        result = await self.db.execute(
            select(func.count(EvidencePack.id))
            .where(EvidencePack.created_by_id == self.accountant_id)
            .where(EvidencePack.created_at >= window_start)
        )
        count = result.scalar() or 0
        
        return count < self.RATE_LIMIT_MAX_PACKS
    
    async def verify_client_access(self, administration_id: uuid.UUID) -> bool:
        """Verify accountant has access to the client."""
        # Check explicit assignment
        result = await self.db.execute(
            select(AccountantClientAssignment.id)
            .where(AccountantClientAssignment.accountant_id == self.accountant_id)
            .where(AccountantClientAssignment.administration_id == administration_id)
        )
        if result.scalar_one_or_none():
            return True
        
        # Check membership
        from app.models.administration import AdministrationMember, MemberRole
        member_result = await self.db.execute(
            select(AdministrationMember.id)
            .where(AdministrationMember.user_id == self.accountant_id)
            .where(AdministrationMember.administration_id == administration_id)
            .where(AdministrationMember.role.in_([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.ACCOUNTANT]))
        )
        return member_result.scalar_one_or_none() is not None
    
    async def generate_evidence_pack(
        self,
        administration_id: uuid.UUID,
        period_id: uuid.UUID,
        pack_type: str = "VAT_EVIDENCE",
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> EvidencePack:
        """
        Generate a VAT evidence pack for a client and period.
        
        Args:
            administration_id: Client ID
            period_id: Accounting period ID
            pack_type: Type of pack (VAT_EVIDENCE or AUDIT_TRAIL)
            
        Returns:
            EvidencePack record with storage path
        """
        # Check rate limit
        if not await self.check_rate_limit():
            raise RateLimitExceededError("Rate limit exceeded. Please wait before generating more evidence packs.")
        
        # Verify access
        if not await self.verify_client_access(administration_id):
            raise UnauthorizedClientError("You do not have access to this client.")
        
        # Get administration
        admin_result = await self.db.execute(
            select(Administration).where(Administration.id == administration_id)
        )
        administration = admin_result.scalar_one_or_none()
        if not administration:
            raise EvidencePackServiceError("Administration not found")
        
        # Get period
        period_result = await self.db.execute(
            select(AccountingPeriod).where(AccountingPeriod.id == period_id)
        )
        period = period_result.scalar_one_or_none()
        if not period:
            raise EvidencePackServiceError("Period not found")
        
        if period.administration_id != administration_id:
            raise EvidencePackServiceError("Period does not belong to this administration")
        
        # Build evidence pack content
        content = await self._build_pack_content(administration, period, pack_type)
        
        # Generate file
        file_content = json.dumps(content, indent=2, cls=DecimalEncoder)
        checksum = hashlib.sha256(file_content.encode()).hexdigest()
        
        # Create storage path
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        filename = f"{pack_type}_{administration.kvk_number or 'unknown'}_{period.name}_{timestamp}.json"
        relative_path = f"{administration_id}/{period_id}/{filename}"
        full_path = self.storage_path / relative_path
        
        # Ensure directory exists
        full_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Write file
        with open(full_path, "w") as f:
            f.write(file_content)
        
        file_size = full_path.stat().st_size
        
        # Create database record
        evidence_pack = EvidencePack(
            administration_id=administration_id,
            period_id=period_id,
            pack_type=pack_type,
            created_by_id=self.accountant_id,
            storage_path=str(relative_path),
            checksum=checksum,
            file_size_bytes=file_size,
            metadata={
                "administration_name": administration.name,
                "kvk_number": administration.kvk_number,
                "btw_number": administration.btw_number,
                "period_name": period.name,
                "period_status": period.status.value,
                "generated_at": datetime.now(timezone.utc).isoformat(),
            },
        )
        self.db.add(evidence_pack)
        
        # Create audit log
        audit = DashboardAuditLog(
            user_id=self.accountant_id,
            action_type="EVIDENCE_PACK_GENERATE",
            administration_id=administration_id,
            entity_type="evidence_pack",
            entity_id=evidence_pack.id,
            details={
                "pack_type": pack_type,
                "period_name": period.name,
                "file_size_bytes": file_size,
                "checksum": checksum,
            },
            ip_address=ip_address,
            user_agent=user_agent,
        )
        self.db.add(audit)
        
        await self.db.commit()
        await self.db.refresh(evidence_pack)
        
        return evidence_pack
    
    async def _build_pack_content(
        self, 
        administration: Administration, 
        period: AccountingPeriod,
        pack_type: str,
    ) -> Dict[str, Any]:
        """Build the content of an evidence pack."""
        content = {
            "pack_type": pack_type,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "generated_by_accountant_id": str(self.accountant_id),
            "administration": {
                "id": str(administration.id),
                "name": administration.name,
                "kvk_number": administration.kvk_number,
                "btw_number": administration.btw_number,
            },
            "period": {
                "id": str(period.id),
                "name": period.name,
                "start_date": period.start_date.isoformat(),
                "end_date": period.end_date.isoformat(),
                "status": period.status.value,
                "finalized_at": period.finalized_at.isoformat() if period.finalized_at else None,
                "locked_at": period.locked_at.isoformat() if period.locked_at else None,
            },
        }
        
        if pack_type == "VAT_EVIDENCE":
            content.update(await self._build_vat_evidence(administration.id, period))
        elif pack_type == "AUDIT_TRAIL":
            content.update(await self._build_audit_trail(administration.id, period))
        
        return content
    
    async def _build_vat_evidence(
        self, 
        administration_id: uuid.UUID, 
        period: AccountingPeriod
    ) -> Dict[str, Any]:
        """Build VAT-specific evidence content."""
        # Get journal entries for the period
        entries_result = await self.db.execute(
            select(JournalEntry)
            .where(JournalEntry.administration_id == administration_id)
            .where(JournalEntry.transaction_date >= period.start_date)
            .where(JournalEntry.transaction_date <= period.end_date)
            .where(JournalEntry.status == JournalEntryStatus.POSTED)
            .order_by(JournalEntry.transaction_date)
        )
        entries = entries_result.scalars().all()
        
        # Get documents for the period
        docs_result = await self.db.execute(
            select(Document)
            .where(Document.administration_id == administration_id)
            .where(Document.created_at >= datetime.combine(period.start_date, datetime.min.time()).replace(tzinfo=timezone.utc))
            .where(Document.created_at <= datetime.combine(period.end_date, datetime.max.time()).replace(tzinfo=timezone.utc))
        )
        documents = docs_result.scalars().all()
        
        # Get issues for the period
        issues_result = await self.db.execute(
            select(ClientIssue)
            .where(ClientIssue.administration_id == administration_id)
            .where(ClientIssue.created_at >= datetime.combine(period.start_date, datetime.min.time()).replace(tzinfo=timezone.utc))
            .where(ClientIssue.created_at <= datetime.combine(period.end_date, datetime.max.time()).replace(tzinfo=timezone.utc))
        )
        issues = issues_result.scalars().all()
        
        # Calculate VAT summary (simplified - actual VAT calculations would come from VAT service)
        vat_summary = {
            "box_1a_sales_high": Decimal("0"),
            "box_1b_sales_low": Decimal("0"),
            "box_2a_supplies_services_from_abroad": Decimal("0"),
            "box_3_private_use": Decimal("0"),
            "box_4a_vat_on_sales": Decimal("0"),
            "box_4b_vat_on_sales_low": Decimal("0"),
            "box_5a_vat_on_supplies": Decimal("0"),
            "box_5b_input_vat": Decimal("0"),
            "total_vat_due": Decimal("0"),
        }
        
        return {
            "vat_summary": {k: float(v) for k, v in vat_summary.items()},
            "journal_entries": [
                {
                    "id": str(e.id),
                    "booking_number": e.booking_number,
                    "transaction_date": e.transaction_date.isoformat(),
                    "description": e.description,
                    "total_debit": float(e.total_debit) if e.total_debit else 0,
                    "total_credit": float(e.total_credit) if e.total_credit else 0,
                }
                for e in entries
            ],
            "documents": [
                {
                    "id": str(d.id),
                    "filename": d.original_filename,
                    "status": d.status.value if d.status else None,
                    "created_at": d.created_at.isoformat() if d.created_at else None,
                }
                for d in documents
            ],
            "validation_status": {
                "total_issues": len(issues),
                "red_count": sum(1 for i in issues if i.severity == IssueSeverity.RED),
                "yellow_count": sum(1 for i in issues if i.severity == IssueSeverity.YELLOW),
                "resolved_count": sum(1 for i in issues if i.is_resolved),
                "issues": [
                    {
                        "id": str(i.id),
                        "code": i.issue_code,
                        "severity": i.severity.value if i.severity else None,
                        "title": i.title,
                        "is_resolved": i.is_resolved,
                        "resolved_at": i.resolved_at.isoformat() if i.resolved_at else None,
                    }
                    for i in issues
                ],
            },
            "entry_count": len(entries),
            "document_count": len(documents),
        }
    
    async def _build_audit_trail(
        self, 
        administration_id: uuid.UUID, 
        period: AccountingPeriod
    ) -> Dict[str, Any]:
        """Build audit trail content."""
        # Get all journal entries with their history
        entries_result = await self.db.execute(
            select(JournalEntry)
            .where(JournalEntry.administration_id == administration_id)
            .where(JournalEntry.transaction_date >= period.start_date)
            .where(JournalEntry.transaction_date <= period.end_date)
            .order_by(JournalEntry.created_at)
        )
        entries = entries_result.scalars().all()
        
        return {
            "audit_entries": [
                {
                    "id": str(e.id),
                    "booking_number": e.booking_number,
                    "transaction_date": e.transaction_date.isoformat(),
                    "status": e.status.value if e.status else None,
                    "created_at": e.created_at.isoformat() if e.created_at else None,
                    "updated_at": e.updated_at.isoformat() if e.updated_at else None,
                    "created_by_id": str(e.created_by_id) if e.created_by_id else None,
                    "updated_by_id": str(e.updated_by_id) if e.updated_by_id else None,
                }
                for e in entries
            ],
            "total_entries": len(entries),
        }
    
    async def get_evidence_pack(
        self, 
        pack_id: uuid.UUID,
    ) -> Optional[EvidencePack]:
        """Get an evidence pack by ID."""
        result = await self.db.execute(
            select(EvidencePack)
            .where(EvidencePack.id == pack_id)
        )
        pack = result.scalar_one_or_none()
        
        if pack and not await self.verify_client_access(pack.administration_id):
            return None
        
        return pack
    
    async def download_evidence_pack(
        self,
        pack_id: uuid.UUID,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> tuple[bytes, str, str]:
        """
        Download an evidence pack.
        
        Returns:
            Tuple of (file_content, filename, content_type)
        """
        pack = await self.get_evidence_pack(pack_id)
        if not pack:
            raise EvidencePackServiceError("Evidence pack not found or access denied")
        
        # Get file content
        full_path = self.storage_path / pack.storage_path
        if not full_path.exists():
            raise EvidencePackServiceError("Evidence pack file not found on storage")
        
        with open(full_path, "rb") as f:
            content = f.read()
        
        # Verify checksum
        actual_checksum = hashlib.sha256(content).hexdigest()
        if actual_checksum != pack.checksum:
            raise EvidencePackServiceError("Evidence pack checksum mismatch - file may be corrupted")
        
        # Update download tracking
        pack.download_count += 1
        pack.last_downloaded_at = datetime.now(timezone.utc)
        pack.last_downloaded_by_id = self.accountant_id
        
        # Create audit log
        audit = DashboardAuditLog(
            user_id=self.accountant_id,
            action_type="EVIDENCE_PACK_DOWNLOAD",
            administration_id=pack.administration_id,
            entity_type="evidence_pack",
            entity_id=pack.id,
            details={
                "pack_type": pack.pack_type,
                "download_count": pack.download_count,
            },
            ip_address=ip_address,
            user_agent=user_agent,
        )
        self.db.add(audit)
        
        await self.db.commit()
        
        filename = Path(pack.storage_path).name
        return content, filename, "application/json"
    
    async def list_evidence_packs(
        self,
        administration_id: Optional[uuid.UUID] = None,
        period_id: Optional[uuid.UUID] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """
        List evidence packs with optional filters.
        
        Args:
            administration_id: Filter by client
            period_id: Filter by period
            limit: Max results
            offset: Pagination offset
            
        Returns:
            Dict with packs and pagination info
        """
        query = select(EvidencePack)
        
        if administration_id:
            if not await self.verify_client_access(administration_id):
                return {"packs": [], "total_count": 0}
            query = query.where(EvidencePack.administration_id == administration_id)
        
        if period_id:
            query = query.where(EvidencePack.period_id == period_id)
        
        # Get total count
        count_result = await self.db.execute(
            select(func.count()).select_from(query.subquery())
        )
        total_count = count_result.scalar() or 0
        
        # Get packs with pagination
        packs_result = await self.db.execute(
            query.order_by(EvidencePack.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        packs = packs_result.scalars().all()
        
        return {
            "packs": [
                {
                    "id": str(p.id),
                    "administration_id": str(p.administration_id),
                    "period_id": str(p.period_id),
                    "pack_type": p.pack_type,
                    "created_at": p.created_at.isoformat() if p.created_at else None,
                    "file_size_bytes": p.file_size_bytes,
                    "checksum": p.checksum,
                    "download_count": p.download_count,
                    "metadata": p.metadata,
                }
                for p in packs
            ],
            "total_count": total_count,
            "limit": limit,
            "offset": offset,
        }
