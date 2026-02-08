"""
ZZP Schemas

Pydantic schemas for ZZP-specific API operations including validation.
"""
import re
from datetime import datetime
from enum import Enum
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

# BIC/SWIFT pattern - 8 or 11 characters (bank code + country + location + optional branch)
BIC_PATTERN = re.compile(r'^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$')


# ============================================================================
# Customer Schemas
# ============================================================================

class CustomerBase(BaseModel):
    """Base schema for customer data with validation."""
    name: str = Field(..., min_length=1, max_length=255, description="Customer or company name (required)")
    
    # Contact
    email: Optional[str] = Field(None, max_length=255, description="Contact email address")
    phone: Optional[str] = Field(None, max_length=50, description="Contact phone number")
    contact_person: Optional[str] = Field(None, max_length=255, description="Contact person name")
    
    # Address
    address_street: Optional[str] = Field(None, max_length=500, description="Street address with house number")
    address_line2: Optional[str] = Field(None, max_length=500, description="Secondary address line (apt, suite, etc.)")
    address_postal_code: Optional[str] = Field(None, max_length=20, description="Postal/ZIP code")
    address_city: Optional[str] = Field(None, max_length=100, description="City name")
    address_country: Optional[str] = Field(None, max_length=100, description="Country (default: Nederland)")
    
    # Business identifiers
    kvk_number: Optional[str] = Field(None, max_length=20, description="Dutch KVK number (8 digits)")
    btw_number: Optional[str] = Field(None, max_length=30, description="Dutch BTW number (NL000000000B00)")
    
    # Bank
    iban: Optional[str] = Field(None, max_length=34, description="IBAN bank account number")
    bank_bic: Optional[str] = Field(None, max_length=11, description="BIC/SWIFT code")
    
    # Notes
    notes: Optional[str] = Field(None, max_length=2000, description="General notes about the customer")
    
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

    @field_validator('phone', 'address_street', 'address_line2', 'address_city', 'address_country', 'contact_person')
    @classmethod
    def trim_string_field(cls, v: Optional[str]) -> Optional[str]:
        """Trim whitespace from string fields."""
        if v:
            v = v.strip()
        return v if v else None

    @field_validator('notes')
    @classmethod
    def trim_notes(cls, v: Optional[str]) -> Optional[str]:
        """Trim whitespace from notes field."""
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

    @field_validator('bank_bic')
    @classmethod
    def validate_bic(cls, v: Optional[str]) -> Optional[str]:
        """Validate BIC/SWIFT format (8 or 11 characters)."""
        if v:
            v = v.strip().upper().replace(' ', '')
            if not v:
                return None
            if not BIC_PATTERN.match(v):
                raise ValueError("Invalid BIC/SWIFT code format (must be 8 or 11 characters)")
        return v if v else None


class CustomerCreate(CustomerBase):
    """Schema for creating a new customer."""
    pass


