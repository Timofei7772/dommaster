"""
Роутер для управления журналом заявок и задач (Requests / Kanban board)
"""

from datetime import date, datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, Field

from app.database import get_db
from app.models.request import CRMRequest
from app.models.project import Project
from app.models.user import User, UserRole
from app.routers.auth import get_current_user
from app.routers.crm_projects import WorkerResponse

router = APIRouter()


# --- Схемы данных ---

class RequestCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    project_id: Optional[int] = None
    status: str = "New"  # New, In Progress, Review, Done
    priority: str = "Medium"  # Low, Medium, High
    assigned_to: Optional[int] = None
    deadline: Optional[date] = None


class RequestUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    project_id: Optional[int] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    assigned_to: Optional[int] = None
    deadline: Optional[date] = None


class ProjectShortResponse(BaseModel):
    id: int
    name: str
    code: Optional[str] = None

    class Config:
        from_attributes = True


class RequestResponse(BaseModel):
    id: int
    project_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    status: str
    priority: str
    assigned_to: Optional[int] = None
    deadline: Optional[date] = None
    created_at: datetime
    project: Optional[ProjectShortResponse] = None
    assignee: Optional[WorkerResponse] = None

    class Config:
        from_attributes = True


# --- Эндпоинты ---

@router.get("/", response_model=List[RequestResponse])
async def list_requests(
    project_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None, description="Фильтр по статусу (New/In Progress/Review/Done)"),
    assigned_to: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Список заявок/задач с фильтрацией"""
    # Выбираем только те проекты, которые принадлежат компании пользователя
    project_subquery = select(Project.id).where(Project.company_id == current_user.company_id)
    
    query = select(CRMRequest).where(
        (CRMRequest.project_id.is_(None)) | (CRMRequest.project_id.in_(project_subquery))
    )

    if project_id:
        query = query.where(CRMRequest.project_id == project_id)
    if status:
        query = query.where(CRMRequest.status == status)
    if assigned_to:
        query = query.where(CRMRequest.assigned_to == assigned_to)

    query = query.options(
        selectinload(CRMRequest.project),
        selectinload(CRMRequest.assignee)
    ).order_by(CRMRequest.created_at.desc())

    result = await db.execute(query)
    return result.scalars().all()


@router.post("/", response_model=RequestResponse, status_code=status.HTTP_201_CREATED)
async def create_request(
    data: RequestCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Создать новую заявку/задачу"""
    # Если передан project_id, проверяем доступ к нему
    if data.project_id:
        proj_res = await db.execute(
            select(Project).where(Project.id == data.project_id, Project.company_id == current_user.company_id)
        )
        if not proj_res.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Указанный проект не найден или к нему нет доступа")

    request = CRMRequest(
        project_id=data.project_id,
        title=data.title,
        description=data.description,
        status=data.status,
        priority=data.priority,
        assigned_to=data.assigned_to,
        deadline=data.deadline
    )
    db.add(request)
    await db.commit()

    # Загружаем с связями
    res = await db.execute(
        select(CRMRequest)
        .where(CRMRequest.id == request.id)
        .options(
            selectinload(CRMRequest.project),
            selectinload(CRMRequest.assignee)
        )
    )
    return res.scalar_one()


@router.put("/{request_id}", response_model=RequestResponse)
async def update_request(
    request_id: int,
    data: RequestUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Обновить заявку/задачу (перетаскивание по Канбану, смена приоритета/исполнителя)"""
    result = await db.execute(
        select(CRMRequest)
        .where(CRMRequest.id == request_id)
        .options(selectinload(CRMRequest.project))
    )
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    # Проверка прав доступа: если проект есть, он должен быть в нашей компании
    if req.project and req.project.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Нет прав доступа")

    update_data = data.model_dump(exclude_unset=True)
    for key, val in update_data.items():
        setattr(req, key, val)

    await db.commit()

    # Загружаем с связями
    res = await db.execute(
        select(CRMRequest)
        .where(CRMRequest.id == req.id)
        .options(
            selectinload(CRMRequest.project),
            selectinload(CRMRequest.assignee)
        )
    )
    return res.scalar_one()


@router.delete("/{request_id}")
async def delete_request(
    request_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Удалить заявку/задачу"""
    result = await db.execute(
        select(CRMRequest)
        .where(CRMRequest.id == request_id)
        .options(selectinload(CRMRequest.project))
    )
    req = result.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=404, detail="Заявка не найдена")

    if req.project and req.project.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Нет прав доступа")

    await db.delete(req)
    await db.commit()
    return {"success": True, "detail": "Заявка успешно удалена"}
