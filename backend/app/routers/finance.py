"""
API роутер для финансовой аналитики
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from app.database import get_db
from app.services.finance_service import FinanceService
from app.services.profit_optimization import ProfitOptimizationService
from app.services.estimate_validator import EstimateValidator
from app.services.estimate_service import EstimateService
from app.services.material_calculator import MaterialCalculator


router = APIRouter()


@router.get("/pnl/{estimate_id}")
async def get_pnl(estimate_id: int, db: AsyncSession = Depends(get_db)):
    """P&L (прибыль и убытки) по смете"""
    service = FinanceService(db)
    return await service.get_estimate_pnl(estimate_id)


@router.get("/project/{project_id}")
async def get_project_finance(project_id: int, db: AsyncSession = Depends(get_db)):
    """Финансовая сводка по проекту"""
    service = FinanceService(db)
    return await service.get_project_finance_summary(project_id)


@router.post("/labor-payments/{estimate_id}")
async def calculate_labor_payments(
    estimate_id: int,
    master_rate: float = Query(0.4, ge=0, le=1, description="Доля мастера"),
    brigade_rate: float = Query(0.35, ge=0, le=1, description="Доля бригады"),
    db: AsyncSession = Depends(get_db),
):
    """Рассчитать ФОТ по смете"""
    service = FinanceService(db)
    return await service.calculate_labor_payments(estimate_id, master_rate, brigade_rate)


@router.get("/optimize/{estimate_id}")
async def optimize_profit(estimate_id: int, db: AsyncSession = Depends(get_db)):
    """Анализ оптимизации прибыли"""
    service = ProfitOptimizationService(db)
    return await service.analyze_estimate(estimate_id)


@router.get("/validate/{estimate_id}")
async def validate_estimate(estimate_id: int, db: AsyncSession = Depends(get_db)):
    """Валидация сметы"""
    validator = EstimateValidator(db)
    return await validator.validate(estimate_id)


@router.get("/statistics/{estimate_id}")
async def get_statistics(estimate_id: int, db: AsyncSession = Depends(get_db)):
    """Статистика по смете"""
    service = EstimateService(db)
    return await service.get_statistics(estimate_id)


@router.post("/materials/{estimate_id}")
async def calculate_materials(estimate_id: int, db: AsyncSession = Depends(get_db)):
    """Рассчитать расход материалов по нормам"""
    calculator = MaterialCalculator(db)
    usages = await calculator.calculate_for_estimate(estimate_id)
    return {"detail": f"Рассчитано {len(usages)} позиций материалов"}


@router.get("/materials/summary/{estimate_id}")
async def get_material_summary(estimate_id: int, db: AsyncSession = Depends(get_db)):
    """Сводка расхода материалов"""
    calculator = MaterialCalculator(db)
    return await calculator.get_material_summary(estimate_id)
