"""
API роутер для конкурентного анализа смет
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from datetime import datetime
import uuid
import logging
import io

from app.database import get_db
from app.utils import validate_file_extension
from app.ai.agents import EstimateComparatorAgent
from app.ai.llm_provider import get_llm_provider

logger = logging.getLogger(__name__)

# Хранилище результатов анализа (временное, в памяти)
analysis_store: Dict[str, Dict[str, Any]] = {}


# Схемы
class AnalysisListItem(BaseModel):
    """Пункт списка анализов"""
    id: str
    filename: str
    status: str
    total_items: int
    created_at: datetime

    model_config = {"from_attributes": True}


class AnalysisDetail(BaseModel):
    """Детальный результат анализа"""
    id: str
    filename: str
    status: str
    total_items: int
    created_at: datetime
    comparison: Optional[Dict[str, Any]] = None

    model_config = {"from_attributes": True}


router = APIRouter()


def _parse_float(value, default: float = 0.0) -> float:
    """Безопасное преобразование в float"""
    if value is None:
        return default
    try:
        return float(value)
    except (ValueError, TypeError):
        return default


def _parse_xlsx_items(content: bytes) -> List[Dict[str, Any]]:
    """Парсинг XLSX-файла сметы в список позиций для агента"""
    import openpyxl

    wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    sheet = wb.active

    rows = list(sheet.iter_rows(values_only=True))
    if not rows:
        return []

    # Определяем заголовки
    header_row = rows[0]
    headers = [str(h).lower().strip() if h else "" for h in header_row]

    # Маппинг известных названий колонок (русские / английские варианты)
    col = {}
    for idx, h in enumerate(headers):
        hc = h.replace(" ", "_").replace("ё", "е")
        if hc in ("наименование", "название", "name", "работа", "работы", "позиция", "наим"):
            col["name"] = idx
        elif hc in ("ед", "ед_изм", "единица", "unit", "измерение", "ед.изм."):
            col["unit"] = idx
        elif hc in ("кол", "кол-во", "количество", "quantity", "объем", "объём", "кол."):
            col["quantity"] = idx
        elif hc in ("цена_мат", "материалы", "materials_price", "стоимость_материалов",
                     "мат", "материал", "цены_материалов"):
            col["materials_price"] = idx
        elif hc in ("цена_раб", "работа", "labor_price", "з/п", "зарплата",
                     "оплата_труда", "труд"):
            col["labor_price"] = idx
        elif hc in ("итого", "total", "сумма", "стоимость", "цена", "всего"):
            col["total"] = idx
        elif hc in ("шифр", "обоснование", "justification", "код", "code",
                     "номер_расценки"):
            col["justification"] = idx
        elif hc in ("тип", "row_type", "вид", "тип_строки"):
            col["row_type"] = idx

    # Если заголовки не распознаны — пробуем автоопределение по данным
    if not col:
        return _parse_xlsx_no_headers(rows)

    def get(r, key):
        i = col.get(key)
        return r[i] if i is not None and i < len(r) else None

    items = []
    for row in rows[1:]:
        if not any(row):
            continue

        name = str(get(row, "name") or "").strip()
        if not name:
            continue

        item = {
            "name": name,
            "unit": str(get(row, "unit") or "шт"),
            "quantity": _parse_float(get(row, "quantity"), 1),
            "materials_price": _parse_float(get(row, "materials_price"), 0),
            "labor_price": _parse_float(get(row, "labor_price"), 0),
            "total": _parse_float(get(row, "total"), 0),
            "justification": str(get(row, "justification") or ""),
            "row_type": str(get(row, "row_type") or "pr"),
        }
        items.append(item)

    return items


def _parse_xlsx_no_headers(rows: List[tuple]) -> List[Dict[str, Any]]:
    """Автоопределение структуры, если заголовки не распознаны"""
    items = []
    for row in rows:
        if not any(row):
            continue

        vals = [str(v).strip() if v else "" for v in row]
        # Ищем первую непустую текстовую колонку — это название
        name = ""
        for v in vals:
            if v and not v.replace(".", "").replace(",", "").isdigit():
                name = v
                break

        if not name or len(name) < 3:
            continue

        # Собираем числа
        nums = []
        for v in row:
            n = _parse_float(v, None)
            if n is not None:
                nums.append(n)

        item = {
            "name": name[:500],
            "unit": "шт",
            "quantity": nums[0] if len(nums) > 0 else 1,
            "materials_price": nums[1] if len(nums) > 1 else 0,
            "labor_price": nums[2] if len(nums) > 2 else 0,
            "total": nums[-1] if nums else 0,
            "justification": "",
            "row_type": "pr",
        }
        items.append(item)

    return items


async def _parse_pdf_items(content: bytes) -> List[Dict[str, Any]]:
    """Парсинг PDF-файла сметы в список позиций"""
    try:
        import pdfplumber
    except ImportError:
        raise HTTPException(
            status_code=400,
            detail=(
                "PDF-парсер не установлен. Установите pdfplumber: "
                "pip install pdfplumber"
            ),
        )

    items = []
    async with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if not text:
                continue
            for line in text.split("\n"):
                line = line.strip()
                if not line or len(line) < 10:
                    continue
                # Строки с цифрами — вероятно, позиции сметы
                if any(c.isdigit() for c in line):
                    items.append({
                        "name": line[:500],
                        "unit": "шт",
                        "quantity": 1,
                        "materials_price": 0,
                        "labor_price": 0,
                        "total": 0,
                        "justification": "",
                        "row_type": "pr",
                    })
    return items


@router.post("/analyze", response_model=AnalysisDetail, status_code=201)
async def analyze_competitor_estimate(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """
    Загрузить XLSX/PDF смету и выполнить конкурентный анализ.

    Файл парсится, извлечённые позиции передаются в EstimateComparatorAgent,
    который сравнивает сметные цены с рыночными и возвращает отчёт.
    """
    validate_file_extension(file.filename, [".xlsx", ".xls", ".pdf"])

    analysis_id = str(uuid.uuid4())
    content = await file.read()
    ext = file.filename.rsplit(".", 1)[-1].lower()

    # Парсинг файла
    try:
        if ext == "pdf":
            items = await _parse_pdf_items(content)
        else:
            items = _parse_xlsx_items(content)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Ошибка парсинга файла %s: %s", file.filename, e)
        raise HTTPException(
            status_code=400,
            detail=f"Ошибка парсинга файла: {str(e)}",
        )

    if not items:
        raise HTTPException(
            status_code=400,
            detail=(
                "Не удалось извлечь позиции из файла. "
                "Убедитесь, что файл содержит таблицу с расценками."
            ),
        )

    # Сохраняем начальную запись
    analysis_store[analysis_id] = {
        "id": analysis_id,
        "filename": file.filename,
        "status": "processing",
        "total_items": len(items),
        "created_at": datetime.utcnow(),
        "comparison": None,
    }

    # Запускаем AI-агент сравнения
    try:
        llm = get_llm_provider()
        agent = EstimateComparatorAgent(llm, db)
        result = await agent.execute({"items": items})

        analysis_store[analysis_id].update({
            "status": "completed" if result.success else "failed",
            "comparison": result.data if result.success else {"error": result.error},
        })
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Ошибка AI-агента: %s", e)
        analysis_store[analysis_id].update({
            "status": "failed",
            "comparison": {"error": str(e)},
        })

    return analysis_store[analysis_id]


@router.get("/history", response_model=List[AnalysisListItem])
async def list_analyses(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """Список предыдущих анализов (сортировка — от новых к старым)"""
    all_items = list(analysis_store.values())
    all_items.sort(key=lambda x: x["created_at"], reverse=True)
    return all_items[offset: offset + limit]


@router.get("/analysis/{analysis_id}", response_model=AnalysisDetail)
async def get_analysis(analysis_id: str):
    """Получить результат анализа по ID"""
    analysis = analysis_store.get(analysis_id)
    if not analysis:
        raise HTTPException(status_code=404, detail="Анализ не найден")
    return analysis