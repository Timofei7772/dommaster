/**
 * ZARU Смета - Генератор документов
 * Создание Word, Excel, PDF файлов
 */

const path = require('path')
const fs = require('fs')
const ExcelJS = require('exceljs')
const templates = require('./templates')

// === УНИВЕРСАЛЬНЫЕ СТИЛИ ДЛЯ ВСЕХ ДОКУМЕНТОВ ===
const STYLES = {
  // Шрифты
  font: {
    default: { name: 'Arial', size: 10 },
    header: { name: 'Arial', size: 11, bold: true },
    title: { name: 'Arial', size: 14, bold: true },
    subtitle: { name: 'Arial', size: 12, bold: true },
    small: { name: 'Arial', size: 9 },
    tiny: { name: 'Arial', size: 8 }
  },
  // Границы
  border: {
    thin: {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    },
    medium: {
      top: { style: 'medium' },
      left: { style: 'medium' },
      bottom: { style: 'medium' },
      right: { style: 'medium' }
    }
  },
  // Заливки
  fill: {
    header: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } },
    yellow: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } },
    lightBlue: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } }
  },
  // Выравнивание
  alignment: {
    center: { horizontal: 'center', vertical: 'middle', wrapText: true },
    left: { horizontal: 'left', vertical: 'middle', wrapText: true },
    right: { horizontal: 'right', vertical: 'middle', wrapText: true },
    centerTop: { horizontal: 'center', vertical: 'top', wrapText: true }
  },
  // Форматы чисел
  numFmt: {
    currency: '#,##0.00',
    quantity: '#,##0.00',
    integer: '#,##0'
  }
}

// Применить стиль к ячейке
const applyStyle = (cell, options = {}) => {
  if (options.font) cell.font = { ...STYLES.font.default, ...options.font }
  if (options.border) cell.border = options.border
  if (options.fill) cell.fill = options.fill
  if (options.alignment) cell.alignment = options.alignment
  if (options.numFmt) cell.numFmt = options.numFmt
}

// Применить стиль к строке
const applyRowStyle = (row, options = {}) => {
  row.eachCell((cell) => {
    applyStyle(cell, options)
  })
  if (options.height) row.height = options.height
}

// Форматирование
const formatCurrency = (value) => {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 2
  }).format(value || 0)
}

const formatDate = (dateStr) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  // Используем простой формат для надёжности кодировки
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}.${month}.${year}`
}

// === ВСПОМОГАТЕЛЬНЫЕ ФИКСЫ ДЛЯ ЭКСПОРТА ===
const getCellText = (cell) => {
  if (!cell) return ''
  if (typeof cell.text === 'string' && cell.text !== '') return cell.text
  const v = cell.value
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map(r => r.text).join('')
    if (v.formula !== undefined) return String(v.result ?? '')
    if (v.text) return String(v.text)
  }
  return String(v)
}

const ensureMinColumnWidth = (sheet, colIdx, minWidth) => {
  const col = sheet.getColumn(colIdx)
  const cur = col.width || 0
  if (cur < minWidth) col.width = minWidth
}

const fixHashColumns = (sheet, extra = 6, maxWidth = 60) => {
  const colsToFix = new Set()
  sheet.eachRow({ includeEmpty: false }, row => {
    row.eachCell({ includeEmpty: false }, cell => {
      const text = getCellText(cell).trim()
      if (/^#+$/.test(text)) colsToFix.add(cell.col)
    })
  })
  colsToFix.forEach((colIdx) => {
    const col = sheet.getColumn(colIdx)
    const cur = col.width || 10
    const next = Math.min(cur + extra, maxWidth)
    if (next > cur) col.width = next
  })
}

const applySheetFixes = (sheet, opts = {}) => {
  const minCols = opts.minColWidths || {}
  Object.keys(minCols).forEach(k => ensureMinColumnWidth(sheet, Number(k), minCols[k]))
  fixHashColumns(sheet, opts.hashExtra || 6, opts.hashMaxWidth || 60)
}

const calcWrappedRowHeight = (text, baseHeight = 16, charsPerLine = 50, lineHeight = 14) => {
  const t = String(text || '')
  if (!t) return baseHeight
  const lines = Math.ceil(t.length / charsPerLine)
  return Math.max(baseHeight, lines * lineHeight)
}

const getTemplatePath = (relPath) => {
  return path.join(templates.getTemplatesPath(), relPath)
}

const loadTemplateWorkbook = async (relPath) => {
  const templatePath = getTemplatePath(relPath)
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template not found: ${templatePath}`)
  }
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(templatePath)
  return workbook
}

const getWorksheetByName = (workbook, preferredNames = []) => {
  for (const name of preferredNames) {
    const ws = workbook.getWorksheet(name)
    if (ws) return ws
  }
  return workbook.worksheets[0]
}

