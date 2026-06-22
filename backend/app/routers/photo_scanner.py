"""
AI Сканер фото для распознавания смет и рукописного текста

Использует Gemini Vision API для:
- Распознавания фото рукописных записей
- Распознавания фото смет/прайсов
- Автоматического заполнения позиций сметы
- Определения города и сравнения цен
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
import base64
import httpx
import json
import re
from datetime import datetime

from app.database import get_db
from app.models.work import Work
from app.models.material import Material
from app.config import settings
from app.utils import validate_file_extension


router = APIRouter()


# Региональные коэффициенты для городов
CITY_RATES = {
    'Москва': {'master': 1.0, 'company': 2.2, 'description': 'Столица'},
    'Московская область': {'master': 0.85, 'company': 1.9, 'description': 'Подмосковье'},
    'Санкт-Петербург': {'master': 0.9, 'company': 1.8, 'description': 'Северная столица'},
    'Екатеринбург': {'master': 0.7, 'company': 1.3, 'description': 'Урал'},
    'Казань': {'master': 0.65, 'company': 1.25, 'description': 'Татарстан'},
    'Краснодар': {'master': 0.75, 'company': 1.4, 'description': 'Юг России'},
    'Новосибирск': {'master': 0.65, 'company': 1.2, 'description': 'Сибирь'},
    'Нижний Новгород': {'master': 0.6, 'company': 1.15, 'description': 'Поволжье'},
    'Самара': {'master': 0.6, 'company': 1.15, 'description': 'Поволжье'},
    'Ростов-на-Дону': {'master': 0.65, 'company': 1.25, 'description': 'Юг России'},
    'Воронеж': {'master': 0.55, 'company': 1.1, 'description': 'Центральный регион'},
    'Уфа': {'master': 0.6, 'company': 1.15, 'description': 'Башкортостан'},
    'Красноярск': {'master': 0.7, 'company': 1.3, 'description': 'Сибирь'},
    'Пермь': {'master': 0.6, 'company': 1.2, 'description': 'Урал'},
    'Волгоград': {'master': 0.55, 'company': 1.1, 'description': 'Поволжье'},
    'Сочи': {'master': 0.9, 'company': 1.7, 'description': 'Курорт'},
    'Тюмень': {'master': 0.75, 'company': 1.4, 'description': 'Нефтяной регион'},
    'Север (ЯНАО, ХМАО)': {'master': 1.2, 'company': 2.5, 'description': 'Крайний Север'},
    'РФ (средний)': {'master': 0.65, 'company': 1.0, 'description': 'Среднее по России'},
}

# Базовые цены на работы (для расчёта по городам)
BASE_WORK_PRICES = {
    'штукатурка': {'name': 'Штукатурка стен по маякам', 'unit': 'м²', 'base_price': 450},
    'шпаклевка': {'name': 'Шпаклёвка стен под обои', 'unit': 'м²', 'base_price': 250},
    'шпаклевка покраска': {'name': 'Шпаклёвка под покраску', 'unit': 'м²', 'base_price': 350},
    'покраска': {'name': 'Покраска стен', 'unit': 'м²', 'base_price': 200},
    'обои': {'name': 'Поклейка обоев', 'unit': 'м²', 'base_price': 350},
    'плитка стены': {'name': 'Укладка плитки на стены', 'unit': 'м²', 'base_price': 1500},
    'плитка пол': {'name': 'Укладка плитки на пол', 'unit': 'м²', 'base_price': 1300},
    'ламинат': {'name': 'Укладка ламината', 'unit': 'м²', 'base_price': 400},
    'стяжка': {'name': 'Стяжка пола', 'unit': 'м²', 'base_price': 500},
    'наливной': {'name': 'Наливной пол', 'unit': 'м²', 'base_price': 350},
    'электрика точка': {'name': 'Точка электрики', 'unit': 'шт', 'base_price': 800},
    'розетка': {'name': 'Установка розетки', 'unit': 'шт', 'base_price': 350},
    'выключатель': {'name': 'Установка выключателя', 'unit': 'шт', 'base_price': 300},
    'сантехника точка': {'name': 'Точка сантехники', 'unit': 'шт', 'base_price': 2000},
    'унитаз': {'name': 'Установка унитаза', 'unit': 'шт', 'base_price': 2500},
    'ванна': {'name': 'Установка ванны', 'unit': 'шт', 'base_price': 4500},
    'раковина': {'name': 'Установка раковины', 'unit': 'шт', 'base_price': 2000},
    'смеситель': {'name': 'Установка смесителя', 'unit': 'шт', 'base_price': 1500},
    'натяжной потолок': {'name': 'Натяжной потолок', 'unit': 'м²', 'base_price': 700},
    'гкл потолок': {'name': 'Потолок из ГКЛ', 'unit': 'м²', 'base_price': 1000},
    'гкл стены': {'name': 'Обшивка стен ГКЛ', 'unit': 'м²', 'base_price': 600},
    'демонтаж': {'name': 'Демонтажные работы', 'unit': 'м²', 'base_price': 300},
    'дверь': {'name': 'Установка двери', 'unit': 'шт', 'base_price': 3000},
    'плинтус': {'name': 'Монтаж плинтуса', 'unit': 'м.п.', 'base_price': 150},
    'откосы': {'name': 'Отделка откосов', 'unit': 'м.п.', 'base_price': 500},
}


class RecognizedItem(BaseModel):
    """Распознанная позиция из фото"""
    name: str
    quantity: Optional[float] = 1
    unit: Optional[str] = None
    estimated_price: Optional[float] = None
    confidence: float = 0.8
    matched_work_id: Optional[int] = None


class PhotoScanResult(BaseModel):
    """Результат сканирования фото"""
    success: bool
    items: List[RecognizedItem] = []
    detected_city: Optional[str] = None
    raw_text: Optional[str] = None
    total_items: int = 0
    message: str = ""


class CityPriceComparison(BaseModel):
    """Сравнение цен по городу"""
    city: str
    city_description: str
    work_name: str
    unit: str
    quantity: float
    master_price: float  # Цена частного мастера
    company_price: float  # Цена фирмы/компании
    master_total: float
    company_total: float
    savings: float  # Экономия при выборе мастера


class CommercialProposal(BaseModel):
    """Коммерческое предложение"""
    id: str
    created_at: datetime
    city: str
    client_name: Optional[str] = None
    items: List[Dict[str, Any]]
    
    # Итоги для частных мастеров
    master_total: float
    master_with_overhead: float  # С накладными 10%
    master_with_vat: float  # С НДС
    
    # Итоги для фирм
    company_total: float
    company_with_overhead: float  # С накладными 15%
    company_with_vat: float  # С НДС
    
    savings_amount: float
    savings_percent: float
    recommendation: str


async def call_gemini_vision(image_base64: str, prompt: str) -> Optional[str]:
    """Вызов Gemini Vision API"""
    api_key = settings.GEMINI_API_KEY
    if not api_key:
        return None
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
    
    payload = {
        "contents": [{
            "role": "user",
            "parts": [
                {"text": prompt},
                {"inlineData": {"mimeType": "image/jpeg", "data": image_base64}}
            ]
        }],
        "generationConfig": {
            "temperature": 0.2,
            "topK": 40,
            "topP": 0.95,
            "maxOutputTokens": 8192,
        }
    }
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(url, json=payload)
        data = response.json()
        
        if "error" in data:
            raise HTTPException(status_code=500, detail=f"Gemini API error: {data['error']['message']}")
        
        return data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text")


def match_work_to_database(name: str, db_works: List[Work]) -> Optional[int]:
    """Поиск соответствия в базе работ"""
    name_lower = name.lower()
    
    # Ключевые слова для сопоставления
    keywords_map = {
        'штукатур': ['штукатурка', 'штукатур'],
        'шпаклев': ['шпаклёв', 'шпаклев', 'шпатлев'],
        'покрас': ['покраска', 'окраска', 'красить'],
        'обои': ['обои', 'поклейка'],
        'плитк': ['плитка', 'кафель', 'керамогранит'],
        'ламинат': ['ламинат'],
        'стяжк': ['стяжка'],
        'электр': ['электрика', 'электромонтаж', 'розетк', 'выключател'],
        'сантехн': ['сантехника', 'водопровод', 'канализац'],
    }
    
    for work in db_works:
        work_name_lower = work.name.lower()
        
        # Прямое совпадение
        if name_lower in work_name_lower or work_name_lower in name_lower:
            return work.id
        
        # Совпадение по ключевым словам
        for key, words in keywords_map.items():
            if any(w in name_lower for w in words) and any(w in work_name_lower for w in words):
                return work.id
    
    return None


def calculate_city_prices(work_name: str, quantity: float, city: str) -> CityPriceComparison:
    """Расчёт цен для города"""
    # Найдём базовую цену
    base_price = 1000  # По умолчанию
    unit = 'ед.'
    matched_name = work_name
    
    for key, data in BASE_WORK_PRICES.items():
        if key in work_name.lower() or any(word in work_name.lower() for word in key.split()):
            base_price = data['base_price']
            unit = data['unit']
            matched_name = data['name']
            break
    
    # Получаем коэффициенты города
    rates = CITY_RATES.get(city, CITY_RATES['РФ (средний)'])
    
    master_price = base_price * rates['master']
    company_price = base_price * rates['company']
    
    return CityPriceComparison(
        city=city,
        city_description=rates['description'],
        work_name=matched_name,
        unit=unit,
        quantity=quantity,
        master_price=round(master_price, 2),
        company_price=round(company_price, 2),
        master_total=round(master_price * quantity, 2),
        company_total=round(company_price * quantity, 2),
        savings=round((company_price - master_price) * quantity, 2)
    )


@router.post("/scan", response_model=PhotoScanResult)
async def scan_photo(
    file: UploadFile = File(..., description="Фото сметы или рукописного текста"),
    city: Optional[str] = Form(None, description="Город (для определения цен)"),
    db: AsyncSession = Depends(get_db)
):
    """
    📸 Сканирование фото сметы или рукописного списка работ
    
    AI распознаёт:
    - Рукописный текст
    - Печатные сметы
    - Прайс-листы
    - Списки работ
    
    Автоматически:
    - Определяет позиции и объёмы
    - Сопоставляет с базой расценок
    - Определяет город из текста
    """
    # Валидация расширения файла
    validate_file_extension(file.filename)

    # Читаем и кодируем изображение
    contents = await file.read()
    image_base64 = base64.b64encode(contents).decode('utf-8')
    
    # Промпт для Gemini
    prompt = """Ты — эксперт по строительным сметам. Внимательно изучи это изображение.

