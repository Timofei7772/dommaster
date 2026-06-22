/**
 * ZARU AI смета v2.0 - Генератор документов
 * Точное воспроизведение формата ZARU AI смета
 */

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const os = require('os');
const ExcelJS = require('exceljs');

const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'zaru-smeta', 'smeta_zaru.db');
const outputDir = path.join(__dirname, 'generated_documents');

// ===== НАСТРОЙКИ КОМПАНИИ =====
const COMPANY = {
    name: 'ООО РСК ДОММАСТЕР',
    director: 'Тимербулатов Зинур Динар'
};

// ===== КОЭФФИЦИЕНТЫ ZARU AI смета =====
const COEF = {
    work: 1.8,       // Коэфф. для стоимости работ
    material: 1.04,  // Коэфф. для стоимости материалов  
    vns: 0,          // ВНС %
    lni: 0           // ЛНИ %
};

function formatDate(dateStr) {
    if (!dateStr) dateStr = new Date().toISOString().split('T')[0];
    const d = new Date(dateStr);
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

// ===== СТИЛИ ЯЧЕЕК =====
const border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' }
};

const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
const totalFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } };

async function main() {
    console.log('═'.repeat(60));
    console.log('ZARU AI смета v2.0 - ГЕНЕРАЦИЯ ДОКУМЕНТОВ');
    console.log('═'.repeat(60));

    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const SQL = await initSqlJs();
    if (!fs.existsSync(dbPath)) {
        console.error('❌ База данных не найдена');
        return;
    }

    const buffer = fs.readFileSync(dbPath);
    const db = new SQL.Database(buffer);

    // Получаем последнюю смету
    const estRes = db.exec(`
        SELECT e.*, p.client_name, p.address 
        FROM estimates e 
        LEFT JOIN projects p ON e.project_id = p.id 
        ORDER BY e.id DESC LIMIT 1
    `);

    if (!estRes.length) {
        console.error('❌ Сметы не найдены');
        return;
    }

    const cols = estRes[0].columns;
    const vals = estRes[0].values[0];
    const estimate = {};
    cols.forEach((c, i) => estimate[c] = vals[i]);

    // Получаем позиции
    const itemsRes = db.exec(`
        SELECT ei.*, es.name as section_name, es.sort_order as section_order
        FROM estimate_items ei 
        LEFT JOIN estimate_sections es ON ei.section_id = es.id 
        WHERE ei.estimate_id = ${estimate.id} 
        ORDER BY es.sort_order, ei.sort_order
    `);

    const items = [];
    if (itemsRes.length) {
        const itemCols = itemsRes[0].columns;
        itemsRes[0].values.forEach(row => {
            const item = {};
            itemCols.forEach((c, i) => item[c] = row[i]);
            items.push(item);
        });
    }

    const objectName = estimate.name || 'Ремонтно отделочные работы';
    const contractDate = formatDate();
    const estimateNumber = estimate.number || '1';

    console.log(`\n📋 Смета: ${objectName}`);
    console.log(`📝 Номер: ${estimateNumber}`);
    console.log(`📊 Позиций: ${items.length}`);

    // ===== 1. СМЕТА (для клиента) =====
    await generateSmeta(items, estimate, objectName, contractDate, estimateNumber);

    // ===== 2. ВЕДОМОСТЬ ФОТ (для рабочих) =====
    await generateFOT(items, estimate, objectName, contractDate, estimateNumber);

    db.close();

    console.log('\n' + '═'.repeat(60));
    console.log('✅ ДОКУМЕНТЫ СГЕНЕРИРОВАНЫ!');
    console.log('═'.repeat(60));
    console.log(`\n📁 Папка: ${outputDir}`);
    fs.readdirSync(outputDir).forEach(f => console.log(`   📄 ${f}`));
}

