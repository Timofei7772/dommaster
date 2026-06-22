"""
Валидатор смет — проверка на ошибки и соответствие нормам
"""

from typing import List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.estimate import Estimate, EstimateItem


class ValidationIssue:
    """Проблема валидации"""
    def __init__(self, level: str, code: str, message: str, item_id: int = None):
        self.level = level  # error / warning / info
        self.code = code
        self.message = message
        self.item_id = item_id

    def to_dict(self):
        return {
            "level": self.level,
            "code": self.code,
            "message": self.message,
            "item_id": self.item_id,
        }


class EstimateValidator:
    """Валидация смет"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def validate(self, estimate_id: int) -> List[Dict[str, Any]]:
        """Полная валидация сметы"""
        result = await self.db.execute(
            select(Estimate)
            .options(selectinload(Estimate.items), selectinload(Estimate.sections))
            .where(Estimate.id == estimate_id)
        )
        estimate = result.scalar_one_or_none()
        if not estimate:
            return [ValidationIssue("error", "NOT_FOUND", "Смета не найдена").to_dict()]

        issues = []
        issues.extend(self._check_empty_estimate(estimate))
        issues.extend(self._check_zero_prices(estimate))
        issues.extend(self._check_overhead_range(estimate))
        issues.extend(self._check_profit_range(estimate))
        issues.extend(self._check_duplicates(estimate))
        issues.extend(self._check_sections(estimate))
        issues.extend(self._check_quantities(estimate))
        issues.extend(self._check_vat(estimate))

        return [i.to_dict() for i in issues]

    def _check_empty_estimate(self, estimate: Estimate) -> List[ValidationIssue]:
        if not estimate.items:
            return [ValidationIssue("error", "EMPTY", "Смета не содержит позиций")]
        return []

    def _check_zero_prices(self, estimate: Estimate) -> List[ValidationIssue]:
        issues = []
        for item in estimate.items:
            if item.row_type in ('comment', 'spr', 'empt', 'irazd'):
                continue
            if (item.total or 0) == 0 and (item.quantity or 0) > 0:
                issues.append(ValidationIssue(
                    "warning", "ZERO_PRICE",
                    f"Позиция '{item.name}' имеет нулевую стоимость",
                    item_id=item.id,
                ))
        return issues

    def _check_overhead_range(self, estimate: Estimate) -> List[ValidationIssue]:
        pct = estimate.overhead_percent or 0
        issues = []
        if pct < 10 and pct > 0:
            issues.append(ValidationIssue("info", "LOW_OVERHEAD",
                f"Низкие накладные расходы ({pct}%). Норма: 12-25%"))
        elif pct > 30:
            issues.append(ValidationIssue("warning", "HIGH_OVERHEAD",
                f"Высокие накладные расходы ({pct}%)"))
        return issues

    def _check_profit_range(self, estimate: Estimate) -> List[ValidationIssue]:
        pct = estimate.profit_percent or 0
        issues = []
        if pct < 5 and pct > 0:
            issues.append(ValidationIssue("info", "LOW_PROFIT",
                f"Низкая сметная прибыль ({pct}%). Норма: 8-12%"))
        elif pct > 20:
            issues.append(ValidationIssue("warning", "HIGH_PROFIT",
                f"Высокая сметная прибыль ({pct}%)"))
        return issues

    def _check_duplicates(self, estimate: Estimate) -> List[ValidationIssue]:
        issues = []
        names = {}
        for item in estimate.items:
            if item.row_type in ('comment', 'spr', 'empt', 'irazd'):
                continue
            key = (item.name or "").lower().strip()
            if key in names:
                issues.append(ValidationIssue("warning", "DUPLICATE",
                    f"Дублирующаяся позиция: '{item.name}'",
                    item_id=item.id))
            names[key] = item.id
        return issues

    def _check_sections(self, estimate: Estimate) -> List[ValidationIssue]:
        issues = []
        orphan_items = [i for i in estimate.items if not i.section_id]
        if orphan_items and estimate.sections:
            issues.append(ValidationIssue("info", "NO_SECTION",
                f"{len(orphan_items)} позиций не привязаны к разделу"))
        return issues

    def _check_quantities(self, estimate: Estimate) -> List[ValidationIssue]:
        issues = []
        for item in estimate.items:
            if item.row_type in ('comment', 'spr', 'empt', 'irazd'):
                continue
            if (item.quantity or 0) <= 0:
                issues.append(ValidationIssue("warning", "ZERO_QTY",
                    f"Позиция '{item.name}' имеет нулевое количество",
                    item_id=item.id))
        return issues

    def _check_vat(self, estimate: Estimate) -> List[ValidationIssue]:
        issues = []
        vat = estimate.vat_percent
        if vat is not None and vat not in (0, 5, 10, 20):
            issues.append(ValidationIssue("warning", "UNUSUAL_VAT",
                f"Нестандартная ставка НДС: {vat}%. Стандартные: 0%, 5%, 10%, 20%"))
        return issues
