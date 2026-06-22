"""
Финансовый сервис — расчёты маржинальности, P&L, аналитика
"""

from typing import Dict, Any, List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.estimate import Estimate, EstimateItem
from app.models.erp_models import ProjectFinance, LaborPayment, MaterialUsage
from app.models.project import Project


class FinanceService:
    """Финансовые расчёты и аналитика"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_estimate_pnl(self, estimate_id: int) -> Dict[str, Any]:
        """P&L (прибыль и убытки) по смете"""
        result = await self.db.execute(
            select(Estimate).where(Estimate.id == estimate_id)
        )
        estimate = result.scalar_one_or_none()
        if not estimate:
            return {}

        revenue = estimate.total_with_vat or 0
        labor = estimate.labor_cost or 0
        materials = estimate.materials_cost or 0
        machines = estimate.machines_cost or 0
        direct_costs = labor + materials + machines

        overhead = estimate.overhead_cost or 0
        profit = estimate.profit_cost or 0
        vat = estimate.vat_cost or 0

        gross_profit = revenue - direct_costs - vat
        net_profit = profit

        return {
            "estimate_id": estimate_id,
            "revenue": revenue,
            "direct_costs": {
                "labor": labor,
                "materials": materials,
                "machines": machines,
                "total": direct_costs,
            },
            "overhead": overhead,
            "gross_profit": round(gross_profit, 2),
            "net_profit": round(net_profit, 2),
            "vat": vat,
            "margin_percent": round(gross_profit / revenue * 100, 2) if revenue > 0 else 0,
            "markup_percent": round(gross_profit / direct_costs * 100, 2) if direct_costs > 0 else 0,
        }

    async def get_project_finance_summary(self, project_id: int) -> Dict[str, Any]:
        """Финансовая сводка по проекту (все сметы)"""
        result = await self.db.execute(
            select(Estimate).where(Estimate.project_id == project_id)
        )
        estimates = result.scalars().all()

        total_revenue = 0.0
        total_labor = 0.0
        total_materials = 0.0
        total_overhead = 0.0
        total_profit = 0.0

        for est in estimates:
            total_revenue += est.total_with_vat or 0
            total_labor += est.labor_cost or 0
            total_materials += est.materials_cost or 0
            total_overhead += est.overhead_cost or 0
            total_profit += est.profit_cost or 0

        return {
            "project_id": project_id,
            "estimates_count": len(estimates),
            "total_revenue": round(total_revenue, 2),
            "total_labor": round(total_labor, 2),
            "total_materials": round(total_materials, 2),
            "total_overhead": round(total_overhead, 2),
            "total_profit": round(total_profit, 2),
            "total_margin": round(total_overhead + total_profit, 2),
        }

    async def calculate_labor_payments(
        self,
        estimate_id: int,
        master_rate: float = 0.4,
        brigade_rate: float = 0.35,
    ) -> List[Dict]:
        """Рассчитать ФОТ по позициям сметы"""
        result = await self.db.execute(
            select(EstimateItem)
            .where(
                EstimateItem.estimate_id == estimate_id,
                EstimateItem.row_type.in_(('pr', 'rascenka', 'work', None))
            )
        )
        items = result.scalars().all()

        payments = []
        for item in items:
            labor_total = item.labor_total or 0
            if labor_total <= 0:
                continue

            master_price = round(labor_total * master_rate, 2)
            brigade_price = round(labor_total * brigade_rate, 2)
            company_margin = round(labor_total - master_price - brigade_price, 2)

            # Создаём или обновляем запись
            pay_result = await self.db.execute(
                select(LaborPayment)
                .where(LaborPayment.estimate_item_id == item.id)
            )
            payment = pay_result.scalar_one_or_none()

            if not payment:
                payment = LaborPayment(estimate_item_id=item.id)
                self.db.add(payment)

            payment.master_price = master_price
            payment.brigade_price = brigade_price
            payment.company_margin = company_margin
            payment.total_payment = labor_total

            payments.append({
                "item_id": item.id,
                "item_name": item.name,
                "labor_total": labor_total,
                "master_price": master_price,
                "brigade_price": brigade_price,
                "company_margin": company_margin,
            })

        await self.db.flush()
        return payments
