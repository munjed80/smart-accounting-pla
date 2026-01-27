from datetime import timedelta, datetime, timezone
from typing import Annotated
import logging

from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.config import settings
from app.core.security import verify_password, get_password_hash, create_access_token
from app.core.rate_limit import check_rate_limit, get_client_ip
from app.models.user import User
from app.models.auth_token import TokenType
from app.schemas.user import (
    UserCreate, 
    UserResponse, 
    Token,
    RegisterResponse,
    EmailRequest,
    GenericMessageResponse,
    VerifyEmailResponse,
    ResetPasswordRequest,
    ResetPasswordResponse,
)
from app.api.v1.deps import CurrentUser
from app.services.auth_token import (
    create_auth_token,
    validate_and_consume_token,
    get_user_by_email,
)
from app.services.email import email_service

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register(
    user_in: UserCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Register a new user.
    
    Creates the user with email_verified_at=null and sends a verification email.
    """
    check_rate_limit("register", request)
    
    # Check if email already exists
    result = await db.execute(select(User).where(User.email == user_in.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail="Email already registered"
        )
    
    # Create user with email_verified_at = None
    user = User(
        email=user_in.email,
        hashed_password=get_password_hash(user_in.password),
        full_name=user_in.full_name,
        role=user_in.role,
        email_verified_at=None,  # User starts unverified
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    # Create verification token
    ip_address = get_client_ip(request)
    user_agent = request.headers.get("User-Agent", "")[:500]
    
    token = await create_auth_token(
        db=db,
        user_id=user.id,
        token_type=TokenType.EMAIL_VERIFY,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    
    # Send verification email
    await email_service.send_verification_email(
        to_email=user.email,
        token=token,
        user_name=user.full_name,
    )
    
    logger.info(
        f"User registered successfully",
        extra={
            "event": "user_registered",
            "user_id": str(user.id),
            "email": user.email,
        }
    )
    
    return RegisterResponse(
        message="Check your email to verify your account",
        user_id=user.id,
    )


@router.post("/resend-verification", response_model=GenericMessageResponse)
async def resend_verification(
    email_request: EmailRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Resend verification email.
    
    Always returns success message to prevent email enumeration.
    Only sends email if user exists and is not yet verified.
    """
    check_rate_limit("resend_verification", request)
    
    # Always return same response to prevent email enumeration
    response = GenericMessageResponse(
        message="If an account with this email exists and is not yet verified, a verification email has been sent."
    )
    
    user = await get_user_by_email(db, email_request.email)
    
    if user and not user.is_email_verified:
        # Create new verification token
        ip_address = get_client_ip(request)
        user_agent = request.headers.get("User-Agent", "")[:500]
        
        token = await create_auth_token(
            db=db,
            user_id=user.id,
            token_type=TokenType.EMAIL_VERIFY,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        
        # Send verification email
        await email_service.send_verification_email(
            to_email=user.email,
            token=token,
            user_name=user.full_name,
        )
        
        logger.info(
            f"Verification email resent",
            extra={
                "event": "verification_email_resent",
                "user_id": str(user.id),
            }
        )
    
    return response


@router.get("/verify-email", response_model=VerifyEmailResponse)
async def verify_email(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    token: str = Query(..., min_length=1, description="Verification token from email"),
):
    """
    Verify user's email address.
    
    Validates the token, marks email as verified, and invalidates the token.
    """
    check_rate_limit("verify_email", request)
    
    is_valid, user, error = await validate_and_consume_token(
        db=db,
        raw_token=token,
        token_type=TokenType.EMAIL_VERIFY,
    )
    
    if not is_valid or not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error or "Invalid or expired token",
        )
    
    # Check if already verified
    if user.is_email_verified:
        return VerifyEmailResponse(
            message="Email is already verified",
            verified=True,
        )
    
    # Mark email as verified
    user.email_verified_at = datetime.now(timezone.utc)
    await db.commit()
    
    logger.info(
        f"Email verified successfully",
        extra={
            "event": "email_verified",
            "user_id": str(user.id),
        }
    )
    
    return VerifyEmailResponse(
        message="Email verified successfully",
        verified=True,
    )


@router.post("/token", response_model=Token)
async def login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Login and get access token.
    
    Returns 403 with code EMAIL_NOT_VERIFIED if email is not verified.
    Returns 403 with code ADMIN_NOT_WHITELISTED if admin user is not in whitelist.
    """
    check_rate_limit("login", request)
    
    result = await db.execute(select(User).where(User.email == form_data.username))
    user = result.scalar_one_or_none()
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    
    # Check if email is verified
    if not user.is_email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "message": "Please verify your email before logging in",
                "code": "EMAIL_NOT_VERIFIED",
                "hint": "Check your inbox for a verification email or request a new one",
            },
        )
    
    # Admin role safety: block admin login unless explicitly whitelisted
    # This prevents unauthorized admin access even if someone gains admin role
    if user.role == "admin":
        whitelist = settings.admin_whitelist_list
        if user.email.lower() not in whitelist:
            logger.warning(
                f"Admin login blocked - user not in whitelist",
                extra={
                    "event": "admin_login_blocked",
                    "user_id": str(user.id),
                    "email": user.email,
                }
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "message": "Admin access is restricted",
                    "code": "ADMIN_NOT_WHITELISTED",
                    "hint": "Contact your system administrator if you need admin access",
                },
            )
    
    # Update last login time
    user.last_login_at = datetime.now(timezone.utc)
    await db.commit()
    
    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    
    logger.info(
        f"User logged in",
        extra={
            "event": "user_login",
            "user_id": str(user.id),
        }
    )
    
    return Token(access_token=access_token)


@router.post("/forgot-password", response_model=GenericMessageResponse)
async def forgot_password(
    email_request: EmailRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Request password reset email.
    
    Always returns success message to prevent email enumeration.
    Only sends email if user exists.
    """
    check_rate_limit("forgot_password", request)
    
    # Always return same response to prevent email enumeration
    response = GenericMessageResponse(
        message="If an account with this email exists, a password reset email has been sent."
    )
    
    user = await get_user_by_email(db, email_request.email)
    
    if user:
        # Create password reset token
        ip_address = get_client_ip(request)
        user_agent = request.headers.get("User-Agent", "")[:500]
        
        token = await create_auth_token(
            db=db,
            user_id=user.id,
            token_type=TokenType.PASSWORD_RESET,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        
        # Send password reset email
        await email_service.send_password_reset_email(
            to_email=user.email,
            token=token,
            user_name=user.full_name,
        )
        
        logger.info(
            f"Password reset email sent",
            extra={
                "event": "password_reset_requested",
                "user_id": str(user.id),
            }
        )
    
    return response


@router.post("/reset-password", response_model=ResetPasswordResponse)
async def reset_password(
    reset_request: ResetPasswordRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Reset password with token.
    
    Validates token, updates password, and invalidates the token.
    Password must be at least 10 characters and contain letters and numbers.
    """
    check_rate_limit("reset_password", request)
    
    is_valid, user, error = await validate_and_consume_token(
        db=db,
        raw_token=reset_request.token,
        token_type=TokenType.PASSWORD_RESET,
    )
    
    if not is_valid or not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error or "Invalid or expired token",
        )
    
    # Update password
    user.hashed_password = get_password_hash(reset_request.new_password)
    await db.commit()
    
    logger.info(
        f"Password reset completed",
        extra={
            "event": "password_reset_completed",
            "user_id": str(user.id),
        }
    )
    
    return ResetPasswordResponse(message="Password reset successfully")


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: CurrentUser):
    """Get current user info"""
    return current_user
