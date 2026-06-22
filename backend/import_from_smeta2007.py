"""
Скрипт импорта данных из оригинальной базы ZARU AI смета (Prices_rsk 2.0.accdb)
Импортирует:
- 16 категорий работ (tPriceRazdels)
- 523 работы с ценами (tSprPrices)
- 232 материала (tSprMaterials)
- 415 единиц измерения (tSprEdIzm)
"""

import asyncio
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pyodbc
from app.database import async_session_maker, engine
from app.models import WorkCategory, Work, MaterialCategory, Material
from sqlalchemy import select, text


# Путь к базе данных ZARU AI смета
ACCESS_DB_PATH = r"C:\Projects\SmetaAI\документы для сметы\Prices_rsk 2.0.accdb"


def get_access_connection():
    """Подключение к Access базе"""
    conn_str = f'DRIVER={{Microsoft Access Driver (*.mdb, *.accdb)}};DBQ={ACCESS_DB_PATH};'
    return pyodbc.connect(conn_str)


def load_zaru_ai_smeta_data():
    """Загрузка данных из ZARU AI смета"""
    conn = get_access_connection()
    cursor = conn.cursor()
    
    # 1. Загружаем категории работ
    print("📁 Загрузка категорий работ (tPriceRazdels)...")
    cursor.execute("SELECT IdRazdel, NameRazdel, IdParentRazdel FROM tPriceRazdels ORDER BY IdRazdel")
    work_categories = []
    for row in cursor.fetchall():
        work_categories.append({
            'id': row[0],
            'name': row[1].strip() if row[1] else '',
            'parent_id': row[2]
        })
    print(f"   → Найдено {len(work_categories)} категорий")
    
    # 2. Загружаем единицы измерения
    print("📏 Загрузка единиц измерения (tSprEdIzm)...")
    cursor.execute("SELECT Id, EdIzm, FullEdIzm FROM tSprEdIzm")
    units = {}
    for row in cursor.fetchall():
        units[row[0]] = {
            'short': (row[1] or '').strip()[:50],  # Ограничиваем длину
            'full': (row[2] or '').strip()
        }
    print(f"   → Найдено {len(units)} единиц измерения")
    
    # 3. Загружаем работы
    print("🔨 Загрузка работ (tSprPrices)...")
    cursor.execute("""
        SELECT IdRazdel, IdPrice, PriceName, EdIzm, PriceFakt, PriceEst, 
               Trudozatrats, Razrjad, SostavRabot 
        FROM tSprPrices 
        ORDER BY IdRazdel, PriceName
    """)
    works = []
    for row in cursor.fetchall():
        # Получаем единицу измерения
        unit_id = row[3]
        unit_name = units.get(unit_id, {}).get('short', 'шт') if unit_id else 'шт'
        
        works.append({
            'category_id': row[0],
            'original_id': row[1],
            'name': (row[2] or '').strip(),
            'unit': unit_name,
            'price_fact': float(row[4] or 0),
            'price_est': float(row[5] or 0),
            'labor_hours': float(row[6] or 0),
            'labor_grade': row[7],
            'composition': (row[8] or '').strip()
        })
    print(f"   → Найдено {len(works)} работ")
    
    # 4. Загружаем группы материалов
    print("📦 Загрузка групп материалов (tGroupsMaterials)...")
    cursor.execute("SELECT IdGroup, NameGroup, IdParentGroup FROM tGroupsMaterials ORDER BY IdGroup")
    material_categories = []
    for row in cursor.fetchall():
        material_categories.append({
            'id': row[0],
            'name': (row[1] or '').strip(),
            'parent_id': row[2]
        })
    print(f"   → Найдено {len(material_categories)} групп материалов")
    
    # 5. Загружаем материалы
    print("🧱 Загрузка материалов (tSprMaterials)...")
    cursor.execute("""
        SELECT IdGroup, IdMaterial, NameMaterial, EdIzm, PriceFakt, PriceEst, MassaEd
        FROM tSprMaterials 
        ORDER BY IdGroup, NameMaterial
    """)
    materials = []
    for row in cursor.fetchall():
        unit_id = row[3]
        unit_name = units.get(unit_id, {}).get('short', 'шт') if unit_id else 'шт'
        
        materials.append({
            'category_id': row[0],
            'original_id': row[1],
            'name': (row[2] or '').strip(),
            'unit': unit_name,
            'price_fact': float(row[4] or 0),
            'price_est': float(row[5] or 0),
            'mass': float(row[6] or 0)
        })
    print(f"   → Найдено {len(materials)} материалов")
    
    conn.close()
    
    return {
        'work_categories': work_categories,
        'works': works,
        'material_categories': material_categories,
        'materials': materials,
        'units': units
    }


async def clear_existing_data():
    """Очистка существующих данных"""
    async with async_session_maker() as session:
        print("🗑️  Очистка существующих данных...")
        
        # Очищаем в правильном порядке (из-за FK)
        await session.execute(text("DELETE FROM work_resources"))
        await session.execute(text("DELETE FROM works"))
        await session.execute(text("DELETE FROM work_categories"))
        await session.execute(text("DELETE FROM materials"))
        await session.execute(text("DELETE FROM material_categories"))
        
        await session.commit()
        print("   → Данные очищены")


