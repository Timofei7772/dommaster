/**
 * Скрипт создания демо-сметы с полным комплектом документов
 * Запуск: node create_demo_estimate.js
 */

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Путь к базе данных
const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'zaru-smeta', 'smeta_zaru.db');

// Данные клиента
const CLIENT = {
    name: 'Иванов Сергей Петрович',
    address: 'г. Москва, ул. Ленина, д. 25, кв. 48',
    phone: '+7 (916) 123-45-67',
    type: 'individual' // физ. лицо
};

// Данные подрядчика
const CONTRACTOR = {
    name: 'ООО "СтройМастер"',
    address: 'г. Москва, ул. Строителей, д. 10, офис 205',
    inn: '7701234567',
    kpp: '770101001',
    ogrn: '1027700123456',
    bank: 'ПАО Сбербанк',
    rs: '40702810938000012345',
    ks: '30101810400000000225',
    bik: '044525225',
    director: 'Петров А.В.'
};

// Работы для сметы (ремонт 2-комнатной квартиры ~55 м²)
const WORKS = [
    // Демонтажные работы
    { section: 'Демонтажные работы', name: 'Демонтаж обоев', unit: 'м²', qty: 120, labor: 80 },
    { section: 'Демонтажные работы', name: 'Демонтаж плинтусов', unit: 'м.п.', qty: 45, labor: 50 },
    { section: 'Демонтажные работы', name: 'Снятие старого линолеума', unit: 'м²', qty: 55, labor: 100 },
    { section: 'Демонтажные работы', name: 'Демонтаж керамической плитки', unit: 'м²', qty: 12, labor: 350 },
    
    // Черновые работы
    { section: 'Черновые работы', name: 'Штукатурка стен по маякам', unit: 'м²', qty: 85, labor: 450, material: 280 },
    { section: 'Черновые работы', name: 'Шпаклёвка стен под обои', unit: 'м²', qty: 120, labor: 180, material: 85 },
    { section: 'Черновые работы', name: 'Грунтовка стен', unit: 'м²', qty: 120, labor: 50, material: 35 },
    { section: 'Черновые работы', name: 'Стяжка пола (ЦПС)', unit: 'м²', qty: 55, labor: 550, material: 420 },
    { section: 'Черновые работы', name: 'Грунтовка пола', unit: 'м²', qty: 55, labor: 40, material: 30 },
    
    // Чистовая отделка
    { section: 'Чистовая отделка', name: 'Поклейка обоев флизелиновых', unit: 'м²', qty: 95, labor: 280, material: 450 },
    { section: 'Чистовая отделка', name: 'Покраска потолка водоэмульсионной краской', unit: 'м²', qty: 55, labor: 180, material: 120 },
    { section: 'Чистовая отделка', name: 'Укладка ламината', unit: 'м²', qty: 42, labor: 450, material: 850 },
    { section: 'Чистовая отделка', name: 'Укладка плитки на пол (санузел)', unit: 'м²', qty: 8, labor: 1200, material: 1500 },
    { section: 'Чистовая отделка', name: 'Укладка плитки на стены (санузел)', unit: 'м²', qty: 25, labor: 1100, material: 1200 },
    { section: 'Чистовая отделка', name: 'Установка плинтусов ПВХ', unit: 'м.п.', qty: 45, labor: 120, material: 180 },
    
    // Электрика
    { section: 'Электромонтажные работы', name: 'Штробление стен под проводку', unit: 'м.п.', qty: 65, labor: 250 },
    { section: 'Электромонтажные работы', name: 'Прокладка кабеля ВВГнг 3x2.5', unit: 'м.п.', qty: 80, labor: 80, material: 65 },
    { section: 'Электромонтажные работы', name: 'Установка розеток', unit: 'шт.', qty: 18, labor: 350, material: 280 },
    { section: 'Электромонтажные работы', name: 'Установка выключателей', unit: 'шт.', qty: 8, labor: 300, material: 250 },
    { section: 'Электромонтажные работы', name: 'Монтаж электрощита', unit: 'шт.', qty: 1, labor: 4500, material: 8500 },
    { section: 'Электромонтажные работы', name: 'Установка светильников', unit: 'шт.', qty: 12, labor: 450, material: 1200 },
    
    // Сантехника
    { section: 'Сантехнические работы', name: 'Замена стояков ХВС/ГВС', unit: 'компл.', qty: 1, labor: 8500, material: 12000 },
    { section: 'Сантехнические работы', name: 'Установка унитаза', unit: 'шт.', qty: 1, labor: 3500, material: 15000 },
    { section: 'Сантехнические работы', name: 'Установка раковины с тумбой', unit: 'шт.', qty: 1, labor: 2800, material: 18000 },
    { section: 'Сантехнические работы', name: 'Установка ванны акриловой', unit: 'шт.', qty: 1, labor: 5500, material: 25000 },
    { section: 'Сантехнические работы', name: 'Установка смесителей', unit: 'шт.', qty: 3, labor: 1200, material: 4500 },
    { section: 'Сантехнические работы', name: 'Монтаж полотенцесушителя', unit: 'шт.', qty: 1, labor: 2500, material: 8000 },
    
    // Двери
    { section: 'Столярные работы', name: 'Установка межкомнатных дверей', unit: 'шт.', qty: 4, labor: 3500, material: 12000 },
    { section: 'Столярные работы', name: 'Установка входной двери', unit: 'шт.', qty: 1, labor: 5000, material: 35000 },
];

