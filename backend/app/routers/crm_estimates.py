"""
Роутер для управления сметными строками в CRM (исполнители, отметки о выполнении, экспорт)
"""

import os
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from pydantic import BaseModel
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

from app.database import get_db
from app.models.estimate import Estimate, EstimateItem, EstimateSection
from app.models.user import User, UserRole
from app.models.project import Project
from app.models.document_registry import DocumentType
from app.routers.auth import get_current_user
from app.services.document_generator import DocumentGeneratorService

router = APIRouter()


# --- Схемы данных ---

class ItemAssignRequest(BaseModel):
    executor_id: Optional[int] = None


class ItemCompleteRequest(BaseModel):
    is_completed: bool


class EstimateItemCRMResponse(BaseModel):
    id: int
    estimate_id: int
    item_number: Optional[str] = None
    name: str
    unit: Optional[str] = "шт"
    quantity: float
    materials_price: float
    labor_price: float
    total: float
    row_type: str
    is_work: bool
    executor_id: Optional[int] = None
    done_at: Optional[datetime] = None
    executor_name: Optional[str] = None

    class Config:
        from_attributes = True


# --- Эндпоинты ---

@router.get("/{estimate_id}/items", response_model=List[EstimateItemCRMResponse])
async def list_estimate_items(
    estimate_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Список позиций сметы с информацией об исполнителях"""
    # Проверка доступа
    est_res = await db.execute(
        select(Estimate)
        .where(Estimate.id == estimate_id)
        .options(selectinload(Estimate.project))
    )
    estimate = est_res.scalar_one_or_none()
    if not estimate:
        raise HTTPException(status_code=404, detail="Смета не найдена")

    if estimate.project and estimate.project.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Нет прав доступа")

    items_res = await db.execute(
        select(EstimateItem)
        .where(EstimateItem.estimate_id == estimate_id)
        .options(selectinload(EstimateItem.executor))
        .order_by(EstimateItem.order_index.asc())
    )
    items = items_res.scalars().all()

    response_data = []
    for item in items:
        response_data.append({
            "id": item.id,
            "estimate_id": item.estimate_id,
            "item_number": item.item_number,
            "name": item.name,
            "unit": item.unit,
            "quantity": item.quantity,
            "materials_price": item.materials_price,
            "labor_price": item.labor_price,
            "total": item.total,
            "row_type": item.row_type,
            "is_work": item.is_work,
            "executor_id": item.executor_id,
            "done_at": item.done_at,
            "executor_name": item.executor.full_name if item.executor else None
        })
    return response_data


@router.post("/items/{item_id}/assign", response_model=EstimateItemCRMResponse)
async def assign_item_executor(
    item_id: int,
    data: ItemAssignRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Назначить исполнителя на строку сметы"""
    result = await db.execute(
        select(EstimateItem)
        .where(EstimateItem.id == item_id)
        .options(selectinload(EstimateItem.estimate).selectinload(Estimate.project))
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Позиция сметы не найдена")

    # Проверка доступа к проекту сметы
    if item.estimate.project and item.estimate.project.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Нет прав доступа")

    # Если передан исполнитель, проверяем его существование и компанию
    if data.executor_id:
        exec_res = await db.execute(
            select(User).where(User.id == data.executor_id, User.company_id == current_user.company_id)
        )
        if not exec_res.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Указанный исполнитель не найден в компании")

    item.executor_id = data.executor_id
    await db.commit()

    # Загружаем с исполнителем для ответа
    res = await db.execute(
        select(EstimateItem)
        .where(EstimateItem.id == item.id)
        .options(selectinload(EstimateItem.executor))
    )
    db_item = res.scalar_one()

    return {
        "id": db_item.id,
        "estimate_id": db_item.estimate_id,
        "item_number": db_item.item_number,
        "name": db_item.name,
        "unit": db_item.unit,
        "quantity": db_item.quantity,
        "materials_price": db_item.materials_price,
        "labor_price": db_item.labor_price,
        "total": db_item.total,
        "row_type": db_item.row_type,
        "is_work": db_item.is_work,
        "executor_id": db_item.executor_id,
        "done_at": db_item.done_at,
        "executor_name": db_item.executor.full_name if db_item.executor else None
    }


@router.post("/items/{item_id}/complete", response_model=EstimateItemCRMResponse)
async def complete_item(
    item_id: int,
    data: ItemCompleteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Отметить позицию сметы как выполненную (или отменить выполнение)"""
    result = await db.execute(
        select(EstimateItem)
        .where(EstimateItem.id == item_id)
        .options(selectinload(EstimateItem.estimate).selectinload(Estimate.project))
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Позиция сметы не найдена")

    # Проверка доступа
    if item.estimate.project and item.estimate.project.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Нет прав доступа")

    item.done_at = datetime.utcnow() if data.is_completed else None
    await db.commit()

    # Загружаем с исполнителем для ответа
    res = await db.execute(
        select(EstimateItem)
        .where(EstimateItem.id == item.id)
        .options(selectinload(EstimateItem.executor))
    )
    db_item = res.scalar_one()

    return {
        "id": db_item.id,
        "estimate_id": db_item.estimate_id,
        "item_number": db_item.item_number,
        "name": db_item.name,
        "unit": db_item.unit,
        "quantity": db_item.quantity,
        "materials_price": db_item.materials_price,
        "labor_price": db_item.labor_price,
        "total": db_item.total,
        "row_type": db_item.row_type,
        "is_work": db_item.is_work,
        "executor_id": db_item.executor_id,
        "done_at": db_item.done_at,
        "executor_name": db_item.executor.full_name if db_item.executor else None
    }


@router.get("/{estimate_id}/export/excel")
async def export_estimate_excel(
    estimate_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Экспорт сметы в файл Excel (XLSX)"""
    est_res = await db.execute(
        select(Estimate)
        .where(Estimate.id == estimate_id)
        .options(selectinload(Estimate.project))
    )
    estimate = est_res.scalar_one_or_none()
    if not estimate:
        raise HTTPException(status_code=404, detail="Смета не найдена")

    if estimate.project and estimate.project.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Нет прав доступа")

    # Получаем название организации текущего пользователя
    company_name = current_user.company.name if current_user.company else "SmetaAI CRM"

    service = DocumentGeneratorService(db)
    doc_record = await service.generate_document(
        estimate_id=estimate_id,
        doc_type=DocumentType.ESTIMATE,
        extra_params={"company_name": company_name}
    )

    if not doc_record.file_path or not os.path.exists(doc_record.file_path):
        raise HTTPException(status_code=500, detail="Ошибка при генерации Excel файла")

    return FileResponse(
        path=doc_record.file_path,
        filename=os.path.basename(doc_record.file_path),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )


@router.get("/{estimate_id}/export/pdf")
async def export_estimate_pdf(
    estimate_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Экспорт сметы в PDF с фирменным оформлением организации"""
    est_res = await db.execute(
        select(Estimate)
        .where(Estimate.id == estimate_id)
        .options(
            selectinload(Estimate.project),
            selectinload(Estimate.items),
            selectinload(Estimate.sections)
        )
    )
    estimate = est_res.scalar_one_or_none()
    if not estimate:
        raise HTTPException(status_code=404, detail="Смета не найдена")

    if estimate.project and estimate.project.company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Нет прав доступа")

    # Регистрируем кириллический шрифт Roboto (файл roboto.ttf есть в frontend/src, скопируем или используем стандартный Helvetica если кириллица не нужна, но кириллица важна!)
    # Проверим наличие roboto.ttf в frontend/src/roboto.ttf
    roboto_path = os.path.join("frontend", "src", "roboto.ttf")
    if os.path.exists(roboto_path):
        try:
            pdfmetrics.registerFont(TTFont("Roboto", roboto_path))
            font_name = "Roboto"
        except Exception:
            font_name = "Helvetica"
    else:
        font_name = "Helvetica"

    # Создаем PDF в папке output
    output_dir = "output"
    os.makedirs(output_dir, exist_ok=True)
    pdf_filename = f"Estimate_{estimate.id}_{datetime.now().strftime('%Y%m%d%H%M%S')}.pdf"
    pdf_path = os.path.join(output_dir, pdf_filename)

    doc = SimpleDocTemplate(pdf_path, pagesize=A4, rightMargin=30, leftMargin=30, topMargin=30, bottomMargin=30)
    styles = getSampleStyleSheet()
    
    # Стили
    title_style = ParagraphStyle(
        "PdfTitle",
        parent=styles["Heading1"],
        fontName=font_name,
        fontSize=16,
        leading=20,
        alignment=1, # Center
        spaceAfter=15
    )
    normal_style = ParagraphStyle(
        "PdfNormal",
        parent=styles["Normal"],
        fontName=font_name,
        fontSize=10,
        leading=14,
        spaceAfter=10
    )
    table_header_style = ParagraphStyle(
        "TableHeader",
        parent=styles["Normal"],
        fontName=font_name,
        fontSize=9,
        leading=12,
        textColor=colors.whitesmoke
    )
    table_cell_style = ParagraphStyle(
        "TableCell",
        parent=styles["Normal"],
        fontName=font_name,
        fontSize=8,
        leading=11
    )

    story = []

    # Заголовок сметы
    company_name = current_user.company.name if current_user.company else "ZARU Смета"
    story.append(Paragraph(f"ЛОКАЛЬНАЯ СМЕТА № {estimate.number or estimate.id}", title_style))
    story.append(Paragraph(f"<b>Организация:</b> {company_name}", normal_style))
    story.append(Paragraph(f"<b>Объект / Проект:</b> {estimate.project.name if estimate.project else 'Без проекта'}", normal_style))
    story.append(Paragraph(f"<b>Наименование сметы:</b> {estimate.name}", normal_style))
    story.append(Spacer(1, 15))

    # Таблица позиций сметы
    # Колонки: №, Наименование, Ед. изм., Кол-во, Цена, Всего
    headers = ["№", "Наименование работ / материалов", "Ед. изм.", "Кол-во", "Цена (руб.)", "Всего (руб.)"]
    data = [[Paragraph(h, table_header_style) for h in headers]]

    idx = 1
    for item in estimate.items:
        if item.row_type in ("comment", "spr"):
            # Строка комментария
            data.append([
                Paragraph(str(idx), table_cell_style),
                Paragraph(f"<i>{item.name}</i>", table_cell_style),
                "", "", "", ""
            ])
        else:
            unit_price = item.labor_price + item.materials_price + item.machines_price
            data.append([
                Paragraph(str(idx), table_cell_style),
                Paragraph(item.name, table_cell_style),
                Paragraph(item.unit or "шт", table_cell_style),
                Paragraph(f"{item.quantity:.2f}", table_cell_style),
                Paragraph(f"{unit_price:.2f}", table_cell_style),
                Paragraph(f"{item.total:.2f}", table_cell_style),
            ])
            idx += 1

    # Добавляем строку итого
    data.append([
        "",
        Paragraph("<b>ИТОГО ПО СМЕТЕ:</b>", table_cell_style),
        "", "", "",
        Paragraph(f"<b>{estimate.total_with_vat:.2f}</b>", table_cell_style)
    ])

    # Стилизация таблицы
    col_widths = [20, 240, 40, 50, 70, 80]
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#1e293b")), # Slate-800
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
        ('GRID', (0,0), (-1,-2), 0.5, colors.grey),
        ('LINEBELOW', (0,-1), (-1,-1), 1.5, colors.HexColor("#1e293b")),
        ('TOPPADDING', (0,0), (-1,-1), 5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ]))

    story.append(t)
    story.append(Spacer(1, 20))

    # Сметные итоги подробно
    story.append(Paragraph(f"Стоимость работ: {estimate.labor_cost:.2f} руб.", normal_style))
    story.append(Paragraph(f"Стоимость материалов: {estimate.materials_cost:.2f} руб.", normal_style))
    if estimate.vat_cost > 0:
        story.append(Paragraph(f"НДС ({estimate.vat_percent}%): {estimate.vat_cost:.2f} руб.", normal_style))
    story.append(Paragraph(f"<b>Итого к оплате с НДС: {estimate.total_with_vat:.2f} руб.</b>", normal_style))

    doc.build(story)

    return FileResponse(
        path=pdf_path,
        filename=f"Estimate_{estimate.id}.pdf",
        media_type="application/pdf"
    )