const findRowByCellText = (sheet, colIndex, matcher) => {
  const isMatch = (text) => {
    if (!text) return false
    if (matcher instanceof RegExp) return matcher.test(text)
    return String(text).includes(matcher)
  }
  for (let r = 1; r <= sheet.rowCount; r++) {
    const text = getCellText(sheet.getRow(r).getCell(colIndex)).trim()
    if (isMatch(text)) return r
  }
  return null
}

const snapshotRowStyle = (row) => {
  const snap = {
    height: row.height,
    hidden: row.hidden,
    outlineLevel: row.outlineLevel,
    cells: {}
  }
  row.eachCell({ includeEmpty: true }, (cell, col) => {
    snap.cells[col] = {
      style: cell.style ? JSON.parse(JSON.stringify(cell.style)) : null,
      numFmt: cell.numFmt,
      font: cell.font ? JSON.parse(JSON.stringify(cell.font)) : null,
      alignment: cell.alignment ? JSON.parse(JSON.stringify(cell.alignment)) : null,
      border: cell.border ? JSON.parse(JSON.stringify(cell.border)) : null,
      fill: cell.fill ? JSON.parse(JSON.stringify(cell.fill)) : null
    }
  })
  return snap
}

const applyRowStyleSnapshot = (row, snap) => {
  if (!snap) return
  row.height = snap.height
  row.hidden = snap.hidden
  row.outlineLevel = snap.outlineLevel
  Object.entries(snap.cells).forEach(([colStr, cellSnap]) => {
    const col = Number(colStr)
    const cell = row.getCell(col)
    if (cellSnap.style) cell.style = JSON.parse(JSON.stringify(cellSnap.style))
    if (cellSnap.numFmt) cell.numFmt = cellSnap.numFmt
    if (cellSnap.font) cell.font = JSON.parse(JSON.stringify(cellSnap.font))
    if (cellSnap.alignment) cell.alignment = JSON.parse(JSON.stringify(cellSnap.alignment))
    if (cellSnap.border) cell.border = JSON.parse(JSON.stringify(cellSnap.border))
    if (cellSnap.fill) cell.fill = JSON.parse(JSON.stringify(cellSnap.fill))
  })
}

const insertStyledRow = (sheet, rowIndex, styleSnap) => {
  sheet.spliceRows(rowIndex, 0, [])
  const row = sheet.getRow(rowIndex)
  applyRowStyleSnapshot(row, styleSnap)
  return row
}

const toDateValue = (dateStr) => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return ''
  return d
}

const formatMonthYearRu = (dateValue) => {
  const d = dateValue ? new Date(dateValue) : new Date()
  const month = d.toLocaleString('ru-RU', { month: 'long', year: 'numeric' })
  return month.charAt(0).toUpperCase() + month.slice(1)
}

