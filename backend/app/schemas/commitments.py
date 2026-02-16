from datetime import date, datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, model_validator

CommitmentTypeLiteral = Literal["lease", "loan", "subscription"]
RecurringFrequencyLiteral = Literal["monthly", "yearly"]
EndDateStatusLiteral = Literal["active", "ending_soon", "ended", "unknown"]


class CommitmentCreate(BaseModel):
    type: CommitmentTypeLiteral
    name: str = Field(..., min_length=2, max_length=255)
    amount_cents: int = Field(..., gt=0)
    monthly_payment_cents: Optional[int] = Field(None, gt=0)
    principal_amount_cents: Optional[int] = Field(None, gt=0)
    interest_rate: Optional[float] = Field(None, ge=0, le=100)
    recurring_frequency: Optional[RecurringFrequencyLiteral] = None
    start_date: date
    end_date: Optional[date] = None
    contract_term_months: Optional[int] = Field(None, ge=1, le=600)
    renewal_date: Optional[date] = None
    btw_rate: Optional[float] = Field(None, ge=0, le=100)
    payment_day: Optional[int] = Field(None, ge=1, le=28)
    provider: Optional[str] = Field(None, max_length=255)
    contract_number: Optional[str] = Field(None, max_length=255)
    notice_period_days: Optional[int] = Field(None, ge=0, le=3650)
    auto_renew: bool = True

    @model_validator(mode="after")
    def validate_dates(self):
        if self.end_date and self.end_date < self.start_date:
            raise ValueError("Einddatum mag niet voor de startdatum liggen.")
        return self

    @model_validator(mode="after")
    def validate_type_requirements(self):
        if self.type in {"lease", "loan"} and self.principal_amount_cents is None:
            raise ValueError("Hoofdsom is verplicht voor lease en lening.")
        if self.type == "subscription" and self.recurring_frequency is None:
            raise ValueError("Frequentie is verplicht voor abonnementen.")
        return self


class CommitmentUpdate(BaseModel):
    type: Optional[CommitmentTypeLiteral] = None
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    amount_cents: Optional[int] = Field(None, gt=0)
    monthly_payment_cents: Optional[int] = Field(None, gt=0)
    principal_amount_cents: Optional[int] = Field(None, gt=0)
    interest_rate: Optional[float] = Field(None, ge=0, le=100)
    recurring_frequency: Optional[RecurringFrequencyLiteral] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    contract_term_months: Optional[int] = Field(None, ge=1, le=600)
    renewal_date: Optional[date] = None
    btw_rate: Optional[float] = Field(None, ge=0, le=100)
    payment_day: Optional[int] = Field(None, ge=1, le=28)
    provider: Optional[str] = Field(None, max_length=255)
    contract_number: Optional[str] = Field(None, max_length=255)
    notice_period_days: Optional[int] = Field(None, ge=0, le=3650)
    auto_renew: Optional[bool] = None


class CommitmentResponse(BaseModel):
    id: UUID
    administration_id: UUID
    type: CommitmentTypeLiteral
    name: str
    amount_cents: int
    monthly_payment_cents: Optional[int]
    principal_amount_cents: Optional[int]
    interest_rate: Optional[float]
    recurring_frequency: Optional[RecurringFrequencyLiteral]
    start_date: date
    end_date: Optional[date]
    contract_term_months: Optional[int]
    renewal_date: Optional[date]
    next_due_date: Optional[date]
    btw_rate: Optional[float]
    payment_day: Optional[int]
    provider: Optional[str]
    contract_number: Optional[str]
    notice_period_days: Optional[int]
    auto_renew: bool
    paid_to_date_cents: Optional[int]
    remaining_balance_cents: Optional[int]
    computed_end_date: Optional[date]
    end_date_status: EndDateStatusLiteral
    created_at: datetime
    updated_at: datetime


class CommitmentListResponse(BaseModel):
    commitments: list[CommitmentResponse]
    total: int


class AmortizationRow(BaseModel):
    month_index: int
    due_date: date
    payment_cents: int
    interest_cents: int
    principal_cents: int
    remaining_balance_cents: int


class CommitmentAlert(BaseModel):
    code: Literal["subscription_renewal", "lease_loan_ending", "monthly_threshold"]
    severity: Literal["info", "warning"]
    message: str


class CommitmentOverviewResponse(BaseModel):
    monthly_total_cents: int
    upcoming_total_cents: int
    warning_count: int
    by_type: dict[str, int]
    upcoming: list[CommitmentResponse]
    alerts: list[CommitmentAlert]
    threshold_cents: int


class CommitmentSuggestion(BaseModel):
    bank_transaction_id: UUID
    booking_date: date
    amount_cents: int
    description: str
    confidence: float


class CommitmentSuggestionsResponse(BaseModel):
    suggestions: list[CommitmentSuggestion]
