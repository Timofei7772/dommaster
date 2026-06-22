"""
API маршруты для задач.
"""
import uuid
from typing import Optional
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Task, TaskStatus, TaskPriority

router = APIRouter()


class TaskCreate(BaseModel):
    project_id: str
    name: str
    description: Optional[str] = None
    priority: Optional[str] = "normal"
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    estimated_hours: Optional[float] = None
    order_index: int = 0


class TaskUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    estimated_hours: Optional[float] = None
    actual_hours: Optional[float] = None
    order_index: Optional[int] = None


@router.get("/")
async def list_tasks(project_id: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    query = select(Task)
    if project_id:
        query = query.where(Task.project_id == uuid.UUID(project_id))
    query = query.order_by(Task.order_index, Task.created_at)
    result = await db.execute(query)
    tasks = result.scalars().all()
    return [
        {
            "id": str(t.id),
            "project_id": str(t.project_id),
            "name": t.name,
            "status": t.status.value if t.status else None,
            "priority": t.priority.value if t.priority else None,
            "start_date": str(t.start_date) if t.start_date else None,
            "end_date": str(t.end_date) if t.end_date else None,
            "estimated_hours": t.estimated_hours,
            "actual_hours": t.actual_hours,
            "order_index": t.order_index,
        }
        for t in tasks
    ]


@router.post("/")
async def create_task(data: TaskCreate, db: AsyncSession = Depends(get_db)):
    task = Task(
        project_id=uuid.UUID(data.project_id),
        name=data.name,
        description=data.description,
        priority=TaskPriority(data.priority) if data.priority else TaskPriority.NORMAL,
        start_date=data.start_date,
        end_date=data.end_date,
        estimated_hours=data.estimated_hours,
        order_index=data.order_index,
    )
    db.add(task)
    await db.flush()
    return {"id": str(task.id), "name": task.name}


@router.get("/{task_id}")
async def get_task(task_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Task).where(Task.id == uuid.UUID(task_id)))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(404, "Задача не найдена")
    return {
        "id": str(task.id),
        "project_id": str(task.project_id),
        "name": task.name,
        "description": task.description,
        "status": task.status.value if task.status else None,
        "priority": task.priority.value if task.priority else None,
        "start_date": str(task.start_date) if task.start_date else None,
        "end_date": str(task.end_date) if task.end_date else None,
        "estimated_hours": task.estimated_hours,
        "actual_hours": task.actual_hours,
        "order_index": task.order_index,
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "updated_at": task.updated_at.isoformat() if task.updated_at else None,
    }


@router.put("/{task_id}")
async def update_task(task_id: str, data: TaskUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Task).where(Task.id == uuid.UUID(task_id)))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(404, "Задача не найдена")
    for field, value in data.model_dump(exclude_unset=True).items():
        if field == "status" and value:
            setattr(task, field, TaskStatus(value))
        elif field == "priority" and value:
            setattr(task, field, TaskPriority(value))
        elif value is not None:
            setattr(task, field, value)
    await db.flush()
    return {"id": str(task.id), "status": "updated"}


@router.delete("/{task_id}")
async def delete_task(task_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Task).where(Task.id == uuid.UUID(task_id)))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(404, "Задача не найдена")
    await db.delete(task)
    await db.flush()
    return {"status": "deleted"}
