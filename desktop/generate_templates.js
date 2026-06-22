/**
 * Script to generate Excel templates for Смета, КС-2, КС-3
 * Run with: node generate_templates.js
 */

const ExcelJS = require('exceljs');
const path = require('path');

const TEMPLATES_DIR = path.join(__dirname, 'db', 'DocTemplates');

// === ШАБЛОН СМЕТЫ ===
async function createEstimateTemplate() {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ZARU Смета';

    const sheet = workbook.addWorksheet('Смета');

    // Ширина колонок
    sheet.columns = [
        { width: 5 },   // A - №
        { width: 12 },  // B - Шифр
        { width: 45 },  // C - Наименование
        { width: 8 },   // D - Ед.
        { width: 10 },  // E - Кол-во
        { width: 12 },  // F - Цена
        { width: 15 },  // G - Стоимость
    ];

    // Заголовок документа (будет заменен)
    sheet.mergeCells('A1:G1');
    sheet.getCell('A1').value = '{{TITLE}}';
    sheet.getCell('A1').font = { bold: true, size: 14 };
    sheet.getCell('A1').alignment = { horizontal: 'center' };

    sheet.mergeCells('A2:G2');
    sheet.getCell('A2').value = '{{SUBTITLE}}';
    sheet.getCell('A2').alignment = { horizontal: 'center' };

    // Заголовки таблицы
    const headerRow = sheet.getRow(4);
    headerRow.values = ['№', 'Шифр', 'Наименование работ и затрат', 'Ед.', 'Кол-во', 'Цена, руб.', 'Стоимость, руб.'];
    headerRow.font = { bold: true };
    headerRow.eachCell(cell => {
        cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        };
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFE0E0E0' }
        };
    });

    // Строка-образец для данных (будет размножена)
    const dataRow = sheet.getRow(5);
    dataRow.values = ['{{NUM}}', '{{CODE}}', '{{NAME}}', '{{UNIT}}', '{{QTY}}', '{{PRICE}}', '{{TOTAL}}'];
    dataRow.eachCell(cell => {
        cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        };
    });

    // Итоги
    sheet.mergeCells('A7:F7');
    sheet.getCell('A7').value = '{{TOTALS_SECTION}}';
    sheet.getCell('A7').font = { bold: true };

    // Подписи
    sheet.getCell('A10').value = 'Составил: _________________';
    sheet.getCell('E10').value = 'Проверил: _________________';

    const outputPath = path.join(TEMPLATES_DIR, 'Смета.xltx');
    await workbook.xlsx.writeFile(outputPath);
    console.log('Created:', outputPath);
}

// === ШАБЛОН КС-2 ===
async function createKS2Template() {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ZARU Смета';

    const sheet = workbook.addWorksheet('КС-2');

    sheet.columns = [
        { width: 5 },   // A - №
        { width: 40 },  // B - Наименование
        { width: 8 },   // C - Ед.
        { width: 12 },  // D - Выполнено
        { width: 12 },  // E - Цена
        { width: 15 },  // F - Стоимость
    ];

    // Шапка унифицированной формы
    sheet.mergeCells('A1:F1');
    sheet.getCell('A1').value = 'Унифицированная форма № КС-2';
    sheet.getCell('A1').font = { size: 9 };

    sheet.mergeCells('A3:F3');
    sheet.getCell('A3').value = 'АКТ';
    sheet.getCell('A3').font = { bold: true, size: 14 };
    sheet.getCell('A3').alignment = { horizontal: 'center' };

    sheet.mergeCells('A4:F4');
    sheet.getCell('A4').value = 'О ПРИЕМКЕ ВЫПОЛНЕННЫХ РАБОТ';
    sheet.getCell('A4').font = { bold: true, size: 12 };
    sheet.getCell('A4').alignment = { horizontal: 'center' };

    sheet.mergeCells('A5:F5');
    sheet.getCell('A5').value = '№ {{NUMBER}} от {{DATE}}';
    sheet.getCell('A5').alignment = { horizontal: 'center' };

    // Реквизиты
    sheet.getCell('A7').value = 'Заказчик: {{CLIENT}}';
    sheet.getCell('A8').value = 'Подрядчик: {{CONTRACTOR}}';
    sheet.getCell('A9').value = 'Стройка: {{PROJECT}}';
    sheet.getCell('A10').value = 'Отчетный период: {{PERIOD_FROM}} - {{PERIOD_TO}}';

    // Заголовки таблицы
    const headerRow = sheet.getRow(12);
    headerRow.values = ['№', 'Наименование работ', 'Ед.', 'Выполнено', 'Цена', 'Стоимость'];
    headerRow.font = { bold: true };
    headerRow.eachCell(cell => {
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
    });

    // Строка данных
    const dataRow = sheet.getRow(13);
    dataRow.values = ['{{NUM}}', '{{NAME}}', '{{UNIT}}', '{{QTY}}', '{{PRICE}}', '{{TOTAL}}'];
    dataRow.eachCell(cell => {
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });

    // Итого
    sheet.mergeCells('A15:E15');
    sheet.getCell('A15').value = 'ИТОГО:';
    sheet.getCell('A15').font = { bold: true };
    sheet.getCell('A15').alignment = { horizontal: 'right' };
    sheet.getCell('F15').value = '{{GRAND_TOTAL}}';
    sheet.getCell('F15').font = { bold: true };

    // Подписи
    sheet.getCell('A18').value = 'Сдал: _________________';
    sheet.getCell('D18').value = 'Принял: _________________';

    const outputPath = path.join(TEMPLATES_DIR, 'КС-2.xltx');
    await workbook.xlsx.writeFile(outputPath);
    console.log('Created:', outputPath);
}

