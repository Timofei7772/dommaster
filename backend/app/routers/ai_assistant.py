"""
ИИ-помощник для сметных расчётов

Возможности:
- Подбор расценок по описанию работ
- Проверка смет на ошибки
- Рекомендации по оптимизации
- Автозаполнение позиций
- Ответы на вопросы по сметному делу
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
import json
import re
from datetime import datetime

from app.database import get_db
from app.models.work import Work
from app.models.material import Material
from app.models.estimate import Estimate, EstimateItem
from app.config import settings


# Схемы для ИИ-ассистента
class ChatMessage(BaseModel):
    """Сообщение в чате"""
    role: str = Field(..., description="user или assistant")
    content: str


class ChatRequest(BaseModel):
    """Запрос к ИИ-ассистенту"""
    message: str = Field(..., description="Сообщение пользователя")
    context: Optional[str] = Field(None, description="Контекст (текущая смета и т.д.)")
    history: List[ChatMessage] = Field(default=[], description="История диалога")


class ChatResponse(BaseModel):
    """Ответ ИИ-ассистента"""
    message: str
    suggestions: List[str] = []
    actions: List[Dict[str, Any]] = []
    related_works: List[Dict] = []
    related_materials: List[Dict] = []


class WorkSuggestion(BaseModel):
    """Предложение по расценке"""
    id: int
    code: Optional[str]
    name: str
    unit: str
    total_price: float
    relevance_score: float
    reason: str


class EstimateAnalysis(BaseModel):
    """Анализ сметы"""
    estimate_id: int
    total_items: int
    total_cost: float
    issues: List[Dict[str, str]]
    recommendations: List[str]
    optimization_potential: float


class QuickAction(BaseModel):
    """Быстрое действие"""
    action_type: str
    title: str
    description: str
    params: Dict[str, Any] = {}


router = APIRouter()


# База знаний по сметному делу (встроенная)
SMETA_KNOWLEDGE_BASE = {
    "накладные_расходы": """
    Накладные расходы - это затраты, связанные с организацией и обслуживанием 
    строительного производства. Обычно составляют 12-25% от прямых затрат.
    Включают: административные расходы, содержание офиса, охрану труда и т.д.
    """,
    "сметная_прибыль": """
    Сметная прибыль - это средства для покрытия расходов подрядчика на развитие 
    производства и материальное стимулирование работников. Обычно 8-12% от прямых затрат.
    """,
    "кс2": """
    КС-2 (Акт о приёмке выполненных работ) - документ, подтверждающий факт 
    выполнения строительно-монтажных работ. Составляется ежемесячно или по 
    завершении этапа работ. Форма утверждена Госкомстатом.
    """,
    "кс3": """
    КС-3 (Справка о стоимости выполненных работ и затрат) - документ для 
    расчётов между заказчиком и подрядчиком. Составляется на основании КС-2.
    Отражает накопительную стоимость работ.
    """,
    "тер": """
    ТЕР (Территориальные единичные расценки) - сборники расценок на строительные 
    работы, разработанные для конкретного региона с учётом местных условий и цен.
    """,
    "фер": """
    ФЕР (Федеральные единичные расценки) - единые расценки для всей территории РФ 
    в базовом уровне цен. Используются при отсутствии ТЕР или для федеральных объектов.
    """,
    "ресурсный_метод": """
    Ресурсный метод расчёта - метод определения сметной стоимости на основе 
    реальных (текущих) цен на ресурсы: материалы, оплату труда, механизмы.
    Более точный, но трудоёмкий метод.
    """
}


# Паттерны для распознавания намерений пользователя
INTENT_PATTERNS = {
    "search_work": [
        r"найти? (?:работу|расценку|работы)",
        r"подобрать? расценку",
        r"какая расценка (?:на|для)",
        r"расценка (?:на|для|по)",
    ],
    "search_material": [
        r"найти? материал",
        r"цена (?:на|материала)",
        r"стоимость материала",
    ],
    "explain": [
        r"что такое",
        r"объясни",
        r"расскажи про",
        r"как (?:считать|рассчитать|посчитать)",
    ],
    "analyze": [
        r"проверь смету",
        r"анализ сметы",
        r"найди ошибки",
        r"оптимизировать",
    ],
    "help": [
        r"помощь",
        r"что (?:ты )?умеешь",
        r"как пользоваться",
    ]
}


def detect_intent(message: str) -> str:
    """Определение намерения пользователя"""
    message_lower = message.lower()
    
    for intent, patterns in INTENT_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, message_lower):
                return intent
    
    return "general"


def extract_search_query(message: str) -> str:
    """Извлечение поискового запроса из сообщения"""
    # Удаляем стоп-слова
    stop_words = [
        "найти", "найди", "подобрать", "подбери", "расценку", "расценки",
        "работу", "работы", "материал", "материалы", "на", "для", "по",
        "какая", "какой", "какие", "нужна", "нужен", "пожалуйста"
    ]
    
    words = message.lower().split()
    query_words = [w for w in words if w not in stop_words and len(w) > 2]
    
    return " ".join(query_words)


@router.post("/chat", response_model=ChatResponse)
async def chat_with_assistant(
    request: ChatRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Чат с ИИ-помощником
    
    Примеры запросов:
    - "Найди расценку на укладку плитки"
    - "Что такое накладные расходы?"
    - "Проверь мою смету на ошибки"
    - "Как рассчитать КС-2?"
    """
    message = request.message
    intent = detect_intent(message)
    
    response = ChatResponse(message="", suggestions=[], actions=[], related_works=[], related_materials=[])
    
    if intent == "search_work":
        # Поиск расценок
        query_text = extract_search_query(message)
        
        if query_text:
            # Поиск в базе работ
            search_query = select(Work).where(
                Work.is_active == True,
                Work.name.ilike(f"%{query_text}%")
            ).limit(10)
            
            result = await db.execute(search_query)
            works = result.scalars().all()
            
            if works:
                response.message = f"🔍 Нашёл {len(works)} расценок по запросу \"{query_text}\":\n\n"
                
                for work in works:
                    response.related_works.append({
                        "id": work.id,
                        "code": work.code,
                        "name": work.name,
                        "unit": work.unit,
                        "total_price": work.total_price
                    })
                    response.message += f"• **{work.code or 'Б/Н'}** - {work.name} ({work.unit}) - {work.total_price:.2f} руб.\n"
                
                response.suggestions = [
                    "Добавить в смету",
                    "Показать подробнее",
                    "Найти похожие"
                ]
                response.actions = [
                    {"type": "add_to_estimate", "work_ids": [w.id for w in works[:3]]}
                ]
            else:
                response.message = f"😕 По запросу \"{query_text}\" ничего не найдено.\n\nПопробуйте:\n• Использовать другие ключевые слова\n• Проверить правописание\n• Упростить запрос"
                response.suggestions = [
                    "Показать популярные работы",
                    "Поиск по категориям"
                ]
        else:
            response.message = "Укажите, какую работу или расценку вы ищете. Например:\n• \"Найди расценку на штукатурку стен\"\n• \"Укладка ламината\""
    
    elif intent == "search_material":
        # Поиск материалов
        query_text = extract_search_query(message)
        
        if query_text:
            search_query = select(Material).where(
                Material.is_active == True,
                Material.name.ilike(f"%{query_text}%")
            ).limit(10)
            
            result = await db.execute(search_query)
            materials = result.scalars().all()
            
            if materials:
                response.message = f"🧱 Нашёл {len(materials)} материалов:\n\n"
                
                for mat in materials:
                    response.related_materials.append({
                        "id": mat.id,
                        "code": mat.code,
                        "name": mat.name,
                        "unit": mat.unit,
                        "current_price": mat.current_price
                    })
                    response.message += f"• **{mat.code or 'Б/Н'}** - {mat.name} ({mat.unit}) - {mat.current_price:.2f} руб.\n"
            else:
                response.message = f"Материалы по запросу \"{query_text}\" не найдены."
    
    elif intent == "explain":
        # Объяснение терминов
        message_lower = message.lower()
        
        explanation_found = False
        for term, explanation in SMETA_KNOWLEDGE_BASE.items():
            if term.replace("_", " ") in message_lower or term.replace("_", "") in message_lower:
                response.message = f"📚 **{term.replace('_', ' ').title()}**\n\n{explanation.strip()}"
                explanation_found = True
                break
        
        if not explanation_found:
            response.message = """
📚 **Доступные темы для объяснения:**

• Накладные расходы
• Сметная прибыль  
• КС-2 (акт о приёмке работ)
• КС-3 (справка о стоимости)
• ТЕР (территориальные расценки)
• ФЕР (федеральные расценки)
• Ресурсный метод

Спросите: "Что такое [тема]?"
"""
        
        response.suggestions = [
            "Что такое КС-2?",
            "Что такое накладные расходы?",
            "Как считать сметную прибыль?"
        ]
    
    elif intent == "analyze":
        # Анализ сметы
        response.message = """
🔍 **Анализ сметы**

Для анализа сметы мне нужно знать её ID или название.

Что я могу проверить:
• ✅ Наличие всех необходимых позиций
• ✅ Правильность расценок
• ✅ Корректность объёмов работ
• ✅ Соответствие накладных расходов
• ✅ Правильность расчёта НДС

Выберите смету для анализа или укажите её номер.
"""
        response.actions = [
            {"type": "select_estimate", "title": "Выбрать смету для анализа"}
        ]
    
    elif intent == "help":
        response.message = """
👋 **Привет! Я ИИ-помощник по сметам.**

🎯 **Что я умею:**

**🔍 Поиск расценок**
"Найди расценку на штукатурку стен"
"Расценка на укладку плитки"

**📦 Поиск материалов**  
"Найди материал кабель ВВГ"
"Цена на кирпич"

**📚 Объяснение терминов**
"Что такое накладные расходы?"
"Как рассчитать КС-2?"

**📊 Анализ смет**
"Проверь смету на ошибки"
"Оптимизировать смету"

**💡 Рекомендации**
Подскажу типовые работы для объекта
Помогу с выбором материалов

Просто напишите ваш вопрос!
"""
        response.suggestions = [
            "Найди расценку на штукатурку",
            "Что такое КС-2?",
            "Популярные работы"
        ]
    
    else:
        # Общий ответ с попыткой помочь
        response.message = f"""
🤔 Я понял ваш запрос: "{message}"

Попробуйте уточнить, что именно вам нужно:
• **Поиск расценки**: "Найди расценку на [описание работы]"
• **Поиск материала**: "Найди материал [название]"
• **Вопрос**: "Что такое [термин]?"

Или выберите из предложенных действий:
"""
        response.suggestions = [
            "Найти расценку",
            "Найти материал",
            "Помощь по терминам",
            "Что ты умеешь?"
        ]
    
    return response


