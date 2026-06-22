# models/estimate.py
import uuid
from datetime import datetime
import enum

from sqlalchemy import (
    String, DateTime, Float, Integer, ForeignKey, Text,
    func, Enum as SAEnum,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database_base import Base


class EstimateStatus(str, enum.Enum):
    DRAFT = "draft"
    CALCULATED = "calculated"
    SENT = "sent"
    APPROVED = "approved"
    REJECTED = "rejected"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class Estimate(Base):
    __tablename__ = "estimates"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False
    )
    estimate_number: Mapped[str] = mapped_column(String(50), unique=True)
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[EstimateStatus] = mapped_column(
        SAEnum(EstimateStatus), default=EstimateStatus.DRAFT
    )
    total_works: Mapped[float] = mapped_column(Float, default=0.0)
    total_materials: Mapped[float] = mapped_column(Float, default=0.0)
    total_cost: Mapped[float] = mapped_column(Float, default=0.0)
    overhead_percent: Mapped[float] = mapped_column(Float, default=15.0)
    profit_percent: Mapped[float] = mapped_column(Float, default=20.0)
    vat_percent: Mapped[float] = mapped_column(Float, default=0.0)
    discount_percent: Mapped[float] = mapped_column(Float, default=0.0)
    final_price: Mapped[float] = mapped_column(Float, default=0.0)
    ai_generated: Mapped[bool] = mapped_column(default=False)
    ai_confidence: Mapped[float | None] = mapped_column(Float)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    project: Mapped["Project"] = relationship(
        back_populates="estimates", lazy="selectin"
    )
    sections: Mapped[list["EstimateSection"]] = relationship(
        back_populates="estimate", lazy="selectin",
        cascade="all, delete-orphan",
        order_by="EstimateSection.order_index",
    )
    items: Mapped[list["EstimateItem"]] = relationship(
        back_populates="estimate", lazy="selectin", cascade="all, delete-orphan"
    )
    versions: Mapped[list["EstimateVersion"]] = relationship(
        back_populates="estimate", lazy="selectin", cascade="all, delete-orphan"
    )
    finance: Mapped["ProjectFinance | None"] = relationship(
        back_populates="estimate", lazy="selectin", uselist=False
    )
    documents: Mapped[list["Document"]] = relationship(
        back_populates="estimate", lazy="selectin", cascade="all, delete-orphan"
    )


class EstimateSection(Base):
    __tablename__ = "estimate_sections"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    estimate_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("estimates.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    total_works: Mapped[float] = mapped_column(Float, default=0.0)
    total_materials: Mapped[float] = mapped_column(Float, default=0.0)
    total_cost: Mapped[float] = mapped_column(Float, default=0.0)

    estimate: Mapped["Estimate"] = relationship(
        back_populates="sections", lazy="selectin"
    )
    items: Mapped[list["EstimateItem"]] = relationship(
        back_populates="section", lazy="selectin", cascade="all, delete-orphan"
    )


class EstimateItem(Base):
    __tablename__ = "estimate_items"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    estimate_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("estimates.id"), nullable=False
    )
    section_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("estimate_sections.id")
    )
    work_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("works.id")
    )
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False, default="м²")
    quantity: Mapped[float] = mapped_column(Float, default=0.0)
    price_work: Mapped[float] = mapped_column(Float, default=0.0)
    price_material: Mapped[float] = mapped_column(Float, default=0.0)
    total_work: Mapped[float] = mapped_column(Float, default=0.0)
    total_material: Mapped[float] = mapped_column(Float, default=0.0)
    total_cost: Mapped[float] = mapped_column(Float, default=0.0)
    planned_volume: Mapped[float] = mapped_column(Float, default=0.0)
    completed_volume: Mapped[float] = mapped_column(Float, default=0.0)
    remaining_volume: Mapped[float] = mapped_column(Float, default=0.0)
    ai_suggested: Mapped[bool] = mapped_column(default=False)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    estimate: Mapped["Estimate"] = relationship(
        back_populates="items", lazy="selectin"
    )
    section: Mapped["EstimateSection | None"] = relationship(
        back_populates="items", lazy="selectin"
    )
    work: Mapped["Work | None"] = relationship(lazy="selectin")
    material_usage: Mapped[list["MaterialUsage"]] = relationship(
        back_populates="estimate_item", lazy="selectin", cascade="all, delete-orphan"
    )
    labor_payment: Mapped["LaborPayment | None"] = relationship(
        back_populates="estimate_item", lazy="selectin", uselist=False
    )
    work_progress: Mapped["WorkProgress | None"] = relationship(
        back_populates="estimate_item", lazy="selectin", uselist=False
    )


class EstimateVersion(Base):
    __tablename__ = "estimate_versions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    estimate_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("estimates.id"), nullable=False
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    changes: Mapped[dict | None] = mapped_column(JSONB)
    snapshot: Mapped[dict | None] = mapped_column(JSONB)  # полный снимок сметы
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    created_by: Mapped[str | None] = mapped_column(String(100))

    estimate: Mapped["Estimate"] = relationship(
        back_populates="versions", lazy="selectin"
    )