// === Генерация сметы в Excel (ЛОКАЛЬНАЯ СМЕТА) ===
const generateEstimateExcel = async (estimate, items, project, companyInfo, outputPath) => {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'ZARU Смета'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('Смета', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true }
  })

  // Настройка ширины колонок (6 колонок по образцу)
  sheet.getColumn(1).width = 4.29   // A: №
  sheet.getColumn(2).width = 61.71  // B: Наименование работ и затрат
  sheet.getColumn(3).width = 8.29   // C: Ед.
  sheet.getColumn(4).width = 11.43  // D: Кол-во
  sheet.getColumn(5).width = 16     // E: Цена, руб.
  sheet.getColumn(6).width = 18     // F: Стоимость, руб.

  const dateStr = formatDate(new Date().toISOString())
  const clientName = project?.client_name || estimate?.client_name || ''
  const address = project?.address || estimate?.address || ''
  const companyName = companyInfo?.name || 'ООО ПОДРЯДЧИК'

  // === ЗАГОЛОВОК ===
  let row = 1
  sheet.mergeCells('A1:F1')
  sheet.getCell('A1').value = `ЛОКАЛЬНАЯ СМЕТА № ${estimate.number || 'Б/Н'}`
  sheet.getCell('A1').font = { name: 'Arial', size: 14, bold: true }
  sheet.getCell('A1').alignment = STYLES.alignment.center
  sheet.getCell('A1').border = STYLES.border.thin
  sheet.getRow(1).height = 28

  sheet.mergeCells('A2:F2')
  sheet.getCell('A2').value = estimate.name || 'Ремонтно-отделочные работы'
  sheet.getCell('A2').font = { name: 'Arial', size: 10, italic: true }
  sheet.getCell('A2').alignment = STYLES.alignment.center
  sheet.getRow(2).height = 20

  // === РЕКВИЗИТЫ ===
  row = 4
  if (clientName) {
    sheet.mergeCells(`A${row}:B${row}`)
    sheet.getCell(`A${row}`).value = 'Заказчик:'
    sheet.getCell(`A${row}`).font = { ...STYLES.font.default, bold: true }
    sheet.mergeCells(`C${row}:F${row}`)
    sheet.getCell(`C${row}`).value = clientName
    sheet.getCell(`C${row}`).font = STYLES.font.default
    sheet.getCell(`C${row}`).alignment = STYLES.alignment.left
    sheet.getRow(row).height = calcWrappedRowHeight(clientName, 18, 60, 14)
    row++
  }

  sheet.mergeCells(`A${row}:B${row}`)
  sheet.getCell(`A${row}`).value = 'Подрядчик:'
  sheet.getCell(`A${row}`).font = { ...STYLES.font.default, bold: true }
  sheet.mergeCells(`C${row}:F${row}`)
  sheet.getCell(`C${row}`).value = companyName
  sheet.getCell(`C${row}`).font = STYLES.font.default
  sheet.getCell(`C${row}`).alignment = STYLES.alignment.left
  sheet.getRow(row).height = calcWrappedRowHeight(companyName, 18, 60, 14)
  row++

  if (address) {
    sheet.mergeCells(`A${row}:B${row}`)
    sheet.getCell(`A${row}`).value = 'Объект:'
    sheet.getCell(`A${row}`).font = { ...STYLES.font.default, bold: true }
    sheet.mergeCells(`C${row}:F${row}`)
    sheet.getCell(`C${row}`).value = address
    sheet.getCell(`C${row}`).font = STYLES.font.default
    sheet.getCell(`C${row}`).alignment = STYLES.alignment.left
    sheet.getRow(row).height = calcWrappedRowHeight(address, 18, 60, 14)
    row++
  }

  sheet.mergeCells(`A${row}:B${row}`)
  sheet.getCell(`A${row}`).value = 'Дата:'
  sheet.getCell(`A${row}`).font = { ...STYLES.font.default, bold: true }
  sheet.getCell(`C${row}`).value = dateStr
  sheet.getCell(`C${row}`).font = STYLES.font.default
  sheet.getCell(`C${row}`).alignment = STYLES.alignment.left
  sheet.getRow(row).height = 18
  row += 2

  // === ЗАГОЛОВКИ ТАБЛИЦЫ ===
  const headerValues = ['№', 'Наименование работ и затрат', 'Ед.', 'Кол-во', 'Цена, руб.', 'Стоимость,\nруб.']
  const headerRow = sheet.getRow(row)
  headerRow.values = headerValues
  headerRow.height = 30
  headerRow.eachCell(cell => {
    cell.font = STYLES.font.header
    cell.border = STYLES.border.thin
    cell.fill = STYLES.fill.header
    cell.alignment = STYLES.alignment.center
  })
  row++

  // Данные
  let rowNum = row
  items.forEach((item, index) => {
    const r = sheet.getRow(rowNum)
    const price = item.price_smeta || item.price || item.material_price || item.labor_price || 0
    const total = item.sum_smeta || item.total || (price * (item.quantity || 0))
    r.values = [
      index + 1,
      item.name,
      item.unit,
      item.quantity,
      price,
      total
    ]
    r.eachCell((cell, colNumber) => {
      cell.font = STYLES.font.default
      cell.border = STYLES.border.thin
      if (colNumber === 2) {
        cell.alignment = { ...STYLES.alignment.left, wrapText: true }
      } else if (colNumber === 4) {
        cell.numFmt = STYLES.numFmt.quantity
        cell.alignment = STYLES.alignment.right
      } else if (colNumber >= 5) {
        cell.numFmt = STYLES.numFmt.currency
        cell.alignment = STYLES.alignment.right
      } else {
        cell.alignment = STYLES.alignment.center
      }
    })
    // Динамическая высота
    const nameLen = (item.name || '').length
    r.height = Math.max(20, Math.ceil(nameLen / 35) * 15)
    rowNum++
  })

  // === ИТОГИ (с borders) ===
  rowNum++
  const addTotalRow = (label, value, bold = false) => {
    const r = sheet.getRow(rowNum)
    sheet.mergeCells(`A${rowNum}:E${rowNum}`)
    r.getCell(1).value = label
    r.getCell(1).font = { ...STYLES.font.default, bold: bold }
    r.getCell(1).alignment = STYLES.alignment.right
    r.getCell(1).border = STYLES.border.thin
    r.getCell(6).value = value
    r.getCell(6).numFmt = STYLES.numFmt.currency
    r.getCell(6).font = { ...STYLES.font.default, bold: bold }
    r.getCell(6).border = STYLES.border.thin
    r.height = 18
    rowNum++
  }

  addTotalRow('Итого материалы:', estimate.total_materials)
  addTotalRow('Итого работы:', estimate.total_works || estimate.total_labor)
  addTotalRow(`Накладные расходы (${estimate.overhead_percent || 0}%):`, estimate.total_overhead || estimate.overhead_amount)
  addTotalRow(`Сметная прибыль (${estimate.profit_percent || 0}%):`, estimate.total_profit || estimate.profit_amount)
  addTotalRow('Итого без НДС:', estimate.total_without_vat || estimate.total_cost)
  addTotalRow(`НДС (${estimate.vat_percent || 0}%):`, estimate.total_vat || estimate.vat_cost)

  rowNum++
  const totalRow = sheet.getRow(rowNum)
  sheet.mergeCells(`A${rowNum}:E${rowNum}`)
  totalRow.getCell(1).value = 'ВСЕГО ПО СМЕТЕ:'
  totalRow.getCell(1).font = STYLES.font.subtitle
  totalRow.getCell(1).alignment = STYLES.alignment.right
  totalRow.getCell(1).border = STYLES.border.medium
  totalRow.getCell(6).value = estimate.total_with_vat
  totalRow.getCell(6).numFmt = '#,##0.00'
  totalRow.getCell(6).font = { name: 'Arial', bold: true, size: 12 }
  totalRow.getCell(6).border = STYLES.border.medium
  totalRow.height = 24
  rowNum += 3

  // === ПОДПИСИ ===
  sheet.getCell(`A${rowNum}`).value = 'Составил:'
  sheet.getCell(`A${rowNum}`).font = { ...STYLES.font.default, bold: true }
  sheet.mergeCells(`B${rowNum}:C${rowNum}`)
  sheet.getCell(`B${rowNum}`).value = '_________________________'
  sheet.getCell(`B${rowNum}`).font = STYLES.font.default
  sheet.getCell(`B${rowNum}`).alignment = STYLES.alignment.center
  sheet.getCell(`D${rowNum}`).value = '/'
  sheet.getCell(`D${rowNum}`).alignment = STYLES.alignment.center
  sheet.mergeCells(`E${rowNum}:F${rowNum}`)
  sheet.getCell(`E${rowNum}`).value = '_________________________'
  sheet.getCell(`E${rowNum}`).font = STYLES.font.default
  sheet.getCell(`E${rowNum}`).alignment = STYLES.alignment.center
  sheet.getRow(rowNum).height = 18
  rowNum++

  sheet.mergeCells(`B${rowNum}:C${rowNum}`)
  sheet.getCell(`B${rowNum}`).value = '(подпись)'
  sheet.getCell(`B${rowNum}`).font = { name: 'Arial', size: 8, italic: true }
  sheet.getCell(`B${rowNum}`).alignment = STYLES.alignment.center
  sheet.mergeCells(`E${rowNum}:F${rowNum}`)
  sheet.getCell(`E${rowNum}`).value = '(ФИО)'
  sheet.getCell(`E${rowNum}`).font = { name: 'Arial', size: 8, italic: true }
  sheet.getCell(`E${rowNum}`).alignment = STYLES.alignment.center
  sheet.getRow(rowNum).height = 14
  rowNum += 2

  sheet.getCell(`A${rowNum}`).value = 'Проверил:'
  sheet.getCell(`A${rowNum}`).font = { ...STYLES.font.default, bold: true }
  sheet.mergeCells(`B${rowNum}:C${rowNum}`)
  sheet.getCell(`B${rowNum}`).value = '_________________________'
  sheet.getCell(`B${rowNum}`).font = STYLES.font.default
  sheet.getCell(`B${rowNum}`).alignment = STYLES.alignment.center
  sheet.getCell(`D${rowNum}`).value = '/'
  sheet.getCell(`D${rowNum}`).alignment = STYLES.alignment.center
  sheet.mergeCells(`E${rowNum}:F${rowNum}`)
  sheet.getCell(`E${rowNum}`).value = '_________________________'
  sheet.getCell(`E${rowNum}`).font = STYLES.font.default
  sheet.getCell(`E${rowNum}`).alignment = STYLES.alignment.center
  sheet.getRow(rowNum).height = 18
  rowNum++

  sheet.mergeCells(`B${rowNum}:C${rowNum}`)
  sheet.getCell(`B${rowNum}`).value = '(подпись)'
  sheet.getCell(`B${rowNum}`).font = { name: 'Arial', size: 8, italic: true }
  sheet.getCell(`B${rowNum}`).alignment = STYLES.alignment.center
  sheet.mergeCells(`E${rowNum}:F${rowNum}`)
  sheet.getCell(`E${rowNum}`).value = '(ФИО)'
  sheet.getCell(`E${rowNum}`).font = { name: 'Arial', size: 8, italic: true }
  sheet.getCell(`E${rowNum}`).alignment = STYLES.alignment.center
  sheet.getRow(rowNum).height = 14

  // Сохраняем
  await workbook.xlsx.writeFile(outputPath)
  return outputPath
}

