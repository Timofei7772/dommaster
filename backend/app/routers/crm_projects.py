"""
Роутер для управления проектами и дашбордами проектов
"""

from datetime import date, datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, Field
import uuid

from app.database import get_db
from app.models.project import Project, ProjectObject, ProjectStatus
from app.models.work_stage import WorkStage
from app.models.payment import Payment
from app.models.estimate import Estimate, EstimateItem
from app.models.photo import PhotoReport
from app.models.request import CRMRequest
from app.models.user import User, UserRole
from app.routers.auth import get_current_user

router = APIRouter()


# --- Схемы данных ---

class ObjectCreate(BaseModel):
    name: str = Field(..., max_length=500)
    address: Optional[str] = None
    object_type: Optional[str] = None
    area: Optional[float] = None
    floors: Optional[int] = None


class ProjectCreate(BaseModel):
    name: str = Field(..., max_length=500)
    code: Optional[str] = Field(None, max_length=50)
    description: Optional[str] = None
    customer_name: Optional[str] = None
    customer_contact: Optional[str] = None
    planned_start: Optional[date] = None
    planned_end: Optional[date] = None
    budget: float = 0.0
    objects: List[ObjectCreate] = []


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    customer_name: Optional[str] = None
    customer_contact: Optional[str] = None
    status: Optional[ProjectStatus] = None
    planned_start: Optional[date] = None
    planned_end: Optional[date] = None
    actual_start: Optional[date] = None
    actual_end: Optional[date] = None
    budget: Optional[float] = None


class ObjectResponse(BaseModel):
    id: int
    name: str
    address: Optional[str] = None
    object_type: Optional[str] = None
    area: Optional[float] = None
    floors: Optional[int] = None
    status: ProjectStatus

    class Config:
        from_attributes = True


class ProjectResponse(BaseModel):
    id: int
    code: Optional[str] = None
    name: str
    description: Optional[str] = None
    customer_name: Optional[str] = None
    customer_contact: Optional[str] = None
    status: ProjectStatus
    planned_start: Optional[date] = None
    planned_end: Optional[date] = None
    actual_start: Optional[date] = None
    actual_end: Optional[date] = None
    budget: float
    spent: float
    created_at: Optional[datetime] = None
    company_id: Optional[int] = None
    objects: List[ObjectResponse] = []

    class Config:
        from_attributes = True


class ProjectDashboardResponse(BaseModel):
    project_id: int
    name: str
    budget: float
    spent: float
    
    # Статистика этапов работ
    stages_total: int
    stages_completed: int
    stages_in_progress: int
    stages_delayed: int
    stages_not_started: int
    
    # Финансовая статистика
    payments_total_planned: float
    payments_total_paid: float
    payments_remaining: float
    
    # Сводная сметная стоимость
    estimates_total: float
    
    # Заявки
    requests_new: int
    requests_in_progress: int
    requests_done: int


class WorkerResponse(BaseModel):
    id: int
    full_name: str
    email: str
    phone: Optional[str] = None
    role: UserRole
    position: Optional[str] = None

    class Config:
        from_attributes = True


# --- Эндпоинты ---

