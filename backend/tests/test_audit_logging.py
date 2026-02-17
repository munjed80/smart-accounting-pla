"""
Tests for Audit Logging System

This module tests the automatic audit logging functionality:
- Model operations (create/update/delete)
- Sanitization of sensitive fields
- Failure resilience
- Context propagation
"""
import pytest
import uuid
from datetime import datetime, timezone, date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.zzp import ZZPInvoice, InvoiceStatus, ZZPExpense
from app.models.ledger import JournalEntry, JournalEntryStatus
from app.models.user import User
from app.models.administration import Administration, AdministrationMember, MemberRole
from app.audit.context import AuditContext, set_audit_context, clear_audit_context
from app.audit.audit_logger import sanitize_payload


@pytest.mark.asyncio
class TestAuditLogging:
    """Test suite for audit logging functionality."""
    
    async def test_invoice_create_logged(self, db_session: AsyncSession, test_user: User):
        """Test that creating an invoice creates an audit log entry."""
        # Create administration
        admin = Administration(
            name="Test Admin",
            kvk_number="12345678",
        )
        db_session.add(admin)
        await db_session.flush()
        
        # Create customer (required for invoice)
        from app.models.zzp import ZZPCustomer
        customer = ZZPCustomer(
            administration_id=admin.id,
            name="Test Customer",
            kvk_number="87654321",
        )
        db_session.add(customer)
        await db_session.flush()
        
        # Set audit context
        context = AuditContext(
            request_id=uuid.uuid4(),
            ip_address="127.0.0.1",
            user_id=test_user.id,
            user_role=test_user.role,
            client_id=admin.id,
        )
        set_audit_context(context)
        
        try:
            # Create invoice
            invoice = ZZPInvoice(
                administration_id=admin.id,
                customer_id=customer.id,
                invoice_number="INV-001",
                status=InvoiceStatus.DRAFT,
                issue_date=date.today(),
                due_date=date.today(),
                seller_company_name="Test Company",
                seller_kvk_number="12345678",
                customer_name="Test Customer",
                subtotal_cents=10000,
                vat_total_cents=2100,
                total_cents=12100,
            )
            db_session.add(invoice)
            await db_session.commit()
            
            # Check audit log was created
            result = await db_session.execute(
                select(AuditLog)
                .where(AuditLog.entity_type == "invoice")
                .where(AuditLog.entity_id == invoice.id)
                .where(AuditLog.action == "create")
            )
            audit_entry = result.scalar_one_or_none()
            
            assert audit_entry is not None
            assert audit_entry.client_id == admin.id
            assert audit_entry.user_id == test_user.id
            assert audit_entry.user_role == test_user.role
            assert audit_entry.ip_address == "127.0.0.1"
            assert audit_entry.new_value is not None
            assert audit_entry.old_value is None
            
            # Verify new_value contains invoice data
            assert audit_entry.new_value.get("invoice_number") == "INV-001"
            assert audit_entry.new_value.get("status") == InvoiceStatus.DRAFT.value
            
        finally:
            clear_audit_context()
    
    async def test_invoice_update_logged(self, db_session: AsyncSession, test_user: User):
        """Test that updating an invoice creates an audit log entry with old/new values."""
        # Create administration
        admin = Administration(
            name="Test Admin",
            kvk_number="12345678",
        )
        db_session.add(admin)
        await db_session.flush()
        
        # Create customer (required for invoice)
        from app.models.zzp import ZZPCustomer
        customer = ZZPCustomer(
            administration_id=admin.id,
            name="Test Customer",
            kvk_number="87654321",
        )
        db_session.add(customer)
        await db_session.flush()
        
        # Create invoice
        invoice = ZZPInvoice(
            administration_id=admin.id,
            customer_id=customer.id,
            invoice_number="INV-002",
            status=InvoiceStatus.DRAFT,
            issue_date=date.today(),
            due_date=date.today(),
            seller_company_name="Test Company",
            seller_kvk_number="12345678",
            customer_name="Test Customer",
            subtotal_cents=10000,
            vat_total_cents=2100,
            total_cents=12100,
        )
        db_session.add(invoice)
        await db_session.commit()
        
        # Clear any audit logs from creation
        from sqlalchemy import text
        await db_session.execute(
            text("DELETE FROM audit_log WHERE entity_type = 'invoice' AND entity_id = :id"),
            {"id": str(invoice.id)}
        )
        await db_session.commit()
        
        # Set audit context
        context = AuditContext(
            request_id=uuid.uuid4(),
            ip_address="192.168.1.1",
            user_id=test_user.id,
            user_role=test_user.role,
            client_id=admin.id,
        )
        set_audit_context(context)
        
        try:
            # Update invoice status
            invoice.status = InvoiceStatus.SENT
            await db_session.commit()
            
            # Check audit log was created for update
            result = await db_session.execute(
                select(AuditLog)
                .where(AuditLog.entity_type == "invoice")
                .where(AuditLog.entity_id == invoice.id)
                .where(AuditLog.action == "update")
                .order_by(AuditLog.created_at.desc())
            )
            audit_entries = result.scalars().all()
            
            assert len(audit_entries) > 0, "No audit entry found for invoice update"
            audit_entry = audit_entries[0]  # Get the most recent one
            
            assert audit_entry is not None
            assert audit_entry.client_id == admin.id
            assert audit_entry.user_id == test_user.id
            assert audit_entry.old_value is not None
            assert audit_entry.new_value is not None
            
            # Verify old/new values contain the changed field
            assert audit_entry.old_value.get("status") == InvoiceStatus.DRAFT.value
            assert audit_entry.new_value.get("status") == InvoiceStatus.SENT.value
            
        finally:
            clear_audit_context()
    
    async def test_expense_delete_logged(self, db_session: AsyncSession, test_user: User):
        """Test that deleting an expense creates an audit log entry."""
        # Create administration
        admin = Administration(
            name="Test Admin",
            kvk_number="12345678",
        )
        db_session.add(admin)
        await db_session.flush()
        
        # Create expense
        expense = ZZPExpense(
            administration_id=admin.id,
            vendor="Test Vendor",
            expense_date=date.today(),
            amount_cents=5000,
            vat_rate=Decimal("21.00"),
            vat_amount_cents=1050,
            category="algemeen",
        )
        db_session.add(expense)
        await db_session.commit()
        
        expense_id = expense.id
        
        # Clear any audit logs from creation
        from sqlalchemy import text
        await db_session.execute(
            text("DELETE FROM audit_log WHERE entity_type = 'expense' AND entity_id = :id"),
            {"id": str(expense_id)}
        )
        await db_session.commit()
        
        # Set audit context
        context = AuditContext(
            request_id=uuid.uuid4(),
            ip_address="10.0.0.1",
            user_id=test_user.id,
            user_role=test_user.role,
            client_id=admin.id,
        )
        set_audit_context(context)
        
        try:
            # Delete expense
            await db_session.delete(expense)
            await db_session.commit()
            
            # Check audit log was created for delete
            result = await db_session.execute(
                select(AuditLog)
                .where(AuditLog.entity_type == "expense")
                .where(AuditLog.entity_id == expense_id)
                .where(AuditLog.action == "delete")
                .order_by(AuditLog.created_at.desc())
            )
            audit_entries = result.scalars().all()
            
            assert len(audit_entries) > 0, "No audit entry found for expense delete"
            # Take the first (most recent) entry if there are duplicates
            audit_entry = audit_entries[0]
            
            assert audit_entry is not None
            assert audit_entry.client_id == admin.id
            assert audit_entry.user_id == test_user.id
            assert audit_entry.old_value is not None
            assert audit_entry.new_value is None
            
            # Verify old_value contains expense data
            assert audit_entry.old_value.get("vendor") == "Test Vendor"
            assert audit_entry.old_value.get("amount_cents") == 5000
            
        finally:
            clear_audit_context()
    
    async def test_sanitization_sensitive_fields(self):
        """Test that sensitive fields are properly sanitized."""
        payload = {
            "id": "123",
            "name": "John Doe",
            "password": "secret123",
            "hashed_password": "hashed_secret",
            "token": "bearer_token_xyz",
            "api_key": "sk_live_12345",
            "iban": "NL12ABCD1234567890",
            "normal_field": "normal_value",
        }
        
        sanitized = sanitize_payload(payload)
        
        # Sensitive fields should be redacted
        assert sanitized["password"] == "**REDACTED**"
        assert sanitized["hashed_password"] == "**REDACTED**"
        assert sanitized["token"] == "**REDACTED**"
        assert sanitized["api_key"] == "**REDACTED**"
        
        # IBAN should be masked
        assert "**MASKED**" in sanitized["iban"]
        assert sanitized["iban"] != "NL12ABCD1234567890"
        
        # Normal fields should remain unchanged
        assert sanitized["id"] == "123"
        assert sanitized["name"] == "John Doe"
        assert sanitized["normal_field"] == "normal_value"
    
    async def test_sanitization_large_text(self):
        """Test that large text fields are truncated."""
        large_text = "x" * 2000
        payload = {
            "description": large_text,
        }
        
        sanitized = sanitize_payload(payload)
        
        # Large text should be truncated
        assert len(sanitized["description"]) < len(large_text)
        assert "[TRUNCATED" in sanitized["description"]
    
    async def test_audit_without_context(self, db_session: AsyncSession):
        """Test that audit logging works without request context (system operations)."""
        # Don't set audit context - simulating system operation
        
        # Create administration
        admin = Administration(
            name="Test Admin System",
            kvk_number="87654321",
        )
        db_session.add(admin)
        await db_session.flush()
        
        # Create expense (should use system context)
        expense = ZZPExpense(
            administration_id=admin.id,
            vendor="System Vendor",
            expense_date=date.today(),
            amount_cents=1000,
            vat_rate=Decimal("21.00"),
            vat_amount_cents=210,
            category="system",
        )
        db_session.add(expense)
        await db_session.commit()
        
        # Check audit log was created with system role
        result = await db_session.execute(
            select(AuditLog)
            .where(AuditLog.entity_type == "expense")
            .where(AuditLog.entity_id == expense.id)
            .order_by(AuditLog.created_at.desc())
        )
        audit_entries = result.scalars().all()
        
        assert len(audit_entries) > 0, "No audit entry found for expense"
        # Take the first (most recent) entry
        audit_entry = audit_entries[0]
        
        assert audit_entry is not None
        assert audit_entry.user_role == "system"
        assert audit_entry.user_id is None
        assert audit_entry.client_id == admin.id
    
    async def test_no_audit_log_recursion(self, db_session: AsyncSession):
        """Test that audit log operations themselves are not logged (prevent recursion)."""
        # Set audit context
        context = AuditContext(
            request_id=uuid.uuid4(),
            ip_address="127.0.0.1",
            user_id=uuid.uuid4(),
            user_role="accountant",
            client_id=uuid.uuid4(),
        )
        set_audit_context(context)
        
        try:
            # Create an audit log entry directly
            audit_entry = AuditLog(
                client_id=context.client_id,
                entity_type="test_entity",
                entity_id=uuid.uuid4(),
                action="test_action",
                user_id=context.user_id,
                user_role=context.user_role,
                old_value=None,
                new_value={"test": "data"},
                ip_address=context.ip_address,
            )
            db_session.add(audit_entry)
            await db_session.commit()
            
            # Check that NO audit log was created for this audit_log operation
            result = await db_session.execute(
                select(AuditLog)
                .where(AuditLog.entity_type == "audit_log")
            )
            recursive_audit = result.scalar_one_or_none()
            
            assert recursive_audit is None, "Audit log should not log itself"
            
        finally:
            clear_audit_context()
