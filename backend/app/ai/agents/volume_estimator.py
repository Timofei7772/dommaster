"""
Агент расчёта объёмов — площади стен, пола, периметры
"""

from typing import Dict, Any
from app.ai.base_agent import BaseAgent
from app.ai.prompts import VOLUME_ESTIMATOR_PROMPT


class VolumeEstimatorAgent(BaseAgent):
    name = "VolumeEstimator"
    description = "Расчёт объёмов работ (площади, периметры, м²)"
    system_prompt = VOLUME_ESTIMATOR_PROMPT

    async def _process(self, task: Dict[str, Any]) -> Dict[str, Any]:
        object_analysis = task.get("object_analysis", {})
        generated_works = task.get("generated_works", {})

        rooms = object_analysis.get("rooms", [])
        if not rooms:
            rooms = [{"name": "Помещение", "area": task.get("area", 50), "height": 2.7}]

        # Расчёт базовых параметров
        room_params = []
        for room in rooms:
            area = room.get("area", 0)
            height = room.get("height", 2.7)
            # Приблизительный периметр (считаем квадрат)
            side = area ** 0.5 if area > 0 else 0
            perimeter = room.get("perimeter", side * 4)
            wall_area = perimeter * height

            room_params.append({
                "name": room.get("name", ""),
                "floor_area": area,
                "ceiling_area": area,
                "wall_area": round(wall_area, 2),
                "perimeter": round(perimeter, 2),
                "height": height,
            })

        # LLM уточняет объёмы с учётом типов работ
        prompt = f"""Рассчитай точные объёмы для следующих работ и помещений:

Помещения: {room_params}
Работы: {generated_works}

Учти проёмы (двери ~2м², окна ~2.5м²) и особенности каждого типа работ."""

        volumes = await self.ask_llm_json(prompt)

        return {
            "room_params": room_params,
            "volume_calculations": volumes,
        }
