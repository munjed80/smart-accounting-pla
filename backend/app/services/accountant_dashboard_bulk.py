import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.accountant_dashboard import (
    BulkOperation,
    BulkOperationResult,
    BulkOperationStatus,
    BulkOperationType,
    ClientReminder,
)
from app.models.alerts import Alert, AlertCode, AlertSeverity
from app.models.issues import ClientIssue, IssueSeverity
from app.models.ledger import AccountingPeriod, PeriodStatus
from app.services.accountant_dashboard import (
    AccountantDashboardService,
    DashboardServiceError,
    RateLimitExceededError,
)
from app.services.period import PeriodControlService
from app.services.validation import ConsistencyEngine
from app.services.vat.report import VatReportService


class BulkOperationsService:
    """
    Service for executing bulk operations across multiple clients.

    Key features:
    - Idempotent operations (duplicate detection via idempotency_key)
    - Rate limiting to prevent abuse
    - Full audit logging
    - Multi-tenant safety (only processes assigned clients)
    """

    RATE_LIMIT_WINDOW_SECONDS = 60
    RATE_LIMIT_MAX_OPERATIONS = 5

    def __init__(self, db: AsyncSession, accountant_id: uuid.UUID):
        self.db = db
        self.accountant_id = accountant_id
        self.dashboard_service = AccountantDashboardService(db, accountant_id)

    async def check_rate_limit(self) -> bool:
        """Check if rate limit allows new operation."""
        window_start = datetime.now(timezone.utc) - timedelta(seconds=self.RATE_LIMIT_WINDOW_SECONDS)

        result = await self.db.execute(
            select(func.count(BulkOperation.id))
            .where(BulkOperation.initiated_by_id == self.accountant_id)
            .where(BulkOperation.created_at >= window_start)
        )
        count = result.scalar() or 0

        return count < self.RATE_LIMIT_MAX_OPERATIONS

    async def check_idempotency(self, idempotency_key: str) -> Optional[BulkOperation]:
        """Check if operation with this key already exists."""
        if not idempotency_key:
            return None

        result = await self.db.execute(
            select(BulkOperation)
            .where(BulkOperation.idempotency_key == idempotency_key)
        )
        return result.scalar_one_or_none()

    async def get_target_clients(
        self,
        client_ids: Optional[List[uuid.UUID]] = None,
        filters: Optional[Dict[str, Any]] = None,
    ) -> List[uuid.UUID]:
        """Get list of client IDs to process, filtered by assignment and criteria."""
        assigned_ids = await self.dashboard_service.get_assigned_client_ids()

        if not assigned_ids:
            return []

        if client_ids:
            target_ids = [cid for cid in client_ids if cid in assigned_ids]
        else:
            target_ids = assigned_ids

        if filters and target_ids:
            cards = await self.dashboard_service._build_client_status_cards(target_ids)

            if filters.get("has_red"):
                cards = [c for c in cards if c["red_issue_count"] > 0]
            if filters.get("needs_review"):
                cards = [c for c in cards if c["documents_needing_review_count"] > 0]
            if filters.get("stale"):
                threshold = filters.get("stale_days", 30)
                cutoff = datetime.now(timezone.utc) - timedelta(days=threshold)
                cards = [
                    c for c in cards
                    if not c["last_activity_at"]
                    or datetime.fromisoformat(c["last_activity_at"]) < cutoff
                ]

            target_ids = [uuid.UUID(c["id"]) for c in cards]

        return target_ids

    async def execute_bulk_recalculate(
        self,
        client_ids: Optional[List[uuid.UUID]] = None,
        filters: Optional[Dict[str, Any]] = None,
        force: bool = False,
        stale_only: bool = False,
        idempotency_key: Optional[str] = None,
    ) -> BulkOperation:
        """Execute BULK_RECALCULATE operation."""
        if not await self.check_rate_limit():
            raise RateLimitExceededError("Rate limit exceeded. Please wait before trying again.")

        if idempotency_key:
            existing = await self.check_idempotency(idempotency_key)
            if existing:
                return existing

        target_ids = await self.get_target_clients(client_ids, filters)

        if not target_ids:
            raise DashboardServiceError("No clients found matching criteria")

        bulk_op = BulkOperation(
            operation_type=BulkOperationType.BULK_RECALCULATE,
            status=BulkOperationStatus.IN_PROGRESS,
            initiated_by_id=self.accountant_id,
            parameters={"force": force, "stale_only": stale_only},
            target_client_ids=target_ids,
            total_clients=len(target_ids),
            started_at=datetime.now(timezone.utc),
            idempotency_key=idempotency_key,
        )
        self.db.add(bulk_op)
        await self.db.flush()

        successful = 0
        failed = 0

        for client_id in target_ids:
            try:
                engine = ConsistencyEngine(self.db, client_id)
                run = await engine.run_full_validation(triggered_by_id=self.accountant_id)

                result = BulkOperationResult(
                    bulk_operation_id=bulk_op.id,
                    administration_id=client_id,
                    status="SUCCESS",
                    result_data={
                        "validation_run_id": str(run.id),
                        "issues_found": run.issues_found or 0,
                    },
                )
                self.db.add(result)
                successful += 1

            except Exception as e:
                result = BulkOperationResult(
                    bulk_operation_id=bulk_op.id,
                    administration_id=client_id,
                    status="FAILED",
                    error_message=str(e),
                )
                self.db.add(result)
                failed += 1

                alert = Alert(
                    administration_id=client_id,
                    alert_code=AlertCode.BACKGROUND_OPERATION_FAILED.value,
                    severity=AlertSeverity.WARNING,
                    title="Bulk recalculation failed",
                    message=f"Validation failed during bulk operation: {str(e)}",
                    entity_type="bulk_operation",
                    entity_id=bulk_op.id,
                )
                self.db.add(alert)

        bulk_op.processed_clients = len(target_ids)
        bulk_op.successful_clients = successful
        bulk_op.failed_clients = failed
        bulk_op.completed_at = datetime.now(timezone.utc)

        if failed == 0:
            bulk_op.status = BulkOperationStatus.COMPLETED
        elif successful == 0:
            bulk_op.status = BulkOperationStatus.FAILED
        else:
            bulk_op.status = BulkOperationStatus.COMPLETED_WITH_ERRORS

        await self.db.commit()
        return bulk_op

    async def execute_bulk_ack_yellow(
        self,
        client_ids: Optional[List[uuid.UUID]] = None,
        filters: Optional[Dict[str, Any]] = None,
        issue_codes: Optional[List[str]] = None,
        notes: Optional[str] = None,
        idempotency_key: Optional[str] = None,
    ) -> BulkOperation:
        """Execute BULK_ACK_YELLOW operation."""
        if not await self.check_rate_limit():
            raise RateLimitExceededError("Rate limit exceeded. Please wait before trying again.")

        if idempotency_key:
            existing = await self.check_idempotency(idempotency_key)
            if existing:
                return existing

        target_ids = await self.get_target_clients(client_ids, filters)

        if not target_ids:
            raise DashboardServiceError("No clients found matching criteria")

        bulk_op = BulkOperation(
            operation_type=BulkOperationType.BULK_ACK_YELLOW,
            status=BulkOperationStatus.IN_PROGRESS,
            initiated_by_id=self.accountant_id,
            parameters={"issue_codes": issue_codes, "notes": notes},
            target_client_ids=target_ids,
            total_clients=len(target_ids),
            started_at=datetime.now(timezone.utc),
            idempotency_key=idempotency_key,
        )
        self.db.add(bulk_op)
        await self.db.flush()

        successful = 0
        failed = 0
        now = datetime.now(timezone.utc)

        for client_id in target_ids:
            try:
                query = (
                    select(ClientIssue)
                    .where(ClientIssue.administration_id == client_id)
                    .where(ClientIssue.severity == IssueSeverity.YELLOW)
                    .where(ClientIssue.is_resolved == False)
                )

                if issue_codes:
                    query = query.where(ClientIssue.issue_code.in_(issue_codes))

                result = await self.db.execute(query)
                issues = result.scalars().all()

                acked_count = 0
                for issue in issues:
                    issue.is_resolved = True
                    issue.resolved_at = now
                    issue.resolved_by_id = self.accountant_id
                    acked_count += 1

                op_result = BulkOperationResult(
                    bulk_operation_id=bulk_op.id,
                    administration_id=client_id,
                    status="SUCCESS",
                    result_data={"acknowledged_count": acked_count},
                )
                self.db.add(op_result)
                successful += 1

            except Exception as e:
                op_result = BulkOperationResult(
                    bulk_operation_id=bulk_op.id,
                    administration_id=client_id,
                    status="FAILED",
                    error_message=str(e),
                )
                self.db.add(op_result)
                failed += 1

        bulk_op.processed_clients = len(target_ids)
        bulk_op.successful_clients = successful
        bulk_op.failed_clients = failed
        bulk_op.completed_at = datetime.now(timezone.utc)

        if failed == 0:
            bulk_op.status = BulkOperationStatus.COMPLETED
        elif successful == 0:
            bulk_op.status = BulkOperationStatus.FAILED
        else:
            bulk_op.status = BulkOperationStatus.COMPLETED_WITH_ERRORS

        await self.db.commit()
        return bulk_op

    async def execute_bulk_generate_vat_draft(
        self,
        period_year: int,
        period_quarter: int,
        client_ids: Optional[List[uuid.UUID]] = None,
        filters: Optional[Dict[str, Any]] = None,
        idempotency_key: Optional[str] = None,
    ) -> BulkOperation:
        """Execute BULK_GENERATE_VAT_DRAFT operation."""
        if not await self.check_rate_limit():
            raise RateLimitExceededError("Rate limit exceeded. Please wait before trying again.")

        if idempotency_key:
            existing = await self.check_idempotency(idempotency_key)
            if existing:
                return existing

        target_ids = await self.get_target_clients(client_ids, filters)

        if not target_ids:
            raise DashboardServiceError("No clients found matching criteria")

        bulk_op = BulkOperation(
            operation_type=BulkOperationType.BULK_GENERATE_VAT_DRAFT,
            status=BulkOperationStatus.IN_PROGRESS,
            initiated_by_id=self.accountant_id,
            parameters={"period_year": period_year, "period_quarter": period_quarter},
            target_client_ids=target_ids,
            total_clients=len(target_ids),
            started_at=datetime.now(timezone.utc),
            idempotency_key=idempotency_key,
        )
        self.db.add(bulk_op)
        await self.db.flush()

        successful = 0
        failed = 0

        for client_id in target_ids:
            try:
                quarter_start_month = (period_quarter - 1) * 3 + 1
                quarter_start = date(period_year, quarter_start_month, 1)
                if period_quarter == 4:
                    quarter_end = date(period_year, 12, 31)
                else:
                    quarter_end = date(period_year, quarter_start_month + 3, 1) - timedelta(days=1)

                period_result = await self.db.execute(
                    select(AccountingPeriod)
                    .where(AccountingPeriod.administration_id == client_id)
                    .where(AccountingPeriod.start_date <= quarter_start)
                    .where(AccountingPeriod.end_date >= quarter_end)
                    .limit(1)
                )
                period = period_result.scalar_one_or_none()

                if not period:
                    op_result = BulkOperationResult(
                        bulk_operation_id=bulk_op.id,
                        administration_id=client_id,
                        status="SKIPPED",
                        result_data={"reason": "Period not found"},
                    )
                    self.db.add(op_result)
                    continue

                vat_service = VatReportService(self.db, client_id)
                report = await vat_service.generate_vat_report(period.id, allow_draft=True)

                op_result = BulkOperationResult(
                    bulk_operation_id=bulk_op.id,
                    administration_id=client_id,
                    status="SUCCESS",
                    result_data={
                        "period_id": str(period.id),
                        "net_vat": str(report.net_vat),
                        "has_anomalies": report.has_red_anomalies or report.has_yellow_anomalies,
                    },
                )
                self.db.add(op_result)
                successful += 1

            except Exception as e:
                op_result = BulkOperationResult(
                    bulk_operation_id=bulk_op.id,
                    administration_id=client_id,
                    status="FAILED",
                    error_message=str(e),
                )
                self.db.add(op_result)
                failed += 1

        bulk_op.processed_clients = len(target_ids)
        bulk_op.successful_clients = successful
        bulk_op.failed_clients = failed
        bulk_op.completed_at = datetime.now(timezone.utc)

        if failed == 0:
            bulk_op.status = BulkOperationStatus.COMPLETED
        elif successful == 0:
            bulk_op.status = BulkOperationStatus.FAILED
        else:
            bulk_op.status = BulkOperationStatus.COMPLETED_WITH_ERRORS

        await self.db.commit()
        return bulk_op

    async def execute_bulk_send_reminders(
        self,
        reminder_type: str,
        title: str,
        message: str,
        due_date: Optional[date] = None,
        client_ids: Optional[List[uuid.UUID]] = None,
        filters: Optional[Dict[str, Any]] = None,
        idempotency_key: Optional[str] = None,
    ) -> BulkOperation:
        """Execute BULK_SEND_CLIENT_REMINDERS operation."""
        if not await self.check_rate_limit():
            raise RateLimitExceededError("Rate limit exceeded. Please wait before trying again.")

        if idempotency_key:
            existing = await self.check_idempotency(idempotency_key)
            if existing:
                return existing

        target_ids = await self.get_target_clients(client_ids, filters)

        if not target_ids:
            raise DashboardServiceError("No clients found matching criteria")

        bulk_op = BulkOperation(
            operation_type=BulkOperationType.BULK_SEND_CLIENT_REMINDERS,
            status=BulkOperationStatus.IN_PROGRESS,
            initiated_by_id=self.accountant_id,
            parameters={
                "reminder_type": reminder_type,
                "title": title,
                "message": message,
                "due_date": due_date.isoformat() if due_date else None,
            },
            target_client_ids=target_ids,
            total_clients=len(target_ids),
            started_at=datetime.now(timezone.utc),
            idempotency_key=idempotency_key,
        )
        self.db.add(bulk_op)
        await self.db.flush()

        successful = 0
        failed = 0

        for client_id in target_ids:
            try:
                reminder = ClientReminder(
                    administration_id=client_id,
                    reminder_type=reminder_type,
                    title=title,
                    message=message,
                    created_by_id=self.accountant_id,
                    due_date=due_date,
                    bulk_operation_id=bulk_op.id,
                )
                self.db.add(reminder)

                op_result = BulkOperationResult(
                    bulk_operation_id=bulk_op.id,
                    administration_id=client_id,
                    status="SUCCESS",
                    result_data={"reminder_id": str(reminder.id)},
                )
                self.db.add(op_result)
                successful += 1

            except Exception as e:
                op_result = BulkOperationResult(
                    bulk_operation_id=bulk_op.id,
                    administration_id=client_id,
                    status="FAILED",
                    error_message=str(e),
                )
                self.db.add(op_result)
                failed += 1

        bulk_op.processed_clients = len(target_ids)
        bulk_op.successful_clients = successful
        bulk_op.failed_clients = failed
        bulk_op.completed_at = datetime.now(timezone.utc)

        if failed == 0:
            bulk_op.status = BulkOperationStatus.COMPLETED
        elif successful == 0:
            bulk_op.status = BulkOperationStatus.FAILED
        else:
            bulk_op.status = BulkOperationStatus.COMPLETED_WITH_ERRORS

        await self.db.commit()
        return bulk_op

    async def execute_bulk_lock_period(
        self,
        period_year: int,
        period_quarter: int,
        confirm_irreversible: bool,
        client_ids: Optional[List[uuid.UUID]] = None,
        filters: Optional[Dict[str, Any]] = None,
        idempotency_key: Optional[str] = None,
    ) -> BulkOperation:
        """
        Execute BULK_LOCK_PERIOD operation.

        Prerequisites:
        - Period must be FINALIZED
        - Zero RED issues
        - confirm_irreversible must be True
        """
        if not await self.check_rate_limit():
            raise RateLimitExceededError("Rate limit exceeded. Please wait before trying again.")

        if not confirm_irreversible:
            raise DashboardServiceError("Must confirm_irreversible=true to lock periods")

        if idempotency_key:
            existing = await self.check_idempotency(idempotency_key)
            if existing:
                return existing

        target_ids = await self.get_target_clients(client_ids, filters)

        if not target_ids:
            raise DashboardServiceError("No clients found matching criteria")

        bulk_op = BulkOperation(
            operation_type=BulkOperationType.BULK_LOCK_PERIOD,
            status=BulkOperationStatus.IN_PROGRESS,
            initiated_by_id=self.accountant_id,
            parameters={
                "period_year": period_year,
                "period_quarter": period_quarter,
                "confirm_irreversible": confirm_irreversible,
            },
            target_client_ids=target_ids,
            total_clients=len(target_ids),
            started_at=datetime.now(timezone.utc),
            idempotency_key=idempotency_key,
        )
        self.db.add(bulk_op)
        await self.db.flush()

        successful = 0
        failed = 0

        for client_id in target_ids:
            try:
                quarter_start_month = (period_quarter - 1) * 3 + 1
                quarter_start = date(period_year, quarter_start_month, 1)
                if period_quarter == 4:
                    quarter_end = date(period_year, 12, 31)
                else:
                    quarter_end = date(period_year, quarter_start_month + 3, 1) - timedelta(days=1)

                period_result = await self.db.execute(
                    select(AccountingPeriod)
                    .where(AccountingPeriod.administration_id == client_id)
                    .where(AccountingPeriod.start_date <= quarter_start)
                    .where(AccountingPeriod.end_date >= quarter_end)
                    .limit(1)
                )
                period = period_result.scalar_one_or_none()

                if not period:
                    op_result = BulkOperationResult(
                        bulk_operation_id=bulk_op.id,
                        administration_id=client_id,
                        status="SKIPPED",
                        result_data={"reason": "Period not found"},
                    )
                    self.db.add(op_result)
                    continue

                if period.status != PeriodStatus.FINALIZED:
                    op_result = BulkOperationResult(
                        bulk_operation_id=bulk_op.id,
                        administration_id=client_id,
                        status="SKIPPED",
                        result_data={"reason": f"Period status is {period.status.value}, not FINALIZED"},
                    )
                    self.db.add(op_result)
                    continue

                red_count_result = await self.db.execute(
                    select(func.count(ClientIssue.id))
                    .where(ClientIssue.administration_id == client_id)
                    .where(ClientIssue.severity == IssueSeverity.RED)
                    .where(ClientIssue.is_resolved == False)
                )
                red_count = red_count_result.scalar() or 0

                if red_count > 0:
                    op_result = BulkOperationResult(
                        bulk_operation_id=bulk_op.id,
                        administration_id=client_id,
                        status="SKIPPED",
                        result_data={"reason": f"Client has {red_count} unresolved RED issues"},
                    )
                    self.db.add(op_result)
                    continue

                period_service = PeriodControlService(self.db, client_id)
                locked_period = await period_service.lock_period(
                    period_id=period.id,
                    user_id=self.accountant_id,
                    notes="Locked via bulk operation",
                )

                op_result = BulkOperationResult(
                    bulk_operation_id=bulk_op.id,
                    administration_id=client_id,
                    status="SUCCESS",
                    result_data={"period_id": str(period.id), "locked_at": locked_period.locked_at.isoformat()},
                )
                self.db.add(op_result)
                successful += 1

            except Exception as e:
                op_result = BulkOperationResult(
                    bulk_operation_id=bulk_op.id,
                    administration_id=client_id,
                    status="FAILED",
                    error_message=str(e),
                )
                self.db.add(op_result)
                failed += 1

        bulk_op.processed_clients = len(target_ids)
        bulk_op.successful_clients = successful
        bulk_op.failed_clients = failed
        bulk_op.completed_at = datetime.now(timezone.utc)

        if failed == 0:
            bulk_op.status = BulkOperationStatus.COMPLETED
        elif successful == 0:
            bulk_op.status = BulkOperationStatus.FAILED
        else:
            bulk_op.status = BulkOperationStatus.COMPLETED_WITH_ERRORS

        await self.db.commit()
        return bulk_op

    async def get_bulk_operation(self, operation_id: uuid.UUID) -> Optional[BulkOperation]:
        """Get a bulk operation with its results."""
        result = await self.db.execute(
            select(BulkOperation)
            .options(selectinload(BulkOperation.results))
            .where(BulkOperation.id == operation_id)
            .where(BulkOperation.initiated_by_id == self.accountant_id)
        )
        return result.scalar_one_or_none()

    async def list_bulk_operations(
        self,
        limit: int = 50,
        operation_type: Optional[BulkOperationType] = None,
    ) -> List[BulkOperation]:
        """List bulk operations for this accountant."""
        query = (
            select(BulkOperation)
            .where(BulkOperation.initiated_by_id == self.accountant_id)
            .order_by(BulkOperation.created_at.desc())
        )

        if operation_type:
            query = query.where(BulkOperation.operation_type == operation_type)

        query = query.limit(limit)

        result = await self.db.execute(query)
        return list(result.scalars().all())