Твоя задача:
1. Распознать ВСЕ строительные/ремонтные работы на фото
2. Определить количество и единицы измерения
3. Если указан город — определить его
4. Распознать любые числа, площади, объёмы

Верни ТОЛЬКО JSON без markdown-разметки в формате:
{
    "items": [
        {"name": "название работы", "quantity": число, "unit": "единица измерения"},
        ...
    ],
    "detected_city": "город если найден или null",
    "raw_text": "весь распознанный текст"
}

Примеры работ: штукатурка, шпаклёвка, покраска, плитка, ламинат, стяжка, электрика, сантехника, обои, потолки.
Единицы: м², м³, м.п., шт, компл.

ВАЖНО: Верни ТОЛЬКО JSON, без ```json или других обёрток!"""

    try:
        result_text = await call_gemini_vision(image_base64, prompt)
        
        if not result_text:
            return PhotoScanResult(
                success=False,
                message="API ключ Gemini не настроен. Добавьте GEMINI_API_KEY в настройки."
            )
        
        # Очищаем от markdown
        result_text = result_text.strip()
        if result_text.startswith('```'):
            result_text = re.sub(r'^```\w*\n?', '', result_text)
            result_text = re.sub(r'\n?```$', '', result_text)
        
        # Парсим JSON
        try:
            data = json.loads(result_text)
        except json.JSONDecodeError:
            return PhotoScanResult(
                success=False,
                raw_text=result_text,
                message="Не удалось распознать структуру. Попробуйте фото лучшего качества."
            )
        
        # Загружаем работы из БД для сопоставления
        works_result = await db.execute(select(Work).where(Work.is_active == True).limit(500))
        db_works = works_result.scalars().all()
        
        # Обрабатываем распознанные позиции
        items = []
        for item in data.get('items', []):
            name = item.get('name', '')
            if not name:
                continue
            
            qty = item.get('quantity', 1)
            if isinstance(qty, str):
                try:
                    qty = float(qty.replace(',', '.'))
                except:
                    qty = 1
            
            # Ищем в базе
            matched_id = match_work_to_database(name, db_works)
            
            recognized = RecognizedItem(
                name=name,
                quantity=qty,
                unit=item.get('unit', 'ед.'),
                confidence=0.85 if matched_id else 0.6,
                matched_work_id=matched_id
            )
            items.append(recognized)
        
        # Определяем город
        detected_city = data.get('detected_city') or city
        
        return PhotoScanResult(
            success=True,
            items=items,
            detected_city=detected_city,
            raw_text=data.get('raw_text', ''),
            total_items=len(items),
            message=f"✅ Распознано {len(items)} позиций" + (f" в городе {detected_city}" if detected_city else "")
        )
        
    except Exception as e:
        return PhotoScanResult(
            success=False,
            message=f"Ошибка распознавания: {str(e)}"
        )


