"""
ObjectAnalyzerAgent — анализ объекта по фото / текстовому описанию.
"""
import logging
from typing import Optional

from ai.agents.base_agent import BaseAgent

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """
Ты — эксперт-сметчик в строительстве. Проанализируй описание объекта
и/или фотографии. Определи:

1. Тип объекта (квартира, дом, офис, коммерческое помещение)
2. Список помещений с размерами
3. Текущее состояние (черновая отделка, требуется ремонт, и т.д.)
4. Тип требуемого ремонта (косметический, капитальный, дизайнерский)
5. Особенности (высокие потолки, нестандартная планировка и т.д.)

Ответь строго в JSON:
{
    "object_type": "квартира",
    "total_area": 75.0,
    "ceiling_height": 2.7,
    "condition": "черновая отделка",
    "repair_type": "капитальный",
    "rooms": [
        {
            "name": "Гостиная",
            "area": 25.0,
            "perimeter": 20.0,
            "ceiling_height": 2.7,
            "wall_area": 54.0,
            "floor_type": "ламинат",
            "wall_type": "обои",
            "ceiling_type": "натяжной",
            "has_wet_zone": false,
            "features": []
        }
    ],
    "features": ["высокие потолки"],
    "confidence": 0.85
}
"""


class ObjectAnalyzerAgent(BaseAgent):

    async def analyze(
        self,
        description: str = "",
        photos: list[bytes] | None = None,
        area: float = 0,
        repair_type: str = "",
    ) -> dict:
        # Если есть фотографии — анализируем через Vision
        photo_analysis = []
        if photos:
            for i, photo in enumerate(photos):
                result = await self._call_vision(
                    "Проанализируй фотографию помещения. "
                    "Определи: тип помещения, состояние, размеры (приблизительно), "
                    "материалы отделки. Ответь в JSON.",
                    photo,
                )
                photo_analysis.append(result)

        user_prompt = f"""
Описание объекта: {description}
Площадь: {area} м²
Тип ремонта: {repair_type}
"""
        if photo_analysis:
            user_prompt += f"\nАнализ фотографий: {photo_analysis}"

        result = await self._call_llm(SYSTEM_PROMPT, user_prompt)

        # Если помещения не определены — генерируем стандартные
        if not result.get("rooms") and area > 0:
            result["rooms"] = self._generate_default_rooms(area, repair_type)

        logger.info(
            "ObjectAnalyzer: тип=%s, комнат=%d, площадь=%.1f",
            result.get("object_type", "?"),
            len(result.get("rooms", [])),
            result.get("total_area", 0),
        )
        return result

    @staticmethod
    def _generate_default_rooms(area: float, repair_type: str) -> list[dict]:
        """Стандартная раскладка помещений по площади."""
        rooms = []
        if area <= 35:
            rooms = [
                {"name": "Комната", "area": area * 0.45},
                {"name": "Кухня", "area": area * 0.2},
                {"name": "Санузел", "area": area * 0.1, "has_wet_zone": True},
                {"name": "Коридор", "area": area * 0.15},
                {"name": "Балкон", "area": area * 0.1},
            ]
        elif area <= 65:
            rooms = [
                {"name": "Гостиная", "area": area * 0.3},
                {"name": "Спальня", "area": area * 0.2},
                {"name": "Кухня", "area": area * 0.15},
                {"name": "Ванная", "area": area * 0.07, "has_wet_zone": True},
                {"name": "Туалет", "area": area * 0.03, "has_wet_zone": True},
                {"name": "Коридор", "area": area * 0.15},
                {"name": "Балкон", "area": area * 0.1},
            ]
        else:
            rooms = [
                {"name": "Гостиная", "area": area * 0.25},
                {"name": "Спальня 1", "area": area * 0.15},
                {"name": "Спальня 2", "area": area * 0.12},
                {"name": "Кухня-столовая", "area": area * 0.18},
                {"name": "Ванная", "area": area * 0.06, "has_wet_zone": True},
                {"name": "Туалет", "area": area * 0.03, "has_wet_zone": True},
                {"name": "Коридор", "area": area * 0.12},
                {"name": "Балкон/Лоджия", "area": area * 0.09},
            ]

        ceiling_height = 2.7
        for room in rooms:
            room["area"] = round(room["area"], 1)
            room["ceiling_height"] = ceiling_height
            room.setdefault("has_wet_zone", False)
            # Приблизительный периметр (комната ≈ прямоугольник)
            side = room["area"] ** 0.5
            room["perimeter"] = round(side * 4, 1)
            room["wall_area"] = round(room["perimeter"] * ceiling_height, 1)

        return rooms
