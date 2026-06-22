const fs = require('fs')
const path = require('path')
const xlsx = require('xlsx')

function getArg(name, defaultValue = null) {
  const idx = process.argv.indexOf(name)
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1]
  return defaultValue
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0
  const str = String(value).replace(',', '.')
  const num = Number(str)
  return Number.isFinite(num) ? num : 0
}

function loadSheet(wb, name) {
  return wb.Sheets[name] || null
}

function extractRegions(wb) {
  const sheet = loadSheet(wb, 'Лист1') || wb.Sheets[wb.SheetNames[0]]
  if (!sheet) return []
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  let headerRow = -1
  let nameCol = -1
  let coefCol = -1

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i].map(v => String(v).trim())
    for (let c = 0; c < row.length; c++) {
      if (row[c] === 'Местность') nameCol = c
      if (row[c] === 'Коэффициент' && coefCol === -1) coefCol = c
    }
    if (nameCol !== -1 && coefCol !== -1) {
      headerRow = i
      break
    }
  }

  if (headerRow < 0) return []
  const regions = []
  let emptyStreak = 0

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r]
    const name = String(row[nameCol] || '').trim()
    const coef = toNumber(row[coefCol])

    if (!name) {
      emptyStreak++
      if (emptyStreak >= 5) break
      continue
    }
    emptyStreak = 0
    if (coef <= 0) continue
    regions.push({ name, coefficient: coef })
  }

  return regions
}

function findCatalogSheet(wb) {
  const targetHeader = 'Наименование работ'
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name]
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' })
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i].map(v => String(v))
      if (row.includes(targetHeader)) {
        return { name, headerRow: i, rows }
      }
    }
  }
  return null
}

function extractCatalog(wb, preferredSheet) {
  let target = null
  if (preferredSheet) {
    const sheet = wb.Sheets[preferredSheet]
    if (sheet) {
      const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' })
      target = { name: preferredSheet, rows }
    }
  }
  if (!target) {
    target = findCatalogSheet(wb)
  }
  if (!target) return { works: [], sections: [] }

  const rows = target.rows
  let headerRow = -1
  let nameCol = -1
  let unitCol = -1
  let priceCol = -1

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i].map(v => String(v).trim())
    for (let c = 0; c < row.length; c++) {
      if (row[c] === 'Наименование работ') nameCol = c
      if (row[c] === 'Единица измерения') unitCol = c
      if (row[c] === 'Цена') priceCol = c
    }
    if (nameCol !== -1 && priceCol !== -1) {
      headerRow = i
      break
    }
  }

  if (headerRow < 0) return { works: [], sections: [] }

  const works = []
  const sections = []
  const sectionMap = new Map()
  let currentSection = ''

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r]
    const rawName = String(row[nameCol] || '').trim()
    if (!rawName) continue
    const unit = unitCol >= 0 ? String(row[unitCol] || '').trim() : ''
    const price = priceCol >= 0 ? toNumber(row[priceCol]) : 0

    const isSection = !unit && price === 0
    if (isSection) {
      currentSection = rawName
      if (!sectionMap.has(currentSection)) {
        const id = `S${sectionMap.size + 1}`
        sectionMap.set(currentSection, id)
        sections.push({ id, name: currentSection, parent_id: null, path: currentSection })
      }
      continue
    }

    const sectionId = sectionMap.get(currentSection) || null
    works.push({
      id: `W${works.length + 1}`,
      code: '',
      name: rawName,
      unit: unit || 'шт.',
      labor_price: price,
      material_price: 0,
      price: price,
      category: currentSection || '',
      section_id: sectionId
    })
  }

  return { works, sections }
}

const source = getArg('--source')
if (!source) {
  console.error('Usage: node import_simple_smeta.js --source <xlsx> [--regions <out.json>] [--catalog <out.json>] [--sheet <name>]')
  process.exit(1)
}

const outRegions = getArg('--regions', path.join(__dirname, '..', 'db', 'regions.json'))
const outCatalog = getArg('--catalog', path.join(__dirname, '..', 'db', 'catalog_simple.json'))
const sheetName = getArg('--sheet', 'Лист2')

if (!fs.existsSync(source)) {
  console.error(`Source file not found: ${source}`)
  process.exit(1)
}

const wb = xlsx.readFile(source)

// Regions
const regions = extractRegions(wb)
fs.writeFileSync(outRegions, JSON.stringify({ regions }, null, 2), 'utf8')

// Catalog
const { works, sections } = extractCatalog(wb, sheetName)
const catalog = {
  version: 1,
  generated_at: new Date().toISOString().slice(0, 10),
  works,
  sections
}
fs.writeFileSync(outCatalog, JSON.stringify(catalog, null, 2), 'utf8')

console.log(`OK: regions=${regions.length} -> ${outRegions}`)
console.log(`OK: works=${works.length}, sections=${sections.length} -> ${outCatalog}`)
