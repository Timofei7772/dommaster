"""
Модели для КС-2 (Акт о приёмке выполненных работ)
"""

from sqlalchemy import Column, Integer, String, Float, Date, DateTime, ForeignKey, Text, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum

from app.database import Base


class KS2Status(str, enum.Enum):
    """Статус акта КС-2"""
    DRAFT = "draft"
    SUBMITTED = "submitted"
    SIGNED = "signed"
    PAID = "paid"


class KS2Act(Base):
    """Акт о приёмке выполненных работ (КС-2)"""
    __tablename__ = "ks2_acts"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Номер и дата
    number = Column(String(50), nullable=False, index=True, comment="Номер акта")
    act_date = Column(Date, nullable=False, comment="Дата акта")
    
    # Отчётный период
    period_start = Column(Date, nullable=False, comment="Начало периода")
    period_end = Column(Date, nullable=False, comment="Конец периода")
    
    # Связи с проектом
    estimate_id = Column(Integer, ForeignKey("estimates.id"), nullable=False)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=True)
    
    # Стороны
    customer = Column(String(500), comment="Заказчик")
    contractor = Column(String(500), comment="Подрядчик")
    investor = Column(String(500), comment="Инвестор")
    
    # Объект
    object_name = Column(String(500), comment="Наименование объекта")
    object_address = Column(Text, comment="Адрес объекта")
    
    # Суммы
    total_without_vat = Column(Float, default=0.0, comment="Итого без НДС")
    vat_amount = Column(Float, default=0.0, comment="Сумма НДС")
    total_with_vat = Column(Float, default=0.0, comment="Итого с НДС")
    
    # Статус
    status = Column(Enum(KS2Status, native_enum=False), default=KS2Status.DRAFT)
    
    # Даты
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    signed_at = Column(DateTime(timezone=True))
    
    # Связи
    estimate = relationship("Estimate", back_populates="ks2_acts")
    items = relationship("KS2Item", back_populates="act", cascade="all, delete-orphan")
    ks3_items = relationship("KS3Item", back_populates="ks2_act")
    
    def recalculate(self):
        """Пересчёт итогов акта с учётом настроек VAT сметы"""
        self.total_without_vat = sum(item.total for item in self.items)
        # Используем VAT из связанной сметы, если доступно
        vat_percent = getattr(self.estimate, "vat_percent", 20.0) or 20.0
        vat_on_top = getattr(self.estimate, "vat_on_top", True)
        if vat_on_top:
            self.vat_amount = round(self.total_without_vat * (vat_percent / 100), 2)
        else:
            self.vat_amount = 0.0
        self.total_with_vat = round(self.total_without_vat + self.vat_amount, 2)


class KS2Item(Base):
    """Позиция акта КС-2"""
    __tablename__ = "ks2_items"
    
    id = Column(Integer, primary_key=True, index=True)
    act_id = Column(Integer, ForeignKey("ks2_acts.id"), nullable=False)
    estimate_item_id = Column(Integer, ForeignKey("estimate_items.id"), nullable=True)
    
    # Номер позиции
    item_number = Column(String(20), comment="Номер по порядку")
    order_index = Column(Integer, default=0)
    
    # Обоснование
    justification = Column(String(50), comment="Номер расценки")
    
    # Наименование
    name = Column(String(1000), nullable=False, comment="Наименование работы")
    
    # Объёмы
    unit = Column(String(50), comment="Единица измерения")
    quantity_total = Column(Float, default=0.0, comment="Количество по смете")
    quantity_done = Column(Float, default=0.0, comment="Выполнено в этом периоде")
    quantity_prev = Column(Float, default=0.0, comment="Выполнено ранее")
    
    # Стоимость
    unit_price = Column(Float, default=0.0, comment="Цена за единицу")
    total = Column(Float, default=0.0, comment="Стоимость выполненных работ")
    
    # Связи
    act = relationship("KS2Act", back_populates="items")
    estimate_item = relationship("EstimateItem")
    
    def calculate(self):
        """Расчёт стоимости позиции"""
        self.total = self.quantity_done * self.unit_price
