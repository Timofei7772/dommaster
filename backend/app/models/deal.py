"""
CRM-модель сделки (Deal) — конвейер: лид → контакт → звонок → встреча → аванс → мастер → контроль → прибыль
"""

import enum
from sqlalchemy import (
    Column, Integer, Float, String, DateTime, ForeignKey, Text, Boolean, Enum,
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class DealStage(str, enum.Enum):
    """Этапы конвейера сделки"""
    LEAD = "lead"           # Получен лид
    CONTACT = "contact"     # Первый контакт
    CALL = "call"           # Звонок совершён
    MEETING = "meeting"     # Встреча назначена/проведена
    ADVANCE = "advance"     # Аванс получен
    MASTER = "master"       # Мастер назначен
    CONTROL = "control"     # Контроль выполнения
    PROFIT = "profit"       # Сделка закрыта, прибыль получена


class Deal(Base):
    """Сделка — основная единица CRM-конвейера"""
    __tablename__ = "deals"

    id = Column(Integer, primary_key=True, index=True)

    # Связь с клиентом (опционально — сделку можно создать без клиента)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=True, index=True)

    # Основная информация
    title = Column(String(500), nullable=False, comment="Название сделки / описание работ")
    description = Column(Text, comment="Подробное описание")
    address = Column(String(500), comment="Адрес объекта")

    # Этап конвейера
    stage = Column(
        Enum(DealStage),
        default=DealStage.LEAD,
        nullable=False,
        index=True,
        comment="Текущий этап"
    )

    # Финансы
    estimate_id = Column(Integer, ForeignKey("estimates.id"), nullable=True, index=True, comment="Привязанная смета")
    sale_amount = Column(Float, default=0.0, comment="Сумма проданная клиенту")
    estimate_total = Column(Float, default=0.0, comment="Сумма по смете (расчет Сметы)")
    cost_amount = Column(Float, default=0.0, comment="Себестоимость / оплата мастеру")
    profit = Column(Float, default=0.0, comment="Реальная прибыль (sale_amount - cost_amount)")
    advance_amount = Column(Float, default=0.0, comment="Сумма аванса")

    # Источник лида
    source = Column(String(100), comment="Источник: avito/profi/youdo/vk/telegram/direct/other")

    # Контакт (если без привязки к Client)
    contact_name = Column(String(300), comment="Имя контакта")
    contact_phone = Column(String(50), comment="Телефон контакта")

    # Встреча
    meeting_date = Column(DateTime(timezone=True), comment="Дата встречи")
    meeting_notes = Column(Text, comment="Заметки по встрече")

    # Мастер
    master_id = Column(Integer, nullable=True, comment="ID мастера (из workers)")
    master_name = Column(String(300), comment="Имя мастера")

    # Статус
    is_lost = Column(Boolean, default=False, comment="Сделка потеряна")
    lost_reason = Column(String(500), comment="Причина потери")

    # Action CRM (Follow-up)
    next_action = Column(String(500), nullable=True, comment="Следующий шаг (задача)")
    next_action_date = Column(DateTime(timezone=True), nullable=True, comment="Дедлайн следующего шага")
    last_contact_at = Column(DateTime(timezone=True), nullable=True, comment="Дата последнего контакта")

    # Заметки
    notes = Column(Text, comment="Заметки")

    # Даты
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    closed_at = Column(DateTime(timezone=True), comment="Дата закрытия сделки")

    # Связи
    client = relationship("Client", backref="deals")
    estimate = relationship("Estimate", foreign_keys=[estimate_id])
    activities = relationship("DealActivity", back_populates="deal", order_by="DealActivity.created_at.desc()")

    def calculate_profit(self):
        """Пересчёт прибыли"""
        self.profit = round((self.sale_amount or 0) - (self.cost_amount or 0), 2)


class DealActivity(Base):
    """История действий по сделке (лог переходов, заметки)"""
    __tablename__ = "deal_activities"

    id = Column(Integer, primary_key=True, index=True)
    deal_id = Column(Integer, ForeignKey("deals.id"), nullable=False, index=True)

    # Тип действия
    activity_type = Column(
        String(50),
        nullable=False,
        comment="Тип: stage_change / note / call / meeting / payment"
    )

    # Описание
    description = Column(Text, comment="Описание действия")

    # Переход между этапами (для stage_change)
    old_stage = Column(String(50), comment="Предыдущий этап")
    new_stage = Column(String(50), comment="Новый этап")

    # Дата
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Связи
    deal = relationship("Deal", back_populates="activities")
