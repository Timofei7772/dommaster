"""
Абстракция LLM-провайдера — поддержка OpenAI, Anthropic, Gemini
"""

from typing import Optional, List, Dict, Any
from abc import ABC, abstractmethod
import json
import logging

from app.config import settings

logger = logging.getLogger(__name__)


class LLMProvider(ABC):
    """Базовый интерфейс LLM"""

    @abstractmethod
    async def chat(
        self,
        messages: List[Dict[str, str]],
        system: Optional[str] = None,
        temperature: float = 0.3,
        max_tokens: int = 4096,
    ) -> str:
        """Отправить сообщения и получить ответ"""
        pass

    @abstractmethod
    async def chat_json(
        self,
        messages: List[Dict[str, str]],
        system: Optional[str] = None,
        temperature: float = 0.1,
    ) -> Dict[str, Any]:
        """Получить ответ в формате JSON"""
        pass

    @abstractmethod
    async def vision(
        self,
        image_data: bytes,
        prompt: str,
        detail: str = "high",
    ) -> str:
        """Анализ изображения"""
        pass


class OpenAIProvider(LLMProvider):
    """Провайдер OpenAI (GPT-4o)"""

    def __init__(self):
        from openai import AsyncOpenAI
        self.client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        self.model = "gpt-4o"

    async def chat(self, messages, system=None, temperature=0.3, max_tokens=4096) -> str:
        all_messages = []
        if system:
            all_messages.append({"role": "system", "content": system})
        all_messages.extend(messages)

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=all_messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content

    async def chat_json(self, messages, system=None, temperature=0.1) -> Dict:
        result = await self.chat(
            messages=messages,
            system=(system or "") + "\nОтвечай строго в формате JSON. Без markdown.",
            temperature=temperature,
        )
        # Очищаем от markdown
        result = result.strip()
        if result.startswith("```"):
            result = result.split("\n", 1)[1]
            result = result.rsplit("```", 1)[0]
        return json.loads(result)

    async def vision(self, image_data: bytes, prompt: str, detail="high") -> str:
        import base64
        b64 = base64.b64encode(image_data).decode()
        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {
                        "url": f"data:image/jpeg;base64,{b64}",
                        "detail": detail,
                    }},
                ],
            }],
            max_tokens=4096,
        )
        return response.choices[0].message.content


class AnthropicProvider(LLMProvider):
    """Провайдер Anthropic (Claude)"""

    def __init__(self):
        from anthropic import AsyncAnthropic
        self.client = AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        self.model = "claude-sonnet-4-20250514"

    async def chat(self, messages, system=None, temperature=0.3, max_tokens=4096) -> str:
        kwargs = {
            "model": self.model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if system:
            kwargs["system"] = system

        response = await self.client.messages.create(**kwargs)
        return response.content[0].text

    async def chat_json(self, messages, system=None, temperature=0.1) -> Dict:
        result = await self.chat(
            messages=messages,
            system=(system or "") + "\nОтвечай строго в формате JSON. Без markdown.",
            temperature=temperature,
        )
        result = result.strip()
        if result.startswith("```"):
            result = result.split("\n", 1)[1]
            result = result.rsplit("```", 1)[0]
        return json.loads(result)

    async def vision(self, image_data: bytes, prompt: str, detail="high") -> str:
        import base64
        b64 = base64.b64encode(image_data).decode()
        response = await self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {
                        "type": "base64",
                        "media_type": "image/jpeg",
                        "data": b64,
                    }},
                    {"type": "text", "text": prompt},
                ],
            }],
        )
        return response.content[0].text


class GeminiProvider(LLMProvider):
    """Провайдер Google Gemini"""

    def __init__(self):
        import google.generativeai as genai
        genai.configure(api_key=settings.GEMINI_API_KEY)
        self.model = genai.GenerativeModel("gemini-1.5-flash")

    async def chat(self, messages, system=None, temperature=0.3, max_tokens=4096) -> str:
        # Конвертируем формат сообщений
        prompt_parts = []
        if system:
            prompt_parts.append(f"Системная инструкция: {system}\n\n")
        for msg in messages:
            role = "Пользователь" if msg["role"] == "user" else "Ассистент"
            prompt_parts.append(f"{role}: {msg['content']}\n")

        response = await self.model.generate_content_async(
            "".join(prompt_parts),
            generation_config={
                "temperature": temperature,
                "max_output_tokens": max_tokens,
            },
        )
        return response.text

    async def chat_json(self, messages, system=None, temperature=0.1) -> Dict:
        result = await self.chat(
            messages=messages,
            system=(system or "") + "\nОтвечай строго в формате JSON. Без markdown.",
            temperature=temperature,
        )
        result = result.strip()
        if result.startswith("```"):
            result = result.split("\n", 1)[1]
            result = result.rsplit("```", 1)[0]
        return json.loads(result)

    async def vision(self, image_data: bytes, prompt: str, detail="high") -> str:
        from PIL import Image
        import io
        img = Image.open(io.BytesIO(image_data))
        response = await self.model.generate_content_async([prompt, img])
        return response.text


def get_llm_provider(provider_name: Optional[str] = None) -> LLMProvider:
    """Фабрика LLM-провайдеров"""
    if not provider_name:
        # Автоопределение по наличию ключей
        if settings.OPENAI_API_KEY:
            provider_name = "openai"
        elif settings.ANTHROPIC_API_KEY:
            provider_name = "anthropic"
        elif settings.GEMINI_API_KEY:
            provider_name = "gemini"
        else:
            raise ValueError("Не настроен ни один AI-провайдер. Укажите API-ключ в .env")

    providers = {
        "openai": OpenAIProvider,
        "anthropic": AnthropicProvider,
        "gemini": GeminiProvider,
    }

    provider_cls = providers.get(provider_name.lower())
    if not provider_cls:
        raise ValueError(f"Неизвестный провайдер: {provider_name}. Доступные: {list(providers.keys())}")

    return provider_cls()
