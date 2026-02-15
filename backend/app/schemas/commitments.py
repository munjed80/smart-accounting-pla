from datetime import date, datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

CommitmentTypeLiteral = Literal["lease", "loan", "subscription"]
RecurringFrequencyLiteral = Literal["monthly", "yearly"]


class CommitmentCreate(BaseModel):
    type: CommitmentTypeLiteral
    name: str = Field(..., min_length=2, max_length=255)
    amount_cents: int = Field(..., ge=0)
    monthly_payment_cents: Optional[int] = Field(None, ge=0)
    principal_amount_cents: Optional[int] = Field(None, ge=0)
    interest_rate: Optional[float] = Field(None, ge=0, le=100)
    recurring_frequency: Optional[RecurringFrequencyLiteral] = None
    start_date: date
    end_date: Optional[date] = None
    contract_term_months: Optional[int] = Field(None, ge=1, le=600)
    renewal_date: Optional[date] = None
    btw_rate: Optional[float] = Field(None, ge=0, le=100)

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
    amount_cents: Optional[int] = Field(None, ge=0)
    monthly_payment_cents: Optional[int] = Field(None, ge=0)
    principal_amount_cents: Optional[int] = Field(None, ge=0)
    interest_rate: Optional[float] = Field(None, ge=0, le=100)
    recurring_frequency: Optional[RecurringFrequencyLiteral] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    contract_term_months: Optional[int] = Field(None, ge=1, le=600)
    renewal_date: Optional[date] = None
    btw_rate: Optional[float] = Field(None, ge=0, le=100)


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
    btw_rate: Optional[float]
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


class CommitmentOverviewResponse(BaseModel):
    monthly_total_cents: int
    upcoming_total_cents: int
    warning_count: int
    by_type: dict[str, int]
    upcoming: list[CommitmentResponse]


class CommitmentSuggestion(BaseModel):
    bank_transaction_id: UUID
    booking_date: date
    amount_cents: int
    description: str
    confidence: float


class CommitmentSuggestionsResponse(BaseModel):
    suggestions: list[CommitmentSuggestion]
