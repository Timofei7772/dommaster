/**
 * ZARU Смета - Генератор документов
 * Создание Word, Excel, PDF файлов
 */

const path = require('path')
const fs = require('fs')
const ExcelJS = require('exceljs')
const templates = require('./templates')
const estimateMapper = require('./document-mappers/estimate')
const defektovkaMapper = require('./document-mappers/defektovka')

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

  try {
    if (typeof cell.text === 'string' && cell.text !== '') return cell.text
  } catch (error) {
    // ExcelJS merge edge-case: fallback to raw value path below
  }

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

const parseEstimateSections = (sectionsValue) => {
  if (Array.isArray(sectionsValue)) return sectionsValue
  if (typeof sectionsValue === 'string') {
    try {
      const parsed = JSON.parse(sectionsValue)
      return Array.isArray(parsed) ? parsed : []
    } catch (_) {
      return []
    }
  }
  return []
}

const resolveEstimateSectionName = ({ estimate, sections, secItems, sid, sectionIndex }) => {
  const knownSections = parseEstimateSections(sections).length > 0
    ? parseEstimateSections(sections)
    : parseEstimateSections(estimate?.sections)

  return (
    knownSections.find((section) => Number(section?.id ?? section?.section_id ?? section?.value) === Number(sid))?.name
    || secItems.find((item) => (item?.section_name || '').trim())?.section_name
    || secItems.find((item) => (item?.row_type === 'section' || item?.row_type === 'irazd') && (item?.name || '').trim())?.name
    || (sid === 0 ? 'Общие работы' : `Раздел ${sectionIndex}`)
  )
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

const toHeaderSafe = (value) => String(value ?? '')
  .replace(/&/g, '&&')
  .replace(/\\r?\\n/g, ' ')
  .trim()

const applyExpandedDocumentHeader = (sheet, meta = {}) => {
  if (!sheet) return

  const docType = toHeaderSafe(meta.docType || 'Документ')
  const docNumber = toHeaderSafe(meta.docNumber || '')
  const docDate = toHeaderSafe(meta.docDate || '')
  const object = toHeaderSafe(meta.object || '')
  const description = toHeaderSafe(meta.description || '')
  const basis = toHeaderSafe(meta.basis || '')
  const period = toHeaderSafe(meta.period || '')
  const note = toHeaderSafe(meta.note || '')
  const customer = toHeaderSafe(meta.customer || '')
  const contractor = toHeaderSafe(meta.contractor || '')

  const leftParts = ['SmetaAI · ' + docType]
  if (docNumber) leftParts.push(`№ ${docNumber}`)
  if (docDate) leftParts.push(`дата ${docDate}`)

  const centerParts = []
  if (description) centerParts.push(description)
  if (object) centerParts.push(`Объект: ${object}`)
  if (basis) centerParts.push(`Основание: ${basis}`)
  if (period) centerParts.push(`Период: ${period}`)

  const rightParts = []
  if (customer) rightParts.push(`Заказчик: ${customer}`)
  if (contractor) rightParts.push(`Подрядчик: ${contractor}`)
  if (note) rightParts.push(note)

  sheet.headerFooter = {
    ...(sheet.headerFooter || {}),
    oddHeader: '&L' + leftParts.join(' · ') + '&C' + centerParts.join(' · ') + '&R' + rightParts.join(' · '),
    oddFooter: '&LСформировано: ' + toHeaderSafe(formatDate(new Date().toISOString())) + '&RСтр. &P из &N'
  }
}


// =========================================================
// ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ: округление до 2 знаков (ROUND)
// =========================================================
const round2 = (v) => Math.round((v || 0) * 100) / 100
const safeMergeCells = (sheet, range) => {
  try {
    sheet.mergeCells(range)
  } catch (error) {}
}

// Цвета строк по типу (как в ZaruAI Смета)
const ROW_COLORS = {
  rascenka: 'FFFFFFFF',  // белый — работы
  pr:       'FFFFFFFF',
  work:     'FFFFFFFF',
  material: 'FFE8F0FF',  // голубой — материалы
  mat:      'FFE8F0FF',
  mechanism:'FFE8FFE8',  // зелёный — механизмы
  meh:      'FFE8FFE8',
  comment:  'FFFFF2CC',  // жёлтый — комментарии
  spr:      'FFF5F5F5',  // серый — справочные
  section:  'FFD9E1F2',  // синий — заголовок раздела
  irazd:    'FFDDE8D5',  // итог раздела
  itog:     'FFDDE8D5',  // итого по смете
  lz:       'FFECE4D0',  // лимзатраты
}

const getRowColor = (rowType) => {
  return ROW_COLORS[rowType] || ROW_COLORS.rascenka
}

// Является ли тип расценкой (работой)
const isWorkRow = (rt) => !rt || rt === 'rascenka' || rt === 'pr' || rt === 'work'
const isMatRow  = (rt) => rt === 'material' || rt === 'mat'
const isMehRow  = (rt) => rt === 'mechanism' || rt === 'meh'

const calculateDocumentItemAmounts = (item, coefficients = {}) => {
  const rowType = item?.row_type || 'rascenka'
  const quantity = Number(item?.quantity) || 0
  const quantityRounded = round2(quantity)
  const materialPrice = Number(item?.material_price ?? 0) || 0
  const laborPrice = Number(item?.labor_price ?? item?.price ?? 0) || 0
  const materialCoef = Number(coefficients?.material_coef) || 1.04
  const workCoef = Number(coefficients?.work_coef) || 1.8

  if (rowType === 'comment' || rowType === 'spr' || rowType === 'empt') {
    return {
      rowType,
      quantity,
      quantityRounded,
      basePrice: 0,
      factTotal: 0,
      smetaPrice: 0,
      sumSmeta: 0,
      coeff: 0,
      typeCode: '',
      isCalculable: false
    }
  }

  if (isMatRow(rowType) || isMehRow(rowType)) {
    const smetaPrice = item?.price_smeta != null
      ? (Number(item.price_smeta) || 0)
      : round2(materialPrice * materialCoef)
    const sumSmeta = item?.sum_smeta != null
      ? (Number(item.sum_smeta) || 0)
      : round2(smetaPrice * quantityRounded)

    return {
      rowType,
      quantity,
      quantityRounded,
      basePrice: materialPrice,
      factTotal: round2(materialPrice * quantityRounded),
      smetaPrice,
      sumSmeta,
      coeff: materialCoef,
      typeCode: isMatRow(rowType) ? 'МАТ' : 'МЕХ',
      isCalculable: true
    }
  }

  const materialSmetaPrice = round2(materialPrice * materialCoef)
  const laborSmetaPrice = round2(laborPrice * workCoef)
  const basePrice = round2(materialPrice + laborPrice)
  const smetaPrice = item?.price_smeta != null
    ? (Number(item.price_smeta) || 0)
    : round2(materialSmetaPrice + laborSmetaPrice)
  const sumSmeta = item?.sum_smeta != null
    ? (Number(item.sum_smeta) || 0)
    : round2(materialSmetaPrice * quantityRounded) + round2(laborSmetaPrice * quantityRounded)

  return {
    rowType,
    quantity,
    quantityRounded,
    basePrice,
    factTotal: round2(basePrice * quantityRounded),
    smetaPrice,
    sumSmeta,
    coeff: basePrice > 0 ? round2(smetaPrice / basePrice) : workCoef,
    typeCode: 'ПР',
    isCalculable: true
  }
}

// =========================================================
// ГЕНЕРАЦИЯ ЛОКАЛЬНОЙ СМЕТЫ (6-графная, по образцу ZaruAI Смета)
// =========================================================
const generateEstimateExcel = async (estimate, items, project, companyInfo, coefficientsOrOutputPath, maybeOutputPath, sections) => {
  const coefficients = (typeof coefficientsOrOutputPath === 'string' || coefficientsOrOutputPath == null)
    ? null
    : coefficientsOrOutputPath
  const outputPath = typeof coefficientsOrOutputPath === 'string'
    ? coefficientsOrOutputPath
    : maybeOutputPath
  // === ШАБЛОННЫЙ ПОДХОД: загружаем шаблон ZaruAI Смета ===
  let workbook
  let useTemplate = false
  try {
    workbook = await loadTemplateWorkbook('DocTemplates/Смета.xlsx')
    useTemplate = true
  } catch (e) {
    // Если шаблон не найден — создаём с нуля
    workbook = new ExcelJS.Workbook()
    workbook.creator = 'ZARU Смета'
    workbook.created = new Date()
  }

  // === ЛИСТ 1: Дефектовка (10-колоночная таблица как в Смете 2007) ===
  let defSheet = useTemplate ? getWorksheetByName(workbook, ['Дефектовка №1', 'Дефектовка', 'Sheet1']) : null
  if (!defSheet) {
    defSheet = workbook.addWorksheet('Дефектовка №1', {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
        margins: { left: 0.5, right: 0.3, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 } }
    })
  }

  // === ЛИСТ 2: Смета (6-графка для печати) ===
  let sheet = useTemplate ? getWorksheetByName(workbook, ['Смета №1', 'Смета', 'Sheet2']) : null
  if (!sheet) {
    sheet = workbook.addWorksheet('Смета', {
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
        margins: { left: 0.7, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 } }
    })
  }

  // =============================================
  // ОБЩИЕ ДАННЫЕ
  // =============================================

  const dateStr = formatDate(estimate?.date || new Date().toISOString())
  const clientName  = project?.client_name  || estimate?.client_name  || ''
  const address     = project?.address      || estimate?.address      || ''
  const companyName = companyInfo?.name     || 'Подрядчик'
  const director    = companyInfo?.director || ''

  applyExpandedDocumentHeader(defSheet, {
    docType: 'Дефектовка',
    docNumber: estimate?.number || '',
    docDate: dateStr,
    object: address,
    description: estimate?.name || '',
    basis: estimate?.contract_number ? ('Договор № ' + estimate.contract_number) : '',
    customer: clientName,
    contractor: companyName
  })
  applyExpandedDocumentHeader(sheet, {
    docType: 'Локальная смета',
    docNumber: estimate?.number || '',
    docDate: dateStr,
    object: address,
    description: estimate?.name || '',
    basis: estimate?.contract_number ? ('Договор № ' + estimate.contract_number) : '',
    customer: clientName,
    contractor: companyName
  })

  // Получаем коэффициенты из контекста сметы или используем умолчания
  const material_coef = coefficients?.material_coef || estimate?.material_coef || 1.04
  const work_coef     = coefficients?.work_coef     || estimate?.work_coef     || 1.8
  const calcCoefficients = { material_coef, work_coef }

  // Пересчитываем итоги из позиций, чтобы гарантировать точность
  let sum_pr = 0, sum_mat = 0, sum_meh = 0
  const normalizedItems = estimateMapper.normalizeEstimateItems(items || [])
  const calcItems = normalizedItems.map(item => {
    const calculated = calculateDocumentItemAmounts(item, calcCoefficients)

    if (!calculated.isCalculable) {
      return { ...item, price_smeta: 0, sum_smeta: 0, _docCalc: calculated, _qty_r: 0 }
    }

    if (isMatRow(calculated.rowType))       sum_mat += calculated.sumSmeta
    else if (isMehRow(calculated.rowType))  sum_meh += calculated.sumSmeta
    else                                     sum_pr  += calculated.sumSmeta

    return {
      ...item,
      price_smeta: calculated.smetaPrice,
      sum_smeta: calculated.sumSmeta,
      _docCalc: calculated,
      _qty_r: calculated.quantityRounded
    }
  })
  sum_pr  = round2(sum_pr)
  sum_mat = round2(sum_mat)
  sum_meh = round2(sum_meh)
  const itogo_po_razdelam = round2(sum_pr + sum_mat + sum_meh)

  const overhead_percent = parseFloat(estimate?.overhead_percent) || 0
  const profit_percent   = parseFloat(estimate?.profit_percent)   || 0
  const vat_percent      = parseFloat(estimate?.vat_percent)      || 0
  const overhead_amount  = round2(itogo_po_razdelam * overhead_percent / 100)
  const profit_amount    = round2((itogo_po_razdelam + overhead_amount) * profit_percent / 100)
  const total_cost       = round2(itogo_po_razdelam + overhead_amount + profit_amount)
  const vat_cost         = round2(total_cost * vat_percent / 100)
  const total_with_vat   = round2(total_cost + vat_cost)

  // ==================== ГРУППИРОВКА ПО РАЗДЕЛАМ ====================
  const { sectionMap, sectionOrder } = estimateMapper.groupEstimateItemsBySection(calcItems)

  // ==================== ЛИСТ ДЕФЕКТОВКА №1 (10 колонок как в Смете 2007) ====================
  {
    // Ширина колонок Дефектовки
    defSheet.getColumn(1).width = 5     // A: № п/п
    defSheet.getColumn(2).width = 45    // B: Наименование
    defSheet.getColumn(3).width = 7     // C: ед.изм.
    defSheet.getColumn(4).width = 10    // D: кол-во
    defSheet.getColumn(5).width = 12    // E: цена (базовая)
    defSheet.getColumn(6).width = 14    // F: стоимость (базовая)
    defSheet.getColumn(7).width = 6     // G: тип (ПР/МАТ/МЕХ)
    defSheet.getColumn(8).width = 8     // H: коэфф.
    defSheet.getColumn(9).width = 12    // I: сметная цена
    defSheet.getColumn(10).width = 14   // J: итого

    // Строка 1: коэффициенты
    defSheet.getCell('A1').value = work_coef
    defSheet.getCell('B1').value = 'коэфф. работ'
    defSheet.getCell('D1').value = material_coef
    defSheet.getCell('E1').value = 'коэфф. материалов'
    defSheet.getCell('A1').font = { name: 'Arial', size: 9, bold: true }
    defSheet.getCell('D1').font = { name: 'Arial', size: 9, bold: true }

    // Строка 2: итоги (заполнятся ниже)
    defSheet.getCell('A2').value = 'Итого работ:'
    defSheet.getCell('A2').font = { name: 'Arial', size: 9, bold: true }
    defSheet.getCell('D2').value = 'Итого материалов:'
    defSheet.getCell('D2').font = { name: 'Arial', size: 9, bold: true }

    // Строка 4: НДС
    const nds_rate = vat_percent > 0 ? vat_percent / 100 : 0
    defSheet.getCell('A4').value = `НДС ${vat_percent}%`
    defSheet.getCell('A4').font = { name: 'Arial', size: 9, bold: true }

    // Строка 6-7: Заголовки таблицы
    const defHeaders = ['№ п/п', 'Наименование работ, материалов, услуг', 'ед. изм.', 'кол-во', 'цена', 'стоимость', 'тип', 'k-коэфф', 'сметная цена', 'итого']
    defHeaders.forEach((h, i) => {
      const cell = defSheet.getRow(6).getCell(i + 1)
      cell.value = h
      cell.font = { name: 'Arial', size: 8, bold: true }
      cell.fill = STYLES.fill.header
      cell.border = STYLES.border.thin
      cell.alignment = STYLES.alignment.center
    })
    ;['1','2','3','4','5','6','7','8','9','10'].forEach((v, i) => {
      const cell = defSheet.getRow(7).getCell(i + 1)
      cell.value = v
      cell.font = { name: 'Arial', size: 7, bold: true, italic: true }
      cell.fill = STYLES.fill.header
      cell.border = STYLES.border.thin
      cell.alignment = STYLES.alignment.center
    })

    // Данные — начинаем со строки 8
    let dRow = 8
    let defItemNum = 0
    const jCells = [] // адреса ячеек J для формулы итого

    for (const sid of sectionOrder) {
      const secItems = sectionMap.get(sid) || []
      if (!secItems.length) continue

      // Заголовок раздела
      const secName = secItems.find(it => (it?.section_name || '').trim())?.section_name || secItems.find(it => (it?.name || '').trim())?.name || `Раздел`
      safeMergeCells(defSheet, `A${dRow}:J${dRow}`)
      defSheet.getCell(`A${dRow}`).value = secName
      defSheet.getCell(`A${dRow}`).font = { name: 'Arial', size: 9, bold: true }
      defSheet.getCell(`A${dRow}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROW_COLORS.section } }
      defSheet.getCell(`A${dRow}`).border = STYLES.border.thin
      dRow++

      for (const item of secItems) {
        const rtype = item.row_type || 'rascenka'
        if (rtype === 'comment' || rtype === 'spr' || rtype === 'empt') continue

        defItemNum++
        const calculated = item._docCalc || calculateDocumentItemAmounts(item, calcCoefficients)
        const qty = parseFloat(item.quantity) || 0
        const qty_r = calculated.quantityRounded
        const basePrice = calculated.basePrice
        const typeCode = calculated.typeCode
        const koeff = calculated.coeff
        const stoimost = calculated.factTotal
        const smetaPrice = calculated.smetaPrice
        const itogo = calculated.sumSmeta

        const r = defSheet.getRow(dRow)
        const setDCell = (col, val, align, numFmt) => {
          const c = r.getCell(col)
          c.value = val
          c.font = { name: 'Arial', size: 9 }
          c.border = STYLES.border.thin
          c.alignment = align || STYLES.alignment.center
          if (numFmt) c.numFmt = numFmt
        }

        setDCell(1, defItemNum, STYLES.alignment.center)
        setDCell(2, item.name || '', { horizontal: 'left', vertical: 'middle', wrapText: true })
        setDCell(3, item.unit || 'шт.', STYLES.alignment.center)
        setDCell(4, qty > 0 ? qty : null, STYLES.alignment.right, '#,##0.####')
        setDCell(5, basePrice > 0 ? basePrice : null, STYLES.alignment.right, '#,##0.00')
        setDCell(6, stoimost > 0 ? stoimost : null, STYLES.alignment.right, '#,##0.00')
        setDCell(7, typeCode, STYLES.alignment.center)
        setDCell(8, koeff, STYLES.alignment.center, '#,##0.00')
        setDCell(9, smetaPrice > 0 ? smetaPrice : null, STYLES.alignment.right, '#,##0.00')
        setDCell(10, itogo > 0 ? itogo : null, STYLES.alignment.right, '#,##0.00')

        // Цвет строки по типу
        const bgColor = getRowColor(rtype)
        for (let c = 1; c <= 10; c++) {
          r.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } }
        }

        jCells.push(`J${dRow}`)
        dRow++

      }
    }

    // Итоговые строки на листе Дефектовка
    dRow++
    safeMergeCells(defSheet, `A${dRow}:I${dRow}`)
    defSheet.getCell(`A${dRow}`).value = 'Итого по разделам:'
    defSheet.getCell(`A${dRow}`).font = { name: 'Arial', size: 9, bold: true }
    defSheet.getCell(`A${dRow}`).alignment = STYLES.alignment.right
    defSheet.getCell(`A${dRow}`).border = STYLES.border.thin
    defSheet.getCell(`J${dRow}`).value = itogo_po_razdelam
    defSheet.getCell(`J${dRow}`).numFmt = '#,##0.00'
    defSheet.getCell(`J${dRow}`).font = { name: 'Arial', size: 9, bold: true }
    defSheet.getCell(`J${dRow}`).border = STYLES.border.thin
    dRow++

    // Заполняем итоги в строках 2 (работы/материалы)
    defSheet.getCell('B2').value = sum_pr
    defSheet.getCell('B2').numFmt = '#,##0.00'
    defSheet.getCell('B2').font = { name: 'Arial', size: 9, bold: true }
    defSheet.getCell('E2').value = round2(sum_mat + sum_meh)
    defSheet.getCell('E2').numFmt = '#,##0.00'
    defSheet.getCell('E2').font = { name: 'Arial', size: 9, bold: true }

    // НДС в строке 4
    defSheet.getCell('B4').value = vat_cost
    defSheet.getCell('B4').numFmt = '#,##0.00'
    defSheet.getCell('B4').font = { name: 'Arial', size: 9, bold: true }
    defSheet.getCell('D4').value = `Всего: ${total_with_vat.toLocaleString('ru-RU', { minimumFractionDigits: 2 })} руб.`
    defSheet.getCell('D4').font = { name: 'Arial', size: 9, bold: true }
  }

  // ==================== ШАПКА СМЕТЫ (лист Смета — 6-графка) ====================
  let rowNum = 1
  // Фиксируем геометрию колонок, чтобы шаблонные стили не плыли
  sheet.getColumn(1).width = 6
  sheet.getColumn(2).width = 52
  sheet.getColumn(3).width = 10
  sheet.getColumn(4).width = 12
  sheet.getColumn(5).width = 16
  sheet.getColumn(6).width = 18

  // Строка 1: Утверждения (Заказчик / Подрядчик) — как в ZaruAI Смета
  if (clientName || companyName) {
    safeMergeCells(sheet, `A${rowNum}:C${rowNum}`)
    sheet.getCell(`A${rowNum}`).value = clientName ? `Заказчик: ${clientName}` : ''
    sheet.getCell(`A${rowNum}`).font = { name: 'Arial', size: 9 }
    sheet.getCell(`A${rowNum}`).alignment = STYLES.alignment.left

    safeMergeCells(sheet, `D${rowNum}:F${rowNum}`)
    sheet.getCell(`D${rowNum}`).value = companyName ? `Подрядчик: ${companyName}` : ''
    sheet.getCell(`D${rowNum}`).font = { name: 'Arial', size: 9 }
    sheet.getCell(`D${rowNum}`).alignment = STYLES.alignment.left
    sheet.getRow(rowNum).height = 16
    rowNum++

    // Строка директора
    safeMergeCells(sheet, `A${rowNum}:C${rowNum}`)
    sheet.getCell(`A${rowNum}`).value = '_________________________'
    sheet.getCell(`A${rowNum}`).font = { name: 'Arial', size: 9 }
    sheet.getCell(`A${rowNum}`).alignment = STYLES.alignment.left

    safeMergeCells(sheet, `D${rowNum}:F${rowNum}`)
    sheet.getCell(`D${rowNum}`).value = `_________________________ / ${director} /`
    sheet.getCell(`D${rowNum}`).font = { name: 'Arial', size: 9 }
    sheet.getCell(`D${rowNum}`).alignment = STYLES.alignment.left
    sheet.getRow(rowNum).height = 16
    rowNum++

    safeMergeCells(sheet, `A${rowNum}:C${rowNum}`)
    sheet.getCell(`A${rowNum}`).value = `${dateStr}                м.п.`
    sheet.getCell(`A${rowNum}`).font = { name: 'Arial', size: 9 }
    sheet.getCell(`A${rowNum}`).alignment = STYLES.alignment.left

    safeMergeCells(sheet, `D${rowNum}:F${rowNum}`)
    sheet.getCell(`D${rowNum}`).value = `${dateStr}                м.п.`
    sheet.getCell(`D${rowNum}`).font = { name: 'Arial', size: 9 }
    sheet.getCell(`D${rowNum}`).alignment = STYLES.alignment.left
    sheet.getRow(rowNum).height = 16
    rowNum += 2
  }

  // Заголовок ЛОКАЛЬНАЯ СМЕТА
  safeMergeCells(sheet, `A${rowNum}:F${rowNum}`)
  sheet.getCell(`A${rowNum}`).value = `ЛОКАЛЬНАЯ СМЕТА № ${estimate.number || 'Б/Н'}`
  sheet.getCell(`A${rowNum}`).font = { name: 'Arial', size: 14, bold: true }
  sheet.getCell(`A${rowNum}`).alignment = STYLES.alignment.center
  sheet.getRow(rowNum).height = 28
  rowNum++

  // Строка: смета к договору
  safeMergeCells(sheet, `A${rowNum}:F${rowNum}`)
  sheet.getCell(`A${rowNum}`).value = 'Смета к договору № ' + (estimate?.contract_number || '___') + ' от ' + formatDate(estimate?.contract_date || estimate?.date || new Date().toISOString())
  sheet.getCell(`A${rowNum}`).font = { name: 'Arial', size: 10, bold: true }
  sheet.getCell(`A${rowNum}`).alignment = STYLES.alignment.center
  sheet.getRow(rowNum).height = 16
  rowNum++

  // Название работ
  safeMergeCells(sheet, `A${rowNum}:F${rowNum}`)
  sheet.getCell(`A${rowNum}`).value = estimate.name || 'Ремонтно-отделочные работы'
  sheet.getCell(`A${rowNum}`).font = { name: 'Arial', size: 10, italic: true }
  sheet.getCell(`A${rowNum}`).alignment = STYLES.alignment.center
  sheet.getRow(rowNum).height = 18
  rowNum++

  // Объект
  if (address) {
    safeMergeCells(sheet, `A${rowNum}:F${rowNum}`)
    sheet.getCell(`A${rowNum}`).value = `Объект: ${address}`
    sheet.getCell(`A${rowNum}`).font = { name: 'Arial', size: 10 }
    sheet.getCell(`A${rowNum}`).alignment = STYLES.alignment.center
    sheet.getRow(rowNum).height = 16
    rowNum++
  }

  // Итоговая строка-преамбула
  safeMergeCells(sheet, `A${rowNum}:F${rowNum}`)
  const vatNote = vat_percent > 0 ? `НДС ${vat_percent}%` : 'НДС не предусмотрен'
  sheet.getCell(`A${rowNum}`).value = `Сметная стоимость ${total_with_vat.toLocaleString('ru-RU', { minimumFractionDigits: 2 })} руб.  (${vatNote})`
  sheet.getCell(`A${rowNum}`).font = { name: 'Arial', size: 10 }
  sheet.getCell(`A${rowNum}`).alignment = STYLES.alignment.center
  sheet.getRow(rowNum).height = 16
  rowNum++

  // Пустая строка-разделитель
  sheet.getRow(rowNum).height = 6
  rowNum++

  // ==================== ЗАГОЛОВКИ ТАБЛИЦЫ (строка повторяется при печати) ====================
  const tableHeaderRow = rowNum
  sheet.getRow(rowNum).height = 36
  ;['№\nп/п', 'Наименование работ и затрат', 'Ед.\nизм.', 'Количество', 'Цена за\nединицу, руб.', 'Стоимость,\nруб.'].forEach((v, i) => {
    const cell = sheet.getRow(rowNum).getCell(i + 1)
    cell.value = v
    cell.font = { name: 'Arial', size: 9, bold: true }
    cell.fill = STYLES.fill.header
    cell.border = STYLES.border.thin
    cell.alignment = STYLES.alignment.center
  })
  // Номера граф
  rowNum++
  sheet.getRow(rowNum).height = 14
  ;['1', '2', '3', '4', '5', '6'].forEach((v, i) => {
    const cell = sheet.getRow(rowNum).getCell(i + 1)
    cell.value = v
    cell.font = { name: 'Arial', size: 8, bold: true, italic: true, color: { argb: 'FF666666' } }
    cell.fill = STYLES.fill.header
    cell.border = STYLES.border.thin
    cell.alignment = STYLES.alignment.center
  })

  // Закрепить строку заголовка при печати
  sheet.pageSetup.printTitlesRow = `${tableHeaderRow}:${rowNum}`
  rowNum++

  let sectionIndex = 0
  let itemOverallNum = 0

  const writeSectionHeader = (name, idx) => {
    const r = sheet.getRow(rowNum)
    r.height = 18
    safeMergeCells(sheet, `A${rowNum}:F${rowNum}`)
    r.getCell(1).value = `Раздел ${idx}. ${name}`
    r.getCell(1).font = { name: 'Arial', size: 10, bold: true }
    r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROW_COLORS.section } }
    r.getCell(1).border = STYLES.border.thin
    r.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' }
    rowNum++
  }

  const writeItemRow = (item, itemNum) => {
    const rtype = item.row_type || 'rascenka'
    const qty = parseFloat(item.quantity) || 0
    const sumSmeta = Number(item.sum_smeta ?? item._docCalc?.sumSmeta ?? 0) || 0
    const price = item.price_smeta != null
      ? (Number(item.price_smeta) || 0)
      : (qty > 0 ? round2(sumSmeta / qty) : 0)
    const bgColor  = getRowColor(rtype)

    const r = sheet.getRow(rowNum)
    const nameLen = (item.name || '').length
    r.height = Math.max(18, Math.ceil(nameLen / 52) * 14)

    const setCell = (col, value, align, numFmt) => {
      const cell = r.getCell(col)
      cell.value = value
      cell.font = { name: 'Arial', size: 9 }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } }
      cell.border = STYLES.border.thin
      cell.alignment = align || STYLES.alignment.center
      if (numFmt) cell.numFmt = numFmt
    }

    setCell(1, itemNum, STYLES.alignment.center)
    setCell(2, item.name || '', { horizontal: 'left', vertical: 'middle', wrapText: true })
    setCell(3, item.unit || 'шт.', STYLES.alignment.center)
    setCell(4, qty > 0 ? qty : null, STYLES.alignment.right, '#,##0.####')
    setCell(5, price > 0 ? price : null, STYLES.alignment.right, '#,##0.00')
    setCell(6, sumSmeta > 0 ? sumSmeta : null, STYLES.alignment.right, '#,##0.00')

    // Для комментариев — объединяем ячейки
    if (rtype === 'comment' || rtype === 'spr') {
      // Убираем объединение, просто стиль другой
    }
    rowNum++
  }

  const writeSectionTotal = (sectionName, sectionTotal) => {
    const r = sheet.getRow(rowNum)
    r.height = 18
    safeMergeCells(sheet, `A${rowNum}:E${rowNum}`)
    r.getCell(1).value = `Итого по разделу «${sectionName}»:`
    r.getCell(1).font = { name: 'Arial', size: 9, bold: true }
    r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROW_COLORS.irazd } }
    r.getCell(1).border = STYLES.border.thin
    r.getCell(1).alignment = STYLES.alignment.right
    r.getCell(6).value = sectionTotal
    r.getCell(6).numFmt = '#,##0.00'
    r.getCell(6).font = { name: 'Arial', size: 9, bold: true }
    r.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROW_COLORS.irazd } }
    r.getCell(6).border = STYLES.border.thin
    r.getCell(6).alignment = STYLES.alignment.right
    rowNum++
  }

  // Пишем разделы
  for (const sid of sectionOrder) {
    const secItems = sectionMap.get(sid) || []
    if (!secItems.length) continue
    sectionIndex++

    // Ищем название раздела
    // (sections должны быть переданы через estimate.sections или как отдельный параметр)
    const sectionName = resolveEstimateSectionName({
      estimate,
      sections,
      secItems,
      sid,
      sectionIndex
    })
    writeSectionHeader(sectionName, sectionIndex)

    let sectionTotal = 0
    let itemInSection = 0
    secItems.forEach(item => {
      const rtype = item.row_type || 'rascenka'
      if (rtype === 'section' || rtype === 'irazd' || rtype === 'itog' || rtype === 'lz') {
        return
      }
      if (rtype === 'comment' || rtype === 'spr' || rtype === 'empt') {
        // Комментарий — пишем без номера
        writeItemRow(item, '')
      } else {
        itemOverallNum++
        itemInSection++
        sectionTotal += Number(item.sum_smeta ?? item._docCalc?.sumSmeta ?? 0) || 0
        writeItemRow(item, itemOverallNum)
      }
    })

    if (sectionOrder.length > 1) {
      writeSectionTotal(sectionName, round2(sectionTotal))
    }
  }

  // ==================== ИТОГОВЫЕ СТРОКИ ====================
  rowNum++  // пустая строка

  const addTotalLine = (label, value, bold = false, fill = 'FFEFEFEF') => {
    const r = sheet.getRow(rowNum)
    r.height = 18
    safeMergeCells(sheet, `A${rowNum}:E${rowNum}`)
    r.getCell(1).value = label
    r.getCell(1).font = { name: 'Arial', size: 9, bold }
    r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
    r.getCell(1).border = STYLES.border.thin
    r.getCell(1).alignment = STYLES.alignment.right
    if (value !== null && value !== undefined) {
      r.getCell(6).value = value
      r.getCell(6).numFmt = '#,##0.00'
      r.getCell(6).font = { name: 'Arial', size: 9, bold }
      r.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
      r.getCell(6).border = STYLES.border.thin
      r.getCell(6).alignment = STYLES.alignment.right
    }
    rowNum++
  }

  addTotalLine('Итого по разделам:', itogo_po_razdelam)
  addTotalLine(`в т.ч. стоимость работ:`, sum_pr)
  addTotalLine(`в т.ч. стоимость материалов:`, sum_mat)
  if (sum_meh > 0) addTotalLine(`в т.ч. механизмы:`, sum_meh)

  if (overhead_percent > 0) {
    addTotalLine(`Накладные расходы (${overhead_percent}%):`, overhead_amount)
  }
  if (profit_percent > 0) {
    addTotalLine(`Сметная прибыль (${profit_percent}%):`, profit_amount)
  }

  if (vat_percent > 0) {
    addTotalLine('Итого без НДС:', total_cost)
    addTotalLine(`НДС (${vat_percent}%):`, vat_cost)
  }

  // Строка "Всего по смете" — жирная, крупнее
  const finalRow = sheet.getRow(rowNum)
  finalRow.height = 22
  safeMergeCells(sheet, `A${rowNum}:E${rowNum}`)
  finalRow.getCell(1).value = 'Всего по смете:'
  finalRow.getCell(1).font = { name: 'Arial', size: 11, bold: true }
  finalRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROW_COLORS.itog } }
  finalRow.getCell(1).border = STYLES.border.medium
  finalRow.getCell(1).alignment = STYLES.alignment.right
  finalRow.getCell(6).value = total_with_vat
  finalRow.getCell(6).numFmt = '#,##0.00'
  finalRow.getCell(6).font = { name: 'Arial', size: 11, bold: true }
  finalRow.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROW_COLORS.itog } }
  finalRow.getCell(6).border = STYLES.border.medium
  finalRow.getCell(6).alignment = STYLES.alignment.right
  rowNum += 3

  // ==================== ПОДПИСИ ====================
  const writeSignRow = (label, signLine, fioLine) => {
    const r = sheet.getRow(rowNum)
    r.height = 18
    r.getCell(1).value = label
    r.getCell(1).font = { name: 'Arial', size: 9, bold: true }
    r.getCell(1).alignment = STYLES.alignment.left
    safeMergeCells(sheet, `B${rowNum}:C${rowNum}`)
    r.getCell(2).value = signLine
    r.getCell(2).font = { name: 'Arial', size: 9 }
    r.getCell(2).alignment = STYLES.alignment.center
    r.getCell(4).value = '/'
    r.getCell(4).alignment = STYLES.alignment.center
    safeMergeCells(sheet, `E${rowNum}:F${rowNum}`)
    r.getCell(5).value = fioLine
    r.getCell(5).font = { name: 'Arial', size: 9 }
    r.getCell(5).alignment = STYLES.alignment.center
    rowNum++
    // Подписи мелко
    const r2 = sheet.getRow(rowNum)
    r2.height = 12
    safeMergeCells(sheet, `B${rowNum}:C${rowNum}`)
    r2.getCell(2).value = '(подпись)'
    r2.getCell(2).font = { name: 'Arial', size: 7, italic: true }
    r2.getCell(2).alignment = STYLES.alignment.center
    safeMergeCells(sheet, `E${rowNum}:F${rowNum}`)
    r2.getCell(5).value = '(расшифровка подписи)'
    r2.getCell(5).font = { name: 'Arial', size: 7, italic: true }
    r2.getCell(5).alignment = STYLES.alignment.center
    rowNum += 2
  }

  const companyDirector = companyInfo?.director || ''
  writeSignRow('Составил:', '___________________________', companyDirector || '___________________________')
  writeSignRow('Проверил:', '___________________________', '___________________________')

  // Сохраняем
  await workbook.xlsx.writeFile(outputPath)
  return outputPath
}

// === Генерация КС-2 (Унифицированная форма) в Excel ===
const generateKS2Excel = async (act, items, sections, project, estimate, coefficients, outputPath) => {
  const workbook = await loadTemplateWorkbook('DocTemplates/КС-2.xlsx')
  const sheet = getWorksheetByName(workbook, ['КС-2 №1', 'КС-2', 'КС-2 № 1'])

  const workCoef     = coefficients?.work_coef     || estimate?.work_coef     || 1.8
  const materialCoef = coefficients?.material_coef || estimate?.material_coef || 1.04
  const vat_percent  = parseFloat(estimate?.vat_percent) || 0
  // Точный расчёт сметной цены строки (ROUND до 2 знаков)
  const getSmetaPrice = (item) => {
    if (item?.price_smeta != null) return Number(item.price_smeta) || 0
    const lab = Number(item?.labor_price ?? item?.price ?? 0)
    const mat = Number(item?.material_price ?? 0)
    const rtype = item?.row_type || 'rascenka'
    if (isMatRow(rtype) || isMehRow(rtype)) return round2(mat * materialCoef)
    return round2(round2(lab * workCoef) + round2(mat * materialCoef))
  }

  const dateValue      = act?.date || estimate?.date || new Date().toISOString()
  const dateObj        = toDateValue(dateValue)
  const periodFrom     = toDateValue(act?.period_from || act?.period_start || dateValue)
  const periodTo       = toDateValue(act?.period_to   || act?.period_end   || dateValue)
  const clientName     = project?.client_name  || act?.client_name     || ''
  const investorName   = project?.investor_name || clientName
  const contractorName = act?.contractor_name  || project?.contractor_name || ''
  const address        = project?.address      || estimate?.address    || ''
  const estimateName   = estimate?.name        || project?.name        || 'Ремонтно-отделочные работы'
  const objectText     = address ? `${estimateName}, ${address}` : estimateName

  applyExpandedDocumentHeader(sheet, {
    docType: 'КС-2',
    docNumber: act?.number || act?.id || '',
    docDate: formatDate(dateValue),
    object: objectText,
    description: estimateName,
    basis: act?.contract_number || estimate?.contract_number ? ('Договор № ' + (act?.contract_number || estimate?.contract_number)) : '',
    period: 'с ' + formatDate(periodFrom) + ' по ' + formatDate(periodTo),
    customer: clientName,
    contractor: contractorName
  })

  // === Реквизиты шапки КС-2 ===
  const trySet = (addr, val) => { try { sheet.getCell(addr).value = val } catch (e) {} }

  trySet('C6',  investorName)
  trySet('C8',  clientName)
  trySet('C10', contractorName)
  trySet('C12', objectText)
  trySet('C14', estimateName)
  trySet('C16', act?.contract_number || estimate?.contract_number || '')
  trySet('H16', act?.contract_number || estimate?.contract_number || '')
  trySet('H17', toDateValue(act?.contract_date || estimate?.contract_date || dateValue))

  // Номер и дата акта, отчётный период
  trySet('D22', act?.number || act?.id || 1)
  trySet('E22', dateObj || '')
  trySet('F22', periodFrom || '')
  trySet('G22', periodTo || '')
  trySet('H22', dateObj || '')

  // === Расчёт суммарных итогов (формулы ZaruAI: J = ROUND(I * ROUND(D,2), 2)) ===
  let sum_pr = 0, sum_mat = 0, sum_meh = 0
  ;(items || []).forEach((item) => {
    const rtype = item?.row_type || 'rascenka'
    if (rtype === 'comment' || rtype === 'spr' || rtype === 'empt') return
    const qty   = Number(item?.quantity) || 0
    const qty_r = round2(qty)
    const lab   = Number(item?.labor_price   ?? item?.price ?? 0)
    const mat   = Number(item?.material_price ?? 0)

    if (isMatRow(rtype)) {
      sum_mat += round2(round2(mat * materialCoef) * qty_r)
    } else if (isMehRow(rtype)) {
      sum_meh += round2(round2(mat * materialCoef) * qty_r)
    } else {
      sum_pr += round2(round2(lab * workCoef) * qty_r) + round2(round2(mat * materialCoef) * qty_r)
    }
  })
  sum_pr  = round2(sum_pr)
  sum_mat = round2(sum_mat)
  sum_meh = round2(sum_meh)
  const totalSmeta = round2(sum_pr + sum_mat + sum_meh)
  const vat_cost   = round2(totalSmeta * vat_percent / 100)
  const totalWithVat = round2(totalSmeta + vat_cost)

  // Итоговая сумма акта в шапке
  trySet('E24', totalSmeta)

  // === Заполняем строки данных ===
  const headerRow = findRowByCellText(sheet, 3, 'Наименование работ')
  const dataStart = (() => {
    if (!headerRow) return 29
    for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
      const text = getCellText(sheet.getRow(r).getCell(2)).trim()
      if (text.startsWith('Раздел:') || text.startsWith('Раздел ')) return r
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

  const sectionSnap      = snapshotRowStyle(sheet.getRow(dataStart))
  const itemSnap         = snapshotRowStyle(sheet.getRow(dataStart + 1))
  const sectionTotalSnap = snapshotRowStyle(sheet.getRow(sectionTotalRow))
  const blankSnap        = snapshotRowStyle(sheet.getRow(sectionTotalRow + 1))

  if (totalsRow && totalsRow > dataStart) {
    sheet.spliceRows(dataStart, totalsRow - dataStart)
  }

  const sectionMap   = new Map()
  const sectionItems = new Map()
  ;(sections || []).forEach(s => sectionMap.set(s.id, s))
  ;(items || []).forEach((item) => {
    const sid = item?.section_id || 0
    if (!sectionItems.has(sid)) sectionItems.set(sid, [])
    sectionItems.get(sid).push(item)
  })
  const sectionOrder = []
  ;(sections || []).forEach((s) => { if (sectionItems.has(s.id)) sectionOrder.push(s.id) })
  sectionItems.forEach((_, sid) => { if (!sectionOrder.includes(sid)) sectionOrder.push(sid) })

  let rowPtr     = dataStart
  let sectionIdx = 0
  let itemNum    = 0

  sectionOrder.forEach((sid, idx) => {
    const secItems    = sectionItems.get(sid) || []
    if (!secItems.length) return
    sectionIdx++
    const sectionName = sectionMap.get(sid)?.name || (sid === 0 ? 'Без раздела' : `Раздел ${sectionIdx}`)

    const sectionRow = insertStyledRow(sheet, rowPtr, sectionSnap)
    sectionRow.getCell(1).value = sectionIdx
    sectionRow.getCell(2).value = `Раздел: ${sectionName}`
    rowPtr++

    let sectionTotal = 0
    let secItemIdx   = 0
    secItems.forEach((item) => {
      const rtype = item?.row_type || 'rascenka'
      if (rtype === 'comment' || rtype === 'spr' || rtype === 'empt') {
        const cr = insertStyledRow(sheet, rowPtr, itemSnap)
        cr.getCell(3).value = item?.name || ''
        rowPtr++
        return
      }

      secItemIdx++
      itemNum++
      const qty   = Number(item?.quantity) || 0
      const qty_r = round2(qty) // ROUND(D,2) — ZaruAI
      const price = getSmetaPrice(item)
      const total = round2(price * qty_r)
      sectionTotal += total

      // КС-2: колонки — 1:порядковый в разделе, 2:порядковый по акту, 3:наименование,
      //                   4:шифр/обоснование, 5:ед.изм, 6:количество, 7:цена, 8:стоимость
      const itemRow = insertStyledRow(sheet, rowPtr, itemSnap)
      itemRow.getCell(1).value = secItemIdx
      itemRow.getCell(2).value = itemNum
      itemRow.getCell(3).value = item?.name || ''
      itemRow.getCell(4).value = item?.justification || ''
      itemRow.getCell(5).value = item?.unit || 'шт.'
      itemRow.getCell(6).value = qty
      itemRow.getCell(7).value = price
      itemRow.getCell(8).value = total
      rowPtr++
    })

    const totalRow = insertStyledRow(sheet, rowPtr, sectionTotalSnap)
    totalRow.getCell(1).value = 'Итого по разделу'
    totalRow.getCell(8).value = round2(sectionTotal)
    rowPtr++

    if (idx < sectionOrder.length - 1) {
      insertStyledRow(sheet, rowPtr, blankSnap)
      rowPtr++
    }
  })

  // Заполняем итоговые строки шаблона
  const setByText = (text, val, col = 8) => {
    const ri = findRowByCellText(sheet, 1, text)
    if (ri) sheet.getCell(`${String.fromCharCode(64 + col)}${ri}`).value = val
    else {
      // Пробуем F
      const ri2 = findRowByCellText(sheet, 1, text)
      if (ri2) sheet.getCell(`F${ri2}`).value = val
    }
  }

  setByText('Итого по разделам',           totalSmeta)
  setByText('в т.ч. стоимость работ',      sum_pr)
  setByText('в т.ч. стоимость материалов', round2(sum_mat + sum_meh))
  if (vat_percent > 0) setByText('НДС', vat_cost)
  setByText('Итого по ведомости', totalSmeta)
  setByText('Всего по акту',       totalWithVat)

  // Строка подписей (Заказчик / Подрядчик)
  const signRow = findRowByCellText(sheet, 1, 'Заказчик')
  if (signRow) {
    try {
      sheet.getCell(`C${signRow}`).value = clientName
      sheet.getCell(`C${signRow + 2}`).value = contractorName
    } catch (e) {}
  }

  await workbook.xlsx.writeFile(outputPath)
  return outputPath
}

const generateKS3Excel = async (cert, project, outputPath) => {
  const workbook = await loadTemplateWorkbook('DocTemplates/КС-3.xlsx')
  const sheet = getWorksheetByName(workbook, ['КС-3 №1', 'КС-3', 'КС-3 № 1'])

  const clientName     = cert?.client_name     || project?.client_name     || ''
  const investorName   = project?.investor_name || clientName
  const contractorName = cert?.contractor_name || project?.contractor_name || ''
  const objectName     = cert?.object_name     || project?.name            || ''
  const address        = project?.address      || ''
  const objectText     = objectName && address ? `${objectName}, ${address}` : (objectName || address)

  const contractNumber = cert?.contract_number || ''
  const contractDate   = toDateValue(cert?.contract_date || cert?.date)

  const docNumber  = cert?.number || cert?.id || 1
  const docDate    = toDateValue(cert?.date)
  const periodFrom = toDateValue(cert?.period_from  || cert?.period_start || cert?.date)
  const periodTo   = toDateValue(cert?.period_to    || cert?.period_end   || cert?.date)

  // Суммы с правильным округлением
  const vat_percent       = parseFloat(cert?.vat_percent) || 0
  const totalWithoutVat   = round2(cert?.total_without_vat ?? cert?.amount_without_vat ?? cert?.amount ?? 0)
  const computedVat       = round2(totalWithoutVat * vat_percent / 100)
  const vatAmount         = round2(cert?.vat_amount ?? cert?.total_vat ?? computedVat)
  const totalWithVat      = round2(cert?.total_with_vat ?? cert?.amount ?? (totalWithoutVat + vatAmount))

  applyExpandedDocumentHeader(sheet, {
    docType: 'КС-3',
    docNumber: cert?.number || cert?.id || '',
    docDate: formatDate(cert?.date || ''),
    object: objectText,
    description: objectName || project?.name || '',
    basis: contractNumber ? ('Договор № ' + contractNumber) : '',
    period: periodFrom || periodTo ? ('с ' + formatDate(periodFrom) + ' по ' + formatDate(periodTo)) : '',
    customer: clientName,
    contractor: contractorName
  })

  // === Заполняем шаблон КС-3 ===
  const trySet = (addr, val) => { try { sheet.getCell(addr).value = val } catch (e) {} }

  trySet('I7',  investorName)
  trySet('I9',  clientName)
  trySet('I11', contractorName)
  trySet('I13', objectText)

  trySet('BN16', contractNumber)
  trySet('BN17', contractDate || '')

  trySet('AR23', docNumber)
  trySet('BC23', docDate || '')
  trySet('BO23', periodFrom || '')
  trySet('BV23', periodTo || '')

  // Данные строки акта (первая строка — объект сметы)
  trySet('A34',  1)
  trySet('H34',  objectName || project?.name || '')
  trySet('AL34', cert?.estimate_number || cert?.estimate_code || '')
  // Колонки стоимости (за отчётный период)
  trySet('AP34', totalWithoutVat)
  trySet('BC34', totalWithoutVat)
  trySet('BP34', totalWithVat)

  // Строка итогов (ищем по тексту или пишем в фиксированные ячейки)
  const itogRow = findRowByCellText(sheet, 1, 'Итого')
  if (itogRow) {
    trySet(`AP${itogRow}`, totalWithoutVat)
    trySet(`BC${itogRow}`, totalWithoutVat)
    trySet(`BP${itogRow}`, totalWithVat)
  }

  // НДС строка
  const vatRow = findRowByCellText(sheet, 1, 'НДС')
  if (vatRow) {
    if (vat_percent > 0) {
      trySet(`AP${vatRow}`, vatAmount)
      trySet(`BC${vatRow}`, vatAmount)
      trySet(`BP${vatRow}`, vatAmount)
    } else {
      trySet(`AP${vatRow}`, 'не облагается')
    }
  }

  // Всего строка
  const totalRow = findRowByCellText(sheet, 1, 'Всего')
  if (totalRow) {
    trySet(`AP${totalRow}`, totalWithVat)
    trySet(`BC${totalRow}`, totalWithVat)
    trySet(`BP${totalRow}`, totalWithVat)
  }

  await workbook.xlsx.writeFile(outputPath)
  return outputPath
}

const generateM29Excel = async (project, m29Doc, items, outputPath) => {
  const workbook = await loadTemplateWorkbook('DocTemplates/М-29.xlsx')
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

  applyExpandedDocumentHeader(sheet, {
    docType: 'М-29',
    docNumber: m29Doc.number || '',
    docDate: formatDate(m29Doc.date || ''),
    object: objectName,
    description: 'Отчет о расходе материалов',
    basis: contractNumber ? ('Договор № ' + contractNumber) : '',
    period: periodFrom || periodTo ? ('с ' + formatDate(periodFrom) + ' по ' + formatDate(periodTo)) : '',
    note: ks2Number ? ('по акту КС-2 № ' + ks2Number) : '',
    customer: clientName,
    contractor: contractorName
  })

  const trySet = (addr, val) => { try { sheet.getCell(addr).value = val } catch (e) {} }

  trySet('A1', contractorName)
  trySet('E4', m29Doc.number || '')
  trySet('C7', ks2Number ? `Акт КС-2 № ${ks2Number}${ks2Date ? ` от ${formatDate(ks2Date)}` : ''}` : '')
  trySet('F7', periodFrom || periodTo ? `с ${formatDate(periodFrom)} по ${formatDate(periodTo)}` : '')
  trySet('C8', contractNumber
    ? `Договор № ${contractNumber}${contractDate ? ` от ${formatDate(contractDate)}` : ''}${objectName ? `; объект: ${objectName}` : ''}`
    : objectName)
  trySet('C9',  clientName)
  trySet('C11', toDateValue(m29Doc.date || new Date().toISOString()))

  const headerRow = findRowByCellText(sheet, 3, 'Наименование ресурсов') || 12
  const dataStart = headerRow + 2
  const totalRowOrig = findRowByCellText(sheet, 1, 'Итого по ведомости')

  const itemSnap  = snapshotRowStyle(sheet.getRow(dataStart))
  const blankSnap = snapshotRowStyle(sheet.getRow(dataStart + 1))

  if (totalRowOrig && totalRowOrig > dataStart) {
    sheet.spliceRows(dataStart, totalRowOrig - dataStart)
  }

  let rowPtr = dataStart
  const materialItems = items || []

  // Суммарные итоги для последней строки
  let totalNormCost   = 0
  let totalActualCost = 0
  let totalDeviation  = 0

  materialItems.forEach((item, idx) => {
    const normQty     = Number(item?.norm_quantity   || item?.planned_quantity || item?.quantity || 0)
    const actualQty   = Number(item?.actual_quantity || item?.fact_quantity    || 0)
    const unitPrice   = Number(item?.unit_price || item?.price || item?.material_price || 0)
    const normCost    = round2(normQty   * unitPrice)
    const actualCost  = round2(actualQty * unitPrice)
    const deviation   = round2(actualCost - normCost)

    totalNormCost   += normCost
    totalActualCost += actualCost
    totalDeviation  += deviation

    const row = insertStyledRow(sheet, rowPtr, itemSnap)
    row.getCell(1).value = idx + 1
    row.getCell(2).value = item?.position_no || item?.smeta_position_no || idx + 1
    row.getCell(3).value = item?.name  || ''
    row.getCell(4).value = item?.unit  || 'шт.'
    row.getCell(5).value = normQty
    row.getCell(6).value = unitPrice
    row.getCell(7).value = normCost
    row.getCell(8).value = actualQty
    row.getCell(9).value = actualCost
    row.getCell(10).value = deviation > 0 ? deviation : null
    row.getCell(11).value = deviation < 0 ? Math.abs(deviation) : null
    rowPtr++
  })

  if (materialItems.length === 0) {
    insertStyledRow(sheet, rowPtr, blankSnap)
    rowPtr++
  }

  // Итоговая строка
  const totalRowIndex = findRowByCellText(sheet, 1, 'Итого по ведомости')
  if (totalRowIndex) {
    trySet(`G${totalRowIndex}`, round2(totalNormCost))
    trySet(`I${totalRowIndex}`, round2(totalActualCost))
    trySet(`J${totalRowIndex}`, totalDeviation > 0 ? round2(totalDeviation) : null)
    trySet(`K${totalRowIndex}`, totalDeviation < 0 ? round2(Math.abs(totalDeviation)) : null)
  }

  await workbook.xlsx.writeFile(outputPath)
  return outputPath
}

const generateSmeta2007Excel = async (estimate, items, sections, coefficients, project, companyInfo, outputPath) => {
  const workbook = await loadTemplateWorkbook('DocTemplates/Смета.xlsx')
  const ws = getWorksheetByName(workbook, ['Смета №1', 'Смета № 1', 'Смета'])

  const workCoef     = coefficients?.work_coef     || estimate?.work_coef     || 1.8
  const materialCoef = coefficients?.material_coef || estimate?.material_coef || 1.04
  const companyName  = companyInfo?.name     || 'Подрядчик'
  const director     = companyInfo?.director || ''
  const clientName   = project?.client_name  || estimate?.client_name || 'Заказчик'
  const address      = project?.address      || estimate?.address     || ''
  const estimateName = estimate?.name        || 'Ремонтно-отделочные работы'
  const dateValue    = estimate?.date        || new Date().toISOString()
  const dateStr      = formatDate(dateValue)
  const vat_percent  = parseFloat(estimate?.vat_percent) || 0

  applyExpandedDocumentHeader(ws, {
    docType: 'Смета',
    docNumber: estimate?.number || '',
    docDate: dateStr,
    object: address,
    description: estimateName,
    basis: estimate?.contract_number ? ('Договор № ' + estimate.contract_number) : '',
    customer: clientName,
    contractor: companyName
  })

  // Точный расчёт сумм — формулы ZaruAI: J = ROUND(I * ROUND(D,2), 2)
  let sum_pr = 0, sum_mat = 0, sum_meh = 0
  ;(items || []).forEach((item) => {
    const rtype = item?.row_type || 'rascenka'
    const qty   = Number(item?.quantity) || 0
    const qty_r = round2(qty)
    const lab   = Number(item?.labor_price   ?? item?.price ?? 0)
    const mat   = Number(item?.material_price ?? 0)

    if (isMatRow(rtype)) {
      sum_mat += round2(round2(mat * materialCoef) * qty_r)
    } else if (isMehRow(rtype)) {
      sum_meh += round2(round2(mat * materialCoef) * qty_r)
    } else {
      sum_pr += round2(round2(lab * workCoef) * qty_r) + round2(round2(mat * materialCoef) * qty_r)
    }
  })
  sum_pr  = round2(sum_pr)
  sum_mat = round2(sum_mat)
  sum_meh = round2(sum_meh)
  const totalSmeta = round2(sum_pr + sum_mat + sum_meh)

  const overhead_percent = parseFloat(estimate?.overhead_percent) || 0
  const profit_percent   = parseFloat(estimate?.profit_percent) || 0
  const overhead_amount  = round2(totalSmeta * overhead_percent / 100)
  const profit_amount    = round2((totalSmeta + overhead_amount) * profit_percent / 100)
  const total_cost       = round2(totalSmeta + overhead_amount + profit_amount)
  const vat_cost         = round2(total_cost * vat_percent / 100)
  const total_with_vat   = round2(total_cost + vat_cost)

  // === Заполняем шапку шаблона ===
  ws.getCell('A2').value = `УТВЕРЖДАЮ: ${clientName}`
  ws.getCell('C2').value = `СОГЛАСОВАНО: ${companyName}`
  ws.getCell('A3').value = `_________________________ /  /`
  ws.getCell('C3').value = `_________________________ / ${director} /`
  ws.getCell('A4').value = `${dateStr}                            м.п.`
  ws.getCell('C4').value = `${dateStr}                            м.п.`

  ws.getCell('A5').value = `Смета № ${estimate?.number || '1'}`
  ws.getCell('A6').value = address ? `на ${estimateName} по адресу: ${address}` : `на ${estimateName}`
  ws.getCell('A8').value = `к Договору № _____ от ${dateStr}г.`
  ws.getCell('A9').value = `составлена в уровне текущих цен на ${formatMonthYearRu(dateValue)}г.`

  ws.getCell('F10').value = totalSmeta
  ws.getCell('F11').value = sum_pr
  ws.getCell('F12').value = round2(sum_mat + sum_meh)

  // === Заполняем строки данных ===
  const headerRow    = findRowByCellText(ws, 2, 'Наименование работ')
  const dataStart    = (() => {
    if (!headerRow) return 15
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const text = getCellText(ws.getRow(r).getCell(2)).trim()
      if (text.startsWith('Раздел:')) return r
    }
    return headerRow + 3
  })()
  const totalsRow     = findRowByCellText(ws, 1, 'Итого по разделам')
  const sectionTotalRow = (() => {
    for (let r = dataStart; r <= ws.rowCount; r++) {
      const text = getCellText(ws.getRow(r).getCell(1)).trim()
      if (text.startsWith('Итого по разделу')) return r
    }
    return dataStart + 1
  })()

  const sectionSnap      = snapshotRowStyle(ws.getRow(dataStart))
  const itemSnap         = snapshotRowStyle(ws.getRow(dataStart + 1))
  const sectionTotalSnap = snapshotRowStyle(ws.getRow(sectionTotalRow))
  const blankSnap        = snapshotRowStyle(ws.getRow(sectionTotalRow + 1))

  if (totalsRow && totalsRow > dataStart) {
    ws.spliceRows(dataStart, totalsRow - dataStart)
  }

  const sectionMap   = new Map()
  const sectionItems = new Map()
  ;(sections || []).forEach(s => sectionMap.set(s.id, s))
  ;(items || []).forEach((item) => {
    const sid = item?.section_id || 0
    if (!sectionItems.has(sid)) sectionItems.set(sid, [])
    sectionItems.get(sid).push(item)
  })
  const sectionOrder = []
  ;(sections || []).forEach((s) => { if (sectionItems.has(s.id)) sectionOrder.push(s.id) })
  sectionItems.forEach((_, sid) => { if (!sectionOrder.includes(sid)) sectionOrder.push(sid) })

  let rowPtr     = dataStart
  let sectionIdx = 0
  let itemNum    = 0

  sectionOrder.forEach((sid, idx) => {
    const secItems    = sectionItems.get(sid) || []
    if (!secItems.length) return
    sectionIdx++
    const sectionName = sectionMap.get(sid)?.name || (sid === 0 ? 'Без раздела' : `Раздел ${sectionIdx}`)

    const sectionRow = insertStyledRow(ws, rowPtr, sectionSnap)
    sectionRow.getCell(1).value = sectionIdx
    sectionRow.getCell(2).value = `Раздел: ${sectionName}`
    rowPtr++

    let sectionTotal = 0
    secItems.forEach((item) => {
      const rtype    = item?.row_type || 'rascenka'
      if (rtype === 'comment' || rtype === 'spr' || rtype === 'empt') {
        const commentRow = insertStyledRow(ws, rowPtr, itemSnap)
        commentRow.getCell(2).value = item?.name || ''
        rowPtr++
        return
      }

      itemNum++
      const qty    = Number(item?.quantity) || 0
      const qty_r  = round2(qty) // ROUND(D,2) — ZaruAI
      const lab    = Number(item?.labor_price   ?? item?.price ?? 0)
      const mat    = Number(item?.material_price ?? 0)
      let price, total

      if (isMatRow(rtype)) {
        price = round2(mat * materialCoef)
        total = round2(price * qty_r)
      } else if (isMehRow(rtype)) {
        price = round2(mat * materialCoef)
        total = round2(price * qty_r)
      } else {
        price = round2(round2(lab * workCoef) + round2(mat * materialCoef))
        total = round2(round2(lab * workCoef) * qty_r) + round2(round2(mat * materialCoef) * qty_r)
      }
      sectionTotal += total

      const itemRow = insertStyledRow(ws, rowPtr, itemSnap)
      itemRow.getCell(1).value = itemNum
      itemRow.getCell(2).value = item?.name || ''
      itemRow.getCell(3).value = item?.unit || ''
      itemRow.getCell(4).value = qty
      itemRow.getCell(5).value = price
      itemRow.getCell(6).value = round2(total)
      rowPtr++
    })

    const totalRow = insertStyledRow(ws, rowPtr, sectionTotalSnap)
    totalRow.getCell(1).value = 'Итого по разделу'
    totalRow.getCell(6).value = round2(sectionTotal)
    rowPtr++

    if (idx < sectionOrder.length - 1) {
      insertStyledRow(ws, rowPtr, blankSnap)
      rowPtr++
    }
  })

  // Заполняем итоговые строки после таблицы (ищем по тексту)
  const setTotal = (searchText, value, col = 6) => {
    const ri = findRowByCellText(ws, 1, searchText)
    if (ri) ws.getCell(`${String.fromCharCode(64 + col)}${ri}`).value = value
  }

  setTotal('Итого по разделам',           totalSmeta)
  setTotal('в т.ч. стоимость работ',      sum_pr)
  setTotal('в т.ч. стоимость материалов', round2(sum_mat + sum_meh))
  if (overhead_percent > 0) setTotal('Накладные', overhead_amount)
  if (profit_percent > 0)   setTotal('Сметная прибыль', profit_amount)
  if (vat_percent > 0) {
    setTotal('НДС', vat_cost)
  } else {
    setTotal('НДС', 'не облагается')
  }
  setTotal('Всего по смете', total_with_vat)

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
  const clientInn = contract.client_inn || contract.inn || ''
  const clientPhone = contract.client_phone || project?.client_phone || ''
  const clientEmail = contract.client_email || project?.client_email || ''

  // Данные подрядчика из настроек компании
  const contractorName = toRtfUnicode(company?.name || contract.contractor || 'Подрядчик')
  const contractorAddress = toRtfUnicode(company?.address || '')
  const contractorINN = company?.inn || ''
  const contractorPhone = company?.phone || ''
  const contractorKPP = company?.kpp || ''
  const contractorOGRN = company?.ogrn || ''
  const contractorEmail = company?.email || ''
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
  const rtfGeneratedAt = toRtfUnicode(new Date().toLocaleString('ru-RU'))
  const startDateStr = toRtfUnicode(formatDate(contract.start_date || project?.start_date || contract.date))
  const endDateStr = toRtfUnicode(formatDate(contract.end_date || project?.end_date))
  const contractHeaderDetails = [
    projectName ? (toRtfUnicode('Предмет:') + ' ' + projectName + '\\par') : '',
    projectAddress ? (toRtfUnicode('Объект:') + ' ' + projectAddress + '\\par') : '',
    contractNum ? (toRtfUnicode('Документ:') + ' ' + toRtfUnicode('№') + ' ' + contractNum + '\\par') : '',
    (startDateStr || endDateStr) ? (toRtfUnicode('Период:') + ' ' + startDateStr + toRtfUnicode(' - ') + endDateStr + '\\par') : ''
  ].filter(Boolean).join('\n')

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
${contractHeaderDetails ? `\\pard\\qj ${contractHeaderDetails}\\par` : ''}
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
\\b ${toRtfUnicode('ПАСПОРТ ДОКУМЕНТА:')}\\b0\\par
\\b ${toRtfUnicode('Заказчик:')}\\b0\\par
${clientName}\\par
${clientAddress ? `${toRtfUnicode('Адрес:')} ${clientAddress}\\par` : ''}
${clientInn ? `${toRtfUnicode('ИНН:')} ${clientInn}\\par` : ''}
${clientPhone ? `${toRtfUnicode('Тел:')} ${clientPhone}\\par` : ''}
${clientEmail ? `${toRtfUnicode('Email:')} ${toRtfUnicode(clientEmail)}\\par` : ''}
${contractNum ? `${toRtfUnicode('Документ:')} ${toRtfUnicode('№')} ${contractNum}\\par` : ''}
${dateStr ? `${toRtfUnicode('Дата документа:')} ${dateStr}\\par` : ''}
${startDateStr || endDateStr ? `${toRtfUnicode('Период:')} ${startDateStr}${toRtfUnicode(' - ')}${endDateStr}\\par` : ''}
${toRtfUnicode('Сформировано:')} ${rtfGeneratedAt}\\par
\\par
___________________ / ${clientName}\\par
\\par
\\b ${toRtfUnicode('Подрядчик:')}\\b0\\par
  ${contractorName}\\par
  ${contractorAddress ? `${toRtfUnicode('Адрес:')} ${contractorAddress}\\par` : ''}
  ${contractorINN ? `${toRtfUnicode('ИНН:')} ${contractorINN}\\par` : ''}
  ${contractorKPP ? `${toRtfUnicode('КПП:')} ${contractorKPP}\\par` : ''}
  ${contractorOGRN ? `${toRtfUnicode('ОГРН:')} ${contractorOGRN}\\par` : ''}
  ${contractorPhone ? `${toRtfUnicode('Тел:')} ${contractorPhone}\\par` : ''}
  ${contractorEmail ? `${toRtfUnicode('Email:')} ${toRtfUnicode(contractorEmail)}\\par` : ''}
  ${bankName ? `${toRtfUnicode('Банк:')} ${bankName}\\par` : ''}
  ${bik ? `${toRtfUnicode('БИК:')} ${bik}\\par` : ''}
  ${checkingAccount ? `${toRtfUnicode('Р/с:')} ${checkingAccount}\\par` : ''}
  ${correspondentAccount ? `${toRtfUnicode('К/с:')} ${correspondentAccount}\\par` : ''}
  \\par
  ___________________ / ${directorPosition} ${directorName || contractorName}\\par
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

const generateEstimateHTML = (estimate, items, project, companyInfo, sections) => {
  const material_coef = estimate?.material_coef || 1.04
  const work_coef     = estimate?.work_coef     || 1.8

  // Пересчитываем итоги из позиций (как в generateEstimateExcel)
  let sum_pr = 0, sum_mat = 0, sum_meh = 0
  const normalizedItems = estimateMapper.normalizeEstimateItems(items || [])
  const calcItems = normalizedItems.map(item => {
    const rtype = item.row_type || 'rascenka'
    const qty   = parseFloat(item.quantity) || 0
    const mat   = parseFloat(item.material_price) || 0
    const lab   = parseFloat(item.labor_price) || 0
    let sum_smeta = item.sum_smeta
    // Формулы точно как в ZaruAI: J = ROUND(I * ROUND(D,2), 2)
    const qty_r = round2(qty)
    if (!sum_smeta && sum_smeta !== 0) {
      if (isMatRow(rtype))      sum_smeta = round2(round2(mat * material_coef) * qty_r)
      else if (isMehRow(rtype)) sum_smeta = round2(round2(mat * material_coef) * qty_r)
      else                       sum_smeta = round2(round2(lab * work_coef) * qty_r) + round2(round2(mat * material_coef) * qty_r)
    }
    if (isMatRow(rtype))       sum_mat += sum_smeta
    else if (isMehRow(rtype))  sum_meh += sum_smeta
    else                        sum_pr  += sum_smeta
    return { ...item, sum_smeta }
  })
  sum_pr  = round2(sum_pr)
  sum_mat = round2(sum_mat)
  sum_meh = round2(sum_meh)
  const itogo_po_razdelam = round2(sum_pr + sum_mat + sum_meh)

  const overhead_percent = parseFloat(estimate?.overhead_percent) || 0
  const profit_percent   = parseFloat(estimate?.profit_percent)   || 0
  const vat_percent      = parseFloat(estimate?.vat_percent)      || 0
  const overhead_amount  = round2(itogo_po_razdelam * overhead_percent / 100)
  const profit_amount    = round2((itogo_po_razdelam + overhead_amount) * profit_percent / 100)
  const total_cost       = round2(itogo_po_razdelam + overhead_amount + profit_amount)
  const vat_cost         = round2(total_cost * vat_percent / 100)
  const total_with_vat   = round2(total_cost + vat_cost)

  const dateStr     = formatDate(estimate?.date || new Date().toISOString())
  const clientName  = project?.client_name  || estimate?.client_name  || ''
  const address     = project?.address      || estimate?.address      || ''
  const companyName = companyInfo?.name     || ''
  const director    = companyInfo?.director || ''
  const companyInn  = companyInfo?.inn || ''
  const companyKpp  = companyInfo?.kpp || ''
  const companyOgrn = companyInfo?.ogrn || ''
  const companyDirectorPosition = companyInfo?.directorPosition || ''
  const companyPhone = companyInfo?.phone || ''
  const companyEmail = companyInfo?.email || ''
  const companyBank = companyInfo?.bankName || ''
  const companyBik = companyInfo?.bik || ''
  const customerAddress = project?.address || estimate?.address || ''
  const htmlBasisText  = estimate?.contract_number ? ('Договор № ' + estimate.contract_number) : ''
  const htmlPeriodText = estimate?.start_date || estimate?.end_date
    ? ('с ' + formatDate(estimate?.start_date || estimate?.date) + ' по ' + formatDate(estimate?.end_date || estimate?.date))
    : ''
  const generatedAtText = new Date().toLocaleString('ru-RU')

  // HTML цвета для типов строк (работы=чёрный, материалы=RoyalBlue, механизмы=зелёный)
  const HTML_ROW_COLORS = {
    rascenka: '#FFFFFF', pr: '#FFFFFF', work: '#FFFFFF',
    material: '#E8F0FF', mat: '#E8F0FF',
    mechanism: '#E8FFE8', meh: '#E8FFE8',
    comment: '#FFF2CC', spr: '#F5F5F5',
    section: '#D9E1F2', irazd: '#DDE8D5', itog: '#DDE8D5'
  }
  const getHtmlRowColor = (rt) => HTML_ROW_COLORS[rt] || '#FFFFFF'

  // Группируем по разделам
  const sectionMap = new Map()
  const sectionOrder = []
  const noSectionItems = []
  calcItems.forEach(item => {
    const sid = item.section_id || 0
    if (sid === 0) { noSectionItems.push(item) }
    else {
      if (!sectionMap.has(sid)) { sectionMap.set(sid, []); sectionOrder.push(sid) }
      sectionMap.get(sid).push(item)
    }
  })
  if (noSectionItems.length > 0) {
    sectionOrder.unshift(0)
    sectionMap.set(0, noSectionItems)
  }

  const fmtNum = (v) => {
    if (v === null || v === undefined || v === 0) return ''
    return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
  }
  const fmtQty = (v) => {
    if (!v) return ''
    return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 4 }).format(v)
  }
  const esc = (v) => String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

  // Генерируем строки таблицы
  let tableRows = ''
  let sectionIndex = 0
  let itemOverallNum = 0

  for (const sid of sectionOrder) {
    const secItems = sectionMap.get(sid) || []
    if (!secItems.length) continue
    sectionIndex++
    const sectionName = resolveEstimateSectionName({
      estimate,
      sections,
      secItems,
      sid,
      sectionIndex
    })

    // Заголовок раздела
    tableRows += `<tr style="background:${HTML_ROW_COLORS.section}"><td colspan="6" style="font-weight:bold;text-align:left;padding:6px 8px;">Раздел ${sectionIndex}. ${esc(sectionName)}</td></tr>\n`

    let sectionTotal = 0
    secItems.forEach(item => {
      const rtype = item.row_type || 'rascenka'
      const qty = parseFloat(item.quantity) || 0
      const sumSmeta = item.sum_smeta || 0
      const price = qty > 0 ? round2(sumSmeta / qty) : 0
      const bgColor = getHtmlRowColor(rtype)
      const isService = rtype === 'section' || rtype === 'irazd' || rtype === 'itog' || rtype === 'lz'
      const isComment = rtype === 'comment' || rtype === 'spr' || rtype === 'empt'
      if (isService) {
        return
      }
      if (!isComment) {
        itemOverallNum++
        sectionTotal += sumSmeta
      }
      tableRows += `<tr style="background:${bgColor}">
        <td style="text-align:center">${isComment ? '' : itemOverallNum}</td>
        <td>${item.name || ''}</td>
        <td style="text-align:center">${esc(item.unit || 'шт.')}</td>
        <td style="text-align:right">${isComment ? '' : fmtQty(qty)}</td>
        <td style="text-align:right">${isComment ? '' : fmtNum(price)}</td>
        <td style="text-align:right">${isComment ? '' : fmtNum(sumSmeta)}</td>
      </tr>\n`
    })

    // Итого по разделу
    if (sectionOrder.length > 1) {
      tableRows += `<tr style="background:${HTML_ROW_COLORS.irazd}">
        <td colspan="5" style="text-align:right;font-weight:bold;padding:4px 8px;">Итого по разделу &laquo;${esc(sectionName)}&raquo;:</td>
        <td style="text-align:right;font-weight:bold">${fmtNum(round2(sectionTotal))}</td>
      </tr>\n`
    }
  }

  // Итоговые строки
  const totalRow = (label, value, bold, bg) => {
    const b = bold ? 'font-weight:bold;' : ''
    const bgc = bg ? `background:${bg};` : 'background:#EFEFEF;'
    return `<tr style="${bgc}"><td colspan="5" style="text-align:right;${b}padding:4px 8px;border:1px solid #999;">${label}</td><td style="text-align:right;${b}border:1px solid #999;">${fmtNum(value)}</td></tr>\n`
  }

  let totalsHTML = totalRow('Итого по разделам:', itogo_po_razdelam)
  totalsHTML += totalRow('в т.ч. стоимость работ:', sum_pr)
  totalsHTML += totalRow('в т.ч. стоимость материалов:', sum_mat)
  if (sum_meh > 0) totalsHTML += totalRow('в т.ч. механизмы:', sum_meh)
  if (overhead_percent > 0) totalsHTML += totalRow(`Накладные расходы (${overhead_percent}%):`, overhead_amount)
  if (profit_percent > 0) totalsHTML += totalRow(`Сметная прибыль (${profit_percent}%):`, profit_amount)
  if (vat_percent > 0) {
    totalsHTML += totalRow('Итого без НДС:', total_cost)
    totalsHTML += totalRow(`НДС (${vat_percent}%):`, vat_cost)
  }

  const vatNote = vat_percent > 0 ? `НДС ${vat_percent}%` : 'НДС не предусмотрен'

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <title>Смета ${estimate.number || ''}</title>
  <style>
    * { font-family: 'Arial', 'Segoe UI', 'Tahoma', sans-serif !important; margin: 0; padding: 0; box-sizing: border-box; }
    body { font-size: 10pt; margin: 12mm 10mm; line-height: 1.3; color: #000; }
    .header-row { display: flex; justify-content: space-between; margin-bottom: 2mm; font-size: 9pt; }
    .header-col { width: 48%; }
    .sign-line { border-bottom: 1px solid #000; min-width: 120px; display: inline-block; margin: 0 4px; }
    .title { text-align: center; font-size: 14pt; font-weight: bold; margin: 8mm 0 2mm; }
    .subtitle { text-align: center; font-size: 10pt; font-style: italic; margin-bottom: 2mm; }
    .meta-line { text-align: center; font-size: 10pt; margin-bottom: 1mm; }
    .meta-wide { display: flex; justify-content: space-between; gap: 4mm; margin-bottom: 4mm; font-size: 8.5pt; border: 1px solid #AAA; padding: 2mm 3mm; background: #F7F7F7; }
    .meta-wide > div { width: 49%; }
    table.smeta { width: 100%; border-collapse: collapse; margin-top: 4mm; table-layout: fixed; }
    table.smeta col.c1 { width: 5%; }
    table.smeta col.c2 { width: 50%; }
    table.smeta col.c3 { width: 7%; }
    table.smeta col.c4 { width: 10%; }
    table.smeta col.c5 { width: 13%; }
    table.smeta col.c6 { width: 15%; }
    table.smeta th, table.smeta td { border: 1px solid #222; padding: 4px 6px; font-size: 9pt; word-break: break-word; vertical-align: middle; }
    table.smeta thead th { background: #E0E0E0; font-weight: bold; text-align: center; font-size: 9pt; }
    table.smeta thead .graf-row th { font-size: 8pt; font-style: italic; color: #666; background: #E0E0E0; }
    table.totals { width: 100%; border-collapse: collapse; margin-top: 3mm; }
    table.totals td { padding: 3px 5px; font-size: 9pt; }
    .grand-total-row td { font-size: 11pt !important; font-weight: bold; background: #DDE8D5; border: 2px solid #333 !important; }
    .signatures { margin-top: 12mm; font-size: 9pt; }
    .sig-block { display: flex; align-items: baseline; gap: 4px; margin-bottom: 8mm; }
    .sig-label { font-weight: bold; min-width: 80px; }
    .sig-underline { flex: 1; border-bottom: 1px solid #000; text-align: center; min-height: 16px; }
    .sig-hint { font-size: 7pt; font-style: italic; text-align: center; color: #666; margin-top: 1px; }
    .req-block { margin-top: 6mm; border: 1px solid #9A9A9A; padding: 3mm; background: #FCFCFC; font-size: 8.5pt; }
    .req-title { font-weight: bold; margin-bottom: 2mm; }
    .req-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; }
    .req-line { margin-bottom: 1mm; }
    @media print {
      body { margin: 8mm; }
      @page { size: A4 portrait; margin: 10mm; }
    }
  </style>
</head>
<body>
  <!-- Шапка: Заказчик / Подрядчик -->
  ${(clientName || companyName) ? `
  <div class="header-row">
    <div class="header-col">${clientName ? `Заказчик: ${clientName}` : ''}</div>
    <div class="header-col" style="text-align:right">${companyName ? `Подрядчик: ${companyName}` : ''}</div>
  </div>
  <div class="header-row">
    <div class="header-col"><span class="sign-line">&nbsp;</span></div>
    <div class="header-col" style="text-align:right"><span class="sign-line">&nbsp;</span> / ${director} /</div>
  </div>
  <div class="header-row" style="margin-bottom:2mm">
    <div class="header-col">${dateStr} &nbsp;&nbsp;&nbsp;&nbsp; м.п.</div>
    <div class="header-col" style="text-align:right">${dateStr} &nbsp;&nbsp;&nbsp;&nbsp; м.п.</div>
  </div>

  ` : ''}

  <!-- Заголовок -->
  <div class="title">ЛОКАЛЬНАЯ СМЕТА № ${estimate.number || 'Б/Н'}</div>
  <div class="subtitle">${estimate.name || 'Ремонтно-отделочные работы'}</div>
  ${(htmlBasisText || htmlPeriodText || address || estimate?.number || dateStr) ? `
  <div class="meta-wide">
    <div>${htmlBasisText ? `Основание: ${htmlBasisText}` : (address ? `Объект: ${address}` : '')}</div>
    <div style="text-align:right">${estimate?.number ? `№ ${estimate.number}` : ''}${dateStr ? `${estimate?.number ? ' · ' : ''}дата ${dateStr}` : ''}${htmlPeriodText ? `${(estimate?.number || dateStr) ? ' · ' : ''}Период: ${htmlPeriodText}` : ''}</div>
  </div>
  ` : ''}
  <div class="meta-line"><b>Смета к договору № ${esc(estimate?.contract_number || '___')} от ${esc(formatDate(estimate?.contract_date || estimate?.date || new Date().toISOString()))}</b></div>
  ${address ? `<div class="meta-line">Объект: ${esc(address)}</div>` : ''}
  <div class="meta-line">Сметная стоимость ${fmtNum(total_with_vat)} руб. (${vatNote})</div>

  <!-- Таблица сметы -->
  <table class="smeta">
    <colgroup>
      <col class="c1"><col class="c2"><col class="c3"><col class="c4"><col class="c5"><col class="c6">
    </colgroup>
    <thead>
      <tr>
        <th>№<br>п/п</th>
        <th>Наименование работ и затрат</th>
        <th>Ед.<br>изм.</th>
        <th>Кол-во</th>
        <th>Цена за<br>единицу, руб.</th>
        <th>Стоимость,<br>руб.</th>
      </tr>
      <tr class="graf-row"><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th></tr>
    </thead>
    <tbody>
      ${tableRows}
    </tbody>
  </table>

  <!-- Итоги -->
  <table class="totals">
    ${totalsHTML}
    <tr class="grand-total-row">
      <td colspan="5" style="text-align:right;padding:6px 8px;border:2px solid #333;">Всего по смете:</td>
      <td style="text-align:right;padding:6px 8px;border:2px solid #333;">${fmtNum(total_with_vat)}</td>
    </tr>
  </table>

  <div class="req-block">
    <div class="req-title">Паспорт документа и реквизиты сторон</div>
    <div class="req-grid">
      <div>
        <div class="req-line"><b>Заказчик:</b> ${clientName || '-'}</div>
        <div class="req-line"><b>Адрес:</b> ${customerAddress || '-'}</div>
        <div class="req-line"><b>Договор:</b> ${htmlBasisText || '-'}</div>
        <div class="req-line"><b>Дата документа:</b> ${dateStr || '-'}</div>
        <div class="req-line"><b>Период:</b> ${htmlPeriodText || '-'}</div>
        <div class="req-line"><b>НДС:</b> ${vat_percent > 0 ? (vat_percent + '% (' + fmtNum(vat_cost) + ' руб.)') : 'без НДС'}</div>
        <div class="req-line"><b>Итог по смете:</b> ${fmtNum(total_with_vat)} руб.</div>
        <div class="req-line"><b>Сформировано:</b> ${generatedAtText}</div>
      </div>
      <div>
        <div class="req-line"><b>Подрядчик:</b> ${companyName || '-'}</div>
        <div class="req-line"><b>ИНН/КПП:</b> ${(companyInn || '-') + (companyKpp ? (' / ' + companyKpp) : '')}</div>
        <div class="req-line"><b>ОГРН:</b> ${companyOgrn || '-'}</div>
        <div class="req-line"><b>Руководитель:</b> ${(companyDirectorPosition || '-') + (director ? (' ' + director) : '')}</div>
        <div class="req-line"><b>Тел./Email:</b> ${(companyPhone || '-') + (companyEmail ? (' / ' + companyEmail) : '')}</div>
        <div class="req-line"><b>Банк/БИК:</b> ${(companyBank || '-') + (companyBik ? (' / ' + companyBik) : '')}</div>
      </div>
    </div>
  </div>

  <!-- Подписи -->
  <div class="signatures">
    <div class="sig-block">
      <span class="sig-label">Составил:</span>
      <div style="flex:1;text-align:center">
        <div class="sig-underline">&nbsp;</div>
        <div class="sig-hint">(подпись)</div>
      </div>
      <span>/</span>
      <div style="flex:1;text-align:center">
        <div class="sig-underline">${director || '&nbsp;'}</div>
        <div class="sig-hint">(расшифровка подписи)</div>
      </div>
    </div>
    <div class="sig-block">
      <span class="sig-label">Проверил:</span>
      <div style="flex:1;text-align:center">
        <div class="sig-underline">&nbsp;</div>
        <div class="sig-hint">(подпись)</div>
      </div>
      <span>/</span>
      <div style="flex:1;text-align:center">
        <div class="sig-underline">&nbsp;</div>
        <div class="sig-hint">(расшифровка подписи)</div>
      </div>
    </div>
  </div>
</body>
</html>`
}

// Сохранить HTML для последующей печати в PDF через Electron
const generateEstimateHTMLFile = (estimate, items, project, companyInfo, outputPath, sections) => {
  const html = generateEstimateHTML(estimate, items, project, companyInfo, sections)
  fs.writeFileSync(outputPath, html, 'utf-8')
  return outputPath
}

// === ОБЩИЕ CSS-СТИЛИ ДЛЯ ВСЕХ HTML-ДОКУМЕНТОВ ===
const HTML_DOC_STYLES = `
  * { font-family: 'Arial', 'Segoe UI', 'Tahoma', sans-serif !important; margin: 0; padding: 0; box-sizing: border-box; }
  body { font-size: 10pt; margin: 12mm 10mm; line-height: 1.3; color: #000; }
  .doc-title { text-align: center; font-size: 14pt; font-weight: bold; margin: 6mm 0 3mm; }
  .doc-subtitle { text-align: center; font-size: 10pt; font-style: italic; margin-bottom: 2mm; }
  .doc-meta { text-align: center; font-size: 10pt; margin-bottom: 1mm; }
  .doc-header { display: flex; justify-content: space-between; margin-bottom: 2mm; font-size: 9pt; }
  .doc-header-col { width: 48%; }
  table.doc-table { width: 100%; border-collapse: collapse; margin-top: 3mm; }
  table.doc-table th, table.doc-table td { border: 1px solid #222; padding: 4px 6px; font-size: 9pt; word-break: break-word; vertical-align: middle; }
  table.doc-table thead th { background: #E0E0E0; font-weight: bold; text-align: center; font-size: 9pt; }
  .section-row td { background: #D9E1F2; font-weight: bold; }
  .total-row td { background: #EFEFEF; font-weight: bold; }
  .grand-total td { background: #DDE8D5; font-size: 11pt !important; font-weight: bold; border: 2px solid #333 !important; }
  .signatures { margin-top: 12mm; font-size: 9pt; }
  .sig-block { display: flex; align-items: baseline; gap: 4px; margin-bottom: 8mm; }
  .sig-label { font-weight: bold; min-width: 140px; }
  .sig-line { flex: 1; border-bottom: 1px solid #000; text-align: center; min-height: 16px; }
  .sig-hint { font-size: 7pt; font-style: italic; text-align: center; color: #666; margin-top: 1px; }
  .right { text-align: right; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  @media print { body { margin: 8mm; } @page { size: A4 portrait; margin: 10mm; } }
`

const htmlDocWrap = (title, bodyContent, landscape = false) => `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    ${HTML_DOC_STYLES}
    ${landscape ? '@page { size: A4 landscape; }' : ''}
  </style>
</head>
<body>
${bodyContent}
</body>
</html>`

const htmlEsc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const htmlFmtNum = (v) => {
  if (v === null || v === undefined || v === 0) return ''
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
}
const htmlFmtQty = (v) => {
  if (!v) return ''
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 4 }).format(v)
}

