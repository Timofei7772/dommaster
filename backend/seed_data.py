import asyncio
import sys
sys.path.insert(0, '.')

from app.database import async_session_maker, engine
from app.models import *
from sqlalchemy import select
from datetime import date, datetime

async def seed_database():
    async with async_session_maker() as session:
        # Проверяем, есть ли уже данные
        result = await session.execute(select(WorkCategory))
        if result.scalars().first():
            print("База уже содержит данные")
            return
        
        print("Заполняем базу начальными данными...")
        
        # Категории работ
        categories = [
            WorkCategory(name="Земляные работы", code="01"),
            WorkCategory(name="Бетонные работы", code="02"),
            WorkCategory(name="Кладочные работы", code="03"),
            WorkCategory(name="Отделочные работы", code="04"),
            WorkCategory(name="Кровельные работы", code="05"),
            WorkCategory(name="Сантехнические работы", code="06"),
            WorkCategory(name="Электромонтажные работы", code="07"),
            WorkCategory(name="Благоустройство", code="08"),
        ]
        session.add_all(categories)
        await session.flush()
        
        # Работы
        works = [
            Work(name="Разработка грунта вручную", unit="м3", base_price=850.0, category_id=categories[0].id, code="01-01"),
            Work(name="Разработка грунта механизированным способом", unit="м3", base_price=320.0, category_id=categories[0].id, code="01-02"),
            Work(name="Обратная засыпка грунта", unit="м3", base_price=180.0, category_id=categories[0].id, code="01-03"),
            Work(name="Устройство песчаной подушки", unit="м3", base_price=450.0, category_id=categories[0].id, code="01-04"),
            
            Work(name="Устройство бетонной подготовки", unit="м3", base_price=4500.0, category_id=categories[1].id, code="02-01"),
            Work(name="Устройство монолитного фундамента", unit="м3", base_price=8500.0, category_id=categories[1].id, code="02-02"),
            Work(name="Устройство монолитных стен", unit="м3", base_price=12000.0, category_id=categories[1].id, code="02-03"),
            Work(name="Устройство монолитного перекрытия", unit="м3", base_price=15000.0, category_id=categories[1].id, code="02-04"),
            
            Work(name="Кладка стен из кирпича", unit="м3", base_price=6500.0, category_id=categories[2].id, code="03-01"),
            Work(name="Кладка стен из газобетона", unit="м3", base_price=4200.0, category_id=categories[2].id, code="03-02"),
            Work(name="Кладка перегородок", unit="м2", base_price=1800.0, category_id=categories[2].id, code="03-03"),
            
            Work(name="Штукатурка стен", unit="м2", base_price=650.0, category_id=categories[3].id, code="04-01"),
            Work(name="Шпаклевка стен", unit="м2", base_price=280.0, category_id=categories[3].id, code="04-02"),
            Work(name="Покраска стен", unit="м2", base_price=180.0, category_id=categories[3].id, code="04-03"),
            Work(name="Укладка плитки на пол", unit="м2", base_price=1200.0, category_id=categories[3].id, code="04-04"),
            Work(name="Укладка ламината", unit="м2", base_price=450.0, category_id=categories[3].id, code="04-05"),
            Work(name="Монтаж натяжного потолка", unit="м2", base_price=850.0, category_id=categories[3].id, code="04-06"),
            
            Work(name="Устройство кровли из металлочерепицы", unit="м2", base_price=1500.0, category_id=categories[4].id, code="05-01"),
            Work(name="Устройство мягкой кровли", unit="м2", base_price=1200.0, category_id=categories[4].id, code="05-02"),
            Work(name="Утепление кровли", unit="м2", base_price=650.0, category_id=categories[4].id, code="05-03"),
            
            Work(name="Монтаж труб водоснабжения", unit="п.м.", base_price=450.0, category_id=categories[5].id, code="06-01"),
            Work(name="Монтаж труб канализации", unit="п.м.", base_price=380.0, category_id=categories[5].id, code="06-02"),
            Work(name="Установка сантехприборов", unit="шт", base_price=2500.0, category_id=categories[5].id, code="06-03"),
            Work(name="Монтаж радиаторов отопления", unit="шт", base_price=3500.0, category_id=categories[5].id, code="06-04"),
            
            Work(name="Прокладка кабеля", unit="п.м.", base_price=120.0, category_id=categories[6].id, code="07-01"),
            Work(name="Установка розеток", unit="шт", base_price=350.0, category_id=categories[6].id, code="07-02"),
            Work(name="Установка выключателей", unit="шт", base_price=280.0, category_id=categories[6].id, code="07-03"),
            Work(name="Монтаж электрощита", unit="шт", base_price=8500.0, category_id=categories[6].id, code="07-04"),
            
            Work(name="Устройство асфальтового покрытия", unit="м2", base_price=1200.0, category_id=categories[7].id, code="08-01"),
            Work(name="Укладка тротуарной плитки", unit="м2", base_price=1500.0, category_id=categories[7].id, code="08-02"),
            Work(name="Устройство газона", unit="м2", base_price=350.0, category_id=categories[7].id, code="08-03"),
        ]
        session.add_all(works)
        
        # Категории материалов
        mat_categories = [
            MaterialCategory(name="Бетон и растворы", code="М01"),
            MaterialCategory(name="Кирпич и блоки", code="М02"),
            MaterialCategory(name="Металлопрокат", code="М03"),
            MaterialCategory(name="Пиломатериалы", code="М04"),
            MaterialCategory(name="Отделочные материалы", code="М05"),
            MaterialCategory(name="Кровельные материалы", code="М06"),
            MaterialCategory(name="Сантехника", code="М07"),
            MaterialCategory(name="Электрика", code="М08"),
        ]
        session.add_all(mat_categories)
        await session.flush()
        
        # Материалы
        materials = [
            Material(name="Бетон М200", unit="м3", price=4500.0, category_id=mat_categories[0].id, code="М01-01"),
            Material(name="Бетон М300", unit="м3", price=5200.0, category_id=mat_categories[0].id, code="М01-02"),
            Material(name="Раствор М100", unit="м3", price=3800.0, category_id=mat_categories[0].id, code="М01-03"),
            Material(name="Песок строительный", unit="м3", price=850.0, category_id=mat_categories[0].id, code="М01-04"),
            Material(name="Щебень фр. 20-40", unit="м3", price=1200.0, category_id=mat_categories[0].id, code="М01-05"),
            
            Material(name="Кирпич керамический М150", unit="шт", price=18.0, category_id=mat_categories[1].id, code="М02-01"),
            Material(name="Кирпич силикатный", unit="шт", price=12.0, category_id=mat_categories[1].id, code="М02-02"),
            Material(name="Газобетонный блок D500", unit="м3", price=4200.0, category_id=mat_categories[1].id, code="М02-03"),
            Material(name="Пеноблок", unit="м3", price=3500.0, category_id=mat_categories[1].id, code="М02-04"),
            
            Material(name="Арматура d12", unit="т", price=65000.0, category_id=mat_categories[2].id, code="М03-01"),
            Material(name="Арматура d16", unit="т", price=62000.0, category_id=mat_categories[2].id, code="М03-02"),
            Material(name="Профнастил С-21", unit="м2", price=450.0, category_id=mat_categories[2].id, code="М03-03"),
            
            Material(name="Доска обрезная 50х150", unit="м3", price=12000.0, category_id=mat_categories[3].id, code="М04-01"),
            Material(name="Брус 100х100", unit="м3", price=14000.0, category_id=mat_categories[3].id, code="М04-02"),
            Material(name="Фанера 18мм", unit="лист", price=1800.0, category_id=mat_categories[3].id, code="М04-03"),
            
            Material(name="Гипсокартон 12.5мм", unit="лист", price=450.0, category_id=mat_categories[4].id, code="М05-01"),
            Material(name="Штукатурка гипсовая", unit="мешок", price=380.0, category_id=mat_categories[4].id, code="М05-02"),
            Material(name="Краска водоэмульсионная", unit="ведро", price=2500.0, category_id=mat_categories[4].id, code="М05-03"),
            Material(name="Плитка керамическая", unit="м2", price=850.0, category_id=mat_categories[4].id, code="М05-04"),
            Material(name="Ламинат 32 класс", unit="м2", price=650.0, category_id=mat_categories[4].id, code="М05-05"),
            
            Material(name="Металлочерепица", unit="м2", price=550.0, category_id=mat_categories[5].id, code="М06-01"),
            Material(name="Мягкая кровля", unit="м2", price=420.0, category_id=mat_categories[5].id, code="М06-02"),
            Material(name="Утеплитель 100мм", unit="м3", price=2800.0, category_id=mat_categories[5].id, code="М06-03"),
            
            Material(name="Труба ПВХ 50мм", unit="п.м.", price=85.0, category_id=mat_categories[6].id, code="М07-01"),
            Material(name="Труба ПВХ 110мм", unit="п.м.", price=180.0, category_id=mat_categories[6].id, code="М07-02"),
            Material(name="Унитаз", unit="шт", price=8500.0, category_id=mat_categories[6].id, code="М07-03"),
            Material(name="Раковина", unit="шт", price=4500.0, category_id=mat_categories[6].id, code="М07-04"),
            
            Material(name="Кабель ВВГнг 3х2.5", unit="м", price=85.0, category_id=mat_categories[7].id, code="М08-01"),
            Material(name="Розетка двойная", unit="шт", price=280.0, category_id=mat_categories[7].id, code="М08-02"),
            Material(name="Выключатель", unit="шт", price=180.0, category_id=mat_categories[7].id, code="М08-03"),
            Material(name="Автомат 16А", unit="шт", price=350.0, category_id=mat_categories[7].id, code="М08-04"),
        ]
        session.add_all(materials)
        
        # Тестовые сметы
        estimates = [
            Estimate(
                name="Смета на строительство жилого дома",
                number="ЛС-001-2026",
                description="Локальная смета на общестроительные работы",
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
            Estimate(
                name="Смета на благоустройство территории",
                number="ЛС-003-2026",
                description="Работы по благоустройству придомовой территории",
                estimate_type="local",
                status="approved",
                overhead_percent=8.0,
                profit_percent=5.0,
                vat_percent=20.0,
                total_materials=450000.0,
                total_works=280000.0,
                total_amount=876000.0,
            ),
        ]
        session.add_all(estimates)
        
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
        
        await session.commit()
        print("База данных успешно заполнена!")
        print(f"  - Категорий работ: {len(categories)}")
        print(f"  - Работ: {len(works)}")
        print(f"  - Категорий материалов: {len(mat_categories)}")
        print(f"  - Материалов: {len(materials)}")
        print(f"  - Смет: {len(estimates)}")
        print(f"  - Договоров: {len(contracts)}")

if __name__ == "__main__":
    asyncio.run(seed_database())
