/**
 * Генерация полного комплекта документов для сметы
 * Запуск: node generate_documents.js
 */

const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const os = require('os');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const ExcelJS = require('exceljs');

// Пути
const dbPath = path.join(os.homedir(), 'AppData', 'Roaming', 'zaru-smeta', 'smeta_zaru.db');
const templatesPath = path.join(__dirname, '..', 'документы для сметы');
const outputDir = path.join(__dirname, 'generated_documents');

// Данные подрядчика
const CONTRACTOR = {
    name: 'ООО "СтройМастер"',
    fullName: 'Общество с ограниченной ответственностью "СтройМастер"',
    address: 'г. Москва, ул. Строителей, д. 10, офис 205',
    inn: '7701234567',
    kpp: '770101001',
    ogrn: '1027700123456',
    bank: 'ПАО Сбербанк',
    rs: '40702810938000012345',
    ks: '30101810400000000225',
    bik: '044525225',
    director: 'Петров Алексей Владимирович',
    directorShort: 'Петров А.В.',
    phone: '+7 (495) 123-45-67',
    email: 'info@stroymaster.ru'
};

// Форматирование даты
function formatDate(dateStr) {
    if (!dateStr) dateStr = new Date().toISOString().split('T')[0];
    const date = new Date(dateStr);
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
        'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()} г.`;
}

