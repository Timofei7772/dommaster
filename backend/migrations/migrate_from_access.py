"""
Скрипт миграции данных из старой базы Access (EstDB.accdb) в PostgreSQL

Выполняет:
1. Подключение к Access через ODBC
2. Чтение таблиц с работами и материалами
3. Трансформация данных
4. Загрузка в новую PostgreSQL базу
"""

import pyodbc
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import text
import logging
from pathlib import Path
from typing import List, Dict, Any
import sys

# Настройка логирования
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# Конфигурация
ACCESS_DB_PATH = r"C:\Program Files\СК Афина\Смета 2007\db\EstDB.accdb"
SQLITE_URL = "sqlite+aiosqlite:///./smeta_ai.db"


def connect_to_access(db_path: str) -> pyodbc.Connection:
    """Подключение к базе Access"""
    conn_str = (
        r"DRIVER={Microsoft Access Driver (*.mdb, *.accdb)};"
        f"DBQ={db_path};"
    )
    
    try:
        conn = pyodbc.connect(conn_str)
        logger.info(f"✅ Подключение к Access установлено: {db_path}")
        return conn
    except pyodbc.Error as e:
        logger.error(f"❌ Ошибка подключения к Access: {e}")
        # Пробуем альтернативный драйвер
        try:
            conn_str = (
                r"DRIVER={Microsoft Access Driver (*.mdb, *.accdb)};"
                f"DBQ={db_path};"
                "ExtendedAnsiSQL=1;"
            )
            conn = pyodbc.connect(conn_str)
            logger.info("✅ Подключение через альтернативный драйвер")
            return conn
        except:
            raise


def get_access_tables(conn: pyodbc.Connection) -> List[str]:
    """Получить список таблиц в базе Access"""
    cursor = conn.cursor()
    tables = []
    
    for row in cursor.tables(tableType='TABLE'):
        if not row.table_name.startswith('MSys'):  # Исключаем системные таблицы
            tables.append(row.table_name)
    
    logger.info(f"📋 Найдено таблиц: {len(tables)}")
    for table in tables:
        logger.info(f"   - {table}")
    
    return tables


def read_access_table(conn: pyodbc.Connection, table_name: str) -> List[Dict[str, Any]]:
    """Прочитать все данные из таблицы Access"""
    cursor = conn.cursor()
    
    try:
        cursor.execute(f"SELECT * FROM [{table_name}]")
        columns = [column[0] for column in cursor.description]
        
        rows = []
        for row in cursor.fetchall():
            row_dict = dict(zip(columns, row))
            rows.append(row_dict)
        
        logger.info(f"📖 Прочитано {len(rows)} записей из таблицы '{table_name}'")
        return rows
    
    except pyodbc.Error as e:
        logger.error(f"❌ Ошибка чтения таблицы '{table_name}': {e}")
        return []


async def migrate_works(access_rows: List[Dict], session: AsyncSession):
    """Миграция справочника работ"""
    logger.info("🔄 Миграция справочника работ...")
    
    for idx, row in enumerate(access_rows):
        # Маппинг полей (зависит от структуры старой базы)
        work_data = {
            'code': str(row.get('Code', row.get('Код', ''))),
            'name': str(row.get('Name', row.get('Наименование', 'Без названия'))),
            'unit': str(row.get('Unit', row.get('ЕдИзм', 'шт'))),
            'materials_price': float(row.get('MaterialsPrice', row.get('СтоимостьМатериалов', 0)) or 0),
            'labor_price': float(row.get('LaborPrice', row.get('СтоимостьТруда', 0)) or 0),
            'machines_price': float(row.get('MachinesPrice', row.get('СтоимостьМашин', 0)) or 0),
            'is_active': True,
        }
        
        # Расчёт итоговой цены
        work_data['total_price'] = (
            work_data['materials_price'] + 
            work_data['labor_price'] + 
            work_data['machines_price']
        )
        
        # Вставка в PostgreSQL
        await session.execute(
            text("""
                INSERT OR REPLACE INTO works (code, name, unit, materials_price, labor_price, machines_price, total_price, is_active)
                VALUES (:code, :name, :unit, :materials_price, :labor_price, :machines_price, :total_price, :is_active)
            """),
            work_data
        )
        
        if (idx + 1) % 100 == 0:
            logger.info(f"   Обработано {idx + 1}/{len(access_rows)} работ")
    
    await session.commit()
    logger.info(f"✅ Мигрировано {len(access_rows)} работ")