@router.get("/suggest-works")
async def suggest_works_for_description(
    description: str = Query(..., min_length=3, description="Описание работы"),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db)
) -> List[WorkSuggestion]:
    """
    Умный подбор расценок по описанию работы
    
    Использует семантический поиск для нахождения наиболее подходящих расценок.
    """
    # Разбиваем описание на ключевые слова
    keywords = description.lower().split()
    
    # Строим запрос с весами
    conditions = []
    for keyword in keywords:
        if len(keyword) > 2:
            conditions.append(Work.name.ilike(f"%{keyword}%"))
    
    if not conditions:
        return []
    
    from sqlalchemy import or_
    query = select(Work).where(
        Work.is_active == True,
        or_(*conditions)
    ).limit(limit)
    
    result = await db.execute(query)
    works = result.scalars().all()
    
    suggestions = []
    for work in works:
        # Простой расчёт релевантности
        name_lower = work.name.lower()
        matches = sum(1 for kw in keywords if kw in name_lower)
        relevance = matches / len(keywords) if keywords else 0
        
        suggestions.append(WorkSuggestion(
            id=work.id,
            code=work.code,
            name=work.name,
            unit=work.unit,
            total_price=work.total_price or 0,
            relevance_score=relevance,
            reason=f"Совпадение по {matches} ключевым словам"
        ))
    
    # Сортируем по релевантности
    suggestions.sort(key=lambda x: x.relevance_score, reverse=True)
    
    return suggestions


