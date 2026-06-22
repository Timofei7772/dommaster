"""
AI-агент распознавания рукописного текста с фото — OCR + коррекция
"""

from typing import Dict, Any
from app.ai.base_agent import BaseAgent
from app.ai.prompts import HANDWRITING_OCR_PROMPT


class HandwritingOCRAgent(BaseAgent):
    name = "HandwritingOCRAgent"
    description = "Распознавание рукописного текста с фотографии"
    system_prompt = HANDWRITING_OCR_PROMPT

    async def _process(self, task: Dict[str, Any]) -> Dict[str, Any]:
        image_data: bytes = task["image_data"]
        language: str = task.get("language", "ru")
        detail: str = task.get("detail", "high")

        # Шаг 1: Vision — распознать текст с изображения
        recognition_prompt = (
            f"Внимательно прочитай рукописный текст на этом изображении "
            f"(язык: {language}). "
            f"Верни ТОЛЬКО распознанный текст, без лишних слов. "
            f"Сохрани структуру строк, цифры, спецсимволы. "
            f"Если текст нечитаем, верни пустую строку."
        )
        recognized_text = await self.llm.vision(
            image_data=image_data,
            prompt=recognition_prompt,
            detail=detail,
        )
        recognized_text = recognized_text.strip()

        if not recognized_text:
            return {
                "recognized_text": "",
                "confidence_score": 0.0,
                "corrected_text": "",
                "corrections": [],
                "status": "no_text_detected",
            }

        # Шаг 2: Скоринг уверенности через LLM
        confidence_prompt = (
            f"Оцени уверенность распознавания следующего рукописного текста "
            f"от 0.0 до 1.0. Учитывай читаемость, возможные искажения символов, "
            f"разборчивость цифр и специальных знаков.\n\n"
            f"Текст:\n{recognized_text}\n\n"
            f"Ответь ТОЛЬКО числом от 0.0 до 1.0, например 0.85."
        )
        confidence_str = await self.ask_llm(confidence_prompt, temperature=0.0)
        try:
            confidence_score = float(confidence_str.strip())
            confidence_score = max(0.0, min(1.0, confidence_score))
        except (ValueError, TypeError):
            confidence_score = 0.5

        # Шаг 3: Коррекция орфографии через ask_llm_json
        correction_prompt = (
            f"Исправь орфографические и грамматические ошибки "
            f"в распознанном рукописном тексте. "
            f"Сохрани исходный смысл, числа, единицы измерения.\n\n"
            f"Текст:\n{recognized_text}\n\n"
            f"Верни JSON: corrected_text, confidence (общая уверенность 0-1), "
            f"corrections (список {{{{original, corrected, reason}}}})."
        )
        correction_result = await self.ask_llm_json(correction_prompt)

        return {
            "recognized_text": recognized_text,
            "confidence_score": round(confidence_score, 4),
            "corrected_text": correction_result.get("corrected_text", recognized_text),
            "corrections": correction_result.get("corrections", []),
            "status": "success",
        }
