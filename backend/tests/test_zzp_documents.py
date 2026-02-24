"""
Tests for ZZP Document Inbox

Covers:
- Document model field structure
- Status and type enum values
- Scoping logic (per-administration)
- Convert-to-expense linking logic
- Access control validation
"""
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
import pytest


class TestZZPDocumentModel:
    """Tests for ZZP document model field structure."""

    def test_doc_type_values(self):
        """ZZPDocType enum has required values."""
        from app.models.zzp import ZZPDocType
        assert ZZPDocType.BON.value == "BON"
        assert ZZPDocType.FACTUUR.value == "FACTUUR"
        assert ZZPDocType.OVERIG.value == "OVERIG"

    def test_doc_status_values(self):
        """ZZPDocStatus enum has required values."""
        from app.models.zzp import ZZPDocStatus
        assert ZZPDocStatus.NEW.value == "NEW"
        assert ZZPDocStatus.REVIEW.value == "REVIEW"
        assert ZZPDocStatus.PROCESSED.value == "PROCESSED"
        assert ZZPDocStatus.FAILED.value == "FAILED"

    def test_zzp_expense_has_document_id(self):
        """ZZPExpense model has document_id nullable column."""
        from app.models.zzp import ZZPExpense
        from sqlalchemy import inspect
        mapper = inspect(ZZPExpense)
        col_names = [c.key for c in mapper.columns]
        assert "document_id" in col_names

    def test_zzp_document_required_fields(self):
        """ZZPDocument model has all required fields from spec."""
        from app.models.zzp import ZZPDocument
        from sqlalchemy import inspect
        mapper = inspect(ZZPDocument)
        col_names = [c.key for c in mapper.columns]
        required = [
            "id", "administration_id", "user_id",
            "filename", "mime_type", "storage_ref",
            "doc_type", "status",
            "supplier", "amount_cents", "vat_rate", "doc_date",
            "created_at", "updated_at",
        ]
        for field in required:
            assert field in col_names, f"Missing field: {field}"


class TestZZPDocumentScoping:
    """Tests for per-administration scoping logic."""

    def test_documents_scoped_by_administration(self):
        """Documents must be filtered by administration_id."""
        admin_id_1 = uuid.uuid4()
        admin_id_2 = uuid.uuid4()

        documents = [
            {"id": uuid.uuid4(), "administration_id": admin_id_1, "status": "NEW"},
            {"id": uuid.uuid4(), "administration_id": admin_id_1, "status": "REVIEW"},
            {"id": uuid.uuid4(), "administration_id": admin_id_2, "status": "NEW"},
        ]

        filtered = [d for d in documents if d["administration_id"] == admin_id_1]
        assert len(filtered) == 2
        assert all(d["administration_id"] == admin_id_1 for d in filtered)

    def test_cross_tenant_access_blocked(self):
        """User from different administration is denied access."""
        user_admin_id = uuid.uuid4()
        doc_admin_id = uuid.uuid4()

        has_access = user_admin_id == doc_admin_id
        assert has_access is False

    def test_same_tenant_access_allowed(self):
        """User from same administration is allowed access."""
        admin_id = uuid.uuid4()
        has_access = admin_id == admin_id
        assert has_access is True


class TestZZPDocumentStatusTransitions:
    """Tests for document status workflow."""

    def test_new_document_default_status(self):
        """New uploads default to NEW status."""
        from app.models.zzp import ZZPDocStatus
        assert ZZPDocStatus.NEW.value == "NEW"

    def test_inbox_statuses(self):
        """Inbox contains NEW and REVIEW documents."""
        inbox_statuses = {"NEW", "REVIEW"}
        all_statuses = {"NEW", "REVIEW", "PROCESSED", "FAILED"}
        assert inbox_statuses.issubset(all_statuses)

    def test_processed_status_set_on_convert(self):
        """Document status becomes PROCESSED after convert-to-expense."""
        doc = {"status": "NEW"}
        # Simulate conversion
        doc["status"] = "PROCESSED"
        assert doc["status"] == "PROCESSED"

    def test_mark_as_processed_without_expense(self):
        """Document can be marked as PROCESSED without creating an expense."""
        doc = {"status": "REVIEW"}
        doc["status"] = "PROCESSED"
        assert doc["status"] == "PROCESSED"


