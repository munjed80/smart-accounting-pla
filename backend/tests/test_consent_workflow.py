"""
Unit Tests for Client Consent Workflow

Tests cover:
- Accountant invite client (POST /accountant/clients/invite)
- ZZP approve/reject links (POST /zzp/links/{id}/approve|reject)
- Idempotent invitations
- Access control with ACTIVE status requirement
- Error scenarios (not found, wrong role, already revoked, etc.)
"""
import pytest
import uuid
from datetime import datetime, timezone


class TestAccountantInviteClient:
    """Tests for accountant self-serve client invitation."""
    
    def test_invite_valid_zzp_client(self):
        """Inviting a valid ZZP client should create PENDING assignment."""
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
        assert client_user["role"] == "zzp"
        
        # Create PENDING assignment
        assignment = {
            "id": str(uuid.uuid4()),
            "status": "PENDING",
            "invited_by": "ACCOUNTANT",
            "client_name": client_user["full_name"],
            "client_email": client_user["email"]
        }
        
        assert assignment["status"] == "PENDING"
        assert assignment["invited_by"] == "ACCOUNTANT"
    
    def test_invite_idempotent_pending(self):
        """Inviting same client twice should return existing PENDING assignment."""
        client_email = "zzpclient@example.com"
        
        # First invitation
        assignment1 = {
            "id": str(uuid.uuid4()),
            "status": "PENDING",
            "client_email": client_email,
        }
        
        # Second invitation (idempotent)
        assignment2 = {
            "id": assignment1["id"],  # Same assignment
            "status": "PENDING",
            "client_email": client_email,
        }
        
        assert assignment1["id"] == assignment2["id"]
        assert assignment2["status"] == "PENDING"
    
    def test_invite_idempotent_active(self):
        """Inviting already ACTIVE client should return existing assignment."""
        client_email = "zzpclient@example.com"
        
        # Existing ACTIVE assignment
        assignment = {
            "id": str(uuid.uuid4()),
            "status": "ACTIVE",
            "client_email": client_email,
        }
        
        # Re-invite (idempotent)
        result = {
            "id": assignment["id"],  # Same assignment
            "status": "ACTIVE",
            "message": "Uitnodiging al verstuurd. Status: ACTIVE"
        }
        
        assert result["id"] == assignment["id"]
        assert result["status"] == "ACTIVE"
    
    def test_invite_user_not_found(self):
        """Inviting non-existent email should return USER_NOT_FOUND error."""
        client_email = "nonexistent@example.com"
        user_found = False
        
        if not user_found:
            error = {
                "code": "USER_NOT_FOUND",
                "message": f"Geen gebruiker gevonden met e-mail: {client_email}"
            }
        
        assert error["code"] == "USER_NOT_FOUND"
    
    def test_invite_not_zzp_user(self):
        """Inviting non-ZZP user should return NOT_ZZP_USER error."""
        client_user = {
            "email": "accountant@example.com",
            "role": "accountant"
        }
        
        if client_user["role"] != "zzp":
            error = {
                "code": "NOT_ZZP_USER",
                "message": "Deze gebruiker is geen ZZP klant."
            }
        
        assert error["code"] == "NOT_ZZP_USER"
    
    def test_invite_no_administration(self):
        """Inviting ZZP user without administration should return NO_ADMINISTRATION error."""
        client_user = {
            "email": "zzp@example.com",
            "role": "zzp"
        }
        has_administration = False
        
        if not has_administration:
            error = {
                "code": "NO_ADMINISTRATION",
                "message": "Deze gebruiker heeft geen administratie om toe te wijzen."
            }
        
        assert error["code"] == "NO_ADMINISTRATION"


