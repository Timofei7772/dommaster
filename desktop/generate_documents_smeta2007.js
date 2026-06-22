/**
 * ПОЛНЫЙ ПАКЕТ ДОКУМЕНТОВ ZARU AI смета v2
 * С правильным маппингом полей БД
 */

const path = require('path')
const fs = require('fs')
const initSqlJs = require('sql.js')
const ExcelJS = require('exceljs')

// Путь к БД
const userDataPath = process.env.APPDATA + '\\zaru-smeta'
const dbPath = path.join(userDataPath, 'smeta_zaru.db')

// Данные компании
const COMPANY = {
  name: 'ООО РСК ДОММАСТЕР',
  director: 'Тимербулатов Зинур Динарович',
  directorShort: 'Тимербулатов З.Д.',
  inn: '0277148232',
  kpp: '027701001',
  ogrn: '1170280057075',
  address: 'г. Уфа, ул. Менделеева, д. 128, оф. 203',
  phone: '+7 (347) 266-12-34',
  email: 'info@rskdommaster.ru',
  bank: 'ПАО СБЕРБАНК',
  bik: '048073601',
  rs: '40702810206000012345',
  ks: '30101810000000000601'
}

// КОЭФФИЦИЕНТЫ ZARU AI смета
const ZARU_AI_SMETA_COEF = {
  work: 1.8,      // Коэффициент на работы
  material: 1.04  // Коэффициент на материалы
}
// Алиас для совместимости — вся генерация документов использует SMETA2007_COEF
const SMETA2007_COEF = ZARU_AI_SMETA_COEF

async function generateFullPackage() {
  console.log('═'.repeat(60))
  console.log('  ГЕНЕРАЦИЯ ПОЛНОГО ПАКЕТА ДОКУМЕНТОВ ZARU AI смета')
  console.log('═'.repeat(60))

  // Загружаем БД
  console.log('\n📂 Загрузка базы данных...')
  const SQL = await initSqlJs()
  const buffer = fs.readFileSync(dbPath)
  const db = new SQL.Database(buffer)
  console.log('✅ БД загружена')

  // Получаем смету ID=4 (СМ-2026-001)
  const estimates = db.exec('SELECT * FROM estimates WHERE id = 4')
  const cols = estimates[0].columns
  const vals = estimates[0].values[0]
  const estimate = {}
  cols.forEach((c, i) => estimate[c] = vals[i])

  console.log(`\n📋 Смета: ${estimate.number}`)
  console.log(`   Объект: ${estimate.name}`)
  console.log(`   Клиент: ${estimate.client_name || 'Не указан'}`)
  console.log(`   Адрес: ${estimate.address || 'Не указан'}`)

  // Получаем позиции
  const itemsResult = db.exec(`SELECT * FROM estimate_items WHERE estimate_id = ${estimate.id}`)
  const items = itemsResult[0].values.map(row => {
    const item = {}
    itemsResult[0].columns.forEach((c, i) => item[c] = row[i])
    return item
  })

  // Получаем разделы
  const sectionsResult = db.exec(`SELECT * FROM estimate_sections WHERE estimate_id = ${estimate.id}`)
  const sections = sectionsResult.length ? sectionsResult[0].values.map(row => {
    const section = {}
    sectionsResult[0].columns.forEach((c, i) => section[c] = row[i])
    return section
  }) : []

  console.log(`\n📊 Данные:`)
  console.log(`   Позиций: ${items.length}`)
  console.log(`   Разделов: ${sections.length}`)
  console.log(`   Коэфф. работы: ${SMETA2007_COEF.work}`)
  console.log(`   Коэфф. материалы: ${SMETA2007_COEF.material}`)

  // Считаем итоги
  let totalLaborFact = 0
  let totalMaterialFact = 0
  items.forEach(item => {
    const labor = parseFloat(item.labor_price) || 0
    const material = parseFloat(item.material_price) || 0
    const qty = parseFloat(item.quantity) || 1
    totalLaborFact += labor * qty
    totalMaterialFact += material * qty
  })

  const totalLaborSmeta = totalLaborFact * SMETA2007_COEF.work
  const totalMaterialSmeta = totalMaterialFact * SMETA2007_COEF.material
  const totalSmeta = totalLaborSmeta + totalMaterialSmeta

  console.log(`\n💰 Расчёт цен:`)
  console.log(`   ФОТ (факт): ${formatCurrency(totalLaborFact)}`)
  console.log(`   Материалы (факт): ${formatCurrency(totalMaterialFact)}`)
  console.log(`   ФОТ (смета, x${SMETA2007_COEF.work}): ${formatCurrency(totalLaborSmeta)}`)
  console.log(`   Материалы (смета, x${SMETA2007_COEF.material}): ${formatCurrency(totalMaterialSmeta)}`)
  console.log(`   ИТОГО (сметная): ${formatCurrency(totalSmeta)}`)

  // Папка для документов
  const outputDir = path.join(__dirname, 'Документы_' + (estimate.number || 'смета').replace(/[/\\]/g, '-'))
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  console.log(`\n📁 Папка: ${outputDir}`)
  console.log('\n' + '─'.repeat(60))
  console.log('  ГЕНЕРАЦИЯ ДОКУМЕНТОВ')
  console.log('─'.repeat(60))

  // 1. КП
  await generateKP(estimate, items, sections, path.join(outputDir, `1_КП_${estimate.number}.xlsx`))

  // 2. Коммерческая смета
  await generateSmeta2007(estimate, items, sections, path.join(outputDir, `2_Смета_${estimate.number}.xlsx`))

  // 3. ФОТ
  await generateFOT(estimate, items, sections, path.join(outputDir, `3_ФОТ_${estimate.number}.xlsx`))

  // 4. Договор
  await generateContract(estimate, items, sections, path.join(outputDir, `4_Договор_${estimate.number}.xlsx`))

  // 5. Ведомость материалов
  await generateMaterialsList(estimate, items, sections, path.join(outputDir, `5_Материалы_${estimate.number}.xlsx`))

  // 6. Счёт
  await generateInvoice(estimate, items, sections, path.join(outputDir, `6_Счёт_${estimate.number}.xlsx`))

  console.log('\n' + '═'.repeat(60))
  console.log('  ✅ ВСЕ ДОКУМЕНТЫ СГЕНЕРИРОВАНЫ!')
  console.log('═'.repeat(60))

  // Открываем папку
  const { exec } = require('child_process')
  exec(`explorer "${outputDir}"`)

  db.close()
}

