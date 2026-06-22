"""
API маршруты для расписания.
"""
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Schedule

router = APIRouter()


class ScheduleCreate(BaseModel):
    task_id: str
    resource_id: str | None = None
    start_datetime: datetime
    end_datetime: datetime
    notes: str | None = None


class ScheduleUpdate(BaseModel):
    resource_id: str | None = None
    start_datetime: datetime | None = None
    end_datetime: datetime | None = None
    notes: str | None = None


@router.get("/")
async def list_schedule(task_id: str | None = None, db: AsyncSession = Depends(get_db)):
    query = select(Schedule)
    if task_id:
        query = query.where(Schedule.task_id == uuid.UUID(task_id))
    query = query.order_by(Schedule.start_datetime)
    return [
        {
            "id": str(s.id), "task_id": str(s.task_id),
            "resource_id": str(s.resource_id) if s.resource_id else None,
            "start_datetime": s.start_datetime.isoformat(),
            "end_datetime": s.end_datetime.isoformat(),
            "notes": s.notes,
        }
        for s in (await db.execute(query)).scalars().all()
    ]


@router.post("/")
async def create_schedule(data: ScheduleCreate, db: AsyncSession = Depends(get_db)):
    s = Schedule(
        task_id=uuid.UUID(data.task_id),
        resource_id=uuid.UUID(data.resource_id) if data.resource_id else None,
        start_datetime=data.start_datetime,
        end_datetime=data.end_datetime,
        notes=data.notes,
    )
    db.add(s)
    await db.flush()
    return {"id": str(s.id)}


@router.put("/{schedule_id}")
async def update_schedule(schedule_id: str, data: ScheduleUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Schedule).where(Schedule.id == uuid.UUID(schedule_id)))
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(404, "Запись расписания не найдена")
    for field, value in data.model_dump(exclude_unset=True).items():
        if field == "resource_id" and value:
            setattr(s, field, uuid.UUID(value))
        elif value is not None:
            setattr(s, field, value)
    await db.flush()
    return {"id": str(s.id), "status": "updated"}


@router.delete("/{schedule_id}")
async def delete_schedule(schedule_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Schedule).where(Schedule.id == uuid.UUID(schedule_id)))
    s = result.scalar_one_or_none()
    if not s:
        raise HTTPException(404, "Запись расписания не найдена")
    await db.delete(s)
    await db.flush()
    return {"status": "deleted"}
