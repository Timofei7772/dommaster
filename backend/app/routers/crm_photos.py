"""
Роутер для управления фотоотчётами по проектам и этапам
"""

import os
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from datetime import datetime

from app.database import get_db
from app.models.photo import PhotoReport
from app.models.project import Project
from app.models.work_stage import WorkStage
from app.models.user import User
from app.routers.auth import get_current_user
from app.routers.crm_stages import verify_project_access
from app.utils import validate_file_extension

router = APIRouter()

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


# --- Схемы данных ---

class PhotoResponse(BaseModel):
    id: int
    project_id: int
    stage_id: Optional[int] = None
    url: str
    uploaded_by: Optional[int] = None
    uploader_name: Optional[str] = None
    stage_name: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


# --- Эндпоинты ---

@router.get("/project/{project_id}", response_model=List[PhotoResponse])
async def list_project_photos(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Получить список всех фотографий проекта с метаданными"""
    await verify_project_access(project_id, current_user, db)

    result = await db.execute(
        select(PhotoReport)
        .where(PhotoReport.project_id == project_id)
        .options(
            selectinload(PhotoReport.stage),
            selectinload(PhotoReport.uploader)
        )
        .order_by(PhotoReport.created_at.desc())
    )
    photos = result.scalars().all()

    # Форматируем ответ с названиями этапов и именами загрузивших
    response_data = []
    for p in photos:
        response_data.append({
            "id": p.id,
            "project_id": p.project_id,
            "stage_id": p.stage_id,
            "url": p.url,
            "uploaded_by": p.uploaded_by,
            "uploader_name": p.uploader.full_name if p.uploader else "Система",
            "stage_name": p.stage.name if p.stage else "Общий отчет",
            "created_at": p.created_at
        })
    return response_data


@router.post("/project/{project_id}/upload", response_model=List[PhotoResponse], status_code=status.HTTP_201_CREATED)
async def upload_photos(
    project_id: int,
    stage_id: Optional[int] = Form(None),
    files: List[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Пакетная загрузка фотографий для проекта/этапа"""
    await verify_project_access(project_id, current_user, db)

    if stage_id:
        # Проверяем, что этап принадлежит проекту
        stage_res = await db.execute(
            select(WorkStage).where(WorkStage.id == stage_id, WorkStage.project_id == project_id)
        )
        if not stage_res.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Указанный этап не принадлежит этому проекту")

    # Создаем специфическую папку для проекта
    project_upload_dir = os.path.join(UPLOAD_DIR, str(project_id))
    os.makedirs(project_upload_dir, exist_ok=True)

    uploaded_records = []

    for file in files:
        validate_file_extension(file.filename, allowed=[".png", ".jpg", ".jpeg"])
        
        # Генерируем уникальное имя файла
        file_ext = os.path.splitext(file.filename)[1]
        unique_filename = f"{uuid.uuid4().hex}{file_ext}"
        file_path = os.path.join(project_upload_dir, unique_filename)

        # Читаем и записываем на диск
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)

        # Сохраняем URL (путь по которому будет раздаваться статика)
        # Пример: /uploads/1/uuid.jpg
        photo_url = f"/uploads/{project_id}/{unique_filename}"

        # Создаем запись в БД
        photo_report = PhotoReport(
            project_id=project_id,
            stage_id=stage_id,
            url=photo_url,
            uploaded_by=current_user.id
        )
        db.add(photo_report)
        uploaded_records.append(photo_report)

    await db.flush()
    await db.commit()

    # Загружаем метаданные для ответа
    response_data = []
    for r in uploaded_records:
        res = await db.execute(
            select(PhotoReport)
            .where(PhotoReport.id == r.id)
            .options(
                selectinload(PhotoReport.stage),
                selectinload(PhotoReport.uploader)
            )
        )
        p = res.scalar_one()
        response_data.append({
            "id": p.id,
            "project_id": p.project_id,
            "stage_id": p.stage_id,
            "url": p.url,
            "uploaded_by": p.uploaded_by,
            "uploader_name": p.uploader.full_name if p.uploader else "Система",
            "stage_name": p.stage.name if p.stage else "Общий отчет",
            "created_at": p.created_at
        })

    return response_data


@router.delete("/{photo_id}")
async def delete_photo(
    photo_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Удалить загруженную фотографию"""
    result = await db.execute(
        select(PhotoReport)
        .where(PhotoReport.id == photo_id)
        .options(selectinload(PhotoReport.project))
    )
    photo = result.scalar_one_or_none()
    if not photo:
        raise HTTPException(status_code=404, detail="Фотография не найдена")

    # Проверка доступа
    if photo.project.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Нет прав доступа")

    # Удаление файла с диска
    # url имеет вид: /uploads/project_id/filename.jpg
    relative_path = photo.url.lstrip("/")  # -> uploads/project_id/filename.jpg
    if os.path.exists(relative_path):
        try:
            os.remove(relative_path)
        except Exception as e:
            print(f"Ошибка при удалении файла {relative_path}: {e}")

    await db.delete(photo)
    await db.commit()

    return {"success": True, "detail": "Фотография успешно удалена"}