@router.post("/scan-text", response_model=PhotoScanResult)
async def scan_text(
    text: str = Form(..., description="Текст с описанием работ"),
    city: Optional[str] = Form(None, description="Город"),
    db: AsyncSession = Depends(get_db)
):
    """
    📝 Распознавание текста с описанием работ
    
    Пример входного текста:
    "Нужно сделать штукатурку 50 м2, положить плитку в ванной 15 м2, 
    установить 10 розеток, поставить унитаз и раковину"
    """
    # Промпт для Gemini (текстовый режим)
    prompt = f"""Ты — эксперт по строительным сметам.

Из этого текста извлеки ВСЕ строительные работы с количеством:

"{text}"

Верни ТОЛЬКО JSON без markdown-разметки:
{{
    "items": [
        {{"name": "название работы", "quantity": число, "unit": "единица измерения"}},
        ...
    ],
    "detected_city": "город если упоминается или null"
}}

ВАЖНО: 
- Разбей сложные работы на составляющие
- Определи количество из контекста
- Если количество не указано — ставь 1
- Верни ТОЛЬКО JSON!"""

    api_key = settings.GEMINI_API_KEY
    if not api_key:
        # Fallback — простой парсинг без AI
        items = parse_text_simple(text)
        return PhotoScanResult(
            success=True,
            items=items,
            detected_city=city,
            total_items=len(items),
            message=f"Распознано {len(items)} позиций (базовый режим)"
        )
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
    
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.1, "maxOutputTokens": 4096}
    }
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, json=payload)
            data = response.json()
            
            result_text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            
            # Очистка и парсинг
            result_text = result_text.strip()
            if result_text.startswith('```'):
                result_text = re.sub(r'^```\w*\n?', '', result_text)
                result_text = re.sub(r'\n?```$', '', result_text)
            
            parsed = json.loads(result_text)
            
            items = []
            for item in parsed.get('items', []):
                qty = item.get('quantity', 1)
                if isinstance(qty, str):
                    try:
                        qty = float(qty.replace(',', '.'))
                    except:
                        qty = 1
                
                items.append(RecognizedItem(
                    name=item.get('name', ''),
                    quantity=qty,
                    unit=item.get('unit', 'ед.'),
                    confidence=0.9
                ))
            
            detected_city = parsed.get('detected_city') or city
            
            return PhotoScanResult(
                success=True,
                items=items,
                detected_city=detected_city,
                raw_text=text,
                total_items=len(items),
                message=f"✅ Распознано {len(items)} позиций"
            )
            
    except Exception as e:
        # Fallback
        items = parse_text_simple(text)
        return PhotoScanResult(
            success=True,
            items=items,
            detected_city=city,
            total_items=len(items),
            message=f"Распознано {len(items)} позиций (базовый режим)"
        )


