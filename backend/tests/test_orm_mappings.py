"""
Unit Tests for ORM Mapping Validation

Tests ensure SQLAlchemy relationships are correctly configured
and the mapper can initialize without errors.

These tests are critical regression tests for the mapping fix.
"""
import pytest


class TestORMMappings:
    """Tests for SQLAlchemy ORM mapping configuration."""

    def test_configure_mappers_succeeds(self):
        """
        All ORM mappers should configure without errors.
        
        This test catches relationship configuration issues like:
        - Ambiguous foreign keys
        - Missing back_populates references
        - Invalid foreign_keys parameter syntax
        """
        from sqlalchemy.orm import configure_mappers
        from app.models import (
            User, Administration, AdministrationMember,
            Document, ExtractedField, DocumentSuggestedAction, DocumentAuditLog,
            Transaction, TransactionLine,
            ChartOfAccount, VatCode, VatCategory,
            AccountingPeriod, JournalEntry, JournalLine,
            Party, OpenItem, OpenItemAllocation,
            FixedAsset, DepreciationSchedule,
            ClientIssue, ValidationRun,
            SuggestedAction, AccountantDecision, DecisionPattern,
            Alert,
            AccountantClientAssignment, BulkOperation, ClientReminder,
            AuthToken,
        )
        
        # This should not raise any exceptions
        configure_mappers()

    def test_document_journal_entry_relationship(self):
        """
        Document.journal_entry relationship should be correctly configured.
        
        There are multiple FK paths between Document and JournalEntry:
        1. JournalEntry.document_id -> Document.id (journal_entry relationship)
        2. Document.posted_journal_entry_id -> JournalEntry.id (posted_journal relationship)
        
        The foreign_keys parameter must correctly disambiguate these.
        """
        from sqlalchemy.orm import configure_mappers
        from app.models import Document, JournalEntry
        
        configure_mappers()
        
        # Verify the relationship properties exist
        assert hasattr(Document, 'journal_entry')
        assert hasattr(Document, 'posted_journal')
        assert hasattr(JournalEntry, 'document')

    def test_document_has_all_expected_relationships(self):
        """Document model should have all required relationships defined."""
        from sqlalchemy.orm import configure_mappers
        from app.models import Document
        
        configure_mappers()
        
        expected_relationships = [
            'administration',
            'extracted_fields',
            'transaction',
            'journal_entry',
            'issues',
            'matched_party',
            'matched_open_item',
            'posted_by',
            'rejected_by',
            'posted_journal',
            'duplicate_of',
            'suggested_actions',
        ]
        
        for rel_name in expected_relationships:
            assert hasattr(Document, rel_name), f"Document missing relationship: {rel_name}"

    def test_journal_entry_has_all_expected_relationships(self):
        """JournalEntry model should have all required relationships defined."""
        from sqlalchemy.orm import configure_mappers
        from app.models import JournalEntry
        
        configure_mappers()
        
        expected_relationships = [
            'administration',
            'period',
            'document',
            'lines',
            'posted_by',
            'reversed_by',
            'reverses',
            'open_items',
            'issues',
        ]
        
        for rel_name in expected_relationships:
            assert hasattr(JournalEntry, rel_name), f"JournalEntry missing relationship: {rel_name}"

    def test_bidirectional_relationships_consistent(self):
        """Bidirectional relationships should have matching back_populates."""
        from sqlalchemy.orm import configure_mappers
        from app.models import Document, JournalEntry
        from sqlalchemy import inspect
        
        configure_mappers()
        
        # Get the mapper for Document
        doc_mapper = inspect(Document)
        je_mapper = inspect(JournalEntry)
        
        # Verify Document.journal_entry relationship
        journal_entry_rel = doc_mapper.relationships.get('journal_entry')
        assert journal_entry_rel is not None
        assert journal_entry_rel.back_populates == 'document'
        
        # Verify JournalEntry.document relationship
        document_rel = je_mapper.relationships.get('document')
        assert document_rel is not None
        assert document_rel.back_populates == 'journal_entry'

    def test_reconciliation_action_relationships_consistent(self):
        """ReconciliationAction and Administration should have proper bidirectional relationships."""
        from sqlalchemy.orm import configure_mappers
        from app.models.bank import ReconciliationAction
        from app.models.administration import Administration
        from sqlalchemy import inspect
        
        configure_mappers()
        
        # Get the mapper for Administration and ReconciliationAction
        admin_mapper = inspect(Administration)
        recon_mapper = inspect(ReconciliationAction)
        
        # Verify Administration.reconciliation_actions relationship
        reconciliation_actions_rel = admin_mapper.relationships.get('reconciliation_actions')
        assert reconciliation_actions_rel is not None
        assert reconciliation_actions_rel.back_populates == 'administration'
        
        # Verify ReconciliationAction.administration relationship
        administration_rel = recon_mapper.relationships.get('administration')
        assert administration_rel is not None
        assert administration_rel.back_populates == 'reconciliation_actions'


class TestStartupCheck:
    """Tests for the startup ORM verification function."""

    def test_verify_orm_mappings_inline(self):
        """
        The startup verification logic should complete without raising exceptions.
        
        This replicates the verify_orm_mappings() function logic from app.main
        without importing FastAPI dependencies.
        """
        from sqlalchemy.orm import configure_mappers
        from app.models import (
            User, Administration, AdministrationMember,
            Document, ExtractedField, DocumentSuggestedAction, DocumentAuditLog,
            Transaction, TransactionLine,
            ChartOfAccount, VatCode, VatCategory,
            AccountingPeriod, JournalEntry, JournalLine,
            Party, OpenItem, OpenItemAllocation,
            FixedAsset, DepreciationSchedule,
            ClientIssue, ValidationRun,
            SuggestedAction, AccountantDecision, DecisionPattern,
            Alert,
            AccountantClientAssignment, BulkOperation, ClientReminder,
            AuthToken,
        )
        
        # Should not raise InvalidRequestError
        configure_mappers()

    def test_reconciliation_action_no_overlapping_warning(self):
        """
        Test that ReconciliationAction mapper configuration does not raise warnings.
        
        This test ensures that the bidirectional relationship between Administration
        and ReconciliationAction is properly configured and doesn't produce SAWarning
        about overlapping relationships.
        """
        import warnings
        from sqlalchemy.orm import configure_mappers
        from app.models.bank import ReconciliationAction, BankAccount, BankTransaction
        from app.models.administration import Administration
        
        # Capture any warnings during mapper configuration
        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            
            # Configure the mappers
            configure_mappers()
            
            # Check that no SAWarning was raised
            sa_warnings = [warning for warning in w if "SAWarning" in str(warning.category.__name__)]
            
            # Also check for "overlapping" specifically in warning messages
            overlapping_warnings = [
                warning for warning in w 
                if "overlapping" in str(warning.message).lower()
            ]
            
            assert len(sa_warnings) == 0, f"SAWarning raised: {[str(warning.message) for warning in sa_warnings]}"
            assert len(overlapping_warnings) == 0, f"Overlapping relationship warning raised: {[str(warning.message) for warning in overlapping_warnings]}"
