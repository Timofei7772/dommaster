"""
API маршруты для лидогенерации.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from database import get_db
from ai.lead_generation import LeadGenerationAI

router = APIRouter()


class LeadInput(BaseModel):
    source: str = "manual"
    name: str = ""
    phone: str = ""
    text: str = ""


@router.post("/process")
async def process_lead(data: LeadInput, db: AsyncSession = Depends(get_db)):
    gen = LeadGenerationAI(db)
    result = await gen.processor.process_lead(data.model_dump())
    return result


@router.post("/scan")
async def scan_leads(db: AsyncSession = Depends(get_db)):
    gen = LeadGenerationAI(db)
    results = await gen.scan_all_sources()
    return {
        "total": len(results),
        "leads": results,
    }
