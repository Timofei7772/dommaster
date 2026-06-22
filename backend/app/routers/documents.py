"""
API роутер для реестра документов
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from app.database import get_db
from app.models.document_registry import Document, DocumentType, DocumentStatus
from app.services.document_generator import DocumentGeneratorService


# Схемы
class DocumentResponse(BaseModel):
    id: int
    estimate_id: Optional[int]
    project_id: Optional[int]
    document_type: str
    status: str
    name: Optional[str]
    number: Optional[str]
    file_path: Optional[str]
    file_format: Optional[str]
    created_at: Optional[datetime]
    generated_at: Optional[datetime]

    class Config:
        from_attributes = True


class GenerateDocumentRequest(BaseModel):
    estimate_id: int
    document_type: str
    params: Optional[dict] = None


router = APIRouter()


@router.get("/", response_model=List[DocumentResponse])
async def list_documents(
    estimate_id: Optional[int] = Query(None),
    project_id: Optional[int] = Query(None),
    document_type: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """Список документов"""
    query = select(Document)

    if estimate_id:
        query = query.where(Document.estimate_id == estimate_id)
    if project_id:
        query = query.where(Document.project_id == project_id)
    if document_type:
        query = query.where(Document.document_type == document_type)

    query = query.order_by(Document.created_at.desc()).limit(limit)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/generate", response_model=DocumentResponse)
async def generate_document(
    request: GenerateDocumentRequest,
    db: AsyncSession = Depends(get_db),
):
    """Генерировать документ"""
    try:
        doc_type = DocumentType(request.document_type)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Неподдерживаемый тип: {request.document_type}. "
                   f"Доступные: {[t.value for t in DocumentType]}"
        )

    service = DocumentGeneratorService(db)
    doc = await service.generate_document(
        estimate_id=request.estimate_id,
        doc_type=doc_type,
        extra_params=request.params,
    )
    return doc


@router.get("/types")
async def get_document_types():
    """Доступные типы документов"""
    return [
        {"value": t.value, "label": {
            "kp": "Коммерческое предложение",
            "contract": "Договор подряда",
            "ks2": "КС-2 (Акт приёмки работ)",
            "ks3": "КС-3 (Справка о стоимости)",
            "m29": "М-29 (Ведомость материалов)",
            "invoice": "Счёт-фактура",
            "estimate": "Смета (экспорт)",
            "additional": "Доп. соглашение",
            "defect": "Дефектовка",
            "fot": "Ведомость ФОТ",
        }.get(t.value, t.value)}
        for t in DocumentType
    ]


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(document_id: int, db: AsyncSession = Depends(get_db)):
    """Получить документ по ID"""
    result = await db.execute(select(Document).where(Document.id == document_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Документ не найден")
    return doc