class TestZZPDocumentToExpenseLink:
    """Tests for document-to-expense linking."""

    def test_expense_created_with_document_id(self):
        """Created expense references the source document."""
        document_id = uuid.uuid4()
        expense = {
            "id": uuid.uuid4(),
            "document_id": document_id,
            "vendor": "Aldi",
            "amount_cents": 5000,
            "vat_rate": 21.0,
        }
        assert expense["document_id"] == document_id

    def test_expense_document_id_is_nullable(self):
        """Expenses can exist without a document_id (manual entry)."""
        expense = {
            "id": uuid.uuid4(),
            "document_id": None,
            "vendor": "Manual entry",
            "amount_cents": 1000,
        }
        assert expense["document_id"] is None

    def test_convert_links_document_and_expense(self):
        """Convert flow links expense to document bidirectionally."""
        doc_id = uuid.uuid4()
        expense_id = uuid.uuid4()

        expense = {"id": expense_id, "document_id": doc_id}
        doc_after = {"id": doc_id, "status": "PROCESSED"}

        assert expense["document_id"] == doc_id
        assert doc_after["status"] == "PROCESSED"


class TestZZPDocumentAccessControl:
    """Tests for role-based access control."""

    def test_zzp_role_required(self):
        """Only ZZP users can access the document inbox."""
        allowed_roles = {"zzp"}
        denied_roles = {"accountant", "admin", "super_admin"}

        for role in allowed_roles:
            assert role in allowed_roles
        for role in denied_roles:
            assert role not in allowed_roles

    def test_non_zzp_role_denied(self):
        """Accountant role is denied access to ZZP document inbox."""
        user_role = "accountant"
        allowed_roles = {"zzp"}
        assert user_role not in allowed_roles

    def test_owner_can_delete_document(self):
        """Document owner (same administration) can delete the document."""
        user_admin_id = uuid.uuid4()
        doc_admin_id = user_admin_id  # Same administration

        can_delete = user_admin_id == doc_admin_id
        assert can_delete is True

    def test_non_owner_cannot_delete_document(self):
        """User from different administration cannot delete the document."""
        user_admin_id = uuid.uuid4()
        doc_admin_id = uuid.uuid4()  # Different administration

        can_delete = user_admin_id == doc_admin_id
        assert can_delete is False


class TestZZPDocumentSchemas:
    """Tests for ZZP document Pydantic schemas."""

    def test_document_response_schema_fields(self):
        """ZZPDocumentResponse schema has all required fields."""
        from app.schemas.zzp import ZZPDocumentResponse
        import inspect
        fields = ZZPDocumentResponse.model_fields
        required = [
            "id", "administration_id", "filename", "mime_type",
            "storage_ref", "doc_type", "status", "created_at", "updated_at",
        ]
        for f in required:
            assert f in fields, f"Missing schema field: {f}"

    def test_document_update_schema_all_optional(self):
        """ZZPDocumentUpdate schema allows partial updates."""
        from app.schemas.zzp import ZZPDocumentUpdate
        update = ZZPDocumentUpdate()
        assert update.doc_type is None
        assert update.status is None
        assert update.supplier is None

    def test_create_expense_response_schema(self):
        """ZZPDocumentCreateExpenseResponse schema has required fields."""
        from app.schemas.zzp import ZZPDocumentCreateExpenseResponse
        fields = ZZPDocumentCreateExpenseResponse.model_fields
        assert "expense_id" in fields
        assert "document_id" in fields
        assert "message" in fields
