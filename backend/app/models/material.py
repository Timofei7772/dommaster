"""
Модели для материалов
"""

from sqlalchemy import Column, Integer, String, Float, Text, ForeignKey, Boolean, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class MaterialCategory(Base):
    """Категория материалов"""
    __tablename__ = "material_categories"
    
    id = Column(Integer, primary_key=True, index=True)
    parent_id = Column(Integer, ForeignKey("material_categories.id"), nullable=True)
    
    code = Column(String(50), unique=True, index=True, comment="Код категории")
    name = Column(String(500), nullable=False, comment="Наименование категории")
    
    # Иерархия
    level = Column(Integer, default=0)
    
    # Связи
    parent = relationship("MaterialCategory", remote_side=[id], backref="children")
    materials = relationship("Material", back_populates="category")


class Material(Base):
    """Материал из справочника"""
    __tablename__ = "materials"
    
    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("material_categories.id"), nullable=True)
    
    # Идентификация
    code = Column(String(50), unique=True, index=True, comment="Код материала")
    name = Column(String(1000), nullable=False, index=True, comment="Наименование")
    full_name = Column(Text, comment="Полное наименование")
    
    # Единица измерения
    unit = Column(String(50), default="шт", comment="Единица измерения")
    
    # Цены
    base_price = Column(Float, default=0.0, comment="Базовая цена")
    current_price = Column(Float, default=0.0, comment="Текущая цена")
    supplier_price = Column(Float, default=0.0, comment="Цена поставщика")
    
    # Информация о поставщике
    supplier = Column(String(500), comment="Поставщик")
    article = Column(String(100), comment="Артикул")
    
    # Характеристики
    weight = Column(Float, comment="Вес, кг")
    volume = Column(Float, comment="Объём, м³")
    
    # Флаги
    is_active = Column(Boolean, default=True)
    is_popular = Column(Boolean, default=False)
    
    # Для поиска
    search_vector = Column(Text)
    
    # Даты
    price_updated_at = Column(DateTime(timezone=True), comment="Дата обновления цены")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Связи
    category = relationship("MaterialCategory", back_populates="materials")


class MaterialPriceHistory(Base):
    """История цен на материалы"""
    __tablename__ = "material_price_history"
    
    id = Column(Integer, primary_key=True, index=True)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=False)
    
    price = Column(Float, nullable=False)
    source = Column(String(100), comment="Источник цены")
    recorded_at = Column(DateTime(timezone=True), server_default=func.now())
