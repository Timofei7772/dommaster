"""
Агент генерации списка работ — создаёт работы на основе анализа объекта
"""

from typing import Dict, Any, List
from sqlalchemy import select

from app.ai.base_agent import BaseAgent
from app.ai.prompts import WORK_GENERATOR_PROMPT
from app.models.work import Work


class WorkGeneratorAgent(BaseAgent):
    name = "WorkGenerator"
    description = "Генерация списка работ для сметы на основе анализа объекта"
    system_prompt = WORK_GENERATOR_PROMPT

    async def _process(self, task: Dict[str, Any]) -> Dict[str, Any]:
        # Получаем анализ объекта от предыдущего агента
        object_analysis = task.get("object_analysis", {})
        design_analysis = task.get("design_analysis", {})

        context = ""
        if object_analysis:
            context += f"Анализ объекта: {object_analysis}\n"
        if design_analysis:
            context += f"Дизайн-проект: {design_analysis}\n"

        if not context:
            context = f"Описание: {task.get('description', 'Ремонт квартиры')}"

        # Генерируем работы через LLM
        prompt = f"""На основе данных об объекте сгенерируй полный список работ для сметы.
Учти все этапы: демонтаж, черновая отделка, чистовая отделка, инженерные работы.

{context}"""

        generated = await self.ask_llm_json(prompt)

        # Ищем соответствия в базе расценок
        matched_works = await self._match_with_database(generated)

        return {
            "generated_works": generated,
            "matched_works": matched_works,
        }

    async def _match_with_database(self, generated: Dict) -> List[Dict]:
        """Сопоставить сгенерированные работы с базой расценок"""
        matched = []
        sections = generated.get("sections", [])

        for section in sections:
            for work in section.get("works", []):
                work_name = work.get("name", "")
                # Поиск по ключевым словам
                keywords = work_name.lower().split()
                keywords = [k for k in keywords if len(k) > 3]

                if not keywords:
                    matched.append({
                        "generated": work,
                        "db_match": None,
                        "section": section.get("name", ""),
                    })
                    continue

                # Ищем в базе
                from sqlalchemy import or_
                conditions = [Work.name.ilike(f"%{kw}%") for kw in keywords[:3]]
                result = await self.db.execute(
                    select(Work)
                    .where(Work.is_active == True, or_(*conditions))
                    .limit(3)
                )
                db_works = result.scalars().all()

                best_match = None
                if db_works:
                    # Простой scoring
                    best_score = 0
                    for dbw in db_works:
                        score = sum(1 for kw in keywords if kw in dbw.name.lower())
                        if score > best_score:
                            best_score = score
                            best_match = {
                                "id": dbw.id,
                                "code": dbw.code,
                                "name": dbw.name,
                                "unit": dbw.unit,
                                "total_price": dbw.total_price,
                            }

                matched.append({
                    "generated": work,
                    "db_match": best_match,
                    "section": section.get("name", ""),
                })

        return matched
