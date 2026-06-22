"""
Сервис автосохранения — debounce PATCH для позиций сметы
"""

import asyncio
from typing import Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.estimate import EstimateItem, Estimate


class AutoSaveService:
    """Автосохранение с debounce (2 секунды)"""

    # Хранилище ожидающих изменений (в памяти)
    _pending_changes: Dict[int, Dict[str, Any]] = {}
    _debounce_tasks: Dict[int, asyncio.Task] = {}
    _debounce_delay: float = 2.0  # секунд

    def __init__(self, db: AsyncSession):
        self.db = db

    async def schedule_save(self, item_id: int, changes: Dict[str, Any]):
        """Запланировать сохранение с debounce"""
        # Накапливаем изменения
        if item_id in self._pending_changes:
            self._pending_changes[item_id].update(changes)
        else:
            self._pending_changes[item_id] = changes.copy()

        # Отменяем предыдущий таймер
        if item_id in self._debounce_tasks:
            self._debounce_tasks[item_id].cancel()

        # Запускаем новый таймер
        self._debounce_tasks[item_id] = asyncio.create_task(
            self._delayed_save(item_id)
        )

    async def _delayed_save(self, item_id: int):
        """Отложенное сохранение"""
        await asyncio.sleep(self._debounce_delay)
        changes = self._pending_changes.pop(item_id, None)
        self._debounce_tasks.pop(item_id, None)

        if changes:
            await self.save_item_changes(item_id, changes)

    async def save_item_changes(self, item_id: int, changes: Dict[str, Any]) -> Optional[EstimateItem]:
        """Сохранить изменения позиции сметы"""
        result = await self.db.execute(
            select(EstimateItem).where(EstimateItem.id == item_id)
        )
        item = result.scalar_one_or_none()
        if not item:
            return None

        # Применяем изменения
        allowed_fields = {
            'name', 'quantity', 'materials_price', 'labor_price',
            'machines_price', 'unit', 'description', 'row_type',
            'quantity_expr', 'order_index',
        }
        for field, value in changes.items():
            if field in allowed_fields:
                setattr(item, field, value)

        # Пересчитываем позицию
        estimate_result = await self.db.execute(
            select(Estimate).where(Estimate.id == item.estimate_id)
        )
        estimate = estimate_result.scalar_one_or_none()
        if estimate:
            item.calculate(
                work_coef=estimate.work_coef or 1.0,
                material_coef=estimate.material_coef or 1.0,
            )

        await self.db.flush()
        return item

    async def flush_all(self):
        """Принудительно сохранить все ожидающие изменения"""
        for item_id in list(self._pending_changes.keys()):
            changes = self._pending_changes.pop(item_id, None)
            task = self._debounce_tasks.pop(item_id, None)
            if task:
                task.cancel()
            if changes:
                await self.save_item_changes(item_id, changes)
