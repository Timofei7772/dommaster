"""
Сервис управления сметами — бизнес-логика
"""

from typing import Optional, List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload

from app.models.estimate import Estimate, EstimateItem, EstimateSection, EstimateStatus
from app.models.erp_models import ProjectFinance
from app.models.versioning import EstimateVersion


class EstimateService:
    """Бизнес-логика работы со сметами"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_estimate_with_items(self, estimate_id: int) -> Optional[Estimate]:
        """Получить смету со всеми позициями и разделами"""
        result = await self.db.execute(
            select(Estimate)
            .options(
                selectinload(Estimate.items),
                selectinload(Estimate.sections),
            )
            .where(Estimate.id == estimate_id)
        )
        return result.scalar_one_or_none()

    async def recalculate_estimate(self, estimate_id: int) -> Estimate:
        """Пересчитать смету и обновить финансовую сводку"""
        estimate = await self.get_estimate_with_items(estimate_id)
        if not estimate:
            raise ValueError(f"Смета {estimate_id} не найдена")

        estimate.recalculate()
        await self._update_project_finance(estimate)
        await self.db.flush()
        return estimate

    async def duplicate_estimate(self, estimate_id: int, new_name: Optional[str] = None) -> Estimate:
        """Дублировать смету"""
        source = await self.get_estimate_with_items(estimate_id)
        if not source:
            raise ValueError(f"Смета {estimate_id} не найдена")

        new_estimate = Estimate(
            name=new_name or f"{source.name} (копия)",
            project_id=source.project_id,
            estimate_type=source.estimate_type,
            status=EstimateStatus.DRAFT,
            work_coef=source.work_coef,
            material_coef=source.material_coef,
            overhead_percent=source.overhead_percent,
            profit_percent=source.profit_percent,
            vat_percent=source.vat_percent,
            vat_on_top=source.vat_on_top,
            price_index=source.price_index,
        )
        self.db.add(new_estimate)
        await self.db.flush()

        # Копируем разделы
        section_map = {}
        for section in source.sections:
            new_section = EstimateSection(
                estimate_id=new_estimate.id,
                number=section.number,
                name=section.name,
                order_index=section.order_index,
            )
            self.db.add(new_section)
            await self.db.flush()
            section_map[section.id] = new_section.id

        # Копируем позиции
        for item in source.items:
            new_item = EstimateItem(
                estimate_id=new_estimate.id,
                section_id=section_map.get(item.section_id),
                item_number=item.item_number,
                order_index=item.order_index,
                justification=item.justification,
                name=item.name,
                description=item.description,
                unit=item.unit,
                quantity=item.quantity,
                materials_price=item.materials_price,
                labor_price=item.labor_price,
                machines_price=item.machines_price,
                row_type=item.row_type,
                quantity_expr=item.quantity_expr,
                is_work=item.is_work,
                work_id=item.work_id,
                material_id=item.material_id,
            )
            self.db.add(new_item)

        await self.db.flush()
        return await self.recalculate_estimate(new_estimate.id)

    async def create_version(self, estimate_id: int, changes: str = "", user_id: int = None) -> EstimateVersion:
        """Создать версию сметы"""
        estimate = await self.get_estimate_with_items(estimate_id)
        if not estimate:
            raise ValueError(f"Смета {estimate_id} не найдена")

        # Определяем номер версии
        result = await self.db.execute(
            select(func.max(EstimateVersion.version_number))
            .where(EstimateVersion.estimate_id == estimate_id)
        )
        max_version = result.scalar() or 0

        # Создаём снапшот
        snapshot = {
            "total_cost": estimate.total_cost,
            "total_with_vat": estimate.total_with_vat,
            "items_count": len(estimate.items),
            "overhead_percent": estimate.overhead_percent,
            "profit_percent": estimate.profit_percent,
        }

        version = EstimateVersion(
            estimate_id=estimate_id,
            version_number=max_version + 1,
            changes=changes,
            snapshot=snapshot,
            created_by=user_id,
        )
        self.db.add(version)
        await self.db.flush()
        return version

    async def get_statistics(self, estimate_id: int) -> Dict[str, Any]:
        """Статистика по смете"""
        estimate = await self.get_estimate_with_items(estimate_id)
        if not estimate:
            return {}

        items = estimate.items
        work_items = [i for i in items if i.row_type in ('pr', 'rascenka', 'work', None)]
        mat_items = [i for i in items if i.row_type in ('material', 'mat')]

        return {
            "total_items": len(items),
            "work_items": len(work_items),
            "material_items": len(mat_items),
            "sections_count": len(estimate.sections),
            "labor_cost": estimate.labor_cost,
            "materials_cost": estimate.materials_cost,
            "overhead_cost": estimate.overhead_cost,
            "profit_cost": estimate.profit_cost,
            "total_cost": estimate.total_cost,
            "vat_cost": estimate.vat_cost,
            "total_with_vat": estimate.total_with_vat,
        }

    async def _update_project_finance(self, estimate: Estimate):
        """Обновить финансовую сводку"""
        result = await self.db.execute(
            select(ProjectFinance).where(ProjectFinance.estimate_id == estimate.id)
        )
        finance = result.scalar_one_or_none()

        if not finance:
            finance = ProjectFinance(estimate_id=estimate.id)
            self.db.add(finance)

        finance.labor_cost = estimate.labor_cost or 0
        finance.material_cost = estimate.materials_cost or 0
        finance.overhead_percent = estimate.overhead_percent or 0
        finance.profit_percent = estimate.profit_percent or 0
        finance.vat_percent = estimate.vat_percent or 20
        finance.total_price = estimate.total_with_vat or 0

        # Маржа = прибыль (overhead + profit)
        finance.margin = round((estimate.overhead_cost or 0) + (estimate.profit_cost or 0), 2)

        # Рентабельность
        base = (estimate.labor_cost or 0) + (estimate.materials_cost or 0)
        if base > 0:
            finance.profitability = round(finance.margin / base * 100, 2)

        await self.db.flush()
