"""
Internal serializer / mapping helpers for the accountant master dashboard
routes. Extracted from `app.api.v1.accountant_dashboard` as part of the
routes-file decomposition.

Behavior is unchanged.
"""
from app.models.accountant_dashboard import (
    AssignmentStatus,
    BulkOperation,
)
from app.schemas.accountant_dashboard import (
    BulkOperationResponse,
    BulkOperationResultItem,
    BulkOperationStatus,
    BulkOperationType,
)


def convert_bulk_operation_to_response(
    op: BulkOperation,
    include_results: bool = True,
) -> BulkOperationResponse:
    """Convert bulk operation model to response schema."""
    results = []
    if include_results and op.results:
        for r in op.results:
            admin_name = r.administration.name if r.administration else "Unknown"
            results.append(BulkOperationResultItem(
                client_id=r.administration_id,
                client_name=admin_name,
                status=r.status,
                result_data=r.result_data,
                error_message=r.error_message,
                processed_at=r.processed_at,
            ))

    return BulkOperationResponse(
        id=op.id,
        operation_type=BulkOperationType(op.operation_type.value),
        status=BulkOperationStatus(op.status.value),
        initiated_by_id=op.initiated_by_id,
        initiated_by_name=op.initiated_by.full_name if op.initiated_by else None,
        created_at=op.created_at,
        started_at=op.started_at,
        completed_at=op.completed_at,
        total_clients=op.total_clients or 0,
        processed_clients=op.processed_clients or 0,
        successful_clients=op.successful_clients or 0,
        failed_clients=op.failed_clients or 0,
        error_message=op.error_message,
        results=results,
        message=f"{op.operation_type.value} operation {op.status.value.lower()}",
    )


def mandate_status_to_api(status: AssignmentStatus) -> str:
    """Map internal AssignmentStatus to the public mandate-API string value."""
    mapping = {
        AssignmentStatus.PENDING: "pending",
        AssignmentStatus.ACTIVE: "approved",
        AssignmentStatus.REJECTED: "rejected",
        AssignmentStatus.REVOKED: "revoked",
    }
    return mapping[status]


__all__ = [
    "convert_bulk_operation_to_response",
    "mandate_status_to_api",
]
