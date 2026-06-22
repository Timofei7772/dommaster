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



// === Генерация договора в Word (RTF формат с поддержкой кириллицы) ===

// Функция для конвертации строки в RTF Unicode
const toRtfUnicode = (str) => {
  if (!str) return ''
  return str.split('').map(char => {
    const code = char.charCodeAt(0)
    // ASCII символы оставляем как есть (кроме спецсимволов RTF)
    if (code < 128) {
      if (char === '\\') return '\\\\'
      if (char === '{') return '\\{'
      if (char === '}') return '\\}'
      return char
    }
    // Unicode символы (включая кириллицу) кодируем как \uN?
    return `\\u${code}?`
  }).join('')
}

const generateContractRTF = (contract, project, estimate, company, outputPath) => {
  // Подготовка данных с Unicode кодированием
  // Данные заказчика из договора, проекта или сметы
  const clientName = toRtfUnicode(contract.client || contract.client_name || project?.client_name || estimate?.client_name || 'Заказчик')
  const clientAddress = toRtfUnicode(contract.client_address || project?.address || estimate?.address || '')

  // Данные подрядчика из настроек компании
  const contractorName = toRtfUnicode(company?.name || contract.contractor || 'Подрядчик')
  const contractorAddress = toRtfUnicode(company?.address || '')
  const contractorINN = company?.inn || ''
  const contractorPhone = company?.phone || ''
  const directorName = toRtfUnicode(company?.director || '')
  const directorPosition = toRtfUnicode(company?.directorPosition || 'Директор')
  // Банковские реквизиты
  const bankName = toRtfUnicode(company?.bankName || '')
  const bik = company?.bik || ''
  const checkingAccount = company?.checkingAccount || ''
  const correspondentAccount = company?.correspondentAccount || ''

  // Предмет договора
  const projectName = toRtfUnicode(contract.subject || project?.name || estimate?.name || 'Выполнение строительно-отделочных работ')
  const projectAddress = toRtfUnicode(project?.address || estimate?.address || clientAddress || '')

  // Номера и даты
  const contractNum = toRtfUnicode(contract.number || '')
  const dateStr = toRtfUnicode(formatDate(contract.date))
  const startDateStr = toRtfUnicode(formatDate(contract.start_date || project?.start_date || contract.date))
  const endDateStr = toRtfUnicode(formatDate(contract.end_date || project?.end_date))

  // Суммы
  const amount = contract.amount || contract.total_amount || estimate?.total_with_vat || 0
  const amountStr = toRtfUnicode(formatCurrency(amount))
  const prepayment = contract.prepayment_percent || 30
  const prepaymentAmount = toRtfUnicode(formatCurrency(amount * prepayment / 100))
  const finalAmount = toRtfUnicode(formatCurrency(amount * (100 - prepayment) / 100))

  const rtfContent = `{\\rtf1\\ansi\\ansicpg1251\\deff0\\deflang1049
{\\fonttbl{\\f0\\froman\\fcharset204 Times New Roman;}}
{\\colortbl;\\red0\\green0\\blue0;}
\\viewkind4\\uc1
\\f0\\fs24

\\pard\\qc\\b ${toRtfUnicode('ДОГОВОР ПОДРЯДА')}\\b0\\par
\\pard\\qc ${toRtfUnicode('№')} ${contractNum}\\par
\\pard\\qc ${toRtfUnicode('от')} ${dateStr}\\par
\\par

\\pard\\qj
${projectAddress || toRtfUnicode('г. Москва')}\\tab\\tab\\tab\\tab\\tab\\tab\\tab ${dateStr}\\par
\\par

\\b ${clientName}\\b0, ${toRtfUnicode('именуемый в дальнейшем')} "${toRtfUnicode('Заказчик')}", ${toRtfUnicode('с одной стороны, и')} \\b ${contractorName}\\b0, ${toRtfUnicode('в лице')} ${directorPosition} ${directorName}, ${toRtfUnicode('действующего на основании Устава, именуемый в дальнейшем')} "${toRtfUnicode('Подрядчик')}", ${toRtfUnicode('с другой стороны, заключили настоящий договор о нижеследующем:')}\\par
\\par

\\b 1. ${toRtfUnicode('ПРЕДМЕТ ДОГОВОРА')}\\b0\\par
1.1. ${toRtfUnicode('Подрядчик обязуется выполнить по заданию Заказчика работы:')} \\b ${projectName}\\b0${projectAddress ? `, ${toRtfUnicode('расположенном по адресу:')} ${projectAddress}` : ''}.\\par
1.2. ${toRtfUnicode('Объём и содержание работ определяются Сметой (Приложение №1).')}\\par
\\par

\\b 2. ${toRtfUnicode('СТОИМОСТЬ РАБОТ И ПОРЯДОК РАСЧЁТОВ')}\\b0\\par
2.1. ${toRtfUnicode('Стоимость работ по настоящему договору составляет:')} \\b ${amountStr}\\b0.\\par
2.2. ${toRtfUnicode('Заказчик оплачивает аванс в размере')} ${prepayment}% ${toRtfUnicode('от стоимости работ, что составляет')} ${prepaymentAmount}.\\par
2.3. ${toRtfUnicode('Окончательный расчёт в размере')} ${finalAmount} ${toRtfUnicode('производится в течение 5 рабочих дней после подписания Акта приёмки работ.')}\\par
\\par

\\b 3. ${toRtfUnicode('СРОКИ ВЫПОЛНЕНИЯ РАБОТ')}\\b0\\par
3.1. ${toRtfUnicode('Начало работ:')} ${startDateStr}\\par
3.2. ${toRtfUnicode('Окончание работ:')} ${endDateStr}\\par
\\par

\\b 4. ${toRtfUnicode('ПРАВА И ОБЯЗАННОСТИ СТОРОН')}\\b0\\par
4.1. ${toRtfUnicode('Подрядчик обязуется:')}\\par
- ${toRtfUnicode('выполнить работы качественно и в срок;')}\\par
- ${toRtfUnicode('обеспечить соблюдение технологии работ;')}\\par
- ${toRtfUnicode('устранить выявленные недостатки за свой счёт.')}\\par
4.2. ${toRtfUnicode('Заказчик обязуется:')}\\par
- ${toRtfUnicode('обеспечить доступ к объекту;')}\\par
- ${toRtfUnicode('своевременно оплатить выполненные работы;')}\\par
- ${toRtfUnicode('принять работы по акту.')}\\par
\\par

\\b 5. ${toRtfUnicode('ГАРАНТИЙНЫЕ ОБЯЗАТЕЛЬСТВА')}\\b0\\par
5.1. ${toRtfUnicode('Гарантийный срок на выполненные работы составляет 12 месяцев.')}\\par
\\par

\\b 6. ${toRtfUnicode('РЕКВИЗИТЫ И ПОДПИСИ СТОРОН')}\\b0\\par
\\par
\\b ${toRtfUnicode('Заказчик:')}\\b0\\par
${clientName}\\par
${clientAddress ? `${toRtfUnicode('Адрес:')} ${clientAddress}\\par` : ''}
\\par
___________________ / ${clientName}\\par
\\par
\\b ${toRtfUnicode('Подрядчик:')}\\b0\\par
  ${contractorName}\\par
  ${contractorAddress ? `${toRtfUnicode('Адрес:')} ${contractorAddress}\\par` : ''}
  ${contractorINN ? `${toRtfUnicode('ИНН:')} ${contractorINN}\\par` : ''}
  ${contractorPhone ? `${toRtfUnicode('Тел:')} ${contractorPhone}\\par` : ''}
  ${bankName ? `${toRtfUnicode('Банк:')} ${bankName}\\par` : ''}
  ${bik ? `${toRtfUnicode('БИК:')} ${bik}\\par` : ''}
  ${checkingAccount ? `${toRtfUnicode('Р/с:')} ${checkingAccount}\\par` : ''}
  ${correspondentAccount ? `${toRtfUnicode('К/с:')} ${correspondentAccount}\\par` : ''}
  \\par
  ___________________ / ${directorName || contractorName}\\par
  \\par
  }`

  fs.writeFileSync(outputPath, rtfContent, 'utf-8')
  return outputPath
}

// === Генерация HTML для печати/PDF ===
const formatNumber = (value) => {
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value || 0)
}

const generateEstimateHTML = (estimate, items) => {
  const itemsHTML = (items || []).map((item, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${item.name}</td>
      <td>${item.unit}</td>
      <td>${formatNumber(item.quantity)}</td>
      <td>${formatNumber(item.price)}</td>
      <td>${formatNumber(item.total)}</td>
    </tr>
  `).join('')

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <title>Смета ${estimate.number}</title>
  <style>
    @font-face {
      font-family: 'Arial';
      src: local('Arial'), local('ArialMT'), local('Arial Unicode MS');
    }
    * { 
      font-family: 'Arial', 'Segoe UI', 'Tahoma', 'Verdana', sans-serif !important;
    }
    body { 
      font-family: 'Arial', 'Segoe UI', 'Tahoma', sans-serif !important; 
      font-size: 11pt; 
      margin: 15mm; 
      line-height: 1.4;
    }
    h1 { text-align: center; font-size: 14pt; margin-bottom: 5mm; font-weight: bold; }
    h2 { text-align: center; font-size: 12pt; font-weight: normal; margin-bottom: 10mm; }
    table { width: 100%; border-collapse: collapse; margin-top: 5mm; table-layout: fixed; }
    th, td { border: 1px solid #000; padding: 4px 6px; text-align: left; font-size: 10pt; word-break: break-word; }
    th { background: #e8e8e8; font-weight: bold; }
    td:nth-child(1) { width: 5%; text-align: center; }
    td:nth-child(2) { width: 55%; }
    td:nth-child(3) { width: 8%; text-align: center; }
    td:nth-child(4), td:nth-child(5), td:nth-child(6) { text-align: right; }
    .totals { margin-top: 10mm; }
    .totals td { border: none; padding: 2px 0; }
    .totals td:first-child { text-align: right; padding-right: 10mm; }
    .totals td:last-child { text-align: right; font-weight: bold; }
    .grand-total { font-size: 14pt; font-weight: bold; margin-top: 5mm; }
    @media print { body { margin: 10mm; } }
  </style>
</head>
<body>
  <h1>ЛОКАЛЬНАЯ СМЕТА № ${estimate.number}</h1>
  <h2>${estimate.name}</h2>
  
  <table>
    <thead>
      <tr>
        <th>№</th>
        <th>Наименование работ и затрат</th>
        <th>Ед.</th>
        <th>Кол-во</th>
        <th>Цена, руб.</th>
        <th>Стоимость, руб.</th>
      </tr>
    </thead>
    <tbody>${itemsHTML}</tbody>
  </table>
  
  <table class="totals">
    <tr><td>Итого материалы:</td><td>${formatCurrency(estimate.total_materials)}</td></tr>
    <tr><td>Итого работы:</td><td>${formatCurrency(estimate.total_works)}</td></tr>
    <tr><td>Накладные расходы (${estimate.overhead_percent || 0}%):</td><td>${formatCurrency(estimate.total_overhead)}</td></tr>
    <tr><td>Сметная прибыль (${estimate.profit_percent || 0}%):</td><td>${formatCurrency(estimate.total_profit)}</td></tr>
    <tr><td>Итого без НДС:</td><td>${formatCurrency(estimate.total_without_vat)}</td></tr>
    <tr><td>НДС (${estimate.vat_percent || 0}%):</td><td>${formatCurrency(estimate.total_vat)}</td></tr>
  </table>
  
  <p class="grand-total" style="text-align: right;">ВСЕГО ПО СМЕТЕ: ${formatCurrency(estimate.total_with_vat)}</p>
</body>
</html>`
}

// Сохранить HTML для последующей печати в PDF через Electron
const generateEstimateHTMLFile = (estimate, items, outputPath) => {
  const html = generateEstimateHTML(estimate, items)
  fs.writeFileSync(outputPath, html, 'utf-8')
  return outputPath
}

// === ИМПОРТ СМЕТЫ ИЗ EXCEL ===
/**
 * Парсинг Excel файла сметы и возврат структурированных данных
 * @param {string} filePath - путь к Excel файлу
 * @returns {Promise<{estimate: object, items: array}>}
 */
const importEstimateFromExcel = async (filePath) => {
  if (!fs.existsSync(filePath)) {
    throw new Error('Файл не найден: ' + filePath)
  }

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)

  const sheet = workbook.getWorksheet(1) || workbook.worksheets[0]
  if (!sheet) {
    throw new Error('Не удалось найти лист в Excel файле')
  }

  // Извлекаем данные
  const estimate = {
    name: '',
    number: '',
    items: []
  }

  // Пытаемся найти заголовок сметы (обычно в первых строках)
  const titleCell = sheet.getCell('A1')
  if (titleCell.value) {
    const titleStr = String(titleCell.value)
    // Пример: "ЛОКАЛЬНАЯ СМЕТА № ЛС-001"
    const match = titleStr.match(/№\s*([^\s]+)/i)
    if (match) {
      estimate.number = match[1]
    }
    estimate.name = titleStr
  }

  // Пытаемся найти название из второй строки
  const subtitleCell = sheet.getCell('A2')
  if (subtitleCell.value) {
    estimate.name = String(subtitleCell.value)
  }

  // Поиск строки заголовков таблицы (ищем "Наименование" или "№")
  let headerRowNum = 0
  for (let i = 1; i <= Math.min(20, sheet.rowCount); i++) {
    const row = sheet.getRow(i)
    const firstCell = row.getCell(1).value
    const secondCell = row.getCell(2).value
    const thirdCell = row.getCell(3).value

    // Проверяем типичные заголовки
    if (
      (String(firstCell).toLowerCase().includes('№') || String(firstCell) === '№') &&
      (String(thirdCell).toLowerCase().includes('наименование') ||
        String(secondCell).toLowerCase().includes('шифр'))
    ) {
      headerRowNum = i
      break
    }
  }

  if (headerRowNum === 0) {
    // Если не нашли заголовок, попробуем начать с 4-й строки (типичная позиция)
    headerRowNum = 4
  }

  // Парсим данные начиная со следующей строки после заголовка
  const items = []
  for (let i = headerRowNum + 1; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i)

    // Получаем значения ячеек
    const numCell = row.getCell(1).value
    const codeCell = row.getCell(2).value
    const nameCell = row.getCell(3).value
    const unitCell = row.getCell(4).value
    const qtyCell = row.getCell(5).value
    const priceCell = row.getCell(6).value
    const totalCell = row.getCell(7).value

    // Пропускаем пустые строки и итоговые строки
    if (!nameCell || String(nameCell).toLowerCase().includes('итого')) {
      continue
    }

    // Пропускаем если это не строка данных (нет цифры в первой колонке)
    const num = parseFloat(numCell)
    if (isNaN(num) && !codeCell && !nameCell) {
      continue
    }

    const item = {
      code: codeCell ? String(codeCell) : '',
      name: nameCell ? String(nameCell).trim() : '',
      unit: unitCell ? String(unitCell) : 'шт',
      quantity: parseFloat(qtyCell) || 0,
      unit_price: parseFloat(priceCell) || 0,
      total_price: parseFloat(totalCell) || 0
    }

    // Пересчитываем total если не задан
    if (item.total_price === 0 && item.quantity > 0 && item.unit_price > 0) {
      item.total_price = item.quantity * item.unit_price
    }

    // Добавляем только если есть название
    if (item.name) {
      items.push(item)
    }
  }

  estimate.items = items

  return estimate
}

