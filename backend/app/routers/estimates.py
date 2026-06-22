"""
API для работы со сметами
"""

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime

from app.database import get_db
from app.models.estimate import Estimate, EstimateItem, EstimateSection, EstimateType, EstimateStatus
from app.models.deal import Deal


# Схемы Pydantic
class EstimateItemCreate(BaseModel):
    """Создание позиции сметы"""
    section_id: Optional[int] = None
    item_number: Optional[str] = None
    justification: Optional[str] = None
    name: str
    description: Optional[str] = None
    unit: str = "шт"
    quantity: float = 1.0
    quantity_expr: Optional[str] = None       # формула: '5.2*3.1'
    materials_price: float = 0.0
    labor_price: float = 0.0
    machines_price: float = 0.0
    row_type: str = "pr"                      # pr/mat/meh/comment/irazd
    work_id: Optional[int] = None
    material_id: Optional[int] = None
    is_work: bool = True


class EstimateItemResponse(BaseModel):
    """Ответ с позицией сметы"""
    id: int
    item_number: Optional[str]
    justification: Optional[str]
    name: str
    unit: str
    quantity: float
    quantity_expr: Optional[str]
    materials_price: float
    labor_price: float
    machines_price: float
    materials_total: float
    labor_total: float
    machines_total: float
    total: float
    row_type: str

    class Config:
        from_attributes = True


class EstimateSectionCreate(BaseModel):
    """Создание раздела сметы"""
    number: Optional[str] = None
    name: str
    order_index: int = 0


class EstimateCreate(BaseModel):
    """Создание сметы / дефектовки"""
    name: str
    number: Optional[str] = None
    description: Optional[str] = None
    # Дефектовка — первичный документ, смета — из дефектовки
    estimate_type: EstimateType = EstimateType.DEFECTOVKA
    project_id: Optional[int] = None
    object_id: Optional[int] = None
    contract_id: Optional[int] = None
    source_defect_id: Optional[int] = None  # откуда создана смета
    deal_id: Optional[int] = None
    # Коэффициенты (как в Смета 2007)
    work_coef: float = 1.8
    material_coef: float = 1.04
    overhead_percent: float = 0.0
    profit_percent: float = 0.0
    vat_percent: float = 20.0
    vat_on_top: bool = True


class EstimateResponse(BaseModel):
    """Ответ с данными сметы"""
    id: int
    number: Optional[str]
    name: str
    description: Optional[str]
    estimate_type: EstimateType
    status: EstimateStatus
    work_coef: float
    material_coef: float
    materials_cost: float
    labor_cost: float
    machines_cost: float
    overhead_cost: float
    profit_cost: float
    total_cost: float
    vat_cost: float
    total_with_vat: float
    overhead_percent: float
    profit_percent: float
    vat_percent: float
    vat_on_top: bool
    source_defect_id: Optional[int]
    deal_id: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True


class EstimateListResponse(BaseModel):
    """Список смет с пагинацией"""
    items: List[EstimateResponse]
    total: int
    page: int
    pages: int


router = APIRouter()


