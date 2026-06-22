"""
API маршруты для AI-функций.
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from ai.orchestrator import AIOrchestrator

router = APIRouter()


class GenerateFromDescriptionRequest(BaseModel):
    project_id: str
    description: str = ""
    area: float = 0
    repair_type: str = "стандартный"


class GenerateFromDesignRequest(BaseModel):
    project_id: str
    file_path: str
    file_type: str = "pdf"


@router.post("/generate-estimate")
async def generate_estimate(
    data: GenerateFromDescriptionRequest,
    db: AsyncSession = Depends(get_db),
):
    orch = AIOrchestrator(db)
    ctx = await orch.generate_estimate_from_description(
        project_id=uuid.UUID(data.project_id),
        description=data.description,
        area=data.area,
        repair_type=data.repair_type,
    )
    return {
        "estimate_id": str(ctx.estimate_id) if ctx.estimate_id else None,
        "stage": ctx.stage,
        "rooms_count": len(ctx.rooms),
        "works_count": len(ctx.works),
        "finance": ctx.finance,
        "validation": ctx.validation,
        "documents": ctx.documents,
        "errors": ctx.errors,
    }


@router.post("/generate-from-design")
async def generate_from_design(
    data: GenerateFromDesignRequest,
    db: AsyncSession = Depends(get_db),
):
    orch = AIOrchestrator(db)
    ctx = await orch.generate_estimate_from_design(
        project_id=uuid.UUID(data.project_id),
        file_path=data.file_path,
        file_type=data.file_type,
    )
    return {
        "estimate_id": str(ctx.estimate_id) if ctx.estimate_id else None,
        "stage": ctx.stage,
        "rooms_count": len(ctx.rooms),
        "works_count": len(ctx.works),
        "finance": ctx.finance,
        "documents": ctx.documents,
        "errors": ctx.errors,
    }


@router.post("/generate-from-photos")
async def generate_from_photos(
    project_id: str = Form(...),
    description: str = Form(""),
    area: float = Form(0),
    repair_type: str = Form("стандартный"),
    photos: list[UploadFile] = File(default=[]),
    db: AsyncSession = Depends(get_db),
):
    photo_data = []
    for photo in photos:
        photo_data.append(await photo.read())

    orch = AIOrchestrator(db)
    ctx = await orch.generate_estimate_from_description(
        project_id=uuid.UUID(project_id),
        description=description,
        photos=photo_data if photo_data else None,
        area=area,
        repair_type=repair_type,
    )
    return {
        "estimate_id": str(ctx.estimate_id) if ctx.estimate_id else None,
        "stage": ctx.stage,
        "finance": ctx.finance,
        "errors": ctx.errors,
    }


@router.get("/site-report/{estimate_id}")
async def site_report(estimate_id: str, db: AsyncSession = Depends(get_db)):
    orch = AIOrchestrator(db)
    return await orch.analyze_site_progress(uuid.UUID(estimate_id))


@router.get("/profit-optimization/{estimate_id}")
async def profit_optimization(estimate_id: str, db: AsyncSession = Depends(get_db)):
    orch = AIOrchestrator(db)
    return await orch.optimize_profit(uuid.UUID(estimate_id))


@router.post("/validate-estimate/{estimate_id}")
async def ai_validate(estimate_id: str, db: AsyncSession = Depends(get_db)):
    from ai.agents.estimate_validator_agent import EstimateValidatorAgent
    agent = EstimateValidatorAgent(db)
    return await agent.validate(uuid.UUID(estimate_id))
