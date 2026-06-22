"""
ERP-модели: расход материалов, оплата труда, прогресс работ, финансы проекта
"""

from sqlalchemy import Column, Integer, Float, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class WorkMaterial(Base):
    """Связь работ и материалов (нормы расхода)"""
    __tablename__ = "work_materials"

    id = Column(Integer, primary_key=True, index=True)
    work_id = Column(Integer, ForeignKey("works.id"), nullable=False, index=True)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=False, index=True)

    consumption_rate = Column(Float, default=0.0, comment="Норма расхода на ед. работы")
    unit = Column(String(50), comment="Единица измерения расхода")
    notes = Column(Text, comment="Примечания")

    # Связи
    work = relationship("Work")
    material = relationship("Material")


class MaterialUsage(Base):
    """Фактический расход материалов по позиции сметы"""
    __tablename__ = "material_usage"

    id = Column(Integer, primary_key=True, index=True)
    estimate_item_id = Column(Integer, ForeignKey("estimate_items.id"), nullable=False, index=True)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=False, index=True)

    quantity = Column(Float, default=0.0, comment="Количество")
    price = Column(Float, default=0.0, comment="Цена за единицу")
    total = Column(Float, default=0.0, comment="Итого стоимость")

    # Связи
    estimate_item = relationship("EstimateItem")
    material = relationship("Material")

    def calculate_total(self):
        """Пересчёт итога"""
        self.total = round(self.quantity * self.price, 2)


class LaborPayment(Base):
    """Оплата труда по позиции сметы"""
    __tablename__ = "labor_payments"

    id = Column(Integer, primary_key=True, index=True)
    estimate_item_id = Column(Integer, ForeignKey("estimate_items.id"), nullable=False, index=True)

    master_price = Column(Float, default=0.0, comment="Цена мастера")
    brigade_price = Column(Float, default=0.0, comment="Цена бригады")
    company_margin = Column(Float, default=0.0, comment="Маржа компании")
    total_payment = Column(Float, default=0.0, comment="Итого оплата")

    # Связи
    estimate_item = relationship("EstimateItem")

    def calculate_total(self):
        """Пересчёт итога"""
        self.total_payment = round(self.master_price + self.brigade_price + self.company_margin, 2)


class WorkProgress(Base):
    """Прогресс выполнения работ"""
    __tablename__ = "work_progress"

    id = Column(Integer, primary_key=True, index=True)
    estimate_item_id = Column(Integer, ForeignKey("estimate_items.id"), nullable=False, index=True)

    planned_volume = Column(Float, default=0.0, comment="Плановый объём")
    completed_volume = Column(Float, default=0.0, comment="Выполненный объём")
    remaining_volume = Column(Float, default=0.0, comment="Остаток")

    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Связи
    estimate_item = relationship("EstimateItem")

    def recalculate(self):
        """Пересчёт остатка"""
        self.remaining_volume = round(self.planned_volume - self.completed_volume, 4)


class ProjectFinance(Base):
    """Финансовая сводка по смете"""
    __tablename__ = "project_finance"

    id = Column(Integer, primary_key=True, index=True)
    estimate_id = Column(Integer, ForeignKey("estimates.id"), nullable=False, unique=True, index=True)

    labor_cost = Column(Float, default=0.0, comment="Стоимость работ")
    material_cost = Column(Float, default=0.0, comment="Стоимость материалов")
    overhead_percent = Column(Float, default=15.0, comment="% накладных расходов")
    profit_percent = Column(Float, default=10.0, comment="% сметной прибыли")
    vat_percent = Column(Float, default=20.0, comment="% НДС")
    total_price = Column(Float, default=0.0, comment="Итого с НДС")
    margin = Column(Float, default=0.0, comment="Маржа (прибыль)")

    # Дополнительные показатели
    cost_per_sqm = Column(Float, default=0.0, comment="Стоимость за м²")
    profitability = Column(Float, default=0.0, comment="Рентабельность, %")

    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Связи
    estimate = relationship("Estimate")
