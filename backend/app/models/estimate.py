"""
Модели для смет
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text, Enum, Boolean, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from datetime import datetime
import enum

from app.database import Base


class EstimateType(str, enum.Enum):
    """Типы смет — как в Смета 2007"""
    DEFECTOVKA = "defectovka"  # Дефектовка (начальный документ — фактическая стоимость)
    LOCAL = "local"            # Локальная смета (с коэффициентами)
    OBJECT = "object"          # Объектная смета
    SUMMARY = "summary"        # Сводная смета
    RESOURCE = "resource"      # Ресурсная смета


class EstimateStatus(str, enum.Enum):
    """Статусы сметы"""
    DRAFT = "draft"           # Черновик
    IN_REVIEW = "in_review"   # На проверке
    APPROVED = "approved"     # Утверждена
    REJECTED = "rejected"     # Отклонена
    ARCHIVED = "archived"     # В архиве


class Estimate(Base):
    """Смета"""
    __tablename__ = "estimates"
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Основная информация
    number = Column(String(50), unique=True, index=True, comment="Номер сметы")
    name = Column(String(500), nullable=False, comment="Наименование сметы")
    description = Column(Text, comment="Описание")
    
    # Тип и статус
    estimate_type = Column(Enum(EstimateType, native_enum=False), default=EstimateType.LOCAL)
    status = Column(Enum(EstimateStatus, native_enum=False), default=EstimateStatus.DRAFT)
    
    # Связи с проектом
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    object_id = Column(Integer, ForeignKey("project_objects.id"), nullable=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=True)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=True)
    
    # Стоимости
    materials_cost = Column(Float, default=0.0, comment="Стоимость материалов")
    labor_cost = Column(Float, default=0.0, comment="Стоимость работ")
    machines_cost = Column(Float, default=0.0, comment="Стоимость машин и механизмов")
    overhead_cost = Column(Float, default=0.0, comment="Накладные расходы")
    profit_cost = Column(Float, default=0.0, comment="Сметная прибыль")
    total_cost = Column(Float, default=0.0, comment="Итого без НДС")
    vat_cost = Column(Float, default=0.0, comment="НДС")
    total_with_vat = Column(Float, default=0.0, comment="Итого с НДС")
    
    # Коэффициенты как в Смета 2007 (KoeffForPrice, KoeffForResource)
    work_coef = Column(Float, default=1.8, comment="Коэффициент на работы (KoeffForPrice)")
    material_coef = Column(Float, default=1.04, comment="Коэффициент на материалы (KoeffForResource)")

    # Накладные и прибыль (VNS/LNI в Смета 2007)
    overhead_percent = Column(Float, default=0.0, comment="% накладных расходов (VNS)")
    profit_percent = Column(Float, default=0.0, comment="% сметной прибыли (LNI)")
    vat_percent = Column(Float, default=20.0, comment="% НДС (StavkaNDS)")
    vat_on_top = Column(Boolean, default=True, comment="НДС сверху (NDS_Sverhu)")
    price_index = Column(Float, default=1.0, comment="Индекс пересчёта цен")

    # Связь с дефектовкой-источником (смета создаётся из дефектовки)
    source_defect_id = Column(Integer, ForeignKey("estimates.id"), nullable=True,
                              comment="ID дефектовки-источника")
    
    # Дополнительные данные
    metadata_json = Column(JSON, default={}, comment="Дополнительные данные")
    
    # Даты
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    approved_at = Column(DateTime(timezone=True), nullable=True)
    
    # Создатель
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Связи
    sections = relationship("EstimateSection", back_populates="estimate", cascade="all, delete-orphan")
    items = relationship("EstimateItem", back_populates="estimate", cascade="all, delete-orphan")
    ks2_acts = relationship("KS2Act", back_populates="estimate")
    
    def recalculate(self):
        """
        Пересчёт итогов сметы по алгоритму Смета 2007.

        Алгоритм:
        1. Для каждой строки:
           - расценка: sum_smeta = qty × ROUND(labor × work_coef, 2)
                                  + qty × ROUND(material × material_coef, 2)
           - материал:  sum_smeta = qty × ROUND(material × material_coef, 2)
           - механизм:  sum_smeta = qty × ROUND(material × material_coef, 2)
        2. itogo_po_razdelam = sum_pr + sum_mat + sum_meh
        3. overhead = itogo_po_razdelam × overhead% / 100  (VNS)
        4. profit = (itogo_po_razdelam + overhead) × profit% / 100  (LNI)
        5. total_cost = itogo_po_razdelam + overhead + profit
        6. vat = total_cost × vat% / 100  (если НДС сверху)
        7. total_with_vat = total_cost + vat
        """
        def r2(v): return round(v, 2)

        wc = self.work_coef or 1.8
        mc = self.material_coef or 1.04

        sum_pr = sum_mat = sum_meh = fact_total = 0.0

        for item in self.items:
            row_type = getattr(item, 'row_type', 'pr') or 'pr'
            if row_type in ('comment', 'spr', 'empt', 'irazd', 'irazdp',
                            'irazdm', 'itog', 'itogp', 'itogm') or \
               str(row_type).startswith('lz_'):
                continue

            qty  = float(item.quantity or 1)
            mat  = float(item.materials_price or 0)
            lab  = float(item.labor_price or 0)

            fact_total += r2((mat + lab) * qty)

            if row_type in ('material', 'mat'):
                s = r2(qty * r2(mat * mc))
                item.materials_total = s
                item.labor_total = 0.0
                item.machines_total = 0.0
                item.total = s
                sum_mat += s
            elif row_type in ('mechanism', 'meh'):
                s = r2(qty * r2(mat * mc))
                item.materials_total = 0.0
                item.labor_total = 0.0
                item.machines_total = s
                item.total = s
                sum_meh += s
            else:  # расценка (pr / rascenka / work / default)
                s_lab = r2(qty * r2(lab * wc))
                s_mat = r2(qty * r2(mat * mc))
                s = r2(s_lab + s_mat)
                item.labor_total = s_lab
                item.materials_total = s_mat
                item.machines_total = 0.0
                item.total = s
                sum_pr += s

        itogo = r2(sum_pr + sum_mat + sum_meh)
        self.labor_cost    = r2(sum_pr)
        self.materials_cost = r2(sum_mat)
        self.machines_cost  = r2(sum_meh)

        overhead = r2(itogo * (self.overhead_percent or 0) / 100)
        profit   = r2((itogo + overhead) * (self.profit_percent or 0) / 100)
        self.overhead_cost = overhead
        self.profit_cost   = profit

        total = r2(itogo + overhead + profit)
        self.total_cost = total

        if self.vat_on_top if self.vat_on_top is not None else True:
            vat = r2(total * (self.vat_percent or 20) / 100)
        else:
            vat = 0.0
        self.vat_cost = vat
        self.total_with_vat = r2(total + vat)


class EstimateSection(Base):
    """Раздел сметы"""
    __tablename__ = "estimate_sections"
    
    id = Column(Integer, primary_key=True, index=True)
    estimate_id = Column(Integer, ForeignKey("estimates.id"), nullable=False)
    
    number = Column(String(20), comment="Номер раздела")
    name = Column(String(500), nullable=False, comment="Наименование раздела")
    order_index = Column(Integer, default=0, comment="Порядок сортировки")
    
    # Итоги раздела
    total_cost = Column(Float, default=0.0)
    
    # Связи
    estimate = relationship("Estimate", back_populates="sections")
    items = relationship("EstimateItem", back_populates="section")


class EstimateItem(Base):
    """Позиция сметы"""
    __tablename__ = "estimate_items"
    
    id = Column(Integer, primary_key=True, index=True)
    estimate_id = Column(Integer, ForeignKey("estimates.id"), nullable=False)
    section_id = Column(Integer, ForeignKey("estimate_sections.id"), nullable=True)
    
    # Номер и порядок
    item_number = Column(String(20), comment="Номер позиции")
    order_index = Column(Integer, default=0, comment="Порядок сортировки")
    
    # Обоснование (расценка)
    justification = Column(String(50), comment="Шифр расценки (ТЕР, ФЕР и т.д.)")
    
    # Наименование
    name = Column(String(1000), nullable=False, comment="Наименование работы/материала")
    description = Column(Text, comment="Полное описание")
    
    # Единица измерения и количество
    unit = Column(String(50), default="шт", comment="Единица измерения")
    quantity = Column(Float, default=1.0, comment="Количество")
    
    # Цены за единицу
    materials_price = Column(Float, default=0.0, comment="Цена материалов за ед.")
    labor_price = Column(Float, default=0.0, comment="Цена труда за ед.")
    machines_price = Column(Float, default=0.0, comment="Цена машин за ед.")
    
    # Итого
    materials_total = Column(Float, default=0.0, comment="Итого материалы")
    labor_total = Column(Float, default=0.0, comment="Итого труд")
    machines_total = Column(Float, default=0.0, comment="Итого машины")
    total = Column(Float, default=0.0, comment="Всего по позиции")
    
    # Связи со справочниками
    work_id = Column(Integer, ForeignKey("works.id"), nullable=True)
    material_id = Column(Integer, ForeignKey("materials.id"), nullable=True)
    
    # Тип строки (как TypeRow в Смета 2007)
    # pr/rascenka — расценка, mat/material — материал, meh/mechanism — механизм
    # comment/spr — нерасчётная строка, irazd — итог раздела
    row_type = Column(String(20), default='pr', comment="Тип строки (pr/mat/meh/comment/irazd)")

    # Формула количества (KolFormula, напр. '5.2*3.1')
    quantity_expr = Column(String(200), nullable=True, comment="Формула количества")

    # Флаги
    is_work = Column(Boolean, default=True, comment="Это работа (True) или материал (False)")
    is_manual = Column(Boolean, default=False, comment="Введено вручную")
    
    # Исполнитель и отметка о выполнении
    executor_id = Column(Integer, ForeignKey("users.id"), nullable=True, comment="Назначенный исполнитель")
    done_at = Column(DateTime(timezone=True), nullable=True, comment="Дата отметки выполнения")

    # Связи
    estimate = relationship("Estimate", back_populates="items")
    section = relationship("EstimateSection", back_populates="items")
    work = relationship("Work")
    material = relationship("Material")
    executor = relationship("User", foreign_keys=[executor_id])
    
    def calculate(self, work_coef: float = 1.0, material_coef: float = 1.0):
        """
        Расчёт итогов позиции с коэффициентами (алгоритм Смета 2007).
        Вызывается без коэффициентов для дефектовки (факт).
        """
        def r2(v): return round(v, 2)

        qty = float(self.quantity or 1)
        mat = float(self.materials_price or 0)
        lab = float(self.labor_price or 0)
        rt  = self.row_type or 'pr'

        if rt in ('comment', 'spr', 'empt', 'irazd', 'irazdp',
                  'irazdm', 'itog', 'itogp', 'itogm') or str(rt).startswith('lz_'):
            self.materials_total = 0.0
            self.labor_total = 0.0
            self.machines_total = 0.0
            self.total = 0.0
            return

        if rt in ('material', 'mat'):
            s = r2(qty * r2(mat * material_coef))
            self.materials_total = s
            self.labor_total = 0.0
            self.machines_total = 0.0
        elif rt in ('mechanism', 'meh'):
            meh = float(self.machines_price or 0)
            s = r2(qty * r2(meh * material_coef))
            self.materials_total = 0.0
            self.labor_total = 0.0
            self.machines_total = s
        else:  # расценка (work)
            self.labor_total    = r2(qty * r2(lab * work_coef))
            self.materials_total = r2(qty * r2(mat * material_coef))
            # учитываем стоимость машин, если она указана
            meh = float(self.machines_price or 0)
            if meh > 0:
                self.machines_total = r2(qty * r2(meh * material_coef))
            else:
                self.machines_total = 0.0

        self.total = r2(self.materials_total + self.labor_total + self.machines_total)