async def import_data(data: dict):
    """Импорт данных в нашу базу"""
    async with async_session_maker() as session:
        
        # 1. Импорт категорий работ
        print("📁 Импорт категорий работ...")
        category_map = {}  # Маппинг старых ID на новые
        
        for i, cat in enumerate(data['work_categories'], 1):
            # Очищаем имя категории от цифр в начале
            name = cat['name']
            for prefix in ['1 ', '2 ', '3 ', '4 ', '5 ', '6 ', '7 ', '8 ', '9 ']:
                if name.startswith(prefix):
                    name = name[2:]
                    break
            
            new_cat = WorkCategory(
                code=f"CAT-{i:02d}",
                name=name,
                description=f"Импортировано из Смета 2007 (IdRazdel={cat['id']})"
            )
            session.add(new_cat)
            await session.flush()
            category_map[cat['id']] = new_cat.id
        
        print(f"   → Импортировано {len(category_map)} категорий")
        
        # 2. Импорт работ
        print("🔨 Импорт работ...")
        work_count = 0
        
        for work in data['works']:
            if not work['name']:
                continue
                
            category_id = category_map.get(work['category_id'])
            
            # Генерируем код
            work_count += 1
            code = f"W-{work_count:04d}"
            
            new_work = Work(
                category_id=category_id,
                code=code,
                name=work['name'],
                full_name=work['composition'] if work['composition'] else None,
                unit=work['unit'] or 'шт',
                total_price=work['price_est'] if work['price_est'] > 0 else work['price_fact'],
                labor_hours=work['labor_hours'],
                source="Смета 2007",
                is_active=True
            )
            session.add(new_work)
        
        print(f"   → Импортировано {work_count} работ")
        
        # 3. Импорт категорий материалов
        print("📦 Импорт категорий материалов...")
        mat_category_map = {}
        
        for i, cat in enumerate(data['material_categories'], 1):
            new_cat = MaterialCategory(
                code=f"MAT-{i:02d}",
                name=cat['name'],
                description=f"Импортировано из Смета 2007 (IdGroup={cat['id']})"
            )
            session.add(new_cat)
            await session.flush()
            mat_category_map[cat['id']] = new_cat.id
        
        print(f"   → Импортировано {len(mat_category_map)} категорий материалов")
        
        # 4. Импорт материалов
        print("🧱 Импорт материалов...")
        material_count = 0
        
        for mat in data['materials']:
            if not mat['name']:
                continue
                
            category_id = mat_category_map.get(mat['category_id'])
            
            material_count += 1
            code = f"M-{material_count:04d}"
            
            new_mat = Material(
                category_id=category_id,
                code=code,
                name=mat['name'],
                unit=mat['unit'] or 'шт',
                price=mat['price_est'] if mat['price_est'] > 0 else mat['price_fact']
            )
            session.add(new_mat)
        
        print(f"   → Импортировано {material_count} материалов")
        
        await session.commit()
        print("✅ Импорт завершён успешно!")
        
        return {
            'work_categories': len(category_map),
            'works': work_count,
            'material_categories': len(mat_category_map),
            'materials': material_count
        }


async def show_statistics():
    """Показать статистику после импорта"""
    async with async_session_maker() as session:
        print("\n📊 Статистика базы данных после импорта:")
        
        result = await session.execute(select(WorkCategory))
        categories = result.scalars().all()
        print(f"   • Категорий работ: {len(categories)}")
        
        result = await session.execute(select(Work))
        works = result.scalars().all()
        print(f"   • Работ: {len(works)}")
        
        result = await session.execute(select(MaterialCategory))
        mat_cats = result.scalars().all()
        print(f"   • Категорий материалов: {len(mat_cats)}")
        
        result = await session.execute(select(Material))
        materials = result.scalars().all()
        print(f"   • Материалов: {len(materials)}")
        
        # Показываем примеры работ по категориям
        print("\n📋 Примеры работ по категориям:")
        for cat in categories[:5]:
            result = await session.execute(
                select(Work).where(Work.category_id == cat.id).limit(3)
            )
            cat_works = result.scalars().all()
            print(f"\n   {cat.name}:")
            for w in cat_works:
                print(f"      - {w.name} ({w.unit}) - {w.total_price:.2f} руб.")


async def main():
    print("=" * 60)
    print("🚀 ИМПОРТ ДАННЫХ ИЗ СМЕТА 2007")
    print("=" * 60)
    print(f"📂 База данных: {ACCESS_DB_PATH}")
    print()
    
    # Проверяем наличие файла базы
    if not os.path.exists(ACCESS_DB_PATH):
        print(f"❌ Файл базы данных не найден: {ACCESS_DB_PATH}")
        return
    
    # Загружаем данные из Access
    print("📥 Этап 1: Загрузка данных из Смета 2007")
    print("-" * 40)
    data = load_zaru_ai_smeta_data()
    
    print()
    print("🔄 Этап 2: Импорт в базу ZARU Смета")
    print("-" * 40)
    
    # Спрашиваем подтверждение
    confirm = input("\n⚠️  Это удалит существующие справочники. Продолжить? (y/n): ")
    if confirm.lower() != 'y':
        print("❌ Импорт отменён")
        return
    
    await clear_existing_data()
    result = await import_data(data)
    
    await show_statistics()
    
    print()
    print("=" * 60)
    print("✅ ИМПОРТ ЗАВЕРШЁН")
    print("=" * 60)
    print(f"   Категорий работ:      {result['work_categories']}")
    print(f"   Работ:                {result['works']}")
    print(f"   Категорий материалов: {result['material_categories']}")
    print(f"   Материалов:           {result['materials']}")


if __name__ == "__main__":
    asyncio.run(main())
