"""
AI-оркестратор — координатор мульти-агентной системы
"""

from typing import Dict, Any, Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
import asyncio
import logging
from datetime import datetime

from app.ai.llm_provider import LLMProvider, get_llm_provider
from app.ai.base_agent import BaseAgent, AgentResult

logger = logging.getLogger(__name__)


class TaskStatus:
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class AITask:
    """Задача для AI-системы"""

    def __init__(self, task_type: str, params: Dict[str, Any], task_id: Optional[str] = None):
        self.id = task_id or f"task_{datetime.utcnow().strftime('%Y%m%d_%H%M%S_%f')}"
        self.type = task_type
        self.params = params
        self.status = TaskStatus.PENDING
        self.result: Optional[AgentResult] = None
        self.created_at = datetime.utcnow()
        self.completed_at: Optional[datetime] = None
        self.agent_chain: List[str] = []

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "type": self.type,
            "status": self.status,
            "created_at": self.created_at.isoformat(),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "agent_chain": self.agent_chain,
            "result": self.result.to_dict() if self.result else None,
        }


class AIOrchestrator:
    """Координатор AI-агентов"""

    def __init__(self, db: AsyncSession, provider_name: Optional[str] = None):
        self.db = db
        self.llm = get_llm_provider(provider_name)
        self._agents: Dict[str, BaseAgent] = {}
        self._tasks: Dict[str, AITask] = {}
        self._register_agents()

    def _register_agents(self):
        """Регистрация всех доступных агентов"""
        from app.ai.agents.object_analyzer import ObjectAnalyzerAgent
        from app.ai.agents.design_analyzer import DesignAnalyzerAgent
        from app.ai.agents.work_generator import WorkGeneratorAgent
        from app.ai.agents.volume_estimator import VolumeEstimatorAgent
        from app.ai.agents.material_estimator import MaterialEstimatorAgent
        from app.ai.agents.finance_agent import FinanceAgent
        from app.ai.agents.estimate_validator_agent import EstimateValidatorAgent
        from app.ai.agents.document_agent import DocumentAgent
        from app.ai.agents.site_manager import AISiteManagerAgent
        from app.ai.agents.profit_optimizer import ProfitOptimizerAgent
        from app.ai.agents.lead_analyzer import LeadAnalyzerAgent
        from app.ai.agents.learning_agent import LearningAgent

        agent_classes = [
            ObjectAnalyzerAgent,
            DesignAnalyzerAgent,
            WorkGeneratorAgent,
            VolumeEstimatorAgent,
            MaterialEstimatorAgent,
            FinanceAgent,
            EstimateValidatorAgent,
            DocumentAgent,
            AISiteManagerAgent,
            ProfitOptimizerAgent,
            LeadAnalyzerAgent,
            LearningAgent,
        ]

        for cls in agent_classes:
            agent = cls(self.llm, self.db)
            self._agents[agent.name] = agent

    async def execute_task(self, task_type: str, params: Dict[str, Any]) -> AITask:
        """Выполнить задачу"""
        task = AITask(task_type=task_type, params=params)
        self._tasks[task.id] = task

        # Определяем цепочку агентов
        chain = self._resolve_agent_chain(task_type)
        task.agent_chain = [a.name for a in chain]
        task.status = TaskStatus.RUNNING

        try:
            # Последовательное выполнение цепочки
            context = params.copy()
            for agent in chain:
                result = await agent.execute(context)
                if not result.success:
                    task.status = TaskStatus.FAILED
                    task.result = result
                    return task
                # Передаём результат следующему агенту
                context.update(result.data)

            task.status = TaskStatus.COMPLETED
            task.result = AgentResult(success=True, data=context, agent_name="orchestrator")

        except Exception as e:
            logger.error(f"Ошибка оркестратора: {e}")
            task.status = TaskStatus.FAILED
            task.result = AgentResult(success=False, error=str(e), agent_name="orchestrator")

        task.completed_at = datetime.utcnow()
        return task

    def _resolve_agent_chain(self, task_type: str) -> List[BaseAgent]:
        """Определить цепочку агентов для типа задачи"""
        chains = {
            # Генерация сметы из описания объекта
            "generate_estimate": [
                "ObjectAnalyzer",
                "WorkGenerator",
                "VolumeEstimator",
                "MaterialEstimator",
                "FinanceAgent",
            ],
            # Анализ дизайн-проекта
            "analyze_design": [
                "DesignAnalyzer",
                "WorkGenerator",
                "VolumeEstimator",
                "MaterialEstimator",
                "FinanceAgent",
            ],
            # Анализ фото объекта
            "analyze_photo": [
                "ObjectAnalyzer",
                "WorkGenerator",
            ],
            # Валидация сметы
            "validate_estimate": [
                "EstimateValidator",
            ],
            # Оптимизация прибыли
            "optimize_profit": [
                "ProfitOptimizer",
            ],
            # Контроль стройки (AI-прораб)
            "site_management": [
                "AISiteManager",
            ],
            # Генерация документов
            "generate_documents": [
                "DocumentAgent",
            ],
            # Анализ лида
            "analyze_lead": [
                "LeadAnalyzer",
                "ObjectAnalyzer",
                "WorkGenerator",
            ],
        }

        agent_names = chains.get(task_type, [])
        agents = []
        for name in agent_names:
            agent = self._agents.get(name)
            if agent:
                agents.append(agent)
            else:
                logger.warning(f"Агент {name} не найден")

        if not agents:
            raise ValueError(f"Нет агентов для задачи типа '{task_type}'")

        return agents

    async def execute_single_agent(self, agent_name: str, params: Dict[str, Any]) -> AgentResult:
        """Запустить одного агента"""
        agent = self._agents.get(agent_name)
        if not agent:
            return AgentResult(success=False, error=f"Агент '{agent_name}' не найден")
        return await agent.execute(params)

    def get_task_status(self, task_id: str) -> Optional[Dict]:
        task = self._tasks.get(task_id)
        return task.to_dict() if task else None

    def list_agents(self) -> List[Dict[str, str]]:
        return [
            {"name": a.name, "description": a.description}
            for a in self._agents.values()
        ]

    def list_task_types(self) -> List[str]:
        return [
            "generate_estimate",
            "analyze_design",
            "analyze_photo",
            "validate_estimate",
            "optimize_profit",
            "site_management",
            "generate_documents",
            "analyze_lead",
        ]
