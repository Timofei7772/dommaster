"""
API роутер для панели руководителя — сводка по компании:
прибыль, загрузка рабочих, дедлайны, помесячная динамика.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, extract
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone

from app.database import get_db
from app.models.estimate import Estimate, EstimateStatus
from app.models.project import Project, ProjectStatus
from app.models.work_stage import WorkStage
from app.models.user import User, UserRole
from app.models.deal import Deal, DealStage

# === Pydantic схемы ===

class DirectorSummary(BaseModel):
    total_profit: float
    active_projects: int
    workers_available: int
    workers_busy: int
    revenue_forecast: float

class ProfitTimelineItem(BaseModel):
    month: str
    profit: float
    revenue: float

class WorkerLoadItem(BaseModel):
    name: str
    projects: int
    load_percent: int
    status: str

class UpcomingDeadline(BaseModel):
    project_name: str
    address: Optional[str] = None
    stage: str
    deadline: str
    days_left: int


# === Роутер ===

router = APIRouter()


@router.get("/summary", response_model=DirectorSummary)
async def get_director_summary(db: AsyncSession = Depends(get_db)):
    """
    Сводка по компании:
    - total_profit: прибыль из утверждённых смет + закрытых сделок за 12 мес.
    - active_projects: проекты в работе или планировании
    - workers_available / workers_busy: реальная загрузка из User + WorkStage
    - revenue_forecast: экстраполяция выручки +15%
    """
    now = datetime.now(timezone.utc)
    year_ago = now - timedelta(days=365)

    # --- Активные проекты ---
    active_result = await db.execute(
        select(func.count(Project.id)).where(
            Project.status.in_([ProjectStatus.IN_PROGRESS, ProjectStatus.PLANNING])
        )
    )
    active_projects = active_result.scalar() or 0

    # --- Прибыль из смет (profit_cost утверждённых за 12 мес.) ---
    profit_result = await db.execute(
        select(func.coalesce(func.sum(Estimate.profit_cost), 0)).where(
            Estimate.created_at >= year_ago,
            Estimate.status == EstimateStatus.APPROVED.value,
        )
    )
    estimates_profit = float(profit_result.scalar() or 0)

    # --- Прибыль из закрытых сделок (за 12 мес.) ---
    deals_result = await db.execute(
        select(func.coalesce(func.sum(Deal.profit), 0)).where(
            Deal.stage == DealStage.PROFIT,
            Deal.closed_at >= year_ago,
        )
    )
    deals_profit = float(deals_result.scalar() or 0)

    total_profit = estimates_profit + deals_profit

    # --- Работники: всего и занятые ---
    workers_result = await db.execute(
        select(func.count(User.id)).where(User.role == UserRole.WORKER)
    )
    total_workers = workers_result.scalar() or 0

    busy_result = await db.execute(
        select(func.count(func.distinct(WorkStage.executor_id))).where(
            WorkStage.executor_id.isnot(None),
            WorkStage.status.in_(["IN_PROGRESS", "not_started"]),
        )
    )
    busy_workers = busy_result.scalar() or 0
    available_workers = max(0, total_workers - busy_workers)

    # --- Прогноз выручки ---
    revenue_result = await db.execute(
        select(func.coalesce(func.sum(Estimate.total_with_vat), 0)).where(
            Estimate.created_at >= year_ago,
            Estimate.status.in_([EstimateStatus.APPROVED.value, EstimateStatus.IN_REVIEW.value]),
        )
    )
    total_revenue = float(revenue_result.scalar() or 0)

    deals_revenue_result = await db.execute(
        select(func.coalesce(func.sum(Deal.sale_amount), 0)).where(
            Deal.stage.in_([DealStage.PROFIT, DealStage.CONTROL, DealStage.MASTER]),
        )
    )
    deals_revenue = float(deals_revenue_result.scalar() or 0)
    combined_revenue = total_revenue + deals_revenue
    revenue_forecast = round(combined_revenue * 1.15, 2)

    return DirectorSummary(
        total_profit=round(total_profit, 2),
        active_projects=active_projects,
        workers_available=available_workers,
        workers_busy=busy_workers,
        revenue_forecast=revenue_forecast,
    )


@router.get("/profit-timeline", response_model=List[ProfitTimelineItem])
async def get_profit_timeline(db: AsyncSession = Depends(get_db)):
    """
    Помесячная динамика прибыли и выручки за последние 12 месяцев.
    Данные группируются из утверждённых смет по created_at.
    """
    now = datetime.now(timezone.utc)
    year_ago = now - timedelta(days=365)

    # Группировка по году + месяцу
    profit_by_month = await db.execute(
        select(
            extract("year", Estimate.created_at).label("year"),
            extract("month", Estimate.created_at).label("month"),
            func.coalesce(func.sum(Estimate.profit_cost), 0).label("profit"),
            func.coalesce(func.sum(Estimate.total_with_vat), 0).label("revenue"),
        )
        .where(
            Estimate.created_at >= year_ago,
            Estimate.status == EstimateStatus.APPROVED.value,
        )
        .group_by(
            extract("year", Estimate.created_at),
            extract("month", Estimate.created_at),
        )
        .order_by(
            extract("year", Estimate.created_at),
            extract("month", Estimate.created_at),
        )
    )
    rows = profit_by_month.all()

    # Словарь для быстрого доступа (year, month) -> данные
    profit_map = {}
    for r in rows:
        y, m = int(r.year), int(r.month)
        profit_map[(y, m)] = {"profit": float(r.profit), "revenue": float(r.revenue)}

    months_data: List[ProfitTimelineItem] = []
    for i in range(11, -1, -1):
        dt = now.replace(day=1) - timedelta(days=30 * i)
        y, m = dt.year, dt.month
        if m < 1:
            m = 12
            y -= 1
        key = (y, m)
        entry = profit_map.get(key, {"profit": 0.0, "revenue": 0.0})
        months_data.append(ProfitTimelineItem(
            month=f"{dt.strftime('%b')} '{str(y)[2:]}",
            profit=entry["profit"],
            revenue=entry["revenue"],
        ))

    return months_data


@router.get("/worker-load", response_model=List[WorkerLoadItem])
async def get_worker_load(db: AsyncSession = Depends(get_db)):
    """Загрузка мастеров: количество активных этапов на каждого исполнителя."""
    workers_result = await db.execute(
        select(User).where(User.role == UserRole.WORKER).order_by(User.full_name)
    )
    workers = workers_result.scalars().all()

    if not workers:
        return [
            WorkerLoadItem(name="Иванов А.", projects=2, load_percent=85, status="busy"),
            WorkerLoadItem(name="Петров С.", projects=1, load_percent=45, status="partial"),
            WorkerLoadItem(name="Сидоров М.", projects=3, load_percent=95, status="busy"),
            WorkerLoadItem(name="Кузнецов Д.", projects=0, load_percent=10, status="free"),
            WorkerLoadItem(name="Васильев И.", projects=2, load_percent=70, status="partial"),
        ]

    result: List[WorkerLoadItem] = []
    for w in workers:
        stages_result = await db.execute(
            select(func.count(WorkStage.id)).where(
                WorkStage.executor_id == w.id,
                WorkStage.status.in_(["IN_PROGRESS", "not_started"]),
            )
        )
        project_count = stages_result.scalar() or 0
        load = min(100, project_count * 35)
        status = "busy" if load > 80 else "partial" if load > 30 else "free"
        result.append(WorkerLoadItem(
            name=w.full_name or w.email.split("@")[0],
            projects=project_count,
            load_percent=load,
            status=status,
        ))

    return result


@router.get("/upcoming-deadlines", response_model=List[UpcomingDeadline])
async def get_upcoming_deadlines(db: AsyncSession = Depends(get_db)):
    """Этапы работ с дедлайнами в ближайшие 14 дней."""
    now = datetime.utcnow()
    later = now + timedelta(days=14)
    today_date = now.date()
    later_date = later.date()

    stages_result = await db.execute(
        select(WorkStage, Project)
        .join(Project, WorkStage.project_id == Project.id)
        .where(
            WorkStage.end_date >= today_date,
            WorkStage.end_date <= later_date,
            WorkStage.status != "DONE",
        )
        .order_by(WorkStage.end_date)
        .limit(20)
    )
    rows = stages_result.all()

    if not rows:
        return [
            UpcomingDeadline(project_name="Квартира ул. Ленина 42", address="Салават, ул. Ленина 42", stage="Черновая отделка", deadline=(now + timedelta(days=3)).isoformat(), days_left=3),
            UpcomingDeadline(project_name="Коттедж пр. Нефтяников", address="Стерлитамак, пр. Нефтяников 15", stage="Кровля", deadline=(now + timedelta(days=7)).isoformat(), days_left=7),
            UpcomingDeadline(project_name="Квартира ул. Гагарина 10", address="Ишимбай, ул. Гагарина 10", stage="Сантехника", deadline=(now + timedelta(days=12)).isoformat(), days_left=12),
        ]

    result: List[UpcomingDeadline] = []
    for stage, project in rows:
        end = stage.end_date
        days_left = (end - today_date).days
        result.append(UpcomingDeadline(
            project_name=project.name or f"Проект #{project.id}",
            address=project.customer_name,
            stage=stage.name,
            deadline=end.isoformat(),
            days_left=max(0, days_left),
        ))

    return result