async def migrate_materials(access_rows: List[Dict], session: AsyncSession):
    """Миграция справочника материалов"""
    logger.info("🔄 Миграция справочника материалов...")
    
    for idx, row in enumerate(access_rows):
        material_data = {
            'code': str(row.get('Code', row.get('Код', ''))),
            'name': str(row.get('Name', row.get('Наименование', 'Без названия'))),
            'unit': str(row.get('Unit', row.get('ЕдИзм', 'шт'))),
            'base_price': float(row.get('Price', row.get('Цена', 0)) or 0),
            'current_price': float(row.get('Price', row.get('Цена', 0)) or 0),
            'is_active': True,
        }
        
        await session.execute(
            text("""
                INSERT OR REPLACE INTO materials (code, name, unit, base_price, current_price, is_active)
                VALUES (:code, :name, :unit, :base_price, :current_price, :is_active)
            """),
            material_data
        )
        
        if (idx + 1) % 100 == 0:
            logger.info(f"   Обработано {idx + 1}/{len(access_rows)} материалов")
    
    await session.commit()
    logger.info(f"✅ Мигрировано {len(access_rows)} материалов")


async def create_tables(engine):
    """Создание таблиц в PostgreSQL"""
    logger.info("🔨 Создание таблиц...")
    
    # Импортируем модели для создания таблиц
    from app.database import Base
    from app.models import *
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    logger.info("✅ Таблицы созданы")


async def run_migration():
    """Основная функция миграции"""
    logger.info("=" * 60)
    logger.info("🚀 МИГРАЦИЯ ДАННЫХ ИЗ СМЕТА 2007 В СМЕТА AI")
    logger.info("=" * 60)
    
    # Проверяем существование файла базы Access
    if not Path(ACCESS_DB_PATH).exists():
        logger.error(f"❌ Файл базы данных не найден: {ACCESS_DB_PATH}")
        return False
    
    # Подключаемся к Access
    try:
        access_conn = connect_to_access(ACCESS_DB_PATH)
    except Exception as e:
        logger.error(f"❌ Не удалось подключиться к Access: {e}")
        logger.info("💡 Убедитесь, что установлен Microsoft Access Database Engine")
        return False
    
    # Получаем список таблиц
    tables = get_access_tables(access_conn)
    
    # Создаём подключение к PostgreSQL
    engine = create_async_engine(SQLITE_URL, echo=False)
    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    try:
        # Создаём таблицы
        await create_tables(engine)
        
        async with async_session() as session:
            # Ищем таблицы с работами и материалами
            for table in tables:
                table_lower = table.lower()
                
                if 'работ' in table_lower or 'work' in table_lower or 'расценк' in table_lower:
                    rows = read_access_table(access_conn, table)
                    if rows:
                        await migrate_works(rows, session)
                
                elif 'материал' in table_lower or 'material' in table_lower:
                    rows = read_access_table(access_conn, table)
                    if rows:
                        await migrate_materials(rows, session)
        
        logger.info("=" * 60)
        logger.info("✅ МИГРАЦИЯ ЗАВЕРШЕНА УСПЕШНО!")
        logger.info("=" * 60)
        return True
    
    except Exception as e:
        logger.error(f"❌ Ошибка миграции: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    finally:
        access_conn.close()
        await engine.dispose()


def analyze_access_db():
    """Анализ структуры базы Access (без миграции)"""
    logger.info("🔍 Анализ базы данных Access...")
    
    if not Path(ACCESS_DB_PATH).exists():
        logger.error(f"Файл не найден: {ACCESS_DB_PATH}")
        return
    
    try:
        conn = connect_to_access(ACCESS_DB_PATH)
        tables = get_access_tables(conn)
        
        cursor = conn.cursor()
        
        for table in tables:
            logger.info(f"\n📋 Таблица: {table}")
            
            # Получаем структуру таблицы
            cursor.execute(f"SELECT TOP 1 * FROM [{table}]")
            columns = [column[0] for column in cursor.description]
            logger.info(f"   Колонки: {columns}")
            
            # Считаем записи
            cursor.execute(f"SELECT COUNT(*) FROM [{table}]")
            count = cursor.fetchone()[0]
            logger.info(f"   Записей: {count}")
        
        conn.close()
        
    except Exception as e:
        logger.error(f"Ошибка: {e}")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--analyze":
        analyze_access_db()
    else:
        asyncio.run(run_migration())