// === Генерация КС-2 (Унифицированная форма) в Excel ===
const generateKS2Excel = async (act, items, sections, project, estimate, coefficients, outputPath) => {
  const workbook = await loadTemplateWorkbook('DocTemplates/КС-2 2007.xlsx')
  const sheet = getWorksheetByName(workbook, ['КС-2 №1', 'КС-2', 'КС-2 № 1'])

  const workCoef = coefficients?.work_coef || 1.8
  const materialCoef = coefficients?.material_coef || 1.04

  const getPriceSmeta = (item) => {
    if (item && item.price_smeta !== undefined && item.price_smeta !== null) {
      return Number(item.price_smeta) || 0
    }
    const labor = Number(item?.labor_price ?? item?.price ?? 0)
    const material = Number(item?.material_price ?? 0)
    if (labor || material) return (labor * workCoef) + (material * materialCoef)
    return Number(item?.price ?? 0)
  }

  const dateValue = act?.date || estimate?.date || new Date().toISOString()
  const dateObj = toDateValue(dateValue)

  const clientName = project?.client_name || ''
  const investorName = project?.investor_name || clientName
  const contractorName = act?.contractor_name || project?.contractor_name || 'ООО РСК ДОММАСТЕР'
  const address = project?.address || estimate?.address || ''
  const estimateName = estimate?.name || project?.name || 'Ремонтно отделочные работы'
  const objectText = address ? `${estimateName}, ${address}` : estimateName

  sheet.getCell('C6').value = investorName
  sheet.getCell('C8').value = clientName
  sheet.getCell('C10').value = contractorName
  sheet.getCell('C12').value = objectText
  sheet.getCell('C14').value = estimateName

  sheet.getCell('H16').value = act?.contract_number || estimate?.contract_number || ''
  sheet.getCell('H17').value = toDateValue(act?.contract_date || act?.date || estimate?.contract_date || dateValue)

  sheet.getCell('D22').value = act?.number || act?.id || 1
  sheet.getCell('E22').value = dateObj || ''
  sheet.getCell('G22').value = dateObj || ''
  sheet.getCell('H22').value = dateObj || ''

  let totalSmeta = 0
  let totalWork = 0
  let totalMaterial = 0

  ;(items || []).forEach((item) => {
    const qty = Number(item?.quantity) || 0
    const labor = Number(item?.labor_price ?? item?.price ?? 0)
    const material = Number(item?.material_price ?? 0)
    const price = getPriceSmeta(item)
    totalSmeta += price * qty
    totalWork += labor * workCoef * qty
    totalMaterial += material * materialCoef * qty
  })

  sheet.getCell('E24').value = totalSmeta

  const headerRow = findRowByCellText(sheet, 3, 'Наименование работ')
  const dataStart = (() => {
    if (!headerRow) return 29
    for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
      const text = getCellText(sheet.getRow(r).getCell(2)).trim()
      if (text.startsWith('Раздел:')) return r
    }
    return headerRow + 3
  })()
  const totalsRow = findRowByCellText(sheet, 1, 'Итого по разделам')
  const sectionTotalRow = (() => {
    for (let r = dataStart; r <= sheet.rowCount; r++) {
      const text = getCellText(sheet.getRow(r).getCell(1)).trim()
      if (text.startsWith('Итого по разделу')) return r
    }
    return dataStart + 1
  })()

  const sectionSnap = snapshotRowStyle(sheet.getRow(dataStart))
  const itemSnap = snapshotRowStyle(sheet.getRow(dataStart + 1))
  const sectionTotalSnap = snapshotRowStyle(sheet.getRow(sectionTotalRow))
  const blankSnap = snapshotRowStyle(sheet.getRow(sectionTotalRow + 1))

  if (totalsRow && totalsRow > dataStart) {
    sheet.spliceRows(dataStart, totalsRow - dataStart)
  }

  const sectionMap = new Map()
  ;(sections || []).forEach(s => sectionMap.set(s.id, s))
  const sectionItems = new Map()
  ;(items || []).forEach((item) => {
    const sid = item?.section_id || 0
    if (!sectionItems.has(sid)) sectionItems.set(sid, [])
    sectionItems.get(sid).push(item)
  })
  const sectionOrder = []
  if (sections && sections.length) {
    sections.forEach((s) => {
      if (sectionItems.has(s.id)) sectionOrder.push(s.id)
    })
  }
  sectionItems.forEach((_, sid) => {
    if (!sectionOrder.includes(sid)) sectionOrder.push(sid)
  })

  let rowPtr = dataStart
  let sectionIndex = 0

  sectionOrder.forEach((sid, idx) => {
    const secItems = sectionItems.get(sid) || []
    if (!secItems.length) return
    sectionIndex += 1
    const sectionName = sectionMap.get(sid)?.name || (sid === 0 ? 'Без раздела' : 'Раздел')

    const sectionRow = insertStyledRow(sheet, rowPtr, sectionSnap)
    sectionRow.getCell(1).value = sectionIndex
    sectionRow.getCell(2).value = `Раздел: ${sectionName}`
    rowPtr += 1

    let itemIndex = 0
    let sectionTotal = 0
    secItems.forEach((item) => {
      itemIndex += 1
      const qty = Number(item?.quantity) || 0
      const price = getPriceSmeta(item)
      const total = price * qty
      sectionTotal += total

      const itemRow = insertStyledRow(sheet, rowPtr, itemSnap)
      itemRow.getCell(1).value = itemIndex
      itemRow.getCell(2).value = itemIndex
      itemRow.getCell(3).value = item?.name || ''
      itemRow.getCell(5).value = item?.unit || ''
      itemRow.getCell(6).value = qty
      itemRow.getCell(7).value = price
      itemRow.getCell(8).value = total
      rowPtr += 1
    })

    const totalRow = insertStyledRow(sheet, rowPtr, sectionTotalSnap)
    totalRow.getCell(1).value = 'Итого по разделу'
    totalRow.getCell(8).value = sectionTotal
    rowPtr += 1

    if (idx < sectionOrder.length - 1) {
      insertStyledRow(sheet, rowPtr, blankSnap)
      rowPtr += 1
    }
  })

  const totalsRowIndex = findRowByCellText(sheet, 1, 'Итого по разделам')
  if (totalsRowIndex) sheet.getCell(`F${totalsRowIndex}`).value = totalSmeta

  const workRowIndex = findRowByCellText(sheet, 1, 'в т.ч. стоимость работ')
  if (workRowIndex) sheet.getCell(`F${workRowIndex}`).value = totalWork

  const materialRowIndex = findRowByCellText(sheet, 1, 'в т.ч. стоимость материалов')
  if (materialRowIndex) sheet.getCell(`F${materialRowIndex}`).value = totalMaterial

  const otherRowIndex = findRowByCellText(sheet, 1, 'Прочие расходы')
  const otherAmount = 0
  if (otherRowIndex) sheet.getCell(`F${otherRowIndex}`).value = otherAmount

  const totalRowIndex = findRowByCellText(sheet, 1, 'Итого по ведомости')
  if (totalRowIndex) sheet.getCell(`F${totalRowIndex}`).value = totalSmeta + otherAmount

  await workbook.xlsx.writeFile(outputPath)
  return outputPath
}

