"""
WorkGeneratorAgent — генерация списка работ по помещениям и типу ремонта.
"""
import logging
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ai.agents.base_agent import BaseAgent
from models import Work

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """
Ты — профессиональный сметчик. На основе списка помещений и типа ремонта
сгенерируй полный список строительно-отделочных работ.

Для каждой работы укажи:
- section: название раздела (Демонтаж, Черновые работы, Чистовая отделка, и т.д.)
- room: помещение
- name: наименование работы
- unit: единица измерения (м², м.п., шт, компл)
- price_work: цена за работу (руб/ед)
- price_material: цена за материал (руб/ед)
- category: категория работы

Ответ строго JSON:
{
    "works": [
        {
            "section": "Демонтажные работы",
            "room": "Гостиная",
            "name": "Демонтаж старых обоев",
            "unit": "м²",
            "price_work": 120,
            "price_material": 0,
            "category": "demolition"
        }
    ]
}
"""


class WorkGeneratorAgent(BaseAgent):

    async def generate(
        self,
        rooms: list[dict],
        repair_type: str = "стандартный",
        object_analysis: dict | None = None,
        design_analysis: dict | None = None,
    ) -> list[dict]:
        # Загружаем справочник работ из БД
        db_works = await self._load_works_catalog()

        user_prompt = f"""
Тип ремонта: {repair_type}

Помещения:
{self._format_rooms(rooms)}

Справочник доступных работ (используй цены из него, если работа совпадает):
{self._format_catalog(db_works)}
"""
        if design_analysis:
            user_prompt += f"\nДанные дизайн-проекта: {design_analysis}"

        result = await self._call_llm(SYSTEM_PROMPT, user_prompt)
        works = result.get("works", [])

        # Матчим с БД-справочником для получения work_id
        for work in works:
            matched = self._match_work(work, db_works)
            if matched:
                work["work_id"] = str(matched.id)
                if work.get("price_work", 0) == 0:
                    work["price_work"] = matched.base_price
                if work.get("price_material", 0) == 0:
                    work["price_material"] = matched.labor_cost  # fallback

        logger.info("WorkGenerator: сгенерировано %d работ", len(works))
        return works

    async def _load_works_catalog(self) -> list[Work]:
        result = await self.db.execute(select(Work).limit(500))
        return list(result.scalars().all())

    @staticmethod
    def _format_rooms(rooms: list[dict]) -> str:
        lines = []
        for r in rooms:
            lines.append(
                f"- {r.get('name', '?')}: "
                f"площадь={r.get('area', 0)} м², "
                f"периметр={r.get('perimeter', 0)} м, "
                f"стены={r.get('wall_area', 0)} м², "
                f"мокрая зона={'да' if r.get('has_wet_zone') else 'нет'}"
            )
        return "\n".join(lines)

    @staticmethod
    def _format_catalog(works: list[Work]) -> str:
        lines = []
        for w in works[:100]:  # Ограничиваем
            lines.append(
                f"[{w.code}] {w.name} ({w.category}): "
                f"{w.base_price} руб/{w.unit}"
            )
        return "\n".join(lines) if lines else "Справочник пуст"

    @staticmethod
    def _match_work(work_data: dict, catalog: list[Work]) -> Optional[Work]:
        """Нечёткий поиск работы в справочнике."""
        name = work_data.get("name", "").lower()
        best_match = None
        best_score = 0

        for w in catalog:
            # Простое совпадение по ключевым словам
            w_name = w.name.lower()
            common_words = set(name.split()) & set(w_name.split())
            score = len(common_words) / max(len(name.split()), 1)
            if score > best_score and score > 0.3:
                best_score = score
                best_match = w

        return best_match