// === ГЕНЕРАЦИЯ КС-2 В HTML ===
const generateKS2HTML = (act, items, sections, project, estimate, coefficients) => {
  const workCoef     = coefficients?.work_coef     || estimate?.work_coef     || 1.8
  const materialCoef = coefficients?.material_coef || estimate?.material_coef || 1.04
  const vat_percent  = parseFloat(estimate?.vat_percent) || 0

  const getSmetaPrice = (item) => {
    if (item?.price_smeta != null) return Number(item.price_smeta) || 0
    const lab = Number(item?.labor_price ?? item?.price ?? 0)
    const mat = Number(item?.material_price ?? 0)
    const rtype = item?.row_type || 'rascenka'
    if (isMatRow(rtype) || isMehRow(rtype)) return round2(mat * materialCoef)
    return round2(round2(lab * workCoef) + round2(mat * materialCoef))
  }

  const dateStr        = formatDate(act?.date || estimate?.date || new Date().toISOString())
  const periodFrom     = formatDate(act?.period_from || act?.period_start || act?.date || '')
  const periodTo       = formatDate(act?.period_to   || act?.period_end   || act?.date || '')
  const clientName     = project?.client_name  || act?.client_name     || ''
  const investorName   = project?.investor_name || clientName
  const contractorName = act?.contractor_name  || project?.contractor_name || ''
  const address        = project?.address      || estimate?.address    || ''
  const estimateName   = estimate?.name        || project?.name        || 'Ремонтно-отделочные работы'
  const contractNum    = act?.contract_number  || estimate?.contract_number || ''

  // Расчёт итогов
  let sum_pr = 0, sum_mat = 0, sum_meh = 0
  ;(items || []).forEach(item => {
    const rtype = item?.row_type || 'rascenka'
    if (rtype === 'comment' || rtype === 'spr' || rtype === 'empt') return
    const qty_r = round2(Number(item?.quantity) || 0)
    const lab = Number(item?.labor_price ?? item?.price ?? 0)
    const mat = Number(item?.material_price ?? 0)
    if (isMatRow(rtype))      sum_mat += round2(round2(mat * materialCoef) * qty_r)
    else if (isMehRow(rtype)) sum_meh += round2(round2(mat * materialCoef) * qty_r)
    else                       sum_pr += round2(round2(lab * workCoef) * qty_r) + round2(round2(mat * materialCoef) * qty_r)
  })
  sum_pr = round2(sum_pr); sum_mat = round2(sum_mat); sum_meh = round2(sum_meh)
  const totalSmeta = round2(sum_pr + sum_mat + sum_meh)
  const vat_cost = round2(totalSmeta * vat_percent / 100)
  const totalWithVat = round2(totalSmeta + vat_cost)

  // Группировка по разделам
  const sectionMap = new Map()
  const sectionItems = new Map()
  ;(sections || []).forEach(s => sectionMap.set(s.id, s))
  ;(items || []).forEach(item => {
    const sid = item?.section_id || 0
    if (!sectionItems.has(sid)) sectionItems.set(sid, [])
    sectionItems.get(sid).push(item)
  })
  const sectionOrder = []
  ;(sections || []).forEach(s => { if (sectionItems.has(s.id)) sectionOrder.push(s.id) })
  sectionItems.forEach((_, sid) => { if (!sectionOrder.includes(sid)) sectionOrder.push(sid) })

  let tableRows = ''
  let sectionIdx = 0, itemNum = 0
  for (const sid of sectionOrder) {
    const secItems = sectionItems.get(sid) || []
    if (!secItems.length) continue
    sectionIdx++
    const sectionName = sectionMap.get(sid)?.name || (sid === 0 ? 'Без раздела' : `Раздел ${sectionIdx}`)
    tableRows += `<tr class="section-row"><td colspan="8">${sectionIdx}. Раздел: ${htmlEsc(sectionName)}</td></tr>\n`
    let sectionTotal = 0, secItemIdx = 0
    for (const item of secItems) {
      const rtype = item?.row_type || 'rascenka'
      if (rtype === 'comment' || rtype === 'spr' || rtype === 'empt') {
        tableRows += `<tr><td></td><td></td><td colspan="6">${htmlEsc(item?.name || '')}</td></tr>\n`
        continue
      }
      secItemIdx++; itemNum++
      const qty = Number(item?.quantity) || 0
      const price = getSmetaPrice(item)
      const total = round2(price * round2(qty))
      sectionTotal += total
      tableRows += `<tr>
        <td class="center">${secItemIdx}</td><td class="center">${itemNum}</td>
        <td>${htmlEsc(item?.name || '')}</td><td class="center">${htmlEsc(item?.justification || '')}</td>
        <td class="center">${htmlEsc(item?.unit || 'шт.')}</td><td class="right">${htmlFmtQty(qty)}</td>
        <td class="right">${htmlFmtNum(price)}</td><td class="right">${htmlFmtNum(total)}</td>
      </tr>\n`
    }
    tableRows += `<tr class="total-row"><td colspan="7" class="right">Итого по разделу:</td><td class="right">${htmlFmtNum(round2(sectionTotal))}</td></tr>\n`
  }

  const body = `
  <div class="doc-header">
    <div class="doc-header-col">Инвестор: ${htmlEsc(investorName)}<br>Заказчик: ${htmlEsc(clientName)}</div>
    <div class="doc-header-col" style="text-align:right">Подрядчик: ${htmlEsc(contractorName)}</div>
  </div>
  <div class="doc-title">АКТ О ПРИЁМКЕ ВЫПОЛНЕННЫХ РАБОТ (КС-2)</div>
  <div class="doc-subtitle">Номер: ${htmlEsc(act?.number || '')} от ${dateStr}</div>
  <div class="doc-meta">Объект: ${htmlEsc(address ? `${estimateName}, ${address}` : estimateName)}</div>
  ${contractNum ? `<div class="doc-meta">Договор № ${htmlEsc(contractNum)}</div>` : ''}
  <div class="doc-meta">Отчётный период: с ${periodFrom} по ${periodTo}</div>
  <div class="doc-meta" style="margin-bottom:4mm">Сметная стоимость: ${htmlFmtNum(totalSmeta)} руб.</div>

  <table class="doc-table">
    <thead>
      <tr><th>№ по разделу</th><th>№ по акту</th><th>Наименование работ</th><th>Шифр</th><th>Ед. изм.</th><th>Кол-во</th><th>Цена, руб.</th><th>Стоимость, руб.</th></tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>

  <table class="doc-table" style="margin-top:3mm">
    <tr class="total-row"><td colspan="7" class="right">Итого по разделам:</td><td class="right">${htmlFmtNum(totalSmeta)}</td></tr>
    <tr><td colspan="7" class="right">в т.ч. стоимость работ:</td><td class="right">${htmlFmtNum(sum_pr)}</td></tr>
    <tr><td colspan="7" class="right">в т.ч. стоимость материалов:</td><td class="right">${htmlFmtNum(round2(sum_mat + sum_meh))}</td></tr>
    ${vat_percent > 0 ? `<tr><td colspan="7" class="right">НДС (${vat_percent}%):</td><td class="right">${htmlFmtNum(vat_cost)}</td></tr>` : ''}
    <tr class="grand-total"><td colspan="7" class="right">Всего по акту:</td><td class="right">${htmlFmtNum(totalWithVat)}</td></tr>
  </table>

  <div class="signatures">
    <div class="sig-block"><span class="sig-label">Сдал (подрядчик):</span><div style="flex:1;text-align:center"><div class="sig-line">&nbsp;</div><div class="sig-hint">(подпись)</div></div><span>/</span><div style="flex:1;text-align:center"><div class="sig-line">${htmlEsc(contractorName) || '&nbsp;'}</div><div class="sig-hint">(ФИО)</div></div></div>
    <div class="sig-block"><span class="sig-label">Принял (заказчик):</span><div style="flex:1;text-align:center"><div class="sig-line">&nbsp;</div><div class="sig-hint">(подпись)</div></div><span>/</span><div style="flex:1;text-align:center"><div class="sig-line">${htmlEsc(clientName) || '&nbsp;'}</div><div class="sig-hint">(ФИО)</div></div></div>
  </div>`

  return htmlDocWrap(`КС-2 ${act?.number || ''}`, body)
}

