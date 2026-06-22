const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const ExcelJS = require('exceljs')
const { app } = require('electron')

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zaru-estimate-core-'))
const userDataDir = path.join(tempRoot, 'userData')
fs.mkdirSync(userDataDir, { recursive: true })
app.setPath('userData', userDataDir)

const db = require('../src/database')
const docs = require('../src/documents')

const getCellText = (cell) => {
  if (!cell) return ''
  if (typeof cell.text === 'string' && cell.text !== '') return cell.text
  const value = cell.value
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    if (value.richText) return value.richText.map((part) => part.text).join('')
    if (value.formula !== undefined) return String(value.result ?? '')
    if (value.text) return String(value.text)
  }
  return String(value)
}

const loadWorkbook = async (filePath) => {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)
  return workbook
}

const findRowByText = (sheet, columnIndex, expectedText) => {
  for (let rowIndex = 1; rowIndex <= sheet.rowCount; rowIndex += 1) {
    const text = getCellText(sheet.getRow(rowIndex).getCell(columnIndex)).trim()
    if (text === expectedText) {
      return sheet.getRow(rowIndex)
    }
  }
  return null
}

const readNumeric = (cell) => {
  const value = cell?.value
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && typeof value.result === 'number') return value.result
  return Number(value || 0)
}

async function main() {
  await app.whenReady()
  await db.initDatabase()

  const project = db.createProject({
    name: 'Verification project',
    client_name: 'Verification client',
    address: 'Verification address'
  })

  const estimateCreated = db.createEstimate({
    project_id: project.id,
    name: 'Verification estimate',
    number: 'T-001',
    overhead_percent: 10,
    profit_percent: 5,
    vat_percent: 20
  })
  const estimateId = estimateCreated.id

  db.setCoefficients(estimateId, { work_coef: 1.8, material_coef: 1.04 })
  const section = db.createEstimateSection({ estimate_id: estimateId, name: 'Verification section' })

  const workItemCreated = db.createEstimateItem({
    estimate_id: estimateId,
    name: 'Work item',
    unit: 'шт.',
    quantity: 1,
    materials_cost: 0,
    labor_cost: 0,
    row_type: 'rascenka',
    section_id: section.id
  })

  db.updateEstimateItem(workItemCreated.id, {
    quantity: 2,
    material_price: 100,
    labor_price: 200,
    section_id: section.id
  })

  db.createEstimateItem({
    estimate_id: estimateId,
    name: 'Material item',
    unit: 'шт.',
    quantity: 3,
    materials_cost: 50,
    labor_cost: 0,
    row_type: 'material',
    section_id: section.id
  })

  const items = db.getEstimateItems(estimateId)
  const estimate = db.getEstimate(estimateId)
  const sections = db.getEstimateSections(estimateId)
  const coefficients = db.getCoefficients(estimateId)
  const projectData = db.getProject(project.id)

  const workItem = items.find((item) => item.id === workItemCreated.id)
  assert(workItem, 'Updated work item was not found in estimate items')
  assert.strictEqual(workItem.material_price, 100)
  assert.strictEqual(workItem.labor_price, 200)
  assert.strictEqual(workItem.materials_total, 208)
  assert.strictEqual(workItem.labor_total, 720)
  assert.strictEqual(workItem.price_smeta, 464)
  assert.strictEqual(workItem.sum_smeta, 928)
  assert.strictEqual(workItem.total, 928)
  assert.strictEqual(estimate.subtotal, 1084)

  const companyInfo = { name: 'Verification contractor', director: 'Verifier' }
  const estimateFile = path.join(tempRoot, 'estimate.xlsx')
  await docs.generateEstimateExcel(estimate, items, projectData, companyInfo, coefficients, estimateFile)

  const smeta2007File = path.join(tempRoot, 'smeta2007.xlsx')
  await docs.generateSmeta2007Excel(estimate, items, sections, coefficients, projectData, companyInfo, smeta2007File)

  const ks2File = path.join(tempRoot, 'ks2.xlsx')
  await docs.generateKS2Excel({ number: '1', date: '2026-03-11' }, items, sections, projectData, estimate, coefficients, ks2File)

  const estimateBook = await loadWorkbook(estimateFile)
  const estimateSheet = estimateBook.getWorksheet('Смета №1') || estimateBook.getWorksheet('Смета') || estimateBook.worksheets[0]
  const estimateRow = findRowByText(estimateSheet, 2, 'Work item')
  assert(estimateRow, 'Work item row not found in local estimate workbook')
  assert.strictEqual(readNumeric(estimateRow.getCell(5)), 464)
  assert.strictEqual(readNumeric(estimateRow.getCell(6)), 928)

  const smetaBook = await loadWorkbook(smeta2007File)
  const smetaSheet = smetaBook.getWorksheet('Смета №1') || smetaBook.getWorksheet('Смета') || smetaBook.worksheets[0]
  const smetaRow = findRowByText(smetaSheet, 2, 'Work item')
  assert(smetaRow, 'Work item row not found in Smeta 2007 workbook')
  assert.strictEqual(readNumeric(smetaRow.getCell(5)), 464)
  assert.strictEqual(readNumeric(smetaRow.getCell(6)), 928)

  const ks2Book = await loadWorkbook(ks2File)
  const ks2Sheet = ks2Book.getWorksheet('КС-2 №1') || ks2Book.getWorksheet('КС-2') || ks2Book.worksheets[0]
  const ks2Row = findRowByText(ks2Sheet, 3, 'Work item')
  assert(ks2Row, 'Work item row not found in KS-2 workbook')
  assert.strictEqual(readNumeric(ks2Row.getCell(7)), 464)
  assert.strictEqual(readNumeric(ks2Row.getCell(8)), 928)

  console.log('estimate core verification passed')
}

main()
  .then(() => {
    try { db.closeDatabase() } catch (error) {}
    app.exit(0)
  })
  .catch((error) => {
    console.error(error && error.stack ? error.stack : error)
    try { db.closeDatabase() } catch (closeError) {}
    app.exit(1)
  })

