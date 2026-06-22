"""
Автосохранение: debounce 2 сек, патч строки, пересчёт итогов.
"""
import asyncio
import uuid
import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from services.estimate_service import EstimateService

logger = logging.getLogger(__name__)


class AutoSaveService:
    """
    На бэкенде реализует логику debounce:
    – принимает изменение
    – если для той же позиции пришло новое за 2 секунды → объединяет
    – после 2 секунд тишины → сохраняет
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.estimate_service = EstimateService(db)
        self._pending: dict[uuid.UUID, dict[str, Any]] = {}
        self._timers: dict[uuid.UUID, asyncio.Task] = {}
        self.debounce_seconds: float = 2.0

    async def schedule_save(
        self, item_id: uuid.UUID, changes: dict[str, Any],
    ) -> None:
        # Объединяем изменения
        if item_id in self._pending:
            self._pending[item_id].update(changes)
        else:
            self._pending[item_id] = dict(changes)

        # Отменяем предыдущий таймер
        if item_id in self._timers:
            self._timers[item_id].cancel()

        # Новый таймер
        self._timers[item_id] = asyncio.create_task(
            self._delayed_save(item_id)
        )

    async def _delayed_save(self, item_id: uuid.UUID) -> None:
        await asyncio.sleep(self.debounce_seconds)
        changes = self._pending.pop(item_id, {})
        self._timers.pop(item_id, None)

        if changes:
            try:
                await self.estimate_service.update_item(item_id, **changes)
                logger.debug("Автосохранение позиции %s: %s", item_id, changes)
            except Exception:
                logger.exception("Ошибка автосохранения %s", item_id)

    async def force_save_all(self) -> None:
        """Принудительное сохранение всех ожидающих изменений."""
        for item_id in list(self._pending.keys()):
            if item_id in self._timers:
                self._timers[item_id].cancel()
            changes = self._pending.pop(item_id, {})
            if changes:
                await self.estimate_service.update_item(item_id, **changes)

    async def save_immediately(
        self, item_id: uuid.UUID, changes: dict[str, Any],
    ) -> None:
        """Немедленное сохранение без debounce."""
        await self.estimate_service.update_item(item_id, **changes)
