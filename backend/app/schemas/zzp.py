"""
ZZP Schemas

Pydantic schemas for ZZP-specific API operations including validation.
"""
import re
from datetime import datetime
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel, Field, field_validator, EmailStr


# ============================================================================
# Validation Patterns
# ============================================================================

# IBAN pattern - basic validation (country code + check digits + BBAN)
# Format: 2 letters + 2 digits + 4-30 alphanumeric
IBAN_PATTERN = re.compile(r'^[A-Z]{2}[0-9]{2}[A-Z0-9]{4,30}$')

# Dutch KVK pattern - 8 digits
KVK_PATTERN = re.compile(r'^[0-9]{8}$')

# Dutch BTW pattern - NL + 9 digits + B + 2 digits (e.g., NL123456789B01)
BTW_PATTERN = re.compile(r'^NL[0-9]{9}B[0-9]{2}$')


# ============================================================================
# Customer Schemas
# ============================================================================

class CustomerBase(BaseModel):
    """Base schema for customer data with validation."""
    name: str = Field(..., min_length=1, max_length=255, description="Customer or company name (required)")
    
    email: Optional[str] = Field(None, max_length=255, description="Contact email address")
    phone: Optional[str] = Field(None, max_length=50, description="Contact phone number")
    
    # Address
    address_street: Optional[str] = Field(None, max_length=500, description="Street address with house number")
    address_postal_code: Optional[str] = Field(None, max_length=20, description="Postal/ZIP code")
    address_city: Optional[str] = Field(None, max_length=100, description="City name")
    address_country: Optional[str] = Field(None, max_length=100, description="Country (default: Nederland)")
    
    # Business identifiers
    kvk_number: Optional[str] = Field(None, max_length=20, description="Dutch KVK number (8 digits)")
    btw_number: Optional[str] = Field(None, max_length=30, description="Dutch BTW number (NL000000000B00)")
    
    # Bank
    iban: Optional[str] = Field(None, max_length=34, description="IBAN bank account number")
    
    # Status
    status: str = Field("active", pattern=r'^(active|inactive)$', description="Customer status")

    @field_validator('name')
    @classmethod
    def validate_name(cls, v: str) -> str:
        """Trim whitespace from name."""
        if v:
            v = v.strip()
            if not v:
                raise ValueError("Name cannot be empty")
        return v

    @field_validator('email')
    @classmethod
    def validate_email(cls, v: Optional[str]) -> Optional[str]:
        """Validate email format if provided."""
        if v:
            v = v.strip()
            if not v:
                return None
            # Basic email validation
            email_pattern = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
            if not email_pattern.match(v):
                raise ValueError("Invalid email format")
        return v if v else None

    @field_validator('phone', 'address_street', 'address_city', 'address_country')
    @classmethod
    def trim_string_field(cls, v: Optional[str]) -> Optional[str]:
        """Trim whitespace from string fields."""
        if v:
            v = v.strip()
        return v if v else None

    @field_validator('address_postal_code')
    @classmethod
    def validate_postal_code(cls, v: Optional[str]) -> Optional[str]:
        """Trim and uppercase postal code."""
        if v:
            v = v.strip().upper().replace(' ', '')
        return v if v else None

    @field_validator('kvk_number')
    @classmethod
    def validate_kvk(cls, v: Optional[str]) -> Optional[str]:
        """Validate KVK number format (8 digits)."""
        if v:
            v = v.strip().replace(' ', '')
            if not v:
                return None
            if not KVK_PATTERN.match(v):
                raise ValueError("KVK number must be 8 digits")
        return v if v else None

    @field_validator('btw_number')
    @classmethod
    def validate_btw(cls, v: Optional[str]) -> Optional[str]:
        """Validate BTW number format (NL000000000B00)."""
        if v:
            v = v.strip().upper().replace(' ', '').replace('.', '')
            if not v:
                return None
            if not BTW_PATTERN.match(v):
                raise ValueError("BTW number must be in format NL000000000B00")
        return v if v else None

    @field_validator('iban')
    @classmethod
    def validate_iban(cls, v: Optional[str]) -> Optional[str]:
        """Validate IBAN format (basic check)."""
        if v:
            v = v.strip().upper().replace(' ', '')
            if not v:
                return None
            if not IBAN_PATTERN.match(v):
                raise ValueError("Invalid IBAN format")
        return v if v else None


class CustomerCreate(CustomerBase):
    """Schema for creating a new customer."""
    pass


class CustomerUpdate(BaseModel):
    """Schema for updating a customer (all fields optional)."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    email: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=50)
    address_street: Optional[str] = Field(None, max_length=500)
    address_postal_code: Optional[str] = Field(None, max_length=20)
    address_city: Optional[str] = Field(None, max_length=100)
    address_country: Optional[str] = Field(None, max_length=100)
    kvk_number: Optional[str] = Field(None, max_length=20)
    btw_number: Optional[str] = Field(None, max_length=30)
    iban: Optional[str] = Field(None, max_length=34)
    status: Optional[str] = Field(None, pattern=r'^(active|inactive)$')

    @field_validator('name')
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        if v:
            v = v.strip()
            if not v:
                raise ValueError("Name cannot be empty")
        return v

    @field_validator('email')
    @classmethod
    def validate_email(cls, v: Optional[str]) -> Optional[str]:
        if v:
            v = v.strip()
            if not v:
                return None
            email_pattern = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
            if not email_pattern.match(v):
                raise ValueError("Invalid email format")
            return v
        return None

    @field_validator('phone', 'address_street', 'address_city', 'address_country')
    @classmethod
    def trim_string_field(cls, v: Optional[str]) -> Optional[str]:
        if v:
            v = v.strip()
        return v if v else None

    @field_validator('address_postal_code')
    @classmethod
    def validate_postal_code(cls, v: Optional[str]) -> Optional[str]:
        if v:
            v = v.strip().upper().replace(' ', '')
        return v if v else None

    @field_validator('kvk_number')
    @classmethod
    def validate_kvk(cls, v: Optional[str]) -> Optional[str]:
        if v:
            v = v.strip().replace(' ', '')
            if not v:
                return None
            if not KVK_PATTERN.match(v):
                raise ValueError("KVK number must be 8 digits")
            return v
        return None

    @field_validator('btw_number')
    @classmethod
    def validate_btw(cls, v: Optional[str]) -> Optional[str]:
        if v:
            v = v.strip().upper().replace(' ', '').replace('.', '')
            if not v:
                return None
            if not BTW_PATTERN.match(v):
                raise ValueError("BTW number must be in format NL000000000B00")
            return v
        return None

    @field_validator('iban')
    @classmethod
    def validate_iban(cls, v: Optional[str]) -> Optional[str]:
        if v:
            v = v.strip().upper().replace(' ', '')
            if not v:
                return None
            if not IBAN_PATTERN.match(v):
                raise ValueError("Invalid IBAN format")
            return v
        return None


class CustomerResponse(BaseModel):
    """Schema for customer response."""
    id: UUID
    administration_id: UUID
    
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    
    address_street: Optional[str] = None
    address_postal_code: Optional[str] = None
    address_city: Optional[str] = None
    address_country: Optional[str] = None
    
    kvk_number: Optional[str] = None
    btw_number: Optional[str] = None
    iban: Optional[str] = None
    
    status: str
    
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CustomerListResponse(BaseModel):
    """Schema for customer list response."""
    customers: List[CustomerResponse]
    total: int
