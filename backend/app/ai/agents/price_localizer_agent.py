"""
Агент локализации цен — адаптирует расценки под регион (Республика Башкортостан)
"""

from typing import Dict, Any, Optional

from app.ai.base_agent import BaseAgent
from app.ai.prompts import PRICE_LOCALIZER_PROMPT


# Региональные справочные коэффициенты для РБ
BASHKORTOSTAN_COEFFICIENTS = {
    "wage_ural_coefficient": 1.15,
    "wage_ural_description": "Уральский коэффициент 15% к оплате труда (Постановление Госстроя РФ)",
    "default_material_index": 1.08,
    "default_material_description": "Индекс пересчёта сметной стоимости материалов по РБ (2025-2026)",
    "cities": {
        "салават": {
            "full_name": "Салават",
            "transport_adjustment": 1.02,
            "transport_note": "Развитая инфраструктура, близость к Уфе (160 км), ж/д станция",
            "material_index": 1.06,
        },
        "стерлитамак": {
            "full_name": "Стерлитамак",
            "transport_adjustment": 1.03,
            "transport_note": "Крупный промышленный узел, высокая конкуренция поставщиков",
            "material_index": 1.07,
        },
        "ишимбай": {
            "full_name": "Ишимбай",
            "transport_adjustment": 1.05,
            "transport_note": "Небольшой город, меньше поставщиков, удалённость от трассы М5",
            "material_index": 1.09,
        },
    },
}


class PriceLocalizerAgent(BaseAgent):
    name = "PriceLocalizer"
    description = "Локализация цен под регион Республики Башкортостан"
    system_prompt = PRICE_LOCALIZER_PROMPT

    def __init__(self, llm, db):
        super().__init__(llm, db)
        self._region_data = BASHKORTOSTAN_COEFFICIENTS

    async def _process(self, task: Dict[str, Any]) -> Dict[str, Any]:
        city = self._resolve_city(task.get("city", ""))
        work_name = task.get("work_name") or task.get("work", "")
        material_name = task.get("material_name") or task.get("material", "")

        if not city:
            return {"error": "Город не указан. Допустимые: Салават, Стерлитамак, Ишимбай"}

        if not work_name and not material_name:
            return {"error": "Не указано название работы или материала"}

        city_coeffs = self._region_data["cities"][city]

        # Подготавливаем контекст с региональными коэффициентами
        context = self._build_context(city, city_coeffs, work_name, material_name)

        prompt = (
            f"Рассчитай локализованную цену для {city_coeffs['full_name']}.\n\n"
            f"Работа: {work_name or 'не указана'}\n"
            f"Материал: {material_name or 'не указан'}\n\n"
            f"Используй предоставленные региональные коэффициенты для расчёта."
        )

        result = await self.ask_llm_json(prompt, context=context)

        # Добавляем справочные коэффициенты в результат
        result["_reference_coefficients"] = {
            "wage_ural_coefficient": self._region_data["wage_ural_coefficient"],
            "city": city_coeffs["full_name"],
            "transport_adjustment": city_coeffs["transport_adjustment"],
            "material_index": city_coeffs["material_index"],
        }

        return {"localization": result}

    def _resolve_city(self, raw: Optional[str]) -> Optional[str]:
        """Приводит название города к ключу справочника."""
        if not raw:
            return None
        normalized = raw.strip().lower()
        for key in self._region_data["cities"]:
            if normalized == key:
                return key
            # Проверяем частичное совпадение
            if normalized in key or key in normalized:
                return key
        return None

    def _build_context(
        self,
        city_key: str,
        city_coeffs: Dict[str, Any],
        work_name: str,
        material_name: str,
    ) -> str:
        """Формирует контекст с региональными коэффициентами для LLM."""
        general = self._region_data

        return (
            f"РЕГИОН: Республика Башкортостан\n"
            f"ГОРОД: {city_coeffs['full_name']}\n\n"
            f"--- Общие коэффициенты для РБ ---\n"
            f"- Уральский коэффициент к оплате труда: {general['wage_ural_coefficient']} "
            f"({general['wage_ural_description']})\n"
            f"- Базовый индекс материалов: {general['default_material_index']} "
            f"({general['default_material_description']})\n\n"
            f"--- Коэффициенты для города {city_coeffs['full_name']} ---\n"
            f"- Транспортная надбавка: {city_coeffs['transport_adjustment']} "
            f"({city_coeffs['transport_note']})\n"
            f"- Индекс материалов по городу: {city_coeffs['material_index']}\n\n"
            f"--- Анализируемая позиция ---\n"
            f"Работа: {work_name or 'не указана'}\n"
            f"Материал: {material_name or 'не указан'}\n"
        )
