"""
API роутер для прикладной бизнес-аналитики CRM.
Отвечает на вопросы: откуда деньги, воронка продаж, прогноз дохода, проблемные сделки.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from typing import List, Dict, Optional
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone

from app.database import get_db
from app.models.deal import Deal, DealStage

# === Pydantic Схемы ===

class FunnelStage(BaseModel):
    stage: str
    count: int
    conversion_from_prev: Optional[float]

class SourceROI(BaseModel):
    source: str
    leads_count: int
    sales_count: int
    revenue: float
    profit: float

class Forecast(BaseModel):
    expected_profit: float
    potential_revenue: float

class RiskyDeal(BaseModel):
    id: int
    title: str
    stage: str
    reason: str
    days_stalled: int

class AnalyticsDashboard(BaseModel):
    funnel: List[FunnelStage]
    sources: List[SourceROI]
    forecast: Forecast
    risky_deals: List[RiskyDeal]


# === Роутер ===
router = APIRouter()

# Порядок этапов для воронки
STAGE_ORDER = [
    DealStage.LEAD,
    DealStage.CONTACT,
    DealStage.CALL,
    DealStage.MEETING,
    DealStage.ADVANCE,
    DealStage.MASTER,
    DealStage.CONTROL,
    DealStage.PROFIT,
]

@router.get("/", response_model=AnalyticsDashboard)
async def get_dashboard_analytics(db: AsyncSession = Depends(get_db)):
    """Сборная аналитика для дашборда"""
    
    # Загружаем все неудаленные сделки
    result = await db.execute(select(Deal).where(Deal.is_lost == False))
    deals = result.scalars().all()
    
    # 1. Воронка (Funnel)
    stage_counts = {stage.value: 0 for stage in STAGE_ORDER}
    for d in deals:
        stage_val = d.stage.value if isinstance(d.stage, DealStage) else d.stage
        if stage_val in stage_counts:
            stage_counts[stage_val] += 1
            
    # Конверсия (накапливаемая или step-by-step). Делаем классическую воронку:
    # Сколько сделок дошло ДО этого этапа ИЛИ дальше.
    funnel_data = []
    cumulative_count = len(deals)
    
    for i, stage in enumerate(STAGE_ORDER):
        val = stage.value
        # Текущий этап - это те, кто сейчас на нем, плюс те, кто уже прошел дальше
        # Для простоты покажем реальное количество на этапе сейчас + тех кто дальше
        passed_stage = sum(stage_counts[s.value] for s in STAGE_ORDER[i:])
        
        conversion = 100.0
        if i > 0 and funnel_data[-1].count > 0:
            conversion = round((passed_stage / funnel_data[-1].count) * 100, 1)
        elif i > 0:
            conversion = 0.0
            
        funnel_data.append(FunnelStage(
            stage=val,
            count=passed_stage, # классическая воронка показывает сколько прошло через этап
            conversion_from_prev=conversion if i > 0 else None
        ))

    # 2. Источники (Sources ROI)
    source_stats = {}
    for d in deals:
        src = d.source or "other"
        if src not in source_stats:
            source_stats[src] = {"leads": 0, "sales": 0, "revenue": 0.0, "profit": 0.0}
            
        source_stats[src]["leads"] += 1
        
        # Считаем продажей, если этап Аванс, В работе, Контроль или Прибыль
        stage_val = d.stage.value if isinstance(d.stage, DealStage) else d.stage
        if stage_val in [DealStage.ADVANCE.value, DealStage.MASTER.value, DealStage.CONTROL.value, DealStage.PROFIT.value]:
            source_stats[src]["sales"] += 1
            source_stats[src]["revenue"] += (d.sale_amount or 0.0)
            source_stats[src]["profit"] += (d.profit or 0.0)
            
    sources_data = [
        SourceROI(
            source=k, 
            leads_count=v["leads"], 
            sales_count=v["sales"], 
            revenue=v["revenue"],
            profit=v["profit"]
        ) 
        for k, v in source_stats.items()
    ]
    # Сортируем по прибыли
    sources_data.sort(key=lambda x: x.profit, reverse=True)

    # 3. Прогноз
    weights = {
        DealStage.LEAD.value: 0.1,
        DealStage.CONTACT.value: 0.2,
        DealStage.CALL.value: 0.3,
        DealStage.MEETING.value: 0.5,
        DealStage.ADVANCE.value: 0.8,
        DealStage.MASTER.value: 0.9,
        DealStage.CONTROL.value: 0.95,
        DealStage.PROFIT.value: 1.0,
    }
    
    potential_revenue = sum((d.sale_amount or 0) for d in deals)
    
    expected_profit = 0.0
    for d in deals:
        stage_val = d.stage.value if isinstance(d.stage, DealStage) else d.stage
        w = weights.get(stage_val, 0)
        expected_profit += (d.profit or 0) * w

    forecast = Forecast(
        expected_profit=round(expected_profit, 2),
        potential_revenue=round(potential_revenue, 2)
    )

    # 4. Проблемные (Рискованные) сделки
    now = datetime.now(timezone.utc)
    risky_deals = []
    
    for d in deals:
        # Пропускаем закрытые
        stage_val = d.stage.value if isinstance(d.stage, DealStage) else d.stage
        if stage_val == DealStage.PROFIT.value:
            continue
            
        upd = d.updated_at
        if upd is not None and upd.tzinfo is None:
            upd = upd.replace(tzinfo=timezone.utc)
            
        days_stalled = (now - upd).days if upd else 0
        
        reason = None
        if stage_val in [DealStage.MASTER.value, DealStage.CONTROL.value] and (d.profit or 0) <= 0:
            reason = "Нулевая или отрицательная прибыль в работе!"
        elif stage_val in [DealStage.MASTER.value, DealStage.CONTROL.value] and (d.advance_amount or 0) <= 0:
            reason = "В работе, но нет аванса!"
        elif days_stalled > 14:
            reason = "Застряла: без движения более 14 дней"
        elif stage_val == DealStage.MEETING.value and days_stalled > 7:
            reason = "После встречи прошло больше недели"
            
        if reason:
            risky_deals.append(RiskyDeal(
                id=d.id,
                title=d.title,
                stage=stage_val,
                reason=reason,
                days_stalled=days_stalled
            ))
            
    # Сортируем риски - свежие/самые критичные
    risky_deals.sort(key=lambda x: x.days_stalled, reverse=True)

    return AnalyticsDashboard(
        funnel=funnel_data,
        sources=sources_data[:10], # Top 10
        forecast=forecast,
        risky_deals=risky_deals
    )