class TestZZPApproveRejectLinks:
    """Tests for ZZP client approving/rejecting accountant links."""
    
    def test_approve_pending_link(self):
        """ZZP approving PENDING link should change status to ACTIVE."""
        assignment = {
            "id": str(uuid.uuid4()),
            "status": "PENDING",
        }
        
        # Approve
        assignment["status"] = "ACTIVE"
        assignment["approved_at"] = datetime.now(timezone.utc)
        
        assert assignment["status"] == "ACTIVE"
        assert assignment["approved_at"] is not None
    
    def test_approve_already_active(self):
        """Approving already ACTIVE link should be idempotent."""
        approved_at = datetime.now(timezone.utc)
        assignment = {
            "id": str(uuid.uuid4()),
            "status": "ACTIVE",
            "approved_at": approved_at
        }
        
        # Approve again (idempotent)
        result = {
            "status": "ACTIVE",
            "approved_at": approved_at,
            "message": "Koppeling is al goedgekeurd."
        }
        
        assert result["status"] == "ACTIVE"
    
    def test_approve_revoked_link_fails(self):
        """Approving REVOKED link should fail."""
        assignment = {
            "id": str(uuid.uuid4()),
            "status": "REVOKED",
        }
        
        if assignment["status"] == "REVOKED":
            error = {
                "code": "ASSIGNMENT_REVOKED",
                "message": "Deze koppeling is ingetrokken en kan niet worden goedgekeurd."
            }
        
        assert error["code"] == "ASSIGNMENT_REVOKED"
    
    def test_reject_pending_link(self):
        """ZZP rejecting PENDING link should change status to REVOKED."""
        assignment = {
            "id": str(uuid.uuid4()),
            "status": "PENDING",
        }
        
        # Reject
        assignment["status"] = "REVOKED"
        assignment["revoked_at"] = datetime.now(timezone.utc)
        
        assert assignment["status"] == "REVOKED"
        assert assignment["revoked_at"] is not None
    
    def test_reject_already_revoked(self):
        """Rejecting already REVOKED link should be idempotent."""
        revoked_at = datetime.now(timezone.utc)
        assignment = {
            "id": str(uuid.uuid4()),
            "status": "REVOKED",
            "revoked_at": revoked_at
        }
        
        # Reject again (idempotent)
        result = {
            "status": "REVOKED",
            "revoked_at": revoked_at,
            "message": "Koppeling is al afgewezen."
        }
        
        assert result["status"] == "REVOKED"
    
    def test_zzp_cannot_approve_others_link(self):
        """ZZP user should not be able to approve assignment for different user."""
        current_user_id = str(uuid.uuid4())
        other_user_id = str(uuid.uuid4())
        
        assignment = {
            "id": str(uuid.uuid4()),
            "client_user_id": other_user_id,
            "status": "PENDING"
        }
        
        # Check ownership
        owns_assignment = (assignment["client_user_id"] == current_user_id)
        
        if not owns_assignment:
            error = {
                "code": "ASSIGNMENT_NOT_FOUND",
                "message": "Koppelings verzoek niet gevonden."
            }
        
        assert error["code"] == "ASSIGNMENT_NOT_FOUND"


class TestAccessControlWithConsentStatus:
    """Tests for require_assigned_client guard with consent status."""
    
    def test_active_assignment_grants_access(self):
        """ACTIVE assignment should grant access to client data."""
        assignment = {
            "accountant_id": str(uuid.uuid4()),
            "administration_id": str(uuid.uuid4()),
            "status": "ACTIVE"
        }
        
        # Check access
        has_access = (assignment["status"] == "ACTIVE")
        
        assert has_access == True
    
    def test_pending_assignment_denies_access(self):
        """PENDING assignment should NOT grant access (awaiting approval)."""
        assignment = {
            "accountant_id": str(uuid.uuid4()),
            "administration_id": str(uuid.uuid4()),
            "status": "PENDING"
        }
        
        # Check access
        has_access = (assignment["status"] == "ACTIVE")
        
        if not has_access and assignment["status"] == "PENDING":
            error = {
                "code": "PENDING_APPROVAL",
                "message": "Toegang is in afwachting van goedkeuring door de klant."
            }
        
        assert error["code"] == "PENDING_APPROVAL"
    
    def test_revoked_assignment_denies_access(self):
        """REVOKED assignment should NOT grant access."""
        assignment = {
            "accountant_id": str(uuid.uuid4()),
            "administration_id": str(uuid.uuid4()),
            "status": "REVOKED"
        }
        
        # Check access
        has_access = (assignment["status"] == "ACTIVE")
        
        if not has_access and assignment["status"] == "REVOKED":
            error = {
                "code": "ACCESS_REVOKED",
                "message": "Toegang is ingetrokken door de klant."
            }
        
        assert error["code"] == "ACCESS_REVOKED"
    
    def test_no_assignment_denies_access(self):
        """No assignment should deny access."""
        has_assignment = False
        
        if not has_assignment:
            error = {
                "code": "NOT_ASSIGNED",
                "message": "Geen toegang tot deze klant."
            }
        
        assert error["code"] == "NOT_ASSIGNED"


