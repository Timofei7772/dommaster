"""
API роутер для AI-генерации смет
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field

from app.database import get_db
from app.ai.orchestrator import AIOrchestrator
from app.services.estimate_service import EstimateService


# Схемы
class GenerateEstimateRequest(BaseModel):
    description: str = Field(..., description="Описание объекта")
    object_type: Optional[str] = Field(None, description="Тип: apartment/house/office/commercial")
    area: Optional[float] = Field(None, description="Площадь, м²")
    renovation_type: Optional[str] = Field(None, description="Тип ремонта: cosmetic/capital/designer")
    rooms: Optional[int] = Field(None, description="Количество комнат")
    project_id: Optional[int] = Field(None, description="ID проекта для привязки")
    provider: Optional[str] = Field(None, description="LLM провайдер")


router = APIRouter()


@router.post("/from-description")
async def generate_estimate_from_description(
    request: GenerateEstimateRequest,
    db: AsyncSession = Depends(get_db),
):
    """Сгенерировать смету из текстового описания объекта"""
    try:
        orchestrator = AIOrchestrator(db, provider_name=request.provider)
        task = await orchestrator.execute_task("generate_estimate", {
            "description": request.description,
            "object_type": request.object_type or "",
            "area": request.area or 0,
            "renovation_type": request.renovation_type or "",
            "rooms": request.rooms or 0,
        })
        return task.to_dict()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/from-photo")
async def generate_estimate_from_photo(
    file: UploadFile = File(...),
    description: str = Form(""),
    provider: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
):
    """Сгенерировать смету из фото объекта"""
    image_data = await file.read()

    try:
        orchestrator = AIOrchestrator(db, provider_name=provider)
        task = await orchestrator.execute_task("analyze_photo", {
            "image_data": image_data,
            "description": description,
        })
        return task.to_dict()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/from-lead")
async def generate_estimate_from_lead(
    lead_text: str,
    source: str = "manual",
    provider: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Сгенерировать смету из заявки клиента"""
    try:
        orchestrator = AIOrchestrator(db, provider_name=provider)
        task = await orchestrator.execute_task("analyze_lead", {
            "lead_text": lead_text,
            "source": source,
        })
        return task.to_dict()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