// ========================================
// ГЕНЕРАЦИЯ КП
// ========================================
async function generateKP(estimate, items, sections, outputPath) {
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('КП')

  // Считаем итоги
  let totalLaborSmeta = 0
  let totalMaterialSmeta = 0
  items.forEach(item => {
    const labor = parseFloat(item.labor_price) || 0
    const material = parseFloat(item.material_price) || 0
    const qty = parseFloat(item.quantity) || 1
    totalLaborSmeta += labor * SMETA2007_COEF.work * qty
    totalMaterialSmeta += material * SMETA2007_COEF.material * qty
  })
  const totalSmeta = totalLaborSmeta + totalMaterialSmeta

  ws.columns = [
    { width: 6 }, { width: 50 }, { width: 12 }, { width: 10 }, { width: 15 }, { width: 18 }
  ]

  let row = 1

  // Шапка компании
  ws.mergeCells(`A${row}:F${row}`)
  ws.getCell(`A${row}`).value = COMPANY.name
  ws.getCell(`A${row}`).font = { bold: true, size: 16 }
  ws.getCell(`A${row}`).alignment = { horizontal: 'center' }
  row++

  ws.mergeCells(`A${row}:F${row}`)
  ws.getCell(`A${row}`).value = `Тел: ${COMPANY.phone} | Email: ${COMPANY.email}`
  ws.getCell(`A${row}`).alignment = { horizontal: 'center' }
  row += 2

  // Заголовок
  ws.mergeCells(`A${row}:F${row}`)
  ws.getCell(`A${row}`).value = 'КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ'
  ws.getCell(`A${row}`).font = { bold: true, size: 18 }
  ws.getCell(`A${row}`).alignment = { horizontal: 'center' }
  row++

  ws.mergeCells(`A${row}:F${row}`)
  ws.getCell(`A${row}`).value = `№ ${estimate.number} от ${formatDate(new Date())}`
  ws.getCell(`A${row}`).alignment = { horizontal: 'center' }
  row += 2

  // Кому
  ws.mergeCells(`A${row}:F${row}`)
  ws.getCell(`A${row}`).value = `Уважаемый(ая) ${estimate.client_name || 'Заказчик'}!`
  row++

  ws.mergeCells(`A${row}:F${row}`)
  ws.getCell(`A${row}`).value = `Предлагаем Вам услуги по выполнению ремонтных работ:`
  row++

  ws.mergeCells(`A${row}:F${row}`)
  ws.getCell(`A${row}`).value = `Объект: ${estimate.name || 'объект'}`
  ws.getCell(`A${row}`).font = { bold: true }
  row++

  ws.mergeCells(`A${row}:F${row}`)
  ws.getCell(`A${row}`).value = `Адрес: ${estimate.address || 'по согласованию'}`
  row += 2

  // Стоимость
  ws.mergeCells(`A${row}:D${row}`)
  ws.getCell(`A${row}`).value = 'Стоимость работ:'
  ws.getCell(`E${row}`).value = totalLaborSmeta
  ws.getCell(`E${row}`).numFmt = '#,##0.00 ₽'
  ws.getCell(`E${row}`).font = { bold: true }
  row++

  ws.mergeCells(`A${row}:D${row}`)
  ws.getCell(`A${row}`).value = 'Стоимость материалов:'
  ws.getCell(`E${row}`).value = totalMaterialSmeta
  ws.getCell(`E${row}`).numFmt = '#,##0.00 ₽'
  ws.getCell(`E${row}`).font = { bold: true }
  row++

  ws.mergeCells(`A${row}:D${row}`)
  ws.getCell(`A${row}`).value = 'ИТОГО:'
  ws.getCell(`A${row}`).font = { bold: true, size: 14 }
  ws.getCell(`E${row}`).value = totalSmeta
  ws.getCell(`E${row}`).numFmt = '#,##0.00 ₽'
  ws.getCell(`E${row}`).font = { bold: true, size: 14 }
  row += 2

  // Условия
  ws.mergeCells(`A${row}:F${row}`)
  ws.getCell(`A${row}`).value = 'Условия сотрудничества:'
  ws.getCell(`A${row}`).font = { bold: true }
  row++

  const conditions = [
    '• Срок выполнения работ: по согласованию',
    '• Гарантия на выполненные работы: 24 месяца',
    '• Оплата: поэтапная (аванс 30%, далее по факту выполнения)',
    '• Материалы: закупаем самостоятельно или с Вашим участием',
    '• Выезд специалиста для замера: бесплатно'
  ]

  conditions.forEach(c => {
    ws.mergeCells(`A${row}:F${row}`)
    ws.getCell(`A${row}`).value = c
    row++
  })

  row++
  ws.mergeCells(`A${row}:F${row}`)
  ws.getCell(`A${row}`).value = 'Срок действия предложения согласовывается отдельно'
  ws.getCell(`A${row}`).font = { italic: true }
  row += 2

  ws.getCell(`A${row}`).value = 'С уважением,'
  row++
  ws.getCell(`A${row}`).value = `Директор ${COMPANY.name}`
  row++
  ws.getCell(`A${row}`).value = `_________________ / ${COMPANY.directorShort} /`

  await workbook.xlsx.writeFile(outputPath)
  console.log(`\n  📄 1. Коммерческое предложение`)
  console.log(`     ✅ ${path.basename(outputPath)}`)
  console.log(`     💰 Сумма: ${formatCurrency(totalSmeta)}`)
}

