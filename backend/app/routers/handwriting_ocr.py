"""
API роутер для распознавания рукописного текста (OCR)
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid
import logging

from app.database import get_db
from app.ai.llm_provider import get_llm_provider

logger = logging.getLogger(__name__)

router = APIRouter()


class OCRResponse(BaseModel):
    id: str
    recognized_text: str
    corrected_text: str
    confidence: float
    photo_url: str
    created_at: str
    corrections: list = []
    status: str = "success"


@router.post("/recognize", response_model=OCRResponse)
async def recognize_handwriting(
    image: UploadFile = File(...),
    language: str = Form("ru"),
    detail: str = Form("high"),
    db: AsyncSession = Depends(get_db),
):
    """Распознать рукописный текст на фото"""
    content = await image.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Пустой файл")

    from app.ai.agents.handwriting_ocr_agent import HandwritingOCRAgent

    llm = get_llm_provider()
    agent = HandwritingOCRAgent(llm, db)
    result = await agent.execute({
        "image_data": content,
        "language": language,
        "detail": detail,
    })

    if not result.success:
        raise HTTPException(status_code=500, detail=result.error or "Ошибка распознавания")

    data = result.data or {}

    return OCRResponse(
        id=str(uuid.uuid4()),
        recognized_text=data.get("recognized_text", ""),
        corrected_text=data.get("corrected_text", data.get("recognized_text", "")),
        confidence=data.get("confidence_score", 0.0),
        photo_url=f"/uploads/ocr/{image.filename or 'photo.jpg'}",
        created_at=datetime.utcnow().isoformat(),
        corrections=data.get("corrections", []),
        status=data.get("status", "success"),
    )


@router.post("/recognize-url", response_model=OCRResponse)
async def recognize_handwriting_url(
    image_url: str = Form(...),
    language: str = Form("ru"),
    detail: str = Form("high"),
    db: AsyncSession = Depends(get_db),
):
    """Распознать рукописный текст по URL изображения"""
    import httpx
    async with httpx.AsyncClient() as client:
        resp = await client.get(image_url)
        if resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Не удалось загрузить изображение по URL")
        image_data = resp.content

    from app.ai.agents.handwriting_ocr_agent import HandwritingOCRAgent

    llm = get_llm_provider()
    agent = HandwritingOCRAgent(llm, db)
    result = await agent.execute({
        "image_data": image_data,
        "language": language,
        "detail": detail,
    })

    if not result.success:
        raise HTTPException(status_code=500, detail=result.error or "Ошибка распознавания")

    data = result.data or {}

    return OCRResponse(
        id=str(uuid.uuid4()),
        recognized_text=data.get("recognized_text", ""),
        corrected_text=data.get("corrected_text", data.get("recognized_text", "")),
        confidence=data.get("confidence_score", 0.0),
        photo_url=image_url,
        created_at=datetime.utcnow().isoformat(),
        corrections=data.get("corrections", []),
        status=data.get("status", "success"),
    )
