"""
Модели для журнала заявок и задач (Requests / Tickets Module)
"""

from sqlalchemy import Column, Integer, String, Date, Text, ForeignKey, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.database import Base


class CRMRequest(Base):
    """Заявка или задача по проекту"""
    __tablename__ = "crm_requests"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True, comment="Связанный проект")
    
    title = Column(String(500), nullable=False, comment="Заголовок заявки")
    description = Column(Text, nullable=True, comment="Описание проблемы/задачи")
    
    # Статус: New / In Progress / Review / Done
    status = Column(String(50), default="New", comment="Статус заявки")
    
    # Приоритет: Low / Medium / High
    priority = Column(String(50), default="Medium", comment="Приоритет")
    
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True, index=True, comment="Назначенный исполнитель")
    deadline = Column(Date, nullable=True, comment="Срок выполнения")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Связи
    project = relationship("Project", back_populates="requests")
    assignee = relationship("User", foreign_keys=[assigned_to])