// ========================================
// СМЕТА 2007
// ========================================
async function generateSmeta2007(estimate, items, sections, outputPath) {
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('Смета')

  const sectionMap = {}
  sections.forEach(s => sectionMap[s.id] = s)

  const grouped = {}
  items.forEach(item => {
    const sid = item.section_id || 0
    if (!grouped[sid]) grouped[sid] = []
    grouped[sid].push(item)
  })

  ws.columns = [
    { width: 6 }, { width: 45 }, { width: 10 }, { width: 10 }, { width: 14 }, { width: 14 }
  ]

  let row = 1

  // Шапка
  ws.mergeCells(`A${row}:C${row}`)
  ws.getCell(`A${row}`).value = 'Утверждаю:'
  ws.getCell(`A${row}`).font = { bold: true }
  ws.mergeCells(`D${row}:F${row}`)
  ws.getCell(`D${row}`).value = 'Согласовано:'
  ws.getCell(`D${row}`).font = { bold: true }
  row++

  ws.mergeCells(`A${row}:C${row}`)
  ws.getCell(`A${row}`).value = `Директор ${COMPANY.name}`
  ws.mergeCells(`D${row}:F${row}`)
  ws.getCell(`D${row}`).value = 'Заказчик:'
  row++

  ws.mergeCells(`A${row}:C${row}`)
  ws.getCell(`A${row}`).value = `________ / ${COMPANY.directorShort} /`
  ws.mergeCells(`D${row}:F${row}`)
  ws.getCell(`D${row}`).value = `________ / ${estimate.client_name || '____________'} /`
  row += 2

  // Заголовок
  ws.mergeCells(`A${row}:F${row}`)
  ws.getCell(`A${row}`).value = `СМЕТА № ${estimate.number || ''}`
  ws.getCell(`A${row}`).font = { bold: true, size: 14 }
  ws.getCell(`A${row}`).alignment = { horizontal: 'center' }
  row++

  ws.mergeCells(`A${row}:F${row}`)
  ws.getCell(`A${row}`).value = `на ${estimate.name || 'объект'}`
  ws.getCell(`A${row}`).alignment = { horizontal: 'center' }
  row++

  if (estimate.address) {
    ws.mergeCells(`A${row}:F${row}`)
    ws.getCell(`A${row}`).value = `Адрес: ${estimate.address}`
    ws.getCell(`A${row}`).alignment = { horizontal: 'center' }
    row++
  }

  row++

  // Итоги сверху
  let totalLabor = 0, totalMaterial = 0
  items.forEach(item => {
    const labor = parseFloat(item.labor_price) || 0
    const material = parseFloat(item.material_price) || 0
    const qty = parseFloat(item.quantity) || 1
    totalLabor += labor * SMETA2007_COEF.work * qty
    totalMaterial += material * SMETA2007_COEF.material * qty
  })
  const totalSmeta = totalLabor + totalMaterial

  // Рамка с итогами
  const summaryStart = row
  ws.mergeCells(`A${row}:D${row}`)
  ws.getCell(`A${row}`).value = 'Сметная стоимость:'
  ws.getCell(`A${row}`).font = { bold: true }
  ws.getCell(`E${row}`).value = totalSmeta
  ws.getCell(`E${row}`).numFmt = '#,##0.00'
  ws.getCell(`E${row}`).font = { bold: true }
  row++

  ws.mergeCells(`A${row}:D${row}`)
  ws.getCell(`A${row}`).value = 'в т.ч. стоимость работ:'
  ws.getCell(`E${row}`).value = totalLabor
  ws.getCell(`E${row}`).numFmt = '#,##0.00'
  row++

  ws.mergeCells(`A${row}:D${row}`)
  ws.getCell(`A${row}`).value = 'в т.ч. стоимость материалов:'
  ws.getCell(`E${row}`).value = totalMaterial
  ws.getCell(`E${row}`).numFmt = '#,##0.00'
  row += 2

  // Таблица
  ws.getCell(`A${row}`).value = '№'
  ws.getCell(`B${row}`).value = 'Наименование'
  ws.getCell(`C${row}`).value = 'Ед.'
  ws.getCell(`D${row}`).value = 'Кол-во'
  ws.getCell(`E${row}`).value = 'Цена'
  ws.getCell(`F${row}`).value = 'Сумма'

  for (let col = 1; col <= 6; col++) {
    const cell = ws.getCell(row, col)
    cell.font = { bold: true }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
  }
  row++

  // Данные по разделам
  let itemNum = 1
  const sectionIds = Object.keys(grouped).sort((a, b) => {
    const sA = sectionMap[a]?.sort_order || 0
    const sB = sectionMap[b]?.sort_order || 0
    return sA - sB
  })

  for (const sectionId of sectionIds) {
    const section = sectionMap[sectionId]
    const sectionItems = grouped[sectionId]

    if (section) {
      ws.mergeCells(`A${row}:F${row}`)
      ws.getCell(`A${row}`).value = `Раздел ${section.sort_order || ''}: ${section.name}`
      ws.getCell(`A${row}`).font = { bold: true }
      ws.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6E6E6' } }
      row++
    }

    let sectionTotal = 0

    for (const item of sectionItems) {
      const labor = parseFloat(item.labor_price) || 0
      const material = parseFloat(item.material_price) || 0
      const qty = parseFloat(item.quantity) || 1

      const laborSmeta = labor * SMETA2007_COEF.work
      const materialSmeta = material * SMETA2007_COEF.material
      const priceSmeta = laborSmeta + materialSmeta
      const total = priceSmeta * qty

      ws.getCell(`A${row}`).value = itemNum++
      ws.getCell(`A${row}`).alignment = { horizontal: 'center' }
      ws.getCell(`B${row}`).value = item.name
      ws.getCell(`C${row}`).value = item.unit || 'шт'
      ws.getCell(`C${row}`).alignment = { horizontal: 'center' }
      ws.getCell(`D${row}`).value = qty
      ws.getCell(`D${row}`).alignment = { horizontal: 'center' }
      ws.getCell(`E${row}`).value = priceSmeta
      ws.getCell(`E${row}`).numFmt = '#,##0.00'
      ws.getCell(`F${row}`).value = total
      ws.getCell(`F${row}`).numFmt = '#,##0.00'

      for (let col = 1; col <= 6; col++) {
        ws.getCell(row, col).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
      }

      sectionTotal += total
      row++
    }

    if (section) {
      ws.mergeCells(`A${row}:E${row}`)
      ws.getCell(`A${row}`).value = `Итого по разделу "${section.name}":`
      ws.getCell(`A${row}`).font = { bold: true }
      ws.getCell(`A${row}`).alignment = { horizontal: 'right' }
      ws.getCell(`F${row}`).value = sectionTotal
      ws.getCell(`F${row}`).numFmt = '#,##0.00'
      ws.getCell(`F${row}`).font = { bold: true }
      row++
    }
  }

  row++
  ws.mergeCells(`A${row}:E${row}`)
  ws.getCell(`A${row}`).value = 'Итого по разделам:'
  ws.getCell(`A${row}`).font = { bold: true }
  ws.getCell(`A${row}`).alignment = { horizontal: 'right' }
  ws.getCell(`F${row}`).value = totalSmeta
  ws.getCell(`F${row}`).numFmt = '#,##0.00'
  ws.getCell(`F${row}`).font = { bold: true }
  row++

  ws.mergeCells(`A${row}:E${row}`)
  ws.getCell(`A${row}`).value = 'НДС: не облагается'
  ws.getCell(`A${row}`).alignment = { horizontal: 'right' }
  row++

  ws.mergeCells(`A${row}:E${row}`)
  ws.getCell(`A${row}`).value = 'ВСЕГО ПО СМЕТЕ:'
  ws.getCell(`A${row}`).font = { bold: true, size: 12 }
  ws.getCell(`A${row}`).alignment = { horizontal: 'right' }
  ws.getCell(`F${row}`).value = totalSmeta
  ws.getCell(`F${row}`).numFmt = '#,##0.00'
  ws.getCell(`F${row}`).font = { bold: true, size: 12 }
  row += 2

  // Подписи
  ws.getCell(`A${row}`).value = 'Составил:'
  ws.getCell(`D${row}`).value = `_________ / ${COMPANY.directorShort} /`
  row++
  ws.getCell(`A${row}`).value = 'Проверил:'
  ws.getCell(`D${row}`).value = '_________ / ____________ /'

  await workbook.xlsx.writeFile(outputPath)
  console.log(`\n  📄 2. Смета для клиента`)
  console.log(`     ✅ ${path.basename(outputPath)}`)
  console.log(`     💰 Сумма: ${formatCurrency(totalSmeta)}`)
}

