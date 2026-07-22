"""
Модель для М-29 (Материальный отчёт)
"""
from sqlalchemy import Column, Integer, String, Float, Date, ForeignKey, DateTime, Text
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base


class M29Report(Base):
    """Материальный отчёт М-29"""
    __tablename__ = "m29_reports"

    id = Column(Integer, primary_key=True, index=True)
    report_number = Column(String(50), nullable=False, comment="Номер ведомости")
    report_date = Column(Date, nullable=False, comment="Дата составления")
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, comment="Связанный проект")
    period_start = Column(Date, nullable=True, comment="Начало отчётного периода")
    period_end = Column(Date, nullable=True, comment="Конец отчётного периода")
    responsible_name = Column(String(200), nullable=True, comment="Ответственное лицо")
    total_norm_cost = Column(Float, default=0.0, comment="Нормативный расход (сумма)")
    total_actual_cost = Column(Float, default=0.0, comment="Фактический расход (сумма)")
    status = Column(String(50), default="draft", comment="Статус: draft, confirmed")
    notes = Column(Text, nullable=True, comment="Примечания")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("Project", backref="m29_reports")
