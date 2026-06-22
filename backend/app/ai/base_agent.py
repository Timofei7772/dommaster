"""
Базовый класс AI-агента
"""

from typing import Dict, Any, Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
import logging
from datetime import datetime

from app.ai.llm_provider import LLMProvider

logger = logging.getLogger(__name__)


class AgentResult:
    """Результат работы агента"""

    def __init__(
        self,
        success: bool,
        data: Dict[str, Any] = None,
        error: Optional[str] = None,
        agent_name: str = "",
    ):
        self.success = success
        self.data = data or {}
        self.error = error
        self.agent_name = agent_name
        self.timestamp = datetime.utcnow().isoformat()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "data": self.data,
            "error": self.error,
            "agent": self.agent_name,
            "timestamp": self.timestamp,
        }


class BaseAgent:
    """Базовый AI-агент"""

    name: str = "BaseAgent"
    description: str = "Базовый агент"
    system_prompt: str = ""

    def __init__(self, llm: LLMProvider, db: AsyncSession):
        self.llm = llm
        self.db = db
        self.logger = logging.getLogger(f"ai.{self.name}")

    async def execute(self, task: Dict[str, Any]) -> AgentResult:
        """Выполнить задачу"""
        try:
            self.logger.info(f"[{self.name}] Начало выполнения задачи: {task.get('type', 'unknown')}")
            result = await self._process(task)
            self.logger.info(f"[{self.name}] Задача выполнена успешно")
            return AgentResult(success=True, data=result, agent_name=self.name)
        except Exception as e:
            self.logger.error(f"[{self.name}] Ошибка: {e}")
            return AgentResult(success=False, error=str(e), agent_name=self.name)

    async def _process(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """Обработка задачи (переопределяется в наследниках)"""
        raise NotImplementedError(f"{self.name}._process() не реализован")

    async def ask_llm(
        self,
        prompt: str,
        context: Optional[str] = None,
        temperature: float = 0.3,
    ) -> str:
        """Спросить LLM"""
        messages = []
        if context:
            messages.append({"role": "user", "content": f"Контекст:\n{context}"})
            messages.append({"role": "assistant", "content": "Понял, учту этот контекст."})
        messages.append({"role": "user", "content": prompt})

        return await self.llm.chat(
            messages=messages,
            system=self.system_prompt,
            temperature=temperature,
        )

    async def ask_llm_json(
        self,
        prompt: str,
        context: Optional[str] = None,
        temperature: float = 0.1,
    ) -> Dict[str, Any]:
        """Спросить LLM и получить JSON"""
        messages = []
        if context:
            messages.append({"role": "user", "content": f"Контекст:\n{context}"})
            messages.append({"role": "assistant", "content": "Понял, учту этот контекст."})
        messages.append({"role": "user", "content": prompt})

        return await self.llm.chat_json(
            messages=messages,
            system=self.system_prompt,
            temperature=temperature,
        )