// ========================================
// ФОТ (Ведомость для рабочих)
// ========================================
async function generateFOT(estimate, items, sections, outputPath) {
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('ФОТ')

  const sectionMap = {}
  sections.forEach(s => sectionMap[s.id] = s)

  const grouped = {}
  items.forEach(item => {
    const sid = item.section_id || 0
    if (!grouped[sid]) grouped[sid] = []
    grouped[sid].push(item)
  })

  ws.columns = [
    { width: 6 }, { width: 45 }, { width: 10 }, { width: 10 }, { width: 14 }, { width: 14 }
  ]

  let row = 1

  ws.mergeCells(`A${row}:F${row}`)
  ws.getCell(`A${row}`).value = 'ВЕДОМОСТЬ ОБЪЁМОВ РАБОТ'
  ws.getCell(`A${row}`).font = { bold: true, size: 14 }
  ws.getCell(`A${row}`).alignment = { horizontal: 'center' }
  row++

  ws.mergeCells(`A${row}:F${row}`)
  ws.getCell(`A${row}`).value = '(Фактические расценки для расчёта с рабочими)'
  ws.getCell(`A${row}`).font = { italic: true }
  ws.getCell(`A${row}`).alignment = { horizontal: 'center' }
  row++

  ws.mergeCells(`A${row}:F${row}`)
  ws.getCell(`A${row}`).value = `Смета № ${estimate.number} - ${estimate.name}`
  ws.getCell(`A${row}`).alignment = { horizontal: 'center' }
  row += 2

  // Итог ФОТ
  let totalFOT = 0
  items.forEach(item => {
    const labor = parseFloat(item.labor_price) || 0
    const qty = parseFloat(item.quantity) || 1
    totalFOT += labor * qty
  })

  ws.mergeCells(`A${row}:D${row}`)
  ws.getCell(`A${row}`).value = 'ИТОГО ФОТ:'
  ws.getCell(`A${row}`).font = { bold: true, size: 12 }
  ws.getCell(`E${row}`).value = totalFOT
  ws.getCell(`E${row}`).numFmt = '#,##0.00'
  ws.getCell(`E${row}`).font = { bold: true, size: 12 }
  row += 2

  // Заголовок
  ws.getCell(`A${row}`).value = '№'
  ws.getCell(`B${row}`).value = 'Наименование работы'
  ws.getCell(`C${row}`).value = 'Ед.'
  ws.getCell(`D${row}`).value = 'Кол-во'
  ws.getCell(`E${row}`).value = 'Цена'
  ws.getCell(`F${row}`).value = 'Сумма'

  for (let col = 1; col <= 6; col++) {
    const cell = ws.getCell(row, col)
    cell.font = { bold: true }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
  }
  row++

  let itemNum = 1
  const sectionIds = Object.keys(grouped).sort((a, b) => {
    const sA = sectionMap[a]?.sort_order || 0
    const sB = sectionMap[b]?.sort_order || 0
    return sA - sB
  })

  for (const sectionId of sectionIds) {
    const section = sectionMap[sectionId]
    const sectionItems = grouped[sectionId]

    if (section) {
      ws.mergeCells(`A${row}:F${row}`)
      ws.getCell(`A${row}`).value = `${section.name}`
      ws.getCell(`A${row}`).font = { bold: true }
      ws.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6E6E6' } }
      row++
    }

    let sectionTotal = 0

    for (const item of sectionItems) {
      const labor = parseFloat(item.labor_price) || 0
      const qty = parseFloat(item.quantity) || 1

      if (labor <= 0) continue

      const total = labor * qty

      ws.getCell(`A${row}`).value = itemNum++
      ws.getCell(`A${row}`).alignment = { horizontal: 'center' }
      ws.getCell(`B${row}`).value = item.name
      ws.getCell(`C${row}`).value = item.unit || 'шт'
      ws.getCell(`C${row}`).alignment = { horizontal: 'center' }
      ws.getCell(`D${row}`).value = qty
      ws.getCell(`D${row}`).alignment = { horizontal: 'center' }
      ws.getCell(`E${row}`).value = labor
      ws.getCell(`E${row}`).numFmt = '#,##0.00'
      ws.getCell(`F${row}`).value = total
      ws.getCell(`F${row}`).numFmt = '#,##0.00'

      for (let col = 1; col <= 6; col++) {
        ws.getCell(row, col).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
      }

      sectionTotal += total
      row++
    }

    if (section && sectionTotal > 0) {
      ws.mergeCells(`A${row}:E${row}`)
      ws.getCell(`A${row}`).value = `Итого по разделу:`
      ws.getCell(`A${row}`).font = { bold: true }
      ws.getCell(`A${row}`).alignment = { horizontal: 'right' }
      ws.getCell(`F${row}`).value = sectionTotal
      ws.getCell(`F${row}`).numFmt = '#,##0.00'
      ws.getCell(`F${row}`).font = { bold: true }
      row++
    }
  }

  row++
  ws.mergeCells(`A${row}:E${row}`)
  ws.getCell(`A${row}`).value = 'ИТОГО ФОТ:'
  ws.getCell(`A${row}`).font = { bold: true, size: 12 }
  ws.getCell(`A${row}`).alignment = { horizontal: 'right' }
  ws.getCell(`F${row}`).value = totalFOT
  ws.getCell(`F${row}`).numFmt = '#,##0.00'
  ws.getCell(`F${row}`).font = { bold: true, size: 12 }

  await workbook.xlsx.writeFile(outputPath)
  console.log(`\n  📄 3. ФОТ для рабочих`)
  console.log(`     ✅ ${path.basename(outputPath)}`)
  console.log(`     💰 Сумма: ${formatCurrency(totalFOT)}`)
}

