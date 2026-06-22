"""
Сервис аудита — логирование всех изменений
"""

from typing import Any, Dict, Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.versioning import AuditLog


class AuditService:
    """Логирование изменений в audit_logs"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def log(
        self,
        entity_type: str,
        entity_id: int,
        action: str,
        old_value: Optional[Dict[str, Any]] = None,
        new_value: Optional[Dict[str, Any]] = None,
        changed_fields: Optional[str] = None,
        user_id: Optional[int] = None,
        ip_address: Optional[str] = None,
    ):
        """Записать лог изменения"""
        entry = AuditLog(
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            old_value=old_value,
            new_value=new_value,
            changed_fields=changed_fields,
            user_id=user_id,
            ip_address=ip_address,
        )
        self.db.add(entry)
        await self.db.flush()
        return entry

    async def log_create(self, entity_type: str, entity_id: int, data: Dict = None, user_id: int = None):
        """Лог создания"""
        return await self.log(entity_type, entity_id, "create", new_value=data, user_id=user_id)

    async def log_update(
        self,
        entity_type: str,
        entity_id: int,
        old_data: Dict = None,
        new_data: Dict = None,
        fields: str = None,
        user_id: int = None,
    ):
        """Лог обновления"""
        return await self.log(
            entity_type, entity_id, "update",
            old_value=old_data, new_value=new_data,
            changed_fields=fields, user_id=user_id,
        )

    async def log_delete(self, entity_type: str, entity_id: int, data: Dict = None, user_id: int = None):
        """Лог удаления"""
        return await self.log(entity_type, entity_id, "delete", old_value=data, user_id=user_id)
