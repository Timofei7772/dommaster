# models/work.py
import uuid
from sqlalchemy import String, Float, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database_base import Base


class Work(Base):
    __tablename__ = "works"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    code: Mapped[str] = mapped_column(String(50), unique=True)
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    category: Mapped[str] = mapped_column(String(200))
    subcategory: Mapped[str | None] = mapped_column(String(200))
    unit: Mapped[str] = mapped_column(String(20), default="м²")
    base_price: Mapped[float] = mapped_column(Float, default=0.0)
    labor_cost: Mapped[float] = mapped_column(Float, default=0.0)
    time_norm_hours: Mapped[float | None] = mapped_column(Float)  # норма времени
    description: Mapped[str | None] = mapped_column(String(2000))

    work_materials: Mapped[list["WorkMaterial"]] = relationship(
        back_populates="work", lazy="selectin", cascade="all, delete-orphan"
    )


class WorkMaterial(Base):
    __tablename__ = "work_materials"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    work_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("works.id"), nullable=False
    )
    material_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("materials.id"), nullable=False
    )
    consumption_rate: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str] = mapped_column(String(20), default="шт")
    is_primary: Mapped[bool] = mapped_column(default=True)

    work: Mapped["Work"] = relationship(back_populates="work_materials", lazy="selectin")
    material: Mapped["Material"] = relationship(lazy="selectin")