// =============================================
// КОММЕРЧЕСКАЯ СМЕТА ДЛЯ КЛИЕНТА
// =============================================
async function generateSmeta(items, estimate, objectName, contractDate, estimateNumber) {
    console.log('\n1️⃣  Генерация СМЕТЫ (для клиента)...');

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Смета');

    // Ширина столбцов (как на скриншоте)
    ws.getColumn(1).width = 5;   // № п/п
    ws.getColumn(2).width = 55;  // Наименование
    ws.getColumn(3).width = 10;  // Ед. изм.
    ws.getColumn(4).width = 10;  // Кол-во
    ws.getColumn(5).width = 12;  // Цена
    ws.getColumn(6).width = 14;  // Стоимость

    let row = 1;

    // ===== ШАПКА "УТВЕРЖДАЮ / СОГЛАСОВАНО" =====
    ws.getCell('A1').value = 'Утверждаю:';
    ws.getCell('A1').font = { bold: true, underline: true };

    ws.getCell('D1').value = 'Согласовано:';
    ws.getCell('D1').font = { bold: true };
    
    ws.getCell('D2').value = `Генеральный директор ${COMPANY.name}`;

    ws.getCell('A4').value = '/';
    ws.getCell('B4').value = '/';
    ws.getCell('E4').value = `/ ${COMPANY.director}`;

    ws.getCell('A5').value = contractDate;
    ws.getCell('B5').value = 'м.п.';
    ws.getCell('D5').value = contractDate;
    ws.getCell('E5').value = 'м.п.';

    row = 7;

    // ===== ЗАГОЛОВОК СМЕТЫ =====
    ws.mergeCells(`A${row}:F${row}`);
    ws.getCell(`A${row}`).value = `Смета № ${estimateNumber}`;
    ws.getCell(`A${row}`).font = { bold: true, size: 14 };
    ws.getCell(`A${row}`).alignment = { horizontal: 'center' };
    row++;

    ws.mergeCells(`A${row}:F${row}`);
    ws.getCell(`A${row}`).value = `на ${objectName}`;
    ws.getCell(`A${row}`).font = { bold: true, size: 12 };
    ws.getCell(`A${row}`).alignment = { horizontal: 'center' };
    row += 2;

    // ===== ПРИЛОЖЕНИЕ К ДОГОВОРУ =====
    ws.getCell(`A${row}`).value = 'Приложение № 1';
    row++;
    ws.getCell(`A${row}`).value = `к Договору № _____ от ${contractDate}`;
    row++;

    // ===== РАСЧЁТ ИТОГОВ =====
    let totalSmetaWork = 0;
    let totalSmetaMaterial = 0;

    items.forEach(item => {
        const qty = item.quantity || 1;
        const laborFact = item.labor_price || 0;
        const materialFact = item.material_price || 0;
        totalSmetaWork += laborFact * COEF.work * qty;
        totalSmetaMaterial += materialFact * COEF.material * qty;
    });

    const totalSmeta = totalSmetaWork + totalSmetaMaterial;

    // ===== БЛОК ИТОГОВ СПРАВА =====
    ws.getCell('E10').value = 'Сметная стоимость:';
    ws.getCell('E10').font = { bold: true };
    ws.getCell('F10').value = totalSmeta;
    ws.getCell('F10').numFmt = '#,##0.00';
    ws.getCell('F10').font = { bold: true };

    ws.getCell('E11').value = 'Стоимость работы:';
    ws.getCell('F11').value = totalSmetaWork;
    ws.getCell('F11').numFmt = '#,##0.00';

    ws.getCell('E12').value = 'Стоимость материалов:';
    ws.getCell('F12').value = totalSmetaMaterial;
    ws.getCell('F12').numFmt = '#,##0.00';

    // Дата составления
    const month = new Date().toLocaleString('ru-RU', { month: 'long', year: 'numeric' });
    ws.getCell('A13').value = `Составлена в уровне текущих цен на ${month.charAt(0).toUpperCase() + month.slice(1)}.`;
    row = 15;

    // ===== ШАПКА ТАБЛИЦЫ =====
    const headers = ['№\nп/п', 'Наименование работ, материалов, затрат', 'Ед. изм.', 'Кол-во', 'Цена', 'Стоимость'];
    headers.forEach((h, i) => {
        const cell = ws.getCell(row, i + 1);
        cell.value = h;
        cell.font = { bold: true, size: 10 };
        cell.fill = headerFill;
        cell.border = border;
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    ws.getRow(row).height = 30;
    row++;

    // Номера столбцов
    for (let i = 1; i <= 6; i++) {
        const cell = ws.getCell(row, i);
        cell.value = i;
        cell.font = { size: 9 };
        cell.fill = headerFill;
        cell.border = border;
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
    row++;

    // ===== ДАННЫЕ =====
    let currentSection = '';
    let sectionNum = 0;
    let itemNum = 0;
    let sectionTotal = 0;

    const writeSectionTotal = () => {
        if (sectionTotal > 0) {
            ws.getCell(row, 1).value = 'Итого по разделу';
            ws.mergeCells(`A${row}:E${row}`);
            ws.getCell(row, 1).font = { bold: true };
            ws.getCell(row, 6).value = sectionTotal;
            ws.getCell(row, 6).numFmt = '#,##0.00';
            ws.getCell(row, 6).font = { bold: true };
            for (let c = 1; c <= 6; c++) ws.getCell(row, c).border = border;
            row++;
            sectionTotal = 0;
        }
    };

    items.forEach(item => {
        // Новый раздел
        if (item.section_name && item.section_name !== currentSection) {
            writeSectionTotal();
            currentSection = item.section_name;
            sectionNum++;
            itemNum = 0;

            // Пустая строка перед разделом
            row++;

            // Заголовок раздела
            ws.mergeCells(`A${row}:F${row}`);
            ws.getCell(row, 1).value = `${sectionNum} Раздел: ${currentSection}`;
            ws.getCell(row, 1).font = { bold: true };
            ws.getCell(row, 1).fill = headerFill;
            for (let c = 1; c <= 6; c++) ws.getCell(row, c).border = border;
            row++;
        }

        // Позиция сметы
        itemNum++;
        const qty = item.quantity || 1;
        const laborFact = item.labor_price || 0;
        const materialFact = item.material_price || 0;
        
        // Сметная цена = факт × коэфф
        const priceSmeta = (laborFact * COEF.work) + (materialFact * COEF.material);
        const itemTotal = priceSmeta * qty;
        sectionTotal += itemTotal;

        // Записываем строку
        const rowData = [itemNum, item.name, item.unit || 'м2', qty, priceSmeta, itemTotal];
        rowData.forEach((val, i) => {
            const cell = ws.getCell(row, i + 1);
            cell.value = val;
            cell.border = border;
            cell.font = { size: 10 };
            cell.alignment = { vertical: 'middle', wrapText: i === 1 };
            if (i >= 3) {
                cell.numFmt = '#,##0.00';
                cell.alignment = { horizontal: 'right', vertical: 'middle' };
            }
        });
        row++;
    });

    writeSectionTotal();

    // ===== ИТОГО ПО РАЗДЕЛАМ =====
    row++;
    ws.getCell(row, 1).value = 'Итого по разделам';
    ws.mergeCells(`A${row}:E${row}`);
    ws.getCell(row, 1).font = { bold: true };
    ws.getCell(row, 6).value = totalSmeta;
    ws.getCell(row, 6).numFmt = '#,##0.00';
    ws.getCell(row, 6).font = { bold: true };
    for (let c = 1; c <= 6; c++) ws.getCell(row, c).border = border;
    row += 2;

    // ===== НДС =====
    ws.getCell(row, 1).value = 'НДС:';
    ws.mergeCells(`A${row}:E${row}`);
    ws.getCell(row, 6).value = 'не облагается';
    ws.getCell(row, 6).alignment = { horizontal: 'right' };
    row++;

    // ===== ВСЕГО ПО СМЕТЕ =====
    ws.getCell(row, 1).value = 'Всего по смете';
    ws.mergeCells(`A${row}:E${row}`);
    ws.getCell(row, 1).font = { bold: true };
    ws.getCell(row, 6).value = totalSmeta;
    ws.getCell(row, 6).numFmt = '#,##0.00';
    ws.getCell(row, 6).font = { bold: true };
    row += 4;

    // ===== ПОДПИСИ =====
    ws.getCell(row, 2).value = 'Составил: _______________________________ / _________________________________ /';
    row += 3;
    ws.getCell(row, 2).value = 'Проверил: _______________________________ / _________________________________ /';

    const filename = path.join(outputDir, `Смета_№${estimateNumber}.xlsx`);
    await wb.xlsx.writeFile(filename);
    console.log(`   ✅ ${path.basename(filename)}`);
    console.log(`   💰 Сметная стоимость: ${totalSmeta.toLocaleString('ru-RU', { minimumFractionDigits: 2 })} ₽`);
}

// =============================================
// ВЕДОМОСТЬ ФОТ ДЛЯ РАБОЧИХ
// =============================================
async function generateFOT(items, estimate, objectName, contractDate, estimateNumber) {
    console.log('\n2️⃣  Генерация ВЕДОМОСТИ ФОТ (для рабочих)...');

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('ФОТ');

    ws.getColumn(1).width = 5;
    ws.getColumn(2).width = 55;
    ws.getColumn(3).width = 10;
    ws.getColumn(4).width = 10;
    ws.getColumn(5).width = 12;
    ws.getColumn(6).width = 14;

    let row = 1;

    // ===== ШАПКА =====
    ws.getCell('A1').value = 'Утверждаю:';
    ws.getCell('A1').font = { bold: true, underline: true };
    ws.getCell('A3').value = '_______________________________ /';
    ws.getCell('C3').value = '/';
    ws.getCell('A5').value = contractDate;

    row = 7;

    // ===== ЗАГОЛОВОК =====
    ws.mergeCells(`A${row}:F${row}`);
    ws.getCell(`A${row}`).value = `Ведомость № ${estimateNumber}`;
    ws.getCell(`A${row}`).font = { bold: true, size: 14 };
    ws.getCell(`A${row}`).alignment = { horizontal: 'center' };
    row++;

    ws.mergeCells(`A${row}:F${row}`);
    ws.getCell(`A${row}`).value = 'Фонд оплаты труда по объекту';
    ws.getCell(`A${row}`).font = { bold: true, size: 16 };
    ws.getCell(`A${row}`).alignment = { horizontal: 'center' };
    row++;

    ws.mergeCells(`A${row}:F${row}`);
    ws.getCell(`A${row}`).value = objectName;
    ws.getCell(`A${row}`).font = { bold: true, size: 12 };
    ws.getCell(`A${row}`).alignment = { horizontal: 'center' };
    row += 2;

    ws.getCell(`A${row}`).value = 'Производитель работ: Иванов И.И.';
    row += 2;

    // ===== ШАПКА ТАБЛИЦЫ =====
    const headers = ['№\nп/п', 'Наименование работ', 'Кол-во', 'Ед. изм.', 'Цена', 'Стоимость'];
    headers.forEach((h, i) => {
        const cell = ws.getCell(row, i + 1);
        cell.value = h;
        cell.font = { bold: true, size: 10 };
        cell.fill = headerFill;
        cell.border = border;
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    ws.getRow(row).height = 30;
    row++;

    // Номера столбцов
    for (let i = 1; i <= 6; i++) {
        const cell = ws.getCell(row, i);
        cell.value = i;
        cell.font = { size: 9 };
        cell.fill = headerFill;
        cell.border = border;
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
    row++;

    // ===== ДАННЫЕ (ФАКТИЧЕСКИЕ ЦЕНЫ) =====
    let currentSection = '';
    let sectionNum = 0;
    let itemNum = 0;
    let sectionTotal = 0;
    let grandTotal = 0;

    const writeSectionTotalFOT = () => {
        if (sectionTotal > 0) {
            ws.getCell(row, 1).value = 'Итого по разделу:';
            ws.mergeCells(`A${row}:E${row}`);
            ws.getCell(row, 1).font = { bold: true };
            ws.getCell(row, 6).value = sectionTotal;
            ws.getCell(row, 6).numFmt = '#,##0.00';
            ws.getCell(row, 6).font = { bold: true };
            for (let c = 1; c <= 6; c++) ws.getCell(row, c).border = border;
            row++;
            grandTotal += sectionTotal;
            sectionTotal = 0;
        }
    };

    items.forEach(item => {
        if (item.section_name && item.section_name !== currentSection) {
            writeSectionTotalFOT();
            currentSection = item.section_name;
            sectionNum++;
            itemNum = 0;

            row++;
            ws.mergeCells(`A${row}:F${row}`);
            ws.getCell(row, 1).value = `${sectionNum} Раздел: ${currentSection}`;
            ws.getCell(row, 1).font = { bold: true };
            ws.getCell(row, 1).fill = headerFill;
            for (let c = 1; c <= 6; c++) ws.getCell(row, c).border = border;
            row++;
        }

        itemNum++;
        const qty = item.quantity || 1;
        // ФОТ = только работа, ФАКТИЧЕСКАЯ цена (без коэффициента!)
        const priceFact = item.labor_price || 0;
        const itemTotal = priceFact * qty;
        sectionTotal += itemTotal;

        // Формат ФОТ: № | Название | Кол-во | Ед.изм | Цена | Стоимость
        const rowData = [itemNum, item.name, qty, item.unit || 'м2', priceFact, itemTotal];
        rowData.forEach((val, i) => {
            const cell = ws.getCell(row, i + 1);
            cell.value = val;
            cell.border = border;
            cell.font = { size: 10 };
            cell.alignment = { vertical: 'middle', wrapText: i === 1 };
            if (i === 2 || i >= 4) {
                cell.numFmt = '#,##0.00';
                cell.alignment = { horizontal: 'right', vertical: 'middle' };
            }
        });
        row++;
    });

    writeSectionTotalFOT();

    // ===== ВСЕГО ПО ВЕДОМОСТИ =====
    row++;
    ws.getCell(row, 1).value = 'Всего по ведомости:';
    ws.mergeCells(`A${row}:E${row}`);
    ws.getCell(row, 1).font = { bold: true };
    ws.getCell(row, 6).value = grandTotal;
    ws.getCell(row, 6).numFmt = '#,##0.00';
    ws.getCell(row, 6).font = { bold: true };
    for (let c = 1; c <= 6; c++) ws.getCell(row, c).border = border;

    const filename = path.join(outputDir, `ФОТ_№${estimateNumber}.xlsx`);
    await wb.xlsx.writeFile(filename);
    console.log(`   ✅ ${path.basename(filename)}`);
    console.log(`   👷 Фонд оплаты труда: ${grandTotal.toLocaleString('ru-RU', { minimumFractionDigits: 2 })} ₽`);
}

main().catch(console.error);
