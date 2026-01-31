from datetime import datetime
from typing import Optional, Literal
from uuid import UUID
from pydantic import BaseModel, EmailStr, Field, field_validator
import re


class UserBase(BaseModel):
    """Base schema for user data - shared between create and response."""
    email: EmailStr
    full_name: str = Field(..., min_length=1, max_length=255)


class UserCreate(UserBase):
    """Schema for user registration - only allows zzp and accountant roles."""
    password: str = Field(..., min_length=8, max_length=128)
    # Role validation: admin role is NOT allowed via public registration
    # Admin users can only be created via database seed or protected internal commands
    role: str = Field(default="zzp", pattern="^(zzp|accountant)$")


class UserResponse(UserBase):
    """Schema for user response - includes role field that allows all valid roles."""
    id: UUID
    is_active: bool
    is_email_verified: bool = False
    created_at: datetime
    # Response schema allows all valid roles including admin (for admin users reading their profile)
    role: str = Field(default="zzp")

    class Config:
        from_attributes = True


class UserResponseFull(UserResponse):
    """Extended user response with additional fields."""
    email_verified_at: Optional[datetime] = None
    last_login_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: Optional[str] = None


# ============ Auth Request/Response Schemas ============

class RegisterResponse(BaseModel):
    """Response after successful registration."""
    message: str = "Check your email to verify your account"
    user_id: UUID


class EmailRequest(BaseModel):
    """Request containing only email (for resend-verification, forgot-password)."""
    email: EmailStr


class GenericMessageResponse(BaseModel):
    """Generic message response (for endpoints that shouldn't leak info)."""
    message: str


class VerifyEmailResponse(BaseModel):
    """Response after successful email verification."""
    message: str = "Email verified successfully"
    verified: bool = True


class ResetPasswordRequest(BaseModel):
    """Request to reset password with token."""
    token: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=10, max_length=128)
    
    @field_validator('new_password')
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        """Validate password has required complexity."""
        if not re.search(r'[A-Za-z]', v):
            raise ValueError('Password must contain at least one letter')
        if not re.search(r'[0-9]', v):
            raise ValueError('Password must contain at least one number')
        return v


class ResetPasswordResponse(BaseModel):
    """Response after successful password reset."""
    message: str = "Password reset successfully"


class LoginErrorResponse(BaseModel):
    """Error response for login failures."""
    detail: str
    code: Optional[str] = None  # e.g., "EMAIL_NOT_VERIFIED"


class VerifyEmailRequest(BaseModel):
    """Query parameters for verify-email endpoint."""
    token: str = Field(..., min_length=1)
