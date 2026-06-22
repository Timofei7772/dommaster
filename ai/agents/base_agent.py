"""
Базовый класс для всех AI-агентов.
"""
import json
import logging
from typing import Optional

import openai
from sqlalchemy.ext.asyncio import AsyncSession

from config import config

logger = logging.getLogger(__name__)


class BaseAgent:
    """Общий предок всех агентов: хранит db-сессию и вызывает LLM."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.client = openai.AsyncOpenAI(api_key=config.ai.openai_api_key)

    async def _call_llm(
        self,
        system_prompt: str,
        user_prompt: str,
        *,
        model: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
        response_format: str = "json",
    ) -> dict:
        model = model or config.ai.model_primary
        temperature = temperature if temperature is not None else config.ai.temperature
        max_tokens = max_tokens or config.ai.max_tokens

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        kwargs = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if response_format == "json":
            kwargs["response_format"] = {"type": "json_object"}

        try:
            response = await self.client.chat.completions.create(**kwargs)
            content = response.choices[0].message.content

            if response_format == "json":
                return json.loads(content)
            return {"text": content}

        except Exception as e:
            logger.exception("Ошибка вызова LLM (%s)", model)
            return {"error": str(e)}

    async def _call_vision(
        self,
        prompt: str,
        image_data: bytes,
        *,
        model: str | None = None,
    ) -> dict:
        import base64

        model = model or config.ai.model_vision
        b64 = base64.b64encode(image_data).decode("utf-8")

        try:
            response = await self.client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{b64}",
                                },
                            },
                        ],
                    },
                ],
                max_tokens=config.ai.max_tokens,
                response_format={"type": "json_object"},
            )
            content = response.choices[0].message.content
            return json.loads(content)
        except Exception as e:
            logger.exception("Ошибка Vision API")
            return {"error": str(e)}