// === ШАБЛОН КС-3 ===
async function createKS3Template() {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ZARU Смета';

    const sheet = workbook.addWorksheet('КС-3');

    sheet.columns = [
        { width: 5 },   // A - №
        { width: 40 },  // B - Наименование
        { width: 20 },  // C - Стоимость без НДС
        { width: 15 },  // D - НДС
        { width: 20 },  // E - Стоимость с НДС
    ];

    // Шапка
    sheet.mergeCells('A1:E1');
    sheet.getCell('A1').value = 'Унифицированная форма № КС-3';
    sheet.getCell('A1').font = { size: 9 };

    sheet.mergeCells('A3:E3');
    sheet.getCell('A3').value = 'СПРАВКА';
    sheet.getCell('A3').font = { bold: true, size: 14 };
    sheet.getCell('A3').alignment = { horizontal: 'center' };

    sheet.mergeCells('A4:E4');
    sheet.getCell('A4').value = 'О СТОИМОСТИ ВЫПОЛНЕННЫХ РАБОТ И ЗАТРАТ';
    sheet.getCell('A4').font = { bold: true, size: 12 };
    sheet.getCell('A4').alignment = { horizontal: 'center' };

    sheet.mergeCells('A5:E5');
    sheet.getCell('A5').value = '№ {{NUMBER}} от {{DATE}}';
    sheet.getCell('A5').alignment = { horizontal: 'center' };

    // Реквизиты
    sheet.getCell('A7').value = 'Заказчик: {{CLIENT}}';
    sheet.getCell('A8').value = 'Подрядчик: {{CONTRACTOR}}';
    sheet.getCell('A9').value = 'Стройка: {{PROJECT}}';
    sheet.getCell('A10').value = 'Отчетный период: {{PERIOD_FROM}} - {{PERIOD_TO}}';
    sheet.getCell('A11').value = 'Договор: №{{CONTRACT_NUMBER}} от {{CONTRACT_DATE}}';

    // Заголовки таблицы
    const headerRow = sheet.getRow(13);
    headerRow.values = ['№', 'Наименование', 'Стоимость без НДС', 'НДС 20%', 'Стоимость с НДС'];
    headerRow.font = { bold: true };
    headerRow.eachCell(cell => {
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
    });

    // Строка данных (основная сумма)
    const dataRow = sheet.getRow(14);
    dataRow.values = [1, 'Выполненные работы по акту КС-2', '{{AMOUNT_NO_VAT}}', '{{VAT}}', '{{AMOUNT}}'];
    dataRow.eachCell(cell => {
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });

    // Итого
    sheet.mergeCells('A16:B16');
    sheet.getCell('A16').value = 'ИТОГО:';
    sheet.getCell('A16').font = { bold: true };
    sheet.getCell('A16').alignment = { horizontal: 'right' };
    sheet.getCell('C16').value = '{{TOTAL_NO_VAT}}';
    sheet.getCell('D16').value = '{{TOTAL_VAT}}';
    sheet.getCell('E16').value = '{{GRAND_TOTAL}}';
    ['C16', 'D16', 'E16'].forEach(addr => {
        sheet.getCell(addr).font = { bold: true };
        sheet.getCell(addr).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });

    // Подписи
    sheet.getCell('A19').value = 'Заказчик: _________________';
    sheet.getCell('C19').value = 'Подрядчик: _________________';

    const outputPath = path.join(TEMPLATES_DIR, 'КС-3.xltx');
    await workbook.xlsx.writeFile(outputPath);
    console.log('Created:', outputPath);
}

// Run all
async function main() {
    console.log('Generating Excel templates...');
    await createEstimateTemplate();
    await createKS2Template();
    await createKS3Template();
    console.log('Done!');
}

main().catch(console.error);
