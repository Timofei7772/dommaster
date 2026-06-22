"""
DocumentAgent — AI-обёртка над DocumentGeneratorService.
"""
import uuid
import logging

from ai.agents.base_agent import BaseAgent
from services.document_generator import DocumentGeneratorService

logger = logging.getLogger(__name__)


class DocumentAgent(BaseAgent):

    async def generate(self, estimate_id: uuid.UUID) -> list[dict]:
        svc = DocumentGeneratorService(self.db)
        docs = await svc.generate_all(estimate_id)
        return [
            {
                "type": doc.document_type.value,
                "file_path": doc.file_path,
                "file_name": doc.file_name,
            }
            for doc in docs
        ]