// === ГЕНЕРАЦИЯ КС-3 В HTML ===
const generateKS3HTML = (cert, project) => {
  const clientName     = cert?.client_name     || project?.client_name     || ''
  const investorName   = project?.investor_name || clientName
  const contractorName = cert?.contractor_name || project?.contractor_name || ''
  const objectName     = cert?.object_name     || project?.name            || ''
  const address        = project?.address      || ''
  const objectText     = objectName && address ? `${objectName}, ${address}` : (objectName || address)
  const contractNumber = cert?.contract_number || ''
  const dateStr        = formatDate(cert?.date || '')
  const periodFrom     = formatDate(cert?.period_from  || cert?.period_start || cert?.date || '')
  const periodTo       = formatDate(cert?.period_to    || cert?.period_end   || cert?.date || '')
  const vat_percent    = parseFloat(cert?.vat_percent) || 0
  const totalWithoutVat = round2(cert?.total_without_vat ?? cert?.amount_without_vat ?? cert?.amount ?? 0)
  const computedVat    = round2(totalWithoutVat * vat_percent / 100)
  const vatAmount      = round2(cert?.vat_amount ?? cert?.total_vat ?? computedVat)
  const totalWithVat   = round2(cert?.total_with_vat ?? cert?.amount ?? (totalWithoutVat + vatAmount))

  const body = `
  <div class="doc-header">
    <div class="doc-header-col">Инвестор: ${htmlEsc(investorName)}<br>Заказчик: ${htmlEsc(clientName)}</div>
    <div class="doc-header-col" style="text-align:right">Подрядчик: ${htmlEsc(contractorName)}</div>
  </div>
  <div class="doc-title">СПРАВКА О СТОИМОСТИ ВЫПОЛНЕННЫХ РАБОТ (КС-3)</div>
  <div class="doc-subtitle">Номер: ${htmlEsc(cert?.number || '')} от ${dateStr}</div>
  ${contractNumber ? `<div class="doc-meta">Договор подряда: № ${htmlEsc(contractNumber)}</div>` : ''}
  <div class="doc-meta">Объект: ${htmlEsc(objectText)}</div>
  <div class="doc-meta" style="margin-bottom:4mm">Отчётный период: с ${periodFrom} по ${periodTo}</div>

  <table class="doc-table">
    <thead><tr><th>№ п/п</th><th>Наименование пусковых комплексов, этапов, объектов</th><th>Код</th><th>Стоимость выполненных работ, руб.</th><th>Стоимость с начала проведения работ, руб.</th><th>Всего с учётом НДС, руб.</th></tr></thead>
    <tbody>
      <tr><td class="center">1</td><td>${htmlEsc(objectName || project?.name || '')}</td><td class="center">${htmlEsc(cert?.estimate_number || '')}</td><td class="right">${htmlFmtNum(totalWithoutVat)}</td><td class="right">${htmlFmtNum(totalWithoutVat)}</td><td class="right">${htmlFmtNum(totalWithVat)}</td></tr>
      <tr class="total-row"><td colspan="3" class="right">Итого:</td><td class="right">${htmlFmtNum(totalWithoutVat)}</td><td class="right">${htmlFmtNum(totalWithoutVat)}</td><td class="right">${htmlFmtNum(totalWithVat)}</td></tr>
      ${vat_percent > 0 ? `<tr><td colspan="3" class="right">НДС (${vat_percent}%):</td><td class="right">${htmlFmtNum(vatAmount)}</td><td class="right">${htmlFmtNum(vatAmount)}</td><td class="right">${htmlFmtNum(vatAmount)}</td></tr>` : `<tr><td colspan="3" class="right">НДС:</td><td colspan="3" class="center">не облагается</td></tr>`}
      <tr class="grand-total"><td colspan="3" class="right">Всего:</td><td class="right">${htmlFmtNum(totalWithVat)}</td><td class="right">${htmlFmtNum(totalWithVat)}</td><td class="right">${htmlFmtNum(totalWithVat)}</td></tr>
    </tbody>
  </table>

  <div class="signatures">
    <div class="sig-block"><span class="sig-label">Заказчик:</span><div style="flex:1;text-align:center"><div class="sig-line">&nbsp;</div><div class="sig-hint">(подпись)</div></div><span>/</span><div style="flex:1;text-align:center"><div class="sig-line">${htmlEsc(clientName) || '&nbsp;'}</div><div class="sig-hint">(ФИО)</div></div></div>
    <div class="sig-block"><span class="sig-label">Подрядчик:</span><div style="flex:1;text-align:center"><div class="sig-line">&nbsp;</div><div class="sig-hint">(подпись)</div></div><span>/</span><div style="flex:1;text-align:center"><div class="sig-line">${htmlEsc(contractorName) || '&nbsp;'}</div><div class="sig-hint">(ФИО)</div></div></div>
  </div>`

  return htmlDocWrap(`КС-3 ${cert?.number || ''}`, body)
}

