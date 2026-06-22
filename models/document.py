# models/document.py
import uuid
from datetime import datetime
import enum

from sqlalchemy import String, DateTime, ForeignKey, func, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database_base import Base


class DocumentType(str, enum.Enum):
    KP = "KP"
    CONTRACT = "CONTRACT"
    KS2 = "KS2"
    KS3 = "KS3"
    M29 = "M29"
    INVOICE = "INVOICE"
    ACT = "ACT"


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    estimate_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("estimates.id"), nullable=False
    )
    document_type: Mapped[DocumentType] = mapped_column(
        SAEnum(DocumentType), nullable=False
    )
    file_path: Mapped[str] = mapped_column(String(1000))
    file_name: Mapped[str] = mapped_column(String(500))
    file_size: Mapped[int | None] = mapped_column()
    version: Mapped[int] = mapped_column(default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    estimate: Mapped["Estimate"] = relationship(
        back_populates="documents", lazy="selectin"
    )
