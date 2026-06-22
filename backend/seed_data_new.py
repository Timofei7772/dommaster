"""
Заполнение базы данных начальными данными
Данные справочников импортированы из оригинальной ZARU AI смета (Prices_rsk 2.0.accdb)

Содержит:
- 16 категорий работ  
- 523 работы с ценами
- 20 категорий материалов
- 232 материала с ценами
"""

import asyncio
import sys
import json
import os
sys.path.insert(0, '.')

from app.database import async_session_maker, engine
from app.models import *
from sqlalchemy import select
from datetime import date, datetime

# Путь к экспортированным данным из ZARU AI смета
SMETA_DATA_PATH = os.path.join(os.path.dirname(__file__), 'zaru_ai_smeta_data.json')


def load_smeta_data():
    """Загрузка данных из JSON"""
    if os.path.exists(SMETA_DATA_PATH):
        with open(SMETA_DATA_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    return None


async def seed_database():
    async with async_session_maker() as session:
        # Проверяем, есть ли уже данные
        result = await session.execute(select(WorkCategory))
        if result.scalars().first():
            print("База уже содержит данные")
            return
        
        print("=" * 60)
        print("🚀 ЗАПОЛНЕНИЕ БАЗЫ ДАННЫХ")
        print("=" * 60)
        
        # Пробуем загрузить данные из ZARU AI смета
        smeta_data = load_smeta_data()
        
        if smeta_data:
            print("📦 Используем данные из ZARU AI смета")
            await seed_from_zaru_ai_smeta(session, smeta_data)
        else:
            print("📦 Используем базовые данные")
            await seed_basic_data(session)
        
        # Добавляем тестовые сметы и договоры
        await seed_test_data(session)
        
        await session.commit()
        print("\n✅ База данных успешно заполнена!")


async def seed_from_zaru_ai_smeta(session, data):
    """Заполнение из данных ZARU AI смета"""
    
    # 1. Категории работ
    print("\n📁 Импорт категорий работ...")
    category_map = {}  # old_id -> new_id
    
    for i, cat in enumerate(data['work_categories'], 1):
        new_cat = WorkCategory(
            code=f"CAT-{i:02d}",
            name=cat['name'],
            description=f"Импортировано из ZARU AI смета"
        )
        session.add(new_cat)
        await session.flush()
        category_map[cat['id']] = new_cat.id
    
    print(f"   → Импортировано {len(category_map)} категорий")
    
    # 2. Работы
    print("🔨 Импорт работ...")
    work_count = 0
    
    for work in data['works']:
        if not work['name']:
            continue
        
        work_count += 1
        new_work = Work(
            category_id=category_map.get(work['category_id']),
            code=f"W-{work_count:04d}",
            name=work['name'],
            full_name=work.get('composition'),
            unit=work['unit'] or 'шт',
            total_price=work['price'],
            labor_hours=work.get('labor_hours', 0),
            source="Смета 2007",
            is_active=True
        )
        session.add(new_work)
    
    print(f"   → Импортировано {work_count} работ")
    
    # 3. Категории материалов
    print("📦 Импорт категорий материалов...")
    mat_category_map = {}
    
    for i, cat in enumerate(data['material_categories'], 1):
        new_cat = MaterialCategory(
            code=f"MAT-{i:02d}",
            name=cat['name'],
            description=f"Импортировано из Смета 2007"
        )
        session.add(new_cat)
        await session.flush()
        mat_category_map[cat['id']] = new_cat.id
    
    print(f"   → Импортировано {len(mat_category_map)} категорий материалов")
    
    # 4. Материалы
    print("🧱 Импорт материалов...")
    material_count = 0
    
    for mat in data['materials']:
        if not mat['name']:
            continue
        
        material_count += 1
        new_mat = Material(
            category_id=mat_category_map.get(mat['category_id']),
            code=f"M-{material_count:04d}",
            name=mat['name'],
            unit=mat['unit'] or 'шт',
            price=mat['price']
        )
        session.add(new_mat)
    
    print(f"   → Импортировано {material_count} материалов")


async def seed_basic_data(session):
    """Заполнение базовыми данными (если нет smeta2007_data.json)"""
    
    # Категории работ
    categories = [
        WorkCategory(name="Демонтажные работы", code="01"),
        WorkCategory(name="Земляные работы", code="02"),
        WorkCategory(name="Фундамент", code="03"),
        WorkCategory(name="Устройство стен", code="04"),
        WorkCategory(name="Напольные покрытия", code="05"),
        WorkCategory(name="Потолки", code="06"),
        WorkCategory(name="Натяжные потолки", code="07"),
        WorkCategory(name="Плитка", code="08"),
        WorkCategory(name="Электрика", code="09"),
        WorkCategory(name="Сантехника", code="10"),
        WorkCategory(name="Мебель", code="11"),
        WorkCategory(name="Кровля", code="12"),
    ]
    session.add_all(categories)
    await session.flush()
    
    # Базовые работы
    works = [
        Work(name="Демонтаж штукатурки", unit="м2", total_price=200.0, category_id=categories[0].id, code="01-01"),
        Work(name="Демонтаж плитки керамической", unit="м2", total_price=400.0, category_id=categories[0].id, code="01-02"),
        Work(name="Демонтаж двери", unit="шт", total_price=650.0, category_id=categories[0].id, code="01-03"),
        
        Work(name="Штукатурка стен под маяк", unit="м2", total_price=500.0, category_id=categories[3].id, code="04-01"),
        Work(name="Шпаклевание стен под покраску", unit="м2", total_price=450.0, category_id=categories[3].id, code="04-02"),
        Work(name="Покраска стен в 2 слоя", unit="м2", total_price=350.0, category_id=categories[3].id, code="04-03"),
        Work(name="Оклейка стен обоями", unit="м2", total_price=250.0, category_id=categories[3].id, code="04-04"),
        
        Work(name="Укладка ламината", unit="м2", total_price=250.0, category_id=categories[4].id, code="05-01"),
        Work(name="Укладка плитки на пол", unit="м2", total_price=900.0, category_id=categories[7].id, code="08-01"),
        
        Work(name="Монтаж розетки", unit="шт", total_price=250.0, category_id=categories[8].id, code="09-01"),
        Work(name="Монтаж выключателя", unit="шт", total_price=240.0, category_id=categories[8].id, code="09-02"),
        
        Work(name="Установка унитаза", unit="шт", total_price=2000.0, category_id=categories[9].id, code="10-01"),
        Work(name="Установка смесителя", unit="шт", total_price=1000.0, category_id=categories[9].id, code="10-02"),
    ]
    session.add_all(works)
    
    # Категории материалов
    mat_categories = [
        MaterialCategory(name="Сухие смеси", code="М01"),
        MaterialCategory(name="Краски и лаки", code="М02"),
        MaterialCategory(name="Напольные покрытия", code="М03"),
        MaterialCategory(name="Плитка", code="М04"),
        MaterialCategory(name="Электрика", code="М05"),
        MaterialCategory(name="Сантехника", code="М06"),
    ]
    session.add_all(mat_categories)
    await session.flush()
    
    # Базовые материалы
    materials = [
        Material(name="Штукатурка гипсовая", unit="мешок", price=380.0, category_id=mat_categories[0].id, code="М01-01"),
        Material(name="Шпаклёвка финишная", unit="мешок", price=450.0, category_id=mat_categories[0].id, code="М01-02"),
        Material(name="Грунтовка глубокого проникновения", unit="л", price=120.0, category_id=mat_categories[0].id, code="М01-03"),
        
        Material(name="Краска водоэмульсионная", unit="л", price=250.0, category_id=mat_categories[1].id, code="М02-01"),
        Material(name="Ламинат 32 класс", unit="м2", price=650.0, category_id=mat_categories[2].id, code="М03-01"),
        Material(name="Плитка керамическая", unit="м2", price=850.0, category_id=mat_categories[3].id, code="М04-01"),
        
        Material(name="Розетка двойная", unit="шт", price=280.0, category_id=mat_categories[4].id, code="М05-01"),
        Material(name="Выключатель", unit="шт", price=180.0, category_id=mat_categories[4].id, code="М05-02"),
        Material(name="Кабель ВВГнг 3х2.5", unit="м", price=85.0, category_id=mat_categories[4].id, code="М05-03"),
        
        Material(name="Унитаз", unit="шт", price=8500.0, category_id=mat_categories[5].id, code="М06-01"),
        Material(name="Смеситель для ванной", unit="шт", price=4500.0, category_id=mat_categories[5].id, code="М06-02"),
    ]
    session.add_all(materials)
    
    print(f"   → Категорий работ: {len(categories)}")
    print(f"   → Работ: {len(works)}")
    print(f"   → Категорий материалов: {len(mat_categories)}")
    print(f"   → Материалов: {len(materials)}")


async def seed_test_data(session):
    """Добавление тестовых смет и договоров"""
    
    print("\n📄 Создание тестовых данных...")
    
    # Тестовые сметы
    estimates = [
        Estimate(
            name="Смета на ремонт квартиры",
            number="ЛС-001-2026",
            description="Капитальный ремонт трёхкомнатной квартиры",
            estimate_type="local",
            status="draft",
            overhead_percent=12.0,
            profit_percent=8.0,
            vat_percent=20.0,
        ),
        Estimate(
            name="Смета на ремонт офиса",
            number="ЛС-002-2026",
            description="Отделочные работы офисного помещения",
            estimate_type="local",
            status="draft",
            overhead_percent=10.0,
            profit_percent=6.0,
            vat_percent=20.0,
        ),
    ]
    session.add_all(estimates)
    print(f"   → Смет: {len(estimates)}")
    
    # Тестовые договоры
    contracts = [
        Contract(
            number="Д-001/2026",
            contract_date=date(2026, 1, 10),
            contract_type="legal_entity",
            customer_name='ООО "СтройИнвест"',
            customer_address="г. Москва, ул. Строителей, д. 15",
            customer_inn="7701234567",
            customer_phone="+7 (495) 123-45-67",
            object_name="Жилой дом по адресу: г. Москва, ул. Новая, д. 1",
            object_address="г. Москва, ул. Новая, д. 1",
            total_amount=15000000.0,
            advance_percent=30.0,
            start_date=date(2026, 2, 1),
            end_date=date(2026, 12, 31),
            status="active",
        ),
        Contract(
            number="Д-002/2026",
            contract_date=date(2026, 1, 5),
            contract_type="individual",
            customer_name="Иванов Иван Иванович",
            customer_address="г. Москва, ул. Центральная, д. 10, кв. 5",
            customer_phone="+7 (916) 555-12-34",
            object_name="Квартира - ремонт",
            object_address="г. Москва, ул. Центральная, д. 10, кв. 5",
            total_amount=850000.0,
            advance_percent=50.0,
            start_date=date(2026, 1, 15),
            end_date=date(2026, 3, 15),
            status="active",
        ),
    ]
    session.add_all(contracts)
    print(f"   → Договоров: {len(contracts)}")


if __name__ == "__main__":
    asyncio.run(seed_database())
