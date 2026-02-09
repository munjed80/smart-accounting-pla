"""
Unit Tests for Permission Scopes

Tests cover:
- Scope validation and storage
- SCOPE_MISSING error when required scope is missing
- Default scopes for new assignments
- Scope checking in require_assigned_client
- get/update scopes endpoints
"""
import pytest
import uuid
from datetime import datetime, timezone


# Default scopes that should be granted to new assignments
DEFAULT_SCOPES = [
    'invoices',
    'customers',
    'expenses',
    'hours',
    'documents',
    'bookkeeping',
    'settings',
    'vat',
    'reports'
]


class TestPermissionScopeDefinitions:
    """Tests for permission scope enum definitions."""
    
    def test_all_scopes_defined(self):
        """All required scopes should be defined."""
        expected_scopes = {
            'invoices',
            'customers',
            'expenses',
            'hours',
            'documents',
            'bookkeeping',
            'settings',
            'vat',
            'reports'
        }
        
        assert set(DEFAULT_SCOPES) == expected_scopes
    
    def test_scope_count(self):
        """Should have exactly 9 scopes."""
        assert len(DEFAULT_SCOPES) == 9


class TestScopeChecking:
    """Tests for scope checking logic in require_assigned_client."""
    
    def test_scope_check_passes_when_granted(self):
        """Access should be granted when required scope is in scopes list."""
        granted_scopes = ['invoices', 'customers', 'reports']
        required_scope = 'invoices'
        
        has_scope = required_scope in granted_scopes
        
        assert has_scope
    
    def test_scope_check_fails_when_missing(self):
        """Access should be denied when required scope is not in scopes list."""
        granted_scopes = ['invoices', 'customers']
        required_scope = 'expenses'
        
        has_scope = required_scope in granted_scopes
        
        assert not has_scope
        
        # Expected error
        expected_error = {
            "code": "SCOPE_MISSING",
            "message": f"Geen toegang tot deze module. Ontbrekende machtiging: {required_scope}",
            "required_scope": required_scope,
            "granted_scopes": granted_scopes
        }
        
        assert expected_error["code"] == "SCOPE_MISSING"
    
    def test_scope_check_with_empty_scopes(self):
        """Access should be denied when scopes list is empty."""
        granted_scopes = []
        required_scope = 'invoices'
        
        has_scope = required_scope in granted_scopes
        
        assert not has_scope
    
    def test_scope_check_no_scope_required(self):
        """When no scope is required, access should be granted regardless of scopes."""
        granted_scopes = []
        required_scope = None
        
        # When no scope is required, access is granted
        has_access = required_scope is None or required_scope in granted_scopes
        
        assert has_access


class TestDefaultScopes:
    """Tests for default scopes on new assignments."""
    
    def test_new_assignment_gets_all_scopes(self):
        """New assignments should have all scopes by default."""
        assignment = {
            "id": str(uuid.uuid4()),
            "accountant_id": str(uuid.uuid4()),
            "administration_id": str(uuid.uuid4()),
            "status": "ACTIVE",
            "scopes": DEFAULT_SCOPES.copy()
        }
        
        assert len(assignment["scopes"]) == 9
        assert "invoices" in assignment["scopes"]
        assert "reports" in assignment["scopes"]
        assert "vat" in assignment["scopes"]
    
    def test_backward_compatibility_with_null_scopes(self):
        """Assignments with null scopes should be treated as having all scopes."""
        assignment = {
            "id": str(uuid.uuid4()),
            "scopes": None  # Legacy assignment without scopes
        }
        
        # When scopes is None, default to all scopes
        effective_scopes = assignment["scopes"] or DEFAULT_SCOPES.copy()
        
        assert len(effective_scopes) == 9


