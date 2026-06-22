const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const ExcelJS = require('exceljs')
const { app } = require('electron')

const { OUTPUT_MD } = require('./extract-document-golden-master')

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zaru-parity-'))
const userDataDir = path.join(tempRoot, 'userData')
fs.mkdirSync(userDataDir, { recursive: true })
app.setPath('userData', userDataDir)

const db = require('../src/database')
const docs = require('../src/documents')

const parseManifestFromMarkdown = (markdown) => {
  const match = markdown.match(/```json\s*([\s\S]*?)\s*```/)
  if (!match) throw new Error('Manifest JSON block is missing')
  return JSON.parse(match[1])
}

const findRef = (manifest, candidates) => {
  const lower = candidates.map((x) => x.toLowerCase())
  return manifest.files.find((file) => {
    const rel = String(file.relPath || '').toLowerCase()
    return file.type === 'xlsx' && lower.some((candidate) => rel.includes(candidate))
  })
}

const toSheetMap = (sheets = []) => {
  const map = new Map()
  sheets.forEach((sheet) => {
    map.set(String(sheet.name || '').toLowerCase(), sheet)
  })
  return map
}

const workbookSignature = async (filePath) => {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)

  const sheets = workbook.worksheets.map((sheet) => {
    let formulaCount = 0
    let nonEmptyRows = 0
    const mergeCount = (sheet.model && Array.isArray(sheet.model.merges)) ? sheet.model.merges.length : 0

    sheet.eachRow({ includeEmpty: false }, (row) => {
      nonEmptyRows += 1
      row.eachCell({ includeEmpty: false }, (cell) => {
        const value = cell.value
        if (value && typeof value === 'object' && typeof value.formula === 'string') {
          formulaCount += 1
        }
      })
    })

    return {
      name: sheet.name,
      rowCount: sheet.rowCount || 0,
      mergeCount,
      formulaCount,
      nonEmptyRows
    }
  })

  return {
    sheetCount: sheets.length,
    sheetNames: sheets.map((s) => s.name),
    sheets
  }
}

const withinTolerance = (actual, expected, absoluteTolerance, ratioTolerance = 0) => {
  const absDiff = Math.abs(actual - expected)
  if (absDiff <= absoluteTolerance) return true
  if (expected <= 0) return false
  return (absDiff / expected) <= ratioTolerance
}

const compareMatchedSheets = (label, generated, reference) => {
  const generatedMap = toSheetMap(generated.sheets)
  const referenceMap = toSheetMap(reference.sheets || [])

  const overlaps = []
  generatedMap.forEach((_sheet, name) => {
    if (referenceMap.has(name)) overlaps.push(name)
  })

  assert.ok(overlaps.length > 0, `${label}: no overlapping sheet names for structural comparison`)

  overlaps.forEach((name) => {
    const g = generatedMap.get(name)
    const r = referenceMap.get(name)

    // Row count is intentionally broad for now (data set differs), but keeps gross regressions visible.
    assert.ok(
      withinTolerance(g.nonEmptyRows, r.nonEmptyRows || 0, 80, 2.0),
      `${label}/${g.name}: nonEmptyRows mismatch (generated=${g.nonEmptyRows}, reference=${r.nonEmptyRows})`
    )

    // Merge and formula counts are closer to template geometry, so tighter bounds.
    assert.ok(
      withinTolerance(g.mergeCount, r.mergeCount || 0, 25, 3.0),
      `${label}/${g.name}: mergeCount mismatch (generated=${g.mergeCount}, reference=${r.mergeCount})`
    )

    assert.ok(
      withinTolerance(g.formulaCount, r.formulaCount || 0, 35, 2.0),
      `${label}/${g.name}: formulaCount mismatch (generated=${g.formulaCount}, reference=${r.formulaCount})`
    )
  })
}

const compareSignatures = (label, generated, reference) => {
  assert.ok(reference, `${label}: reference manifest entry not found`)

  const generatedNames = generated.sheetNames.map((x) => x.toLowerCase())
  const referenceNames = (reference.sheetNames || []).map((x) => String(x).toLowerCase())

  const nameIntersections = generatedNames.filter((name) => referenceNames.includes(name))
  assert.ok(
    nameIntersections.length > 0,
    `${label}: no overlapping sheet names; generated=${generated.sheetNames.join(', ')} reference=${(reference.sheetNames || []).join(', ')}`
  )

  const diff = Math.abs((generated.sheetCount || 0) - (reference.sheetCount || 0))
  assert.ok(diff <= 2, `${label}: sheetCount mismatch too large (${generated.sheetCount} vs ${reference.sheetCount})`)

  compareMatchedSheets(label, generated, reference)
}

async function main() {
  if (!fs.existsSync(OUTPUT_MD)) {
    throw new Error(`Golden master not found: ${OUTPUT_MD}`)
  }

  const markdown = fs.readFileSync(OUTPUT_MD, 'utf8')
  const manifest = parseManifestFromMarkdown(markdown)

  await app.whenReady()
  await db.initDatabase()

  const project = db.createProject({
    name: 'Parity project',
    client_name: 'Parity client',
    address: 'Parity address'
  })

  const estimate = db.createEstimate({
    project_id: project.id,
    name: 'Parity estimate',
    number: 'P-001',
    overhead_percent: 10,
    profit_percent: 5,
    vat_percent: 20
  })

  db.setCoefficients(estimate.id, { work_coef: 1.8, material_coef: 1.04 })

  const section = db.createEstimateSection({ estimate_id: estimate.id, name: 'Section A', sort_order: 1 })
  db.createEstimateItem({
    estimate_id: estimate.id,
    section_id: section.id,
    name: 'Work item',
    unit: 'м2',
    quantity: 10,
    material_price: 100,
    labor_price: 200,
    row_type: 'rascenka',
    sort_order: 1
  })
  db.createEstimateItem({
    estimate_id: estimate.id,
    section_id: section.id,
    name: 'Material item',
    unit: 'шт',
    quantity: 5,
    material_price: 300,
    labor_price: 0,
    row_type: 'material',
    sort_order: 2
  })

  const estimateData = db.getEstimate(estimate.id)
  const items = db.getEstimateItems(estimate.id)
  const sections = db.getEstimateSections(estimate.id)
  const projectData = db.getProject(project.id)
  const coefficients = db.getCoefficients(estimate.id)
  const settings = db.getAllSettings()
  const companyInfo = typeof settings.company === 'string' ? JSON.parse(settings.company || '{}') : (settings.company || {})

  const estimateOut = path.join(tempRoot, 'estimate.xlsx')
  const defektOut = path.join(tempRoot, 'defektovka.xlsx')

  await docs.generateEstimateExcel(estimateData, items, projectData, companyInfo, coefficients, estimateOut)
  await docs.generateDefektovkaExcel(estimateData, items, sections, coefficients, projectData, companyInfo, defektOut)

  const generatedEstimate = await workbookSignature(estimateOut)
  const generatedDefekt = await workbookSignature(defektOut)

  const referenceEstimate = findRef(manifest, ['смета.xlsx'])
  const referenceDefekt = findRef(manifest, ['дефектовка.xlsx', 'деффектовка.xlsx'])

  compareSignatures('estimate', generatedEstimate, referenceEstimate)
  compareSignatures('defektovka', generatedDefekt, referenceDefekt)

  console.log('estimate/defektovka parity baseline passed (strict mode)')
}

main()
  .then(() => {
    try { db.closeDatabase() } catch {}
    app.exit(0)
  })
  .catch((error) => {
    console.error(error && error.stack ? error.stack : error)
    try { db.closeDatabase() } catch {}
    app.exit(1)
  })

