"""
FinanceAgent — финансовый расчёт: себестоимость → накладные → прибыль → НДС.
"""
import logging

from ai.agents.base_agent import BaseAgent

logger = logging.getLogger(__name__)


class FinanceAgent(BaseAgent):

    async def calculate(
        self,
        works: list[dict],
        materials: list[dict],
        *,
        overhead_percent: float = 15.0,
        profit_percent: float = 20.0,
        vat_percent: float = 0.0,
    ) -> dict:
        # Стоимость работ
        total_work_cost = sum(
            w.get("quantity", 0) * w.get("price_work", 0) for w in works
        )

        # Стоимость материалов
        total_material_cost = sum(m.get("total", 0) for m in materials)

        # Если материалы не были рассчитаны отдельно — берём из работ
        if total_material_cost == 0:
            total_material_cost = sum(
                w.get("quantity", 0) * w.get("price_material", 0) for w in works
            )

        subtotal = total_work_cost + total_material_cost
        overhead = subtotal * overhead_percent / 100
        profit = (subtotal + overhead) * profit_percent / 100
        before_vat = subtotal + overhead + profit
        vat = before_vat * vat_percent / 100
        total = before_vat + vat

        result = {
            "total_work_cost": round(total_work_cost, 2),
            "total_material_cost": round(total_material_cost, 2),
            "subtotal": round(subtotal, 2),
            "overhead_percent": overhead_percent,
            "overhead_amount": round(overhead, 2),
            "profit_percent": profit_percent,
            "profit_amount": round(profit, 2),
            "vat_percent": vat_percent,
            "vat_amount": round(vat, 2),
            "total_price": round(total, 2),
            "margin_percent": round(profit / total * 100, 1) if total > 0 else 0,
        }

        logger.info(
            "FinanceAgent: работы=%.2f, материалы=%.2f, итого=%.2f, маржа=%.1f%%",
            total_work_cost, total_material_cost, total, result["margin_percent"],
        )
        return result
