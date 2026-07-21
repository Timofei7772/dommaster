"""
Модель строительной компании (организации)
"""

from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from app.database import Base


class Company(Base):
    """Строительная компания"""
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(500), nullable=False, comment="Название компании")
    logo = Column(String(1000), nullable=True, comment="Путь к логотипу компании")
    bank_details = Column(Text, nullable=True, comment="Банковские реквизиты (для QR кодов)")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Связи
    users = relationship("User", back_populates="company", cascade="all, delete-orphan")
    projects = relationship("Project", back_populates="company")
    clients = relationship("Client", back_populates="company_owner")
    leads = relationship("Lead", back_populates="company", cascade="all, delete-orphan")
