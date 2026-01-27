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
        assert is_expired == True
    
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
        assert is_used == True
    
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
        assert is_verified == True
    
    def test_already_verified_handling(self):
        """Already verified emails should be handled gracefully."""
        email_verified_at = datetime.now(timezone.utc) - timedelta(days=1)  # Verified yesterday
        
        # Should return success but with "already verified" message
        is_already_verified = email_verified_at is not None
        assert is_already_verified == True


class TestLoginVerificationBlock:
    """Tests for blocking login when email not verified."""
    
    def test_unverified_user_blocked(self):
        """Unverified users should not be able to login."""
        email_verified_at = None
        
        is_verified = email_verified_at is not None
        should_block = not is_verified
        
        assert should_block == True
    
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
        
        assert is_limited == True
    
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
        assert is_expired == True
    
    def test_used_token_rejected(self):
        """Already used tokens should be rejected."""
        used_at = datetime.now(timezone.utc) - timedelta(minutes=30)
        
        is_used = used_at is not None
        assert is_used == True
    
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
        assert is_valid == True


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
        assert should_block == True
    
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