function formatDateShort(dateStr) {
    if (!dateStr) dateStr = new Date().toISOString().split('T')[0];
    const date = new Date(dateStr);
    return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}.${date.getFullYear()}`;
}

// Сумма прописью
function numberToWords(num) {
    const units = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
    const teens = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
    const tens = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
    const hundreds = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];
    
    const millions = Math.floor(num / 1000000) % 1000;
    const thousands = Math.floor(num / 1000) % 1000;
    const rest = Math.floor(num) % 1000;
    const kopPart = Math.round((num - Math.floor(num)) * 100);
    
    let result = '';
    
    // Миллионы
    if (millions > 0) {
        if (millions >= 100) result += hundreds[Math.floor(millions / 100)] + ' ';
        const m10 = millions % 100;
        if (m10 >= 10 && m10 < 20) {
            result += teens[m10 - 10] + ' ';
        } else {
            if (m10 >= 20) result += tens[Math.floor(m10 / 10)] + ' ';
            if (m10 % 10 > 0) result += units[m10 % 10] + ' ';
        }
        const lastOne = millions % 10;
        const lastTwo = millions % 100;
        if (lastTwo >= 11 && lastTwo <= 19) result += 'миллионов ';
        else if (lastOne === 1) result += 'миллион ';
        else if (lastOne >= 2 && lastOne <= 4) result += 'миллиона ';
        else result += 'миллионов ';
    }
    
    // Тысячи
    if (thousands > 0) {
        if (thousands >= 100) result += hundreds[Math.floor(thousands / 100)] + ' ';
        const t10 = thousands % 100;
        if (t10 >= 10 && t10 < 20) {
            result += teens[t10 - 10] + ' ';
        } else {
            if (t10 >= 20) result += tens[Math.floor(t10 / 10)] + ' ';
            const t1 = t10 % 10;
            if (t1 === 1) result += 'одна ';
            else if (t1 === 2) result += 'две ';
            else if (t1 > 0) result += units[t1] + ' ';
        }
        const lastOne = thousands % 10;
        const lastTwo = thousands % 100;
        if (lastTwo >= 11 && lastTwo <= 19) result += 'тысяч ';
        else if (lastOne === 1) result += 'тысяча ';
        else if (lastOne >= 2 && lastOne <= 4) result += 'тысячи ';
        else result += 'тысяч ';
    }
    
    // Сотни/десятки/единицы
    if (rest > 0 || (millions === 0 && thousands === 0)) {
        if (rest >= 100) result += hundreds[Math.floor(rest / 100)] + ' ';
        const r10 = rest % 100;
        if (r10 >= 10 && r10 < 20) {
            result += teens[r10 - 10] + ' ';
        } else {
            if (r10 >= 20) result += tens[Math.floor(r10 / 10)] + ' ';
            if (r10 % 10 > 0) result += units[r10 % 10] + ' ';
        }
    }
    
    // Рубли
    const rubLastTwo = Math.floor(num) % 100;
    const rubLastOne = Math.floor(num) % 10;
    if (rubLastTwo >= 11 && rubLastTwo <= 19) result += 'рублей';
    else if (rubLastOne === 1) result += 'рубль';
    else if (rubLastOne >= 2 && rubLastOne <= 4) result += 'рубля';
    else result += 'рублей';
    
    // Копейки
    result += ' ' + String(kopPart).padStart(2, '0') + ' коп.';
    
    return result.trim();
}

function formatNumber(num) {
    return num.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Генерация Word документа
function generateWordDoc(templateFile, data, outputFile) {
    const templatePath = path.join(templatesPath, templateFile);
    if (!fs.existsSync(templatePath)) {
        console.log(`   ⚠ Шаблон не найден: ${templateFile}`);
        return null;
    }
    
    const content = fs.readFileSync(templatePath, 'binary');
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: '{{', end: '}}' }
    });
    
    try {
        doc.render(data);
    } catch (error) {
        console.error(`   ⚠ Ошибка заполнения: ${error.message}`);
        return null;
    }
    
    const buf = doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
    fs.writeFileSync(outputFile, buf);
    return outputFile;
}

async function main() {
    console.log('═'.repeat(60));
    console.log('ГЕНЕРАЦИЯ ДОКУМЕНТОВ ДЛЯ СМЕТЫ');
    console.log('═'.repeat(60));
    
    // Создаём папку для документов
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Загружаем базу данных
    const SQL = await initSqlJs();
    if (!fs.existsSync(dbPath)) {
        console.error('База данных не найдена. Сначала запустите create_demo_estimate.js');
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
    
    if (!estimateResult.length || !estimateResult[0].values.length) {
        console.error('Сметы не найдены');
        return;
    }
    
    const cols = estimateResult[0].columns;
    const vals = estimateResult[0].values[0];
    const estimate = {};
    cols.forEach((c, i) => estimate[c] = vals[i]);
    
    console.log(`\nСмета: ${estimate.name}`);
    console.log(`Номер: ${estimate.number}`);
    console.log(`Клиент: ${estimate.client_name || estimate.project_client}`);
    console.log(`Адрес: ${estimate.address || estimate.project_address}`);
    
    // Получаем позиции сметы
    const itemsResult = db.exec(`
        SELECT ei.*, es.name as section_name 
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
    
    // Расчёт итогов
    let totalMaterials = 0;
    let totalLabor = 0;
    
    // Получаем коэффициенты для смет
    const coefficientsResult = db.exec("SELECT * FROM coefficients WHERE estimate_id = ?", [estimate.id]);
    const coef = coefficientsResult.length && coefficientsResult[0].values.length > 0
        ? (() => {
            const cols = coefficientsResult[0].columns;
            const row = coefficientsResult[0].values[0];
            return {
                material_coef: row[cols.indexOf('material_coef')] || 1.04,
                work_coef: row[cols.indexOf('work_coef')] || 1.8
            };
        })()
        : { material_coef: 1.04, work_coef: 1.8 };
    
    // ИСПРАВКА: считаем материалы и работы с коэффициентами!
    items.forEach(item => {
        if (item.row_type === 'comment') return;
        
        const qty = item.quantity || 1;
        const matPrice = item.material_price || 0;
        const labPrice = item.labor_price || 0;
        
        // Применяем коэффициенты
        if (item.row_type === 'material' || item.row_type === 'mechanism') {
            // Для материалов: только коэффициент на материалы
            totalMaterials += matPrice * qty * coef.material_coef;
            totalLabor += labPrice * qty;
        } else {
            // Для расценок: оба коэффициента
            totalMaterials += matPrice * qty * coef.material_coef;
            totalLabor += labPrice * qty * coef.work_coef;
        }
    });
    
    const subtotal = totalMaterials + totalLabor;
    const overhead = subtotal * (estimate.overhead_percent || 15) / 100;
    const profit = subtotal * (estimate.profit_percent || 10) / 100;
    const totalBeforeVAT = subtotal + overhead + profit;
    const vat = totalBeforeVAT * (estimate.vat_percent || 20) / 100;
    const grandTotal = totalBeforeVAT + vat;
    const prepayment = grandTotal * 0.3;
    
    const clientName = estimate.client_name || estimate.project_client || 'Заказчик';
    const clientAddress = estimate.address || estimate.project_address || '';
    const contractDate = new Date().toISOString().split('T')[0];
    
    console.log(`\nИтого: ${formatNumber(grandTotal)} ₽`);
    console.log('\n' + '─'.repeat(60));
    
    // ====== 1. КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ ======
    console.log('\n1. Коммерческое предложение...');
    
    const kpItems = [];
    let currentSection = '';
    items.forEach((item, idx) => {
        if (item.section_name && item.section_name !== currentSection) {
            currentSection = item.section_name;
        }
        const itemTotal = ((item.material_price || 0) + (item.labor_price || 0)) * (item.quantity || 1);
        kpItems.push({
            num: idx + 1,
            name: item.name,
            unit: item.unit || 'шт.',
            qty: item.quantity || 1,
            price: formatNumber((item.material_price || 0) + (item.labor_price || 0)),
            total: formatNumber(itemTotal)
        });
    });
    
    const kpData = {
        date: formatDate(contractDate),
        dateShort: formatDateShort(contractDate),
        number: 'КП-' + (estimate.number || '001'),
        clientName: clientName,
        clientAddress: clientAddress,
        object: estimate.name,
        contractorName: CONTRACTOR.name,
        contractorFullName: CONTRACTOR.fullName,
        contractorAddress: CONTRACTOR.address,
        contractorPhone: CONTRACTOR.phone,
        contractorEmail: CONTRACTOR.email,
        contractorINN: CONTRACTOR.inn,
        contractorKPP: CONTRACTOR.kpp,
        contractorOGRN: CONTRACTOR.ogrn,
        contractorBank: CONTRACTOR.bank,
        contractorRS: CONTRACTOR.rs,
        contractorKS: CONTRACTOR.ks,
        contractorBIK: CONTRACTOR.bik,
        director: CONTRACTOR.directorShort,
        items: kpItems,
        subtotal: formatNumber(subtotal),
        overhead: formatNumber(overhead),
        profit: formatNumber(profit),
        totalBeforeVAT: formatNumber(totalBeforeVAT),
        vat: formatNumber(vat),
        total: formatNumber(grandTotal),
        totalWords: numberToWords(grandTotal),
        validity: '14 календарных дней'
    };
    
    const kpFile = generateWordDoc(
        'DocTemplates/Коммерческое предложение.dotx',
        kpData,
        path.join(outputDir, `КП_${estimate.number || 'б-н'}_${clientName.split(' ')[0]}.docx`)
    );
    if (kpFile) console.log(`   ✓ ${path.basename(kpFile)}`);
    
    // ====== 2. ДОГОВОР ПОДРЯДА ======
    console.log('\n2. Договор подряда...');
    
    const contractData = {
        number: estimate.number || 'ДП-001',
        date: formatDate(contractDate),
        dateShort: formatDateShort(contractDate),
        // Заказчик
        clientName: clientName,
        clientFullName: clientName,
        clientAddress: clientAddress,
        clientPassport: 'серия ____ номер _______, выдан ____________',
        clientPhone: '+7 (___) ___-__-__',
        // Подрядчик
        contractorName: CONTRACTOR.name,
        contractorFullName: CONTRACTOR.fullName,
        contractorAddress: CONTRACTOR.address,
        contractorINN: CONTRACTOR.inn,
        contractorKPP: CONTRACTOR.kpp,
        contractorOGRN: CONTRACTOR.ogrn,
        contractorBank: CONTRACTOR.bank,
        contractorRS: CONTRACTOR.rs,
        contractorKS: CONTRACTOR.ks,
        contractorBIK: CONTRACTOR.bik,
        director: CONTRACTOR.director,
        directorShort: CONTRACTOR.directorShort,
        // Предмет
        object: estimate.name,
        objectAddress: clientAddress,
        workDescription: 'Выполнение ремонтно-отделочных работ согласно приложенной смете',
        // Сроки
        startDate: formatDate(contractDate),
        duration: '45 (сорок пять) рабочих дней',
        endDate: formatDate(new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]),
        // Стоимость
        total: formatNumber(grandTotal),
        totalWords: numberToWords(grandTotal),
        prepaymentPercent: '30',
        prepayment: formatNumber(prepayment),
        prepaymentWords: numberToWords(prepayment),
        finalPayment: formatNumber(grandTotal - prepayment),
        finalPaymentWords: numberToWords(grandTotal - prepayment),
        // Гарантии
        warrantyPeriod: '12 (двенадцать) месяцев'
    };
    
    const contractFile = generateWordDoc(
        'Договор подряда (заказчик - физ. лицо).dotx',
        contractData,
        path.join(outputDir, `Договор_${estimate.number || 'б-н'}_${clientName.split(' ')[0]}.docx`)
    );
    if (contractFile) console.log(`   ✓ ${path.basename(contractFile)}`);
    
    // ====== 3. СМЕТА (Excel) ======
    console.log('\n3. Локальная смета...');
    
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Смета');
    
    // Заголовок
    sheet.mergeCells('A1:H1');
    sheet.getCell('A1').value = `ЛОКАЛЬНАЯ СМЕТА №${estimate.number || 'б/н'}`;
    sheet.getCell('A1').font = { bold: true, size: 14 };
    sheet.getCell('A1').alignment = { horizontal: 'center' };
    
    sheet.mergeCells('A2:H2');
    sheet.getCell('A2').value = estimate.name;
    sheet.getCell('A2').font = { bold: true, size: 12 };
    sheet.getCell('A2').alignment = { horizontal: 'center' };
    
    sheet.mergeCells('A3:H3');
    sheet.getCell('A3').value = `Заказчик: ${clientName}`;
    sheet.getCell('A3').alignment = { horizontal: 'left' };
    
    sheet.mergeCells('A4:H4');
    sheet.getCell('A4').value = `Адрес: ${clientAddress}`;
    sheet.getCell('A4').alignment = { horizontal: 'left' };
    
    // Шапка таблицы
    const headerRow = 6;
    const headers = ['№', 'Наименование работ', 'Ед.', 'Кол-во', 'Материалы, ₽', 'Работа, ₽', 'Всего, ₽'];
    headers.forEach((h, i) => {
        const cell = sheet.getCell(headerRow, i + 1);
        cell.value = h;
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
        cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    
    // Ширина столбцов
    sheet.getColumn(1).width = 5;
    sheet.getColumn(2).width = 45;
    sheet.getColumn(3).width = 8;
    sheet.getColumn(4).width = 10;
    sheet.getColumn(5).width = 14;
    sheet.getColumn(6).width = 14;
    sheet.getColumn(7).width = 14;
    
    // Данные
    let rowNum = headerRow + 1;
    let currentSectionName = '';
    let num = 0;
    
    items.forEach(item => {
        // Раздел
        if (item.section_name && item.section_name !== currentSectionName) {
            currentSectionName = item.section_name;
            sheet.mergeCells(`A${rowNum}:G${rowNum}`);
            const sectionCell = sheet.getCell(rowNum, 1);
            sectionCell.value = currentSectionName;
            sectionCell.font = { bold: true };
            sectionCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
            for (let c = 1; c <= 7; c++) {
                sheet.getCell(rowNum, c).border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            }
            rowNum++;
        }
        
        // Позиция
        num++;
        const qty = item.quantity || 1;
        const matPrice = item.material_price || 0;
        const labPrice = item.labor_price || 0;
        const matTotal = matPrice * qty;
        const labTotal = labPrice * qty;
        const itemTotal = matTotal + labTotal;
        
        const rowData = [num, item.name, item.unit || 'шт.', qty, matTotal, labTotal, itemTotal];
        rowData.forEach((val, i) => {
            const cell = sheet.getCell(rowNum, i + 1);
            cell.value = val;
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
            if (i >= 3) {
                cell.numFmt = '#,##0.00';
                cell.alignment = { horizontal: 'right' };
            }
        });
        rowNum++;
    });
    
    // Итоги
    rowNum++;
    const addTotalRow = (label, value, bold = false) => {
        sheet.mergeCells(`A${rowNum}:F${rowNum}`);
        sheet.getCell(rowNum, 1).value = label;
        sheet.getCell(rowNum, 1).alignment = { horizontal: 'right' };
        if (bold) sheet.getCell(rowNum, 1).font = { bold: true };
        sheet.getCell(rowNum, 7).value = value;
        sheet.getCell(rowNum, 7).numFmt = '#,##0.00';
        sheet.getCell(rowNum, 7).alignment = { horizontal: 'right' };
        if (bold) {
            sheet.getCell(rowNum, 7).font = { bold: true };
            sheet.getCell(rowNum, 7).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
        }
        rowNum++;
    };
    
    addTotalRow('Итого материалы:', totalMaterials);
    addTotalRow('Итого работы:', totalLabor);
    addTotalRow('Итого:', subtotal);
    addTotalRow(`Накладные расходы (${estimate.overhead_percent || 15}%):`, overhead);
    addTotalRow(`Сметная прибыль (${estimate.profit_percent || 10}%):`, profit);
    addTotalRow('Итого без НДС:', totalBeforeVAT);
    addTotalRow(`НДС (${estimate.vat_percent || 20}%):`, vat);
    addTotalRow('ВСЕГО С НДС:', grandTotal, true);
    
    rowNum += 2;
    sheet.getCell(rowNum, 1).value = `Составил: _________________ / ${CONTRACTOR.directorShort} /`;
    rowNum++;
    sheet.getCell(rowNum, 1).value = `Дата: ${formatDateShort(contractDate)}`;
    
    const smetaFile = path.join(outputDir, `Смета_${estimate.number || 'б-н'}_${clientName.split(' ')[0]}.xlsx`);
    await workbook.xlsx.writeFile(smetaFile);
    console.log(`   ✓ ${path.basename(smetaFile)}`);
    
    // ====== 4. ВЕДОМОСТЬ МАТЕРИАЛОВ М-29 ======
    console.log('\n4. Ведомость материалов М-29...');
    
    const m29Workbook = new ExcelJS.Workbook();
    const m29Sheet = m29Workbook.addWorksheet('М-29');
    
    m29Sheet.mergeCells('A1:G1');
    m29Sheet.getCell('A1').value = 'ВЕДОМОСТЬ РАСХОДА МАТЕРИАЛОВ (М-29)';
    m29Sheet.getCell('A1').font = { bold: true, size: 14 };
    m29Sheet.getCell('A1').alignment = { horizontal: 'center' };
    
    m29Sheet.mergeCells('A2:G2');
    m29Sheet.getCell('A2').value = `Объект: ${estimate.name}`;
    
    m29Sheet.mergeCells('A3:G3');
    m29Sheet.getCell('A3').value = `Адрес: ${clientAddress}`;
    
    // Заголовки М-29
    const m29Headers = ['№', 'Наименование материала', 'Ед.', 'Кол-во', 'Цена, ₽', 'Сумма, ₽', 'Примечание'];
    m29Headers.forEach((h, i) => {
        const cell = m29Sheet.getCell(5, i + 1);
        cell.value = h;
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    
    m29Sheet.getColumn(1).width = 5;
    m29Sheet.getColumn(2).width = 40;
    m29Sheet.getColumn(3).width = 8;
    m29Sheet.getColumn(4).width = 10;
    m29Sheet.getColumn(5).width = 12;
    m29Sheet.getColumn(6).width = 14;
    m29Sheet.getColumn(7).width = 15;
    
    // Материалы (выбираем позиции с материалами)
    let m29Row = 6;
    let m29Num = 0;
    let m29Total = 0;
    
    items.filter(i => (i.material_price || 0) > 0).forEach(item => {
        m29Num++;
        const qty = item.quantity || 1;
        const price = item.material_price || 0;
        const total = price * qty;
        m29Total += total;
        
        const rowData = [m29Num, `Материалы для: ${item.name}`, item.unit || 'компл.', qty, price, total, ''];
        rowData.forEach((val, i) => {
            const cell = m29Sheet.getCell(m29Row, i + 1);
            cell.value = val;
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            if (i >= 3) {
                cell.numFmt = '#,##0.00';
                cell.alignment = { horizontal: 'right' };
            }
        });
        m29Row++;
    });
    
    // Итого
    m29Row++;
    m29Sheet.mergeCells(`A${m29Row}:E${m29Row}`);
    m29Sheet.getCell(m29Row, 1).value = 'ИТОГО:';
    m29Sheet.getCell(m29Row, 1).font = { bold: true };
    m29Sheet.getCell(m29Row, 1).alignment = { horizontal: 'right' };
    m29Sheet.getCell(m29Row, 6).value = m29Total;
    m29Sheet.getCell(m29Row, 6).font = { bold: true };
    m29Sheet.getCell(m29Row, 6).numFmt = '#,##0.00';
    
    m29Row += 2;
    m29Sheet.getCell(m29Row, 1).value = `Ответственный: _________________ / ${CONTRACTOR.directorShort} /`;
    m29Row++;
    m29Sheet.getCell(m29Row, 1).value = `Дата: ${formatDateShort(contractDate)}`;
    
    const m29File = path.join(outputDir, `М-29_${estimate.number || 'б-н'}.xlsx`);
    await m29Workbook.xlsx.writeFile(m29File);
    console.log(`   ✓ ${path.basename(m29File)}`);
    
    // ====== 5. СЧЁТ-ФАКТУРА (аванс) ======
    console.log('\n5. Счёт на аванс...');
    
    const invoiceWorkbook = new ExcelJS.Workbook();
    const invoiceSheet = invoiceWorkbook.addWorksheet('Счёт');
    
    // Шапка
    invoiceSheet.mergeCells('A1:F1');
    invoiceSheet.getCell('A1').value = CONTRACTOR.fullName;
    invoiceSheet.getCell('A1').font = { bold: true, size: 12 };
    
    invoiceSheet.getCell('A2').value = `ИНН ${CONTRACTOR.inn}, КПП ${CONTRACTOR.kpp}`;
    invoiceSheet.getCell('A3').value = `Адрес: ${CONTRACTOR.address}`;
    invoiceSheet.getCell('A4').value = `Тел.: ${CONTRACTOR.phone}, Email: ${CONTRACTOR.email}`;
    
    invoiceSheet.mergeCells('A6:F6');
    invoiceSheet.getCell('A6').value = `СЧЁТ №${estimate.number || 'б/н'}-А от ${formatDateShort(contractDate)}`;
    invoiceSheet.getCell('A6').font = { bold: true, size: 14 };
    invoiceSheet.getCell('A6').alignment = { horizontal: 'center' };
    
    invoiceSheet.getCell('A8').value = `Заказчик: ${clientName}`;
    invoiceSheet.getCell('A9').value = `Адрес: ${clientAddress}`;
    invoiceSheet.getCell('A10').value = `Основание: Договор №${estimate.number || 'б/н'} от ${formatDateShort(contractDate)}`;
    
    // Таблица
    const invHeaders = ['№', 'Наименование', 'Ед.', 'Кол-во', 'Цена, ₽', 'Сумма, ₽'];
    invHeaders.forEach((h, i) => {
        const cell = invoiceSheet.getCell(12, i + 1);
        cell.value = h;
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        cell.alignment = { horizontal: 'center' };
    });
    
    invoiceSheet.getColumn(1).width = 5;
    invoiceSheet.getColumn(2).width = 50;
    invoiceSheet.getColumn(3).width = 8;
    invoiceSheet.getColumn(4).width = 10;
    invoiceSheet.getColumn(5).width = 14;
    invoiceSheet.getColumn(6).width = 14;
    
    // Строка аванса
    const invRow = 13;
    const invData = [1, `Аванс 30% по договору №${estimate.number || 'б/н'} за ${estimate.name}`, 'услуга', 1, prepayment, prepayment];
    invData.forEach((val, i) => {
        const cell = invoiceSheet.getCell(invRow, i + 1);
        cell.value = val;
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        if (i >= 4) {
            cell.numFmt = '#,##0.00';
            cell.alignment = { horizontal: 'right' };
        }
    });
    
    // Итого
    invoiceSheet.mergeCells(`A15:E15`);
    invoiceSheet.getCell('A15').value = 'Итого:';
    invoiceSheet.getCell('A15').alignment = { horizontal: 'right' };
    invoiceSheet.getCell('F15').value = prepayment;
    invoiceSheet.getCell('F15').numFmt = '#,##0.00';
    
    invoiceSheet.mergeCells(`A16:E16`);
    invoiceSheet.getCell('A16').value = 'Без НДС';
    invoiceSheet.getCell('A16').alignment = { horizontal: 'right' };
    
    invoiceSheet.mergeCells(`A17:E17`);
    invoiceSheet.getCell('A17').value = 'Всего к оплате:';
    invoiceSheet.getCell('A17').font = { bold: true };
    invoiceSheet.getCell('A17').alignment = { horizontal: 'right' };
    invoiceSheet.getCell('F17').value = prepayment;
    invoiceSheet.getCell('F17').numFmt = '#,##0.00';
    invoiceSheet.getCell('F17').font = { bold: true };
    
    invoiceSheet.getCell('A19').value = `Всего к оплате: ${numberToWords(prepayment)}`;
    
    invoiceSheet.getCell('A21').value = 'Реквизиты для оплаты:';
    invoiceSheet.getCell('A21').font = { bold: true };
    invoiceSheet.getCell('A22').value = `Банк: ${CONTRACTOR.bank}`;
    invoiceSheet.getCell('A23').value = `Р/с: ${CONTRACTOR.rs}`;
    invoiceSheet.getCell('A24').value = `К/с: ${CONTRACTOR.ks}`;
    invoiceSheet.getCell('A25').value = `БИК: ${CONTRACTOR.bik}`;
    
    invoiceSheet.getCell('A27').value = `Директор _________________ / ${CONTRACTOR.directorShort} /`;
    
    const invoiceFile = path.join(outputDir, `Счёт_аванс_${estimate.number || 'б-н'}.xlsx`);
    await invoiceWorkbook.xlsx.writeFile(invoiceFile);
    console.log(`   ✓ ${path.basename(invoiceFile)}`);
    
    // ====== 6. ВЕДОМОСТЬ ФОТ ======
    console.log('\n6. Ведомость ФОТ (фонд оплаты труда)...');
    
    const fotWorkbook = new ExcelJS.Workbook();
    const fotSheet = fotWorkbook.addWorksheet('ФОТ');
    
    fotSheet.mergeCells('A1:F1');
    fotSheet.getCell('A1').value = 'ВЕДОМОСТЬ ФОНДА ОПЛАТЫ ТРУДА';
    fotSheet.getCell('A1').font = { bold: true, size: 14 };
    fotSheet.getCell('A1').alignment = { horizontal: 'center' };
    
    fotSheet.mergeCells('A2:F2');
    fotSheet.getCell('A2').value = `Объект: ${estimate.name}`;
    
    fotSheet.mergeCells('A3:F3');
    fotSheet.getCell('A3').value = `Договор: №${estimate.number || 'б/н'} от ${formatDateShort(contractDate)}`;
    
    const fotHeaders = ['№', 'Вид работ', 'Ед.', 'Объём', 'Расценка, ₽', 'Сумма, ₽'];
    fotHeaders.forEach((h, i) => {
        const cell = fotSheet.getCell(5, i + 1);
        cell.value = h;
        cell.font = { bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    
    fotSheet.getColumn(1).width = 5;
    fotSheet.getColumn(2).width = 45;
    fotSheet.getColumn(3).width = 8;
    fotSheet.getColumn(4).width = 10;
    fotSheet.getColumn(5).width = 14;
    fotSheet.getColumn(6).width = 14;
    
    let fotRow = 6;
    let fotNum = 0;
    let fotTotal = 0;
    
    items.filter(i => (i.labor_price || 0) > 0).forEach(item => {
        fotNum++;
        const qty = item.quantity || 1;
        const price = item.labor_price || 0;
        const total = price * qty;
        fotTotal += total;
        
        const rowData = [fotNum, item.name, item.unit || 'шт.', qty, price, total];
        rowData.forEach((val, i) => {
            const cell = fotSheet.getCell(fotRow, i + 1);
            cell.value = val;
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            if (i >= 3) {
                cell.numFmt = '#,##0.00';
                cell.alignment = { horizontal: 'right' };
            }
        });
        fotRow++;
    });
    
    fotRow++;
    fotSheet.mergeCells(`A${fotRow}:E${fotRow}`);
    fotSheet.getCell(fotRow, 1).value = 'ИТОГО ФОТ:';
    fotSheet.getCell(fotRow, 1).font = { bold: true };
    fotSheet.getCell(fotRow, 1).alignment = { horizontal: 'right' };
    fotSheet.getCell(fotRow, 6).value = fotTotal;
    fotSheet.getCell(fotRow, 6).font = { bold: true };
    fotSheet.getCell(fotRow, 6).numFmt = '#,##0.00';
    
    fotRow += 2;
    fotSheet.getCell(fotRow, 1).value = `Прораб: _________________ / _______________ /`;
    fotRow++;
    fotSheet.getCell(fotRow, 1).value = `Дата: ${formatDateShort(contractDate)}`;
    
    const fotFile = path.join(outputDir, `ФОТ_${estimate.number || 'б-н'}.xlsx`);
    await fotWorkbook.xlsx.writeFile(fotFile);
    console.log(`   ✓ ${path.basename(fotFile)}`);
    
    db.close();
    
    // Итог
    console.log('\n' + '═'.repeat(60));
    console.log('✅ ВСЕ ДОКУМЕНТЫ УСПЕШНО СГЕНЕРИРОВАНЫ!');
    console.log('═'.repeat(60));
    console.log(`\nПапка с документами: ${outputDir}`);
    console.log('\nСписок документов:');
    fs.readdirSync(outputDir).forEach(f => console.log(`  📄 ${f}`));
    console.log('\n💡 Откройте папку для просмотра и печати документов.');
}

main().catch(console.error);
