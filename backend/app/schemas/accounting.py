from datetime import datetime
from typing import Optional
from uuid import UUID
from decimal import Decimal
from pydantic import BaseModel


class ChartOfAccountBase(BaseModel):
    account_code: str
    account_name: str
    account_type: str  # ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
    parent_id: Optional[UUID] = None


class ChartOfAccountCreate(ChartOfAccountBase):
    pass


class ChartOfAccountResponse(ChartOfAccountBase):
    id: UUID
    administration_id: UUID
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class VatCodeResponse(BaseModel):
    id: UUID
    code: str
    name: str
    rate: Decimal
    is_active: bool

    class Config:
        from_attributes = True
