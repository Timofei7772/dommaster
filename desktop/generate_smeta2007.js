/**
 * Генерация документов в стиле "ZARU AI смета"
 * Двойное ценообразование: Факт (для рабочих) и ZARU AI смета (для клиента)
 */

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const os = require('os');
const ExcelJS = require('exceljs');

// Пути
const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'zaru-smeta', 'smeta_zaru.db');
const outputDir = path.join(__dirname, 'generated_documents');

// Данные подрядчика
const CONTRACTOR = {
    name: 'ООО РСК ДОММАСТЕР',
    fullName: 'ООО РСК ДОММАСТЕР',
    director: 'Тимербулатов Зинур Динар',
    directorShort: 'Тимербулатов З.Д.',
    address: 'г. Москва',
    inn: '7701234567',
    phone: '+7 (495) 123-45-67'
};

// Коэффициенты ZARU AI смета
const COEFFICIENTS = {
    work: 1.8,      // Коэффициент для стоимости работ
    material: 1.04, // Коэффициент для стоимости материалов
    vns: 0,         // ВНС %
    lni: 0,         // ЛНИ %
    other: 5        // Прочие расходы %
};

function formatDate(dateStr) {
    if (!dateStr) dateStr = new Date().toISOString().split('T')[0];
    const date = new Date(dateStr);
    return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
}

function formatNumber(num, decimals = 2) {
    return num.toLocaleString('ru-RU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// Стили для Excel
const styles = {
    header: {
        font: { bold: true, size: 14 },
        alignment: { horizontal: 'center', vertical: 'middle' }
    },
    subheader: {
        font: { bold: true, size: 11 },
        alignment: { horizontal: 'center', vertical: 'middle' }
    },
    tableHeader: {
        font: { bold: true, size: 10 },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } },
        border: {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        },
        alignment: { horizontal: 'center', vertical: 'middle', wrapText: true }
    },
    sectionHeader: {
        font: { bold: true, size: 10 },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } },
        border: {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        }
    },
    cell: {
        font: { size: 10 },
        border: {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        },
        alignment: { vertical: 'middle', wrapText: true }
    },
    totalRow: {
        font: { bold: true, size: 10 },
        border: {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        }
    },
    numberCell: {
        font: { size: 10 },
        border: {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        },
        alignment: { horizontal: 'right', vertical: 'middle' },
        numFmt: '#,##0.00'
    }
};

async function main() {
    console.log('═'.repeat(60));
    console.log('ГЕНЕРАЦИЯ ДОКУМЕНТОВ В СТИЛЕ "СМЕТА 2007"');
    console.log('═'.repeat(60));

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const SQL = await initSqlJs();
    if (!fs.existsSync(dbPath)) {
        console.error('База данных не найдена');
        return;
    }

    const buffer = fs.readFileSync(dbPath);
    const db = new SQL.Database(buffer);

    // Получаем последнюю смету
    const estimateResult = db.exec(`
        SELECT e.*, p.client_name as project_client, p.address as project_address 
        FROM estimates e 
        LEFT JOIN projects p ON e.project_id = p.id 
        ORDER BY e.id DESC LIMIT 1
    `);

    if (!estimateResult.length) {
        console.error('Сметы не найдены');
        return;
    }

    const cols = estimateResult[0].columns;
    const vals = estimateResult[0].values[0];
    const estimate = {};
    cols.forEach((c, i) => estimate[c] = vals[i]);

    // Получаем позиции сметы с разделами
    const itemsResult = db.exec(`
        SELECT ei.*, es.name as section_name, es.sort_order as section_order
        FROM estimate_items ei 
        LEFT JOIN estimate_sections es ON ei.section_id = es.id 
        WHERE ei.estimate_id = ${estimate.id} 
        ORDER BY es.sort_order, ei.sort_order
    `);

    const items = [];
    if (itemsResult.length) {
        const itemCols = itemsResult[0].columns;
        itemsResult[0].values.forEach(row => {
            const item = {};
            itemCols.forEach((c, i) => item[c] = row[i]);
            items.push(item);
        });
    }

    const clientName = estimate.client_name || estimate.project_client || 'Заказчик';
    const objectName = estimate.name || 'Ремонтно отделочные работы';
    const contractDate = formatDate();

    console.log(`\nСмета: ${objectName}`);
    console.log(`Клиент: ${clientName}`);
    console.log(`Позиций: ${items.length}`);

    // ====== 1. КОММЕРЧЕСКАЯ СМЕТА ДЛЯ КЛИЕНТА ======
    console.log('\n1. Генерация СМЕТЫ (для клиента)...');
    await generateSmeta(items, estimate, clientName, objectName, contractDate);

    // ====== 2. ВЕДОМОСТЬ ФОТ (для рабочих) ======
    console.log('\n2. Генерация ВЕДОМОСТИ ФОТ (для рабочих)...');
    await generateFOT(items, estimate, objectName, contractDate);

    // ====== 3. КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ ======
    console.log('\n3. Генерация КОММЕРЧЕСКОГО ПРЕДЛОЖЕНИЯ...');
    await generateKP(items, estimate, clientName, objectName, contractDate);

    // ====== 4. СЧЁТ НА АВАНС ======
    console.log('\n4. Генерация СЧЁТА НА АВАНС...');
    await generateInvoice(items, estimate, clientName, objectName, contractDate);

    db.close();

    console.log('\n' + '═'.repeat(60));
    console.log('✅ ВСЕ ДОКУМЕНТЫ СГЕНЕРИРОВАНЫ!');
    console.log('═'.repeat(60));
    console.log(`\nПапка: ${outputDir}`);
    fs.readdirSync(outputDir).forEach(f => console.log(`  📄 ${f}`));
}