// === ГЕНЕРАЦИЯ М-29 В HTML ===
const generateM29HTML = (project, m29Doc, items) => {
  const contractorName = project?.contractor_name || 'ООО РСК ДОММАСТЕР'
  const clientName     = project?.client_name || ''
  const objectName     = m29Doc.object_name || project?.name || ''
  const contractNumber = m29Doc.contract_number || ''
  const contractDate   = m29Doc.contract_date || ''
  const ks2Number      = m29Doc.ks2_number || ''
  const ks2Date        = m29Doc.ks2_date || ''
  const periodFrom     = formatDate(m29Doc.period_from || m29Doc.period_start || m29Doc.date || '')
  const periodTo       = formatDate(m29Doc.period_to   || m29Doc.period_end   || m29Doc.date || '')
  const dateStr        = formatDate(m29Doc.date || new Date().toISOString())

  let totalNormCost = 0, totalActualCost = 0, totalDeviation = 0
  const materialItems = items || []

  let tableRows = ''
  materialItems.forEach((item, idx) => {
    const normQty   = Number(item?.norm_quantity || item?.planned_quantity || item?.quantity || 0)
    const actualQty = Number(item?.actual_quantity || item?.fact_quantity || 0)
    const unitPrice = Number(item?.unit_price || item?.price || item?.material_price || 0)
    const normCost  = round2(normQty * unitPrice)
    const actualCost = round2(actualQty * unitPrice)
    const deviation = round2(actualCost - normCost)
    totalNormCost += normCost; totalActualCost += actualCost; totalDeviation += deviation

    tableRows += `<tr>
      <td class="center">${idx + 1}</td><td class="center">${item?.position_no || idx + 1}</td>
      <td>${htmlEsc(item?.name || '')}</td><td class="center">${htmlEsc(item?.unit || 'шт.')}</td>
      <td class="right">${htmlFmtQty(normQty)}</td><td class="right">${htmlFmtNum(unitPrice)}</td>
      <td class="right">${htmlFmtNum(normCost)}</td><td class="right">${htmlFmtQty(actualQty)}</td>
      <td class="right">${htmlFmtNum(actualCost)}</td>
      <td class="right">${deviation > 0 ? htmlFmtNum(deviation) : ''}</td>
      <td class="right">${deviation < 0 ? htmlFmtNum(Math.abs(deviation)) : ''}</td>
    </tr>\n`
  })

  const body = `
  <div class="doc-meta" style="text-align:left"><b>${htmlEsc(contractorName)}</b></div>
  <div class="doc-title">ОТЧЁТ О РАСХОДЕ МАТЕРИАЛОВ (М-29) № ${htmlEsc(m29Doc.number || '')}</div>
  ${ks2Number ? `<div class="doc-meta">По акту КС-2 № ${htmlEsc(ks2Number)}${ks2Date ? ` от ${formatDate(ks2Date)}` : ''}</div>` : ''}
  <div class="doc-meta">Период: с ${periodFrom} по ${periodTo}</div>
  ${contractNumber ? `<div class="doc-meta">Договор № ${htmlEsc(contractNumber)}${contractDate ? ` от ${formatDate(contractDate)}` : ''}${objectName ? `; объект: ${htmlEsc(objectName)}` : ''}</div>` : ''}
  ${clientName ? `<div class="doc-meta">Заказчик: ${htmlEsc(clientName)}</div>` : ''}
  <div class="doc-meta" style="margin-bottom:4mm">Дата: ${dateStr}</div>

  <table class="doc-table">
    <thead><tr><th>№</th><th>Поз. сметы</th><th>Наименование ресурсов</th><th>Ед. изм.</th><th>Норм. кол-во</th><th>Цена, руб.</th><th>Норм. стоимость</th><th>Факт. кол-во</th><th>Факт. стоимость</th><th>Перерасход</th><th>Экономия</th></tr></thead>
    <tbody>
      ${tableRows}
      <tr class="grand-total"><td colspan="6" class="right">Итого по ведомости:</td><td class="right">${htmlFmtNum(round2(totalNormCost))}</td><td></td><td class="right">${htmlFmtNum(round2(totalActualCost))}</td><td class="right">${totalDeviation > 0 ? htmlFmtNum(round2(totalDeviation)) : ''}</td><td class="right">${totalDeviation < 0 ? htmlFmtNum(round2(Math.abs(totalDeviation))) : ''}</td></tr>
    </tbody>
  </table>

  <div class="signatures">
    <div class="sig-block"><span class="sig-label">Материально-ответств. лицо:</span><div style="flex:1;text-align:center"><div class="sig-line">&nbsp;</div><div class="sig-hint">(подпись, ФИО)</div></div></div>
    <div class="sig-block"><span class="sig-label">Проверил:</span><div style="flex:1;text-align:center"><div class="sig-line">&nbsp;</div><div class="sig-hint">(подпись, ФИО)</div></div></div>
  </div>`

  return htmlDocWrap(`М-29 ${m29Doc.number || ''}`, body, true)
}

