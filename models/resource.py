# models/resource.py
import uuid
import enum
from datetime import datetime

from sqlalchemy import String, Float, DateTime, ForeignKey, func, Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database_base import Base


class ResourceType(str, enum.Enum):
    WORKER = "worker"
    EQUIPMENT = "equipment"
    MATERIAL = "material"
    TOOL = "tool"


class Resource(Base):
    __tablename__ = "resources"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[ResourceType] = mapped_column(
        SAEnum(ResourceType), default=ResourceType.WORKER
    )
    description: Mapped[str | None] = mapped_column(String(1000))
    unit: Mapped[str] = mapped_column(String(20), default="шт")
    quantity_total: Mapped[float] = mapped_column(Float, default=1.0)
    quantity_available: Mapped[float] = mapped_column(Float, default=1.0)
    cost_per_unit: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    schedule_entries: Mapped[list["Schedule"]] = relationship(
        back_populates="resource", lazy="selectin", cascade="all, delete-orphan"
    )