// ====== СМЕТА (для клиента) ======
async function generateSmeta(items, estimate, clientName, objectName, contractDate) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Смета');

    // Ширина столбцов
    ws.getColumn(1).width = 5;   // № п/п
    ws.getColumn(2).width = 45;  // Наименование
    ws.getColumn(3).width = 8;   // Ед. изм.
    ws.getColumn(4).width = 10;  // Кол-во
    ws.getColumn(5).width = 12;  // Цена
    ws.getColumn(6).width = 14;  // Стоимость

    // Шапка "Утверждаю / Согласовано"
    ws.getCell('A1').value = 'Утверждаю:';
    ws.getCell('D1').value = 'Согласовано:';
    ws.getCell('D2').value = `Генеральный директор ${CONTRACTOR.name}`;
    ws.getCell('A4').value = '_______________ /';
    ws.getCell('C4').value = '/';
    ws.getCell('D4').value = `/ ${CONTRACTOR.director}`;
    ws.getCell('A5').value = contractDate;
    ws.getCell('B5').value = 'м.п.';
    ws.getCell('D5').value = contractDate;
    ws.getCell('E5').value = 'м.п.';

    // Заголовок сметы
    ws.mergeCells('A7:F7');
    ws.getCell('A7').value = `Смета № ${estimate.number || '1'}`;
    ws.getCell('A7').font = { bold: true, size: 14 };
    ws.getCell('A7').alignment = { horizontal: 'center' };

    ws.mergeCells('A8:F8');
    ws.getCell('A8').value = `на ${objectName}`;
    ws.getCell('A8').font = { bold: true, size: 12 };
    ws.getCell('A8').alignment = { horizontal: 'center' };

    // Приложение к договору
    ws.getCell('A10').value = 'Приложение № 1';
    ws.getCell('A11').value = `к Договору № _____ от ${contractDate}`;

    // Итоги справа
    let totalSmeta = 0;
    let totalWork = 0;
    let totalMaterial = 0;

    items.forEach(item => {
        const qty = item.quantity || 1;
        const laborFact = item.labor_price || 0;
        const materialFact = item.material_price || 0;
        const laborSmeta = laborFact * COEFFICIENTS.work;
        const materialSmeta = materialFact * COEFFICIENTS.material;
        totalWork += laborSmeta * qty;
        totalMaterial += materialSmeta * qty;
    });
    totalSmeta = totalWork + totalMaterial;

    ws.getCell('E10').value = 'Сметная стоимость:';
    ws.getCell('F10').value = totalSmeta;
    ws.getCell('F10').numFmt = '#,##0.00';
    ws.getCell('F10').font = { bold: true };

    ws.getCell('E11').value = 'Стоимость работы:';
    ws.getCell('F11').value = totalWork;
    ws.getCell('F11').numFmt = '#,##0.00';

    ws.getCell('A13').value = `Составлена в уровне текущих цен на ${new Date().toLocaleString('ru-RU', { month: 'long', year: 'numeric' }).charAt(0).toUpperCase() + new Date().toLocaleString('ru-RU', { month: 'long', year: 'numeric' }).slice(1)}`;
    ws.getCell('E12').value = 'Стоимость материалов:';
    ws.getCell('F12').value = totalMaterial;
    ws.getCell('F12').numFmt = '#,##0.00';

    // Шапка таблицы
    const headerRow = 15;
    const headers = ['№\nп/п', 'Наименование работ, материалов, затрат', 'Ед. изм.', 'Кол-во', 'Цена', 'Стоимость'];
    headers.forEach((h, i) => {
        const cell = ws.getCell(headerRow, i + 1);
        cell.value = h;
        Object.assign(cell, styles.tableHeader);
    });
    ws.getRow(headerRow).height = 30;

    // Номера столбцов
    for (let i = 1; i <= 6; i++) {
        const cell = ws.getCell(headerRow + 1, i);
        cell.value = i;
        Object.assign(cell, styles.tableHeader);
    }

    // Данные
    let rowNum = headerRow + 2;
    let currentSection = '';
    let sectionNum = 0;
    let itemNum = 0;
    let sectionTotal = 0;

    const addSectionTotal = () => {
        if (sectionTotal > 0) {
            ws.getCell(rowNum, 1).value = 'Итого по разделу';
            ws.mergeCells(`A${rowNum}:E${rowNum}`);
            ws.getCell(rowNum, 6).value = sectionTotal;
            ws.getCell(rowNum, 6).numFmt = '#,##0.00';
            ws.getCell(rowNum, 6).font = { bold: true };
            rowNum++;
            sectionTotal = 0;
        }
    };

    items.forEach(item => {
        // Новый раздел
        if (item.section_name && item.section_name !== currentSection) {
            addSectionTotal();
            currentSection = item.section_name;
            sectionNum++;
            itemNum = 0;

            ws.mergeCells(`A${rowNum}:F${rowNum}`);
            ws.getCell(rowNum, 1).value = `${sectionNum} Раздел: ${currentSection}`;
            Object.assign(ws.getCell(rowNum, 1), styles.sectionHeader);
            rowNum++;
        }

        // Позиция
        itemNum++;
        const qty = item.quantity || 1;
        const laborFact = item.labor_price || 0;
        const materialFact = item.material_price || 0;
        const priceFact = laborFact + materialFact;
        const priceSmeta = (laborFact * COEFFICIENTS.work) + (materialFact * COEFFICIENTS.material);
        const totalItem = priceSmeta * qty;
        sectionTotal += totalItem;

        const rowData = [itemNum, item.name, item.unit || 'шт.', qty, priceSmeta, totalItem];
        rowData.forEach((val, i) => {
            const cell = ws.getCell(rowNum, i + 1);
            cell.value = val;
            Object.assign(cell, styles.cell);
            if (i >= 3) {
                cell.numFmt = '#,##0.00';
                cell.alignment = { horizontal: 'right', vertical: 'middle' };
            }
        });
        rowNum++;
    });

    addSectionTotal();

    // Итого по разделам
    rowNum++;
    ws.getCell(rowNum, 1).value = 'Итого по разделам';
    ws.mergeCells(`A${rowNum}:E${rowNum}`);
    ws.getCell(rowNum, 1).font = { bold: true };
    ws.getCell(rowNum, 6).value = totalSmeta;
    ws.getCell(rowNum, 6).numFmt = '#,##0.00';
    ws.getCell(rowNum, 6).font = { bold: true };
    rowNum++;

    // НДС
    rowNum++;
    ws.getCell(rowNum, 1).value = 'НДС:';
    ws.mergeCells(`A${rowNum}:E${rowNum}`);
    ws.getCell(rowNum, 6).value = 'не облагается';
    rowNum++;

    // Всего по смете
    ws.getCell(rowNum, 1).value = 'Всего по смете';
    ws.mergeCells(`A${rowNum}:E${rowNum}`);
    ws.getCell(rowNum, 1).font = { bold: true };
    ws.getCell(rowNum, 6).value = totalSmeta;
    ws.getCell(rowNum, 6).numFmt = '#,##0.00';
    ws.getCell(rowNum, 6).font = { bold: true };
    rowNum += 3;

    // Подписи
    ws.getCell(rowNum, 2).value = 'Составил: _________________________ / _____________________________ /';
    rowNum += 3;
    ws.getCell(rowNum, 2).value = 'Проверил: _________________________ / _____________________________ /';

    const filename = path.join(outputDir, `Смета_${estimate.number || '1'}_${clientName.split(' ')[0]}.xlsx`);
    await wb.xlsx.writeFile(filename);
    console.log(`   ✓ ${path.basename(filename)}`);
    console.log(`   Сметная стоимость: ${formatNumber(totalSmeta)} ₽`);
}