const generateKS3Excel = async (cert, project, outputPath) => {
  const workbook = await loadTemplateWorkbook('DocTemplates/КС-3 2007.xlsx')
  const sheet = getWorksheetByName(workbook, ['КС-3 №1', 'КС-3', 'КС-3 № 1'])

  const clientName = cert?.client_name || project?.client_name || ''
  const investorName = project?.investor_name || clientName
  const contractorName = cert?.contractor_name || project?.contractor_name || 'ООО РСК ДОММАСТЕР'
  const objectName = cert?.object_name || project?.name || ''
  const address = project?.address || ''
  const objectText = objectName && address ? `${objectName}, ${address}` : (objectName || address)

  const contractNumber = cert?.contract_number || ''
  const contractDate = toDateValue(cert?.contract_date || cert?.date)

  const docNumber = cert?.number || cert?.id || 1
  const docDate = toDateValue(cert?.date)
  const periodFrom = toDateValue(cert?.period_from || cert?.period_start || cert?.date)
  const periodTo = toDateValue(cert?.period_to || cert?.period_end || cert?.date)

  const totalWithoutVat = cert?.total_without_vat ?? cert?.amount_without_vat ?? cert?.amount ?? 0
  const totalWithVat = cert?.total_with_vat ?? cert?.amount ?? totalWithoutVat

  sheet.getCell('I7').value = investorName
  sheet.getCell('I9').value = clientName
  sheet.getCell('I11').value = contractorName
  sheet.getCell('I13').value = objectText

  sheet.getCell('BN16').value = contractNumber
  sheet.getCell('BN17').value = contractDate || ''

  sheet.getCell('AR23').value = docNumber
  sheet.getCell('BC23').value = docDate || ''
  sheet.getCell('BO23').value = periodFrom || ''
  sheet.getCell('BV23').value = periodTo || ''

  sheet.getCell('A34').value = 1
  sheet.getCell('H34').value = objectName || project?.name || ''
  sheet.getCell('AL34').value = cert?.estimate_number || cert?.estimate_code || ''
  sheet.getCell('AP34').value = totalWithoutVat
  sheet.getCell('BC34').value = totalWithoutVat
  sheet.getCell('BP34').value = totalWithVat

  await workbook.xlsx.writeFile(outputPath)
  return outputPath
}