// === ИМПОРТ ДЕФЕКТОВКИ (формат Смета 2007) ===
/**
 * Парсинг дефектовки формата Смета 2007 с автоматическим извлечением коэффициентов
 * Распознаёт формат по характерным признакам: коэффициенты в A1/A2, столбец H с типом (дс/м)
 * @param {string} filePath - путь к Excel файлу
 * @returns {Promise<{estimate: object, items: array, sections: array, coefficients: object}>}
 */
const importDefektovkaFromExcel = async (filePath) => {
  if (!fs.existsSync(filePath)) {
    throw new Error('Файл не найден: ' + filePath)
  }

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)

  // Ищем лист "Дефектовка" или берём первый
  let sheet = null
  for (const ws of workbook.worksheets) {
    if (ws.name.toLowerCase().includes('дефектовка')) {
      sheet = ws
      break
    }
  }
  if (!sheet) {
    sheet = workbook.worksheets[0]
  }

  if (!sheet) {
    throw new Error('Не удалось найти лист в Excel файле')
  }

  // Результат
  const result = {
    estimate: { name: '', number: '' },
    items: [],
    sections: [],
    coefficients: {
      work_coef: 1.8,      // По умолчанию как в Смета 2007
      material_coef: 1.04  // По умолчанию как в Смета 2007
    },
    isSmeta2007Format: false
  }

  // === Определяем формат Смета 2007 по характерным признакам ===
  // A1 содержит коэффициент работ (1.8), B1 = "Коэфф. для стоимости работ"
  // A2 содержит коэффициент материалов (1.04), B2 = "Коэфф. для стоимости материалов"
  const a1 = sheet.getCell('A1').value
  const b1 = String(sheet.getCell('B1').value || '').toLowerCase()
  const a2 = sheet.getCell('A2').value
  const b2 = String(sheet.getCell('B2').value || '').toLowerCase()

  if (b1.includes('коэфф') && b1.includes('работ')) {
    result.coefficients.work_coef = parseFloat(a1) || 1.8
    result.isSmeta2007Format = true
  }
  if (b2.includes('коэфф') && b2.includes('материал')) {
    result.coefficients.material_coef = parseFloat(a2) || 1.04
    result.isSmeta2007Format = true
  }

  // Извлекаем номер сметы из G2
  const g2 = sheet.getCell('G2').value
  if (g2 && String(g2).includes('См. стоимост')) {
    // Есть блок сметной стоимости — формат Смета 2007
    result.isSmeta2007Format = true
  }

  // === Ищем заголовок таблицы (строка с "№ п/п", "Наименование") ===
  let headerRow = 0
  for (let r = 1; r <= Math.min(15, sheet.rowCount); r++) {
    const cellA = String(sheet.getCell(r, 1).value || '').toLowerCase()
    const cellB = String(sheet.getCell(r, 2).value || '').toLowerCase()
    if ((cellA.includes('№') || cellA.includes('п/п')) &&
      (cellB.includes('наименование') || cellB.includes('работ'))) {
      headerRow = r
      break
    }
  }

  // Если не нашли - пробуем строку 6 (типичная для Смета 2007)
  if (headerRow === 0) {
    const cellA6 = String(sheet.getCell(6, 1).value || '').toLowerCase()
    if (cellA6.includes('№') || cellA6.includes('п/п')) {
      headerRow = 6
    }
  }

  if (headerRow === 0) {
    headerRow = 6 // Запасной вариант
  }

  // === Парсим данные ===
  // Структура Смета 2007:
  // A: № п/п, B: Наименование, C: ед.изм, D: Кол-во, E: Цена, F: Стоимость
  // H: тип (дс = работа, м = материал), I: Сметная цена (с коэфф.)

  let currentSection = null
  const items = []
  const sections = []

  for (let r = headerRow + 2; r <= sheet.rowCount; r++) {
    const cellA = sheet.getCell(r, 1).value
    const cellB = String(sheet.getCell(r, 2).value || '').trim()
    const cellC = String(sheet.getCell(r, 3).value || '').trim()
    const cellD = sheet.getCell(r, 4).value
    const cellE = sheet.getCell(r, 5).value
    const cellF = sheet.getCell(r, 6).value
    const cellH = String(sheet.getCell(r, 8).value || '').trim().toLowerCase()
    const cellI = sheet.getCell(r, 9).value

    // Пропускаем пустые строки
    if (!cellA && !cellB) continue

    // Проверяем - это раздел?
    const isSection = cellB.toLowerCase().startsWith('раздел:') ||
      (cellA && String(cellA).match(/^\d+$/) && !cellC && !cellD)

    if (isSection) {
      // Это название раздела
      let sectionName = cellB.replace(/^раздел:\s*/i, '').trim()
      if (!sectionName && cellA) {
        // Номер раздела без названия - берём следующую строку
        const nextB = String(sheet.getCell(r + 1, 2).value || '').trim()
        if (nextB.toLowerCase().startsWith('раздел:')) {
          sectionName = nextB.replace(/^раздел:\s*/i, '').trim()
        } else {
          sectionName = `Раздел ${cellA}`
        }
      }

      if (sectionName) {
        currentSection = {
          name: sectionName,
          sortOrder: sections.length
        }
        sections.push(currentSection)
      }
      continue
    }

    // Проверяем итоговые строки
    const lowerB = cellB.toLowerCase()
    if (lowerB.includes('итого') || lowerB.includes('в т.ч.') || lowerB === '') {
      continue
    }

    // Это позиция сметы
    const num = parseFloat(cellA)
    if (isNaN(num) && !cellB) continue

    // Определяем тип: работа или материал
    let itemType = 'work' // По умолчанию работа
    if (cellH === 'м' || cellH === 'mat' || cellH === 'материал') {
      itemType = 'material'
    }

    const basePrice = parseFloat(cellE) || 0
    const quantity = parseFloat(cellD) || 0

    // Сметная цена - либо из колонки I, либо рассчитываем
    let estimatePrice = parseFloat(cellI) || 0
    if (estimatePrice === 0 && basePrice > 0) {
      // Рассчитываем сметную цену с коэффициентом
      if (itemType === 'material') {
        estimatePrice = basePrice * result.coefficients.material_coef
      } else {
        estimatePrice = basePrice * result.coefficients.work_coef
      }
    }

    const item = {
      code: '',
      name: cellB,
      unit: cellC || 'шт',
      quantity: quantity,
      unit_price: basePrice,
      estimate_price: estimatePrice,
      total_price: (parseFloat(cellF) || 0),
      estimate_total: estimatePrice * quantity,
      type: itemType,
      section: currentSection ? currentSection.name : null,
      sectionIndex: currentSection ? sections.indexOf(currentSection) : -1
    }

    // Автозаполнение total если не задано
    if (item.total_price === 0 && quantity > 0 && basePrice > 0) {
      item.total_price = quantity * basePrice
    }
    if (item.estimate_total === 0 && quantity > 0 && estimatePrice > 0) {
      item.estimate_total = quantity * estimatePrice
    }

    if (item.name) {
      items.push(item)
    }
  }

  // Извлекаем название сметы из имени файла или листа
  const fileName = filePath.split(/[/\\]/).pop().replace('.xlsx', '').replace('.xls', '')
  result.estimate.name = `Импорт: ${fileName}`
  result.estimate.number = `ИМП-${Date.now().toString().slice(-6)}`
  result.items = items
  result.sections = sections

  // Пересчёт итогов
  let totalWork = 0
  let totalMaterial = 0
  items.forEach(item => {
    if (item.type === 'material') {
      totalMaterial += item.estimate_total
    } else {
      totalWork += item.estimate_total
    }
  })
  result.totals = {
    work: totalWork,
    material: totalMaterial,
    total: totalWork + totalMaterial
  }

  return result
}

// === ЭКСПОРТ ДЕФЕКТОВКИ (формат по образцу пользователя, 10 колонок) ===
/**
 * Генерация дефектовки с 10 колонками:
 * A-F: базовые данные, G: разделитель, H: k(тип), I-J: сметные цены
 * @param {object} estimate - смета
 * @param {array} items - позиции сметы
 * @param {array} sections - разделы сметы
 * @param {object} coefficients - коэффициенты
 * @param {object} project - проект (client_name, address)
 * @param {object} companyInfo - данные компании
 * @param {string} outputPath - путь для сохранения
 */
