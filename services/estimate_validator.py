"""
Валидация сметы перед отправкой / генерацией документов.
"""
import uuid
import logging
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Estimate, EstimateSection, EstimateItem

logger = logging.getLogger(__name__)


@dataclass
class ValidationResult:
    is_valid: bool = True
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def add_error(self, msg: str):
        self.errors.append(msg)
        self.is_valid = False

    def add_warning(self, msg: str):
        self.warnings.append(msg)


class EstimateValidator:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def validate(self, estimate_id: uuid.UUID) -> ValidationResult:
        result = ValidationResult()

        est_result = await self.db.execute(
            select(Estimate).where(Estimate.id == estimate_id)
        )
        estimate = est_result.scalar_one_or_none()

        if not estimate:
            result.add_error("Смета не найдена")
            return result

        # Проверка разделов
        sect_result = await self.db.execute(
            select(EstimateSection).where(EstimateSection.estimate_id == estimate_id)
        )
        sections = list(sect_result.scalars().all())
        if not sections:
            result.add_error("Смета не содержит разделов")

        # Проверка позиций
        items_result = await self.db.execute(
            select(EstimateItem).where(EstimateItem.estimate_id == estimate_id)
        )
        items = list(items_result.scalars().all())

        if not items:
            result.add_error("Смета не содержит позиций")
            return result

        for item in items:
            if item.quantity <= 0:
                result.add_warning(f"Позиция «{item.name}»: нулевой объём")
            if item.price_work <= 0 and item.price_material <= 0:
                result.add_warning(f"Позиция «{item.name}»: нулевая стоимость")
            if item.total_cost < 0:
                result.add_error(f"Позиция «{item.name}»: отрицательная стоимость")

        # Проверка итогов
        calc_total = sum(i.total_cost for i in items)
        if abs(calc_total - estimate.total_cost) > 0.01:
            result.add_warning(
                f"Расхождение итогов: расчётная {calc_total:.2f}, "
                f"в смете {estimate.total_cost:.2f}"
            )

        if estimate.final_price <= 0:
            result.add_error("Итоговая стоимость сметы ≤ 0")

        if estimate.overhead_percent < 0 or estimate.overhead_percent > 50:
            result.add_warning(f"Нестандартные накладные: {estimate.overhead_percent}%")

        if estimate.profit_percent < 0 or estimate.profit_percent > 50:
            result.add_warning(f"Нестандартная прибыль: {estimate.profit_percent}%")

        logger.info(
            "Валидация сметы %s: valid=%s, errors=%d, warnings=%d",
            estimate.estimate_number, result.is_valid,
            len(result.errors), len(result.warnings),
        )
        return result
