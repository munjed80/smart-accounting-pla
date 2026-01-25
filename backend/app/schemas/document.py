from datetime import datetime
from typing import Optional, Dict, Any
from uuid import UUID
from pydantic import BaseModel

from app.models.document import DocumentStatus


class DocumentUploadResponse(BaseModel):
    message: str
    document_id: UUID


class DocumentResponse(BaseModel):
    id: UUID
    administration_id: UUID
    original_filename: str
    mime_type: str
    file_size: int
    status: DocumentStatus
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    transaction_id: Optional[UUID] = None

    class Config:
        from_attributes = True


class DocumentDetailResponse(DocumentResponse):
    extracted_fields: Dict[str, Any] = {}