// ========================================
// ДОГОВОР
// ========================================
async function generateContract(estimate, items, sections, outputPath) {
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('Договор')

  let totalLabor = 0, totalMaterial = 0
  items.forEach(item => {
    const labor = parseFloat(item.labor_price) || 0
    const material = parseFloat(item.material_price) || 0
    const qty = parseFloat(item.quantity) || 1
    totalLabor += labor * SMETA2007_COEF.work * qty
    totalMaterial += material * SMETA2007_COEF.material * qty
  })
  const total = totalLabor + totalMaterial

  ws.columns = [{ width: 5 }, { width: 50 }, { width: 25 }, { width: 20 }]

  let row = 1

  // Заголовок
  ws.mergeCells(`A${row}:D${row}`)
  ws.getCell(`A${row}`).value = 'ДОГОВОР ПОДРЯДА'
  ws.getCell(`A${row}`).font = { bold: true, size: 16 }
  ws.getCell(`A${row}`).alignment = { horizontal: 'center' }
  row++

  ws.mergeCells(`A${row}:D${row}`)
  ws.getCell(`A${row}`).value = `№ ${estimate.number} от ${formatDate(new Date())}`
  ws.getCell(`A${row}`).alignment = { horizontal: 'center' }
  row += 2

  // Стороны
  ws.mergeCells(`A${row}:D${row}`)
  ws.getCell(`A${row}`).value = `${COMPANY.name}, именуемое в дальнейшем "Подрядчик", в лице директора ${COMPANY.director}, действующего на основании Устава, с одной стороны, и`
  ws.getCell(`A${row}`).alignment = { wrapText: true }
  ws.getRow(row).height = 30
  row++

  ws.mergeCells(`A${row}:D${row}`)
  ws.getCell(`A${row}`).value = `${estimate.client_name || '________________________________'}, именуемый(ая) в дальнейшем "Заказчик", с другой стороны, заключили настоящий договор о нижеследующем:`
  ws.getCell(`A${row}`).alignment = { wrapText: true }
  ws.getRow(row).height = 30
  row += 2

  // 1. Предмет
  ws.mergeCells(`A${row}:D${row}`)
  ws.getCell(`A${row}`).value = '1. ПРЕДМЕТ ДОГОВОРА'
  ws.getCell(`A${row}`).font = { bold: true }
  row++

  ws.mergeCells(`A${row}:D${row}`)
  ws.getCell(`A${row}`).value = `1.1. Подрядчик обязуется выполнить работы: ${estimate.name}`
  row++

  ws.mergeCells(`A${row}:D${row}`)
  ws.getCell(`A${row}`).value = `1.2. Адрес объекта: ${estimate.address || '________________________________________'}`
  row++

  ws.mergeCells(`A${row}:D${row}`)
  ws.getCell(`A${row}`).value = '1.3. Объём работ определяется Сметой (Приложение №1)'
  row += 2

  // 2. Стоимость
  ws.mergeCells(`A${row}:D${row}`)
  ws.getCell(`A${row}`).value = '2. СТОИМОСТЬ И ПОРЯДОК РАСЧЁТОВ'
  ws.getCell(`A${row}`).font = { bold: true }
  row++

  ws.mergeCells(`A${row}:D${row}`)
  ws.getCell(`A${row}`).value = `2.1. Общая стоимость: ${formatCurrency(total)}`
  ws.getCell(`A${row}`).font = { bold: true }
  row++

  ws.mergeCells(`A${row}:D${row}`)
  ws.getCell(`A${row}`).value = `     в т.ч. работы: ${formatCurrency(totalLabor)}`
  row++

  ws.mergeCells(`A${row}:D${row}`)
  ws.getCell(`A${row}`).value = `     в т.ч. материалы: ${formatCurrency(totalMaterial)}`
  row++

  ws.mergeCells(`A${row}:D${row}`)
  ws.getCell(`A${row}`).value = `2.2. Аванс 30%: ${formatCurrency(total * 0.3)}`
  row += 2

  // 3. Сроки
  ws.mergeCells(`A${row}:D${row}`)
  ws.getCell(`A${row}`).value = '3. СРОКИ ВЫПОЛНЕНИЯ'
  ws.getCell(`A${row}`).font = { bold: true }
  row++

  ws.mergeCells(`A${row}:D${row}`)
  ws.getCell(`A${row}`).value = '3.1. Начало работ: _______________'
  row++

  ws.mergeCells(`A${row}:D${row}`)
  ws.getCell(`A${row}`).value = '3.2. Окончание работ: _______________'
  row += 2

  // 4. Гарантии
  ws.mergeCells(`A${row}:D${row}`)
  ws.getCell(`A${row}`).value = '4. ГАРАНТИИ'
  ws.getCell(`A${row}`).font = { bold: true }
  row++

  ws.mergeCells(`A${row}:D${row}`)
  ws.getCell(`A${row}`).value = '4.1. Гарантийный срок: 24 месяца'
  row += 2

  // 5. Подписи
  ws.mergeCells(`A${row}:D${row}`)
  ws.getCell(`A${row}`).value = '5. РЕКВИЗИТЫ И ПОДПИСИ'
  ws.getCell(`A${row}`).font = { bold: true }
  row += 2

  ws.mergeCells(`A${row}:B${row}`)
  ws.getCell(`A${row}`).value = 'ПОДРЯДЧИК:'
  ws.getCell(`A${row}`).font = { bold: true }
  ws.mergeCells(`C${row}:D${row}`)
  ws.getCell(`C${row}`).value = 'ЗАКАЗЧИК:'
  ws.getCell(`C${row}`).font = { bold: true }
  row++

  ws.mergeCells(`A${row}:B${row}`)
  ws.getCell(`A${row}`).value = COMPANY.name
  ws.mergeCells(`C${row}:D${row}`)
  ws.getCell(`C${row}`).value = estimate.client_name || '________________________'
  row++

  ws.mergeCells(`A${row}:B${row}`)
  ws.getCell(`A${row}`).value = `ИНН ${COMPANY.inn}`
  row++

  ws.mergeCells(`A${row}:B${row}`)
  ws.getCell(`A${row}`).value = `р/с ${COMPANY.rs}`
  row++

  ws.mergeCells(`A${row}:B${row}`)
  ws.getCell(`A${row}`).value = `${COMPANY.bank}, БИК ${COMPANY.bik}`
  row += 2

  ws.mergeCells(`A${row}:B${row}`)
  ws.getCell(`A${row}`).value = `_________ / ${COMPANY.directorShort} /`
  ws.mergeCells(`C${row}:D${row}`)
  ws.getCell(`C${row}`).value = '_________ / ____________ /'
  row++

  ws.mergeCells(`A${row}:B${row}`)
  ws.getCell(`A${row}`).value = 'М.П.'
  ws.mergeCells(`C${row}:D${row}`)
  ws.getCell(`C${row}`).value = 'М.П.'

  await workbook.xlsx.writeFile(outputPath)
  console.log(`\n  📄 4. Договор подряда`)
  console.log(`     ✅ ${path.basename(outputPath)}`)
  console.log(`     💰 Сумма: ${formatCurrency(total)}`)
}

