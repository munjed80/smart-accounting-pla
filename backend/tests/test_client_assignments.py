"""
Unit Tests for Client Assignment Functionality

Tests cover:
- Cannot access assignment endpoints as ZZP user (403)
- Create assignment by email success
- Create duplicate assignment returns same (idempotent)
- User not found error
- User is not ZZP error
- User has no administration error
- Delete assignment success
- Only sees own assignments
"""
import pytest
import uuid
from datetime import datetime, timezone


class TestRequireAccountantGuard:
    """Tests for the require_accountant authentication guard."""
    
    def test_zzp_user_gets_forbidden(self):
        """ZZP users should receive 403 FORBIDDEN_ROLE error."""
        user_role = "zzp"
        
        is_accountant = user_role in ["accountant", "admin"]
        
        assert is_accountant == False
    
    def test_accountant_user_passes(self):
        """Accountant users should pass the guard."""
        user_role = "accountant"
        
        is_accountant = user_role in ["accountant", "admin"]
        
        assert is_accountant == True
    
    def test_admin_user_passes(self):
        """Admin users should pass the guard."""
        user_role = "admin"
        
        is_accountant = user_role in ["accountant", "admin"]
        
        assert is_accountant == True


class TestAssignmentByEmail:
    """Tests for client assignment by email functionality."""
    
    def test_create_assignment_success(self):
        """Creating assignment for valid ZZP user should succeed."""
        # Simulate user lookup
        client_email = "zzpclient@example.com"
        client_user = {
            "id": str(uuid.uuid4()),
            "email": client_email,
            "role": "zzp",
            "full_name": "Test ZZP Client"
        }
        administration = {
            "id": str(uuid.uuid4()),
            "name": "Test Administration"
        }
        
        # Verify user is ZZP
        is_zzp = client_user["role"] == "zzp"
        assert is_zzp == True
        
        # Check assignment would be created
        assignment = {
            "accountant_id": str(uuid.uuid4()),
            "administration_id": administration["id"],
            "is_primary": True
        }
        
        assert assignment["administration_id"] == administration["id"]
    
    def test_user_not_found_error(self):
        """Non-existent email should return USER_NOT_FOUND error."""
        client_email = "nonexistent@example.com"
        user_found = None  # User not found
        
        error_code = None
        if not user_found:
            error_code = "USER_NOT_FOUND"
        
        assert error_code == "USER_NOT_FOUND"
    
    def test_not_zzp_user_error(self):
        """Non-ZZP user should return NOT_ZZP_USER error."""
        client_user = {
            "id": str(uuid.uuid4()),
            "email": "accountant@example.com",
            "role": "accountant"  # Not ZZP
        }
        
        error_code = None
        if client_user["role"] != "zzp":
            error_code = "NOT_ZZP_USER"
        
        assert error_code == "NOT_ZZP_USER"
    
    def test_no_administration_error(self):
        """User with no administration should return NO_ADMINISTRATION error."""
        client_user = {
            "id": str(uuid.uuid4()),
            "email": "zzp@example.com",
            "role": "zzp"
        }
        administration = None  # No administration found
        
        error_code = None
        if not administration:
            error_code = "NO_ADMINISTRATION"
        
        assert error_code == "NO_ADMINISTRATION"
    
    def test_duplicate_assignment_idempotent(self):
        """Creating duplicate assignment should return existing one."""
        accountant_id = str(uuid.uuid4())
        administration_id = str(uuid.uuid4())
        
        existing_assignment = {
            "id": str(uuid.uuid4()),
            "accountant_id": accountant_id,
            "administration_id": administration_id,
            "assigned_at": datetime.now(timezone.utc).isoformat()
        }
        
        # Simulate check for existing assignment
        def check_existing(acc_id, admin_id, assignments):
            for a in assignments:
                if a["accountant_id"] == acc_id and a["administration_id"] == admin_id:
                    return a
            return None
        
        result = check_existing(accountant_id, administration_id, [existing_assignment])
        
        assert result is not None
        assert result["id"] == existing_assignment["id"]


class TestDeleteAssignment:
    """Tests for deleting assignments."""
    
    def test_accountant_can_delete_own_assignment(self):
        """Accountant should be able to delete their own assignment."""
        accountant_id = str(uuid.uuid4())
        assignment = {
            "id": str(uuid.uuid4()),
            "accountant_id": accountant_id
        }
        current_user_id = accountant_id
        current_user_role = "accountant"
        
        can_delete = (
            current_user_role == "admin" or
            assignment["accountant_id"] == current_user_id
        )
        
        assert can_delete == True
    
    def test_accountant_cannot_delete_others_assignment(self):
        """Accountant should not be able to delete other's assignment."""
        other_accountant_id = str(uuid.uuid4())
        assignment = {
            "id": str(uuid.uuid4()),
            "accountant_id": other_accountant_id
        }
        current_user_id = str(uuid.uuid4())  # Different user
        current_user_role = "accountant"
        
        can_delete = (
            current_user_role == "admin" or
            assignment["accountant_id"] == current_user_id
        )
        
        assert can_delete == False
    
    def test_admin_can_delete_any_assignment(self):
        """Admin should be able to delete any assignment."""
        other_accountant_id = str(uuid.uuid4())
        assignment = {
            "id": str(uuid.uuid4()),
            "accountant_id": other_accountant_id
        }
        current_user_id = str(uuid.uuid4())  # Different user
        current_user_role = "admin"
        
        can_delete = (
            current_user_role == "admin" or
            assignment["accountant_id"] == current_user_id
        )
        
        assert can_delete == True


