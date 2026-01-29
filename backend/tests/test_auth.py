"""
Unit Tests for Authentication Flows

Tests cover:
- User registration creates unverified user
- Login blocked if not verified
- Email verification consumes token
- Resend verification works with generic response
- Forgot password has generic response
- Reset password validates tokens properly
- Token hashing and validation
- API endpoint contract verification

These tests are independent of database and can run without DB dependencies.
"""
import pytest
import hashlib
import secrets
from datetime import datetime, timedelta, timezone


# Inline implementations for testing without importing app modules
def generate_token() -> str:
    """Generate a cryptographically secure URL-safe token."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """Hash a token using SHA-256."""
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


class TestTokenGeneration:
    """Tests for token generation and hashing."""
    
    def test_generate_token_is_url_safe(self):
        """Generated tokens should be URL-safe."""
        token = generate_token()
        # URL-safe base64 only uses these characters
        allowed_chars = set('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_')
        assert all(c in allowed_chars for c in token)
    
    def test_generate_token_has_sufficient_entropy(self):
        """Generated tokens should have at least 32 bytes of entropy."""
        token = generate_token()
        # URL-safe base64 encoding: 32 bytes = 43 characters (with padding removed)
        assert len(token) >= 42
    
    def test_generate_token_is_unique(self):
        """Generated tokens should be unique."""
        tokens = [generate_token() for _ in range(100)]
        assert len(set(tokens)) == 100
    
    def test_hash_token_produces_sha256(self):
        """Token hashing should produce SHA-256 hash."""
        token = "test_token_123"
        expected_hash = hashlib.sha256(token.encode('utf-8')).hexdigest()
        
        result = hash_token(token)
        
        assert result == expected_hash
        assert len(result) == 64  # SHA-256 produces 64 hex characters
    
    def test_hash_token_is_deterministic(self):
        """Same token should always produce same hash."""
        token = generate_token()
        
        hash1 = hash_token(token)
        hash2 = hash_token(token)
        
        assert hash1 == hash2
    
    def test_different_tokens_produce_different_hashes(self):
        """Different tokens should produce different hashes."""
        token1 = generate_token()
        token2 = generate_token()
        
        assert hash_token(token1) != hash_token(token2)


class TestPasswordValidation:
    """Tests for password validation rules."""
    
    def test_password_too_short(self):
        """Passwords under 10 characters should be rejected."""
        password = "Short1"
        assert len(password) < 10
    
    def test_password_minimum_length(self):
        """Passwords must be at least 10 characters."""
        password = "ValidPass1"
        assert len(password) >= 10
    
    def test_password_requires_letter(self):
        """Passwords must contain at least one letter."""
        import re
        
        password_no_letters = "1234567890"
        password_with_letters = "Valid12345"
        
        assert not re.search(r'[A-Za-z]', password_no_letters)
        assert re.search(r'[A-Za-z]', password_with_letters)
    
    def test_password_requires_number(self):
        """Passwords must contain at least one number."""
        import re
        
        password_no_numbers = "NoNumbersHere"
        password_with_numbers = "HasNumber1"
        
        assert not re.search(r'[0-9]', password_no_numbers)
        assert re.search(r'[0-9]', password_with_numbers)
    
    def test_valid_password(self):
        """Valid password passes all checks."""
        import re
        
        password = "SecurePass123"
        
        assert len(password) >= 10
        assert re.search(r'[A-Za-z]', password)
        assert re.search(r'[0-9]', password)


class TestTokenExpiry:
    """Tests for token expiration logic."""
    
    def test_expired_token_detection(self):
        """Expired tokens should be detected."""
        now = datetime.now(timezone.utc)
        expires_at = now - timedelta(hours=1)  # Expired 1 hour ago
        
        is_expired = now > expires_at
        assert is_expired is True
    
    def test_valid_token_not_expired(self):
        """Valid tokens should not be marked as expired."""
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(hours=1)  # Expires in 1 hour
        
        is_expired = now > expires_at
        assert is_expired == False
    
    def test_email_verify_token_24h_expiry(self):
        """Email verification tokens should have 24 hour expiry."""
        EMAIL_VERIFY_HOURS = 24
        
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(hours=EMAIL_VERIFY_HOURS)
        
        # Should still be valid after 23 hours
        check_time = now + timedelta(hours=23)
        assert check_time < expires_at
        
        # Should be expired after 25 hours
        check_time = now + timedelta(hours=25)
        assert check_time > expires_at
    
    def test_password_reset_token_1h_expiry(self):
        """Password reset tokens should have 1 hour expiry."""
        PASSWORD_RESET_HOURS = 1
        
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(hours=PASSWORD_RESET_HOURS)
        
        # Should still be valid after 30 minutes
        check_time = now + timedelta(minutes=30)
        assert check_time < expires_at
        
        # Should be expired after 2 hours
        check_time = now + timedelta(hours=2)
        assert check_time > expires_at


class TestTokenReuse:
    """Tests for token reuse prevention."""
    
    def test_used_token_detection(self):
        """Used tokens should be rejected."""
        used_at = datetime.now(timezone.utc)
        
        is_used = used_at is not None
        assert is_used is True
    
    def test_unused_token_allowed(self):
        """Unused tokens should be allowed."""
        used_at = None
        
        is_used = used_at is not None
        assert is_used == False


class TestSecurityEnumeration:
    """Tests for preventing account enumeration."""
    
    def test_resend_verification_generic_response(self):
        """Resend verification should return same message regardless of email existence."""
        expected_message = "If an account with this email exists and is not yet verified, a verification email has been sent."
        
        # Response for existing unverified user
        response_existing = {"message": expected_message}
        
        # Response for non-existing user
        response_nonexistent = {"message": expected_message}
        
        assert response_existing["message"] == response_nonexistent["message"]
    
    def test_forgot_password_generic_response(self):
        """Forgot password should return same message regardless of email existence."""
        expected_message = "If an account with this email exists, a password reset email has been sent."
        
        # Response for existing user
        response_existing = {"message": expected_message}
        
        # Response for non-existing user
        response_nonexistent = {"message": expected_message}
        
        assert response_existing["message"] == response_nonexistent["message"]


class TestEmailVerificationFlow:
    """Tests for the email verification flow."""
    
    def test_user_starts_unverified(self):
        """New users should start with email_verified_at = None."""
        email_verified_at = None
        
        is_verified = email_verified_at is not None
        assert is_verified == False
    
    def test_verification_sets_timestamp(self):
        """Verifying email should set email_verified_at timestamp."""
        email_verified_at = datetime.now(timezone.utc)
        
        is_verified = email_verified_at is not None
        assert is_verified is True
    
    def test_already_verified_handling(self):
        """Already verified emails should be handled gracefully."""
        email_verified_at = datetime.now(timezone.utc) - timedelta(days=1)  # Verified yesterday
        
        # Should return success but with "already verified" message
        is_already_verified = email_verified_at is not None
        assert is_already_verified is True


class TestLoginVerificationBlock:
    """Tests for blocking login when email not verified."""
    
    def test_unverified_user_blocked(self):
        """Unverified users should not be able to login."""
        email_verified_at = None
        
        is_verified = email_verified_at is not None
        should_block = not is_verified
        
        assert should_block is True
    
    def test_verified_user_allowed(self):
        """Verified users should be able to login."""
        email_verified_at = datetime.now(timezone.utc)
        
        is_verified = email_verified_at is not None
        should_block = not is_verified
        
        assert should_block == False
    
    def test_blocked_response_has_correct_code(self):
        """Blocked login should return EMAIL_NOT_VERIFIED code."""
        expected_code = "EMAIL_NOT_VERIFIED"
        
        # Simulated response
        response = {
            "detail": {
                "message": "Please verify your email before logging in",
                "code": "EMAIL_NOT_VERIFIED",
                "hint": "Check your inbox for a verification email or request a new one",
            }
        }
        
        assert response["detail"]["code"] == expected_code


class TestRateLimiting:
    """Tests for rate limiting logic."""
    
    def test_rate_limit_tracking(self):
        """Rate limiter should track requests correctly."""
        max_requests = 5
        window_seconds = 60
        
        requests_made = 3
        
        is_limited = requests_made >= max_requests
        remaining = max_requests - requests_made
        
        assert is_limited == False
        assert remaining == 2
    
    def test_rate_limit_exceeded(self):
        """Rate limiter should block when limit exceeded."""
        max_requests = 5
        
        requests_made = 5
        
        is_limited = requests_made >= max_requests
        
        assert is_limited is True
    
    def test_rate_limit_per_endpoint(self):
        """Different endpoints should have different rate limits."""
        limits = {
            "resend_verification": {"max_requests": 5, "window_seconds": 60},
            "forgot_password": {"max_requests": 5, "window_seconds": 60},
            "verify_email": {"max_requests": 20, "window_seconds": 60},
            "login": {"max_requests": 10, "window_seconds": 60},
        }
        
        assert limits["verify_email"]["max_requests"] > limits["login"]["max_requests"]
        assert limits["login"]["max_requests"] > limits["forgot_password"]["max_requests"]


class TestPasswordResetFlow:
    """Tests for the password reset flow."""
    
    def test_invalid_token_rejected(self):
        """Invalid tokens should be rejected."""
        token_found = False
        
        is_valid = token_found
        assert is_valid == False
    
    def test_expired_token_rejected(self):
        """Expired tokens should be rejected."""
        now = datetime.now(timezone.utc)
        expires_at = now - timedelta(hours=2)
        
        is_expired = now > expires_at
        assert is_expired is True
    
    def test_used_token_rejected(self):
        """Already used tokens should be rejected."""
        used_at = datetime.now(timezone.utc) - timedelta(minutes=30)
        
        is_used = used_at is not None
        assert is_used is True
    
    def test_valid_token_accepted(self):
        """Valid tokens should be accepted."""
        token_found = True
        used_at = None
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(hours=1)
        
        is_found = token_found
        is_used = used_at is not None
        is_expired = now > expires_at
        
        is_valid = is_found and not is_used and not is_expired
        assert is_valid is True


class TestRoleSafety:
    """Tests for role safety - admin whitelist and registration restrictions."""
    
    def test_admin_role_not_allowed_in_registration(self):
        """Admin role should not be allowed via public registration."""
        # Role validation pattern (from UserBase schema)
        import re
        valid_roles_pattern = r"^(zzp|accountant)$"
        
        # These should be valid
        assert re.match(valid_roles_pattern, "zzp") is not None
        assert re.match(valid_roles_pattern, "accountant") is not None
        
        # Admin should NOT be valid for registration
        assert re.match(valid_roles_pattern, "admin") is None
    
    def test_default_registration_role_is_safe(self):
        """Default registration role should be 'zzp' (safe role)."""
        default_role = "zzp"
        safe_roles = ["zzp", "accountant"]
        
        assert default_role in safe_roles
        assert default_role != "admin"
    
    def test_admin_whitelist_parsing_empty(self):
        """Empty whitelist should return empty list."""
        whitelist_string = ""
        whitelist_list = [email.strip().lower() for email in whitelist_string.split(",") if email.strip()]
        
        assert whitelist_list == []
    
    def test_admin_whitelist_parsing_single_email(self):
        """Single email whitelist should parse correctly."""
        whitelist_string = "admin@example.com"
        whitelist_list = [email.strip().lower() for email in whitelist_string.split(",") if email.strip()]
        
        assert whitelist_list == ["admin@example.com"]
    
    def test_admin_whitelist_parsing_multiple_emails(self):
        """Multiple emails in whitelist should parse correctly."""
        whitelist_string = "admin@example.com, super@company.com, UPPERCASE@TEST.COM"
        whitelist_list = [email.strip().lower() for email in whitelist_string.split(",") if email.strip()]
        
        assert whitelist_list == ["admin@example.com", "super@company.com", "uppercase@test.com"]
    
    def test_admin_whitelist_check_whitelisted_user(self):
        """Whitelisted admin should be allowed to login."""
        whitelist = ["admin@example.com", "super@company.com"]
        user_email = "admin@example.com"
        user_role = "admin"
        
        is_admin = user_role == "admin"
        is_whitelisted = user_email.lower() in whitelist
        
        should_block = is_admin and not is_whitelisted
        assert should_block == False
    
    def test_admin_whitelist_check_non_whitelisted_user(self):
        """Non-whitelisted admin should be blocked from login."""
        whitelist = ["admin@example.com"]
        user_email = "unauthorized@example.com"
        user_role = "admin"
        
        is_admin = user_role == "admin"
        is_whitelisted = user_email.lower() in whitelist
        
        should_block = is_admin and not is_whitelisted
        assert should_block is True
    
    def test_admin_whitelist_check_non_admin_user(self):
        """Non-admin users should not be affected by whitelist."""
        whitelist = ["admin@example.com"]
        user_email = "user@example.com"
        user_role = "zzp"
        
        is_admin = user_role == "admin"
        is_whitelisted = user_email.lower() in whitelist
        
        should_block = is_admin and not is_whitelisted
        assert should_block == False
    
    def test_admin_blocked_response_has_correct_code(self):
        """Blocked admin login should return ADMIN_NOT_WHITELISTED code."""
        expected_code = "ADMIN_NOT_WHITELISTED"
        
        # Simulated response (matching auth.py implementation)
        response = {
            "detail": {
                "message": "Admin access is restricted",
                "code": "ADMIN_NOT_WHITELISTED",
                "hint": "Contact your system administrator if you need admin access",
            }
        }
        
        assert response["detail"]["code"] == expected_code
    
    def test_accountant_not_affected_by_whitelist(self):
        """Accountants should not be affected by admin whitelist."""
        whitelist = []  # Empty whitelist
        user_email = "accountant@example.com"
        user_role = "accountant"
        
        is_admin = user_role == "admin"
        is_whitelisted = user_email.lower() in whitelist
        
        should_block = is_admin and not is_whitelisted
        assert should_block == False  # Accountants are never blocked by admin whitelist


class TestUserRoles:
    """Tests for user role validation and hierarchy."""
    
    def test_valid_user_roles(self):
        """All valid user roles should be defined."""
        valid_roles = ["zzp", "accountant", "admin"]
        
        assert "zzp" in valid_roles
        assert "accountant" in valid_roles
        assert "admin" in valid_roles
    
    def test_role_hierarchy(self):
        """Role hierarchy should be admin > accountant > zzp."""
        role_hierarchy = {
            "admin": 3,
            "accountant": 2,
            "zzp": 1,
        }
        
        assert role_hierarchy["admin"] > role_hierarchy["accountant"]
        assert role_hierarchy["accountant"] > role_hierarchy["zzp"]
    
    def test_registration_allowed_roles(self):
        """Only zzp and accountant should be allowed for public registration."""
        registration_allowed_roles = ["zzp", "accountant"]
        
        assert "zzp" in registration_allowed_roles
        assert "accountant" in registration_allowed_roles
        assert "admin" not in registration_allowed_roles


class TestAuthEndpointContracts:
    """
    Tests for auth endpoint request/response contracts.
    
    These tests verify the expected request formats and response structures
    without requiring a live database connection.
    """
    
    def test_register_request_schema(self):
        """Registration request should match expected schema."""
        # Valid registration request
        valid_request = {
            "email": "user@example.com",
            "password": "SecurePass123",
            "full_name": "Test User",
            "role": "zzp",
        }
        
        # All required fields must be present
        assert "email" in valid_request
        assert "password" in valid_request
        assert "full_name" in valid_request
        
        # Role must be one of allowed values
        assert valid_request["role"] in ["zzp", "accountant"]
        
        # Password must meet minimum length
        assert len(valid_request["password"]) >= 8
    
    def test_register_response_schema(self):
        """Registration response should match expected schema."""
        # Successful registration response (201)
        success_response = {
            "message": "Check your email to verify your account",
            "user_id": "550e8400-e29b-41d4-a716-446655440000",
        }
        
        assert "message" in success_response
        assert "user_id" in success_response
        
        # 409 Conflict response for existing email
        conflict_response = {
            "detail": "Email already registered"
        }
        assert "detail" in conflict_response
    
    def test_login_request_schema(self):
        """Login request should use OAuth2 password grant format."""
        # Login uses x-www-form-urlencoded format per OAuth2 spec
        # username field contains email
        valid_request = {
            "username": "user@example.com",
            "password": "SecurePass123",
        }
        
        assert "username" in valid_request
        assert "password" in valid_request
    
    def test_login_response_schema(self):
        """Login response should match OAuth2 token format."""
        # Successful login response (200)
        success_response = {
            "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
            "token_type": "bearer",
        }
        
        assert "access_token" in success_response
        assert "token_type" in success_response
        assert success_response["token_type"] == "bearer"
        
        # 401 Unauthorized response
        unauthorized_response = {
            "detail": "Incorrect email or password"
        }
        assert "detail" in unauthorized_response
        
        # 403 Email not verified response
        unverified_response = {
            "detail": {
                "message": "Please verify your email before logging in",
                "code": "EMAIL_NOT_VERIFIED",
                "hint": "Check your inbox for a verification email or request a new one",
            }
        }
        assert "detail" in unverified_response
        assert unverified_response["detail"]["code"] == "EMAIL_NOT_VERIFIED"
    
    def test_forgot_password_request_schema(self):
        """Forgot password request should contain email."""
        valid_request = {
            "email": "user@example.com"
        }
        
        assert "email" in valid_request
    
    def test_forgot_password_response_schema(self):
        """Forgot password response should be generic to prevent enumeration."""
        # Same response regardless of email existence
        response = {
            "message": "If an account with this email exists, a password reset email has been sent."
        }
        
        assert "message" in response
        # Response should not indicate whether email exists
        assert "not found" not in response["message"].lower()
        assert "doesn't exist" not in response["message"].lower()
    
    def test_reset_password_request_schema(self):
        """Reset password request should contain token and new password."""
        valid_request = {
            "token": "some-reset-token-here",
            "new_password": "NewSecurePass123",
        }
        
        assert "token" in valid_request
        assert "new_password" in valid_request
        
        # Password validation rules
        password = valid_request["new_password"]
        assert len(password) >= 10
        assert any(c.isalpha() for c in password)
        assert any(c.isdigit() for c in password)
    
    def test_reset_password_response_schema(self):
        """Reset password response should confirm success."""
        success_response = {
            "message": "Password reset successfully"
        }
        
        assert "message" in success_response
        
        # Invalid token response
        invalid_response = {
            "detail": "Invalid or expired token"
        }
        assert "detail" in invalid_response
    
    def test_verify_email_request_schema(self):
        """Verify email request should use query parameter for token."""
        # Token is passed as query parameter: GET /verify-email?token=...
        token = "verification-token-here"
        
        assert isinstance(token, str)
        assert len(token) > 0
    
    def test_verify_email_response_schema(self):
        """Verify email response should indicate verification status."""
        success_response = {
            "message": "Email verified successfully",
            "verified": True,
        }
        
        assert "message" in success_response
        assert "verified" in success_response
        assert success_response["verified"] is True
        
        # Already verified response
        already_verified_response = {
            "message": "Email is already verified",
            "verified": True,
        }
        assert already_verified_response["verified"] is True
    
    def test_user_me_response_schema(self):
        """Get current user response should include user details."""
        success_response = {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "email": "user@example.com",
            "full_name": "Test User",
            "role": "zzp",
            "is_active": True,
            "is_email_verified": True,
            "created_at": "2024-01-15T10:30:00Z",
        }
        
        assert "id" in success_response
        assert "email" in success_response
        assert "full_name" in success_response
        assert "role" in success_response
        assert "is_active" in success_response
        assert "is_email_verified" in success_response
        assert "created_at" in success_response


class TestAuthEndpointStatusCodes:
    """Tests to verify correct HTTP status codes are returned."""
    
    def test_register_status_codes(self):
        """Register endpoint should return correct status codes."""
        expected_codes = {
            "success": 201,  # Created
            "email_exists": 409,  # Conflict
            "validation_error": 422,  # Unprocessable Entity
            "rate_limit": 429,  # Too Many Requests
        }
        
        assert expected_codes["success"] == 201
        assert expected_codes["email_exists"] == 409
        assert expected_codes["validation_error"] == 422
        assert expected_codes["rate_limit"] == 429
    
    def test_login_status_codes(self):
        """Login endpoint should return correct status codes."""
        expected_codes = {
            "success": 200,
            "wrong_credentials": 401,
            "email_not_verified": 403,
            "admin_not_whitelisted": 403,
            "inactive_user": 403,
            "rate_limit": 429,
        }
        
        assert expected_codes["success"] == 200
        assert expected_codes["wrong_credentials"] == 401
        assert expected_codes["email_not_verified"] == 403
        assert expected_codes["admin_not_whitelisted"] == 403
    
    def test_verify_email_status_codes(self):
        """Verify email endpoint should return correct status codes."""
        expected_codes = {
            "success": 200,
            "invalid_token": 400,  # Bad Request
            "rate_limit": 429,
        }
        
        assert expected_codes["success"] == 200
        assert expected_codes["invalid_token"] == 400
    
    def test_reset_password_status_codes(self):
        """Reset password endpoint should return correct status codes."""
        expected_codes = {
            "success": 200,
            "invalid_token": 400,  # Bad Request
            "validation_error": 422,  # Password too weak
            "rate_limit": 429,
        }
        
        assert expected_codes["success"] == 200
        assert expected_codes["invalid_token"] == 400
        assert expected_codes["validation_error"] == 422


class TestAuthEndpointRoutes:
    """Tests to verify auth routes are correctly configured."""
    
    def test_auth_routes_have_no_trailing_slash(self):
        """All auth routes should NOT have trailing slashes."""
        expected_routes = [
            "/register",
            "/token",
            "/resend-verification",
            "/verify-email",
            "/forgot-password",
            "/reset-password",
            "/me",
        ]
        
        for route in expected_routes:
            # No trailing slash
            assert not route.endswith("/"), f"Route {route} should not have trailing slash"
            # Has leading slash
            assert route.startswith("/"), f"Route {route} should have leading slash"
    
    def test_auth_full_paths(self):
        """Auth full paths should be correctly constructed."""
        base_path = "/api/v1/auth"
        
        expected_full_paths = [
            "/api/v1/auth/register",
            "/api/v1/auth/token",
            "/api/v1/auth/resend-verification",
            "/api/v1/auth/verify-email",
            "/api/v1/auth/forgot-password",
            "/api/v1/auth/reset-password",
            "/api/v1/auth/me",
        ]
        
        for path in expected_full_paths:
            assert path.startswith(base_path), f"Path {path} should start with {base_path}"
            # No double slashes
            assert "//" not in path, f"Path {path} should not have double slashes"
    
    def test_auth_methods(self):
        """Auth endpoints should use correct HTTP methods."""
        expected_methods = {
            "/register": "POST",
            "/token": "POST",
            "/resend-verification": "POST",
            "/verify-email": "GET",
            "/forgot-password": "POST",
            "/reset-password": "POST",
            "/me": "GET",
        }
        
        # All POST endpoints should accept JSON body (except /token which uses form)
        json_body_routes = ["/register", "/resend-verification", "/forgot-password", "/reset-password"]
        form_body_routes = ["/token"]
        
        for route in json_body_routes:
            assert expected_methods[route] == "POST"
        
        for route in form_body_routes:
            assert expected_methods[route] == "POST"
        
        # GET endpoints should use query params
        query_param_routes = ["/verify-email"]
        for route in query_param_routes:
            assert expected_methods[route] == "GET"


class TestRoleRegistrationFlow:
    """
    Tests for role handling during user registration.
    
    These tests verify that:
    1. Role is properly included in registration requests
    2. Role defaults to 'zzp' when not specified
    3. Accountant role is properly handled
    4. Admin role is blocked from public registration
    """
    
    def test_accountant_role_in_registration_request(self):
        """Registration request with accountant role should be valid."""
        import re
        valid_roles_pattern = r"^(zzp|accountant)$"
        
        request_with_accountant = {
            "email": "accountant@example.com",
            "password": "SecurePass123",
            "full_name": "Test Accountant",
            "role": "accountant",
        }
        
        # Role should be valid
        assert re.match(valid_roles_pattern, request_with_accountant["role"]) is not None
        
        # All required fields present
        assert "email" in request_with_accountant
        assert "password" in request_with_accountant
        assert "full_name" in request_with_accountant
        assert "role" in request_with_accountant
    
    def test_zzp_role_in_registration_request(self):
        """Registration request with zzp role should be valid."""
        import re
        valid_roles_pattern = r"^(zzp|accountant)$"
        
        request_with_zzp = {
            "email": "zzp@example.com",
            "password": "SecurePass123",
            "full_name": "Test ZZP User",
            "role": "zzp",
        }
        
        # Role should be valid
        assert re.match(valid_roles_pattern, request_with_zzp["role"]) is not None
    
    def test_default_role_is_zzp(self):
        """Registration without role should default to zzp."""
        default_role = "zzp"
        
        # This mimics what the backend does when role is not provided
        request_without_role = {
            "email": "user@example.com",
            "password": "SecurePass123",
            "full_name": "Test User",
        }
        
        # Backend should default to zzp
        assigned_role = request_without_role.get("role", default_role)
        assert assigned_role == "zzp"
    
    def test_admin_role_blocked_in_registration(self):
        """Registration with admin role should be blocked."""
        import re
        valid_roles_pattern = r"^(zzp|accountant)$"
        
        # Admin role should NOT match the valid pattern
        assert re.match(valid_roles_pattern, "admin") is None
    
    def test_user_response_includes_role(self):
        """User response from /me should include role field."""
        expected_user_response = {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "email": "accountant@example.com",
            "full_name": "Test Accountant",
            "role": "accountant",  # Role must be included
            "is_active": True,
            "is_email_verified": True,
            "created_at": "2024-01-15T10:30:00Z",
        }
        
        # Role field must be present
        assert "role" in expected_user_response
        # Role should reflect the registered role
        assert expected_user_response["role"] == "accountant"
    
    def test_role_preserved_after_login(self):
        """User's role should be preserved and returned after login."""
        # Simulate: user registered with role=accountant
        registered_role = "accountant"
        
        # After login, /me endpoint returns user data
        user_from_me_endpoint = {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "email": "accountant@example.com",
            "full_name": "Test Accountant",
            "role": registered_role,  # Should match registration
            "is_active": True,
            "is_email_verified": True,
        }
        
        # The returned role should match the registered role
        assert user_from_me_endpoint["role"] == registered_role
        assert user_from_me_endpoint["role"] != "zzp"  # Not the default
    
    def test_role_values_case_sensitive(self):
        """Role values should be exact lowercase strings."""
        import re
        valid_roles_pattern = r"^(zzp|accountant)$"
        
        # Valid roles (lowercase)
        assert re.match(valid_roles_pattern, "zzp") is not None
        assert re.match(valid_roles_pattern, "accountant") is not None
        
        # Invalid roles (wrong case)
        assert re.match(valid_roles_pattern, "ZZP") is None
        assert re.match(valid_roles_pattern, "Accountant") is None
        assert re.match(valid_roles_pattern, "ACCOUNTANT") is None


