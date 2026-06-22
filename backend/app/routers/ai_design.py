"""
API роутер для анализа дизайн-проектов
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
import os
import tempfile

from app.database import get_db
from app.ai.orchestrator import AIOrchestrator


router = APIRouter()


@router.post("/upload")
async def upload_and_analyze_design(
    file: UploadFile = File(...),
    provider: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
):
    """Загрузить и проанализировать дизайн-проект"""
    allowed_extensions = {".pdf", ".dwg", ".dxf", ".docx", ".xlsx", ".xls"}
    ext = os.path.splitext(file.filename or "")[1].lower()

    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Неподдерживаемый формат: {ext}. Допустимые: {allowed_extensions}"
        )

    # Сохраняем во временный файл
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        orchestrator = AIOrchestrator(db, provider_name=provider)
        task = await orchestrator.execute_task("analyze_design", {
            "file_path": tmp_path,
            "filename": file.filename,
        })
        return task.to_dict()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        # Удаляем временный файл
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


@router.post("/analyze-text")
async def analyze_design_from_text(
    text: str,
    provider: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """Проанализировать текстовое описание дизайн-проекта"""
    orchestrator = AIOrchestrator(db, provider_name=provider)
    task = await orchestrator.execute_task("analyze_design", {
        "file_content": text,
    })
    return task.to_dict()
