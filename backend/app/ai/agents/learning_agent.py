"""
Агент обучения — анализ исторических данных для улучшения точности
"""

from typing import Dict, Any, List
from sqlalchemy import select, func

from app.ai.base_agent import BaseAgent
from app.models.estimate import Estimate, EstimateItem
from app.models.erp_models import ProjectFinance


class LearningAgent(BaseAgent):
    name = "LearningAgent"
    description = "Самообучение на исторических данных для улучшения прогнозов"
    system_prompt = "Ты — аналитик данных строительной компании."

    async def _process(self, task: Dict[str, Any]) -> Dict[str, Any]:
        action = task.get("action", "analyze_history")

        if action == "analyze_history":
            return await self._analyze_history()
        elif action == "get_benchmarks":
            return await self._get_benchmarks()
        elif action == "suggest_prices":
            return await self._suggest_prices(task)

        return {"error": f"Неизвестное действие: {action}"}

    async def _analyze_history(self) -> Dict[str, Any]:
        """Анализ исторических смет"""
        result = await self.db.execute(
            select(
                func.count(Estimate.id),
                func.avg(Estimate.total_with_vat),
                func.avg(Estimate.overhead_percent),
                func.avg(Estimate.profit_percent),
            )
        )
        row = result.one()
        total_count, avg_cost, avg_overhead, avg_profit = row

        return {
            "history_analysis": {
                "total_estimates": total_count or 0,
                "avg_cost": round(avg_cost or 0, 2),
                "avg_overhead_percent": round(avg_overhead or 0, 2),
                "avg_profit_percent": round(avg_profit or 0, 2),
            }
        }

    async def _get_benchmarks(self) -> Dict[str, Any]:
        """Получить бенчмарки по типам работ"""
        result = await self.db.execute(
            select(
                EstimateItem.row_type,
                func.count(EstimateItem.id),
                func.avg(EstimateItem.labor_price),
                func.avg(EstimateItem.materials_price),
            )
            .group_by(EstimateItem.row_type)
        )
        rows = result.all()

        benchmarks = {}
        for row_type, count, avg_labor, avg_mat in rows:
            benchmarks[row_type or "pr"] = {
                "count": count,
                "avg_labor_price": round(avg_labor or 0, 2),
                "avg_materials_price": round(avg_mat or 0, 2),
            }

        return {"benchmarks": benchmarks}

    async def _suggest_prices(self, task: Dict) -> Dict[str, Any]:
        """Предложить цены на основе истории"""
        work_name = task.get("work_name", "")
        if not work_name:
            return {"suggestions": []}

        result = await self.db.execute(
            select(EstimateItem)
            .where(EstimateItem.name.ilike(f"%{work_name}%"))
            .limit(20)
        )
        items = result.scalars().all()

        if not items:
            return {"suggestions": [], "message": "Нет исторических данных"}

        avg_labor = sum(i.labor_price or 0 for i in items) / len(items)
        avg_mat = sum(i.materials_price or 0 for i in items) / len(items)

        return {
            "suggestions": {
                "work_name": work_name,
                "sample_size": len(items),
                "avg_labor_price": round(avg_labor, 2),
                "avg_materials_price": round(avg_mat, 2),
                "min_labor": round(min(i.labor_price or 0 for i in items), 2),
                "max_labor": round(max(i.labor_price or 0 for i in items), 2),
            }
        }
