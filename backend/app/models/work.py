"""
Модели для работ (база расценок)
"""

from sqlalchemy import Column, Integer, String, Float, Text, ForeignKey, Boolean
from sqlalchemy.orm import relationship

from app.database import Base


class WorkCategory(Base):
    """Категория работ"""
    __tablename__ = "work_categories"
    
    id = Column(Integer, primary_key=True, index=True)
    parent_id = Column(Integer, ForeignKey("work_categories.id"), nullable=True)
    
    code = Column(String(50), unique=True, index=True, comment="Код категории")
    name = Column(String(500), nullable=False, comment="Наименование категории")
    description = Column(Text, comment="Описание")
    
    # Иерархия
    level = Column(Integer, default=0, comment="Уровень вложенности")
    path = Column(String(500), comment="Полный путь в иерархии")
    
    # Связи
    parent = relationship("WorkCategory", remote_side=[id], backref="children")
    works = relationship("Work", back_populates="category")


class Work(Base):
    """Работа из справочника расценок"""
    __tablename__ = "works"
    
    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("work_categories.id"), nullable=True)
    
    # Идентификация
    code = Column(String(50), unique=True, index=True, comment="Шифр расценки")
    name = Column(String(1000), nullable=False, index=True, comment="Наименование работы")
    full_name = Column(Text, comment="Полное наименование с описанием")
    
    # Единица измерения
    unit = Column(String(50), default="шт", comment="Единица измерения")
    
    # Расценки (базовые цены)
    materials_price = Column(Float, default=0.0, comment="Стоимость материалов")
    labor_price = Column(Float, default=0.0, comment="Стоимость труда")
    machines_price = Column(Float, default=0.0, comment="Стоимость машин")
    total_price = Column(Float, default=0.0, comment="Всего за единицу")
    
    # Нормы расхода ресурсов
    labor_hours = Column(Float, default=0.0, comment="Затраты труда (чел-час)")
    machine_hours = Column(Float, default=0.0, comment="Затраты машин (маш-час)")
    
    # Дополнительная информация
    source = Column(String(50), comment="Источник (ТЕР, ФЕР, ГЭСН и т.д.)")
    notes = Column(Text, comment="Примечания")
    
    # Флаги
    is_active = Column(Boolean, default=True, comment="Активна")
    is_popular = Column(Boolean, default=False, comment="Часто используется")
    
    # Для ИИ-поиска
    search_vector = Column(Text, comment="Текст для полнотекстового поиска")
    embedding = Column(Text, comment="Векторное представление для семантического поиска")
    
    # Связи
    category = relationship("WorkCategory", back_populates="works")
    resources = relationship("WorkResource", back_populates="work", cascade="all, delete-orphan")
    
    def calculate_total(self):
        """Расчёт итоговой цены"""
        self.total_price = self.materials_price + self.labor_price + self.machines_price


class WorkResource(Base):
    """Ресурс в составе работы (материалы, механизмы)"""
    __tablename__ = "work_resources"
    
    id = Column(Integer, primary_key=True, index=True)
    work_id = Column(Integer, ForeignKey("works.id"), nullable=False)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=True)
    
    # Описание ресурса
    name = Column(String(500), nullable=False, comment="Наименование ресурса")
    code = Column(String(50), comment="Код ресурса")
    
    # Расход
    unit = Column(String(50), comment="Единица измерения")
    quantity = Column(Float, default=0.0, comment="Норма расхода на ед. работы")
    price = Column(Float, default=0.0, comment="Цена за единицу")
    
    # Тип ресурса
    resource_type = Column(String(20), comment="Тип: material, labor, machine")
    
    # Связи
    work = relationship("Work", back_populates="resources")
    material = relationship("Material")
