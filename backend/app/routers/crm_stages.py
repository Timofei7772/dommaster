"""
Роутер для управления этапами работ (График работ / Гантт)
"""

from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, Field

from app.database import get_db
from app.models.work_stage import WorkStage
from app.models.project import Project
from app.models.user import User, UserRole
from app.routers.auth import get_current_user
from app.services.stage_workflow_service import StageWorkflowError, StageWorkflowService
from app.shared.enums import WorkStageStatus

router = APIRouter()


# --- Схемы данных ---

class StageCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=500)
    executor_id: Optional[int] = None
    start_date: date
    end_date: date
    status: WorkStageStatus = WorkStageStatus.PENDING


class StageUpdate(BaseModel):
    name: Optional[str] = None
    executor_id: Optional[int] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: Optional[WorkStageStatus] = None


class ExecutorInfo(BaseModel):
    id: int
    full_name: str
    phone: Optional[str] = None
    role: UserRole

    class Config:
        from_attributes = True


class StageResponse(BaseModel):
    id: int
    project_id: int
    name: str
    executor_id: Optional[int] = None
    start_date: date
    end_date: date
    status: str
    executor: Optional[ExecutorInfo] = None

    class Config:
        from_attributes = True


# --- Вспомогательная функция проверки доступа к проекту ---
async def verify_project_access(project_id: int, user: User, db: AsyncSession) -> None:
    res = await db.execute(
        select(Project).where(Project.id == project_id, Project.company_id == user.company_id)
    )
    if not res.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Проект не найден или нет доступа")


# --- Эндпоинты ---

@router.get("/project/{project_id}", response_model=List[StageResponse])
async def list_project_stages(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Список этапов работ по проекту"""
    await verify_project_access(project_id, current_user, db)
    
    result = await db.execute(
        select(WorkStage)
        .where(WorkStage.project_id == project_id)
        .options(selectinload(WorkStage.executor))
        .order_by(WorkStage.start_date.asc())
    )
    return result.scalars().all()


@router.post("/project/{project_id}", response_model=StageResponse, status_code=status.HTTP_201_CREATED)
async def create_stage(
    project_id: int,
    data: StageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Создать новый этап работ в графике"""
    await verify_project_access(project_id, current_user, db)

    try:
        StageWorkflowService.validate_initial_status(data.status)
    except StageWorkflowError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": error.code, "message": str(error)},
        ) from error

    stage = WorkStage(
        project_id=project_id,
        name=data.name,
        executor_id=data.executor_id,
        start_date=data.start_date,
        end_date=data.end_date,
        status=data.status.value
    )
    db.add(stage)
    await db.commit()

    # Загружаем с исполнителем для ответа
    res = await db.execute(
        select(WorkStage)
        .where(WorkStage.id == stage.id)
        .options(selectinload(WorkStage.executor))
    )
    return res.scalar_one()


@router.put("/{stage_id}", response_model=StageResponse)
async def update_stage(
    stage_id: int,
    data: StageUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Обновить этап работ (поддерживает частичные обновления и inline редактирование)"""
    result = await db.execute(
        select(WorkStage)
        .where(WorkStage.id == stage_id)
        .options(selectinload(WorkStage.project))
    )
    stage = result.scalar_one_or_none()
    if not stage:
        raise HTTPException(status_code=404, detail="Этап работ не найден")

    # Проверка доступа
    if stage.project.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Нет прав доступа")

    update_data = data.model_dump(exclude_unset=True)
    requested_status = data.status
    if requested_status is not None:
        try:
            await StageWorkflowService(db).validate_transition(
                stage=stage,
                target=requested_status,
            )
        except StageWorkflowError as error:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": error.code, "message": str(error)},
            ) from error
        update_data["status"] = requested_status.value
    for key, val in update_data.items():
        setattr(stage, key, val)

    await db.commit()

    # Загружаем с исполнителем
    res = await db.execute(
        select(WorkStage)
        .where(WorkStage.id == stage.id)
        .options(selectinload(WorkStage.executor))
    )
    return res.scalar_one()


@router.delete("/{stage_id}")
async def delete_stage(
    stage_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Удалить этап работ"""
    result = await db.execute(
        select(WorkStage)
        .where(WorkStage.id == stage_id)
        .options(selectinload(WorkStage.project))
    )
    stage = result.scalar_one_or_none()
    if not stage:
        raise HTTPException(status_code=404, detail="Этап работ не найден")

    # Проверка доступа
    if stage.project.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Нет прав доступа")

    await db.delete(stage)
    await db.commit()
    return {"success": True, "detail": "Этап работ удален"}
