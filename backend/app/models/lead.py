"""Persistent CRM lead model."""

import enum

from sqlalchemy import Column, DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class LeadStatus(str, enum.Enum):
    """Supported CRM funnel states."""

    NEW = "new"
    CONTACTED = "contacted"
    QUALIFIED = "qualified"
    PROPOSAL = "proposal"
    CONTRACT = "contract"
    LOST = "lost"


class Lead(Base):
    """A prospective customer owned by one construction company."""

    __tablename__ = "leads"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=True, index=True)

    name = Column(String(500), nullable=False, index=True)
    phone = Column(String(50), nullable=True, index=True)
    email = Column(String(200), nullable=True, index=True)
    description = Column(Text, nullable=True)
    address = Column(String(500), nullable=True)
    expected_budget = Column(Float, nullable=True)
    source = Column(String(100), nullable=False, default="manual")
    external_url = Column(String(1000), nullable=True)
    status = Column(
        Enum(LeadStatus),
        nullable=False,
        default=LeadStatus.NEW,
        index=True,
    )
    converted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    company = relationship("Company", back_populates="leads")
    manager = relationship(
        "User",
        foreign_keys=[assigned_to],
        back_populates="assigned_leads",
    )
    client = relationship("Client", back_populates="source_leads")
