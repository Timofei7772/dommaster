"""
Финансовый сервис: расчёт себестоимости, наценки, маржи.
"""
import uuid
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import (
    Estimate, EstimateItem, ProjectFinance, LaborPayment,
)

logger = logging.getLogger(__name__)


class FinanceService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def calculate_project_finance(
        self, estimate_id: uuid.UUID,
    ) -> ProjectFinance:
        result = await self.db.execute(
            select(Estimate).where(Estimate.id == estimate_id)
        )
        estimate = result.scalar_one()

        items_result = await self.db.execute(
            select(EstimateItem).where(EstimateItem.estimate_id == estimate_id)
        )
        items = list(items_result.scalars().all())

        labor_cost = sum(i.total_work for i in items)
        material_cost = sum(i.total_material for i in items)
        subtotal = labor_cost + material_cost

        overhead = subtotal * estimate.overhead_percent / 100
        profit = (subtotal + overhead) * estimate.profit_percent / 100
        before_vat = subtotal + overhead + profit
        vat = before_vat * estimate.vat_percent / 100
        total = before_vat + vat

        fin_result = await self.db.execute(
            select(ProjectFinance).where(ProjectFinance.estimate_id == estimate_id)
        )
        finance = fin_result.scalar_one_or_none()

        if not finance:
            finance = ProjectFinance(estimate_id=estimate_id)
            self.db.add(finance)

        finance.labor_cost = round(labor_cost, 2)
        finance.material_cost = round(material_cost, 2)
        finance.overhead_percent = estimate.overhead_percent
        finance.overhead_amount = round(overhead, 2)
        finance.profit_percent = estimate.profit_percent
        finance.profit_amount = round(profit, 2)
        finance.vat_percent = estimate.vat_percent
        finance.vat_amount = round(vat, 2)
        finance.total_price = round(total, 2)
        finance.margin = round(profit, 2)
        finance.margin_percent = round(profit / total * 100, 2) if total > 0 else 0

        estimate.final_price = round(total, 2)

        await self.db.flush()
        logger.info(
            "Финансы сметы %s: себестоимость %.2f, итого %.2f, маржа %.1f%%",
            estimate.estimate_number, subtotal, total, finance.margin_percent,
        )
        return finance

    async def calculate_labor_payments(
        self,
        estimate_id: uuid.UUID,
        *,
        brigade_share: float = 0.4,  # доля бригады от стоимости работ
        master_share: float = 0.1,   # доля прораба
    ) -> list[LaborPayment]:
        result = await self.db.execute(
            select(EstimateItem).where(EstimateItem.estimate_id == estimate_id)
        )
        items = list(items_result.scalars().all())
        payments = []

        for item in items:
            brigade_price = round(item.total_work * brigade_share, 2)
            master_price = round(item.total_work * master_share, 2)
            company_margin = round(item.total_work - brigade_price - master_price, 2)

            pay_result = await self.db.execute(
                select(LaborPayment).where(
                    LaborPayment.estimate_item_id == item.id
                )
            )
            payment = pay_result.scalar_one_or_none()

            if not payment:
                payment = LaborPayment(estimate_item_id=item.id)
                self.db.add(payment)

            payment.brigade_price = brigade_price
            payment.master_price = master_price
            payment.company_margin = company_margin
            payment.total_payment = round(brigade_price + master_price, 2)
            payments.append(payment)

        await self.db.flush()
        return payments

    async def get_profitability_report(self, estimate_id: uuid.UUID) -> dict:
        finance = await self.calculate_project_finance(estimate_id)
        return {
            "estimate_id": str(estimate_id),
            "revenue": finance.total_price,
            "cost_of_labor": finance.labor_cost,
            "cost_of_materials": finance.material_cost,
            "total_cost": round(finance.labor_cost + finance.material_cost, 2),
            "overhead": finance.overhead_amount,
            "gross_profit": finance.profit_amount,
            "vat": finance.vat_amount,
            "net_margin_percent": finance.margin_percent,
            "breakeven_point": round(
                (finance.labor_cost + finance.material_cost + finance.overhead_amount), 2
            ),
        }
