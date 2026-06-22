"""
Центральный сервис работы со сметами.
Все операции CRUD + пересчёт итогов.
"""
import uuid
import logging
from datetime import datetime
from typing import Optional

from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from models import (
    Estimate, EstimateSection, EstimateItem, EstimateVersion,
    ProjectFinance, Work,
)

logger = logging.getLogger(__name__)


class EstimateService:
    def __init__(self, db: AsyncSession):
        self.db = db

    # ------------------------------------------------------------------ #
    #  Генерация номера сметы                                             #
    # ------------------------------------------------------------------ #
    async def _generate_number(self) -> str:
        result = await self.db.execute(
            select(sa_func.count(Estimate.id))
        )
        count = result.scalar() or 0
        return f"SM-{datetime.now().strftime('%Y%m')}-{count + 1:04d}"

    # ------------------------------------------------------------------ #
    #  CRUD                                                               #
    # ------------------------------------------------------------------ #
    async def create_estimate(
        self,
        project_id: uuid.UUID,
        name: str,
        *,
        overhead_percent: float = 15.0,
        profit_percent: float = 20.0,
        vat_percent: float = 0.0,
    ) -> Estimate:
        estimate = Estimate(
            project_id=project_id,
            name=name,
            estimate_number=await self._generate_number(),
            overhead_percent=overhead_percent,
            profit_percent=profit_percent,
            vat_percent=vat_percent,
        )
        self.db.add(estimate)
        await self.db.flush()

        # Финансовая запись
        finance = ProjectFinance(
            estimate_id=estimate.id,
            overhead_percent=overhead_percent,
            profit_percent=profit_percent,
            vat_percent=vat_percent,
        )
        self.db.add(finance)
        await self.db.flush()

        logger.info("Создана смета %s для проекта %s", estimate.estimate_number, project_id)
        return estimate

    async def get_estimate(self, estimate_id: uuid.UUID) -> Optional[Estimate]:
        result = await self.db.execute(
            select(Estimate)
            .options(
                selectinload(Estimate.sections).selectinload(EstimateSection.items),
                selectinload(Estimate.finance),
                selectinload(Estimate.documents),
            )
            .where(Estimate.id == estimate_id)
        )
        return result.scalar_one_or_none()

    async def list_estimates(self, project_id: uuid.UUID) -> list[Estimate]:
        result = await self.db.execute(
            select(Estimate)
            .where(Estimate.project_id == project_id)
            .order_by(Estimate.created_at.desc())
        )
        return list(result.scalars().all())

    # ------------------------------------------------------------------ #
    #  Разделы                                                            #
    # ------------------------------------------------------------------ #
    async def add_section(
        self, estimate_id: uuid.UUID, name: str, order_index: int = 0,
    ) -> EstimateSection:
        section = EstimateSection(
            estimate_id=estimate_id,
            name=name,
            order_index=order_index,
        )
        self.db.add(section)
        await self.db.flush()
        return section

    # ------------------------------------------------------------------ #
    #  Позиции                                                            #
    # ------------------------------------------------------------------ #
    async def add_item(
        self,
        estimate_id: uuid.UUID,
        section_id: uuid.UUID,
        *,
        name: str,
        unit: str = "м²",
        quantity: float = 0.0,
        price_work: float = 0.0,
        price_material: float = 0.0,
        work_id: Optional[uuid.UUID] = None,
    ) -> EstimateItem:
        total_work = round(quantity * price_work, 2)
        total_material = round(quantity * price_material, 2)

        item = EstimateItem(
            estimate_id=estimate_id,
            section_id=section_id,
            work_id=work_id,
            name=name,
            unit=unit,
            quantity=quantity,
            price_work=price_work,
            price_material=price_material,
            total_work=total_work,
            total_material=total_material,
            total_cost=round(total_work + total_material, 2),
            planned_volume=quantity,
            remaining_volume=quantity,
        )
        self.db.add(item)
        await self.db.flush()

        await self._recalculate_section(section_id)
        await self._recalculate_estimate(estimate_id)
        return item

    async def update_item(self, item_id: uuid.UUID, **kwargs) -> EstimateItem:
        result = await self.db.execute(
            select(EstimateItem).where(EstimateItem.id == item_id)
        )
        item = result.scalar_one()

        for key, value in kwargs.items():
            if hasattr(item, key):
                setattr(item, key, value)

        # Пересчёт строки
        item.total_work = round(item.quantity * item.price_work, 2)
        item.total_material = round(item.quantity * item.price_material, 2)
        item.total_cost = round(item.total_work + item.total_material, 2)
        item.remaining_volume = max(0, item.planned_volume - item.completed_volume)

        await self.db.flush()
        if item.section_id:
            await self._recalculate_section(item.section_id)
        await self._recalculate_estimate(item.estimate_id)
        return item

    async def delete_item(self, item_id: uuid.UUID) -> None:
        result = await self.db.execute(
            select(EstimateItem).where(EstimateItem.id == item_id)
        )
        item = result.scalar_one()
        estimate_id = item.estimate_id
        section_id = item.section_id

        await self.db.delete(item)
        await self.db.flush()

        if section_id:
            await self._recalculate_section(section_id)
        await self._recalculate_estimate(estimate_id)

    # ------------------------------------------------------------------ #
    #  Пересчёт                                                          #
    # ------------------------------------------------------------------ #
    async def _recalculate_section(self, section_id: uuid.UUID) -> None:
        result = await self.db.execute(
            select(EstimateItem).where(EstimateItem.section_id == section_id)
        )
        items = list(result.scalars().all())

        total_works = sum(i.total_work for i in items)
        total_materials = sum(i.total_material for i in items)

        sec_result = await self.db.execute(
            select(EstimateSection).where(EstimateSection.id == section_id)
        )
        section = sec_result.scalar_one()
        section.total_works = round(total_works, 2)
        section.total_materials = round(total_materials, 2)
        section.total_cost = round(total_works + total_materials, 2)
        await self.db.flush()

    async def _recalculate_estimate(self, estimate_id: uuid.UUID) -> None:
        result = await self.db.execute(
            select(EstimateItem).where(EstimateItem.estimate_id == estimate_id)
        )
        items = list(result.scalars().all())

        total_works = sum(i.total_work for i in items)
        total_materials = sum(i.total_material for i in items)
        subtotal = total_works + total_materials

        est_result = await self.db.execute(
            select(Estimate).where(Estimate.id == estimate_id)
        )
        estimate = est_result.scalar_one()
        estimate.total_works = round(total_works, 2)
        estimate.total_materials = round(total_materials, 2)
        estimate.total_cost = round(subtotal, 2)

        overhead = subtotal * estimate.overhead_percent / 100
        profit = (subtotal + overhead) * estimate.profit_percent / 100
        before_vat = subtotal + overhead + profit
        vat = before_vat * estimate.vat_percent / 100
        final = before_vat + vat
        discount = final * estimate.discount_percent / 100

        estimate.final_price = round(final - discount, 2)
        await self.db.flush()

        # Обновляем ProjectFinance
        fin_result = await self.db.execute(
            select(ProjectFinance).where(ProjectFinance.estimate_id == estimate_id)
        )
        finance = fin_result.scalar_one_or_none()
        if finance:
            finance.labor_cost = round(total_works, 2)
            finance.material_cost = round(total_materials, 2)
            finance.overhead_amount = round(overhead, 2)
            finance.profit_amount = round(profit, 2)
            finance.vat_amount = round(vat, 2)
            finance.total_price = round(estimate.final_price, 2)
            finance.margin = round(profit, 2)
            if estimate.final_price > 0:
                finance.margin_percent = round(profit / estimate.final_price * 100, 2)
            await self.db.flush()

    # ------------------------------------------------------------------ #
    #  Версионирование                                                    #
    # ------------------------------------------------------------------ #
    async def create_version_snapshot(
        self, estimate_id: uuid.UUID, changes: dict | None = None
    ) -> EstimateVersion:
        estimate = await self.get_estimate(estimate_id)
        if not estimate:
            raise ValueError(f"Смета {estimate_id} не найдена")

        snapshot = {
            "total_works": estimate.total_works,
            "total_materials": estimate.total_materials,
            "total_cost": estimate.total_cost,
            "final_price": estimate.final_price,
            "sections": [
                {
                    "name": s.name,
                    "total_cost": s.total_cost,
                    "items": [
                        {
                            "name": i.name,
                            "unit": i.unit,
                            "quantity": i.quantity,
                            "price_work": i.price_work,
                            "price_material": i.price_material,
                            "total_cost": i.total_cost,
                        }
                        for i in s.items
                    ],
                }
                for s in estimate.sections
            ],
        }

        version = EstimateVersion(
            estimate_id=estimate_id,
            version_number=estimate.version,
            changes=changes,
            snapshot=snapshot,
        )
        self.db.add(version)

        estimate.version += 1
        await self.db.flush()
        return version

    # ------------------------------------------------------------------ #
    #  Массовое добавление (для AI-генерации)                             #
    # ------------------------------------------------------------------ #
    async def bulk_add_items(
        self,
        estimate_id: uuid.UUID,
        items_data: list[dict],
    ) -> list[EstimateItem]:
        """
        Массовое добавление позиций, сгруппированных по разделам.
        items_data: [
            {
                "section": "Демонтажные работы",
                "items": [
                    {"name": "...", "unit": "м²", "quantity": 50, ...},
                ]
            }
        ]
        """
        created = []
        for section_data in items_data:
            section = await self.add_section(
                estimate_id,
                section_data["section"],
                order_index=len(created),
            )
            for idx, item_data in enumerate(section_data.get("items", [])):
                item = await self.add_item(
                    estimate_id=estimate_id,
                    section_id=section.id,
                    name=item_data["name"],
                    unit=item_data.get("unit", "м²"),
                    quantity=item_data.get("quantity", 0),
                    price_work=item_data.get("price_work", 0),
                    price_material=item_data.get("price_material", 0),
                    work_id=item_data.get("work_id"),
                )
                created.append(item)
        return created
