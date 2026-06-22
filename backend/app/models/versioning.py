"""
Версионирование смет и аудит изменений
"""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, JSON
from sqlalchemy.sql import func

from app.database import Base


class EstimateVersion(Base):
    """Версия сметы"""
    __tablename__ = "estimate_versions"

    id = Column(Integer, primary_key=True, index=True)
    estimate_id = Column(Integer, ForeignKey("estimates.id"), nullable=False, index=True)

    version_number = Column(Integer, nullable=False, comment="Номер версии")
    changes = Column(Text, comment="Описание изменений")
    snapshot = Column(JSON, comment="Снапшот данных сметы на момент версии")

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)


class AuditLog(Base):
    """Журнал аудита изменений"""
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)

    entity_type = Column(String(100), nullable=False, index=True, comment="Тип сущности (estimate, project, ...)")
    entity_id = Column(Integer, nullable=False, index=True, comment="ID сущности")
    action = Column(String(50), nullable=False, comment="Действие: create/update/delete")

    old_value = Column(JSON, comment="Старое значение")
    new_value = Column(JSON, comment="Новое значение")
    changed_fields = Column(Text, comment="Список изменённых полей")

    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    ip_address = Column(String(45), comment="IP-адрес")

    created_at = Column(DateTime(timezone=True), server_default=func.now())
