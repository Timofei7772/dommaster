"""
Модели для этапов работ (График работ)
"""

from sqlalchemy import Column, Integer, String, Date, ForeignKey, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.database import Base
from app.shared.enums import WorkStageStatus


class WorkStage(Base):
    """Этап строительных работ"""
    __tablename__ = "work_stages"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    name = Column(String(500), nullable=False, comment="Наименование этапа")
    executor_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True, comment="Ответственный исполнитель")
    
    # Сроки
    start_date = Column(Date, nullable=False, comment="Дата начала")
    end_date = Column(Date, nullable=False, comment="Дата окончания")
    
    # Значения остаются строками для совместимости с установленными SQLite БД.
    status = Column(
        String(50),
        default=WorkStageStatus.PENDING.value,
        nullable=False,
        comment="Статус этапа технадзора",
    )
    comments_json = Column(String(4000), default="[]", comment="Комментарии заказчика по этапу (JSON список)")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Связи
    project = relationship("Project", back_populates="stages")
    executor = relationship("User", foreign_keys=[executor_id])
    photos = relationship("PhotoReport", back_populates="stage")
