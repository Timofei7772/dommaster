# models/project.py
import uuid
from datetime import datetime, date

from sqlalchemy import String, DateTime, Date, Float, ForeignKey, func, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from database_base import Base


class ProjectStatus(str, enum.Enum):
    DRAFT = "draft"
    ESTIMATION = "estimation"
    APPROVED = "approved"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    client_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id")
    )
    address: Mapped[str | None] = mapped_column(String(500))
    city: Mapped[str | None] = mapped_column(String(100))
    area: Mapped[float | None] = mapped_column(Float)
    object_type: Mapped[str | None] = mapped_column(String(100))  # квартира, дом, офис
    repair_type: Mapped[str | None] = mapped_column(String(100))  # косметический, капитальный, дизайнерский
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[ProjectStatus] = mapped_column(
        SAEnum(ProjectStatus), default=ProjectStatus.DRAFT
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    client: Mapped["Client | None"] = relationship(
        back_populates="projects", lazy="selectin"
    )
    estimates: Mapped[list["Estimate"]] = relationship(
        back_populates="project", lazy="selectin", cascade="all, delete-orphan"
    )
