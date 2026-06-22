"""
Модели для графика платежей по проектам
"""

from sqlalchemy import Column, Integer, String, Float, Date, ForeignKey, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.database import Base


class Payment(Base):
    """Платеж по проекту"""
    __tablename__ = "project_payments"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    description = Column(String(1000), nullable=False, comment="Описание платежа / этап")
    
    # Плановые реквизиты
    planned_date = Column(Date, nullable=False, comment="Планируемая дата платежа")
    planned_amount = Column(Float, default=0.0, comment="Планируемая сумма")
    
    # Фактические реквизиты
    actual_date = Column(Date, nullable=True, comment="Фактическая дата платежа")
    actual_amount = Column(Float, default=0.0, comment="Фактическая сумма")
    
    # Статус: planned / paid / delayed
    status = Column(String(50), default="planned", comment="Статус платежа")
    
    paid_at = Column(DateTime(timezone=True), nullable=True, comment="Когда платеж отмечен как полученный")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Связи
    project = relationship("Project", back_populates="payments")