// === ГЕНЕРАЦИЯ ДЕФЕКТОВКИ В HTML ===
const generateDefektovkaHTML = (estimate, items, sections, coefficients, project, companyInfo) => {
  const workCoef = coefficients?.work_coef || 2
  const materialCoef = coefficients?.material_coef || 1
  const overheadPercent = coefficients?.overhead_percent || 0.05
  const dateStr = formatDate(new Date().toISOString())
  const clientName = project?.client_name || estimate?.client_name || ''
  const address = project?.address || estimate?.address || ''
  const companyName = companyInfo?.name || 'ООО ПОДРЯДЧИК'

  const { sectionMap, unassignedItems, assignedItems, usedSectionIds } = defektovkaMapper.groupDefektovkaItems(items, sections)

  let totalWorks = 0, totalMaterials = 0, totalSmetaWorks = 0, totalSmetaMaterials = 0
  let sectionNum = 0
  let tableRows = ''

  const processSection = (sectionName, sectionItems) => {
    sectionNum++
    tableRows += `<tr class="section-row"><td colspan="10">${sectionNum}. Раздел: ${htmlEsc(sectionName)}</td></tr>\n`
    let secWorks = 0, secMaterials = 0, secSmetaWorks = 0, secSmetaMaterials = 0
    let itemNum = 0
    for (const item of sectionItems) {
      itemNum++
      const laborPrice = item.labor_price || 0
      const materialPrice = item.material_price || 0
      const qty = item.quantity || 1
      const qty_r = round2(qty)
      const basePrice = laborPrice + materialPrice
      const baseTotal = round2(basePrice * qty_r)
      const kType = laborPrice > 0 ? 'дс' : 'м'
      const smetaPrice = round2(round2(laborPrice * workCoef) + round2(materialPrice * materialCoef))
      const smetaTotal = round2(round2(laborPrice * workCoef) * qty_r) + round2(round2(materialPrice * materialCoef) * qty_r)

      secWorks += round2(laborPrice * qty_r)
      secMaterials += round2(materialPrice * qty_r)
      secSmetaWorks += round2(round2(laborPrice * workCoef) * qty_r)
      secSmetaMaterials += round2(round2(materialPrice * materialCoef) * qty_r)

      tableRows += `<tr>
        <td class="center">${itemNum}</td><td>${htmlEsc(item.name || '')}</td>
        <td class="center">${htmlEsc(item.unit || 'шт.')}</td><td class="right">${htmlFmtQty(qty)}</td>
        <td class="right">${htmlFmtNum(basePrice)}</td><td class="right">${htmlFmtNum(baseTotal)}</td>
        <td></td><td class="center">${kType}</td>
        <td class="right">${htmlFmtNum(smetaPrice)}</td><td class="right">${htmlFmtNum(smetaTotal)}</td>
      </tr>\n`
    }
    tableRows += `<tr class="total-row"><td colspan="5" class="right">Итого по разделу:</td><td class="right">${htmlFmtNum(secWorks + secMaterials)}</td><td colspan="3"></td><td class="right">${htmlFmtNum(secSmetaWorks + secSmetaMaterials)}</td></tr>\n`
    tableRows += `<tr><td colspan="5" class="right">в т.ч. работы:</td><td class="right">${htmlFmtNum(secWorks)}</td><td colspan="3"></td><td class="right">${htmlFmtNum(secSmetaWorks)}</td></tr>\n`
    tableRows += `<tr><td colspan="5" class="right">в т.ч. материалы:</td><td class="right">${htmlFmtNum(secMaterials)}</td><td colspan="3"></td><td class="right">${htmlFmtNum(secSmetaMaterials)}</td></tr>\n`
    totalWorks += secWorks; totalMaterials += secMaterials
    totalSmetaWorks += secSmetaWorks; totalSmetaMaterials += secSmetaMaterials
  }

  for (const sectionId of usedSectionIds) {
    const section = sectionMap.get(sectionId)
    processSection(section?.name || 'Раздел', assignedItems.filter(i => i.section_id === sectionId))
  }
  if (unassignedItems.length > 0) processSection('Прочие работы', unassignedItems)

  const overhead = round2((totalWorks + totalMaterials) * overheadPercent)
  const smetaOverhead = round2((totalSmetaWorks + totalSmetaMaterials) * overheadPercent)

  const body = `
  <div class="doc-title">ДЕФЕКТОВКА № ${htmlEsc(estimate?.number || 'Б/Н')}</div>
  <div class="doc-subtitle">${htmlEsc(estimate?.name || 'Ремонтно-отделочные работы')}</div>
  ${clientName ? `<div class="doc-meta" style="text-align:left"><b>Заказчик:</b> ${htmlEsc(clientName)}</div>` : ''}
  <div class="doc-meta" style="text-align:left"><b>Подрядчик:</b> ${htmlEsc(companyName)}</div>
  ${address ? `<div class="doc-meta" style="text-align:left"><b>Объект:</b> ${htmlEsc(address)}</div>` : ''}
  <div class="doc-meta" style="text-align:left;margin-bottom:3mm"><b>Дата:</b> ${dateStr} &nbsp; <b>Коэфф. работ:</b> ${workCoef} &nbsp; <b>Коэфф. матер.:</b> ${materialCoef}</div>

  <table class="doc-table">
    <thead><tr><th>№</th><th>Наименование</th><th>Ед.</th><th>Кол-во</th><th>Цена</th><th>Стоимость</th><th></th><th>k</th><th>Сметная цена</th><th>Сметная стоимость</th></tr></thead>
    <tbody>${tableRows}</tbody>
  </table>

  <table class="doc-table" style="margin-top:3mm">
    <tr class="total-row"><td colspan="5" class="right bold">Итого по разделам:</td><td class="right bold">${htmlFmtNum(totalWorks + totalMaterials)}</td><td colspan="3"></td><td class="right bold">${htmlFmtNum(totalSmetaWorks + totalSmetaMaterials)}</td></tr>
    <tr><td colspan="5" class="right">в т.ч. работы:</td><td class="right">${htmlFmtNum(totalWorks)}</td><td colspan="3"></td><td class="right">${htmlFmtNum(totalSmetaWorks)}</td></tr>
    <tr><td colspan="5" class="right">в т.ч. материалы:</td><td class="right">${htmlFmtNum(totalMaterials)}</td><td colspan="3"></td><td class="right">${htmlFmtNum(totalSmetaMaterials)}</td></tr>
    <tr><td colspan="5" class="right">Прочие расходы (${round2(overheadPercent * 100)}%):</td><td class="right">${htmlFmtNum(overhead)}</td><td colspan="3"></td><td class="right">${htmlFmtNum(smetaOverhead)}</td></tr>
    <tr class="grand-total"><td colspan="5" class="right">Итого по ведомости:</td><td class="right">${htmlFmtNum(totalWorks + totalMaterials + overhead)}</td><td colspan="3"></td><td class="right">${htmlFmtNum(totalSmetaWorks + totalSmetaMaterials + smetaOverhead)}</td></tr>
  </table>

  <div class="signatures">
    <div class="sig-block"><span class="sig-label">Составил:</span><div style="flex:1;text-align:center"><div class="sig-line">&nbsp;</div><div class="sig-hint">(подпись, ФИО)</div></div></div>
    <div class="sig-block"><span class="sig-label">Проверил:</span><div style="flex:1;text-align:center"><div class="sig-line">&nbsp;</div><div class="sig-hint">(подпись, ФИО)</div></div></div>
  </div>`

  return htmlDocWrap(`Дефектовка ${estimate?.number || ''}`, body, true)
}

