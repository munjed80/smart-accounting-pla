from datetime import datetime
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel, Field

from app.models.administration import MemberRole


class AdministrationBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    kvk_number: Optional[str] = Field(None, max_length=50)
    btw_number: Optional[str] = Field(None, max_length=50)


class AdministrationCreate(AdministrationBase):
    pass


class AdministrationUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    kvk_number: Optional[str] = Field(None, max_length=50)
    btw_number: Optional[str] = Field(None, max_length=50)


class AdministrationMemberResponse(BaseModel):
    id: UUID
    user_id: UUID
    user_email: str
    user_full_name: str
    role: MemberRole
    created_at: datetime

    class Config:
        from_attributes = True


class AdministrationResponse(AdministrationBase):
    id: UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AdministrationDetailResponse(AdministrationResponse):
    members: List[AdministrationMemberResponse] = []


class AddMemberRequest(BaseModel):
    user_email: EmailStr
    role: MemberRole = MemberRole.MEMBER


from pydantic import EmailStr
