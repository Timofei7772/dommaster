"""
Модели для договоров
"""

from sqlalchemy import Column, Integer, String, Float, Date, DateTime, ForeignKey, Text, Enum, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum

from app.database import Base


class ContractType(str, enum.Enum):
    """Типы договоров"""
    INDIVIDUAL = "individual"     # С физическим лицом
    LEGAL_ENTITY = "legal_entity" # С юридическим лицом
    ENTREPRENEUR = "entrepreneur"  # С ИП


class ContractStatus(str, enum.Enum):
    """Статусы договора"""
    DRAFT = "draft"
    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class Contract(Base):
    """Договор подряда"""
    __tablename__ = "contracts"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Номер и даты
    number = Column(String(50), nullable=False, index=True, comment="Номер договора")
    contract_date = Column(Date, nullable=False, comment="Дата договора")
    start_date = Column(Date, comment="Дата начала работ")
    end_date = Column(Date, comment="Дата окончания работ")
    
    # Тип и статус
    contract_type = Column(Enum(ContractType, native_enum=False), nullable=False)
    status = Column(Enum(ContractStatus, native_enum=False), default=ContractStatus.DRAFT)
    
    # Заказчик
    customer_name = Column(String(500), nullable=False, comment="Наименование/ФИО заказчика")
    customer_address = Column(Text, comment="Адрес заказчика")
    customer_inn = Column(String(20), comment="ИНН")
    customer_kpp = Column(String(20), comment="КПП")
    customer_phone = Column(String(50), comment="Телефон")
    customer_email = Column(String(100), comment="Email")
    customer_passport = Column(Text, comment="Паспортные данные (для физ. лиц)")
    
    # Банковские реквизиты заказчика
    customer_bank = Column(String(500))
    customer_bik = Column(String(20))
    customer_account = Column(String(30))
    customer_corr_account = Column(String(30))
    
    # Объект
    object_name = Column(String(500), comment="Наименование объекта")
    object_address = Column(Text, comment="Адрес объекта")
    
    # Суммы
    total_amount = Column(Float, default=0.0, comment="Сумма договора")
    advance_amount = Column(Float, default=0.0, comment="Аванс")
    advance_percent = Column(Float, default=0.0, comment="% аванса")
    
    # Связи
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    
    # Дополнительная информация
    notes = Column(Text, comment="Примечания")
    
    # Файл договора
    document_path = Column(String(500), comment="Путь к файлу договора")
    
    # Даты
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Связи
    estimates = relationship("Estimate", backref="contract")
    ks2_acts = relationship("KS2Act", backref="contract")
    ks3_certificates = relationship("KS3Certificate", backref="contract")
    additional_agreements = relationship("AdditionalAgreement", back_populates="contract")


class AdditionalAgreement(Base):
    """Дополнительное соглашение к договору"""
    __tablename__ = "additional_agreements"
    
    id = Column(Integer, primary_key=True, index=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False)
    
    # Номер и дата
    number = Column(String(50), nullable=False)
    agreement_date = Column(Date, nullable=False)
    
    # Тип соглашения
    agreement_type = Column(String(50), comment="Тип: additional, replacement, independent")
    
    # Описание изменений
    description = Column(Text)
    
    # Изменение суммы
    amount_change = Column(Float, default=0.0)
    
    # Файл
    document_path = Column(String(500))
    
    # Даты
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Связи
    contract = relationship("Contract", back_populates="additional_agreements")
