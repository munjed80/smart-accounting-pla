from datetime import date
from decimal import Decimal
from uuid import UUID
from pydantic import BaseModel, Field, field_validator, model_validator


class CreditLineRequest(BaseModel):
    invoice_line_id: UUID
    quantity: Decimal = Field(gt=0, max_digits=12, decimal_places=3)


class CreditNoteRequest(BaseModel):
    issue_date: date
    reason: str = Field(min_length=3, max_length=1000)
    lines: list[CreditLineRequest] = Field(min_length=1, max_length=100)

    @field_validator("reason")
    @classmethod
    def trim_reason(cls, value):
        value = value.strip()
        if len(value) < 3:
            raise ValueError("Geef een reden voor de prijsvermindering of retour.")
        return value

    @model_validator(mode="after")
    def unique_lines(self):
        if len({line.invoice_line_id for line in self.lines}) != len(self.lines):
            raise ValueError("Kies iedere factuurregel maximaal één keer.")
        return self


class RefundRequest(BaseModel):
    refund_date: date
    amount_cents: int = Field(gt=0, strict=True)
    reference: str = Field(min_length=3, max_length=255)

    @field_validator("reference")
    @classmethod
    def trim_reference(cls, value):
        value = value.strip()
        if len(value) < 3:
            raise ValueError("Vul een betalingskenmerk in.")
        return value