def parse_text_simple(text: str) -> List[RecognizedItem]:
    """Простой парсинг текста без AI"""
    items = []
    
    # Паттерны для поиска
    patterns = [
        (r'штукатурк\w*\s*(\d+)', 'Штукатурка стен', 'м²'),
        (r'шпаклев\w*\s*(\d+)', 'Шпаклёвка стен', 'м²'),
        (r'покрас\w*\s*(\d+)', 'Покраска стен', 'м²'),
        (r'плитк\w*\s*(\d+)', 'Укладка плитки', 'м²'),
        (r'ламинат\w*\s*(\d+)', 'Укладка ламината', 'м²'),
        (r'стяжк\w*\s*(\d+)', 'Стяжка пола', 'м²'),
        (r'розет\w*\s*(\d+)', 'Установка розеток', 'шт'),
        (r'(\d+)\s*розет', 'Установка розеток', 'шт'),
        (r'выключател\w*\s*(\d+)', 'Установка выключателей', 'шт'),
        (r'унитаз', 'Установка унитаза', 'шт'),
        (r'ванн', 'Установка ванны', 'шт'),
        (r'раковин', 'Установка раковины', 'шт'),
        (r'смесител', 'Установка смесителя', 'шт'),
        (r'натяжн\w*\s*потол\w*\s*(\d+)', 'Натяжной потолок', 'м²'),
        (r'обои\s*(\d+)', 'Поклейка обоев', 'м²'),
    ]
    
    text_lower = text.lower()
    
    for pattern, name, unit in patterns:
        match = re.search(pattern, text_lower)
        if match:
            try:
                qty = float(match.group(1)) if match.lastindex else 1
            except:
                qty = 1
            
            items.append(RecognizedItem(
                name=name,
                quantity=qty,
                unit=unit,
                confidence=0.7
            ))
    
    return items