// ====== ВЕДОМОСТЬ ФОТ (для рабочих) ======
async function generateFOT(items, estimate, objectName, contractDate) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('ФОТ');

    ws.getColumn(1).width = 5;
    ws.getColumn(2).width = 50;
    ws.getColumn(3).width = 10;
    ws.getColumn(4).width = 10;
    ws.getColumn(5).width = 12;
    ws.getColumn(6).width = 14;

    // Шапка
    ws.getCell('A1').value = 'Утверждаю:';
    ws.getCell('A3').value = '_______________ /';
    ws.getCell('C3').value = '/';
    ws.getCell('A5').value = contractDate;

    // Заголовок
    ws.mergeCells('A7:F7');
    ws.getCell('A7').value = `Ведомость № ${estimate.number || '1'}`;
    ws.getCell('A7').font = { bold: true, size: 14 };
    ws.getCell('A7').alignment = { horizontal: 'center' };

    ws.mergeCells('A8:F8');
    ws.getCell('A8').value = 'Фонд оплаты труда по объекту';
    ws.getCell('A8').font = { bold: true, size: 16 };
    ws.getCell('A8').alignment = { horizontal: 'center' };

    ws.mergeCells('A9:F9');
    ws.getCell('A9').value = objectName;
    ws.getCell('A9').font = { bold: true, size: 12 };
    ws.getCell('A9').alignment = { horizontal: 'center' };

    ws.getCell('A11').value = 'Производитель работ: Иванов И.И.';

    // Шапка таблицы
    const headerRow = 13;
    const headers = ['№\nп/п', 'Наименование работ', 'Кол-во', 'Ед. изм.', 'Цена', 'Стоимость'];
    headers.forEach((h, i) => {
        const cell = ws.getCell(headerRow, i + 1);
        cell.value = h;
        Object.assign(cell, styles.tableHeader);
    });
    ws.getRow(headerRow).height = 30;

    for (let i = 1; i <= 6; i++) {
        const cell = ws.getCell(headerRow + 1, i);
        cell.value = i;
        Object.assign(cell, styles.tableHeader);
    }

    // Данные (ФАКТИЧЕСКИЕ цены для рабочих)
    let rowNum = headerRow + 2;
    let currentSection = '';
    let sectionNum = 0;
    let itemNum = 0;
    let sectionTotal = 0;
    let grandTotal = 0;

    const addSectionTotalFOT = () => {
        if (sectionTotal > 0) {
            ws.getCell(rowNum, 1).value = 'Итого по разделу:';
            ws.mergeCells(`A${rowNum}:E${rowNum}`);
            ws.getCell(rowNum, 1).font = { bold: true };
            ws.getCell(rowNum, 6).value = sectionTotal;
            ws.getCell(rowNum, 6).numFmt = '#,##0.00';
            ws.getCell(rowNum, 6).font = { bold: true };
            rowNum++;
            grandTotal += sectionTotal;
            sectionTotal = 0;
        }
    };

    items.forEach(item => {
        if (item.section_name && item.section_name !== currentSection) {
            addSectionTotalFOT();
            currentSection = item.section_name;
            sectionNum++;
            itemNum = 0;

            ws.mergeCells(`A${rowNum}:F${rowNum}`);
            ws.getCell(rowNum, 1).value = `${sectionNum} Раздел: ${currentSection}`;
            Object.assign(ws.getCell(rowNum, 1), styles.sectionHeader);
            rowNum++;
        }

        itemNum++;
        const qty = item.quantity || 1;
        const priceFact = (item.labor_price || 0); // Только работа для ФОТ
        const totalItem = priceFact * qty;
        sectionTotal += totalItem;

        // Формат: № | Название | Кол-во | Ед.изм | Цена | Стоимость
        const rowData = [itemNum, item.name, qty, item.unit || 'шт.', priceFact, totalItem];
        rowData.forEach((val, i) => {
            const cell = ws.getCell(rowNum, i + 1);
            cell.value = val;
            Object.assign(cell, styles.cell);
            if (i >= 2 && i !== 3) {
                cell.numFmt = '#,##0.00';
                cell.alignment = { horizontal: 'right', vertical: 'middle' };
            }
        });
        rowNum++;
    });

    addSectionTotalFOT();

    // Всего по ведомости
    rowNum++;
    ws.getCell(rowNum, 1).value = 'Всего по ведомости:';
    ws.mergeCells(`A${rowNum}:E${rowNum}`);
    ws.getCell(rowNum, 1).font = { bold: true };
    ws.getCell(rowNum, 6).value = grandTotal;
    ws.getCell(rowNum, 6).numFmt = '#,##0.00';
    ws.getCell(rowNum, 6).font = { bold: true };

    const filename = path.join(outputDir, `ФОТ_${estimate.number || '1'}.xlsx`);
    await wb.xlsx.writeFile(filename);
    console.log(`   ✓ ${path.basename(filename)}`);
    console.log(`   Фонд оплаты труда: ${formatNumber(grandTotal)} ₽`);
}

