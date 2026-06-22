from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime
from sqlalchemy.sql import func
from app.database import Base

class MessageTemplate(Base):
    __tablename__ = "message_templates"

    id = Column(Integer, primary_key=True, index=True)
    stage = Column(String(50), index=True, default="common", comment="Возможные: lead, contact, meeting, advance, master, common")
    title = Column(String(300), nullable=False, comment="Название шаблона")
    content = Column(Text, nullable=False, comment="Текст шаблона с переменными {name}, {price}")
    template_type = Column(String(50), default="TEMPLATE", comment="TEMPLATE или SCRIPT")
    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