// === ГЕНЕРАЦИЯ ФОТ В HTML ===
const generateFOTHTML = (estimate, items, sections, coefficients) => {
  const workCoefFOT = coefficients?.work_coef || estimate?.work_coef || 1.8
  const dateStr = formatDate(new Date().toISOString())
  const sectionMap = new Map()
  sections?.forEach(s => sectionMap.set(s.id, s))

  const allItems = items || []
  const usedSectionIds = [...new Set(allItems.map(i => i.section_id || 0))]
  let grandTotal = 0, sectionNum = 0
  let tableRows = ''

  for (const sectionId of usedSectionIds) {
    const section = sectionMap.get(sectionId)
    const sectionName = section?.name || (sectionId === 0 ? 'Общие работы' : 'Раздел')
    const sectionItems = allItems.filter(i => (i.section_id || 0) === sectionId).filter(i => isWorkRow(i.row_type))
    if (!sectionItems.length) continue
    sectionNum++
    tableRows += `<tr class="section-row"><td colspan="6">${sectionNum}. Раздел: ${htmlEsc(sectionName)}</td></tr>\n`
    let sectionTotal = 0, itemNum = 0
    for (const item of sectionItems) {
      itemNum++
      const qty = Number(item.quantity) || 0
      const qty_r = round2(qty)
      const priceFact = Number(item.labor_price || item.price || 0)
      const priceSmeta = round2(priceFact * workCoefFOT)
      const itemTotal = round2(priceSmeta * qty_r)
      sectionTotal += itemTotal
      tableRows += `<tr><td class="center">${itemNum}</td><td>${htmlEsc(item.name || '')}</td><td class="right">${htmlFmtQty(qty)}</td><td class="center">${htmlEsc(item.unit || 'шт.')}</td><td class="right">${htmlFmtNum(priceSmeta)}</td><td class="right">${htmlFmtNum(itemTotal)}</td></tr>\n`
    }
    tableRows += `<tr class="total-row"><td colspan="5" class="right">Итого по разделу:</td><td class="right">${htmlFmtNum(sectionTotal)}</td></tr>\n`
    grandTotal += sectionTotal
  }

  const body = `
  <div class="doc-header">
    <div class="doc-header-col"><b>Утверждаю:</b><br>________________________<br><span style="font-size:8pt;font-style:italic">(должность, ФИО)</span></div>
    <div class="doc-header-col" style="text-align:right"><b>Согласовано:</b><br>________________________<br><span style="font-size:8pt;font-style:italic">(должность, ФИО)</span></div>
  </div>
  <div class="doc-meta" style="text-align:left;margin-top:3mm">${dateStr}</div>
  <div class="doc-title">Ведомость № ${htmlEsc(estimate?.number || '1')}</div>
  <div style="text-align:center;font-size:14pt;font-weight:bold;margin-bottom:2mm">Фонд оплаты труда по объекту</div>
  <div class="doc-subtitle">${htmlEsc(estimate?.name || 'Ремонтно-отделочные работы')}</div>
  <div class="doc-meta" style="text-align:left;margin-bottom:3mm">Производитель работ: _______________________</div>

  <table class="doc-table">
    <thead><tr><th>№ п/п</th><th>Наименование работ</th><th>Кол-во</th><th>Ед. изм.</th><th>Цена</th><th>Стоимость</th></tr></thead>
    <tbody>
      ${tableRows}
      <tr class="grand-total"><td colspan="5" class="right">Всего по ведомости:</td><td class="right">${htmlFmtNum(grandTotal)}</td></tr>
    </tbody>
  </table>

  <div class="signatures">
    <div class="sig-block"><span class="sig-label">Производитель работ:</span><div style="flex:1;text-align:center"><div class="sig-line">&nbsp;</div><div class="sig-hint">(подпись)</div></div><span>/</span><div style="flex:1;text-align:center"><div class="sig-line">&nbsp;</div><div class="sig-hint">(ФИО)</div></div></div>
    <div class="sig-block"><span class="sig-label">Руководитель:</span><div style="flex:1;text-align:center"><div class="sig-line">&nbsp;</div><div class="sig-hint">(подпись)</div></div><span>/</span><div style="flex:1;text-align:center"><div class="sig-line">&nbsp;</div><div class="sig-hint">(ФИО)</div></div></div>
  </div>`

  return htmlDocWrap(`ФОТ ${estimate?.number || ''}`, body)
}