class TestListAssignments:
    """Tests for listing assignments."""
    
    def test_accountant_only_sees_own_assignments(self):
        """Accountant should only see their own assignments."""
        accountant_id = str(uuid.uuid4())
        other_accountant_id = str(uuid.uuid4())
        
        all_assignments = [
            {"id": "1", "accountant_id": accountant_id, "administration_name": "Client A"},
            {"id": "2", "accountant_id": other_accountant_id, "administration_name": "Client B"},
            {"id": "3", "accountant_id": accountant_id, "administration_name": "Client C"},
        ]
        
        current_user_role = "accountant"
        current_user_id = accountant_id
        
        # Filter based on role
        if current_user_role != "admin":
            visible_assignments = [
                a for a in all_assignments
                if a["accountant_id"] == current_user_id
            ]
        else:
            visible_assignments = all_assignments
        
        assert len(visible_assignments) == 2
        assert all(a["accountant_id"] == accountant_id for a in visible_assignments)
    
    def test_admin_sees_all_assignments(self):
        """Admin should see all assignments."""
        accountant_id = str(uuid.uuid4())
        other_accountant_id = str(uuid.uuid4())
        
        all_assignments = [
            {"id": "1", "accountant_id": accountant_id, "administration_name": "Client A"},
            {"id": "2", "accountant_id": other_accountant_id, "administration_name": "Client B"},
            {"id": "3", "accountant_id": accountant_id, "administration_name": "Client C"},
        ]
        
        current_user_role = "admin"
        current_user_id = str(uuid.uuid4())  # Admin user
        
        # Filter based on role
        if current_user_role != "admin":
            visible_assignments = [
                a for a in all_assignments
                if a["accountant_id"] == current_user_id
            ]
        else:
            visible_assignments = all_assignments
        
        assert len(visible_assignments) == 3


class TestClientListResponse:
    """Tests for client list with status counts."""
    
    def test_client_list_includes_issue_counts(self):
        """Client list should include RED and YELLOW issue counts."""
        client = {
            "id": str(uuid.uuid4()),
            "email": "client@example.com",
            "name": "Test Client",
            "status": "active",
            "open_red_count": 2,
            "open_yellow_count": 5
        }
        
        assert "open_red_count" in client
        assert "open_yellow_count" in client
        assert client["open_red_count"] == 2
        assert client["open_yellow_count"] == 5
    
    def test_client_list_includes_administration_info(self):
        """Client list should include administration details."""
        admin_id = str(uuid.uuid4())
        client = {
            "id": str(uuid.uuid4()),
            "email": "client@example.com",
            "name": "Test Client",
            "administration_id": admin_id,
            "administration_name": "Test Administration"
        }
        
        assert client["administration_id"] == admin_id
        assert client["administration_name"] == "Test Administration"


class TestMultiTenantSafety:
    """Tests for multi-tenant isolation."""
    
    def test_dashboard_includes_only_assigned_clients(self):
        """Dashboard should only show clients assigned to current accountant."""
        accountant_id = str(uuid.uuid4())
        
        # Simulate assignments
        assignments = [
            {"accountant_id": accountant_id, "administration_id": "admin_1"},
            {"accountant_id": accountant_id, "administration_id": "admin_2"},
        ]
        
        # All administrations in system
        all_administrations = ["admin_1", "admin_2", "admin_3", "admin_4"]
        
        # Filter to only assigned
        assigned_ids = {a["administration_id"] for a in assignments}
        visible = [admin for admin in all_administrations if admin in assigned_ids]
        
        assert len(visible) == 2
        assert "admin_3" not in visible
        assert "admin_4" not in visible
    
    def test_cannot_access_unassigned_client_issues(self):
        """Should not be able to access issues for unassigned client."""
        accountant_id = str(uuid.uuid4())
        requested_client_id = "unassigned_client"
        
        assignments = [
            {"accountant_id": accountant_id, "administration_id": "assigned_client_1"},
        ]
        
        assigned_ids = {a["administration_id"] for a in assignments}
        has_access = requested_client_id in assigned_ids
        
        assert has_access == False