const generateM29Excel = async (project, m29Doc, items, outputPath) => {
  const workbook = await loadTemplateWorkbook('DocTemplates/М-29 2007.xlsx')
  const sheet = getWorksheetByName(workbook, ['М-29 №1', 'М-29', 'М-29 № 1'])

  const contractorName = project?.contractor_name || 'ООО РСК ДОММАСТЕР'
  const clientName = project?.client_name || ''
  const objectName = m29Doc.object_name || project?.name || ''
  const contractNumber = m29Doc.contract_number || ''
  const contractDate = m29Doc.contract_date || ''
  const ks2Number = m29Doc.ks2_number || ''
  const ks2Date = m29Doc.ks2_date || ''
  const periodFrom = m29Doc.period_from || m29Doc.period_start || m29Doc.date
  const periodTo = m29Doc.period_to || m29Doc.period_end || m29Doc.date

  sheet.getCell('A1').value = contractorName
  sheet.getCell('E4').value = m29Doc.number || ''

  sheet.getCell('C7').value = ks2Number ? `${ks2Number}${ks2Date ? ` от ${formatDate(ks2Date)}` : ''}` : ''
  sheet.getCell('F7').value = periodFrom || periodTo ? `с ${formatDate(periodFrom)} по ${formatDate(periodTo)}` : ''

  sheet.getCell('C8').value = contractNumber ? `${contractNumber}${contractDate ? ` от ${formatDate(contractDate)}` : ''}${objectName ? ` (${objectName})` : ''}` : objectName
  sheet.getCell('C9').value = clientName
  sheet.getCell('C11').value = toDateValue(m29Doc.date || new Date().toISOString())

  const headerRow = findRowByCellText(sheet, 3, 'Наименование ресурсов') || 12
  const dataStart = headerRow + 2
  const totalRow = findRowByCellText(sheet, 1, 'Итого по ведомости')

  const itemSnap = snapshotRowStyle(sheet.getRow(dataStart))
  const blankSnap = snapshotRowStyle(sheet.getRow(dataStart + 1))

  if (totalRow && totalRow > dataStart) {
    sheet.spliceRows(dataStart, totalRow - dataStart)
  }

  let rowPtr = dataStart
  const materialItems = items || []
  materialItems.forEach((item, idx) => {
    const normQty = item?.norm_quantity || item?.planned_quantity || item?.quantity || 0
    const actualQty = item?.actual_quantity || item?.fact_quantity || 0
    const deviation = actualQty - normQty

    const row = insertStyledRow(sheet, rowPtr, itemSnap)
    row.getCell(1).value = idx + 1
    row.getCell(2).value = item?.position_no || item?.smeta_position_no || idx + 1
    row.getCell(3).value = item?.name || ''
    row.getCell(4).value = item?.unit || ''
    row.getCell(5).value = normQty
    row.getCell(6).value = actualQty
    row.getCell(7).value = deviation
    rowPtr += 1
  })

  if (materialItems.length === 0) {
    insertStyledRow(sheet, rowPtr, blankSnap)
    rowPtr += 1
  }

  const totalRowIndex = findRowByCellText(sheet, 1, 'Итого по ведомости')
  if (totalRowIndex) {
    sheet.getCell(`A${totalRowIndex}`).value = `Итого по ведомости:  ${materialItems.length} позиций.`
  }

  await workbook.xlsx.writeFile(outputPath)
  return outputPath
}