const generateMaterialRequestHTML = (estimate, project, rows, totals) => {
  const titleNumber = estimate?.number || ''
  const objectName = project?.name || estimate?.name || ''
  const dateLabel = new Date().toLocaleDateString('ru-RU')
  const items = rows || []

  const tableRows = items.map((row, index) => `
    <tr>
      <td class="center">${index + 1}</td>
      <td>${htmlEsc(row.name || '')}</td>
      <td class="center">${htmlEsc(row.unit || '')}</td>
      <td class="right">${htmlFmtNum(row.totalQty || 0)}</td>
      <td class="right">${htmlFmtNum(row.price || 0)}</td>
      <td class="right">${htmlFmtNum(row.total || 0)}</td>
    </tr>
  `).join('\n')

  const body = `
  <div class="doc-title">Заявка на материалы к смете ${htmlEsc(titleNumber)}</div>
  <div class="doc-meta">Объект: ${htmlEsc(objectName)}</div>
  <div class="doc-meta" style="margin-bottom:4mm">Дата: ${dateLabel}</div>
  <table class="doc-table">
    <thead>
      <tr>
        <th>№</th>
        <th>Наименование</th>
        <th>Ед.</th>
        <th>Кол-во</th>
        <th>Цена, руб.</th>
        <th>Сумма, руб.</th>
      </tr>
    </thead>
    <tbody>
      ${tableRows}
      <tr class="grand-total">
        <td colspan="5" class="right">Итого:</td>
        <td class="right">${htmlFmtNum(totals?.totalAmount || 0)}</td>
      </tr>
    </tbody>
  </table>`

  return htmlDocWrap(`Заявка на материалы ${titleNumber}`, body)
}

// === ГЕНЕРАЦИЯ СЧЁТА В HTML ===
const generateInvoiceHTML = (estimate, items, invoiceData, companyInfo, settings) => {
  const amount = estimate?.total_with_vat || estimate?.total_cost || 0
  const vatRate = settings?.estimates?.vatRate || 20
  const vatEnabled = settings?.estimates?.vatEnabled !== false
  const vatAmount = vatEnabled ? round2(amount * vatRate / (100 + vatRate)) : 0
  const amountWithoutVat = round2(amount - vatAmount)
  const invoiceNumber = invoiceData?.number || `СФ-${estimate?.number || Date.now()}`
  const dateStr = formatDate(invoiceData?.date || new Date().toISOString())
  const clientName = invoiceData?.client_name || estimate?.client_name || ''
  const companyName = companyInfo?.name || ''

  let tableRows = ''
  let idx = 0
  for (const item of (items || [])) {
    idx++
    const qty = Number(item.quantity) || 1
    const price = Number(item.sum_smeta || 0) / (qty || 1)
    tableRows += `<tr><td class="center">${idx}</td><td>${htmlEsc(item.name || '')}</td><td class="center">${htmlEsc(item.unit || 'шт.')}</td><td class="right">${htmlFmtQty(qty)}</td><td class="right">${htmlFmtNum(price)}</td><td class="right">${htmlFmtNum(item.sum_smeta || 0)}</td></tr>\n`
  }

  const body = `
  <div class="doc-title">СЧЁТ-ФАКТУРА № ${htmlEsc(invoiceNumber)}</div>
  <div class="doc-meta">от ${dateStr}</div>
  <div class="doc-meta" style="text-align:left;margin-top:3mm"><b>Продавец:</b> ${htmlEsc(companyName)}</div>
  <div class="doc-meta" style="text-align:left"><b>Покупатель:</b> ${htmlEsc(clientName)}</div>
  <div class="doc-meta" style="text-align:left;margin-bottom:3mm"><b>К договору:</b> ${htmlEsc(invoiceData?.contract_number || estimate?.contract_number || '')}</div>

  <table class="doc-table">
    <thead><tr><th>№</th><th>Наименование</th><th>Ед.</th><th>Кол-во</th><th>Цена, руб.</th><th>Сумма, руб.</th></tr></thead>
    <tbody>
      ${tableRows}
      <tr class="total-row"><td colspan="5" class="right">Итого без НДС:</td><td class="right">${htmlFmtNum(amountWithoutVat)}</td></tr>
      ${vatEnabled ? `<tr><td colspan="5" class="right">НДС (${vatRate}%):</td><td class="right">${htmlFmtNum(vatAmount)}</td></tr>` : ''}
      <tr class="grand-total"><td colspan="5" class="right">Всего к оплате:</td><td class="right">${htmlFmtNum(amount)}</td></tr>
    </tbody>
  </table>

  <div class="signatures">
    <div class="sig-block"><span class="sig-label">Руководитель:</span><div style="flex:1;text-align:center"><div class="sig-line">&nbsp;</div><div class="sig-hint">(подпись)</div></div><span>/</span><div style="flex:1;text-align:center"><div class="sig-line">${htmlEsc(companyInfo?.director || '')}</div><div class="sig-hint">(ФИО)</div></div></div>
    <div class="sig-block"><span class="sig-label">Гл. бухгалтер:</span><div style="flex:1;text-align:center"><div class="sig-line">&nbsp;</div><div class="sig-hint">(подпись)</div></div><span>/</span><div style="flex:1;text-align:center"><div class="sig-line">&nbsp;</div><div class="sig-hint">(ФИО)</div></div></div>
  </div>`

  return htmlDocWrap(`Счёт-фактура ${invoiceNumber}`, body)
}

