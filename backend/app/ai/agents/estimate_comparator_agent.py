"""
AI-агент сравнения сметных позиций с рыночными ценами
"""

from typing import Dict, Any, List, Optional
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.ai.base_agent import BaseAgent
from app.ai.prompts import ESTIMATE_COMPARATOR_PROMPT
from app.models.estimate import Estimate, EstimateItem


class EstimateComparatorAgent(BaseAgent):
    name = "EstimateComparator"
    description = "Сравнение сметных позиций с рыночными ценами"
    system_prompt = ESTIMATE_COMPARATOR_PROMPT

    async def _process(self, task: Dict[str, Any]) -> Dict[str, Any]:
        items_data = await self._resolve_items(task)

        if not items_data:
            return {"comparison": {"error": "Нет позиций для анализа"}}

        prompt = self._build_prompt(items_data)
        comparison = await self.ask_llm_json(prompt)
        return {"comparison": comparison}

    async def _resolve_items(self, task: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Извлекает список позиций из задачи: либо прямой массив, либо из БД."""
        raw_items = task.get("items")
        if raw_items is not None and isinstance(raw_items, list):
            # Прямая передача данных (из загруженного JSON / XLSX)
            return [
                {
                    "name": i.get("name", ""),
                    "unit": i.get("unit", "шт"),
                    "quantity": float(i.get("quantity", 1) or 1),
                    "materials_price": float(i.get("materials_price", 0) or 0),
                    "labor_price": float(i.get("labor_price", 0) or 0),
                    "total": float(i.get("total", 0) or 0),
                    "justification": i.get("justification"),
                    "row_type": i.get("row_type", "pr"),
                }
                for i in raw_items
                if i.get("row_type") not in ("comment", "spr", "empt", "irazd",
                                               "irazdp", "irazdm", "itog", "itogp", "itogm")
                   and (i.get("total") or i.get("materials_price") or i.get("labor_price"))
            ]

        estimate_id = task.get("estimate_id")
        if not estimate_id:
            return []

        result = await self.db.execute(
            select(Estimate)
            .options(selectinload(Estimate.items))
            .where(Estimate.id == estimate_id)
        )
        estimate = result.scalar_one_or_none()
        if not estimate:
            return []

        items = []
        for item in estimate.items:
            if item.row_type in ("comment", "spr", "empt", "irazd",
                                  "irazdp", "irazdm", "itog", "itogp", "itogm"):
                continue
            unit_price = (
                item.labor_price + item.materials_price + item.machines_price
            )
            if unit_price == 0 and item.total == 0:
                continue
            items.append({
                "name": item.name,
                "unit": item.unit,
                "quantity": item.quantity or 1,
                "materials_price": item.materials_price or 0,
                "labor_price": item.labor_price or 0,
                "total": item.total or 0,
                "justification": item.justification,
                "row_type": item.row_type,
            })

        return items

    def _build_prompt(self, items: List[Dict[str, Any]]) -> str:
        """Формирует текст запроса для LLM."""
        total = len(items)

        items_lines = []
        for idx, item in enumerate(items, 1):
            unit_price = (
                item["labor_price"] + item["materials_price"]
            )
            just = f" (шифр: {item['justification']})" if item.get("justification") else ""
            items_lines.append(
                f"{idx}. [{item['row_type']}] {item['name']}{just}\n"
                f"   Ед.: {item['unit']}, Кол-во: {item['quantity']}, "
                f"Цена за ед.: {unit_price:.2f}, Итого: {item['total']:.2f}"
            )

        items_text = "\n".join(items_lines)

        return f"""Проанализируй смету из {total} позиций и сравни с рыночными ценами.

Позиции:
{items_text}

Для каждой позиции определи справедливую рыночную цену за единицу и сравни с фактической.
Верни полный JSON-отчёт по всем позициям."""
