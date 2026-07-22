"""
Модели пользователей
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.database import Base
from app.shared.enums import UserRole


class User(Base):
    """Пользователь системы"""
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Аутентификация
    email = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    refresh_token = Column(String(500), nullable=True, comment="Токен обновления JWT сессии")
    
    # Профиль
    full_name = Column(String(200), nullable=False)
    phone = Column(String(50))
    position = Column(String(100), comment="Должность")
    
    # Роль и статус
    role = Column(Enum(UserRole), default=UserRole.ESTIMATOR)
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    
    # Связь с компанией
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    
    # Настройки
    settings_json = Column(String(2000), default="{}", comment="Пользовательские настройки")
    
    # Даты
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_login = Column(DateTime(timezone=True))

    # Связи
    company = relationship("Company", back_populates="users")
    assigned_leads = relationship(
        "Lead",
        foreign_keys="Lead.assigned_to",
        back_populates="manager",
    )