// ====== КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ ======
async function generateKP(items, estimate, clientName, objectName, contractDate) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('КП');

    ws.getColumn(1).width = 5;
    ws.getColumn(2).width = 45;
    ws.getColumn(3).width = 8;
    ws.getColumn(4).width = 10;
    ws.getColumn(5).width = 12;
    ws.getColumn(6).width = 14;

    // Шапка компании
    ws.mergeCells('A1:F1');
    ws.getCell('A1').value = CONTRACTOR.name;
    ws.getCell('A1').font = { bold: true, size: 14 };
    ws.getCell('A1').alignment = { horizontal: 'center' };

    ws.mergeCells('A2:F2');
    ws.getCell('A2').value = `Тел.: ${CONTRACTOR.phone}`;
    ws.getCell('A2').alignment = { horizontal: 'center' };

    // Заголовок
    ws.mergeCells('A4:F4');
    ws.getCell('A4').value = 'КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ';
    ws.getCell('A4').font = { bold: true, size: 16 };
    ws.getCell('A4').alignment = { horizontal: 'center' };

    ws.mergeCells('A5:F5');
    ws.getCell('A5').value = `№ КП-${estimate.number || '001'} от ${contractDate}`;
    ws.getCell('A5').alignment = { horizontal: 'center' };

    ws.getCell('A7').value = `Уважаемый(ая) ${clientName},`;
    ws.mergeCells('A8:F8');
    ws.getCell('A8').value = `Предлагаем Вам выполнение работ: ${objectName}`;
    ws.getCell('A8').alignment = { wrapText: true };

    // Таблица
    const headerRow = 10;
    const headers = ['№', 'Наименование работ', 'Ед.', 'Кол-во', 'Цена', 'Сумма'];
    headers.forEach((h, i) => {
        const cell = ws.getCell(headerRow, i + 1);
        cell.value = h;
        Object.assign(cell, styles.tableHeader);
    });

    let rowNum = headerRow + 1;
    let num = 0;
    let total = 0;

    items.forEach(item => {
        num++;
        const qty = item.quantity || 1;
        const laborFact = item.labor_price || 0;
        const materialFact = item.material_price || 0;
        const priceSmeta = (laborFact * COEFFICIENTS.work) + (materialFact * COEFFICIENTS.material);
        const itemTotal = priceSmeta * qty;
        total += itemTotal;

        const rowData = [num, item.name, item.unit || 'шт.', qty, priceSmeta, itemTotal];
        rowData.forEach((val, i) => {
            const cell = ws.getCell(rowNum, i + 1);
            cell.value = val;
            Object.assign(cell, styles.cell);
            if (i >= 3) {
                cell.numFmt = '#,##0.00';
                cell.alignment = { horizontal: 'right', vertical: 'middle' };
            }
        });
        rowNum++;
    });

    // Итого
    rowNum++;
    ws.mergeCells(`A${rowNum}:E${rowNum}`);
    ws.getCell(rowNum, 1).value = 'ИТОГО:';
    ws.getCell(rowNum, 1).font = { bold: true };
    ws.getCell(rowNum, 1).alignment = { horizontal: 'right' };
    ws.getCell(rowNum, 6).value = total;
    ws.getCell(rowNum, 6).numFmt = '#,##0.00';
    ws.getCell(rowNum, 6).font = { bold: true };

    rowNum += 2;
    ws.getCell(rowNum, 1).value = 'Срок выполнения работ: 30-45 рабочих дней';
    rowNum++;
    ws.getCell(rowNum, 1).value = 'Гарантия на выполненные работы: 12 месяцев';
    rowNum++;
    ws.getCell(rowNum, 1).value = 'Срок действия предложения согласовывается отдельно';

    rowNum += 2;
    ws.getCell(rowNum, 1).value = `С уважением, ${CONTRACTOR.directorShort}`;
    ws.getCell(rowNum, 1).font = { bold: true };

    const filename = path.join(outputDir, `КП_${estimate.number || '001'}_${clientName.split(' ')[0]}.xlsx`);
    await wb.xlsx.writeFile(filename);
    console.log(`   ✓ ${path.basename(filename)}`);
    console.log(`   Сумма КП: ${formatNumber(total)} ₽`);
}

