from datetime import timedelta, datetime, timezone
from typing import Annotated
import logging
import hashlib

from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select, func
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
    ChangePasswordRequest,
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


def _hash_for_logging(value: str) -> str:
    """Create a truncated hash of a value for safe logging (prevents PII exposure)."""
    return hashlib.sha256(value.encode()).hexdigest()[:12]


@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
async def register(
    user_in: UserCreate,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Register a new user.
    
    Creates the user with email_verified_at=null and sends a verification email.
    
    Returns:
        - 201: Registration successful
        - 409: Email already registered
        - 422: Validation error (invalid email, password too short, etc.)
        - 429: Rate limit exceeded
    """
    request_id = request.headers.get("X-Request-ID", "")
    check_rate_limit("register", request)
    
    try:
        # Check if email already exists
        existing_email = await db.execute(select(User.id).where(func.lower(User.email) == user_in.email.strip().lower()).limit(1))
        if existing_email.scalar_one_or_none():
            logger.warning(
                "Registration attempted with existing email",
                extra={
                    "event": "registration_email_exists",
                    "email": user_in.email,
                    "request_id": request_id,
                }
            )
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Dit e-mailadres is al geregistreerd."
            )
        
        # Create user with email_verified_at = None
        user = User(
            email=user_in.email.strip().lower(),
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
            "User registered successfully",
            extra={
                "event": "user_registered",
                "user_id": str(user.id),
                "email": user.email,
                "request_id": request_id,
            }
        )
        
        return RegisterResponse(
            message="Controleer je e-mail om je account te activeren.",
            user_id=user.id,
        )
    except HTTPException:
        raise  # Re-raise HTTP exceptions as-is
    except Exception as e:
        logger.exception(
            "Unexpected error during registration",
            extra={
                "event": "registration_error",
                "email_hash": _hash_for_logging(user_in.email),
                "request_id": request_id,
                "error_type": type(e).__name__,
            }
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Registreren is niet gelukt. Probeer het opnieuw."
        )


@router.post("/resend-verification", response_model=GenericMessageResponse)
async def resend_verification(
    email_request: EmailRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Resend verification email.
    
    Successful responses remain generic; delivery failures are reported explicitly.
    Only sends email if user exists and is not yet verified.
    """
    check_rate_limit("resend_verification", request)
    if not settings.email_enabled:
        logger.error("verification_delivery_unavailable: email provider is not configured")
        raise HTTPException(status_code=503, detail={
            "code": "EMAIL_DELIVERY_UNAVAILABLE",
            "message": "Verificatie-e-mail kan momenteel niet worden verstuurd. Probeer het later opnieuw.",
        })
    
    # Always return same response to prevent email enumeration
    response = GenericMessageResponse(
        message="Als er een nog niet geactiveerd account met dit e-mailadres bestaat, ontvang je een verificatie-e-mail."
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
            invalidate_existing=False,
        )
        
        # Send verification email
        accepted = await email_service.send_verification_email(
            to_email=user.email,
            token=token,
            user_name=user.full_name,
        )
        
        if not accepted:
            # A provider timeout can happen after acceptance. Keep unexpired links usable
            # if that email arrives later; no raw verification token is exposed in this response.
            logger.error("verification_delivery_failed user_id=%s", user.id)
            raise HTTPException(status_code=503, detail={
                "code": "EMAIL_DELIVERY_FAILED",
                "message": "Er is een probleem bij het versturen van de verificatie-e-mail. Probeer het later opnieuw of neem contact op met support.",
            })

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
            detail="Deze link is ongeldig of verlopen. Vraag een nieuwe link aan.",
        )
    
    # Check if already verified
    if user.is_email_verified:
        return VerifyEmailResponse(
            message="Je e-mailadres is al bevestigd.",
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
        message="Je e-mailadres is bevestigd.",
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
    
    Returns:
        - 200: Login successful, returns access token
        - 401: Incorrect email or password
        - 403: Email not verified (code: EMAIL_NOT_VERIFIED) or Admin not whitelisted (code: ADMIN_NOT_WHITELISTED)
        - 429: Rate limit exceeded
    """
    request_id = request.headers.get("X-Request-ID", "")
    check_rate_limit("login", request)
    
    try:
        result = await db.execute(select(User).where(User.email == form_data.username))
        user = result.scalar_one_or_none()
        
        if not user or not verify_password(form_data.password, user.hashed_password):
            logger.warning(
                "Failed login attempt",
                extra={
                    "event": "login_failed_credentials",
                    "email": form_data.username,
                    "request_id": request_id,
                }
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Onjuist e-mailadres of wachtwoord.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        if not user.is_active:
            logger.warning(
                "Login attempt by inactive user",
                extra={
                    "event": "login_inactive_user",
                    "user_id": str(user.id),
                    "request_id": request_id,
                }
            )
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Dit account is niet actief.")
        
        # Check if email is verified
        if not user.is_email_verified:
            logger.info(
                "Login blocked - email not verified",
                extra={
                    "event": "login_email_not_verified",
                    "user_id": str(user.id),
                    "request_id": request_id,
                }
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "message": "Bevestig je e-mailadres voordat je inlogt.",
                    "code": "EMAIL_NOT_VERIFIED",
                    "hint": "Controleer je inbox op de verificatie-e-mail of vraag een nieuwe aan.",
                },
            )
        
        # Admin and super-admin role safety: block access unless explicitly whitelisted
        if user.role in {"admin", "super_admin"}:
            whitelist = settings.admin_whitelist_list
            if user.email.lower() not in whitelist:
                logger.warning(
                    "Admin login blocked - user not in whitelist",
                    extra={
                        "event": "admin_login_blocked",
                        "user_id": str(user.id),
                        "email": user.email,
                        "request_id": request_id,
                    }
                )
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail={
                        "message": "Toegang tot het beheer is beperkt.",
                        "code": "ADMIN_NOT_WHITELISTED",
                        "hint": "Neem contact op met de systeembeheerder voor toegang.",
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
            "User logged in successfully",
            extra={
                "event": "user_login",
                "user_id": str(user.id),
                "request_id": request_id,
            }
        )
        
        return Token(access_token=access_token)
    except HTTPException:
        raise  # Re-raise HTTP exceptions as-is
    except Exception as e:
        logger.exception(
            "Unexpected error during login",
            extra={
                "event": "login_error",
                "email_hash": _hash_for_logging(form_data.username),
                "request_id": request_id,
                "error_type": type(e).__name__,
            }
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Inloggen is niet gelukt. Probeer het opnieuw."
        )


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
        message="Als er een account met dit e-mailadres bestaat, ontvang je een e-mail om je wachtwoord opnieuw in te stellen."
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
            detail="Deze link is ongeldig of verlopen. Vraag een nieuwe link aan.",
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
    
    return ResetPasswordResponse(message="Je wachtwoord is opnieuw ingesteld.")


@router.post("/change-password", response_model=GenericMessageResponse)
async def change_password(
    change_request: ChangePasswordRequest,
    current_user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """
    Change password for the currently authenticated user.
    
    Requires the current password for verification and a new password
    that meets complexity requirements (min 10 chars, letters + numbers).
    
    Returns:
        - 200: Password changed successfully
        - 400: Current password is incorrect
        - 422: New password doesn't meet requirements
    """
    # Verify current password
    if not verify_password(change_request.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Huidig wachtwoord is onjuist",
        )
    
    # Update password
    current_user.hashed_password = get_password_hash(change_request.new_password)
    await db.commit()
    
    logger.info(
        "Password changed successfully",
        extra={
            "event": "password_changed",
            "user_id": str(current_user.id),
        }
    )
    
    return GenericMessageResponse(message="Wachtwoord succesvol gewijzigd")


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: CurrentUser):
    """Get current user info"""
    return current_user