class CustomerUpdate(BaseModel):
    """Schema for updating a customer (all fields optional)."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    email: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=50)
    contact_person: Optional[str] = Field(None, max_length=255)
    address_street: Optional[str] = Field(None, max_length=500)
    address_line2: Optional[str] = Field(None, max_length=500)
    address_postal_code: Optional[str] = Field(None, max_length=20)
    address_city: Optional[str] = Field(None, max_length=100)
    address_country: Optional[str] = Field(None, max_length=100)
    kvk_number: Optional[str] = Field(None, max_length=20)
    btw_number: Optional[str] = Field(None, max_length=30)
    iban: Optional[str] = Field(None, max_length=34)
    bank_bic: Optional[str] = Field(None, max_length=11)
    notes: Optional[str] = Field(None, max_length=2000)
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

    @field_validator('phone', 'address_street', 'address_line2', 'address_city', 'address_country', 'contact_person')
    @classmethod
    def trim_string_field(cls, v: Optional[str]) -> Optional[str]:
        if v:
            v = v.strip()
        return v if v else None

    @field_validator('notes')
    @classmethod
    def trim_notes(cls, v: Optional[str]) -> Optional[str]:
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

    @field_validator('bank_bic')
    @classmethod
    def validate_bic(cls, v: Optional[str]) -> Optional[str]:
        if v:
            v = v.strip().upper().replace(' ', '')
            if not v:
                return None
            if not BIC_PATTERN.match(v):
                raise ValueError("Invalid BIC/SWIFT code format (must be 8 or 11 characters)")
            return v
        return None


class CustomerResponse(BaseModel):
    """Schema for customer response."""
    id: UUID
    administration_id: UUID
    
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    contact_person: Optional[str] = None
    
    address_street: Optional[str] = None
    address_line2: Optional[str] = None
    address_postal_code: Optional[str] = None
    address_city: Optional[str] = None
    address_country: Optional[str] = None
    
    kvk_number: Optional[str] = None
    btw_number: Optional[str] = None
    iban: Optional[str] = None
    bank_bic: Optional[str] = None
    
    notes: Optional[str] = None
    
    status: str
    
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CustomerListResponse(BaseModel):
    """Schema for customer list response."""
    customers: List[CustomerResponse]
    total: int


# ============================================================================
# Business Profile Schemas
# ============================================================================

class BusinessProfileBase(BaseModel):
    """Base schema for business profile data."""
    company_name: str = Field(..., min_length=1, max_length=255, description="Official company name (required)")
    trading_name: Optional[str] = Field(None, max_length=255, description="Trading name / Handelsnaam if different")
    
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
    
    # Contact
    email: Optional[str] = Field(None, max_length=255, description="Business email address")
    phone: Optional[str] = Field(None, max_length=50, description="Business phone number")
    website: Optional[str] = Field(None, max_length=255, description="Business website URL")
    
    # Logo
    logo_url: Optional[str] = Field(None, max_length=500, description="Company logo URL")

    @field_validator('company_name')
    @classmethod
    def validate_company_name(cls, v: str) -> str:
        """Trim whitespace from company name."""
        if v:
            v = v.strip()
            if not v:
                raise ValueError("Company name cannot be empty")
        return v

    @field_validator('trading_name', 'address_street', 'address_city', 'address_country', 'website')
    @classmethod
    def trim_string_field(cls, v: Optional[str]) -> Optional[str]:
        """Trim whitespace from string fields."""
        if v:
            v = v.strip()
        return v if v else None

    @field_validator('email')
    @classmethod
    def validate_email(cls, v: Optional[str]) -> Optional[str]:
        """Validate email format if provided."""
        if v:
            v = v.strip()
            if not v:
                return None
            email_pattern = re.compile(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
            if not email_pattern.match(v):
                raise ValueError("Invalid email format")
            return v
        return None

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
            return v
        return None

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
            return v
        return None

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
            return v
        return None

    @field_validator('phone')
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        """Trim phone number."""
        if v:
            v = v.strip()
        return v if v else None


class BusinessProfileCreate(BusinessProfileBase):
    """Schema for creating a business profile."""
    pass


class BusinessProfileUpdate(BaseModel):
    """Schema for updating a business profile (all fields optional)."""
    company_name: Optional[str] = Field(None, min_length=1, max_length=255)
    trading_name: Optional[str] = Field(None, max_length=255)
    address_street: Optional[str] = Field(None, max_length=500)
    address_postal_code: Optional[str] = Field(None, max_length=20)
    address_city: Optional[str] = Field(None, max_length=100)
    address_country: Optional[str] = Field(None, max_length=100)
    kvk_number: Optional[str] = Field(None, max_length=20)
    btw_number: Optional[str] = Field(None, max_length=30)
    iban: Optional[str] = Field(None, max_length=34)
    email: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=50)
    website: Optional[str] = Field(None, max_length=255)
    logo_url: Optional[str] = Field(None, max_length=500)

    @field_validator('company_name')
    @classmethod
    def validate_company_name(cls, v: Optional[str]) -> Optional[str]:
        if v:
            v = v.strip()
            if not v:
                raise ValueError("Company name cannot be empty")
        return v

    @field_validator('trading_name', 'address_street', 'address_city', 'address_country', 'website')
    @classmethod
    def trim_string_field(cls, v: Optional[str]) -> Optional[str]:
        if v:
            v = v.strip()
        return v if v else None

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

    @field_validator('phone')
    @classmethod
    def validate_phone(cls, v: Optional[str]) -> Optional[str]:
        if v:
            v = v.strip()
        return v if v else None


class BusinessProfileResponse(BaseModel):
    """Schema for business profile response."""
    id: UUID
    administration_id: UUID
    
    company_name: str
    trading_name: Optional[str] = None
    
    address_street: Optional[str] = None
    address_postal_code: Optional[str] = None
    address_city: Optional[str] = None
    address_country: Optional[str] = None
    
    kvk_number: Optional[str] = None
    btw_number: Optional[str] = None
    iban: Optional[str] = None
    
    email: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    
    logo_url: Optional[str] = None
    
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ============================================================================
# Invoice Schemas
# ============================================================================

class InvoiceLineBase(BaseModel):
    """Base schema for invoice line item."""
    description: str = Field(..., min_length=1, max_length=500, description="Line item description")
    quantity: float = Field(1.0, gt=0, description="Quantity")
    unit_price_cents: int = Field(..., description="Unit price in cents")
    vat_rate: float = Field(21.0, ge=0, le=100, description="VAT rate percentage (0, 9, or 21)")

    @field_validator('description')
    @classmethod
    def validate_description(cls, v: str) -> str:
        if v:
            v = v.strip()
            if not v:
                raise ValueError("Description cannot be empty")
        return v


class InvoiceLineCreate(InvoiceLineBase):
    """Schema for creating an invoice line."""
    pass


class InvoiceLineUpdate(BaseModel):
    """Schema for updating an invoice line."""
    description: Optional[str] = Field(None, min_length=1, max_length=500)
    quantity: Optional[float] = Field(None, gt=0)
    unit_price_cents: Optional[int] = None
    vat_rate: Optional[float] = Field(None, ge=0, le=100)


class InvoiceLineResponse(BaseModel):
    """Schema for invoice line response."""
    id: UUID
    invoice_id: UUID
    line_number: int
    description: str
    quantity: float
    unit_price_cents: int
    vat_rate: float
    line_total_cents: int
    vat_amount_cents: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class InvoiceBase(BaseModel):
    """Base schema for invoice data."""
    customer_id: UUID = Field(..., description="Customer ID")
    issue_date: str = Field(..., description="Invoice issue date (YYYY-MM-DD)")
    due_date: Optional[str] = Field(None, description="Payment due date (YYYY-MM-DD)")
    notes: Optional[str] = Field(None, max_length=2000, description="Invoice notes")

    @field_validator('issue_date', 'due_date')
    @classmethod
    def validate_date(cls, v: Optional[str]) -> Optional[str]:
        if v:
            try:
                # Validate date format
                from datetime import datetime as dt
                dt.strptime(v, '%Y-%m-%d')
            except ValueError:
                raise ValueError("Date must be in YYYY-MM-DD format")
        return v


class InvoiceCreate(InvoiceBase):
    """Schema for creating an invoice."""
    lines: List[InvoiceLineCreate] = Field(..., min_length=1, description="Invoice line items (at least one required)")


class InvoiceUpdate(BaseModel):
    """Schema for updating an invoice (draft only)."""
    customer_id: Optional[UUID] = None
    issue_date: Optional[str] = None
    due_date: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=2000)
    lines: Optional[List[InvoiceLineCreate]] = None

    @field_validator('issue_date', 'due_date')
    @classmethod
    def validate_date(cls, v: Optional[str]) -> Optional[str]:
        if v:
            try:
                from datetime import datetime as dt
                dt.strptime(v, '%Y-%m-%d')
            except ValueError:
                raise ValueError("Date must be in YYYY-MM-DD format")
        return v


class InvoiceStatusUpdate(BaseModel):
    """Schema for updating invoice status."""
    status: str = Field(..., pattern=r'^(sent|paid|cancelled)$', description="New status")


class InvoiceResponse(BaseModel):
    """Schema for invoice response."""
    id: UUID
    administration_id: UUID
    customer_id: UUID
    invoice_number: str
    status: str
    issue_date: str
    due_date: Optional[str] = None
    
    # Seller snapshot
    seller_company_name: Optional[str] = None
    seller_trading_name: Optional[str] = None
    seller_address_street: Optional[str] = None
    seller_address_postal_code: Optional[str] = None
    seller_address_city: Optional[str] = None
    seller_address_country: Optional[str] = None
    seller_kvk_number: Optional[str] = None
    seller_btw_number: Optional[str] = None
    seller_iban: Optional[str] = None
    seller_email: Optional[str] = None
    seller_phone: Optional[str] = None
    
    # Customer snapshot
    customer_name: Optional[str] = None
    customer_address_street: Optional[str] = None
    customer_address_postal_code: Optional[str] = None
    customer_address_city: Optional[str] = None
    customer_address_country: Optional[str] = None
    customer_kvk_number: Optional[str] = None
    customer_btw_number: Optional[str] = None
    
    # Totals
    subtotal_cents: int
    vat_total_cents: int
    total_cents: int
    amount_paid_cents: int = 0
    
    # Payment timestamp
    paid_at: Optional[datetime] = None
    
    notes: Optional[str] = None
    
    # Lines
    lines: List[InvoiceLineResponse] = []
    
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class InvoiceListResponse(BaseModel):
    """Schema for invoice list response."""
    invoices: List[InvoiceResponse]
    total: int


# ============================================================================
# Expense Schemas
# ============================================================================

# Common expense categories
EXPENSE_CATEGORIES = [
    "algemeen",
    "kantoorkosten",
    "reiskosten",
    "marketing",
    "verzekeringen",
    "abonnementen",
    "telefoon_internet",
    "auto",
    "onderhoud",
    "opleiding",
    "representatie",
    "overig",
]


class ExpenseBase(BaseModel):
    """Base schema for expense data."""
    vendor: str = Field(..., min_length=1, max_length=255, description="Vendor/supplier name")
    description: Optional[str] = Field(None, max_length=500, description="Expense description")
    expense_date: str = Field(..., description="Expense date (YYYY-MM-DD)")
    amount_cents: int = Field(..., gt=0, description="Total amount in cents")
    vat_rate: float = Field(21.0, ge=0, le=100, description="VAT rate percentage")
    category: str = Field("algemeen", max_length=100, description="Expense category")
    notes: Optional[str] = Field(None, max_length=2000, description="Additional notes")
    attachment_url: Optional[str] = Field(None, max_length=500, description="Receipt/document URL")

    @field_validator('vendor')
    @classmethod
    def validate_vendor(cls, v: str) -> str:
        if v:
            v = v.strip()
            if not v:
                raise ValueError("Vendor cannot be empty")
        return v

    @field_validator('expense_date')
    @classmethod
    def validate_date(cls, v: str) -> str:
        if v:
            try:
                from datetime import datetime as dt
                dt.strptime(v, '%Y-%m-%d')
            except ValueError:
                raise ValueError("Date must be in YYYY-MM-DD format")
        return v


class ExpenseCreate(ExpenseBase):
    """Schema for creating an expense."""
    pass


class ExpenseUpdate(BaseModel):
    """Schema for updating an expense."""
    vendor: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=500)
    expense_date: Optional[str] = None
    amount_cents: Optional[int] = Field(None, gt=0)
    vat_rate: Optional[float] = Field(None, ge=0, le=100)
    category: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = Field(None, max_length=2000)
    attachment_url: Optional[str] = Field(None, max_length=500)

    @field_validator('expense_date')
    @classmethod
    def validate_date(cls, v: Optional[str]) -> Optional[str]:
        if v:
            try:
                from datetime import datetime as dt
                dt.strptime(v, '%Y-%m-%d')
            except ValueError:
                raise ValueError("Date must be in YYYY-MM-DD format")
        return v


class ExpenseResponse(BaseModel):
    """Schema for expense response."""
    id: UUID
    administration_id: UUID
    vendor: str
    description: Optional[str] = None
    expense_date: str
    amount_cents: int
    vat_rate: float
    vat_amount_cents: int
    category: str
    notes: Optional[str] = None
    attachment_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ExpenseListResponse(BaseModel):
    """Schema for expense list response."""
    expenses: List[ExpenseResponse]
    total: int
    total_amount_cents: int
    total_vat_cents: int


class ExpenseSummary(BaseModel):
    """Schema for expense summary by month/category."""
    month: str
    category: str
    total_amount_cents: int
    total_vat_cents: int
    count: int


# ============================================================================
# Time Entry Schemas
# ============================================================================

class TimeEntryBase(BaseModel):
    """Base schema for time entry data."""
    entry_date: str = Field(..., description="Date of work (YYYY-MM-DD)")
    description: str = Field(..., min_length=1, max_length=500, description="Description of work")
    hours: float = Field(..., gt=0, le=24, description="Number of hours")
    project_name: Optional[str] = Field(None, max_length=255, description="Project or client name")
    customer_id: Optional[UUID] = Field(None, description="Optional customer reference")
    hourly_rate_cents: Optional[int] = Field(None, ge=0, description="Hourly rate in cents")
    billable: bool = Field(True, description="Whether this time is billable")

    @field_validator('entry_date')
    @classmethod
    def validate_date(cls, v: str) -> str:
        if v:
            try:
                from datetime import datetime as dt
                dt.strptime(v, '%Y-%m-%d')
            except ValueError:
                raise ValueError("Date must be in YYYY-MM-DD format")
        return v

    @field_validator('description')
    @classmethod
    def validate_description(cls, v: str) -> str:
        if v:
            v = v.strip()
            if not v:
                raise ValueError("Description cannot be empty")
        return v


class TimeEntryCreate(TimeEntryBase):
    """Schema for creating a time entry."""
    pass


class TimeEntryUpdate(BaseModel):
    """Schema for updating a time entry."""
    entry_date: Optional[str] = None
    description: Optional[str] = Field(None, min_length=1, max_length=500)
    hours: Optional[float] = Field(None, gt=0, le=24)
    project_name: Optional[str] = Field(None, max_length=255)
    customer_id: Optional[UUID] = None
    hourly_rate_cents: Optional[int] = Field(None, ge=0)
    billable: Optional[bool] = None

    @field_validator('entry_date')
    @classmethod
    def validate_date(cls, v: Optional[str]) -> Optional[str]:
        if v:
            try:
                from datetime import datetime as dt
                dt.strptime(v, '%Y-%m-%d')
            except ValueError:
                raise ValueError("Date must be in YYYY-MM-DD format")
        return v


class TimeEntryResponse(BaseModel):
    """Schema for time entry response."""
    id: UUID
    administration_id: UUID
    entry_date: str
    description: str
    hours: float
    project_name: Optional[str] = None
    customer_id: Optional[UUID] = None
    hourly_rate_cents: Optional[int] = None
    billable: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TimeEntryListResponse(BaseModel):
    """Schema for time entry list response."""
    entries: List[TimeEntryResponse]
    total: int
    total_hours: float
    total_billable_hours: float


class WeeklyTimeSummary(BaseModel):
    """Schema for weekly time summary."""
    week_start: str
    week_end: str
    total_hours: float
    billable_hours: float
    entries_by_day: dict  # date -> hours


# ============================================================================
# Calendar Event Schemas
# ============================================================================

class CalendarEventBase(BaseModel):
    """Base schema for calendar event data."""
    title: str = Field(..., min_length=1, max_length=255, description="Event title")
    start_datetime: str = Field(..., description="Event start (ISO 8601)")
    end_datetime: str = Field(..., description="Event end (ISO 8601)")
    location: Optional[str] = Field(None, max_length=500, description="Event location")
    notes: Optional[str] = Field(None, max_length=2000, description="Event notes")

    @field_validator('title')
    @classmethod
    def validate_title(cls, v: str) -> str:
        if v:
            v = v.strip()
            if not v:
                raise ValueError("Title cannot be empty")
        return v

    @field_validator('start_datetime', 'end_datetime')
    @classmethod
    def validate_datetime(cls, v: str) -> str:
        if v:
            try:
                from datetime import datetime as dt
                # Parse ISO 8601 format
                dt.fromisoformat(v.replace('Z', '+00:00'))
            except ValueError:
                raise ValueError("Datetime must be in ISO 8601 format")
        return v


class CalendarEventCreate(CalendarEventBase):
    """Schema for creating a calendar event."""
    pass


class CalendarEventUpdate(BaseModel):
    """Schema for updating a calendar event."""
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    start_datetime: Optional[str] = None
    end_datetime: Optional[str] = None
    location: Optional[str] = Field(None, max_length=500)
    notes: Optional[str] = Field(None, max_length=2000)

    @field_validator('start_datetime', 'end_datetime')
    @classmethod
    def validate_datetime(cls, v: Optional[str]) -> Optional[str]:
        if v:
            try:
                from datetime import datetime as dt
                dt.fromisoformat(v.replace('Z', '+00:00'))
            except ValueError:
                raise ValueError("Datetime must be in ISO 8601 format")
        return v


class CalendarEventResponse(BaseModel):
    """Schema for calendar event response."""
    id: UUID
    administration_id: UUID
    title: str
    start_datetime: str
    end_datetime: str
    location: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CalendarEventListResponse(BaseModel):
    """Schema for calendar event list response."""
    events: List[CalendarEventResponse]
    total: int


# ============================================================================
# Work Session Schemas (Clock-in/out functionality)
# ============================================================================

class WorkSessionStart(BaseModel):
    """Schema for starting a work session (clock-in)."""
    note: Optional[str] = Field(None, max_length=2000, description="Optional note about the work")

    @field_validator('note')
    @classmethod
    def trim_note(cls, v: Optional[str]) -> Optional[str]:
        if v:
            v = v.strip()
        return v if v else None


class WorkSessionStop(BaseModel):
    """Schema for stopping a work session (clock-out)."""
    break_minutes: int = Field(0, ge=0, le=480, description="Minutes of break time to subtract (max 8 hours)")
    note: Optional[str] = Field(None, max_length=2000, description="Optional note about the work")

    @field_validator('note')
    @classmethod
    def trim_note(cls, v: Optional[str]) -> Optional[str]:
        if v:
            v = v.strip()
        return v if v else None


class WorkSessionResponse(BaseModel):
    """Schema for work session response."""
    id: UUID
    user_id: UUID
    administration_id: UUID
    started_at: datetime
    ended_at: Optional[datetime] = None
    break_minutes: int
    note: Optional[str] = None
    time_entry_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime
    
    # Computed field for duration display (in seconds)
    duration_seconds: Optional[int] = None

    class Config:
        from_attributes = True


class WorkSessionStopResponse(BaseModel):
    """Schema for stop session response with created time entry info."""
    session: WorkSessionResponse
    time_entry: TimeEntryResponse
    hours_added: float
    message: str


# ============================================================================
# ZZP Bank Payment Schemas
# ============================================================================

class ZZPBankAccountResponse(BaseModel):
    """Schema for bank account response."""
    id: UUID
    administration_id: UUID
    iban: str
    bank_name: Optional[str] = None
    currency: str
    created_at: datetime
    
    class Config:
        from_attributes = True


class ZZPBankAccountListResponse(BaseModel):
    """Schema for list of bank accounts."""
    accounts: List[ZZPBankAccountResponse]
    total: int


class ZZPBankTransactionResponse(BaseModel):
    """Schema for bank transaction response."""
    id: UUID
    administration_id: UUID
    bank_account_id: UUID
    booking_date: str  # YYYY-MM-DD
    amount_cents: int  # amount in cents (positive = credit, negative = debit)
    currency: str
    counterparty_name: Optional[str] = None
    counterparty_iban: Optional[str] = None
    description: str
    reference: Optional[str] = None
    status: str  # NEW, MATCHED, IGNORED, NEEDS_REVIEW
    matched_invoice_id: Optional[UUID] = None
    matched_invoice_number: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class ZZPBankTransactionListResponse(BaseModel):
    """Schema for list of bank transactions."""
    transactions: List[ZZPBankTransactionResponse]
    total: int
    page: int
    page_size: int


class ZZPBankImportResponse(BaseModel):
    """Response after importing a bank statement."""
    imported_count: int
    skipped_duplicates_count: int
    total_in_file: int
    errors: List[str]
    message: str
    bank_account_id: Optional[UUID] = None


class ZZPInvoiceMatchSuggestion(BaseModel):
    """A suggested invoice match for a bank transaction."""
    invoice_id: UUID
    invoice_number: str
    customer_name: Optional[str]
    invoice_total_cents: int
    invoice_open_cents: int
    invoice_date: str  # YYYY-MM-DD
    confidence_score: int  # 0-100
    match_reason: str  # Dutch explanation


class ZZPMatchSuggestionsResponse(BaseModel):
    """Response with match suggestions for a bank transaction."""
    transaction_id: UUID
    suggestions: List[ZZPInvoiceMatchSuggestion]
    message: str


class ZZPMatchInvoiceRequest(BaseModel):
    """Request to match a transaction to an invoice."""
    invoice_id: UUID
    amount_cents: Optional[int] = None  # If null, use full transaction amount
    notes: Optional[str] = None


class ZZPMatchInvoiceResponse(BaseModel):
    """Response after matching a transaction to an invoice."""
    transaction_id: UUID
    invoice_id: UUID
    invoice_number: str
    amount_matched_cents: int
    invoice_new_status: str
    invoice_amount_paid_cents: int
    invoice_total_cents: int
    message: str


class ZZPUnmatchResponse(BaseModel):
    """Response after unmatching a transaction from an invoice."""
    transaction_id: UUID
    invoice_id: UUID
    invoice_number: str
    amount_unmatched_cents: int
    invoice_new_status: str
    invoice_amount_paid_cents: int
    message: str


class ZZPBankTransactionMatchResponse(BaseModel):
    """Schema for a bank transaction match audit record."""
    id: UUID
    bank_transaction_id: UUID
    invoice_id: UUID
    invoice_number: str
    amount_cents: int
    match_type: str  # manual, auto_amount, auto_reference
    confidence_score: Optional[int] = None
    notes: Optional[str] = None
    created_at: datetime
    user_id: Optional[UUID] = None
    
    class Config:
        from_attributes = True


class ZZPBankTransactionMatchListResponse(BaseModel):
    """Schema for list of transaction matches."""
    matches: List[ZZPBankTransactionMatchResponse]
    total: int


# ============================================================================
# AI Insights Schemas
# ============================================================================

class InsightType(str, Enum):
    """Types of AI-generated insights."""
    INVOICE_OVERDUE = "invoice_overdue"
    INVOICE_FOLLOWUP = "invoice_followup"
    UNBILLED_HOURS = "unbilled_hours"
    BTW_DEADLINE = "btw_deadline"
    MISSING_PROFILE = "missing_profile"
    NO_RECENT_ACTIVITY = "no_recent_activity"


class InsightSeverity(str, Enum):
    """Severity level of an insight."""
    ACTION_NEEDED = "action_needed"  # Red - requires immediate attention
    SUGGESTION = "suggestion"        # Yellow - recommended action
    INFO = "info"                    # Blue - informational


class InsightAction(BaseModel):
    """Suggested action for an insight."""
    type: str = Field(..., description="Action type identifier")
    label: str = Field(..., description="Human-readable action button label")
    route: Optional[str] = Field(None, description="Route to navigate to")
    params: Optional[dict] = Field(None, description="Parameters for the action")


class ZZPInsight(BaseModel):
    """
    A single AI-generated insight for the ZZP user.
    
    AI Logic Rules (transparent, not black-box):
    - Insights are generated from explicit business rules
    - Each insight explains WHY it was generated
    - User can always dismiss or take alternative action
    """
    id: str = Field(..., description="Unique insight identifier")
    type: InsightType
    severity: InsightSeverity
    
    # What the user sees
    title: str = Field(..., description="Short title (e.g., 'Invoice overdue')")
    description: str = Field(..., description="Detailed description of the insight")
    
    # AI Transparency: explain WHY this insight was generated
    reason: str = Field(..., description="Explanation of why AI generated this insight")
    
    # Suggested action
    action: Optional[InsightAction] = None
    
    # Related data
    related_id: Optional[str] = Field(None, description="ID of related entity (invoice, customer, etc.)")
    related_type: Optional[str] = Field(None, description="Type of related entity")
    amount_cents: Optional[int] = Field(None, description="Related amount in cents")
    
    # Timing
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # User can dismiss
    dismissible: bool = True


class ZZPInsightsResponse(BaseModel):
    """Response containing all AI insights for a ZZP user."""
    insights: List[ZZPInsight]
    total_action_needed: int = Field(..., description="Count of ACTION_NEEDED insights")
    total_suggestions: int = Field(..., description="Count of SUGGESTION insights")
    generated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # AI Transparency
    ai_model_version: str = Field(default="rules-v1", description="Version of AI rules used")


# ============================================================================
# Quote (Offerte) Schemas
# ============================================================================

class QuoteStatus(str, Enum):
    """Quote status values."""
    DRAFT = "draft"
    SENT = "sent"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    EXPIRED = "expired"
    CONVERTED = "converted"


class QuoteLineCreate(BaseModel):
    """Schema for creating a quote line."""
    description: str = Field(..., min_length=1, max_length=1000)
    quantity: float = Field(default=1.0, gt=0)
    unit_price_cents: int = Field(..., ge=0)
    vat_rate: float = Field(default=21.0, ge=0, le=100)


class QuoteLineUpdate(BaseModel):
    """Schema for updating a quote line."""
    description: Optional[str] = Field(None, min_length=1, max_length=1000)
    quantity: Optional[float] = Field(None, gt=0)
    unit_price_cents: Optional[int] = Field(None, ge=0)
    vat_rate: Optional[float] = Field(None, ge=0, le=100)


class QuoteLineResponse(BaseModel):
    """Schema for quote line response."""
    id: UUID
    quote_id: UUID
    line_number: int
    description: str
    quantity: float
    unit_price_cents: int
    vat_rate: float
    vat_amount_cents: int
    line_total_cents: int
    
    class Config:
        from_attributes = True


class QuoteCreate(BaseModel):
    """Schema for creating a quote."""
    customer_id: UUID
    issue_date: str = Field(..., pattern=r'^\d{4}-\d{2}-\d{2}$', description="Format: YYYY-MM-DD")
    valid_until: Optional[str] = Field(None, pattern=r'^\d{4}-\d{2}-\d{2}$', description="Format: YYYY-MM-DD")
    title: Optional[str] = Field(None, max_length=255)
    notes: Optional[str] = Field(None, max_length=2000)
    terms: Optional[str] = Field(None, max_length=5000)
    lines: List[QuoteLineCreate] = Field(..., min_length=1)


class QuoteUpdate(BaseModel):
    """Schema for updating a quote."""
    customer_id: Optional[UUID] = None
    issue_date: Optional[str] = Field(None, pattern=r'^\d{4}-\d{2}-\d{2}$')
    valid_until: Optional[str] = Field(None, pattern=r'^\d{4}-\d{2}-\d{2}$')
    title: Optional[str] = Field(None, max_length=255)
    notes: Optional[str] = Field(None, max_length=2000)
    terms: Optional[str] = Field(None, max_length=5000)
    lines: Optional[List[QuoteLineCreate]] = None  # Full replacement if provided


class QuoteStatusUpdate(BaseModel):
    """Schema for updating quote status."""
    status: QuoteStatus


class QuoteResponse(BaseModel):
    """Schema for quote response."""
    id: UUID
    administration_id: UUID
    customer_id: UUID
    quote_number: str
    status: str
    issue_date: str
    valid_until: Optional[str] = None
    invoice_id: Optional[UUID] = None
    
    # Seller snapshot
    seller_company_name: Optional[str] = None
    seller_trading_name: Optional[str] = None
    seller_address_street: Optional[str] = None
    seller_address_postal_code: Optional[str] = None
    seller_address_city: Optional[str] = None
    seller_address_country: Optional[str] = None
    seller_kvk_number: Optional[str] = None
    seller_btw_number: Optional[str] = None
    seller_iban: Optional[str] = None
    seller_email: Optional[str] = None
    seller_phone: Optional[str] = None
    
    # Customer snapshot
    customer_name: Optional[str] = None
    customer_address_street: Optional[str] = None
    customer_address_postal_code: Optional[str] = None
    customer_address_city: Optional[str] = None
    customer_address_country: Optional[str] = None
    customer_kvk_number: Optional[str] = None
    customer_btw_number: Optional[str] = None
    
    # Totals
    subtotal_cents: int
    vat_total_cents: int
    total_cents: int
    
    # Content
    title: Optional[str] = None
    notes: Optional[str] = None
    terms: Optional[str] = None
    
    # Timestamps
    created_at: datetime
    updated_at: datetime
    
    # Lines
    lines: List[QuoteLineResponse] = []
    
    class Config:
        from_attributes = True


class QuoteListResponse(BaseModel):
    """Schema for list of quotes."""
    quotes: List[QuoteResponse]
    total: int
    total_amount_cents: int
    stats: Optional[dict] = None  # Status counts


class QuoteConvertToInvoiceResponse(BaseModel):
    """Response when converting a quote to an invoice."""
    quote: QuoteResponse
    invoice_id: UUID
    invoice_number: str
