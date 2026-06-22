"""
Реестр документов
"""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum

from app.database import Base


class DocumentType(str, enum.Enum):
    """Типы документов"""
    KP = "kp"                   # Коммерческое предложение
    CONTRACT = "contract"       # Договор подряда
    KS2 = "ks2"                 # Акт выполненных работ
    KS3 = "ks3"                 # Справка о стоимости
    M29 = "m29"                 # Ведомость расхода материалов
    INVOICE = "invoice"         # Счёт-фактура
    ESTIMATE = "estimate"       # Смета (экспорт)
    ADDITIONAL = "additional"   # Доп. соглашение
    DEFECT = "defect"           # Дефектовка
    FOT = "fot"                 # Ведомость ФОТ


class DocumentStatus(str, enum.Enum):
    """Статусы документа"""
    DRAFT = "draft"
    GENERATED = "generated"
    SIGNED = "signed"
    SENT = "sent"
    ARCHIVED = "archived"


class Document(Base):
    """Документ в реестре"""
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    estimate_id = Column(Integer, ForeignKey("estimates.id"), nullable=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)

    # Тип и статус
    document_type = Column(Enum(DocumentType), nullable=False, comment="Тип документа")
    status = Column(Enum(DocumentStatus), default=DocumentStatus.DRAFT)

    # Информация
    name = Column(String(500), comment="Название документа")
    number = Column(String(100), comment="Номер документа")
    description = Column(Text, comment="Описание")

    # Файл
    file_path = Column(String(1000), comment="Путь к файлу")
    file_format = Column(String(10), comment="Формат: docx/xlsx/pdf")
    file_size = Column(Integer, comment="Размер файла в байтах")

    # Даты
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    generated_at = Column(DateTime(timezone=True), comment="Дата генерации")

    # Кто создал
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)

    # Связи
    estimate = relationship("Estimate")
    project = relationship("Project")
