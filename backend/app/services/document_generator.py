"""
Сервис генерации документов
"""

from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from datetime import datetime
from pathlib import Path
import os

from app.models.estimate import Estimate
from app.models.document_registry import Document, DocumentType, DocumentStatus
from app.models.project import Project
from app.models.client import Client
from app.config import settings


class DocumentGeneratorService:
    """Генерация документов из данных сметы"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.output_dir = settings.OUTPUT_DIR

    async def generate_document(
        self,
        estimate_id: int,
        doc_type: DocumentType,
        extra_params: Optional[Dict[str, Any]] = None,
    ) -> Document:
        """Генерация документа по типу"""
        estimate = await self._load_estimate(estimate_id)
        if not estimate:
            raise ValueError(f"Смета {estimate_id} не найдена")

        generators = {
            DocumentType.KP: self._generate_kp,
            DocumentType.CONTRACT: self._generate_contract,
            DocumentType.KS2: self._generate_ks2,
            DocumentType.KS3: self._generate_ks3,
            DocumentType.M29: self._generate_m29,
            DocumentType.INVOICE: self._generate_invoice,
            DocumentType.ESTIMATE: self._generate_estimate_export,
        }

        generator = generators.get(doc_type)
        if not generator:
            raise ValueError(f"Неподдерживаемый тип документа: {doc_type}")

        file_path = await generator(estimate, extra_params or {})

        # Регистрируем документ
        doc = Document(
            estimate_id=estimate_id,
            project_id=estimate.project_id,
            document_type=doc_type,
            status=DocumentStatus.GENERATED,
            name=f"{doc_type.value}_{estimate.number or estimate.id}",
            file_path=file_path,
            file_format=os.path.splitext(file_path)[1].lstrip('.') if file_path else None,
            generated_at=datetime.utcnow(),
        )
        self.db.add(doc)
        await self.db.flush()
        return doc

    async def get_documents_for_estimate(self, estimate_id: int):
        """Список документов по смете"""
        result = await self.db.execute(
            select(Document)
            .where(Document.estimate_id == estimate_id)
            .order_by(Document.created_at.desc())
        )
        return result.scalars().all()

    async def _load_estimate(self, estimate_id: int) -> Optional[Estimate]:
        result = await self.db.execute(
            select(Estimate)
            .options(selectinload(Estimate.items), selectinload(Estimate.sections))
            .where(Estimate.id == estimate_id)
        )
        return result.scalar_one_or_none()

    async def _generate_kp(self, estimate: Estimate, params: Dict) -> str:
        """Генерация коммерческого предложения"""
        # Заглушка — реальная реализация использует python-docx / jinja2
        filename = f"KP_{estimate.number or estimate.id}_{datetime.now().strftime('%Y%m%d')}.docx"
        filepath = os.path.join(self.output_dir, filename)
        # TODO: реализовать генерацию через шаблон
        return filepath

    async def _generate_contract(self, estimate: Estimate, params: Dict) -> str:
        """Генерация договора подряда"""
        filename = f"Contract_{estimate.number or estimate.id}_{datetime.now().strftime('%Y%m%d')}.docx"
        return os.path.join(self.output_dir, filename)

    async def _generate_ks2(self, estimate: Estimate, params: Dict) -> str:
        """Генерация КС-2"""
        filename = f"KS2_{estimate.number or estimate.id}_{datetime.now().strftime('%Y%m%d')}.docx"
        return os.path.join(self.output_dir, filename)

    async def _generate_ks3(self, estimate: Estimate, params: Dict) -> str:
        """Генерация КС-3"""
        filename = f"KS3_{estimate.number or estimate.id}_{datetime.now().strftime('%Y%m%d')}.docx"
        return os.path.join(self.output_dir, filename)

    async def _generate_m29(self, estimate: Estimate, params: Dict) -> str:
        """Генерация М-29"""
        filename = f"M29_{estimate.number or estimate.id}_{datetime.now().strftime('%Y%m%d')}.xlsx"
        return os.path.join(self.output_dir, filename)

    async def _generate_invoice(self, estimate: Estimate, params: Dict) -> str:
        """Генерация счёта"""
        filename = f"Invoice_{estimate.number or estimate.id}_{datetime.now().strftime('%Y%m%d')}.xlsx"
        return os.path.join(self.output_dir, filename)

    async def _generate_estimate_export(self, estimate: Estimate, params: Dict) -> str:
        """Экспорт сметы в XLSX шаблон."""
        from app.services.estimate_template_builder import build_estimate_template, fill_estimate_template

        output_dir = Path(self.output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        filename = f"Estimate_{estimate.number or estimate.id}_{datetime.now().strftime('%Y%m%d')}.xlsx"
        output_path = output_dir / filename

        rows = []
        sections_by_id = {section.id: section for section in getattr(estimate, "sections", []) if getattr(section, "id", None) is not None}
        for item in getattr(estimate, "items", []):
            section = sections_by_id.get(getattr(item, "section_id", None))
            unit_price = getattr(item, "total", None)
            quantity = float(getattr(item, "quantity", 1) or 1)
            if unit_price not in (None, 0, 0.0):
                unit_price = float(unit_price) / quantity if quantity else float(unit_price)
            else:
                unit_price = (
                    float(getattr(item, "materials_price", 0) or 0)
                    + float(getattr(item, "labor_price", 0) or 0)
                    + float(getattr(item, "machines_price", 0) or 0)
                )

            rows.append(
                {
                    "name": getattr(item, "name", ""),
                    "unit": getattr(item, "unit", "шт"),
                    "quantity": quantity,
                    "unit_price": unit_price,
                    "item_number": getattr(item, "item_number", None),
                    "section_name": getattr(section, "name", None),
                    "source_id": getattr(item, "id", None),
                }
            )

        build_estimate_template(output_path)
        fill_estimate_template(
            output_path,
            rows,
            header_data={
                "document_title": "ЛОКАЛЬНАЯ СМЕТА",
                "company_name": params.get("company_name") if params else None,
            },
        )
        return str(output_path)