@router.get("/cities")
async def get_cities():
    """Получить список городов с коэффициентами"""
    return {city: rates for city, rates in CITY_RATES.items()}


@router.post("/calculate-prices")
async def calculate_prices(
    items: List[Dict[str, Any]],
    city: str = Query(..., description="Город для расчёта")
):
    """
    💰 Расчёт цен по городу (мастера vs фирмы)
    """
    results = []
    total_master = 0
    total_company = 0
    
    for item in items:
        name = item.get('name', '')
        quantity = float(item.get('quantity', 1))
        
        comparison = calculate_city_prices(name, quantity, city)
        results.append(comparison.model_dump())
        
        total_master += comparison.master_total
        total_company += comparison.company_total
    
    return {
        "city": city,
        "items": results,
        "totals": {
            "master_total": round(total_master, 2),
            "company_total": round(total_company, 2),
            "savings": round(total_company - total_master, 2),
            "savings_percent": round((1 - total_master / total_company) * 100, 1) if total_company > 0 else 0
        }
    }


@router.post("/generate-proposal", response_model=CommercialProposal)
async def generate_commercial_proposal(
    items: List[Dict[str, Any]],
    city: str = Query(..., description="Город"),
    client_name: Optional[str] = Query(None, description="Имя клиента"),
    overhead_master: float = Query(10, description="Накладные для мастера %"),
    overhead_company: float = Query(15, description="Накладные для фирмы %"),
    vat_rate: float = Query(20, description="Ставка НДС %")
):
    """
    📄 Генерация коммерческого предложения
    
    Создаёт КП с двумя вариантами цен:
    - Цены частных мастеров
    - Цены строительных компаний
    
    С расчётом экономии и рекомендацией
    """
    import uuid
    
    proposal_items = []
    total_master = 0
    total_company = 0
    
    for item in items:
        name = item.get('name', '')
        quantity = float(item.get('quantity', 1))
        
        comparison = calculate_city_prices(name, quantity, city)
        
        proposal_items.append({
            "name": comparison.work_name,
            "unit": comparison.unit,
            "quantity": quantity,
            "master_price": comparison.master_price,
            "master_total": comparison.master_total,
            "company_price": comparison.company_price,
            "company_total": comparison.company_total,
        })
        
        total_master += comparison.master_total
        total_company += comparison.company_total
    
    # Расчёт с накладными
    master_with_overhead = total_master * (1 + overhead_master / 100)
    company_with_overhead = total_company * (1 + overhead_company / 100)
    
    # Расчёт с НДС
    master_with_vat = master_with_overhead * (1 + vat_rate / 100)
    company_with_vat = company_with_overhead * (1 + vat_rate / 100)
    
    savings_amount = company_with_vat - master_with_vat
    savings_percent = (1 - master_with_vat / company_with_vat) * 100 if company_with_vat > 0 else 0
    
    # Рекомендация
    if savings_percent > 30:
        recommendation = f"🏆 Рекомендуем частных мастеров! Экономия составит {savings_percent:.0f}% ({savings_amount:,.0f} руб.)"
    elif savings_percent > 15:
        recommendation = f"💡 Частные мастера выгоднее на {savings_percent:.0f}%, но фирмы дают гарантию"
    else:
        recommendation = f"⚖️ Разница небольшая ({savings_percent:.0f}%). Фирма даст гарантию и договор"
    
    return CommercialProposal(
        id=str(uuid.uuid4()),
        created_at=datetime.now(),
        city=city,
        client_name=client_name,
        items=proposal_items,
        master_total=round(total_master, 2),
        master_with_overhead=round(master_with_overhead, 2),
        master_with_vat=round(master_with_vat, 2),
        company_total=round(total_company, 2),
        company_with_overhead=round(company_with_overhead, 2),
        company_with_vat=round(company_with_vat, 2),
        savings_amount=round(savings_amount, 2),
        savings_percent=round(savings_percent, 1),
        recommendation=recommendation
    )