@router.get("/", response_model=List[ProjectResponse])
async def list_projects(
    search: Optional[str] = Query(None, description="Поиск по названию или коду"),
    status: Optional[ProjectStatus] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Список проектов компании текущего пользователя"""
    query = select(Project).where(Project.company_id == current_user.company_id)

    if search:
        query = query.where(
            Project.name.ilike(f"%{search}%") | Project.code.ilike(f"%{search}%")
        )
    if status:
        query = query.where(Project.status == status)

    query = query.options(selectinload(Project.objects)).order_by(Project.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    data: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Создать новый проект строительной организации"""
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="Пользователь не привязан к строительной компании")

    project_code = data.code or f"PRJ-{uuid.uuid4().hex[:6].upper()}"

    project = Project(
        name=data.name,
        code=project_code,
        description=data.description,
        customer_name=data.customer_name,
        customer_contact=data.customer_contact,
        planned_start=data.planned_start,
        planned_end=data.planned_end,
        budget=data.budget,
        company_id=current_user.company_id,
        created_by=current_user.id
    )

    db.add(project)
    await db.flush()  # Для получения ID проекта

    # Создаем объекты если они переданы
    for obj_data in data.objects:
        obj = ProjectObject(
            project_id=project.id,
            name=obj_data.name,
            address=obj_data.address,
            object_type=obj_data.object_type,
            area=obj_data.area,
            floors=obj_data.floors
        )
        db.add(obj)

    await db.commit()

    # Загружаем с объектами для ответа
    result = await db.execute(
        select(Project)
        .where(Project.id == project.id)
        .options(selectinload(Project.objects))
    )
    return result.scalar_one()


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Детальная информация о проекте"""
    result = await db.execute(
        select(Project)
        .where(Project.id == project_id, Project.company_id == current_user.company_id)
        .options(selectinload(Project.objects))
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Проект не найден")
    return project


@router.put("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: int,
    data: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Обновить информацию о проекте"""
    result = await db.execute(
        select(Project)
        .where(Project.id == project_id, Project.company_id == current_user.company_id)
        .options(selectinload(Project.objects))
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Проект не найден")

    update_data = data.model_dump(exclude_none=True)
    for key, val in update_data.items():
        setattr(project, key, val)

    await db.commit()
    return project


@router.delete("/{project_id}")
async def delete_project(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Удалить проект со всеми связями"""
    result = await db.execute(
        select(Project)
        .where(Project.id == project_id, Project.company_id == current_user.company_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Проект не найден")

    await db.delete(project)
    await db.commit()
    return {"success": True, "detail": "Проект успешно удален"}


@router.get("/{project_id}/dashboard", response_model=ProjectDashboardResponse)
async def get_project_dashboard(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Сводный аналитический дашборд проекта"""
    # Проверка доступа к проекту
    proj_res = await db.execute(
        select(Project).where(Project.id == project_id, Project.company_id == current_user.company_id)
    )
    project = proj_res.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Проект не найден")

    # 1. Статистика этапов работ (WorkStages)
    stages_res = await db.execute(select(WorkStage).where(WorkStage.project_id == project_id))
    stages = stages_res.scalars().all()
    stages_total = len(stages)
    stages_completed = sum(1 for s in stages if s.status == "done")
    stages_in_progress = sum(1 for s in stages if s.status == "in_progress")
    stages_delayed = sum(1 for s in stages if s.status == "delayed")
    stages_not_started = sum(1 for s in stages if s.status == "not_started")

    # 2. Финансовая статистика (Payments)
    payments_res = await db.execute(select(Payment).where(Payment.project_id == project_id))
    payments = payments_res.scalars().all()
    
    payments_total_planned = sum(p.planned_amount for p in payments)
    payments_total_paid = sum(p.actual_amount for p in payments if p.status == "paid")
    payments_remaining = max(0.0, payments_total_planned - payments_total_paid)

    # 3. Сметная стоимость
    estimates_res = await db.execute(select(Estimate).where(Estimate.project_id == project_id))
    estimates = estimates_res.scalars().all()
    estimates_total = sum(e.total_with_vat for e in estimates)

    # 4. Заявки (Requests)
    reqs_res = await db.execute(select(CRMRequest).where(CRMRequest.project_id == project_id))
    requests = reqs_res.scalars().all()
    requests_new = sum(1 for r in requests if r.status.lower() == "new")
    requests_in_progress = sum(1 for r in requests if r.status.lower() == "in progress")
    requests_done = sum(1 for r in requests if r.status.lower() == "done")

    return {
        "project_id": project.id,
        "name": project.name,
        "budget": project.budget,
        "spent": project.spent,
        "stages_total": stages_total,
        "stages_completed": stages_completed,
        "stages_in_progress": stages_in_progress,
        "stages_delayed": stages_delayed,
        "stages_not_started": stages_not_started,
        "payments_total_planned": payments_total_planned,
        "payments_total_paid": payments_total_paid,
        "payments_remaining": payments_remaining,
        "estimates_total": estimates_total,
        "requests_new": requests_new,
        "requests_in_progress": requests_in_progress,
        "requests_done": requests_done
    }


@router.get("/{project_id}/workers", response_model=List[WorkerResponse])
async def get_project_workers(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Список рабочих и мастеров строительной компании для назначения исполнителями"""
    # Рабочие и менеджеры той же компании
    result = await db.execute(
        select(User)
        .where(
            User.company_id == current_user.company_id,
            User.role.in_([UserRole.WORKER, UserRole.MANAGER, UserRole.ESTIMATOR, UserRole.OWNER]),
            User.is_active == True
        )
        .order_by(User.full_name.asc())
    )
    return result.scalars().all()


@router.post("/{project_id}/share")
async def generate_share_link(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Генерация токена для гостевого/клиентского просмотра проекта"""
    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.company_id == current_user.company_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Проект не найден")

    # Генерируем уникальный гостевой токен, если его нет в metadata_json
    metadata = dict(project.description or {})  # Используем поле description или metadata сметы
    # Для простоты сохраним токен в поле code или сгенерируем детерминировано
    share_token = f"share-{project.id}-{uuid.uuid4().hex[:12]}"
    
    # Сохраняем токен в смету проекта для верификации (или используем константный хэш)
    # Давайте обновим code проекта или описание
    project.description = (project.description or "") + f"\n[SHARE_TOKEN: {share_token}]"
    await db.commit()

    return {
        "success": True,
        "share_token": share_token,
        "client_url": f"http://localhost:5173/public/project/{share_token}"
    }
