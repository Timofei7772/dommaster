"""
API маршруты для проектов.
"""
import uuid
from typing import Optional
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Project, Client, ProjectStatus

router = APIRouter()


# --- Схемы ---

class ProjectCreate(BaseModel):
    name: str
    client_id: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    area: Optional[float] = None
    object_type: Optional[str] = None
    repair_type: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    area: Optional[float] = None
    object_type: Optional[str] = None
    repair_type: Optional[str] = None
    status: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class ClientCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    company: Optional[str] = None
    inn: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    source: Optional[str] = None


# --- Маршруты для клиентов (ДО динамических) ---

@router.post("/clients")
async def create_client(data: ClientCreate, db: AsyncSession = Depends(get_db)):
    client = Client(
        name=data.name,
        phone=data.phone,
        email=data.email,
        company=data.company,
        inn=data.inn,
        address=data.address,
        notes=data.notes,
        source=data.source,
    )
    db.add(client)
    await db.flush()
    return {"id": str(client.id), "name": client.name}


@router.get("/clients")
async def list_clients(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Client).order_by(Client.created_at.desc()))
    return [
        {
            "id": str(c.id),
            "name": c.name,
            "phone": c.phone,
            "email": c.email,
            "company": c.company,
            "source": c.source,
        }
        for c in result.scalars().all()
    ]


# --- Маршруты для проектов ---

@router.get("/")
async def list_projects(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Project).order_by(Project.created_at.desc())
    )
    projects = result.scalars().all()
    return [
        {
            "id": str(p.id),
            "name": p.name,
            "status": p.status.value,
            "area": p.area,
            "object_type": p.object_type,
            "repair_type": p.repair_type,
            "city": p.city,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
        for p in projects
    ]


@router.post("/")
async def create_project(data: ProjectCreate, db: AsyncSession = Depends(get_db)):
    project = Project(
        name=data.name,
        client_id=uuid.UUID(data.client_id) if data.client_id else None,
        address=data.address,
        city=data.city,
        area=data.area,
        object_type=data.object_type,
        repair_type=data.repair_type,
        start_date=data.start_date,
        end_date=data.end_date,
    )
    db.add(project)
    await db.flush()
    return {"id": str(project.id), "name": project.name}


@router.get("/{project_id}")
async def get_project(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Project).where(Project.id == uuid.UUID(project_id))
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Проект не найден")
    return {
        "id": str(project.id),
        "name": project.name,
        "status": project.status.value,
        "area": project.area,
        "object_type": project.object_type,
        "repair_type": project.repair_type,
        "city": project.city,
        "address": project.address,
        "client_id": str(project.client_id) if project.client_id else None,
        "start_date": str(project.start_date) if project.start_date else None,
        "end_date": str(project.end_date) if project.end_date else None,
        "created_at": project.created_at.isoformat() if project.created_at else None,
    }


@router.put("/{project_id}")
async def update_project(
    project_id: str, data: ProjectUpdate, db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Project).where(Project.id == uuid.UUID(project_id))
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Проект не найден")

    for field, value in data.model_dump(exclude_unset=True).items():
        if field == "status" and value:
            setattr(project, field, ProjectStatus(value))
        elif value is not None:
            setattr(project, field, value)

    await db.flush()
    return {"id": str(project.id), "status": "updated"}


@router.delete("/{project_id}")
async def delete_project(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Project).where(Project.id == uuid.UUID(project_id))
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Проект не найден")

    await db.delete(project)
    await db.flush()
    return {"status": "deleted"}
