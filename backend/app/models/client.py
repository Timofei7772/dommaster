"""
Модель клиентов
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class Client(Base):
    """Клиент / Заказчик"""
    __tablename__ = "clients"

    id = Column(Integer, primary_key=True, index=True)

    # Основная информация
    name = Column(String(500), nullable=False, index=True, comment="ФИО / Название компании")
    phone = Column(String(50), comment="Телефон")
    email = Column(String(200), comment="Email")
    company = Column(String(500), comment="Название организации")
    inn = Column(String(12), unique=True, nullable=True, index=True, comment="ИНН")
    kpp = Column(String(9), nullable=True, comment="КПП")

    # Юридический адрес
    legal_address = Column(Text, comment="Юридический адрес")
    actual_address = Column(Text, comment="Фактический адрес")

    # Банковские реквизиты
    bank_name = Column(String(500), comment="Банк")
    bik = Column(String(9), comment="БИК")
    checking_account = Column(String(20), comment="Расчётный счёт")
    corr_account = Column(String(20), comment="Корр. счёт")

    # Контактное лицо
    contact_person = Column(String(300), comment="Контактное лицо")
    contact_position = Column(String(200), comment="Должность")

    # Тип клиента
    client_type = Column(String(20), default="individual", comment="Тип: individual/company")

    # Источник лида
    lead_source = Column(String(100), comment="Источник: avito/profi/youdo/vk/telegram/direct")

    # Флаги
    is_active = Column(Boolean, default=True)

    # Заметки
    notes = Column(Text, comment="Заметки")

    # Даты
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Связи
    projects = relationship("Project", back_populates="client")
