"""
Модели для хранения фотоотчётов по проектам
"""

from sqlalchemy import Column, Integer, String, ForeignKey, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.database import Base


class PhotoReport(Base):
    """Фотоотчёт по проекту/этапу"""
    __tablename__ = "photo_reports"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    stage_id = Column(Integer, ForeignKey("work_stages.id"), nullable=True, index=True)
    
    url = Column(String(1000), nullable=False, comment="Путь к файлу фотографии на сервере")
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=True, index=True, comment="Кто загрузил")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Связи
    project = relationship("Project", back_populates="photos")
    stage = relationship("WorkStage", back_populates="photos")
    uploader = relationship("User")