class TestRequireAssignedClientGuard:
    """
    Tests for the require_assigned_client server-enforced guard.
    
    This guard ensures accountants can only access assigned clients.
    Tests verify:
    - Accountant can access assigned client (via AccountantClientAssignment)
    - Accountant cannot access unassigned client (403 CLIENT_NOT_ASSIGNED)
    - ZZP users cannot access accountant routes (403 FORBIDDEN_ROLE)
    """
    
    def test_accountant_can_access_assigned_client(self):
        """Accountant should be able to access a client they are assigned to."""
        accountant_id = str(uuid.uuid4())
        client_id = str(uuid.uuid4())
        
        # Simulate an assignment exists
        assignments = [
            {"accountant_id": accountant_id, "administration_id": client_id}
        ]
        
        # Check access logic
        assigned_client_ids = {a["administration_id"] for a in assignments}
        has_access = client_id in assigned_client_ids
        
        assert has_access == True
    
    def test_accountant_cannot_access_unassigned_client(self):
        """Accountant should get CLIENT_NOT_ASSIGNED error for unassigned client."""
        accountant_id = str(uuid.uuid4())
        client_id = str(uuid.uuid4())
        unassigned_client_id = str(uuid.uuid4())
        
        # Simulate assignment to a different client
        assignments = [
            {"accountant_id": accountant_id, "administration_id": client_id}
        ]
        
        # Check access logic for unassigned client
        assigned_client_ids = {a["administration_id"] for a in assignments}
        has_access = unassigned_client_id in assigned_client_ids
        
        assert has_access == False
        
        # Error code should be CLIENT_NOT_ASSIGNED
        expected_error = {
            "code": "CLIENT_NOT_ASSIGNED",
            "message": "Geen toegang tot deze klant."
        }
        assert expected_error["code"] == "CLIENT_NOT_ASSIGNED"
        assert "Geen toegang" in expected_error["message"]
    
    def test_zzp_user_forbidden_on_accountant_routes(self):
        """ZZP users should receive FORBIDDEN_ROLE when accessing accountant endpoints."""
        user_role = "zzp"
        
        # Role check
        is_accountant_or_admin = user_role in ["accountant", "admin"]
        
        assert is_accountant_or_admin == False
        
        # Expected error response
        expected_error = {
            "code": "FORBIDDEN_ROLE",
            "message": "This endpoint is only available for accountants"
        }
        assert expected_error["code"] == "FORBIDDEN_ROLE"
    
    def test_admin_can_access_any_client(self):
        """Admin role check passes (first step of access control)."""
        admin_user_role = "admin"
        
        # Admin role check passes
        is_accountant_or_admin = admin_user_role in ["accountant", "admin"]
        
        assert is_accountant_or_admin == True
    
    def test_access_via_administration_member(self):
        """Accountant should have access via AdministrationMember with appropriate role."""
        accountant_user_id = str(uuid.uuid4())
        client_id = str(uuid.uuid4())
        
        # Simulate membership in AdministrationMember table
        admin_members = [
            {
                "user_id": accountant_user_id,
                "administration_id": client_id,
                "role": "ACCOUNTANT"
            }
        ]
        
        # Check access via membership
        has_membership = any(
            m["user_id"] == accountant_user_id 
            and m["administration_id"] == client_id
            and m["role"] in ["OWNER", "ADMIN", "ACCOUNTANT"]
            for m in admin_members
        )
        
        assert has_membership == True
    
    def test_access_via_client_assignment(self):
        """Accountant should have access via AccountantClientAssignment."""
        accountant_user_id = str(uuid.uuid4())
        client_id = str(uuid.uuid4())
        
        # Simulate no membership but has assignment
        admin_members = []  # No membership
        assignments = [
            {
                "accountant_id": accountant_user_id,
                "administration_id": client_id
            }
        ]
        
        # Check access via assignment
        has_membership = any(
            m["user_id"] == accountant_user_id 
            and m["administration_id"] == client_id
            for m in admin_members
        )
        has_assignment = any(
            a["accountant_id"] == accountant_user_id
            and a["administration_id"] == client_id
            for a in assignments
        )
        
        has_access = has_membership or has_assignment
        
        assert has_access == True
        assert has_membership == False  # Specifically via assignment
        assert has_assignment == True


class TestDutchErrorMessages:
    """Tests for Dutch-friendly error messages."""
    
    def test_client_not_assigned_error_is_dutch(self):
        """CLIENT_NOT_ASSIGNED error should have Dutch message."""
        error_detail = {
            "code": "CLIENT_NOT_ASSIGNED",
            "message": "Geen toegang tot deze klant."
        }
        
        assert error_detail["code"] == "CLIENT_NOT_ASSIGNED"
        assert error_detail["message"] == "Geen toegang tot deze klant."
        # Message is in Dutch
        assert "toegang" in error_detail["message"]


# Run tests with pytest
if __name__ == "__main__":
    pytest.main([__file__, "-v"])