// ========================================
// ВЕДОМОСТЬ МАТЕРИАЛОВ
// ========================================
async function generateMaterialsList(estimate, items, sections, outputPath) {
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('Материалы')

  ws.columns = [
    { width: 6 }, { width: 45 }, { width: 10 }, { width: 10 }, { width: 14 }, { width: 14 }
  ]

  let row = 1

  ws.mergeCells(`A${row}:F${row}`)
  ws.getCell(`A${row}`).value = 'ВЕДОМОСТЬ МАТЕРИАЛОВ'
  ws.getCell(`A${row}`).font = { bold: true, size: 14 }
  ws.getCell(`A${row}`).alignment = { horizontal: 'center' }
  row++

  ws.mergeCells(`A${row}:F${row}`)
  ws.getCell(`A${row}`).value = `Смета № ${estimate.number} - ${estimate.name}`
  ws.getCell(`A${row}`).alignment = { horizontal: 'center' }
  row += 2

  // Итог
  let totalMaterial = 0
  items.forEach(item => {
    const material = parseFloat(item.material_price) || 0
    const qty = parseFloat(item.quantity) || 1
    totalMaterial += material * SMETA2007_COEF.material * qty
  })

  ws.mergeCells(`A${row}:D${row}`)
  ws.getCell(`A${row}`).value = 'ИТОГО материалов:'
  ws.getCell(`A${row}`).font = { bold: true }
  ws.getCell(`E${row}`).value = totalMaterial
  ws.getCell(`E${row}`).numFmt = '#,##0.00'
  ws.getCell(`E${row}`).font = { bold: true }
  row += 2

  // Заголовок
  ws.getCell(`A${row}`).value = '№'
  ws.getCell(`B${row}`).value = 'Наименование'
  ws.getCell(`C${row}`).value = 'Ед.'
  ws.getCell(`D${row}`).value = 'Кол-во'
  ws.getCell(`E${row}`).value = 'Цена'
  ws.getCell(`F${row}`).value = 'Сумма'

  for (let col = 1; col <= 6; col++) {
    const cell = ws.getCell(row, col)
    cell.font = { bold: true }
    cell.alignment = { horizontal: 'center' }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
  }
  row++

  let itemNum = 1
  for (const item of items) {
    const material = parseFloat(item.material_price) || 0
    const qty = parseFloat(item.quantity) || 1

    if (material <= 0) continue

    const price = material * SMETA2007_COEF.material
    const total = price * qty

    ws.getCell(`A${row}`).value = itemNum++
    ws.getCell(`A${row}`).alignment = { horizontal: 'center' }
    ws.getCell(`B${row}`).value = item.name
    ws.getCell(`C${row}`).value = item.unit || 'шт'
    ws.getCell(`C${row}`).alignment = { horizontal: 'center' }
    ws.getCell(`D${row}`).value = qty
    ws.getCell(`D${row}`).alignment = { horizontal: 'center' }
    ws.getCell(`E${row}`).value = price
    ws.getCell(`E${row}`).numFmt = '#,##0.00'
    ws.getCell(`F${row}`).value = total
    ws.getCell(`F${row}`).numFmt = '#,##0.00'

    for (let col = 1; col <= 6; col++) {
      ws.getCell(row, col).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
    }

    row++
  }

  row++
  ws.mergeCells(`A${row}:E${row}`)
  ws.getCell(`A${row}`).value = 'ИТОГО:'
  ws.getCell(`A${row}`).font = { bold: true }
  ws.getCell(`A${row}`).alignment = { horizontal: 'right' }
  ws.getCell(`F${row}`).value = totalMaterial
  ws.getCell(`F${row}`).numFmt = '#,##0.00'
  ws.getCell(`F${row}`).font = { bold: true }

  await workbook.xlsx.writeFile(outputPath)
  console.log(`\n  📄 5. Ведомость материалов`)
  console.log(`     ✅ ${path.basename(outputPath)}`)
  console.log(`     💰 Сумма: ${formatCurrency(totalMaterial)}`)
}

