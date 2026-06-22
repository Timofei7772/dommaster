"""
Модели для КС-3 (Справка о стоимости выполненных работ)
"""

from sqlalchemy import Column, Integer, String, Float, Date, DateTime, ForeignKey, Text, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum

from app.database import Base


class KS3Status(str, enum.Enum):
    """Статус справки КС-3"""
    DRAFT = "draft"
    SUBMITTED = "submitted"
    SIGNED = "signed"
    PAID = "paid"


class KS3Certificate(Base):
    """Справка о стоимости выполненных работ (КС-3)"""
    __tablename__ = "ks3_certificates"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Номер и дата
    number = Column(String(50), nullable=False, index=True)
    certificate_date = Column(Date, nullable=False)
    
    # Отчётный период
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    
    # Связи
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=True)
    
    # Стороны
    customer = Column(String(500))
    contractor = Column(String(500))
    
    # Объект
    object_name = Column(String(500))
    
    # Суммы (накопительным итогом)
    total_contract = Column(Float, default=0.0, comment="Всего по договору")
    total_from_start = Column(Float, default=0.0, comment="С начала строительства")
    total_from_year_start = Column(Float, default=0.0, comment="С начала года")
    total_current_period = Column(Float, default=0.0, comment="За отчётный период")
    
    # НДС
    vat_amount = Column(Float, default=0.0)
    total_with_vat = Column(Float, default=0.0)
    
    # Статус
    status = Column(Enum(KS3Status, native_enum=False), default=KS3Status.DRAFT)
    
    # Даты
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    signed_at = Column(DateTime(timezone=True))
    
    # Связи
    items = relationship("KS3Item", back_populates="certificate", cascade="all, delete-orphan")


class KS3Item(Base):
    """Позиция справки КС-3 (связь с КС-2)"""
    __tablename__ = "ks3_items"
    
    id = Column(Integer, primary_key=True, index=True)
    certificate_id = Column(Integer, ForeignKey("ks3_certificates.id"), nullable=False)
    ks2_act_id = Column(Integer, ForeignKey("ks2_acts.id"), nullable=False)
    
    # Номер строки
    item_number = Column(String(20))
    order_index = Column(Integer, default=0)
    
    # Наименование работ и затрат
    name = Column(String(1000), nullable=False)
    
    # Суммы
    total_from_start = Column(Float, default=0.0)
    total_from_year_start = Column(Float, default=0.0)
    total_current_period = Column(Float, default=0.0)
    
    # Связи
    certificate = relationship("KS3Certificate", back_populates="items")
    ks2_act = relationship("KS2Act", back_populates="ks3_items")