const generateDefektovkaExcel = async (estimate, items, sections, coefficients, project, companyInfo, outputPath) => {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'ZARU Смета'

  // Коэффициенты по умолчанию
  const workCoef = coefficients?.work_coef || 2
  const materialCoef = coefficients?.material_coef || 1
  const overheadPercent = coefficients?.overhead_percent || 0.05

  const dateStr = formatDate(new Date().toISOString())
  const clientName = project?.client_name || estimate?.client_name || ''
  const address = project?.address || estimate?.address || ''
  const companyName = companyInfo?.name || 'ООО ПОДРЯДЧИК'

  // === ЛИСТ 1: Дефектовка ===
  const defSheet = workbook.addWorksheet('Дефектовка №1', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true }
  })

  // Ширина колонок (A-J) - увеличены для читаемости
  defSheet.columns = [
    { width: 5.14 },  // A - № п/п
    { width: 58.43 }, // B - Наименование
    { width: 7.57 },  // C - ед. изм.
    { width: 10.57 }, // D - Кол-во
    { width: 15 },    // E - Цена
    { width: 16 },    // F - Стоимость
    { width: 3.43 },  // G - разделитель
    { width: 11.57 }, // H - k (тип)
    { width: 16 },    // I - Сметная цена
    { width: 16 }     // J - Сметная стоимость
  ]

  // === ЗАГОЛОВОК ДЕФЕКТОВКИ ===
  defSheet.mergeCells('A1:J1')
  defSheet.getCell('A1').value = `ДЕФЕКТОВКА № ${estimate.number || 'Б/Н'}`
  defSheet.getCell('A1').font = { name: 'Arial', size: 14, bold: true }
  defSheet.getCell('A1').alignment = STYLES.alignment.center
  defSheet.getCell('A1').border = STYLES.border.thin
  defSheet.getRow(1).height = 28

  defSheet.mergeCells('A2:J2')
  defSheet.getCell('A2').value = estimate.name || 'Ремонтно-отделочные работы'
  defSheet.getCell('A2').font = { name: 'Arial', size: 10, italic: true }
  defSheet.getCell('A2').alignment = STYLES.alignment.center
  defSheet.getRow(2).height = 20

  // Реквизиты (строки 3-6)
  const setInfoRow = (rowIndex, label, value) => {
    const valueText = value || ''
    defSheet.getCell(`A${rowIndex}`).value = label
    defSheet.getCell(`A${rowIndex}`).font = { ...STYLES.font.default, bold: true }
    defSheet.mergeCells(`B${rowIndex}:F${rowIndex}`)
    const valueCell = defSheet.getCell(`B${rowIndex}`)
    valueCell.value = valueText
    valueCell.font = STYLES.font.default
    valueCell.alignment = STYLES.alignment.left
    defSheet.getRow(rowIndex).height = calcWrappedRowHeight(valueText, 18, 60, 14)
  }

  let infoRow = 3
  if (clientName) {
    setInfoRow(infoRow, 'Заказчик:', clientName)
    infoRow++
  }
  setInfoRow(infoRow, 'Подрядчик:', companyName)
  infoRow++

  if (address) {
    setInfoRow(infoRow, 'Объект:', address)
    infoRow++
  }

  setInfoRow(infoRow, 'Дата:', dateStr)
  infoRow++

  // === КОЭФФИЦИЕНТЫ (перенесены ниже заголовка) ===
  infoRow++ // пустая строка
  const coefStartRow = infoRow
  defSheet.getCell(`A${coefStartRow}`).value = workCoef
  defSheet.getCell(`A${coefStartRow}`).font = { ...STYLES.font.default, bold: true }
  defSheet.getCell(`B${coefStartRow}`).value = 'Коэфф. для стоимости работ'
  defSheet.getCell(`B${coefStartRow}`).font = STYLES.font.default
  defSheet.mergeCells(`C${coefStartRow}:D${coefStartRow}`)
  defSheet.getCell(`C${coefStartRow}`).value = 'Трудозатр, чел/час:'
  defSheet.getCell(`C${coefStartRow}`).font = STYLES.font.small
  defSheet.getCell(`E${coefStartRow}`).value = 0
  defSheet.getCell(`E${coefStartRow}`).font = STYLES.font.default
  defSheet.getCell(`G${coefStartRow}`).value = 'Работа'
  defSheet.getCell(`G${coefStartRow}`).font = { ...STYLES.font.default, bold: true }
  defSheet.getCell(`I${coefStartRow}`).value = 'Материал'
  defSheet.getCell(`I${coefStartRow}`).font = { ...STYLES.font.default, bold: true }
  defSheet.getCell(`J${coefStartRow}`).value = 'Всего'
  defSheet.getCell(`J${coefStartRow}`).font = { ...STYLES.font.default, bold: true }
  defSheet.getRow(coefStartRow).height = 18

  const coefRow2 = coefStartRow + 1
  defSheet.getCell(`A${coefRow2}`).value = materialCoef
  defSheet.getCell(`A${coefRow2}`).font = { ...STYLES.font.default, bold: true }
  defSheet.getCell(`B${coefRow2}`).value = 'Коэфф. для стоимости материалов'
  defSheet.getCell(`B${coefRow2}`).font = STYLES.font.default
  defSheet.mergeCells(`C${coefRow2}:D${coefRow2}`)
  defSheet.getCell(`C${coefRow2}`).value = 'Мат-лы, тонн:'
  defSheet.getCell(`C${coefRow2}`).font = STYLES.font.small
  defSheet.getCell(`E${coefRow2}`).value = 0
  defSheet.getCell(`E${coefRow2}`).font = STYLES.font.default
  defSheet.mergeCells(`F${coefRow2}:H${coefRow2}`)
  defSheet.getCell(`F${coefRow2}`).value = 'См. стоимость:'
  defSheet.getCell(`F${coefRow2}`).font = { ...STYLES.font.default, bold: true }
  defSheet.getRow(coefRow2).height = 18

  const coefRow3 = coefStartRow + 2
  defSheet.mergeCells(`C${coefRow3}:D${coefRow3}`)
  defSheet.getCell(`C${coefRow3}`).value = 'Мусор, тонн:'
  defSheet.getCell(`C${coefRow3}`).font = STYLES.font.small
  defSheet.getCell(`E${coefRow3}`).value = 0
  defSheet.getCell(`E${coefRow3}`).font = STYLES.font.default
  defSheet.mergeCells(`F${coefRow3}:H${coefRow3}`)
  defSheet.getCell(`F${coefRow3}`).value = 'План. затраты:'
  defSheet.getCell(`F${coefRow3}`).font = { ...STYLES.font.default, bold: true }
  defSheet.getRow(coefRow3).height = 18

  // Пустая строка после коэффициентов
  const tableHeaderRow = coefRow3 + 2

  // Заголовки таблицы
  const headers = ['№ п/п', 'Наименование работ, материалов, затрат', 'ед. изм.', 'Кол-во', 'Цена', 'Стоимость', '', 'k', 'Сметная цена', 'Сметная стоимость']
  const headerRow = defSheet.getRow(tableHeaderRow)
  headerRow.values = headers
  headerRow.height = 30
  headers.forEach((_, idx) => {
    const cell = headerRow.getCell(idx + 1)
    cell.font = STYLES.font.header
    cell.alignment = STYLES.alignment.center
    if (idx !== 6) {
      cell.border = STYLES.border.thin
      cell.fill = STYLES.fill.header
    }
  })

  // Номера колонок
  const colNumRow = tableHeaderRow + 1
  const colNumbers = ['1', '2', '3', '4', '5', '6', '', '', '5', '6']
  defSheet.getRow(colNumRow).values = colNumbers
  defSheet.getRow(colNumRow).height = 18
  colNumbers.forEach((val, idx) => {
    const cell = defSheet.getRow(colNumRow).getCell(idx + 1)
    cell.font = STYLES.font.small
    cell.alignment = STYLES.alignment.center
    if (val && idx !== 6 && idx !== 7) {
      cell.border = STYLES.border.thin
    }
  })

  let rowNum = colNumRow + 2
  let sectionNum = 1
  let totalWorks = 0
  let totalMaterials = 0
  let totalSmetaWorks = 0
  let totalSmetaMaterials = 0

  // Группируем позиции по разделам
  const sectionMap = new Map()
  sections?.forEach(s => sectionMap.set(s.id, s))

  // Позиции без раздела
  const unassignedItems = items.filter(i => !i.section_id)
  // Позиции с разделами
  const assignedItems = items.filter(i => i.section_id)

  // Уникальные разделы с позициями
  const usedSectionIds = [...new Set(assignedItems.map(i => i.section_id))]

  // Функция для добавления позиции с 10 колонками
  const addItemRow = (sheet, row, num, item) => {
    const laborPrice = item.labor_price || 0
    const materialPrice = item.material_price || 0
    const qty = item.quantity || 1
    const basePrice = laborPrice + materialPrice
    const baseTotal = basePrice * qty

    const isLabor = laborPrice > 0
    const kType = isLabor ? 'дс' : 'м'
    const smetaPrice = laborPrice * workCoef + materialPrice * materialCoef
    const smetaTotal = smetaPrice * qty

    const r = sheet.getRow(row)
    r.values = [
      num,
      item.name,
      item.unit || 'шт.',
      qty,
      basePrice,
      baseTotal,
      '',
      kType,
      smetaPrice,
      smetaTotal
    ]
    // Динамическая высота строки
    const nameLength = (item.name || '').length
    r.height = Math.max(22, Math.ceil(nameLength / 35) * 15)

    for (let col = 1; col <= 10; col++) {
      const cell = r.getCell(col)
      cell.font = STYLES.font.default
      if (col !== 7) {
        cell.border = STYLES.border.thin
      }
      // Выравнивание
      if (col === 2) {
        cell.alignment = STYLES.alignment.left // Название - слева с переносом
      } else {
        cell.alignment = STYLES.alignment.center
      }
      // Форматирование чисел
      if (col >= 4 && col <= 6) cell.numFmt = STYLES.numFmt.currency
      if (col >= 9 && col <= 10) cell.numFmt = STYLES.numFmt.currency
    }

    return {
      laborTotal: laborPrice * qty,
      materialTotal: materialPrice * qty,
      smetaLaborTotal: laborPrice * workCoef * qty,
      smetaMaterialTotal: materialPrice * materialCoef * qty
    }
  }

  // Обрабатываем разделы
  for (const sectionId of usedSectionIds) {
    const section = sectionMap.get(sectionId)
    const sectionName = section?.name || 'Раздел'
    const sectionItems = assignedItems.filter(i => i.section_id === sectionId)

    // Заголовок раздела
    defSheet.getCell(`A${rowNum}`).value = sectionNum
    defSheet.getCell(`A${rowNum}`).font = { ...STYLES.font.default, bold: true }
    defSheet.mergeCells(`B${rowNum}:F${rowNum}`)
    defSheet.getCell(`B${rowNum}`).value = `Раздел: ${sectionName}`
    defSheet.getCell(`B${rowNum}`).font = STYLES.font.header
    defSheet.getRow(rowNum).height = 20
    rowNum += 2

    let sectionWorksTotal = 0
    let sectionMaterialsTotal = 0
    let sectionSmetaWorksTotal = 0
    let sectionSmetaMaterialsTotal = 0
    let itemNum = 1

    // Позиции раздела
    for (const item of sectionItems) {
      const totals = addItemRow(defSheet, rowNum, itemNum, item)
      sectionWorksTotal += totals.laborTotal
      sectionMaterialsTotal += totals.materialTotal
      sectionSmetaWorksTotal += totals.smetaLaborTotal
      sectionSmetaMaterialsTotal += totals.smetaMaterialTotal
      rowNum++
      itemNum++
    }

    rowNum++

    // Итого по разделу
    defSheet.mergeCells(`A${rowNum}:E${rowNum}`)
    defSheet.getCell(`A${rowNum}`).value = 'Итого по разделу:'
    defSheet.getCell(`A${rowNum}`).font = { ...STYLES.font.default, bold: true }
    defSheet.getCell(`A${rowNum}`).alignment = STYLES.alignment.right
    defSheet.getCell(`F${rowNum}`).value = sectionWorksTotal + sectionMaterialsTotal
    defSheet.getCell(`F${rowNum}`).numFmt = STYLES.numFmt.currency
    defSheet.getCell(`F${rowNum}`).font = { ...STYLES.font.default, bold: true }
    defSheet.getCell(`J${rowNum}`).value = sectionSmetaWorksTotal + sectionSmetaMaterialsTotal
    defSheet.getCell(`J${rowNum}`).numFmt = STYLES.numFmt.currency
    defSheet.getCell(`J${rowNum}`).font = { ...STYLES.font.default, bold: true }
    defSheet.getRow(rowNum).height = 18
    rowNum++

    defSheet.mergeCells(`A${rowNum}:E${rowNum}`)
    defSheet.getCell(`A${rowNum}`).value = 'в т.ч. стоимость работ:'
    defSheet.getCell(`A${rowNum}`).font = STYLES.font.default
    defSheet.getCell(`A${rowNum}`).alignment = STYLES.alignment.right
    defSheet.getCell(`F${rowNum}`).value = sectionWorksTotal
    defSheet.getCell(`F${rowNum}`).numFmt = STYLES.numFmt.currency
    defSheet.getCell(`F${rowNum}`).font = STYLES.font.default
    defSheet.getCell(`J${rowNum}`).value = sectionSmetaWorksTotal
    defSheet.getCell(`J${rowNum}`).numFmt = STYLES.numFmt.currency
    defSheet.getCell(`J${rowNum}`).font = STYLES.font.default
    defSheet.getRow(rowNum).height = 18
    rowNum++

    defSheet.mergeCells(`A${rowNum}:E${rowNum}`)
    defSheet.getCell(`A${rowNum}`).value = 'в т.ч. стоимость материалов:'
    defSheet.getCell(`A${rowNum}`).font = STYLES.font.default
    defSheet.getCell(`A${rowNum}`).alignment = STYLES.alignment.right
    defSheet.getCell(`F${rowNum}`).value = sectionMaterialsTotal
    defSheet.getCell(`F${rowNum}`).numFmt = STYLES.numFmt.currency
    defSheet.getCell(`F${rowNum}`).font = STYLES.font.default
    defSheet.getCell(`J${rowNum}`).value = sectionSmetaMaterialsTotal
    defSheet.getCell(`J${rowNum}`).numFmt = STYLES.numFmt.currency
    defSheet.getCell(`J${rowNum}`).font = STYLES.font.default
    defSheet.getRow(rowNum).height = 18
    rowNum += 2

    totalWorks += sectionWorksTotal
    totalMaterials += sectionMaterialsTotal
    totalSmetaWorks += sectionSmetaWorksTotal
    totalSmetaMaterials += sectionSmetaMaterialsTotal
    sectionNum++
  }

  // Позиции без раздела (если есть)
  if (unassignedItems.length > 0) {
    defSheet.getCell(`A${rowNum}`).value = sectionNum
    defSheet.getCell(`A${rowNum}`).font = { ...STYLES.font.default, bold: true }
    defSheet.mergeCells(`B${rowNum}:F${rowNum}`)
    defSheet.getCell(`B${rowNum}`).value = 'Раздел: Прочие работы'
    defSheet.getCell(`B${rowNum}`).font = STYLES.font.header
    defSheet.getRow(rowNum).height = 20
    rowNum += 2

    let sectionWorksTotal = 0
    let sectionMaterialsTotal = 0
    let sectionSmetaWorksTotal = 0
    let sectionSmetaMaterialsTotal = 0
    let itemNum = 1

    for (const item of unassignedItems) {
      const totals = addItemRow(defSheet, rowNum, itemNum, item)
      sectionWorksTotal += totals.laborTotal
      sectionMaterialsTotal += totals.materialTotal
      sectionSmetaWorksTotal += totals.smetaLaborTotal
      sectionSmetaMaterialsTotal += totals.smetaMaterialTotal
      rowNum++
      itemNum++
    }

    rowNum++

    // Итого по разделу
    defSheet.mergeCells(`A${rowNum}:E${rowNum}`)
    defSheet.getCell(`A${rowNum}`).value = 'Итого по разделу:'
    defSheet.getCell(`A${rowNum}`).font = { ...STYLES.font.default, bold: true }
    defSheet.getCell(`A${rowNum}`).alignment = STYLES.alignment.right
    defSheet.getCell(`F${rowNum}`).value = sectionWorksTotal + sectionMaterialsTotal
    defSheet.getCell(`F${rowNum}`).numFmt = STYLES.numFmt.currency
    defSheet.getCell(`F${rowNum}`).font = { ...STYLES.font.default, bold: true }
    defSheet.getCell(`J${rowNum}`).value = sectionSmetaWorksTotal + sectionSmetaMaterialsTotal
    defSheet.getCell(`J${rowNum}`).numFmt = STYLES.numFmt.currency
    defSheet.getCell(`J${rowNum}`).font = { ...STYLES.font.default, bold: true }
    defSheet.getRow(rowNum).height = 18
    rowNum++

    defSheet.mergeCells(`A${rowNum}:E${rowNum}`)
    defSheet.getCell(`A${rowNum}`).value = 'в т.ч. стоимость работ:'
    defSheet.getCell(`A${rowNum}`).font = STYLES.font.default
    defSheet.getCell(`A${rowNum}`).alignment = STYLES.alignment.right
    defSheet.getCell(`F${rowNum}`).value = sectionWorksTotal
    defSheet.getCell(`F${rowNum}`).numFmt = STYLES.numFmt.currency
    defSheet.getCell(`F${rowNum}`).font = STYLES.font.default
    defSheet.getCell(`J${rowNum}`).value = sectionSmetaWorksTotal
    defSheet.getCell(`J${rowNum}`).numFmt = STYLES.numFmt.currency
    defSheet.getCell(`J${rowNum}`).font = STYLES.font.default
    defSheet.getRow(rowNum).height = 18
    rowNum++

    defSheet.mergeCells(`A${rowNum}:E${rowNum}`)
    defSheet.getCell(`A${rowNum}`).value = 'в т.ч. стоимость материалов:'
    defSheet.getCell(`A${rowNum}`).font = STYLES.font.default
    defSheet.getCell(`A${rowNum}`).alignment = STYLES.alignment.right
    defSheet.getCell(`F${rowNum}`).value = sectionMaterialsTotal
    defSheet.getCell(`F${rowNum}`).numFmt = STYLES.numFmt.currency
    defSheet.getCell(`F${rowNum}`).font = STYLES.font.default
    defSheet.getCell(`J${rowNum}`).value = sectionSmetaMaterialsTotal
    defSheet.getCell(`J${rowNum}`).numFmt = STYLES.numFmt.currency
    defSheet.getCell(`J${rowNum}`).font = STYLES.font.default
    defSheet.getRow(rowNum).height = 18
    rowNum += 2

    totalWorks += sectionWorksTotal
    totalMaterials += sectionMaterialsTotal
    totalSmetaWorks += sectionSmetaWorksTotal
    totalSmetaMaterials += sectionSmetaMaterialsTotal
  }

  // === ИТОГИ ===
  rowNum++

  // Итого по всем разделам
  defSheet.mergeCells(`A${rowNum}:E${rowNum}`)
  defSheet.getCell(`A${rowNum}`).value = 'Итого по разделам:'
  defSheet.getCell(`A${rowNum}`).font = { ...STYLES.font.header, size: 11 }
  defSheet.getCell(`A${rowNum}`).alignment = STYLES.alignment.right
  defSheet.getCell(`A${rowNum}`).border = STYLES.border.thin
  defSheet.getCell(`F${rowNum}`).value = totalWorks + totalMaterials
  defSheet.getCell(`F${rowNum}`).numFmt = STYLES.numFmt.currency
  defSheet.getCell(`F${rowNum}`).font = { ...STYLES.font.default, bold: true }
  defSheet.getCell(`F${rowNum}`).border = STYLES.border.thin
  defSheet.getCell(`J${rowNum}`).value = totalSmetaWorks + totalSmetaMaterials
  defSheet.getCell(`J${rowNum}`).numFmt = STYLES.numFmt.currency
  defSheet.getCell(`J${rowNum}`).font = { ...STYLES.font.default, bold: true }
  defSheet.getCell(`J${rowNum}`).border = STYLES.border.thin
  defSheet.getRow(rowNum).height = 20
  rowNum++

  defSheet.mergeCells(`A${rowNum}:E${rowNum}`)
  defSheet.getCell(`A${rowNum}`).value = 'в т.ч. стоимость работ:'
  defSheet.getCell(`A${rowNum}`).font = STYLES.font.default
  defSheet.getCell(`A${rowNum}`).alignment = STYLES.alignment.right
  defSheet.getCell(`A${rowNum}`).border = STYLES.border.thin
  defSheet.getCell(`F${rowNum}`).value = totalWorks
  defSheet.getCell(`F${rowNum}`).numFmt = STYLES.numFmt.currency
  defSheet.getCell(`F${rowNum}`).font = STYLES.font.default
  defSheet.getCell(`F${rowNum}`).border = STYLES.border.thin
  defSheet.getCell(`J${rowNum}`).value = totalSmetaWorks
  defSheet.getCell(`J${rowNum}`).numFmt = STYLES.numFmt.currency
  defSheet.getCell(`J${rowNum}`).font = STYLES.font.default
  defSheet.getCell(`J${rowNum}`).border = STYLES.border.thin
  defSheet.getRow(rowNum).height = 18
  rowNum++

  defSheet.mergeCells(`A${rowNum}:E${rowNum}`)
  defSheet.getCell(`A${rowNum}`).value = 'в т.ч. стоимость материалов:'
  defSheet.getCell(`A${rowNum}`).font = STYLES.font.default
  defSheet.getCell(`A${rowNum}`).alignment = STYLES.alignment.right
  defSheet.getCell(`A${rowNum}`).border = STYLES.border.thin
  defSheet.getCell(`F${rowNum}`).value = totalMaterials
  defSheet.getCell(`F${rowNum}`).numFmt = STYLES.numFmt.currency
  defSheet.getCell(`F${rowNum}`).font = STYLES.font.default
  defSheet.getCell(`F${rowNum}`).border = STYLES.border.thin
  defSheet.getCell(`J${rowNum}`).value = totalSmetaMaterials
  defSheet.getCell(`J${rowNum}`).numFmt = STYLES.numFmt.currency
  defSheet.getCell(`J${rowNum}`).font = STYLES.font.default
  defSheet.getCell(`J${rowNum}`).border = STYLES.border.thin
  defSheet.getRow(rowNum).height = 18
  rowNum += 2

  // Прочие расходы
  const overhead = (totalWorks + totalMaterials) * overheadPercent
  const smetaOverhead = (totalSmetaWorks + totalSmetaMaterials) * overheadPercent
  defSheet.mergeCells(`A${rowNum}:E${rowNum}`)
  defSheet.getCell(`A${rowNum}`).value = 'Прочие расходы:'
  defSheet.getCell(`A${rowNum}`).font = STYLES.font.default
  defSheet.getCell(`A${rowNum}`).alignment = STYLES.alignment.right
  defSheet.getCell(`A${rowNum}`).border = STYLES.border.thin
  defSheet.getCell(`C${rowNum}`).value = overheadPercent
  defSheet.getCell(`C${rowNum}`).numFmt = '0%'
  defSheet.getCell(`F${rowNum}`).value = overhead
  defSheet.getCell(`F${rowNum}`).numFmt = STYLES.numFmt.currency
  defSheet.getCell(`F${rowNum}`).font = STYLES.font.default
  defSheet.getCell(`F${rowNum}`).border = STYLES.border.thin
  defSheet.getCell(`J${rowNum}`).value = smetaOverhead
  defSheet.getCell(`J${rowNum}`).numFmt = STYLES.numFmt.currency
  defSheet.getCell(`J${rowNum}`).font = STYLES.font.default
  defSheet.getCell(`J${rowNum}`).border = STYLES.border.thin
  defSheet.getRow(rowNum).height = 18
  rowNum++

  // Итого по ведомости
  defSheet.mergeCells(`A${rowNum}:E${rowNum}`)
  defSheet.getCell(`A${rowNum}`).value = 'Итого по ведомости:'
  defSheet.getCell(`A${rowNum}`).font = { ...STYLES.font.default, bold: true }
  defSheet.getCell(`A${rowNum}`).alignment = STYLES.alignment.right
  defSheet.getCell(`A${rowNum}`).border = STYLES.border.thin
  defSheet.getCell(`F${rowNum}`).value = totalWorks + totalMaterials + overhead
  defSheet.getCell(`F${rowNum}`).numFmt = STYLES.numFmt.currency
  defSheet.getCell(`F${rowNum}`).font = { ...STYLES.font.default, bold: true }
  defSheet.getCell(`F${rowNum}`).border = STYLES.border.thin
  defSheet.getCell(`J${rowNum}`).value = totalSmetaWorks + totalSmetaMaterials + smetaOverhead
  defSheet.getCell(`J${rowNum}`).numFmt = STYLES.numFmt.currency
  defSheet.getCell(`J${rowNum}`).font = { ...STYLES.font.default, bold: true }
  defSheet.getCell(`J${rowNum}`).border = STYLES.border.thin
  defSheet.getRow(rowNum).height = 20
  rowNum += 2

  // Надбавки и скидки
  defSheet.mergeCells(`A${rowNum}:F${rowNum}`)
  defSheet.getCell(`A${rowNum}`).value = 'Надбавки и скидки для сметы'
  defSheet.getCell(`A${rowNum}`).font = STYLES.font.default
  defSheet.getRow(rowNum).height = 18
  rowNum += 2

  // Итого по разделам (повтор)
  defSheet.mergeCells(`A${rowNum}:E${rowNum}`)
  defSheet.getCell(`A${rowNum}`).value = 'Итого по разделам:'
  defSheet.getCell(`A${rowNum}`).font = { ...STYLES.font.default, bold: true }
  defSheet.getCell(`A${rowNum}`).alignment = STYLES.alignment.right
  defSheet.getCell(`A${rowNum}`).border = STYLES.border.thin
  defSheet.getCell(`J${rowNum}`).value = totalSmetaWorks + totalSmetaMaterials + smetaOverhead
  defSheet.getCell(`J${rowNum}`).numFmt = STYLES.numFmt.currency
  defSheet.getCell(`J${rowNum}`).font = { ...STYLES.font.default, bold: true }
  defSheet.getCell(`J${rowNum}`).border = STYLES.border.thin
  defSheet.getRow(rowNum).height = 18
  rowNum++

  // НДС
  defSheet.mergeCells(`A${rowNum}:E${rowNum}`)
  defSheet.getCell(`A${rowNum}`).value = 'НДС:'
  defSheet.getCell(`A${rowNum}`).font = STYLES.font.default
  defSheet.getCell(`A${rowNum}`).alignment = STYLES.alignment.right
  defSheet.getCell(`A${rowNum}`).border = STYLES.border.thin
  defSheet.getCell(`J${rowNum}`).value = 'не облагается'
  defSheet.getCell(`J${rowNum}`).font = STYLES.font.default
  defSheet.getCell(`J${rowNum}`).border = STYLES.border.thin
  defSheet.getRow(rowNum).height = 18
  rowNum++

  // Всего по смете
  defSheet.mergeCells(`A${rowNum}:E${rowNum}`)
  defSheet.getCell(`A${rowNum}`).value = 'Всего по смете:'
  defSheet.getCell(`A${rowNum}`).font = STYLES.font.title
  defSheet.getCell(`A${rowNum}`).alignment = STYLES.alignment.right
  defSheet.getCell(`A${rowNum}`).border = STYLES.border.medium
  defSheet.getCell(`J${rowNum}`).value = totalSmetaWorks + totalSmetaMaterials + smetaOverhead
  defSheet.getCell(`J${rowNum}`).numFmt = STYLES.numFmt.currency
  defSheet.getCell(`J${rowNum}`).font = STYLES.font.title
  defSheet.getCell(`J${rowNum}`).border = STYLES.border.medium
  defSheet.getRow(rowNum).height = 22

  // Заполним статистику в шапке (в блоке коэффициентов)
  const smetaStoimost = totalSmetaWorks + totalSmetaMaterials + smetaOverhead
  defSheet.getCell(`G${coefStartRow}`).value = totalSmetaWorks
  defSheet.getCell(`G${coefStartRow}`).numFmt = STYLES.numFmt.currency
  defSheet.getCell(`G${coefStartRow}`).font = STYLES.font.default
  defSheet.getCell(`I${coefStartRow}`).value = totalSmetaMaterials
  defSheet.getCell(`I${coefStartRow}`).numFmt = STYLES.numFmt.currency
  defSheet.getCell(`I${coefStartRow}`).font = STYLES.font.default
  defSheet.getCell(`J${coefStartRow}`).value = smetaStoimost
  defSheet.getCell(`J${coefStartRow}`).numFmt = STYLES.numFmt.currency
  defSheet.getCell(`J${coefStartRow}`).font = STYLES.font.default
  defSheet.getCell(`G${coefRow3}`).value = totalWorks + totalMaterials + overhead
  defSheet.getCell(`G${coefRow3}`).numFmt = STYLES.numFmt.currency
  defSheet.getCell(`G${coefRow3}`).font = STYLES.font.default

  // Обновляем сметную стоимость в шапке
  defSheet.getCell(`J${coefRow2}`).value = smetaStoimost
  defSheet.getCell(`J${coefRow2}`).numFmt = STYLES.numFmt.currency
  defSheet.getCell(`J${coefRow2}`).font = { ...STYLES.font.default, bold: true }

  // === ПОДПИСИ ДЕФЕКТОВКИ (Лист 1) ===
  rowNum += 3
  defSheet.getCell(`A${rowNum}`).value = 'Заказчик:'
  defSheet.getCell(`A${rowNum}`).font = { ...STYLES.font.default, bold: true }
  defSheet.mergeCells(`B${rowNum}:D${rowNum}`)
  defSheet.getCell(`B${rowNum}`).value = '_________________________'
  defSheet.getCell(`B${rowNum}`).font = STYLES.font.default
  defSheet.getCell(`B${rowNum}`).alignment = STYLES.alignment.center
  defSheet.getCell(`E${rowNum}`).value = '/'
  defSheet.getCell(`E${rowNum}`).alignment = STYLES.alignment.center
  defSheet.mergeCells(`F${rowNum}:H${rowNum}`)
  defSheet.getCell(`F${rowNum}`).value = '_________________________'
  defSheet.getCell(`F${rowNum}`).font = STYLES.font.default
  defSheet.getCell(`F${rowNum}`).alignment = STYLES.alignment.center
  defSheet.getRow(rowNum).height = 18
  rowNum++

  defSheet.mergeCells(`B${rowNum}:D${rowNum}`)
  defSheet.getCell(`B${rowNum}`).value = '(подпись)'
  defSheet.getCell(`B${rowNum}`).font = { name: 'Arial', size: 8, italic: true }
  defSheet.getCell(`B${rowNum}`).alignment = STYLES.alignment.center
  defSheet.mergeCells(`F${rowNum}:H${rowNum}`)
  defSheet.getCell(`F${rowNum}`).value = '(ФИО)'
  defSheet.getCell(`F${rowNum}`).font = { name: 'Arial', size: 8, italic: true }
  defSheet.getCell(`F${rowNum}`).alignment = STYLES.alignment.center
  defSheet.getRow(rowNum).height = 14
  rowNum += 2

  defSheet.getCell(`A${rowNum}`).value = 'Подрядчик:'
  defSheet.getCell(`A${rowNum}`).font = { ...STYLES.font.default, bold: true }
  defSheet.mergeCells(`B${rowNum}:D${rowNum}`)
  defSheet.getCell(`B${rowNum}`).value = '_________________________'
  defSheet.getCell(`B${rowNum}`).font = STYLES.font.default
  defSheet.getCell(`B${rowNum}`).alignment = STYLES.alignment.center
  defSheet.getCell(`E${rowNum}`).value = '/'
  defSheet.getCell(`E${rowNum}`).alignment = STYLES.alignment.center
  defSheet.mergeCells(`F${rowNum}:H${rowNum}`)
  defSheet.getCell(`F${rowNum}`).value = '_________________________'
  defSheet.getCell(`F${rowNum}`).font = STYLES.font.default
  defSheet.getCell(`F${rowNum}`).alignment = STYLES.alignment.center
  defSheet.getRow(rowNum).height = 18
  rowNum++

  defSheet.mergeCells(`B${rowNum}:D${rowNum}`)
  defSheet.getCell(`B${rowNum}`).value = '(подпись)'
  defSheet.getCell(`B${rowNum}`).font = { name: 'Arial', size: 8, italic: true }
  defSheet.getCell(`B${rowNum}`).alignment = STYLES.alignment.center
  defSheet.mergeCells(`F${rowNum}:H${rowNum}`)
  defSheet.getCell(`F${rowNum}`).value = '(ФИО)'
  defSheet.getCell(`F${rowNum}`).font = { name: 'Arial', size: 8, italic: true }
  defSheet.getCell(`F${rowNum}`).alignment = STYLES.alignment.center
  defSheet.getRow(rowNum).height = 14

  // === ЛИСТ 2: ЛОКАЛЬНАЯ СМЕТА (6 колонок по образцу) ===
  const smetaSheet = workbook.addWorksheet('Смета №1')

  smetaSheet.getColumn(1).width = 4.29   // A: №
  smetaSheet.getColumn(2).width = 61.71  // B: Наименование работ и затрат
  smetaSheet.getColumn(3).width = 8.29   // C: Ед.
  smetaSheet.getColumn(4).width = 11.43  // D: Кол-во
  smetaSheet.getColumn(5).width = 16     // E: Цена, руб.
  smetaSheet.getColumn(6).width = 18     // F: Стоимость, руб.

  // === ШАПКА СМЕТЫ ===
  // Строка 1: Утверждаю / Согласовано
  smetaSheet.mergeCells('A1:B1')
  smetaSheet.getCell('A1').value = 'Утверждаю:'
  smetaSheet.getCell('A1').font = { ...STYLES.font.default, bold: true, underline: true }
  smetaSheet.mergeCells('E1:F1')
  smetaSheet.getCell('E1').value = 'Согласовано:'
  smetaSheet.getCell('E1').font = { ...STYLES.font.default, bold: true, underline: true }
  smetaSheet.getRow(1).height = 18

  // Строка 2: Названия компаний
  smetaSheet.mergeCells('A2:C2')
  smetaSheet.getCell('A2').value = `Генеральный директор ${clientName || 'ЗАО "Заказчик"'}`
  smetaSheet.getCell('A2').font = STYLES.font.default
  smetaSheet.mergeCells('E2:F2')
  smetaSheet.getCell('E2').value = `Генеральный директор ${companyName}`
  smetaSheet.getCell('E2').font = STYLES.font.default
  smetaSheet.getRow(2).height = 18

  // Строка 3: Подписи
  smetaSheet.mergeCells('A3:C3')
  smetaSheet.getCell('A3').value = '__________ / ___________________ /'
  smetaSheet.getCell('A3').font = STYLES.font.default
  smetaSheet.mergeCells('E3:F3')
  smetaSheet.getCell('E3').value = '__________ / ___________________ /'
  smetaSheet.getCell('E3').font = STYLES.font.default
  smetaSheet.getRow(3).height = 18

  // Подсказки к подписям
  smetaSheet.mergeCells('A4:C4')
  smetaSheet.getCell('A4').value = '   (подпись)          (ФИО)'
  smetaSheet.getCell('A4').font = { name: 'Arial', size: 8, italic: true }
  smetaSheet.mergeCells('E4:F4')
  smetaSheet.getCell('E4').value = '   (подпись)          (ФИО)'
  smetaSheet.getCell('E4').font = { name: 'Arial', size: 8, italic: true }
  smetaSheet.getRow(4).height = 14

  // Строка 5: Дата
  smetaSheet.getCell('A5').value = dateStr
  smetaSheet.getCell('A5').font = STYLES.font.default
  smetaSheet.getCell('E5').value = dateStr
  smetaSheet.getCell('E5').font = STYLES.font.default
  smetaSheet.getRow(5).height = 18

  // Строка 7: Заголовок ЛОКАЛЬНАЯ СМЕТА
  smetaSheet.mergeCells('A7:F7')
  smetaSheet.getCell('A7').value = `ЛОКАЛЬНАЯ СМЕТА № ${estimate.number || 'Б/Н'}`
  smetaSheet.getCell('A7').font = { name: 'Arial', size: 14, bold: true }
  smetaSheet.getCell('A7').alignment = STYLES.alignment.center
  smetaSheet.getCell('A7').border = STYLES.border.thin
  smetaSheet.getRow(7).height = 26

  // Строка 8: Название работ
  smetaSheet.mergeCells('A8:F8')
  smetaSheet.getCell('A8').value = `на ${estimate.name || 'Ремонтно-отделочные работы'}`
  smetaSheet.getCell('A8').font = { name: 'Arial', size: 10, italic: true }
  smetaSheet.getCell('A8').alignment = STYLES.alignment.center
  smetaSheet.getRow(8).height = 18

  // Строка 9: Приложение
  smetaSheet.mergeCells('A9:C9')
  smetaSheet.getCell('A9').value = 'Приложение № 1'
  smetaSheet.getCell('A9').font = STYLES.font.default
  smetaSheet.getRow(9).height = 18

  // Строка 10: К договору
  smetaSheet.mergeCells('A10:D10')
  smetaSheet.getCell('A10').value = `к Договору № ${estimate.contract_number || '___'} от ${estimate.contract_date || dateStr}г.`
  smetaSheet.getCell('A10').font = STYLES.font.default
  smetaSheet.getRow(10).height = 18

  // Строки 9-10 справа: Итоговые суммы
  smetaSheet.getCell('E9').value = 'Сметная стоимость:'
  smetaSheet.getCell('E9').font = STYLES.font.default
  smetaSheet.getCell('F9').value = smetaStoimost
  smetaSheet.getCell('F9').numFmt = STYLES.numFmt.currency
  smetaSheet.getCell('F9').font = { ...STYLES.font.default, bold: true }
  smetaSheet.getRow(9).height = 18

  smetaSheet.getCell('E10').value = 'Стоим. работ:'
  smetaSheet.getCell('E10').font = STYLES.font.default
  smetaSheet.getCell('F10').value = totalSmetaWorks
  smetaSheet.getCell('F10').numFmt = STYLES.numFmt.currency
  smetaSheet.getCell('F10').font = STYLES.font.default

  // Строка 11: уровень цен
  smetaSheet.mergeCells('A11:D11')
  smetaSheet.getCell('A11').value = `составлена в уровне текущих цен на ${dateStr}`
  smetaSheet.getCell('A11').font = STYLES.font.small
  smetaSheet.getCell('E11').value = 'Стоим. материалов:'
  smetaSheet.getCell('E11').font = STYLES.font.default
  smetaSheet.getCell('F11').value = totalSmetaMaterials
  smetaSheet.getCell('F11').numFmt = STYLES.numFmt.currency
  smetaSheet.getCell('F11').font = STYLES.font.default
  smetaSheet.getRow(11).height = 18

  // Строка 13: Заголовки таблицы (6 колонок)
  const smetaHeaders = ['№', 'Наименование работ и затрат', 'Ед.', 'Кол-во', 'Цена, руб.', 'Стоимость,\nруб.']
  const smetaHeaderRow = smetaSheet.getRow(13)
  smetaHeaderRow.values = smetaHeaders
  smetaHeaderRow.height = 30
  smetaHeaderRow.eachCell(cell => {
    cell.font = STYLES.font.header
    cell.border = STYLES.border.thin
    cell.fill = STYLES.fill.header
    cell.alignment = STYLES.alignment.center
  })

  // Строка 14: Номера колонок
  for (let i = 1; i <= 6; i++) {
    const cell = smetaSheet.getCell(14, i)
    cell.value = i
    cell.font = STYLES.font.small
    cell.border = STYLES.border.thin
    cell.alignment = STYLES.alignment.center
  }
  smetaSheet.getRow(14).height = 18

  // === ДАННЫЕ СМЕТЫ ===
  rowNum = 16
  let smetaSectionNum = 1

  for (const sectionId of usedSectionIds) {
    const section = sectionMap.get(sectionId)
    const sectionName = section?.name || 'Раздел'
    const sectionItems = assignedItems.filter(i => i.section_id === sectionId)

    // Заголовок раздела
    smetaSheet.mergeCells(`A${rowNum}:F${rowNum}`)
    smetaSheet.getCell(`A${rowNum}`).value = `${smetaSectionNum}. Раздел: ${sectionName}`
    smetaSheet.getCell(`A${rowNum}`).font = STYLES.font.header
    smetaSheet.getCell(`A${rowNum}`).fill = STYLES.fill.yellow
    for (let c = 1; c <= 6; c++) smetaSheet.getCell(rowNum, c).border = STYLES.border.thin
    smetaSheet.getRow(rowNum).height = 20
    rowNum++

    let sectionTotal = 0
    let itemNum = 1

    for (const item of sectionItems) {
      const priceWithCoef = ((item.labor_price || 0) * workCoef) + ((item.material_price || 0) * materialCoef)
      const totalWithCoef = priceWithCoef * (item.quantity || 1)
      sectionTotal += totalWithCoef

      const row = smetaSheet.getRow(rowNum)
      row.values = [
        itemNum,
        item.name,
        item.unit || 'шт.',
        item.quantity || 1,
        priceWithCoef,
        totalWithCoef
      ]
      row.height = Math.max(22, Math.ceil((item.name || '').length / 35) * 15)
      row.eachCell((cell, colNumber) => {
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

      rowNum++
      itemNum++
    }

    // Итого по разделу
    smetaSheet.mergeCells(`A${rowNum}:E${rowNum}`)
    smetaSheet.getCell(`A${rowNum}`).value = 'Итого по разделу'
    smetaSheet.getCell(`A${rowNum}`).font = { ...STYLES.font.default, bold: true }
    smetaSheet.getCell(`A${rowNum}`).alignment = STYLES.alignment.right
    smetaSheet.getCell(`A${rowNum}`).border = STYLES.border.thin
    smetaSheet.getCell(`F${rowNum}`).value = sectionTotal
    smetaSheet.getCell(`F${rowNum}`).numFmt = STYLES.numFmt.currency
    smetaSheet.getCell(`F${rowNum}`).font = { ...STYLES.font.default, bold: true }
    smetaSheet.getCell(`F${rowNum}`).border = STYLES.border.thin
    smetaSheet.getRow(rowNum).height = 18
    rowNum += 2

    smetaSectionNum++
  }

  // Позиции без раздела
  if (unassignedItems.length > 0) {
    smetaSheet.mergeCells(`A${rowNum}:F${rowNum}`)
    smetaSheet.getCell(`A${rowNum}`).value = `${smetaSectionNum}. Раздел: Прочие работы`
    smetaSheet.getCell(`A${rowNum}`).font = STYLES.font.header
    smetaSheet.getCell(`A${rowNum}`).fill = STYLES.fill.yellow
    for (let c = 1; c <= 6; c++) smetaSheet.getCell(rowNum, c).border = STYLES.border.thin
    smetaSheet.getRow(rowNum).height = 20
    rowNum++

    let sectionTotal = 0
    let itemNum = 1

    for (const item of unassignedItems) {
      const priceWithCoef = ((item.labor_price || 0) * workCoef) + ((item.material_price || 0) * materialCoef)
      const totalWithCoef = priceWithCoef * (item.quantity || 1)
      sectionTotal += totalWithCoef

      const row = smetaSheet.getRow(rowNum)
      row.values = [
        itemNum,
        item.name,
        item.unit || 'шт.',
        item.quantity || 1,
        priceWithCoef,
        totalWithCoef
      ]
      row.height = Math.max(22, Math.ceil((item.name || '').length / 35) * 15)
      row.eachCell((cell, colNumber) => {
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

      rowNum++
      itemNum++
    }

    // Итого по разделу
    smetaSheet.mergeCells(`A${rowNum}:E${rowNum}`)
    smetaSheet.getCell(`A${rowNum}`).value = 'Итого по разделу'
    smetaSheet.getCell(`A${rowNum}`).font = { ...STYLES.font.default, bold: true }
    smetaSheet.getCell(`A${rowNum}`).alignment = STYLES.alignment.right
    smetaSheet.getCell(`A${rowNum}`).border = STYLES.border.thin
    smetaSheet.getCell(`F${rowNum}`).value = sectionTotal
    smetaSheet.getCell(`F${rowNum}`).numFmt = STYLES.numFmt.currency
    smetaSheet.getCell(`F${rowNum}`).font = { ...STYLES.font.default, bold: true }
    smetaSheet.getCell(`F${rowNum}`).border = STYLES.border.thin
    smetaSheet.getRow(rowNum).height = 18
    rowNum += 2
  }

  // === ИТОГИ СМЕТЫ (с borders) ===
  const addSmetaTotalRow = (label, value, isBold = false) => {
    smetaSheet.mergeCells(`A${rowNum}:E${rowNum}`)
    smetaSheet.getCell(`A${rowNum}`).value = label
    smetaSheet.getCell(`A${rowNum}`).font = { ...STYLES.font.default, bold: isBold }
    smetaSheet.getCell(`A${rowNum}`).alignment = STYLES.alignment.right
    smetaSheet.getCell(`A${rowNum}`).border = STYLES.border.thin
    smetaSheet.getCell(`F${rowNum}`).value = value
    smetaSheet.getCell(`F${rowNum}`).numFmt = typeof value === 'number' ? STYLES.numFmt.currency : undefined
    smetaSheet.getCell(`F${rowNum}`).font = { ...STYLES.font.default, bold: isBold }
    smetaSheet.getCell(`F${rowNum}`).border = STYLES.border.thin
    smetaSheet.getRow(rowNum).height = 18
    rowNum++
  }

  addSmetaTotalRow('Итого по разделам', smetaStoimost, true)
  addSmetaTotalRow('в т.ч. стоимость работ:', totalSmetaWorks)
  addSmetaTotalRow('в т.ч. стоимость материалов:', totalSmetaMaterials)
  rowNum++
  addSmetaTotalRow('НДС:', 'не облагается')

  // ВСЕГО ПО СМЕТЕ
  smetaSheet.mergeCells(`A${rowNum}:E${rowNum}`)
  smetaSheet.getCell(`A${rowNum}`).value = 'ВСЕГО ПО СМЕТЕ:'
  smetaSheet.getCell(`A${rowNum}`).font = { name: 'Arial', size: 12, bold: true }
  smetaSheet.getCell(`A${rowNum}`).alignment = STYLES.alignment.right
  smetaSheet.getCell(`A${rowNum}`).border = STYLES.border.medium
  smetaSheet.getCell(`F${rowNum}`).value = smetaStoimost
  smetaSheet.getCell(`F${rowNum}`).numFmt = '#,##0.00'
  smetaSheet.getCell(`F${rowNum}`).font = { name: 'Arial', size: 12, bold: true }
  smetaSheet.getCell(`F${rowNum}`).border = STYLES.border.medium
  smetaSheet.getRow(rowNum).height = 24
  rowNum += 3

  // === ПОДПИСИ СМЕТЫ ===
  smetaSheet.getCell(`A${rowNum}`).value = 'Составил:'
  smetaSheet.getCell(`A${rowNum}`).font = { ...STYLES.font.default, bold: true }
  smetaSheet.mergeCells(`B${rowNum}:C${rowNum}`)
  smetaSheet.getCell(`B${rowNum}`).value = '_________________________'
  smetaSheet.getCell(`B${rowNum}`).font = STYLES.font.default
  smetaSheet.getCell(`B${rowNum}`).alignment = STYLES.alignment.center
  smetaSheet.getCell(`D${rowNum}`).value = '/'
  smetaSheet.getCell(`D${rowNum}`).alignment = STYLES.alignment.center
  smetaSheet.mergeCells(`E${rowNum}:F${rowNum}`)
  smetaSheet.getCell(`E${rowNum}`).value = '_________________________'
  smetaSheet.getCell(`E${rowNum}`).font = STYLES.font.default
  smetaSheet.getCell(`E${rowNum}`).alignment = STYLES.alignment.center
  smetaSheet.getRow(rowNum).height = 18
  rowNum++

  smetaSheet.mergeCells(`B${rowNum}:C${rowNum}`)
  smetaSheet.getCell(`B${rowNum}`).value = '(подпись)'
  smetaSheet.getCell(`B${rowNum}`).font = { name: 'Arial', size: 8, italic: true }
  smetaSheet.getCell(`B${rowNum}`).alignment = STYLES.alignment.center
  smetaSheet.mergeCells(`E${rowNum}:F${rowNum}`)
  smetaSheet.getCell(`E${rowNum}`).value = '(ФИО)'
  smetaSheet.getCell(`E${rowNum}`).font = { name: 'Arial', size: 8, italic: true }
  smetaSheet.getCell(`E${rowNum}`).alignment = STYLES.alignment.center
  smetaSheet.getRow(rowNum).height = 14
  rowNum += 2

  smetaSheet.getCell(`A${rowNum}`).value = 'Проверил:'
  smetaSheet.getCell(`A${rowNum}`).font = { ...STYLES.font.default, bold: true }
  smetaSheet.mergeCells(`B${rowNum}:C${rowNum}`)
  smetaSheet.getCell(`B${rowNum}`).value = '_________________________'
  smetaSheet.getCell(`B${rowNum}`).font = STYLES.font.default
  smetaSheet.getCell(`B${rowNum}`).alignment = STYLES.alignment.center
  smetaSheet.getCell(`D${rowNum}`).value = '/'
  smetaSheet.getCell(`D${rowNum}`).alignment = STYLES.alignment.center
  smetaSheet.mergeCells(`E${rowNum}:F${rowNum}`)
  smetaSheet.getCell(`E${rowNum}`).value = '_________________________'
  smetaSheet.getCell(`E${rowNum}`).font = STYLES.font.default
  smetaSheet.getCell(`E${rowNum}`).alignment = STYLES.alignment.center
  smetaSheet.getRow(rowNum).height = 18
  rowNum++

  smetaSheet.mergeCells(`B${rowNum}:C${rowNum}`)
  smetaSheet.getCell(`B${rowNum}`).value = '(подпись)'
  smetaSheet.getCell(`B${rowNum}`).font = { name: 'Arial', size: 8, italic: true }
  smetaSheet.getCell(`B${rowNum}`).alignment = STYLES.alignment.center
  smetaSheet.mergeCells(`E${rowNum}:F${rowNum}`)
  smetaSheet.getCell(`E${rowNum}`).value = '(ФИО)'
  smetaSheet.getCell(`E${rowNum}`).font = { name: 'Arial', size: 8, italic: true }
  smetaSheet.getCell(`E${rowNum}`).alignment = STYLES.alignment.center
  smetaSheet.getRow(rowNum).height = 14

  applySheetFixes(defSheet, { minColWidths: { 1: 5 } })
  applySheetFixes(smetaSheet, { minColWidths: { 1: 4 } })

  // Сохраняем
  await workbook.xlsx.writeFile(outputPath)
  return outputPath
}

// ===== ГЕНЕРАЦИЯ ВЕДОМОСТИ ФОТ (Смета 2007) =====
const generateFOTExcel = async (estimate, items, sections, coefficients, outputPath) => {
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('ФОТ', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true }
  })

  ws.getColumn(1).width = 4.71
  ws.getColumn(2).width = 65
  ws.getColumn(3).width = 11
  ws.getColumn(4).width = 9
  ws.getColumn(5).width = 16
  ws.getColumn(6).width = 18

  let row = 1
  const dateStr = formatDate(new Date().toISOString())

  // === ШАПКА — Утверждаю ===
  ws.mergeCells('A1:B1')
  ws.getCell('A1').value = 'Утверждаю:'
  ws.getCell('A1').font = { ...STYLES.font.default, bold: true, underline: true }
  ws.getRow(1).height = 18

  // Согласовано (правый блок)
  ws.mergeCells('E1:F1')
  ws.getCell('E1').value = 'Согласовано:'
  ws.getCell('E1').font = { ...STYLES.font.default, bold: true, underline: true }
  ws.getRow(1).height = 18

  ws.mergeCells('A2:B2')
  ws.getCell('A2').value = '________________________'
  ws.getCell('A2').font = STYLES.font.default
  ws.getCell('A2').alignment = STYLES.alignment.center
  ws.mergeCells('E2:F2')
  ws.getCell('E2').value = '________________________'
  ws.getCell('E2').font = STYLES.font.default
  ws.getCell('E2').alignment = STYLES.alignment.center
  ws.getRow(2).height = 18

  ws.mergeCells('A3:B3')
  ws.getCell('A3').value = '(должность, ФИО)'
  ws.getCell('A3').font = { name: 'Arial', size: 8, italic: true }
  ws.getCell('A3').alignment = STYLES.alignment.center
  ws.mergeCells('E3:F3')
  ws.getCell('E3').value = '(должность, ФИО)'
  ws.getCell('E3').font = { name: 'Arial', size: 8, italic: true }
  ws.getCell('E3').alignment = STYLES.alignment.center
  ws.getRow(3).height = 14

  ws.getCell('A5').value = dateStr
  ws.getCell('A5').font = STYLES.font.default
  ws.getRow(5).height = 18

  row = 7

  // Заголовок
  ws.mergeCells(`A${row}:F${row}`)
  ws.getCell(`A${row}`).value = `Ведомость № ${estimate.number || '1'}`
  ws.getCell(`A${row}`).font = STYLES.font.title
  ws.getCell(`A${row}`).alignment = STYLES.alignment.center
  ws.getRow(row).height = 22
  row++

  ws.mergeCells(`A${row}:F${row}`)
  ws.getCell(`A${row}`).value = 'Фонд оплаты труда по объекту'
  ws.getCell(`A${row}`).font = { name: 'Arial', size: 14, bold: true }
  ws.getCell(`A${row}`).alignment = STYLES.alignment.center
  ws.getRow(row).height = 25
  row++

  ws.mergeCells(`A${row}:F${row}`)
  ws.getCell(`A${row}`).value = estimate.name || 'Ремонтно отделочные работы'
  ws.getCell(`A${row}`).font = STYLES.font.header
  ws.getCell(`A${row}`).alignment = STYLES.alignment.center
  ws.getRow(row).height = 20
  row += 2

  ws.mergeCells(`A${row}:C${row}`)
  ws.getCell(`A${row}`).value = 'Производитель работ: _______________________'
  ws.getCell(`A${row}`).font = STYLES.font.default
  ws.getRow(row).height = 18
  row += 2

  // Шапка таблицы
  const headers = ['№\nп/п', 'Наименование работ', 'Кол-во', 'Ед. изм.', 'Цена', 'Стоимость']
  headers.forEach((h, i) => {
    const cell = ws.getCell(row, i + 1)
    cell.value = h
    cell.font = STYLES.font.header
    cell.fill = STYLES.fill.yellow
    cell.border = STYLES.border.thin
    cell.alignment = STYLES.alignment.center
  })
  ws.getRow(row).height = 30
  row++

  // Номера столбцов
  for (let i = 1; i <= 6; i++) {
    const cell = ws.getCell(row, i)
    cell.value = i
    cell.font = STYLES.font.small
    cell.fill = STYLES.fill.yellow
    cell.border = STYLES.border.thin
    cell.alignment = STYLES.alignment.center
  }
  ws.getRow(row).height = 18
  row++

  // Данные (ФАКТИЧЕСКИЕ ЦЕНЫ - только работа!)
  const sectionMap = new Map()
  sections?.forEach(s => sectionMap.set(s.id, s))

  const usedSectionIds = [...new Set(items.filter(i => i.section_id).map(i => i.section_id))]
  let grandTotal = 0
  let sectionNum = 0

  for (const sectionId of usedSectionIds) {
    const section = sectionMap.get(sectionId)
    const sectionName = section?.name || 'Раздел'
    const sectionItems = items.filter(i => i.section_id === sectionId)

    sectionNum++
    row++

    // Заголовок раздела
    ws.mergeCells(`A${row}:F${row}`)
    ws.getCell(row, 1).value = `${sectionNum} Раздел: ${sectionName}`
    ws.getCell(row, 1).font = STYLES.font.header
    ws.getCell(row, 1).fill = STYLES.fill.yellow
    for (let c = 1; c <= 6; c++) ws.getCell(row, c).border = STYLES.border.thin
    ws.getRow(row).height = 20
    row++

    let sectionTotal = 0
    let itemNum = 0

    for (const item of sectionItems) {
      itemNum++
      const qty = item.quantity || 1
      const priceFact = item.labor_price || item.price || item.price_smeta || 0
      const itemTotal = priceFact * qty
      sectionTotal += itemTotal

      const rowData = [itemNum, item.name, qty, item.unit || 'м2', priceFact, itemTotal]
      rowData.forEach((val, i) => {
        const cell = ws.getCell(row, i + 1)
        cell.value = val
        cell.border = STYLES.border.thin
        cell.font = STYLES.font.default
        if (i === 1) {
          cell.alignment = { ...STYLES.alignment.left, wrapText: true }
        } else if (i === 2) {
          cell.numFmt = STYLES.numFmt.quantity
          cell.alignment = STYLES.alignment.right
        } else if (i >= 4) {
          cell.numFmt = STYLES.numFmt.currency
          cell.alignment = STYLES.alignment.right
        } else {
          cell.alignment = STYLES.alignment.center
        }
      })
      ws.getRow(row).height = 22
      row++
    }

    // Итого по разделу
    ws.getCell(row, 1).value = 'Итого по разделу:'
    ws.mergeCells(`A${row}:E${row}`)
    ws.getCell(row, 1).font = { ...STYLES.font.default, bold: true }
    ws.getCell(row, 1).alignment = STYLES.alignment.right
    ws.getCell(row, 6).value = sectionTotal
    ws.getCell(row, 6).numFmt = STYLES.numFmt.currency
    ws.getCell(row, 6).font = { ...STYLES.font.default, bold: true }
    for (let c = 1; c <= 6; c++) ws.getCell(row, c).border = STYLES.border.thin
    ws.getRow(row).height = 18
    row++
    grandTotal += sectionTotal
  }

  // Всего по ведомости
  row++
  ws.getCell(row, 1).value = 'Всего по ведомости:'
  ws.mergeCells(`A${row}:E${row}`)
  ws.getCell(row, 1).font = STYLES.font.header
  ws.getCell(row, 1).alignment = STYLES.alignment.right
  ws.getCell(row, 6).value = grandTotal
  ws.getCell(row, 6).numFmt = STYLES.numFmt.currency
  ws.getCell(row, 6).font = STYLES.font.header
  for (let c = 1; c <= 6; c++) ws.getCell(row, c).border = STYLES.border.thin
  ws.getRow(row).height = 20

  // === ПОДПИСИ ===
  row += 3

  // Производитель работ
  ws.getCell(`A${row}`).value = 'Производитель работ:'
  ws.getCell(`A${row}`).font = { ...STYLES.font.default, bold: true }
  ws.mergeCells(`C${row}:D${row}`)
  ws.getCell(`C${row}`).value = '_________________'
  ws.getCell(`C${row}`).alignment = STYLES.alignment.center
  ws.getCell(`E${row}`).value = '/'
  ws.getCell(`E${row}`).alignment = STYLES.alignment.center
  ws.getCell(`F${row}`).value = '_________________'
  ws.getCell(`F${row}`).alignment = STYLES.alignment.center
  ws.getRow(row).height = 18
  row++

  ws.mergeCells(`C${row}:D${row}`)
  ws.getCell(`C${row}`).value = '(подпись)'
  ws.getCell(`C${row}`).font = { name: 'Arial', size: 8, italic: true }
  ws.getCell(`C${row}`).alignment = STYLES.alignment.center
  ws.getCell(`F${row}`).value = '(ФИО)'
  ws.getCell(`F${row}`).font = { name: 'Arial', size: 8, italic: true }
  ws.getCell(`F${row}`).alignment = STYLES.alignment.center
  ws.getRow(row).height = 14
  row += 2

  // Руководитель
  ws.getCell(`A${row}`).value = 'Руководитель:'
  ws.getCell(`A${row}`).font = { ...STYLES.font.default, bold: true }
  ws.mergeCells(`C${row}:D${row}`)
  ws.getCell(`C${row}`).value = '_________________'
  ws.getCell(`C${row}`).alignment = STYLES.alignment.center
  ws.getCell(`E${row}`).value = '/'
  ws.getCell(`E${row}`).alignment = STYLES.alignment.center
  ws.getCell(`F${row}`).value = '_________________'
  ws.getCell(`F${row}`).alignment = STYLES.alignment.center
  ws.getRow(row).height = 18
  row++

  ws.mergeCells(`C${row}:D${row}`)
  ws.getCell(`C${row}`).value = '(подпись)'
  ws.getCell(`C${row}`).font = { name: 'Arial', size: 8, italic: true }
  ws.getCell(`C${row}`).alignment = STYLES.alignment.center
  ws.getCell(`F${row}`).value = '(ФИО)'
  ws.getCell(`F${row}`).font = { name: 'Arial', size: 8, italic: true }
  ws.getCell(`F${row}`).alignment = STYLES.alignment.center
  ws.getRow(row).height = 14

  await workbook.xlsx.writeFile(outputPath)
  return outputPath
}

// ===== ГЕНЕРАЦИЯ СМЕТЫ в формате Смета 2007 =====
const generateSmeta2007Excel = async (estimate, items, sections, coefficients, project, companyInfo, outputPath) => {
  const workbook = new ExcelJS.Workbook()
  const ws = workbook.addWorksheet('Смета', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true }
  })

  const workCoef = coefficients?.work_coef || 1.8
  const materialCoef = coefficients?.material_coef || 1.04
  const companyName = companyInfo?.name || 'ООО РСК ДОММАСТЕР'
  const director = companyInfo?.director || 'Директор'
  const clientName = project?.client_name || estimate?.client_name || ''
  const address = project?.address || estimate?.address || ''

  ws.getColumn(1).width = 6
  ws.getColumn(2).width = 55
  ws.getColumn(3).width = 10
  ws.getColumn(4).width = 10
  ws.getColumn(5).width = 12
  ws.getColumn(6).width = 14

  const dateStr = formatDate(new Date().toISOString())
  let row = 1

  // === ШАПКА ===
  // Строка 1: Утверждаю / Согласовано
  ws.mergeCells('A1:B1')
  ws.getCell('A1').value = 'Утверждаю:'
  ws.getCell('A1').font = { ...STYLES.font.default, bold: true, underline: true }
  ws.mergeCells('D1:F1')
  ws.getCell('D1').value = 'Согласовано:'
  ws.getCell('D1').font = { ...STYLES.font.default, bold: true, underline: true }
  ws.getRow(1).height = 18

  // Строка 2: Названия компаний
  ws.mergeCells('A2:B2')
  ws.getCell('A2').value = clientName ? `Генеральный директор ${clientName}` : 'Генеральный директор ЗАО "Заказчик"'
  ws.getCell('A2').font = STYLES.font.default
  ws.mergeCells('D2:F2')
  ws.getCell('D2').value = `Генеральный директор ${companyName}`
  ws.getCell('D2').font = STYLES.font.default
  ws.getRow(2).height = 18

  // Строка 3: Подписи
  ws.mergeCells('A3:B3')
  ws.getCell('A3').value = '__________ / ___________________ /'
  ws.getCell('A3').font = STYLES.font.default
  ws.mergeCells('D3:F3')
  ws.getCell('D3').value = `__________ / ${director} /`
  ws.getCell('D3').font = STYLES.font.default
  ws.getRow(3).height = 18

  // Подсказки к подписям
  ws.mergeCells('A4:B4')
  ws.getCell('A4').value = '   (подпись)          (ФИО)'
  ws.getCell('A4').font = { name: 'Arial', size: 8, italic: true }
  ws.mergeCells('D4:F4')
  ws.getCell('D4').value = '   (подпись)          (ФИО)'
  ws.getCell('D4').font = { name: 'Arial', size: 8, italic: true }
  ws.getRow(4).height = 14

  // Строка 5: Дата и м.п.
  ws.getCell('A5').value = dateStr
  ws.getCell('A5').font = STYLES.font.default
  ws.getCell('B5').value = 'м.п.'
  ws.getCell('B5').font = STYLES.font.default
  ws.getCell('D5').value = dateStr
  ws.getCell('D5').font = STYLES.font.default
  ws.getCell('E5').value = 'м.п.'
  ws.getCell('E5').font = STYLES.font.default
  ws.getRow(5).height = 18

  row = 7

  // Заголовок
  ws.mergeCells(`A${row}:F${row}`)
  ws.getCell(`A${row}`).value = `ЛОКАЛЬНАЯ СМЕТА № ${estimate.number || 'Б/Н'}`
  ws.getCell(`A${row}`).font = { name: 'Arial', size: 14, bold: true }
  ws.getCell(`A${row}`).alignment = STYLES.alignment.center
  ws.getCell(`A${row}`).border = STYLES.border.thin
  ws.getRow(row).height = 26
  row++

  ws.mergeCells(`A${row}:F${row}`)
  ws.getCell(`A${row}`).value = `на ${estimate.name || 'Ремонтно-отделочные работы'}`
  ws.getCell(`A${row}`).font = { name: 'Arial', size: 10, italic: true }
  ws.getCell(`A${row}`).alignment = STYLES.alignment.center
  ws.getRow(row).height = 18
  row++

  // Объект (если есть)
  if (address) {
    ws.mergeCells(`A${row}:F${row}`)
    ws.getCell(`A${row}`).value = `Объект: ${address}`
    ws.getCell(`A${row}`).font = STYLES.font.default
    ws.getRow(row).height = 18
    row++
  }
  row++

  ws.getCell(`A${row}`).value = 'Приложение № 1'
  ws.getCell(`A${row}`).font = STYLES.font.default
  ws.getRow(row).height = 18
  row++
  ws.getCell(`A${row}`).value = `к Договору № _____ от ${dateStr}`
  ws.getCell(`A${row}`).font = STYLES.font.default
  ws.getRow(row).height = 18
  row++

  // Расчёт итогов
  let totalSmetaWork = 0
  let totalSmetaMaterial = 0
  items.forEach(item => {
    const qty = item.quantity || 1
    const laborFact = item.labor_price || 0
    const materialFact = item.material_price || 0
    totalSmetaWork += laborFact * workCoef * qty
    totalSmetaMaterial += materialFact * materialCoef * qty
  })
  const totalSmeta = totalSmetaWork + totalSmetaMaterial

  // Блок итогов справа (на фиксированных строках)
  const sumRow = row
  ws.getCell(`E${sumRow}`).value = 'Сметная стоимость:'
  ws.getCell(`E${sumRow}`).font = { ...STYLES.font.default, bold: true }
  ws.getCell(`F${sumRow}`).value = totalSmeta
  ws.getCell(`F${sumRow}`).numFmt = STYLES.numFmt.currency
  ws.getCell(`F${sumRow}`).font = { ...STYLES.font.default, bold: true }
  ws.getRow(sumRow).height = 18

  ws.getCell(`E${sumRow + 1}`).value = 'Стоимость работы:'
  ws.getCell(`E${sumRow + 1}`).font = STYLES.font.default
  ws.getCell(`F${sumRow + 1}`).value = totalSmetaWork
  ws.getCell(`F${sumRow + 1}`).numFmt = STYLES.numFmt.currency
  ws.getCell(`F${sumRow + 1}`).font = STYLES.font.default
  ws.getRow(sumRow + 1).height = 18

  ws.getCell(`E${sumRow + 2}`).value = 'Стоимость материалов:'
  ws.getCell(`E${sumRow + 2}`).font = STYLES.font.default
  ws.getCell(`F${sumRow + 2}`).value = totalSmetaMaterial
  ws.getCell(`F${sumRow + 2}`).numFmt = STYLES.numFmt.currency
  ws.getCell(`F${sumRow + 2}`).font = STYLES.font.default
  ws.getRow(sumRow + 2).height = 18

  const month = new Date().toLocaleString('ru-RU', { month: 'long', year: 'numeric' })
  ws.getCell(`A${sumRow + 3}`).value = `Составлена в уровне текущих цен на ${month.charAt(0).toUpperCase() + month.slice(1)}.`
  ws.getCell(`A${sumRow + 3}`).font = STYLES.font.small
  ws.getRow(sumRow + 3).height = 18
  row = sumRow + 5

  // Шапка таблицы
  const headers = ['№\nп/п', 'Наименование работ, материалов, затрат', 'Ед. изм.', 'Кол-во', 'Цена', 'Стоимость']
  headers.forEach((h, i) => {
    const cell = ws.getCell(row, i + 1)
    cell.value = h
    cell.font = STYLES.font.header
    cell.fill = STYLES.fill.yellow
    cell.border = STYLES.border.thin
    cell.alignment = STYLES.alignment.center
  })
  ws.getRow(row).height = 30
  row++

  for (let i = 1; i <= 6; i++) {
    const cell = ws.getCell(row, i)
    cell.value = i
    cell.font = STYLES.font.small
    cell.fill = STYLES.fill.yellow
    cell.border = STYLES.border.thin
    cell.alignment = STYLES.alignment.center
  }
  ws.getRow(row).height = 18
  row++

  // Данные
  const sectionMap = new Map()
  sections?.forEach(s => sectionMap.set(s.id, s))
  const usedSectionIds = [...new Set(items.filter(i => i.section_id).map(i => i.section_id))]
  let sectionNum = 0

  for (const sectionId of usedSectionIds) {
    const section = sectionMap.get(sectionId)
    const sectionName = section?.name || 'Раздел'
    const sectionItems = items.filter(i => i.section_id === sectionId)

    sectionNum++
    row++

    ws.mergeCells(`A${row}:F${row}`)
    ws.getCell(row, 1).value = `${sectionNum} Раздел: ${sectionName}`
    ws.getCell(row, 1).font = STYLES.font.header
    ws.getCell(row, 1).fill = STYLES.fill.yellow
    for (let c = 1; c <= 6; c++) ws.getCell(row, c).border = STYLES.border.thin
    ws.getRow(row).height = 20
    row++

    let sectionTotal = 0
    let itemNum = 0

    for (const item of sectionItems) {
      itemNum++
      const qty = item.quantity || 1
      const laborFact = item.labor_price || 0
      const materialFact = item.material_price || 0
      const priceSmeta = (laborFact * workCoef) + (materialFact * materialCoef)
      const itemTotal = priceSmeta * qty
      sectionTotal += itemTotal

      const rowData = [itemNum, item.name, item.unit || 'м2', qty, priceSmeta, itemTotal]
      rowData.forEach((val, i) => {
        const cell = ws.getCell(row, i + 1)
        cell.value = val
        cell.border = STYLES.border.thin
        cell.font = STYLES.font.default
        if (i === 1) {
          cell.alignment = { ...STYLES.alignment.left, wrapText: true }
        } else if (i >= 3) {
          cell.numFmt = STYLES.numFmt.currency
          cell.alignment = STYLES.alignment.right
        } else {
          cell.alignment = STYLES.alignment.center
        }
      })
      ws.getRow(row).height = 22
      row++
    }

    // Итого по разделу
    ws.getCell(row, 1).value = 'Итого по разделу'
    ws.mergeCells(`A${row}:E${row}`)
    ws.getCell(row, 1).font = { ...STYLES.font.default, bold: true }
    ws.getCell(row, 1).alignment = STYLES.alignment.right
    ws.getCell(row, 6).value = sectionTotal
    ws.getCell(row, 6).numFmt = STYLES.numFmt.currency
    ws.getCell(row, 6).font = { ...STYLES.font.default, bold: true }
    for (let c = 1; c <= 6; c++) ws.getCell(row, c).border = STYLES.border.thin
    ws.getRow(row).height = 18
    row++
  }

  // === ИТОГИ (с borders) ===
  row++
  ws.getCell(row, 1).value = 'Итого по разделам'
  ws.mergeCells(`A${row}:E${row}`)
  ws.getCell(row, 1).font = { ...STYLES.font.header, size: 11 }
  ws.getCell(row, 1).alignment = STYLES.alignment.right
  ws.getCell(row, 1).border = STYLES.border.thin
  ws.getCell(row, 6).value = totalSmeta
  ws.getCell(row, 6).numFmt = STYLES.numFmt.currency
  ws.getCell(row, 6).font = { ...STYLES.font.default, bold: true }
  ws.getCell(row, 6).border = STYLES.border.thin
  ws.getRow(row).height = 20
  row++

  // в т.ч. работы
  ws.getCell(row, 1).value = 'в т.ч. стоимость работ:'
  ws.mergeCells(`A${row}:E${row}`)
  ws.getCell(row, 1).font = STYLES.font.default
  ws.getCell(row, 1).alignment = STYLES.alignment.right
  ws.getCell(row, 1).border = STYLES.border.thin
  ws.getCell(row, 6).value = totalSmetaWork
  ws.getCell(row, 6).numFmt = STYLES.numFmt.currency
  ws.getCell(row, 6).font = STYLES.font.default
  ws.getCell(row, 6).border = STYLES.border.thin
  ws.getRow(row).height = 18
  row++

  // в т.ч. материалы
  ws.getCell(row, 1).value = 'в т.ч. стоимость материалов:'
  ws.mergeCells(`A${row}:E${row}`)
  ws.getCell(row, 1).font = STYLES.font.default
  ws.getCell(row, 1).alignment = STYLES.alignment.right
  ws.getCell(row, 1).border = STYLES.border.thin
  ws.getCell(row, 6).value = totalSmetaMaterial
  ws.getCell(row, 6).numFmt = STYLES.numFmt.currency
  ws.getCell(row, 6).font = STYLES.font.default
  ws.getCell(row, 6).border = STYLES.border.thin
  ws.getRow(row).height = 18
  row += 2

  // НДС
  ws.getCell(row, 1).value = 'НДС:'
  ws.mergeCells(`A${row}:E${row}`)
  ws.getCell(row, 1).font = STYLES.font.default
  ws.getCell(row, 1).alignment = STYLES.alignment.right
  ws.getCell(row, 1).border = STYLES.border.thin
  ws.getCell(row, 6).value = 'не облагается'
  ws.getCell(row, 6).font = STYLES.font.default
  ws.getCell(row, 6).alignment = STYLES.alignment.right
  ws.getCell(row, 6).border = STYLES.border.thin
  ws.getRow(row).height = 18
  row++

  // ВСЕГО ПО СМЕТЕ
  ws.getCell(row, 1).value = 'ВСЕГО ПО СМЕТЕ:'
  ws.mergeCells(`A${row}:E${row}`)
  ws.getCell(row, 1).font = { name: 'Arial', size: 12, bold: true }
  ws.getCell(row, 1).alignment = STYLES.alignment.right
  ws.getCell(row, 1).border = STYLES.border.medium
  ws.getCell(row, 6).value = totalSmeta
  ws.getCell(row, 6).numFmt = '#,##0.00'
  ws.getCell(row, 6).font = { name: 'Arial', size: 12, bold: true }
  ws.getCell(row, 6).border = STYLES.border.medium
  ws.getRow(row).height = 24
  row += 4

  // === ПОДПИСИ ===
  ws.getCell(`A${row}`).value = 'Составил:'
  ws.getCell(`A${row}`).font = { ...STYLES.font.default, bold: true }
  ws.mergeCells(`B${row}:C${row}`)
  ws.getCell(`B${row}`).value = '_________________________'
  ws.getCell(`B${row}`).font = STYLES.font.default
  ws.getCell(`B${row}`).alignment = STYLES.alignment.center
  ws.getCell(`D${row}`).value = '/'
  ws.getCell(`D${row}`).alignment = STYLES.alignment.center
  ws.mergeCells(`E${row}:F${row}`)
  ws.getCell(`E${row}`).value = '_________________________'
  ws.getCell(`E${row}`).font = STYLES.font.default
  ws.getCell(`E${row}`).alignment = STYLES.alignment.center
  ws.getRow(row).height = 18
  row++

  ws.mergeCells(`B${row}:C${row}`)
  ws.getCell(`B${row}`).value = '(подпись)'
  ws.getCell(`B${row}`).font = { name: 'Arial', size: 8, italic: true }
  ws.getCell(`B${row}`).alignment = STYLES.alignment.center
  ws.mergeCells(`E${row}:F${row}`)
  ws.getCell(`E${row}`).value = '(ФИО)'
  ws.getCell(`E${row}`).font = { name: 'Arial', size: 8, italic: true }
  ws.getCell(`E${row}`).alignment = STYLES.alignment.center
  ws.getRow(row).height = 14
  row += 2

  ws.getCell(`A${row}`).value = 'Проверил:'
  ws.getCell(`A${row}`).font = { ...STYLES.font.default, bold: true }
  ws.mergeCells(`B${row}:C${row}`)
  ws.getCell(`B${row}`).value = '_________________________'
  ws.getCell(`B${row}`).font = STYLES.font.default
  ws.getCell(`B${row}`).alignment = STYLES.alignment.center
  ws.getCell(`D${row}`).value = '/'
  ws.getCell(`D${row}`).alignment = STYLES.alignment.center
  ws.mergeCells(`E${row}:F${row}`)
  ws.getCell(`E${row}`).value = '_________________________'
  ws.getCell(`E${row}`).font = STYLES.font.default
  ws.getCell(`E${row}`).alignment = STYLES.alignment.center
  ws.getRow(row).height = 18
  row++

  ws.mergeCells(`B${row}:C${row}`)
  ws.getCell(`B${row}`).value = '(подпись)'
  ws.getCell(`B${row}`).font = { name: 'Arial', size: 8, italic: true }
  ws.getCell(`B${row}`).alignment = STYLES.alignment.center
  ws.mergeCells(`E${row}:F${row}`)
  ws.getCell(`E${row}`).value = '(ФИО)'
  ws.getCell(`E${row}`).font = { name: 'Arial', size: 8, italic: true }
  ws.getCell(`E${row}`).alignment = STYLES.alignment.center
  ws.getRow(row).height = 14

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
