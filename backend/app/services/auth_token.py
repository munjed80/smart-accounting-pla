"""
Authentication token service for email verification and password reset.

Security features:
- Tokens are generated as URL-safe random bytes (32 bytes = 256 bits)
- Only SHA-256 hash of token is stored in database
- Tokens have configurable expiration times
- Tokens can only be used once
- Old tokens of same type are invalidated when new one is issued
"""
import secrets
import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.auth_token import AuthToken, TokenType
from app.models.user import User

logger = logging.getLogger(__name__)


def generate_token() -> str:
    """Generate a cryptographically secure URL-safe token."""
    return secrets.token_urlsafe(32)  # 32 bytes = 256 bits


def hash_token(token: str) -> str:
    """Hash a token using SHA-256."""
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


async def create_auth_token(
    db: AsyncSession,
    user_id: UUID,
    token_type: TokenType,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> str:
    """
    Create a new authentication token.
    
    Args:
        db: Database session
        user_id: User ID to create token for
        token_type: Type of token (email_verify or password_reset)
        ip_address: Optional IP address for audit
        user_agent: Optional user agent for audit
        
    Returns:
        The raw token (to be sent to user, never stored)
        
    Raises:
        AssertionError: If token_type is not a valid TokenType enum member
    """
    # Safety guard: ensure token_type is a valid enum member to prevent DB enum errors
    assert isinstance(token_type, TokenType), f"token_type must be a TokenType enum member, got {type(token_type)}"
    
    # Invalidate any existing unused tokens of the same type for this user
    await db.execute(
        update(AuthToken)
        .where(
            AuthToken.user_id == user_id,
            AuthToken.token_type == token_type,
            AuthToken.used_at.is_(None),
        )
        .values(used_at=datetime.now(timezone.utc))  # Mark as used
    )
    
    # Generate new token
    raw_token = generate_token()
    token_hash = hash_token(raw_token)
    
    # Calculate expiry
    if token_type == TokenType.EMAIL_VERIFY:
        expires_delta = timedelta(hours=settings.EMAIL_VERIFY_TOKEN_EXPIRE_HOURS)
    else:  # PASSWORD_RESET
        expires_delta = timedelta(hours=settings.PASSWORD_RESET_TOKEN_EXPIRE_HOURS)
    
    expires_at = datetime.now(timezone.utc) + expires_delta
    
    # Create token record
    auth_token = AuthToken(
        user_id=user_id,
        token_hash=token_hash,
        token_type=token_type,
        expires_at=expires_at,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(auth_token)
    await db.commit()
    
    # Log token creation (without raw token)
    logger.info(
        f"Created {token_type.value} token for user {user_id}",
        extra={
            "event": f"{token_type.value}_token_created",
            "user_id": str(user_id),
            "expires_at": expires_at.isoformat(),
        }
    )
    
    return raw_token


async def validate_and_consume_token(
    db: AsyncSession,
    raw_token: str,
    token_type: TokenType,
) -> Tuple[bool, Optional[User], Optional[str]]:
    """
    Validate a token and mark it as used if valid.
    
    Args:
        db: Database session
        raw_token: The raw token from the URL
        token_type: Expected type of token
        
    Returns:
        Tuple of (is_valid, user, error_message)
        
    Raises:
        AssertionError: If token_type is not a valid TokenType enum member
    """
    # Safety guard: ensure token_type is a valid enum member to prevent DB enum errors
    assert isinstance(token_type, TokenType), f"token_type must be a TokenType enum member, got {type(token_type)}"
    
    token_hash = hash_token(raw_token)
    
    # Find the token
    result = await db.execute(
        select(AuthToken)
        .where(
            AuthToken.token_hash == token_hash,
            AuthToken.token_type == token_type,
        )
    )
    auth_token = result.scalar_one_or_none()
    
    if not auth_token:
        logger.warning(
            f"Invalid {token_type.value} token attempted",
            extra={"event": f"{token_type.value}_invalid_token"}
        )
        return False, None, "Invalid or expired token"
    
    # Check if already used
    if auth_token.used_at is not None:
        logger.warning(
            f"Already used {token_type.value} token attempted",
            extra={
                "event": f"{token_type.value}_token_already_used",
                "user_id": str(auth_token.user_id),
            }
        )
        return False, None, "Token has already been used"
    
    # Check if expired
    now = datetime.now(timezone.utc)
    if now > auth_token.expires_at:
        logger.warning(
            f"Expired {token_type.value} token attempted",
            extra={
                "event": f"{token_type.value}_token_expired",
                "user_id": str(auth_token.user_id),
            }
        )
        return False, None, "Token has expired"
    
    # Mark token as used
    auth_token.used_at = now
    
    # Get the user
    user_result = await db.execute(
        select(User).where(User.id == auth_token.user_id)
    )
    user = user_result.scalar_one_or_none()
    
    if not user:
        logger.error(
            f"Token valid but user not found",
            extra={
                "event": f"{token_type.value}_user_not_found",
                "user_id": str(auth_token.user_id),
            }
        )
        return False, None, "User not found"
    
    await db.commit()
    
    logger.info(
        f"Token {token_type.value} consumed successfully",
        extra={
            "event": f"{token_type.value}_token_consumed",
            "user_id": str(auth_token.user_id),
        }
    )
    
    return True, user, None


async def get_user_by_email(db: AsyncSession, email: str) -> Optional[User]:
    """Get a user by email address."""
    result = await db.execute(
        select(User).where(User.email == email)
    )
    return result.scalar_one_or_none()
