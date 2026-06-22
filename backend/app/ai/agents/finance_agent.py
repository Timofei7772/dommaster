"""
Агент финансовых расчётов — себестоимость, накладные, прибыль, НДС
"""

from typing import Dict, Any
from app.ai.base_agent import BaseAgent
from app.ai.prompts import FINANCE_AGENT_PROMPT


class FinanceAgent(BaseAgent):
    name = "FinanceAgent"
    description = "Финансовые расчёты: себестоимость, накладные, прибыль, НДС"
    system_prompt = FINANCE_AGENT_PROMPT

    async def _process(self, task: Dict[str, Any]) -> Dict[str, Any]:
        matched_works = task.get("matched_works", [])
        calculated_materials = task.get("calculated_materials", {})
        volume_calculations = task.get("volume_calculations", {})
        area = task.get("area", 0)

        # Суммируем стоимости
        total_labor = 0.0
        total_materials = 0.0
        for match in matched_works:
            db = match.get("db_match")
            gen = match.get("generated", {})
            qty = gen.get("quantity", 0)
            if db:
                total_labor += (db.get("total_price", 0) - 0) * qty  # Упрощённо
                total_materials += 0  # Материалы считаются отдельно

        # Стоимость материалов из расчёта
        materials_list = calculated_materials.get("materials", [])
        for mat in materials_list:
            total_materials += mat.get("total_with_waste", 0) * mat.get("estimated_price", 0)

        # Финансовый расчёт
        direct_costs = total_labor + total_materials
        overhead_percent = 15.0
        profit_percent = 10.0
        vat_percent = 20.0

        overhead = round(direct_costs * overhead_percent / 100, 2)
        profit = round((direct_costs + overhead) * profit_percent / 100, 2)
        subtotal = round(direct_costs + overhead + profit, 2)
        vat = round(subtotal * vat_percent / 100, 2)
        total = round(subtotal + vat, 2)

        finance = {
            "direct_costs": {
                "labor": round(total_labor, 2),
                "materials": round(total_materials, 2),
                "machines": 0,
            },
            "overhead_percent": overhead_percent,
            "overhead_amount": overhead,
            "profit_percent": profit_percent,
            "profit_amount": profit,
            "subtotal": subtotal,
            "vat_percent": vat_percent,
            "vat_amount": vat,
            "total": total,
            "cost_per_sqm": round(total / area, 2) if area > 0 else 0,
        }

        return {"finance_calculation": finance}