const generateSmeta2007Excel = async (estimate, items, sections, coefficients, project, companyInfo, outputPath) => {
  const workbook = await loadTemplateWorkbook('DocTemplates/Смета 2007.xlsx')
  const ws = getWorksheetByName(workbook, ['Смета №1', 'Смета № 1', 'Смета'])

  const workCoef = coefficients?.work_coef || 1.8
  const materialCoef = coefficients?.material_coef || 1.04
  const companyName = companyInfo?.name || 'ООО РСК ДОММАСТЕР'
  const director = companyInfo?.director || ''
  const clientName = project?.client_name || estimate?.client_name || 'ЗАО Заказчик'
  const address = project?.address || estimate?.address || ''
  const estimateName = estimate?.name || 'Ремонтно отделочные работы'
  const dateValue = estimate?.date || new Date().toISOString()
  const dateStr = formatDate(dateValue)

  const getPriceSmeta = (item) => {
    if (item && item.price_smeta !== undefined && item.price_smeta !== null) {
      return Number(item.price_smeta) || 0
    }
    const labor = Number(item?.labor_price ?? item?.price ?? 0)
    const material = Number(item?.material_price ?? 0)
    if (labor || material) return (labor * workCoef) + (material * materialCoef)
    return Number(item?.price ?? 0)
  }

  let totalSmetaWork = 0
  let totalSmetaMaterial = 0

  ;(items || []).forEach((item) => {
    const qty = Number(item?.quantity) || 0
    const labor = Number(item?.labor_price ?? item?.price ?? 0)
    const material = Number(item?.material_price ?? 0)
    totalSmetaWork += labor * workCoef * qty
    totalSmetaMaterial += material * materialCoef * qty
  })
  const totalSmeta = totalSmetaWork + totalSmetaMaterial

  ws.getCell('A2').value = `Генеральный директор ${clientName}`
  ws.getCell('C2').value = `Генеральный директор ${companyName}`
  ws.getCell('A3').value = `_________________________ /  /`
  ws.getCell('C3').value = `_________________________ / ${director} /`
  ws.getCell('A4').value = `${dateStr}                            м.п.`
  ws.getCell('C4').value = `${dateStr}                            м.п.`

  ws.getCell('A5').value = `Смета № ${estimate?.number || '1'}`
  ws.getCell('A6').value = address ? `на ${estimateName} по адресу: ${address}` : `на ${estimateName}`
  ws.getCell('A8').value = `к Договору № _____ от ${dateStr}г.`

  ws.getCell('F9').value = totalSmeta
  ws.getCell('F10').value = totalSmetaWork
  ws.getCell('F11').value = totalSmetaMaterial
  ws.getCell('A11').value = `составлена в уровне текущих цен на ${formatMonthYearRu(dateValue)}г.`

  const headerRow = findRowByCellText(ws, 2, 'Наименование работ')
  const dataStart = (() => {
    if (!headerRow) return 15
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const text = getCellText(ws.getRow(r).getCell(2)).trim()
      if (text.startsWith('Раздел:')) return r
    }
    return headerRow + 3
  })()
  const totalsRow = findRowByCellText(ws, 1, 'Итого по разделам')
  const sectionTotalRow = (() => {
    for (let r = dataStart; r <= ws.rowCount; r++) {
      const text = getCellText(ws.getRow(r).getCell(1)).trim()
      if (text.startsWith('Итого по разделу')) return r
    }
    return dataStart + 1
  })()

  const sectionSnap = snapshotRowStyle(ws.getRow(dataStart))
  const itemSnap = snapshotRowStyle(ws.getRow(dataStart + 1))
  const sectionTotalSnap = snapshotRowStyle(ws.getRow(sectionTotalRow))
  const blankSnap = snapshotRowStyle(ws.getRow(sectionTotalRow + 1))

  if (totalsRow && totalsRow > dataStart) {
    ws.spliceRows(dataStart, totalsRow - dataStart)
  }

  const sectionMap = new Map()
  ;(sections || []).forEach(s => sectionMap.set(s.id, s))
  const sectionItems = new Map()
  ;(items || []).forEach((item) => {
    const sid = item?.section_id || 0
    if (!sectionItems.has(sid)) sectionItems.set(sid, [])
    sectionItems.get(sid).push(item)
  })
  const sectionOrder = []
  if (sections && sections.length) {
    sections.forEach((s) => {
      if (sectionItems.has(s.id)) sectionOrder.push(s.id)
    })
  }
  sectionItems.forEach((_, sid) => {
    if (!sectionOrder.includes(sid)) sectionOrder.push(sid)
  })

  let rowPtr = dataStart
  let sectionIndex = 0

  sectionOrder.forEach((sid, idx) => {
    const secItems = sectionItems.get(sid) || []
    if (!secItems.length) return
    sectionIndex += 1
    const sectionName = sectionMap.get(sid)?.name || (sid === 0 ? 'Без раздела' : 'Раздел')

    const sectionRow = insertStyledRow(ws, rowPtr, sectionSnap)
    sectionRow.getCell(1).value = sectionIndex
    sectionRow.getCell(2).value = `Раздел: ${sectionName}`
    rowPtr += 1

    let itemIndex = 0
    let sectionTotal = 0
    secItems.forEach((item) => {
      itemIndex += 1
      const qty = Number(item?.quantity) || 0
      const price = getPriceSmeta(item)
      const total = price * qty
      sectionTotal += total

      const itemRow = insertStyledRow(ws, rowPtr, itemSnap)
      itemRow.getCell(1).value = itemIndex
      itemRow.getCell(2).value = item?.name || ''
      itemRow.getCell(3).value = item?.unit || ''
      itemRow.getCell(4).value = qty
      itemRow.getCell(5).value = price
      itemRow.getCell(6).value = total
      rowPtr += 1
    })

    const totalRow = insertStyledRow(ws, rowPtr, sectionTotalSnap)
    totalRow.getCell(1).value = 'Итого по разделу'
    totalRow.getCell(6).value = sectionTotal
    rowPtr += 1

    if (idx < sectionOrder.length - 1) {
      insertStyledRow(ws, rowPtr, blankSnap)
      rowPtr += 1
    }
  })

  const totalsRowIndex = findRowByCellText(ws, 1, 'Итого по разделам')
  if (totalsRowIndex) ws.getCell(`F${totalsRowIndex}`).value = totalSmeta

  const workRowIndex = findRowByCellText(ws, 1, 'в т.ч. стоимость работ')
  if (workRowIndex) ws.getCell(`F${workRowIndex}`).value = totalSmetaWork

  const materialRowIndex = findRowByCellText(ws, 1, 'в т.ч. стоимость материалов')
  if (materialRowIndex) ws.getCell(`F${materialRowIndex}`).value = totalSmetaMaterial

  const vatRowIndex = findRowByCellText(ws, 1, 'НДС')
  if (vatRowIndex) ws.getCell(`F${vatRowIndex}`).value = 'не облагается'

  const totalRowIndex = findRowByCellText(ws, 1, 'Всего по смете')
  if (totalRowIndex) ws.getCell(`F${totalRowIndex}`).value = totalSmeta

  await workbook.xlsx.writeFile(outputPath)
  return outputPath
}

module.exports = {
  generateEstimateExcel,
  generateKS2Excel,
  generateKS3Excel,
  generateM29Excel,
  generateContractRTF,
  generateEstimateHTML,
  generateEstimateHTMLFile,
  importEstimateFromExcel,
  importDefektovkaFromExcel,
  generateDefektovkaExcel,
  generateFOTExcel,
  generateSmeta2007Excel,
  formatCurrency,
  formatDate,
  formatNumber
}