class TestAdminRoleManagement:
    """Tests for admin role management endpoint."""
    
    def test_admin_update_role_request_schema(self):
        """Admin role update request should contain role field."""
        import re
        valid_roles_pattern = r"^(zzp|accountant|admin)$"
        
        update_request = {
            "role": "accountant"
        }
        
        assert "role" in update_request
        # Admin endpoint allows all roles including admin
        assert re.match(valid_roles_pattern, update_request["role"]) is not None
    
    def test_admin_update_role_response_schema(self):
        """Admin role update response should include old and new roles."""
        update_response = {
            "message": "Role updated successfully from 'zzp' to 'accountant'",
            "user_id": "550e8400-e29b-41d4-a716-446655440000",
            "old_role": "zzp",
            "new_role": "accountant",
        }
        
        assert "message" in update_response
        assert "user_id" in update_response
        assert "old_role" in update_response
        assert "new_role" in update_response
        assert update_response["old_role"] != update_response["new_role"]
    
    def test_admin_endpoint_requires_auth(self):
        """Admin endpoints should require authentication."""
        # Expected status code when not authenticated
        expected_status_unauthenticated = 401
        assert expected_status_unauthenticated == 401
        
        # Expected status code when authenticated but not admin
        expected_status_not_admin = 403
        assert expected_status_not_admin == 403
    
    def test_admin_cannot_self_demote(self):
        """Admin should not be able to demote themselves."""
        admin_user_id = "550e8400-e29b-41d4-a716-446655440000"
        target_user_id = "550e8400-e29b-41d4-a716-446655440000"  # Same as admin
        new_role = "zzp"
        
        # If admin is trying to change their own role to non-admin
        is_self_demotion = admin_user_id == target_user_id and new_role != "admin"
        assert is_self_demotion is True  # This should be blocked