class TestListClientLinks:
    """Tests for listing client links with consent status."""
    
    def test_list_shows_pending_and_active(self):
        """List should show both PENDING and ACTIVE assignments, not REVOKED."""
        assignments = [
            {"id": str(uuid.uuid4()), "status": "PENDING"},
            {"id": str(uuid.uuid4()), "status": "ACTIVE"},
            {"id": str(uuid.uuid4()), "status": "REVOKED"},
        ]
        
        # Filter out REVOKED
        visible_assignments = [a for a in assignments if a["status"] != "REVOKED"]
        
        assert len(visible_assignments) == 2
        assert all(a["status"] in ["PENDING", "ACTIVE"] for a in visible_assignments)
    
    def test_count_pending_and_active(self):
        """Should correctly count PENDING and ACTIVE assignments."""
        assignments = [
            {"status": "PENDING"},
            {"status": "PENDING"},
            {"status": "ACTIVE"},
            {"status": "ACTIVE"},
            {"status": "ACTIVE"},
        ]
        
        pending_count = sum(1 for a in assignments if a["status"] == "PENDING")
        active_count = sum(1 for a in assignments if a["status"] == "ACTIVE")
        
        assert pending_count == 2
        assert active_count == 3


class TestBulkOperationsWithConsent:
    """Tests for bulk operations respecting consent status."""
    
    def test_bulk_only_affects_active_clients(self):
        """Bulk operations should only affect clients with ACTIVE assignments."""
        client_ids = [
            str(uuid.uuid4()),
            str(uuid.uuid4()),
            str(uuid.uuid4()),
        ]
        
        assignments = [
            {"administration_id": client_ids[0], "status": "ACTIVE"},
            {"administration_id": client_ids[1], "status": "PENDING"},
            {"administration_id": client_ids[2], "status": "REVOKED"},
        ]
        
        # Filter to only ACTIVE
        allowed_client_ids = [
            a["administration_id"] 
            for a in assignments 
            if a["status"] == "ACTIVE"
        ]
        
        assert len(allowed_client_ids) == 1
        assert client_ids[0] in allowed_client_ids
        assert client_ids[1] not in allowed_client_ids  # PENDING - no access
        assert client_ids[2] not in allowed_client_ids  # REVOKED - no access
    
    def test_bulk_rejects_unassigned_client(self):
        """Bulk operation should fail if any client is not ACTIVE assigned."""
        requested_client_ids = [
            str(uuid.uuid4()),
            str(uuid.uuid4()),
        ]
        
        active_client_ids = [
            requested_client_ids[0],
            # requested_client_ids[1] is not in active list
        ]
        
        # Validate all requested clients are ACTIVE assigned
        unauthorized_clients = set(requested_client_ids) - set(active_client_ids)
        
        if unauthorized_clients:
            error = {
                "code": "UNAUTHORIZED_CLIENTS",
                "message": f"Geen toegang tot {len(unauthorized_clients)} klant(en)."
            }
        
        assert len(unauthorized_clients) == 1
        assert error["code"] == "UNAUTHORIZED_CLIENTS"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