async function main() {
    console.log('=== ZARU Смета - Создание демо-сметы ===\n');
    
    // Загружаем SQL.js
    const SQL = await initSqlJs();
    
    // Проверяем существование базы
    if (!fs.existsSync(dbPath)) {
        console.error('База данных не найдена:', dbPath);
        console.log('Сначала запустите приложение для создания базы.');
        return;
    }
    
    // Открываем базу
    const buffer = fs.readFileSync(dbPath);
    const db = new SQL.Database(buffer);
    
    console.log('✓ База данных загружена\n');
    
    // 1. Создаём проект
    console.log('1. Создание проекта...');
    db.run(`INSERT INTO projects (name, client_name, address, status) VALUES (?, ?, ?, ?)`, [
        'Ремонт квартиры - ' + CLIENT.name,
        CLIENT.name,
        CLIENT.address,
        'active'
    ]);
    const projectId = db.exec("SELECT last_insert_rowid()")[0].values[0][0];
    console.log(`   ✓ Проект создан (ID: ${projectId})`);
    
    // 2. Создаём смету
    console.log('\n2. Создание сметы...');
    const estimateNumber = 'СМ-2026-001';
    db.run(`INSERT INTO estimates (project_id, name, number, client_name, address, status, overhead_percent, profit_percent, vat_percent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        projectId,
        'Капитальный ремонт 2-комнатной квартиры',
        estimateNumber,
        CLIENT.name,
        CLIENT.address,
        'draft',
        15, // накладные 15%
        10, // прибыль 10%
        20  // НДС 20%
    ]);
    const estimateId = db.exec("SELECT last_insert_rowid()")[0].values[0][0];
    console.log(`   ✓ Смета создана (ID: ${estimateId}, №${estimateNumber})`);
    
    // 3. Создаём коэффициенты
    db.run(`INSERT INTO coefficients (estimate_id, work_coef, material_coef, overhead_coef, profit_coef) VALUES (?, ?, ?, ?, ?)`, [
        estimateId, 1.0, 1.0, 1.15, 1.10
    ]);
    
    // 4. Создаём разделы и добавляем работы
    console.log('\n3. Добавление работ по разделам...');
    
    const sections = {};
    let totalMaterials = 0;
    let totalLabor = 0;
    let sortOrder = 0;
    
    for (const work of WORKS) {
        // Создаём раздел если его нет
        if (!sections[work.section]) {
            db.run(`INSERT INTO estimate_sections (estimate_id, name, level, sort_order) VALUES (?, ?, ?, ?)`, [
                estimateId, work.section, 1, Object.keys(sections).length + 1
            ]);
            const sectionId = db.exec("SELECT last_insert_rowid()")[0].values[0][0];
            sections[work.section] = sectionId;
            console.log(`   📁 Раздел: ${work.section}`);
        }
        
        const materialPrice = work.material || 0;
        const laborPrice = work.labor || 0;
        const qty = work.qty;
        
        // Добавляем позицию
        db.run(`INSERT INTO estimate_items (estimate_id, section_id, name, unit, quantity, material_price, labor_price, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
            estimateId,
            sections[work.section],
            work.name,
            work.unit,
            qty,
            materialPrice,
            laborPrice,
            ++sortOrder
        ]);
        
        totalMaterials += materialPrice * qty;
        totalLabor += laborPrice * qty;
        
        console.log(`      + ${work.name}: ${qty} ${work.unit} × ${laborPrice + materialPrice} ₽`);
    }
    
    // 5. Обновляем итоги сметы
    const subtotal = totalMaterials + totalLabor;
    const overhead = subtotal * 0.15;
    const profit = subtotal * 0.10;
    const totalBeforeVAT = subtotal + overhead + profit;
    const vat = totalBeforeVAT * 0.20;
    const grandTotal = totalBeforeVAT + vat;
    
    db.run(`UPDATE estimates SET total_cost = ? WHERE id = ?`, [grandTotal, estimateId]);
    
    console.log('\n' + '='.repeat(50));
    console.log('ИТОГИ СМЕТЫ:');
    console.log('='.repeat(50));
    console.log(`Материалы:           ${totalMaterials.toLocaleString('ru-RU')} ₽`);
    console.log(`Работы:              ${totalLabor.toLocaleString('ru-RU')} ₽`);
    console.log(`─────────────────────────────────────`);
    console.log(`Итого:               ${subtotal.toLocaleString('ru-RU')} ₽`);
    console.log(`Накладные (15%):     ${overhead.toLocaleString('ru-RU')} ₽`);
    console.log(`Прибыль (10%):       ${profit.toLocaleString('ru-RU')} ₽`);
    console.log(`─────────────────────────────────────`);
    console.log(`Итого без НДС:       ${totalBeforeVAT.toLocaleString('ru-RU')} ₽`);
    console.log(`НДС (20%):           ${vat.toLocaleString('ru-RU')} ₽`);
    console.log(`═════════════════════════════════════`);
    console.log(`ВСЕГО С НДС:         ${grandTotal.toLocaleString('ru-RU')} ₽`);
    console.log('='.repeat(50));
    
    // 6. Создаём договор
    console.log('\n4. Создание договора...');
    const contractNumber = 'ДП-2026-001';
    const contractDate = new Date().toISOString().split('T')[0];
    db.run(`INSERT INTO contracts (project_id, estimate_id, number, date, client, client_type, contractor, subject, amount, prepayment_percent, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        projectId,
        estimateId,
        contractNumber,
        contractDate,
        CLIENT.name,
        CLIENT.type,
        CONTRACTOR.name,
        'Выполнение работ по капитальному ремонту квартиры',
        grandTotal,
        30,
        'draft'
    ]);
    const contractId = db.exec("SELECT last_insert_rowid()")[0].values[0][0];
    console.log(`   ✓ Договор №${contractNumber} от ${contractDate}`);
    console.log(`   Сумма: ${grandTotal.toLocaleString('ru-RU')} ₽`);
    console.log(`   Аванс 30%: ${(grandTotal * 0.3).toLocaleString('ru-RU')} ₽`);
    
    // Сохраняем базу
    const data = db.export();
    fs.writeFileSync(dbPath, Buffer.from(data));
    db.close();
    
    console.log('\n' + '═'.repeat(50));
    console.log('✅ СМЕТА УСПЕШНО СОЗДАНА!');
    console.log('═'.repeat(50));
    console.log('\nОткройте приложение ZARU Смета для:');
    console.log('  • Просмотра сметы');
    console.log('  • Генерации КП (коммерческого предложения)');
    console.log('  • Генерации договора подряда');
    console.log('  • Генерации ведомости материалов М-29');
    console.log('  • Генерации счёт-фактуры');
    console.log('\nДанные проекта:');
    console.log(`  Клиент: ${CLIENT.name}`);
    console.log(`  Адрес: ${CLIENT.address}`);
    console.log(`  Смета №${estimateNumber}`);
    console.log(`  Договор №${contractNumber}`);
}

main().catch(console.error);
