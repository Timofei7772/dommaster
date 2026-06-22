"""
API маршруты для документов.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi.responses import FileResponse

from database import get_db
from models import Document
from services.document_generator import DocumentGeneratorService

router = APIRouter()


@router.post("/{estimate_id}/generate-all")
async def generate_all(estimate_id: str, db: AsyncSession = Depends(get_db)):
    svc = DocumentGeneratorService(db)
    docs = await svc.generate_all(uuid.UUID(estimate_id))
    return [
        {
            "type": d.document_type.value,
            "file_name": d.file_name,
            "file_path": d.file_path,
        }
        for d in docs
    ]


@router.post("/{estimate_id}/kp")
async def generate_kp(estimate_id: str, db: AsyncSession = Depends(get_db)):
    svc = DocumentGeneratorService(db)
    doc = await svc.generate_kp(uuid.UUID(estimate_id))
    return {"file_name": doc.file_name, "file_path": doc.file_path}


@router.post("/{estimate_id}/contract")
async def generate_contract(estimate_id: str, db: AsyncSession = Depends(get_db)):
    svc = DocumentGeneratorService(db)
    doc = await svc.generate_contract(uuid.UUID(estimate_id))
    return {"file_name": doc.file_name, "file_path": doc.file_path}


@router.post("/{estimate_id}/ks2")
async def generate_ks2(estimate_id: str, db: AsyncSession = Depends(get_db)):
    svc = DocumentGeneratorService(db)
    doc = await svc.generate_ks2(uuid.UUID(estimate_id))
    return {"file_name": doc.file_name, "file_path": doc.file_path}


@router.post("/{estimate_id}/ks3")
async def generate_ks3(estimate_id: str, db: AsyncSession = Depends(get_db)):
    svc = DocumentGeneratorService(db)
    doc = await svc.generate_ks3(uuid.UUID(estimate_id))
    return {"file_name": doc.file_name, "file_path": doc.file_path}


@router.post("/{estimate_id}/m29")
async def generate_m29(estimate_id: str, db: AsyncSession = Depends(get_db)):
    svc = DocumentGeneratorService(db)
    doc = await svc.generate_m29(uuid.UUID(estimate_id))
    return {"file_name": doc.file_name, "file_path": doc.file_path}


@router.post("/{estimate_id}/invoice")
async def generate_invoice(estimate_id: str, db: AsyncSession = Depends(get_db)):
    svc = DocumentGeneratorService(db)
    doc = await svc.generate_invoice(uuid.UUID(estimate_id))
    return {"file_name": doc.file_name, "file_path": doc.file_path}


@router.get("/{estimate_id}/list")
async def list_documents(estimate_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Document).where(Document.estimate_id == uuid.UUID(estimate_id))
    )
    docs = result.scalars().all()
    return [
        {
            "id": str(d.id),
            "type": d.document_type.value,
            "file_name": d.file_name,
            "file_size": d.file_size,
            "created_at": d.created_at.isoformat() if d.created_at else None,
        }
        for d in docs
    ]


@router.get("/download/{document_id}")
async def download_document(document_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Document).where(Document.id == uuid.UUID(document_id))
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Документ не найден")

    return FileResponse(doc.file_path, filename=doc.file_name)
