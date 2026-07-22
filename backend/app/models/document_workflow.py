"""Persistent revisions, immutable document snapshots, and audit events."""

from sqlalchemy import (
    JSON,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class EstimateRevision(Base):
    __tablename__ = "estimate_revisions"
    __table_args__ = (
        UniqueConstraint(
            "estimate_id",
            "revision_number",
            name="uq_estimate_revisions_estimate_revision",
        ),
        UniqueConstraint(
            "company_id",
            "idempotency_key",
            name="uq_estimate_revisions_company_idempotency",
        ),
        Index("ix_estimate_revisions_company_id", "company_id"),
        Index("ix_estimate_revisions_estimate_id", "estimate_id"),
    )

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    estimate_id = Column(Integer, ForeignKey("estimates.id"), nullable=False)
    revision_number = Column(Integer, nullable=False)
    payload_json = Column(JSON, nullable=False)
    payload_hash = Column(String(64), nullable=False)
    idempotency_key = Column(String(200), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    estimate = relationship("Estimate")
    company = relationship("Company")
    snapshots = relationship(
        "DocumentSnapshot",
        back_populates="estimate_revision",
        cascade="all, delete-orphan",
    )


class DocumentSnapshot(Base):
    __tablename__ = "document_snapshots"
    __table_args__ = (
        UniqueConstraint(
            "document_type",
            "entity_id",
            "version",
            name="uq_document_snapshots_entity_version",
        ),
        UniqueConstraint(
            "company_id",
            "idempotency_key",
            name="uq_document_snapshots_company_idempotency",
        ),
        Index("ix_document_snapshots_company_id", "company_id"),
        Index("ix_document_snapshots_revision_id", "estimate_revision_id"),
        Index("ix_document_snapshots_entity", "document_type", "entity_id"),
        Index("ix_document_snapshots_status", "status"),
    )

    id = Column(Integer, primary_key=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    estimate_revision_id = Column(
        Integer,
        ForeignKey("estimate_revisions.id"),
        nullable=False,
    )
    document_type = Column(String(50), nullable=False)
    entity_id = Column(Integer, nullable=False)
    version = Column(Integer, nullable=False, default=1)
    status = Column(String(30), nullable=False, default="draft")
    payload_json = Column(JSON, nullable=False)
    payload_hash = Column(String(64), nullable=False)
    template_version = Column(String(100), nullable=True)
    idempotency_key = Column(String(200), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    estimate_revision = relationship("EstimateRevision", back_populates="snapshots")
    audit_events = relationship(
        "DocumentAuditEvent",
        back_populates="snapshot",
        cascade="all, delete-orphan",
    )


class DocumentAuditEvent(Base):
    __tablename__ = "document_audit_events"
    __table_args__ = (
        Index("ix_document_audit_events_snapshot_id", "snapshot_id"),
        Index("ix_document_audit_events_company_id", "company_id"),
    )

    id = Column(Integer, primary_key=True)
    snapshot_id = Column(
        Integer,
        ForeignKey("document_snapshots.id"),
        nullable=False,
    )
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    previous_status = Column(String(30), nullable=True)
    new_status = Column(String(30), nullable=False)
    reason = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    snapshot = relationship("DocumentSnapshot", back_populates="audit_events")
