# models/finance.py
import uuid
from datetime import datetime

from sqlalchemy import String, Float, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database_base import Base


class LaborPayment(Base):
    __tablename__ = "labor_payments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    estimate_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("estimate_items.id"), nullable=False, unique=True
    )
    master_price: Mapped[float] = mapped_column(Float, default=0.0)
    brigade_price: Mapped[float] = mapped_column(Float, default=0.0)
    company_margin: Mapped[float] = mapped_column(Float, default=0.0)
    total_payment: Mapped[float] = mapped_column(Float, default=0.0)

    estimate_item: Mapped["EstimateItem"] = relationship(
        back_populates="labor_payment", lazy="selectin"
    )


class WorkProgress(Base):
    __tablename__ = "work_progress"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    estimate_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("estimate_items.id"), nullable=False, unique=True
    )
    planned_volume: Mapped[float] = mapped_column(Float, default=0.0)
    completed_volume: Mapped[float] = mapped_column(Float, default=0.0)
    remaining_volume: Mapped[float] = mapped_column(Float, default=0.0)
    percent_complete: Mapped[float] = mapped_column(Float, default=0.0)
    planned_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    planned_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    actual_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    actual_end: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    estimate_item: Mapped["EstimateItem"] = relationship(
        back_populates="work_progress", lazy="selectin"
    )


class ProjectFinance(Base):
    __tablename__ = "project_finance"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    estimate_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("estimates.id"), nullable=False, unique=True
    )
    labor_cost: Mapped[float] = mapped_column(Float, default=0.0)
    material_cost: Mapped[float] = mapped_column(Float, default=0.0)
    overhead_amount: Mapped[float] = mapped_column(Float, default=0.0)
    overhead_percent: Mapped[float] = mapped_column(Float, default=15.0)
    profit_amount: Mapped[float] = mapped_column(Float, default=0.0)
    profit_percent: Mapped[float] = mapped_column(Float, default=20.0)
    vat_amount: Mapped[float] = mapped_column(Float, default=0.0)
    vat_percent: Mapped[float] = mapped_column(Float, default=0.0)
    total_price: Mapped[float] = mapped_column(Float, default=0.0)
    margin: Mapped[float] = mapped_column(Float, default=0.0)
    margin_percent: Mapped[float] = mapped_column(Float, default=0.0)

    estimate: Mapped["Estimate"] = relationship(
        back_populates="finance", lazy="selectin"
    )