// === Универсальная функция HTML→PDF файл ===
const generateHTMLFile = (html, outputPath) => {
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

// === ИМПОРТ ДЕФЕКТОВКИ (формат ZaruAI Смета) ===
/**
 * Парсинг дефектовки формата ZaruAI с автоматическим извлечением коэффициентов
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
      work_coef: 1.8,      // По умолчанию
      material_coef: 1.04  // По умолчанию
    },
    isSmeta2007Format: false
  }

  // === Определяем формат ZaruAI по характерным признакам ===
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
    // Есть блок сметной стоимости — формат ZaruAI
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

  // Если не нашли - пробуем строку 6 (типичная для ZaruAI)
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
  // Структура ZaruAI:
  // A: № п/п, B: Наименование, C: ед.изм, D: Кол-во, E: Цена, F: Стоимость
  // H: тип (дс = работа, м = материал), I: Сметная цена (с коэфф.)

  let currentSection = null
  const items = []
  const sections = []
  const consumedSectionTitleRows = new Set()

  const normalizeImportedSectionName = (value) => {
    const raw = String(value || '').replace(/\s+/g, ' ').trim()
    if (!raw) return ''
    if (/^\d+$/.test(raw)) return ''

    const directSectionMatch = raw.match(/^(?:\d+\s*[\.\)]\s*)?раздел(?:\s|:)+(.+)$/i)
    if (directSectionMatch?.[1]) {
      return directSectionMatch[1].trim()
    }

    const numberedRoomMatch = raw.match(/^\d+\s*[\.\)]\s+(.+)$/)
    if (numberedRoomMatch?.[1]) {
      return numberedRoomMatch[1].trim()
    }

    return raw
  }

  const looksLikeSectionHeader = ({ cellA, cellB, cellC, cellD }) => {
    const textA = String(cellA || '').trim()
    const textB = String(cellB || '').trim()
    const hasInlineSectionTitle =
      /^(?:\d+\s*[\.\)]\s*)?раздел(?:\s|:|$)/i.test(textA) ||
      /^(?:\d+\s*[\.\)]\s*)?раздел(?:\s|:|$)/i.test(textB)

    if (textB.toLowerCase().startsWith('раздел:')) {
      return true
    }

    if (hasInlineSectionTitle) {
      return true
    }

    if (textA && !textB && !cellC && !cellD) {
      if (/^\d+\s*[\.\)]\s*раздел(?:\s|:|$)/i.test(textA)) {
        return true
      }

      if (/^\d+\s*[\.\)]\s+\S+/.test(textA)) {
        return true
      }
    }

    return Boolean(cellA && String(cellA).match(/^\d+$/) && !cellC && !cellD)
  }

  for (let r = headerRow + 2; r <= sheet.rowCount; r++) {
    if (consumedSectionTitleRows.has(r)) continue

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
    const isSection = looksLikeSectionHeader({ cellA, cellB, cellC, cellD })

    if (isSection) {
      // Это название раздела
      const nextA = sheet.getCell(r + 1, 1).value
      const nextB = String(sheet.getCell(r + 1, 2).value || '').trim()

      let sectionName = normalizeImportedSectionName(cellB)

      if (!sectionName) {
        sectionName = normalizeImportedSectionName(cellA)
      }

      if (!sectionName) {
        sectionName = normalizeImportedSectionName(nextB)
        if (sectionName) {
          consumedSectionTitleRows.add(r + 1)
        }
      }

      if (!sectionName) {
        sectionName = normalizeImportedSectionName(nextA)
        if (sectionName) {
          consumedSectionTitleRows.add(r + 1)
        }
      }

      if (!sectionName && cellA) {
        sectionName = `Раздел ${cellA}`
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
  let workbook
  let defSheet

  try {
    workbook = await loadTemplateWorkbook('DocTemplates/Смета.xlsx')
    defSheet = getWorksheetByName(workbook, ['Дефектовка №1', 'Дефектовка', 'Sheet1'])
  } catch (e) {
    workbook = new ExcelJS.Workbook()
    workbook.creator = 'ZARU Смета'
    defSheet = workbook.addWorksheet('Дефектовка №1', {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true }
    })
  }

  // Коэффициенты по умолчанию
  const workCoef = coefficients?.work_coef || 2
  const materialCoef = coefficients?.material_coef || 1
  const overheadPercent = coefficients?.overhead_percent || 0.05

  const dateStr = formatDate(new Date().toISOString())
  const clientName = project?.client_name || estimate?.client_name || ''
  const address = project?.address || estimate?.address || ''
  const companyName = companyInfo?.name || 'ООО ПОДРЯДЧИК'

  applyExpandedDocumentHeader(defSheet, {
    docType: 'Дефектовка',
    docNumber: estimate?.number || '',
    docDate: dateStr,
    object: address,
    description: estimate?.name || '',
    basis: estimate?.contract_number ? ('Договор № ' + estimate.contract_number) : '',
    customer: clientName,
    contractor: companyName
  })

  // === ЛИСТ 1: Дефектовка ===
  defSheet.pageSetup = { ...(defSheet.pageSetup || {}), paperSize: 9, orientation: 'landscape', fitToPage: true }

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
  safeMergeCells(defSheet, 'A1:J1')
  defSheet.getCell('A1').value = `ДЕФЕКТОВКА № ${estimate.number || 'Б/Н'}`
  defSheet.getCell('A1').font = { name: 'Arial', size: 14, bold: true }
  defSheet.getCell('A1').alignment = STYLES.alignment.center
  defSheet.getCell('A1').border = STYLES.border.thin
  defSheet.getRow(1).height = 28

  safeMergeCells(defSheet, 'A2:J2')
  defSheet.getCell('A2').value = estimate.name || 'Ремонтно-отделочные работы'
  defSheet.getCell('A2').font = { name: 'Arial', size: 10, italic: true }
  defSheet.getCell('A2').alignment = STYLES.alignment.center
  defSheet.getRow(2).height = 20

  // Реквизиты (строки 3-6)
  const setInfoRow = (rowIndex, label, value) => {
    const valueText = value || ''
    defSheet.getCell(`A${rowIndex}`).value = label
    defSheet.getCell(`A${rowIndex}`).font = { ...STYLES.font.default, bold: true }
    safeMergeCells(defSheet, `B${rowIndex}:F${rowIndex}`)
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
  safeMergeCells(defSheet, `C${coefStartRow}:D${coefStartRow}`)
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
  safeMergeCells(defSheet, `C${coefRow2}:D${coefRow2}`)
  defSheet.getCell(`C${coefRow2}`).value = 'Мат-лы, тонн:'
  defSheet.getCell(`C${coefRow2}`).font = STYLES.font.small
  defSheet.getCell(`E${coefRow2}`).value = 0
  defSheet.getCell(`E${coefRow2}`).font = STYLES.font.default
  safeMergeCells(defSheet, `F${coefRow2}:H${coefRow2}`)
  defSheet.getCell(`F${coefRow2}`).value = 'См. стоимость:'
  defSheet.getCell(`F${coefRow2}`).font = { ...STYLES.font.default, bold: true }
  defSheet.getRow(coefRow2).height = 18

  const coefRow3 = coefStartRow + 2
  safeMergeCells(defSheet, `C${coefRow3}:D${coefRow3}`)
  defSheet.getCell(`C${coefRow3}`).value = 'Мусор, тонн:'
  defSheet.getCell(`C${coefRow3}`).font = STYLES.font.small
  defSheet.getCell(`E${coefRow3}`).value = 0
  defSheet.getCell(`E${coefRow3}`).font = STYLES.font.default
  safeMergeCells(defSheet, `F${coefRow3}:H${coefRow3}`)
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
  const {
    sectionMap,
    unassignedItems,
    assignedItems,
    usedSectionIds
  } = defektovkaMapper.groupDefektovkaItems(items, sections)

  // Функция для добавления позиции с 10 колонками
  const addItemRow = (sheet, row, num, item) => {
    const laborPrice = item.labor_price || 0
    const materialPrice = item.material_price || 0
    const qty = item.quantity || 1
    const qty_r = round2(qty) // ROUND(D,2) — ZaruAI
    const basePrice = laborPrice + materialPrice
    const baseTotal = round2(basePrice * qty_r) // F = ROUND(E * ROUND(D,2), 2)

    const isLabor = laborPrice > 0
    const kType = isLabor ? 'дс' : 'м'
    const smetaPrice = round2(round2(laborPrice * workCoef) + round2(materialPrice * materialCoef)) // I
    const smetaTotal = round2(round2(laborPrice * workCoef) * qty_r) + round2(round2(materialPrice * materialCoef) * qty_r) // J

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
      laborTotal: round2(laborPrice * qty_r),
      materialTotal: round2(materialPrice * qty_r),
      smetaLaborTotal: round2(round2(laborPrice * workCoef) * qty_r),
      smetaMaterialTotal: round2(round2(materialPrice * materialCoef) * qty_r)
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
    safeMergeCells(defSheet, `B${rowNum}:F${rowNum}`)
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
    safeMergeCells(defSheet, `A${rowNum}:E${rowNum}`)
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

    safeMergeCells(defSheet, `A${rowNum}:E${rowNum}`)
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

    safeMergeCells(defSheet, `A${rowNum}:E${rowNum}`)
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
    safeMergeCells(defSheet, `B${rowNum}:F${rowNum}`)
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
    safeMergeCells(defSheet, `A${rowNum}:E${rowNum}`)
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

    safeMergeCells(defSheet, `A${rowNum}:E${rowNum}`)
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

    safeMergeCells(defSheet, `A${rowNum}:E${rowNum}`)
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
  safeMergeCells(defSheet, `A${rowNum}:E${rowNum}`)
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

  safeMergeCells(defSheet, `A${rowNum}:E${rowNum}`)
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

  safeMergeCells(defSheet, `A${rowNum}:E${rowNum}`)
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
  safeMergeCells(defSheet, `A${rowNum}:E${rowNum}`)
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
  safeMergeCells(defSheet, `A${rowNum}:E${rowNum}`)
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
  safeMergeCells(defSheet, `A${rowNum}:F${rowNum}`)
  defSheet.getCell(`A${rowNum}`).value = 'Надбавки и скидки для сметы'
  defSheet.getCell(`A${rowNum}`).font = STYLES.font.default
  defSheet.getRow(rowNum).height = 18
  rowNum += 2

  // Итого по разделам (повтор)
  safeMergeCells(defSheet, `A${rowNum}:E${rowNum}`)
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
  safeMergeCells(defSheet, `A${rowNum}:E${rowNum}`)
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
  safeMergeCells(defSheet, `A${rowNum}:E${rowNum}`)
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
  safeMergeCells(defSheet, `B${rowNum}:D${rowNum}`)
  defSheet.getCell(`B${rowNum}`).value = '_________________________'
  defSheet.getCell(`B${rowNum}`).font = STYLES.font.default
  defSheet.getCell(`B${rowNum}`).alignment = STYLES.alignment.center
  defSheet.getCell(`E${rowNum}`).value = '/'
  defSheet.getCell(`E${rowNum}`).alignment = STYLES.alignment.center
  safeMergeCells(defSheet, `F${rowNum}:H${rowNum}`)
  defSheet.getCell(`F${rowNum}`).value = '_________________________'
  defSheet.getCell(`F${rowNum}`).font = STYLES.font.default
  defSheet.getCell(`F${rowNum}`).alignment = STYLES.alignment.center
  defSheet.getRow(rowNum).height = 18
  rowNum++

  safeMergeCells(defSheet, `B${rowNum}:D${rowNum}`)
  defSheet.getCell(`B${rowNum}`).value = '(подпись)'
  defSheet.getCell(`B${rowNum}`).font = { name: 'Arial', size: 8, italic: true }
  defSheet.getCell(`B${rowNum}`).alignment = STYLES.alignment.center
  safeMergeCells(defSheet, `F${rowNum}:H${rowNum}`)
  defSheet.getCell(`F${rowNum}`).value = '(ФИО)'
  defSheet.getCell(`F${rowNum}`).font = { name: 'Arial', size: 8, italic: true }
  defSheet.getCell(`F${rowNum}`).alignment = STYLES.alignment.center
  defSheet.getRow(rowNum).height = 14
  rowNum += 2

  defSheet.getCell(`A${rowNum}`).value = 'Подрядчик:'
  defSheet.getCell(`A${rowNum}`).font = { ...STYLES.font.default, bold: true }
  safeMergeCells(defSheet, `B${rowNum}:D${rowNum}`)
  defSheet.getCell(`B${rowNum}`).value = '_________________________'
  defSheet.getCell(`B${rowNum}`).font = STYLES.font.default
  defSheet.getCell(`B${rowNum}`).alignment = STYLES.alignment.center
  defSheet.getCell(`E${rowNum}`).value = '/'
  defSheet.getCell(`E${rowNum}`).alignment = STYLES.alignment.center
  safeMergeCells(defSheet, `F${rowNum}:H${rowNum}`)
  defSheet.getCell(`F${rowNum}`).value = '_________________________'
  defSheet.getCell(`F${rowNum}`).font = STYLES.font.default
  defSheet.getCell(`F${rowNum}`).alignment = STYLES.alignment.center
  defSheet.getRow(rowNum).height = 18
  rowNum++

  safeMergeCells(defSheet, `B${rowNum}:D${rowNum}`)
  defSheet.getCell(`B${rowNum}`).value = '(подпись)'
  defSheet.getCell(`B${rowNum}`).font = { name: 'Arial', size: 8, italic: true }
  defSheet.getCell(`B${rowNum}`).alignment = STYLES.alignment.center
  safeMergeCells(defSheet, `F${rowNum}:H${rowNum}`)
  defSheet.getCell(`F${rowNum}`).value = '(ФИО)'
  defSheet.getCell(`F${rowNum}`).font = { name: 'Arial', size: 8, italic: true }
  defSheet.getCell(`F${rowNum}`).alignment = STYLES.alignment.center
  defSheet.getRow(rowNum).height = 14

  // === ЛИСТ 2: ЛОКАЛЬНАЯ СМЕТА (6 колонок по образцу) ===
  let smetaSheet = workbook.getWorksheet('Смета №1') || workbook.getWorksheet('Смета')
  if (!smetaSheet) smetaSheet = workbook.addWorksheet('Смета №1')

  smetaSheet.getColumn(1).width = 4.29   // A: №
  smetaSheet.getColumn(2).width = 61.71  // B: Наименование работ и затрат
  smetaSheet.getColumn(3).width = 8.29   // C: Ед.
  smetaSheet.getColumn(4).width = 11.43  // D: Кол-во
  smetaSheet.getColumn(5).width = 16     // E: Цена, руб.
  smetaSheet.getColumn(6).width = 18     // F: Стоимость, руб.

  // === ШАПКА СМЕТЫ ===
  // Строка 1: Утверждаю / Согласовано
  safeMergeCells(smetaSheet, 'A1:B1')
  smetaSheet.getCell('A1').value = 'Утверждаю:'
  smetaSheet.getCell('A1').font = { ...STYLES.font.default, bold: true, underline: true }
  safeMergeCells(smetaSheet, 'E1:F1')
  smetaSheet.getCell('E1').value = 'Согласовано:'
  smetaSheet.getCell('E1').font = { ...STYLES.font.default, bold: true, underline: true }
  smetaSheet.getRow(1).height = 18

  // Строка 2: Названия компаний
  safeMergeCells(smetaSheet, 'A2:C2')
  smetaSheet.getCell('A2').value = `Генеральный директор ${clientName || 'ЗАО "Заказчик"'}`
  smetaSheet.getCell('A2').font = STYLES.font.default
  safeMergeCells(smetaSheet, 'E2:F2')
  smetaSheet.getCell('E2').value = `Генеральный директор ${companyName}`
  smetaSheet.getCell('E2').font = STYLES.font.default
  smetaSheet.getRow(2).height = 18

  // Строка 3: Подписи
  safeMergeCells(smetaSheet, 'A3:C3')
  smetaSheet.getCell('A3').value = '__________ / ___________________ /'
  smetaSheet.getCell('A3').font = STYLES.font.default
  safeMergeCells(smetaSheet, 'E3:F3')
  smetaSheet.getCell('E3').value = '__________ / ___________________ /'
  smetaSheet.getCell('E3').font = STYLES.font.default
  smetaSheet.getRow(3).height = 18

  // Подсказки к подписям
  safeMergeCells(smetaSheet, 'A4:C4')
  smetaSheet.getCell('A4').value = '   (подпись)          (ФИО)'
  smetaSheet.getCell('A4').font = { name: 'Arial', size: 8, italic: true }
  safeMergeCells(smetaSheet, 'E4:F4')
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
  safeMergeCells(smetaSheet, 'A7:F7')
  smetaSheet.getCell('A7').value = `ЛОКАЛЬНАЯ СМЕТА № ${estimate.number || 'Б/Н'}`
  smetaSheet.getCell('A7').font = { name: 'Arial', size: 14, bold: true }
  smetaSheet.getCell('A7').alignment = STYLES.alignment.center
  smetaSheet.getCell('A7').border = STYLES.border.thin
  smetaSheet.getRow(7).height = 26

  // Строка 8: Название работ
  safeMergeCells(smetaSheet, 'A8:F8')
  smetaSheet.getCell('A8').value = `на ${estimate.name || 'Ремонтно-отделочные работы'}`
  smetaSheet.getCell('A8').font = { name: 'Arial', size: 10, italic: true }
  smetaSheet.getCell('A8').alignment = STYLES.alignment.center
  smetaSheet.getRow(8).height = 18

  // Строка 9: Приложение
  safeMergeCells(smetaSheet, 'A9:C9')
  smetaSheet.getCell('A9').value = 'Приложение № 1'
  smetaSheet.getCell('A9').font = STYLES.font.default
  smetaSheet.getRow(9).height = 18

  // Строка 10: К договору
  safeMergeCells(smetaSheet, 'A10:D10')
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
  safeMergeCells(smetaSheet, 'A11:D11')
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
    safeMergeCells(smetaSheet, `A${rowNum}:F${rowNum}`)
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
    safeMergeCells(smetaSheet, `A${rowNum}:E${rowNum}`)
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
    safeMergeCells(smetaSheet, `A${rowNum}:F${rowNum}`)
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
    safeMergeCells(smetaSheet, `A${rowNum}:E${rowNum}`)
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
    safeMergeCells(smetaSheet, `A${rowNum}:E${rowNum}`)
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
  safeMergeCells(smetaSheet, `A${rowNum}:E${rowNum}`)
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
  safeMergeCells(smetaSheet, `B${rowNum}:C${rowNum}`)
  smetaSheet.getCell(`B${rowNum}`).value = '_________________________'
  smetaSheet.getCell(`B${rowNum}`).font = STYLES.font.default
  smetaSheet.getCell(`B${rowNum}`).alignment = STYLES.alignment.center
  smetaSheet.getCell(`D${rowNum}`).value = '/'
  smetaSheet.getCell(`D${rowNum}`).alignment = STYLES.alignment.center
  safeMergeCells(smetaSheet, `E${rowNum}:F${rowNum}`)
  smetaSheet.getCell(`E${rowNum}`).value = '_________________________'
  smetaSheet.getCell(`E${rowNum}`).font = STYLES.font.default
  smetaSheet.getCell(`E${rowNum}`).alignment = STYLES.alignment.center
  smetaSheet.getRow(rowNum).height = 18
  rowNum++

  safeMergeCells(smetaSheet, `B${rowNum}:C${rowNum}`)
  smetaSheet.getCell(`B${rowNum}`).value = '(подпись)'
  smetaSheet.getCell(`B${rowNum}`).font = { name: 'Arial', size: 8, italic: true }
  smetaSheet.getCell(`B${rowNum}`).alignment = STYLES.alignment.center
  safeMergeCells(smetaSheet, `E${rowNum}:F${rowNum}`)
  smetaSheet.getCell(`E${rowNum}`).value = '(ФИО)'
  smetaSheet.getCell(`E${rowNum}`).font = { name: 'Arial', size: 8, italic: true }
  smetaSheet.getCell(`E${rowNum}`).alignment = STYLES.alignment.center
  smetaSheet.getRow(rowNum).height = 14
  rowNum += 2

  smetaSheet.getCell(`A${rowNum}`).value = 'Проверил:'
  smetaSheet.getCell(`A${rowNum}`).font = { ...STYLES.font.default, bold: true }
  safeMergeCells(smetaSheet, `B${rowNum}:C${rowNum}`)
  smetaSheet.getCell(`B${rowNum}`).value = '_________________________'
  smetaSheet.getCell(`B${rowNum}`).font = STYLES.font.default
  smetaSheet.getCell(`B${rowNum}`).alignment = STYLES.alignment.center
  smetaSheet.getCell(`D${rowNum}`).value = '/'
  smetaSheet.getCell(`D${rowNum}`).alignment = STYLES.alignment.center
  safeMergeCells(smetaSheet, `E${rowNum}:F${rowNum}`)
  smetaSheet.getCell(`E${rowNum}`).value = '_________________________'
  smetaSheet.getCell(`E${rowNum}`).font = STYLES.font.default
  smetaSheet.getCell(`E${rowNum}`).alignment = STYLES.alignment.center
  smetaSheet.getRow(rowNum).height = 18
  rowNum++

  safeMergeCells(smetaSheet, `B${rowNum}:C${rowNum}`)
  smetaSheet.getCell(`B${rowNum}`).value = '(подпись)'
  smetaSheet.getCell(`B${rowNum}`).font = { name: 'Arial', size: 8, italic: true }
  smetaSheet.getCell(`B${rowNum}`).alignment = STYLES.alignment.center
  safeMergeCells(smetaSheet, `E${rowNum}:F${rowNum}`)
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

// ===== ГЕНЕРАЦИЯ ВЕДОМОСТИ ФОТ (ZaruAI Смета) =====
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

  applyExpandedDocumentHeader(ws, {
    docType: 'ФОТ',
    docNumber: estimate?.number || '',
    docDate: dateStr,
    object: estimate?.address || '',
    description: estimate?.name || 'Фонд оплаты труда по объекту',
    basis: estimate?.contract_number ? ('Договор № ' + estimate.contract_number) : '',
    customer: estimate?.client_name || '',
    contractor: ''
  })

  // === ШАПКА — Утверждаю ===
  safeMergeCells(ws, 'A1:B1')
  ws.getCell('A1').value = 'Утверждаю:'
  ws.getCell('A1').font = { ...STYLES.font.default, bold: true, underline: true }
  ws.getRow(1).height = 18

  // Согласовано (правый блок)
  safeMergeCells(ws, 'E1:F1')
  ws.getCell('E1').value = 'Согласовано:'
  ws.getCell('E1').font = { ...STYLES.font.default, bold: true, underline: true }
  ws.getRow(1).height = 18

  safeMergeCells(ws, 'A2:B2')
  ws.getCell('A2').value = '________________________'
  ws.getCell('A2').font = STYLES.font.default
  ws.getCell('A2').alignment = STYLES.alignment.center
  safeMergeCells(ws, 'E2:F2')
  ws.getCell('E2').value = '________________________'
  ws.getCell('E2').font = STYLES.font.default
  ws.getCell('E2').alignment = STYLES.alignment.center
  ws.getRow(2).height = 18

  safeMergeCells(ws, 'A3:B3')
  ws.getCell('A3').value = '(должность, ФИО)'
  ws.getCell('A3').font = { name: 'Arial', size: 8, italic: true }
  ws.getCell('A3').alignment = STYLES.alignment.center
  safeMergeCells(ws, 'E3:F3')
  ws.getCell('E3').value = '(должность, ФИО)'
  ws.getCell('E3').font = { name: 'Arial', size: 8, italic: true }
  ws.getCell('E3').alignment = STYLES.alignment.center
  ws.getRow(3).height = 14

  ws.getCell('A5').value = dateStr
  ws.getCell('A5').font = STYLES.font.default
  ws.getRow(5).height = 18

  row = 7

  // Заголовок
  safeMergeCells(ws, `A${row}:F${row}`)
  ws.getCell(`A${row}`).value = `Ведомость № ${estimate.number || '1'}`
  ws.getCell(`A${row}`).font = STYLES.font.title
  ws.getCell(`A${row}`).alignment = STYLES.alignment.center
  ws.getRow(row).height = 22
  row++

  safeMergeCells(ws, `A${row}:F${row}`)
  ws.getCell(`A${row}`).value = 'Фонд оплаты труда по объекту'
  ws.getCell(`A${row}`).font = { name: 'Arial', size: 14, bold: true }
  ws.getCell(`A${row}`).alignment = STYLES.alignment.center
  ws.getRow(row).height = 25
  row++

  safeMergeCells(ws, `A${row}:F${row}`)
  ws.getCell(`A${row}`).value = estimate.name || 'Ремонтно отделочные работы'
  ws.getCell(`A${row}`).font = STYLES.font.header
  ws.getCell(`A${row}`).alignment = STYLES.alignment.center
  ws.getRow(row).height = 20
  row += 2

  safeMergeCells(ws, `A${row}:C${row}`)
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

  // Данные (Трудозатраты по работам — только расценки, с коэффициентом на работы)
  const workCoefFOT     = coefficients?.work_coef     || estimate?.work_coef     || 1.8
  const sectionMap = new Map()
  sections?.forEach(s => sectionMap.set(s.id, s))

  const allItems = items || []
  const usedSectionIds = [...new Set(allItems.map(i => i.section_id || 0))]
  let grandTotal = 0
  let sectionNum = 0

  for (const sectionId of usedSectionIds) {
    const section = sectionMap.get(sectionId)
    const sectionName = section?.name || (sectionId === 0 ? 'Общие работы' : 'Раздел')
    const sectionItems = allItems.filter(i => (i.section_id || 0) === sectionId)
      .filter(i => isWorkRow(i.row_type))  // только работы в ФОТ

    if (!sectionItems.length) continue

    sectionNum++
    row++

    // Заголовок раздела
    safeMergeCells(ws, `A${row}:F${row}`)
    ws.getCell(row, 1).value = `${sectionNum}. Раздел: ${sectionName}`
    ws.getCell(row, 1).font = STYLES.font.header
    ws.getCell(row, 1).fill = STYLES.fill.yellow
    for (let c = 1; c <= 6; c++) ws.getCell(row, c).border = STYLES.border.thin
    ws.getRow(row).height = 20
    row++

    let sectionTotal = 0
    let itemNum = 0

    for (const item of sectionItems) {
      itemNum++
      const qty = Number(item.quantity) || 0
      const qty_r = round2(qty) // ROUND(D,2) — ZaruAI
      // ФОТ: показываем фактическую цену работы (без коэффициента)
      const priceFact = Number(item.labor_price || item.price || 0)
      // Сметная стоимость работы — с коэффициентом
      const priceSmeta = round2(priceFact * workCoefFOT) // I = ROUND(E * H, 2)
      const itemTotal  = round2(priceSmeta * qty_r)      // J = ROUND(I * ROUND(D,2), 2)
      sectionTotal += itemTotal

      const rowData = [itemNum, item.name, qty, item.unit || 'шт.', priceSmeta, itemTotal]
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
    safeMergeCells(ws, `A${row}:E${row}`)
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
  safeMergeCells(ws, `A${row}:E${row}`)
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
  safeMergeCells(ws, `C${row}:D${row}`)
  ws.getCell(`C${row}`).value = '_________________'
  ws.getCell(`C${row}`).alignment = STYLES.alignment.center
  ws.getCell(`E${row}`).value = '/'
  ws.getCell(`E${row}`).alignment = STYLES.alignment.center
  ws.getCell(`F${row}`).value = '_________________'
  ws.getCell(`F${row}`).alignment = STYLES.alignment.center
  ws.getRow(row).height = 18
  row++

  safeMergeCells(ws, `C${row}:D${row}`)
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
  safeMergeCells(ws, `C${row}:D${row}`)
  ws.getCell(`C${row}`).value = '_________________'
  ws.getCell(`C${row}`).alignment = STYLES.alignment.center
  ws.getCell(`E${row}`).value = '/'
  ws.getCell(`E${row}`).alignment = STYLES.alignment.center
  ws.getCell(`F${row}`).value = '_________________'
  ws.getCell(`F${row}`).alignment = STYLES.alignment.center
  ws.getRow(row).height = 18
  row++

  safeMergeCells(ws, `C${row}:D${row}`)
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

module.exports = {
  // Excel (legacy — оставлены для импорта)
  generateEstimateExcel,
  generateKS2Excel,
  generateKS3Excel,
  generateM29Excel,
  generateContractRTF,
  generateDefektovkaExcel,
  generateFOTExcel,
  generateSmeta2007Excel,
  importEstimateFromExcel,
  importDefektovkaFromExcel,
  // HTML генераторы (основной формат)
  generateEstimateHTML,
  generateEstimateHTMLFile,
  generateKS2HTML,
  generateKS3HTML,
  generateM29HTML,
  generateDefektovkaHTML,
  generateFOTHTML,
  generateMaterialRequestHTML,
  generateInvoiceHTML,
  generateHTMLFile,
  // Утилиты
  formatCurrency,
  formatDate,
  formatNumber
}
























