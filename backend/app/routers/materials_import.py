"""
Импорт материалов из CSV/Excel/JSON/XML/API магазинов
"""

from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.material import Material
from app.utils import validate_file_extension
import csv
import io
import json
import xml.etree.ElementTree as ET
import httpx
import openpyxl
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/import/csv")
async def import_materials_csv(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    """Импорт материалов из CSV-файла"""
    validate_file_extension(file.filename, [".csv"])
    try:
        content = await file.read()
        text = content.decode("utf-8")
        reader = csv.DictReader(io.StringIO(text))
        count = 0
        for row in reader:
            material = Material(
                name=row.get("name", ""),
                code=row.get("code", ""),
                unit=row.get("unit", "шт"),
                base_price=float(row.get("base_price", 0)),
                current_price=float(row.get("current_price", 0)),
                supplier=row.get("supplier", ""),
                article=row.get("article", "")
            )
            db.add(material)
            count += 1
        await db.flush()
        return {"message": f"Импортировано {count} материалов"}
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Ошибка импорта CSV: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка импорта: {str(e)}")


@router.post("/import/excel")
async def import_materials_excel(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    """Импорт материалов из Excel-файла (.xlsx)"""
    validate_file_extension(file.filename, [".xlsx"])
    try:
        content = await file.read()
        wb = openpyxl.load_workbook(io.BytesIO(content))
        sheet = wb.active
        count = 0
        for row in sheet.iter_rows(min_row=2, values_only=True):
            if len(row) < 7:
                continue
            name, code, unit, base_price, current_price, supplier, article = row[:7]
            material = Material(
                name=name or "",
                code=code or "",
                unit=unit or "шт",
                base_price=float(base_price or 0),
                current_price=float(current_price or 0),
                supplier=supplier or "",
                article=article or ""
            )
            db.add(material)
            count += 1
        await db.flush()
        return {"message": f"Импортировано {count} материалов из Excel"}
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Ошибка импорта Excel: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка импорта: {str(e)}")


@router.post("/import/json")
async def import_materials_json(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    """Импорт материалов из JSON-файла"""
    validate_file_extension(file.filename, [".json"])
    try:
        content = await file.read()
        data = json.loads(content.decode("utf-8"))
        count = 0
        for item in data.get("materials", []):
            material = Material(
                name=item.get("name", ""),
                code=item.get("code", ""),
                unit=item.get("unit", "шт"),
                base_price=float(item.get("base_price", 0)),
                current_price=float(item.get("current_price", 0)),
                supplier=item.get("supplier", ""),
                article=item.get("article", "")
            )
            db.add(material)
            count += 1
        await db.flush()
        return {"message": f"Импортировано {count} материалов из JSON"}
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Ошибка импорта JSON: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка импорта: {str(e)}")


@router.post("/import/xml")
async def import_materials_xml(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    """Импорт материалов из XML-файла"""
    validate_file_extension(file.filename, [".xml"])
    try:
        content = await file.read()
        tree = ET.ElementTree(ET.fromstring(content.decode("utf-8")))
        root = tree.getroot()
        count = 0
        for item in root.findall('material'):
            material = Material(
                name=item.findtext('name', default=""),
                code=item.findtext('code', default=""),
                unit=item.findtext('unit', default="шт"),
                base_price=float(item.findtext('base_price', default="0")),
                current_price=float(item.findtext('current_price', default="0")),
                supplier=item.findtext('supplier', default=""),
                article=item.findtext('article', default="")
            )
            db.add(material)
            count += 1
        await db.flush()
        return {"message": f"Импортировано {count} материалов из XML"}
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Ошибка импорта XML: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка импорта: {str(e)}")


@router.post("/import/api")
async def import_materials_api(api_url: str, api_key: str = "", db: AsyncSession = Depends(get_db)):
    """Импорт материалов из внешнего API магазина"""
    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(api_url, headers=headers, timeout=30)
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Ошибка запроса к API: {e}")

    try:
        count = 0
        for item in data.get("materials", []):
            material = Material(
                name=item.get("name", ""),
                code=item.get("code", ""),
                unit=item.get("unit", "шт"),
                base_price=float(item.get("base_price", 0)),
                current_price=float(item.get("current_price", 0)),
                supplier=item.get("supplier", ""),
                article=item.get("article", "")
            )
            db.add(material)
            count += 1
        await db.flush()
        return {"message": f"Импортировано {count} материалов из API"}
    except Exception as e:
        await db.rollback()
        logger.error(f"Ошибка импорта из API: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка импорта: {str(e)}")


@router.post("/update-prices/api")
async def update_material_prices_api(api_url: str, api_key: str = "", db: AsyncSession = Depends(get_db)):
    """Автоматическое обновление цен материалов из API магазина"""
    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(api_url, headers=headers, timeout=30)
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail=f"Ошибка запроса к API: {e}")

    try:
        updated = 0
        for item in data.get("materials", []):
            code = item.get("code", "")
            price = float(item.get("current_price", 0))
            if not code:
                continue
            result = await db.execute(select(Material).where(Material.code == code))
            material = result.scalar_one_or_none()
            if material:
                material.current_price = price
                updated += 1
        await db.flush()
        return {"message": f"Обновлено цен: {updated}"}
    except Exception as e:
        await db.rollback()
        logger.error(f"Ошибка обновления цен: {e}")
        raise HTTPException(status_code=500, detail=f"Ошибка обновления: {str(e)}")