// ====== СЧЁТ НА АВАНС ======
async function generateInvoice(items, estimate, clientName, objectName, contractDate) {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Счёт');

    ws.getColumn(1).width = 5;
    ws.getColumn(2).width = 50;
    ws.getColumn(3).width = 10;
    ws.getColumn(4).width = 10;
    ws.getColumn(5).width = 14;
    ws.getColumn(6).width = 14;

    // Реквизиты
    ws.mergeCells('A1:F1');
    ws.getCell('A1').value = CONTRACTOR.fullName;
    ws.getCell('A1').font = { bold: true, size: 12 };

    ws.getCell('A2').value = `ИНН: ${CONTRACTOR.inn}`;
    ws.getCell('A3').value = `Адрес: ${CONTRACTOR.address}`;
    ws.getCell('A4').value = `Тел.: ${CONTRACTOR.phone}`;

    // Заголовок счёта
    ws.mergeCells('A6:F6');
    ws.getCell('A6').value = `СЧЁТ № ${estimate.number || '1'}-А от ${contractDate}`;
    ws.getCell('A6').font = { bold: true, size: 14 };
    ws.getCell('A6').alignment = { horizontal: 'center' };

    ws.getCell('A8').value = `Заказчик: ${clientName}`;
    ws.getCell('A9').value = `Основание: Договор № ${estimate.number || 'б/н'} от ${contractDate}`;

    // Расчёт суммы
    let totalSmeta = 0;
    items.forEach(item => {
        const qty = item.quantity || 1;
        const laborFact = item.labor_price || 0;
        const materialFact = item.material_price || 0;
        const priceSmeta = (laborFact * COEFFICIENTS.work) + (materialFact * COEFFICIENTS.material);
        totalSmeta += priceSmeta * qty;
    });
    const prepayment = totalSmeta * 0.3;

    // Таблица
    const headerRow = 11;
    const headers = ['№', 'Наименование', 'Ед.', 'Кол-во', 'Цена', 'Сумма'];
    headers.forEach((h, i) => {
        const cell = ws.getCell(headerRow, i + 1);
        cell.value = h;
        Object.assign(cell, styles.tableHeader);
    });

    const rowData = [1, `Аванс 30% по договору за ${objectName}`, 'услуга', 1, prepayment, prepayment];
    rowData.forEach((val, i) => {
        const cell = ws.getCell(headerRow + 1, i + 1);
        cell.value = val;
        Object.assign(cell, styles.cell);
        if (i >= 4) {
            cell.numFmt = '#,##0.00';
            cell.alignment = { horizontal: 'right', vertical: 'middle' };
        }
    });

    // Итого
    let rowNum = headerRow + 3;
    ws.mergeCells(`A${rowNum}:E${rowNum}`);
    ws.getCell(rowNum, 1).value = 'Итого:';
    ws.getCell(rowNum, 1).alignment = { horizontal: 'right' };
    ws.getCell(rowNum, 6).value = prepayment;
    ws.getCell(rowNum, 6).numFmt = '#,##0.00';

    rowNum++;
    ws.mergeCells(`A${rowNum}:E${rowNum}`);
    ws.getCell(rowNum, 1).value = 'Без НДС';
    ws.getCell(rowNum, 1).alignment = { horizontal: 'right' };

    rowNum++;
    ws.mergeCells(`A${rowNum}:E${rowNum}`);
    ws.getCell(rowNum, 1).value = 'Всего к оплате:';
    ws.getCell(rowNum, 1).font = { bold: true };
    ws.getCell(rowNum, 1).alignment = { horizontal: 'right' };
    ws.getCell(rowNum, 6).value = prepayment;
    ws.getCell(rowNum, 6).numFmt = '#,##0.00';
    ws.getCell(rowNum, 6).font = { bold: true };

    rowNum += 2;
    ws.getCell(rowNum, 1).value = `Директор _________________ / ${CONTRACTOR.directorShort} /`;

    const filename = path.join(outputDir, `Счёт_аванс_${estimate.number || '1'}.xlsx`);
    await wb.xlsx.writeFile(filename);
    console.log(`   ✓ ${path.basename(filename)}`);
    console.log(`   Аванс 30%: ${formatNumber(prepayment)} ₽`);
}

main().catch(console.error);
