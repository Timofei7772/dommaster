"""
Модели лицензирования коммерческой версии SmetaAI.
"""

from uuid import uuid4

from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class License(Base):
    """Коммерческая лицензия с поддержкой нескольких устройств."""

    __tablename__ = "licenses"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    license_key = Column(String(32), unique=True, index=True, nullable=False)
    license_type = Column(String(20), nullable=False)
    max_pcs = Column(Integer, nullable=False, default=1)

    client_name = Column(String(255), nullable=True)
    client_email = Column(String(255), nullable=True)

    issued_date = Column(DateTime(timezone=True), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    status = Column(String(20), nullable=False, default="active")

    features_json = Column(JSON, nullable=False, default=dict)
    public_key_id = Column(String(50), nullable=False, default="v1")
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    activations = relationship("LicenseActivation", back_populates="license", cascade="all, delete-orphan")
    audit_logs = relationship("LicenseAuditLog", back_populates="license", cascade="all, delete-orphan")

    def __init__(self, **kwargs):
        kwargs.setdefault("status", "active")
        kwargs.setdefault("max_pcs", 1)
        kwargs.setdefault("features_json", {})
        kwargs.setdefault("public_key_id", "v1")
        super().__init__(**kwargs)


class LicenseActivation(Base):
    """Привязка лицензии к устройству и слоту активации."""

    __tablename__ = "license_activations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    license_id = Column(String(36), ForeignKey("licenses.id", ondelete="CASCADE"), nullable=False, index=True)
    device_slot_id = Column(Integer, nullable=False)

    hardware_fingerprint = Column(String(64), nullable=False, index=True)
    hardware_components_json = Column(JSON, nullable=False, default=dict)
    device_name = Column(String(255), nullable=True)

    status = Column(String(20), nullable=False, default="active")
    activated_at = Column(DateTime(timezone=True), server_default=func.now())
    last_validated_at = Column(DateTime(timezone=True), nullable=True)
    deactivated_at = Column(DateTime(timezone=True), nullable=True)
    deactivation_reason = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    license = relationship("License", back_populates="activations")

    def __init__(self, **kwargs):
        kwargs.setdefault("status", "active")
        kwargs.setdefault("hardware_components_json", {})
        super().__init__(**kwargs)


class LicenseAuditLog(Base):
    """Аудит событий лицензирования и нарушений."""

    __tablename__ = "license_audit_log"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    license_id = Column(String(36), ForeignKey("licenses.id", ondelete="CASCADE"), nullable=True, index=True)
    event_type = Column(String(50), nullable=False, index=True)
    event_data = Column(JSON, nullable=False, default=dict)
    ip_address = Column(String(64), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    license = relationship("License", back_populates="audit_logs")

    def __init__(self, **kwargs):
        kwargs.setdefault("event_data", {})
        super().__init__(**kwargs)


__all__ = ["License", "LicenseActivation", "LicenseAuditLog"]