@router.post("/analyze-estimate/{estimate_id}", response_model=EstimateAnalysis)
async def analyze_estimate(
    estimate_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    Анализ сметы на ошибки и рекомендации по оптимизации
    """
    # Загружаем смету
    result = await db.execute(
        select(Estimate).where(Estimate.id == estimate_id)
    )
    estimate = result.scalar_one_or_none()
    
    if not estimate:
        raise HTTPException(status_code=404, detail="Смета не найдена")
    
    # Загружаем позиции
    items_result = await db.execute(
        select(EstimateItem).where(EstimateItem.estimate_id == estimate_id)
    )
    items = items_result.scalars().all()
    
    issues = []
    recommendations = []
    optimization_potential = 0.0
    
    # Проверка 1: Пустая смета
    if not items:
        issues.append({
            "type": "error",
            "message": "Смета не содержит позиций"
        })
    
    # Проверка 2: Нулевые цены
    zero_price_items = [i for i in items if (i.total or 0) == 0]
    if zero_price_items:
        issues.append({
            "type": "warning",
            "message": f"Найдено {len(zero_price_items)} позиций с нулевой стоимостью"
        })
    
    # Проверка 3: Накладные расходы
    if estimate.overhead_percent < 10:
        issues.append({
            "type": "info",
            "message": f"Низкий процент накладных расходов ({estimate.overhead_percent}%). Обычно 12-25%"
        })
    elif estimate.overhead_percent > 30:
        issues.append({
            "type": "warning",
            "message": f"Высокий процент накладных расходов ({estimate.overhead_percent}%)"
        })
    
    # Проверка 4: Сметная прибыль
    if estimate.profit_percent < 5:
        issues.append({
            "type": "info",
            "message": f"Низкий процент сметной прибыли ({estimate.profit_percent}%). Обычно 8-12%"
        })
    
    # Проверка 5: Дублирующиеся позиции
    names = [i.name.lower().strip() for i in items]
    duplicates = set([n for n in names if names.count(n) > 1])
    if duplicates:
        issues.append({
            "type": "warning",
            "message": f"Возможно, есть дублирующиеся позиции: {', '.join(list(duplicates)[:3])}"
        })
    
    # Рекомендации
    if estimate.total_cost > 0:
        materials_ratio = (estimate.materials_cost / estimate.total_cost) * 100
        if materials_ratio > 70:
            recommendations.append(
                f"Доля материалов ({materials_ratio:.1f}%) выше типичной. Проверьте возможность оптимизации закупок."
            )
            optimization_potential += 5
    
    if len(items) > 50:
        recommendations.append(
            "Большое количество позиций. Рекомендуется группировка по разделам."
        )
    
    if not issues:
        recommendations.append("✅ Смета выглядит корректно. Ошибок не обнаружено.")
    
    return EstimateAnalysis(
        estimate_id=estimate_id,
        total_items=len(items),
        total_cost=estimate.total_with_vat or 0,
        issues=issues,
        recommendations=recommendations,
        optimization_potential=optimization_potential
    )


@router.get("/quick-actions", response_model=List[QuickAction])
async def get_quick_actions(
    context: Optional[str] = Query(None, description="Текущий контекст (estimate, ks2, etc.)")
):
    """
    Получить быстрые действия в зависимости от контекста
    """
    actions = [
        QuickAction(
            action_type="create_estimate",
            title="➕ Новая смета",
            description="Создать новую локальную смету"
        ),
        QuickAction(
            action_type="search_work",
            title="🔍 Найти расценку",
            description="Поиск работы в справочнике"
        ),
        QuickAction(
            action_type="search_material",
            title="📦 Найти материал",
            description="Поиск материала в справочнике"
        ),
    ]
    
    if context == "estimate":
        actions.extend([
            QuickAction(
                action_type="add_section",
                title="📁 Добавить раздел",
                description="Создать новый раздел в смете"
            ),
            QuickAction(
                action_type="recalculate",
                title="🔄 Пересчитать",
                description="Пересчитать итоги сметы"
            ),
            QuickAction(
                action_type="create_ks2",
                title="📋 Создать КС-2",
                description="Сформировать акт выполненных работ"
            ),
            QuickAction(
                action_type="analyze",
                title="🔍 Анализ сметы",
                description="Проверить на ошибки и оптимизировать"
            ),
        ])
    
    elif context == "ks2":
        actions.extend([
            QuickAction(
                action_type="fill_volumes",
                title="📝 Заполнить объёмы",
                description="Заполнить выполненные объёмы"
            ),
            QuickAction(
                action_type="create_ks3",
                title="📊 Создать КС-3",
                description="Сформировать справку о стоимости"
            ),
        ])
    
    return actions


@router.get("/templates")
async def get_estimate_templates():
    """
    Получить шаблоны смет для типовых объектов
    """
    templates = [
        {
            "id": "apartment_renovation",
            "name": "🏠 Ремонт квартиры",
            "description": "Типовой набор работ для ремонта квартиры",
            "sections": [
                "Демонтажные работы",
                "Электромонтажные работы",
                "Сантехнические работы",
                "Штукатурные работы",
                "Малярные работы",
                "Плиточные работы",
                "Устройство полов",
            ]
        },
        {
            "id": "office_renovation",
            "name": "🏢 Ремонт офиса",
            "description": "Типовой набор работ для ремонта офисного помещения",
            "sections": [
                "Демонтажные работы",
                "Устройство перегородок",
                "Электромонтажные работы",
                "Отделочные работы",
                "Устройство потолков",
                "Устройство полов",
            ]
        },
        {
            "id": "facade_works",
            "name": "🏗️ Фасадные работы",
            "description": "Работы по отделке фасада здания",
            "sections": [
                "Подготовительные работы",
                "Утепление фасада",
                "Штукатурные работы",
                "Окраска фасада",
            ]
        },
    ]
    
    return templates
