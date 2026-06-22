"""
Модели для проектов и объектов
"""

from sqlalchemy import Column, Integer, String, Float, Date, DateTime, ForeignKey, Text, Enum, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum

from app.database import Base


class ProjectStatus(str, enum.Enum):
    """Статусы проекта"""
    PLANNING = "planning"
    IN_PROGRESS = "in_progress"
    ON_HOLD = "on_hold"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class Project(Base):
    """Проект (группа объектов)"""
    __tablename__ = "projects"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Основная информация
    code = Column(String(50), unique=True, index=True, comment="Код проекта")
    name = Column(String(500), nullable=False, comment="Наименование проекта")
    description = Column(Text, comment="Описание")
    
    # Заказчик (legacy поля сохранены для совместимости)
    customer_name = Column(String(500))
    customer_contact = Column(String(200))

    # Связь с клиентом (ERP)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=True)
    
    # Связь с компанией
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    
    # Статус
    status = Column(Enum(ProjectStatus), default=ProjectStatus.PLANNING)
    
    # Даты
    planned_start = Column(Date, comment="Планируемое начало")
    planned_end = Column(Date, comment="Планируемое окончание")
    actual_start = Column(Date, comment="Фактическое начало")
    actual_end = Column(Date, comment="Фактическое окончание")
    
    # Бюджет
    budget = Column(Float, default=0.0, comment="Бюджет проекта")
    spent = Column(Float, default=0.0, comment="Израсходовано")
    
    # Системные
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Связи
    objects = relationship("ProjectObject", back_populates="project", cascade="all, delete-orphan")
    contracts = relationship("Contract", backref="project")
    estimates = relationship("Estimate", backref="project")
    client = relationship("Client", back_populates="projects")
    company = relationship("Company", back_populates="projects")
    stages = relationship("WorkStage", back_populates="project", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="project", cascade="all, delete-orphan")
    photos = relationship("PhotoReport", back_populates="project", cascade="all, delete-orphan")
    requests = relationship("CRMRequest", back_populates="project", cascade="all, delete-orphan")


class ProjectObject(Base):
    """Объект строительства"""
    __tablename__ = "project_objects"
    
    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    
    # Основная информация
    code = Column(String(50), index=True, comment="Код объекта")
    name = Column(String(500), nullable=False, comment="Наименование объекта")
    
    # Адрес
    address = Column(Text, comment="Адрес")
    
    # Характеристики
    object_type = Column(String(100), comment="Тип объекта")
    area = Column(Float, comment="Площадь, м²")
    floors = Column(Integer, comment="Этажность")
    
    # Статус
    status = Column(Enum(ProjectStatus), default=ProjectStatus.PLANNING)
    
    # Связи
    project = relationship("Project", back_populates="objects")
    estimates = relationship("Estimate", backref="object")