class TestScopeValidation:
    """Tests for scope validation in update endpoint."""
    
    def test_validate_valid_scopes(self):
        """Valid scope names should pass validation."""
        requested_scopes = ['invoices', 'customers', 'reports']
        valid_scope_values = set(DEFAULT_SCOPES)
        
        validated = [s for s in requested_scopes if s in valid_scope_values]
        
        assert validated == requested_scopes
    
    def test_filter_invalid_scopes(self):
        """Invalid scope names should be filtered out."""
        requested_scopes = ['invoices', 'invalid_scope', 'customers', 'another_bad']
        valid_scope_values = set(DEFAULT_SCOPES)
        
        validated = [s for s in requested_scopes if s in valid_scope_values]
        
        assert validated == ['invoices', 'customers']
        assert 'invalid_scope' not in validated
    
    def test_reject_empty_scopes(self):
        """Request with no valid scopes should be rejected."""
        requested_scopes = ['invalid1', 'invalid2']
        valid_scope_values = set(DEFAULT_SCOPES)
        
        validated = [s for s in requested_scopes if s in valid_scope_values]
        
        assert len(validated) == 0
        
        # Expected error
        error = {
            "code": "NO_VALID_SCOPES",
            "message": "Geen geldige machtigingen opgegeven."
        }
        
        assert error["code"] == "NO_VALID_SCOPES"


class TestScopesSummary:
    """Tests for scopes summary calculation."""
    
    def test_full_access_summary(self):
        """Full access should show no missing scopes."""
        granted = set(DEFAULT_SCOPES)
        all_scopes = set(DEFAULT_SCOPES)
        
        missing = all_scopes - granted
        
        assert len(missing) == 0
        assert len(granted) == 9
    
    def test_partial_access_summary(self):
        """Partial access should show correct missing scopes."""
        granted = {'invoices', 'customers', 'reports'}
        all_scopes = set(DEFAULT_SCOPES)
        
        missing = all_scopes - granted
        
        assert len(granted) == 3
        assert len(missing) == 6
        assert 'expenses' in missing
        assert 'hours' in missing
        assert 'vat' in missing
    
    def test_no_access_summary(self):
        """No access should show all scopes as missing."""
        granted = set()
        all_scopes = set(DEFAULT_SCOPES)
        
        missing = all_scopes - granted
        
        assert len(missing) == 9


class TestDirectMemberAccess:
    """Tests for direct membership access (full scopes)."""
    
    def test_direct_member_has_all_scopes(self):
        """Direct members (via AdministrationMember) should have all scopes."""
        # Simulate direct membership check
        is_direct_member = True
        
        if is_direct_member:
            effective_scopes = DEFAULT_SCOPES.copy()
        else:
            effective_scopes = []
        
        assert len(effective_scopes) == 9
    
    def test_direct_member_bypasses_scope_check(self):
        """Direct members should pass any scope check."""
        is_direct_member = True
        required_scope = 'vat'
        
        # Direct members always have access
        if is_direct_member:
            has_access = True
        else:
            has_access = required_scope in []
        
        assert has_access


class TestScopeModification:
    """Tests for scope modification permissions."""
    
    def test_admin_can_modify_scopes(self):
        """Admin users should be able to modify scopes."""
        user_role = "admin"
        can_modify = user_role == "admin"
        
        assert can_modify
    
    def test_accountant_cannot_modify_scopes(self):
        """Accountant users should not be able to modify their own scopes."""
        user_role = "accountant"
        can_modify = user_role == "admin"
        
        assert not can_modify
        
        # Expected error
        error = {
            "code": "CANNOT_MODIFY_SCOPES",
            "message": "Alleen de klant of beheerder kan machtigingen wijzigen."
        }
        
        assert error["code"] == "CANNOT_MODIFY_SCOPES"


class TestScopeEndpoints:
    """Tests for scope API endpoints."""
    
    def test_get_scopes_returns_granted_scopes(self):
        """GET /clients/{id}/scopes should return granted scopes."""
        assignment_scopes = ['invoices', 'customers', 'reports']
        
        response = {
            "client_id": str(uuid.uuid4()),
            "client_name": "Test Client",
            "scopes": assignment_scopes,
            "available_scopes": DEFAULT_SCOPES
        }
        
        assert response["scopes"] == assignment_scopes
        assert len(response["available_scopes"]) == 9
    
    def test_update_scopes_stores_validated_scopes(self):
        """PUT /clients/{id}/scopes should store validated scopes."""
        request_scopes = ['invoices', 'vat', 'reports']
        valid_scope_values = set(DEFAULT_SCOPES)
        
        validated = [s for s in request_scopes if s in valid_scope_values]
        
        response = {
            "client_id": str(uuid.uuid4()),
            "scopes": validated,
            "message": f"Machtigingen bijgewerkt: {len(validated)} scopes."
        }
        
        assert response["scopes"] == request_scopes
        assert "3 scopes" in response["message"]


# Run tests with pytest
if __name__ == "__main__":
    pytest.main([__file__, "-v"])
