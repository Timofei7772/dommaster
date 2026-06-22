"""
Модель локальной цены для региона Башкортостан
"""
from sqlalchemy import Column, Integer, String, Float, DateTime, select
from sqlalchemy.sql import func
from app.database import Base


class LocalPrice(Base):
    """Цена на материалы/работы в конкретном городе Башкортостана"""
    __tablename__ = "local_prices"

    id = Column(Integer, primary_key=True, index=True)
    category = Column(String(100), nullable=False, index=True, comment="Категория")
    name = Column(String(500), nullable=False, comment="Наименование")
    unit = Column(String(50), nullable=False, comment="Единица измерения")
    price = Column(Float, default=0.0, comment="Цена")
    region = Column(String(100), default="Башкортостан", comment="Регион")
    city = Column(String(100), nullable=False, index=True, comment="Город")
    source = Column(String(200), comment="Источник данных")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