@router.get("/", response_model=EstimateListResponse)
async def list_estimates(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    estimate_type: Optional[EstimateType] = None,
    status: Optional[EstimateStatus] = None,
    deal_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Получить список смет с фильтрацией и пагинацией
    """
    query = select(Estimate)
    
    # Фильтры
    if search:
        query = query.where(
            Estimate.name.ilike(f"%{search}%") | 
            Estimate.number.ilike(f"%{search}%")
        )
    if estimate_type:
        query = query.where(Estimate.estimate_type == estimate_type)
    if status:
        query = query.where(Estimate.status == status)
    if deal_id:
        query = query.where(Estimate.deal_id == deal_id)
    
    # Подсчёт общего количества
    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query)
    
    # Пагинация
    query = query.offset((page - 1) * per_page).limit(per_page)
    query = query.order_by(Estimate.created_at.desc())
    
    result = await db.execute(query)
    estimates = result.scalars().all()
    
    return EstimateListResponse(
        items=[EstimateResponse.model_validate(e) for e in estimates],
        total=total or 0,
        page=page,
        pages=((total or 0) + per_page - 1) // per_page
    )


@router.post("/", response_model=EstimateResponse)
async def create_estimate(
    data: EstimateCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Создать новую смету
    """
    # Генерация номера если не указан
    if not data.number:
        count = await db.scalar(select(func.count()).select_from(Estimate))
        data.number = f"ЛС-{(count or 0) + 1:04d}"
    
    estimate = Estimate(**data.model_dump())
    db.add(estimate)
    await db.flush()
    await db.refresh(estimate)
    
    # Sync with Deal
    if estimate.deal_id:
        deal_res = await db.execute(select(Deal).where(Deal.id == estimate.deal_id))
        deal = deal_res.scalar_one_or_none()
        if deal:
            deal.estimate_id = estimate.id
            deal.estimate_total = estimate.total_cost or 0.0
            deal.calculate_profit()
            await db.flush()
    
    return EstimateResponse.model_validate(estimate)


@router.get("/{estimate_id}", response_model=EstimateResponse)
async def get_estimate(
    estimate_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Получить смету по ID
    """
    result = await db.execute(
        select(Estimate).where(Estimate.id == estimate_id)
    )
    estimate = result.scalar_one_or_none()
    
    if not estimate:
        raise HTTPException(status_code=404, detail="Смета не найдена")
    
    return EstimateResponse.model_validate(estimate)


@router.put("/{estimate_id}", response_model=EstimateResponse)
async def update_estimate(
    estimate_id: int,
    data: EstimateCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Обновить смету
    """
    result = await db.execute(
        select(Estimate).where(Estimate.id == estimate_id)
    )
    estimate = result.scalar_one_or_none()
    
    if not estimate:
        raise HTTPException(status_code=404, detail="Смета не найдена")
    
    for key, value in data.model_dump().items():
        setattr(estimate, key, value)
    
    await db.flush()
    await db.refresh(estimate)
    
    # Sync with Deal
    if estimate.deal_id:
        deal_res = await db.execute(select(Deal).where(Deal.id == estimate.deal_id))
        deal = deal_res.scalar_one_or_none()
        if deal:
            deal.estimate_id = estimate.id
            deal.estimate_total = estimate.total_cost or 0.0
            deal.calculate_profit()
            await db.flush()
    
    return EstimateResponse.model_validate(estimate)


@router.delete("/{estimate_id}")
async def delete_estimate(
    estimate_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Удалить смету
    """
    result = await db.execute(
        select(Estimate).where(Estimate.id == estimate_id)
    )
    estimate = result.scalar_one_or_none()
    
    if not estimate:
        raise HTTPException(status_code=404, detail="Смета не найдена")

    # cascade="all, delete-orphan" в модели автоматически удалит items и sections
    await db.delete(estimate)
    await db.flush()

    return {"message": "Смета удалена", "id": estimate_id}


# Позиции сметы
@router.get("/{estimate_id}/items", response_model=List[EstimateItemResponse])
async def get_estimate_items(
    estimate_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Получить все позиции сметы
    """
    result = await db.execute(
        select(EstimateItem)
        .where(EstimateItem.estimate_id == estimate_id)
        .order_by(EstimateItem.order_index)
    )
    items = result.scalars().all()
    
    return [EstimateItemResponse.model_validate(item) for item in items]


@router.post("/{estimate_id}/items", response_model=EstimateItemResponse)
async def add_estimate_item(
    estimate_id: int,
    data: EstimateItemCreate,
    db: AsyncSession = Depends(get_db)
):
    """
    Добавить позицию в смету
    """
    # Проверяем существование сметы
    result = await db.execute(
        select(Estimate).where(Estimate.id == estimate_id)
    )
    estimate = result.scalar_one_or_none()
    if not estimate:
        raise HTTPException(status_code=404, detail="Смета не найдена")
    
    # Создаём позицию с коэффициентами сметы
    item = EstimateItem(estimate_id=estimate_id, **data.model_dump())
    item.calculate(
        work_coef=estimate.work_coef or 1.8,
        material_coef=estimate.material_coef or 1.04
    )

    db.add(item)
    await db.flush()
    await db.refresh(item)

    return EstimateItemResponse.model_validate(item)


@router.post("/{estimate_id}/recalculate", response_model=EstimateResponse)
async def recalculate_estimate(
    estimate_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Пересчитать итоги сметы
    """
    result = await db.execute(
        select(Estimate).where(Estimate.id == estimate_id)
    )
    estimate = result.scalar_one_or_none()
    
    if not estimate:
        raise HTTPException(status_code=404, detail="Смета не найдена")
    
    # Загружаем позиции и пересчитываем по алгоритму Смета 2007
    items_result = await db.execute(
        select(EstimateItem).where(EstimateItem.estimate_id == estimate_id)
    )
    estimate.items = items_result.scalars().all()
    estimate.recalculate()

    await db.flush()
    await db.refresh(estimate)

    # Sync with Deal
    if estimate.deal_id:
        deal_res = await db.execute(select(Deal).where(Deal.id == estimate.deal_id))
        deal = deal_res.scalar_one_or_none()
        if deal:
            deal.estimate_id = estimate.id
            deal.estimate_total = estimate.total_cost or 0.0
            deal.calculate_profit()
            await db.flush()

    return EstimateResponse.model_validate(estimate)


@router.post("/{estimate_id}/copy", response_model=EstimateResponse)
async def copy_estimate(
    estimate_id: int,
    new_name: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Копировать смету вместе с разделами и позициями
    """
    result = await db.execute(
        select(Estimate).where(Estimate.id == estimate_id)
    )
    original = result.scalar_one_or_none()

    if not original:
        raise HTTPException(status_code=404, detail="Смета не найдена")

    # Создаём копию сметы
    count = await db.scalar(select(func.count()).select_from(Estimate))

    new_estimate = Estimate(
        number=f"ЛС-{(count or 0) + 1:04d}",
        name=new_name or f"{original.name} (копия)",
        description=original.description,
        estimate_type=original.estimate_type,
        project_id=original.project_id,
        object_id=original.object_id,
        contract_id=original.contract_id,
        work_coef=original.work_coef,
        material_coef=original.material_coef,
        overhead_percent=original.overhead_percent,
        profit_percent=original.profit_percent,
        vat_percent=original.vat_percent,
        vat_on_top=original.vat_on_top,
        source_defect_id=original.source_defect_id,
    )
    db.add(new_estimate)
    await db.flush()

    # Копируем разделы
    sections_result = await db.execute(
        select(EstimateSection).where(EstimateSection.estimate_id == estimate_id)
    )
    sections = sections_result.scalars().all()
    section_map = {}
    for section in sections:
        new_section = EstimateSection(
            estimate_id=new_estimate.id,
            number=section.number,
            name=section.name,
            order_index=section.order_index,
        )
        db.add(new_section)
        await db.flush()
        section_map[section.id] = new_section.id

    # Копируем позиции с привязкой к разделам
    items_result = await db.execute(
        select(EstimateItem).where(EstimateItem.estimate_id == estimate_id)
    )
    items = items_result.scalars().all()

    for item in items:
        new_item = EstimateItem(
            estimate_id=new_estimate.id,
            section_id=section_map.get(item.section_id),
            item_number=item.item_number,
            justification=item.justification,
            name=item.name,
            description=item.description,
            unit=item.unit,
            quantity=item.quantity,
            quantity_expr=item.quantity_expr,
            materials_price=item.materials_price,
            labor_price=item.labor_price,
            machines_price=item.machines_price,
            row_type=item.row_type,
            order_index=item.order_index,
        )
        new_item.calculate(
            work_coef=new_estimate.work_coef or 1.8,
            material_coef=new_estimate.material_coef or 1.04
        )
        db.add(new_item)

    await db.flush()
    await db.refresh(new_estimate)

    return EstimateResponse.model_validate(new_estimate)


class CreateSmetaFromDefectRequest(BaseModel):
    """Параметры для создания сметы из дефектовки"""
    work_coef: float = 1.8
    material_coef: float = 1.04
    overhead_percent: float = 0.0
    profit_percent: float = 0.0
    vat_percent: float = 20.0
    vat_on_top: bool = True
    name: Optional[str] = None


@router.post("/{defect_id}/create_smeta", response_model=EstimateResponse)
async def create_smeta_from_defect(
    defect_id: int,
    params: CreateSmetaFromDefectRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Создать смету из дефектовки (главный workflow Смета 2007).
    Копирует все строки из дефектовки и применяет коэффициенты.
    """
    # Загружаем дефектовку
    result = await db.execute(select(Estimate).where(Estimate.id == defect_id))
    defect = result.scalar_one_or_none()
    if not defect:
        raise HTTPException(status_code=404, detail="Дефектовка не найдена")
    if defect.estimate_type != EstimateType.DEFECTOVKA:
        raise HTTPException(status_code=400, detail="Документ не является дефектовкой")

    count = await db.scalar(select(func.count()).select_from(Estimate))
    smeta_name = params.name or f"Смета по дефектовке: {defect.name}"

    smeta = Estimate(
        number=f"ЛС-{(count or 0) + 1:04d}",
        name=smeta_name,
        description=defect.description,
        estimate_type=EstimateType.LOCAL,
        project_id=defect.project_id,
        object_id=defect.object_id,
        contract_id=defect.contract_id,
        source_defect_id=defect_id,
        work_coef=params.work_coef,
        material_coef=params.material_coef,
        overhead_percent=params.overhead_percent,
        profit_percent=params.profit_percent,
        vat_percent=params.vat_percent,
        vat_on_top=params.vat_on_top,
    )
    db.add(smeta)
    await db.flush()

    # Копируем все строки из дефектовки, пересчитываем с коэффициентами
    items_result = await db.execute(
        select(EstimateItem)
        .where(EstimateItem.estimate_id == defect_id)
        .order_by(EstimateItem.order_index)
    )
    items = items_result.scalars().all()

    new_items = []
    for item in items:
        new_item = EstimateItem(
            estimate_id=smeta.id,
            section_id=None,
            item_number=item.item_number,
            justification=item.justification,
            name=item.name,
            description=item.description,
            unit=item.unit,
            quantity=item.quantity,
            quantity_expr=item.quantity_expr,
            materials_price=item.materials_price,
            labor_price=item.labor_price,
            machines_price=item.machines_price,
            row_type=item.row_type or 'pr',
            order_index=item.order_index,
        )
        new_item.calculate(
            work_coef=params.work_coef,
            material_coef=params.material_coef
        )
        db.add(new_item)
        new_items.append(new_item)

    await db.flush()

    # Пересчитываем итоги сметы
    smeta.items = new_items
    smeta.recalculate()

    await db.flush()
    await db.refresh(smeta)

    return EstimateResponse.model_validate(smeta)


@router.post("/{estimate_id}/approve")
async def approve_estimate(
    estimate_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Утвердить смету
    """
    result = await db.execute(
        select(Estimate).where(Estimate.id == estimate_id)
    )
    estimate = result.scalar_one_or_none()
    
    if not estimate:
        raise HTTPException(status_code=404, detail="Смета не найдена")
    
    estimate.status = EstimateStatus.APPROVED
    estimate.approved_at = datetime.utcnow()
    
    await db.flush()
    
    return {"message": "Смета утверждена", "id": estimate_id}