// ========================================
// СЧЁТ
// ========================================
async function generateInvoice(estimate, items, sections, outputPath) {
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('Счёт')

  let totalLabor = 0, totalMaterial = 0
  items.forEach(item => {
    const labor = parseFloat(item.labor_price) || 0
    const material = parseFloat(item.material_price) || 0
    const qty = parseFloat(item.quantity) || 1
    totalLabor += labor * SMETA2007_COEF.work * qty
    totalMaterial += material * SMETA2007_COEF.material * qty
  })
  const total = totalLabor + totalMaterial

  ws.columns = [{ width: 6 }, { width: 50 }, { width: 10 }, { width: 10 }, { width: 14 }, { width: 14 }]

  let row = 1

  // Банк
  ws.mergeCells(`A${row}:F${row}`)
  ws.getCell(`A${row}`).value = COMPANY.bank
  ws.getCell(`A${row}`).font = { bold: true }
  row++

  ws.mergeCells(`A${row}:C${row}`)
  ws.getCell(`A${row}`).value = `БИК: ${COMPANY.bik}`
  ws.mergeCells(`D${row}:F${row}`)
  ws.getCell(`D${row}`).value = `К/с: ${COMPANY.ks}`
  row++

  // Получатель
  ws.mergeCells(`A${row}:F${row}`)
  ws.getCell(`A${row}`).value = `Получатель: ${COMPANY.name}`
  ws.getCell(`A${row}`).font = { bold: true }
  row++

  ws.mergeCells(`A${row}:C${row}`)
  ws.getCell(`A${row}`).value = `ИНН: ${COMPANY.inn}`
  ws.mergeCells(`D${row}:F${row}`)
  ws.getCell(`D${row}`).value = `Р/с: ${COMPANY.rs}`
  row += 2

  // Заголовок
  ws.mergeCells(`A${row}:F${row}`)
  ws.getCell(`A${row}`).value = `СЧЁТ № ${estimate.number} от ${formatDate(new Date())}`
  ws.getCell(`A${row}`).font = { bold: true, size: 16 }
  ws.getCell(`A${row}`).alignment = { horizontal: 'center' }
  row += 2

  // Плательщик
  ws.mergeCells(`A${row}:F${row}`)
  ws.getCell(`A${row}`).value = `Плательщик: ${estimate.client_name || '________________________'}`
  row++

  ws.mergeCells(`A${row}:F${row}`)
  ws.getCell(`A${row}`).value = `Основание: Договор № ${estimate.number}`
  row += 2

  // Таблица
  ws.getCell(`A${row}`).value = '№'
  ws.getCell(`B${row}`).value = 'Наименование'
  ws.getCell(`C${row}`).value = 'Ед.'
  ws.getCell(`D${row}`).value = 'Кол-во'
  ws.getCell(`E${row}`).value = 'Цена'
  ws.getCell(`F${row}`).value = 'Сумма'

  for (let col = 1; col <= 6; col++) {
    const cell = ws.getCell(row, col)
    cell.font = { bold: true }
    cell.alignment = { horizontal: 'center' }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
  }
  row++

  // Строки
  ws.getCell(`A${row}`).value = 1
  ws.getCell(`B${row}`).value = `Ремонтные работы по договору № ${estimate.number}`
  ws.getCell(`C${row}`).value = 'усл.'
  ws.getCell(`D${row}`).value = 1
  ws.getCell(`E${row}`).value = totalLabor
  ws.getCell(`E${row}`).numFmt = '#,##0.00'
  ws.getCell(`F${row}`).value = totalLabor
  ws.getCell(`F${row}`).numFmt = '#,##0.00'
  for (let col = 1; col <= 6; col++) {
    ws.getCell(row, col).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
  }
  row++

  ws.getCell(`A${row}`).value = 2
  ws.getCell(`B${row}`).value = 'Строительные материалы'
  ws.getCell(`C${row}`).value = 'компл.'
  ws.getCell(`D${row}`).value = 1
  ws.getCell(`E${row}`).value = totalMaterial
  ws.getCell(`E${row}`).numFmt = '#,##0.00'
  ws.getCell(`F${row}`).value = totalMaterial
  ws.getCell(`F${row}`).numFmt = '#,##0.00'
  for (let col = 1; col <= 6; col++) {
    ws.getCell(row, col).border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
  }
  row++

  // Итого
  ws.mergeCells(`A${row}:E${row}`)
  ws.getCell(`A${row}`).value = 'ИТОГО:'
  ws.getCell(`A${row}`).font = { bold: true }
  ws.getCell(`A${row}`).alignment = { horizontal: 'right' }
  ws.getCell(`F${row}`).value = total
  ws.getCell(`F${row}`).numFmt = '#,##0.00'
  ws.getCell(`F${row}`).font = { bold: true }
  row++

  ws.mergeCells(`A${row}:E${row}`)
  ws.getCell(`A${row}`).value = 'НДС:'
  ws.getCell(`A${row}`).alignment = { horizontal: 'right' }
  ws.getCell(`F${row}`).value = 'Без НДС'
  row++

  ws.mergeCells(`A${row}:E${row}`)
  ws.getCell(`A${row}`).value = 'ВСЕГО К ОПЛАТЕ:'
  ws.getCell(`A${row}`).font = { bold: true, size: 12 }
  ws.getCell(`A${row}`).alignment = { horizontal: 'right' }
  ws.getCell(`F${row}`).value = total
  ws.getCell(`F${row}`).numFmt = '#,##0.00'
  ws.getCell(`F${row}`).font = { bold: true, size: 12 }
  row += 2

  // Подпись
  ws.getCell(`A${row}`).value = 'Директор'
  ws.getCell(`D${row}`).value = `_________ / ${COMPANY.directorShort} /`
  row++
  ws.getCell(`A${row}`).value = 'М.П.'

  await workbook.xlsx.writeFile(outputPath)
  console.log(`\n  📄 6. Счёт на оплату`)
  console.log(`     ✅ ${path.basename(outputPath)}`)
  console.log(`     💰 Сумма: ${formatCurrency(total)}`)
}

// ========================================
// Вспомогательные функции
// ========================================
function formatDate(date) {
  const d = new Date(date)
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 2
  }).format(amount)
}

// Запуск
generateFullPackage().catch(console.error)
