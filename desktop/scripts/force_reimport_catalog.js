const fs = require('fs')
const path = require('path')
const initSqlJs = require('sql.js')

function getArg(name, def = null) {
  const idx = process.argv.indexOf(name)
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1]
  return def
}

function normalizeName(name) {
  return String(name || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function loadJson(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null
  const raw = fs.readFileSync(filePath, 'utf-8')
  const text = raw.replace(/^\uFEFF/, '')
  return JSON.parse(text)
}

function mergeCatalogs(baseData, simpleData) {
  if (!simpleData) return baseData
  const merged = { ...baseData }
  merged.sections = merged.sections || []
  merged.works = merged.works || []
  merged.materials = merged.materials || []
  merged.work_materials = merged.work_materials || []

  const sectionByName = new Map()
  merged.sections.forEach(s => sectionByName.set(normalizeName(s.name), s))
  ;(simpleData.sections || []).forEach(s => {
    const key = normalizeName(s.name)
    if (!sectionByName.has(key)) {
      sectionByName.set(key, s)
      merged.sections.push(s)
    }
  })

  const workByName = new Map()
  merged.works.forEach(w => workByName.set(normalizeName(w.name), w))
  ;(simpleData.works || []).forEach(w => {
    const key = normalizeName(w.name)
    if (!workByName.has(key)) {
      merged.works.push(w)
      workByName.set(key, w)
    } else {
      const base = workByName.get(key)
      if (!base.category && w.category) base.category = w.category
      if (!base.section_id && w.section_id) base.section_id = w.section_id
      if (!base.unit && w.unit) base.unit = w.unit
      if (!base.price && w.price) base.price = w.price
      if (!base.labor_price && w.labor_price) base.labor_price = w.labor_price
    }
  })

  return merged
}

async function run() {
  const repoRoot = path.resolve(__dirname, '..')
  const defaultDb = path.join(process.env.APPDATA || '', 'zaru-smeta', 'smeta_zaru.db')
  const dbPath = getArg('--db', defaultDb)
  const catalogPath = getArg('--catalog', path.join(repoRoot, 'db', 'catalog_rsk.json'))
  const simpleCatalogPath = getArg('--catalog-simple', path.join(repoRoot, 'db', 'catalog_simple.json'))
  const regionsPath = getArg('--regions', path.join(repoRoot, 'db', 'regions.json'))

  if (!dbPath || !fs.existsSync(dbPath)) {
    console.error('DB not found:', dbPath)
    process.exit(1)
  }

  const base = loadJson(catalogPath)
  const simple = loadJson(simpleCatalogPath)
  if (!base && !simple) {
    console.error('No catalog files found.')
    process.exit(1)
  }
  const catalog = mergeCatalogs(base || simple, simple && base ? simple : null)
  const regionsData = loadJson(regionsPath)

  const SQL = await initSqlJs()
  const dbFile = fs.readFileSync(dbPath)
  const db = new SQL.Database(dbFile)

  const safeRun = (sql) => {
    try { db.run(sql) } catch (e) { }
  }

  // Ensure tables exist
  safeRun(`CREATE TABLE IF NOT EXISTS work_catalog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id TEXT,
    code TEXT,
    name TEXT NOT NULL,
    unit TEXT,
    price REAL DEFAULT 0,
    labor_price REAL DEFAULT 0,
    material_price REAL DEFAULT 0,
    category TEXT,
    section_id TEXT,
    price_fakt REAL DEFAULT 0,
    price_est REAL DEFAULT 0,
    coeff REAL DEFAULT 1.0,
    trudozatrats REAL DEFAULT 0,
    razrjad REAL DEFAULT 0
  )`)
  safeRun(`CREATE TABLE IF NOT EXISTS material_catalog (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id TEXT,
    code TEXT,
    name TEXT NOT NULL,
    unit TEXT DEFAULT 'шт.',
    price REAL DEFAULT 0,
    price_est REAL DEFAULT 0,
    coeff REAL DEFAULT 1.0,
    group_name TEXT,
    group_id TEXT
  )`)
  safeRun(`CREATE TABLE IF NOT EXISTS work_materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    work_id INTEGER,
    material_id INTEGER,
    norm REAL DEFAULT 0,
    formula TEXT,
    sort_order INTEGER DEFAULT 0
  )`)
  safeRun(`CREATE TABLE IF NOT EXISTS work_sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id TEXT,
    name TEXT NOT NULL,
    parent_external_id TEXT,
    path TEXT,
    level INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0
  )`)
  safeRun(`CREATE TABLE IF NOT EXISTS regions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    coefficient REAL DEFAULT 1.0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)

  // Ensure columns exist (legacy DBs)
  safeRun('ALTER TABLE work_catalog ADD COLUMN external_id TEXT')
  safeRun('ALTER TABLE work_catalog ADD COLUMN labor_price REAL DEFAULT 0')
  safeRun('ALTER TABLE work_catalog ADD COLUMN material_price REAL DEFAULT 0')
  safeRun('ALTER TABLE work_catalog ADD COLUMN section_id TEXT')
  safeRun('ALTER TABLE work_catalog ADD COLUMN price_fakt REAL DEFAULT 0')
  safeRun('ALTER TABLE work_catalog ADD COLUMN price_est REAL DEFAULT 0')
  safeRun('ALTER TABLE work_catalog ADD COLUMN coeff REAL DEFAULT 1.0')
  safeRun('ALTER TABLE work_catalog ADD COLUMN trudozatrats REAL DEFAULT 0')
  safeRun('ALTER TABLE work_catalog ADD COLUMN razrjad REAL DEFAULT 0')

  safeRun('ALTER TABLE material_catalog ADD COLUMN external_id TEXT')
  safeRun('ALTER TABLE material_catalog ADD COLUMN price_est REAL DEFAULT 0')
  safeRun('ALTER TABLE material_catalog ADD COLUMN coeff REAL DEFAULT 1.0')
  safeRun('ALTER TABLE material_catalog ADD COLUMN group_id TEXT')

  // Clear existing
  db.run('DELETE FROM work_materials')
  db.run('DELETE FROM work_catalog')
  db.run('DELETE FROM material_catalog')
  db.run('DELETE FROM work_sections')
  db.run('DELETE FROM regions')

  // Insert sections
  if (catalog.sections && Array.isArray(catalog.sections)) {
    catalog.sections.forEach(s => {
      db.run(
        'INSERT INTO work_sections (external_id, name, parent_external_id, path, level, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
        [s.id || s.external_id || '', s.name || '', s.parent_id || s.parent_external_id || null, s.path || '', s.level || 0, s.sort_order || 0]
      )
    })
  }

  // Insert works
  const workIdMap = new Map()
  if (catalog.works && Array.isArray(catalog.works)) {
    catalog.works.forEach(w => {
      const labor = w.labor_price ?? w.price ?? 0
      const material = w.material_price ?? 0
      const price = w.price ?? (labor + material)
      db.run(
        `INSERT INTO work_catalog (
          external_id, code, name, unit, price, labor_price, material_price,
          category, section_id, price_fakt, price_est, coeff, trudozatrats, razrjad
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          w.id || w.external_id || '',
          w.code || '',
          w.name || '',
          w.unit || 'шт.',
          price || 0,
          labor || 0,
          material || 0,
          w.category || '',
          w.section_id || null,
          w.price_fakt ?? labor ?? 0,
          w.price_est ?? 0,
          w.coeff ?? w.koeff ?? 1,
          w.trudozatrats ?? 0,
          w.razrjad ?? 0
        ]
      )
      const id = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0]
      const ext = w.id || w.external_id || w.code
      if (ext) workIdMap.set(String(ext), id)
    })
  }

  // Insert materials
  const materialIdMap = new Map()
  if (catalog.materials && Array.isArray(catalog.materials)) {
    catalog.materials.forEach(m => {
      db.run(
        'INSERT INTO material_catalog (external_id, code, name, unit, price, price_est, coeff, group_name, group_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          m.id || m.external_id || '',
          m.code || '',
          m.name || '',
          m.unit || 'шт.',
          m.price ?? m.price_fakt ?? 0,
          m.price_est ?? 0,
          m.coeff ?? m.koeff ?? 1,
          m.group || m.group_name || '',
          m.group_id || null
        ]
      )
      const id = db.exec('SELECT last_insert_rowid() as id')[0].values[0][0]
      const ext = m.id || m.external_id || m.code
      if (ext) materialIdMap.set(String(ext), id)
    })
  }

  // Insert work-material links
  if (catalog.work_materials && Array.isArray(catalog.work_materials)) {
    catalog.work_materials.forEach(link => {
      const wId = workIdMap.get(String(link.work_id || link.workId || link.work))
      const mId = materialIdMap.get(String(link.material_id || link.materialId || link.material))
      if (!wId || !mId) return
      db.run(
        'INSERT INTO work_materials (work_id, material_id, norm, formula, sort_order) VALUES (?, ?, ?, ?, ?)',
        [wId, mId, link.norm ?? link.norma ?? 0, link.formula || link.kol_formula || null, link.sort_order || link.order || 0]
      )
    })
  }

  // Insert regions
  const regions = Array.isArray(regionsData) ? regionsData : (regionsData && regionsData.regions ? regionsData.regions : [])
  regions.forEach(r => {
    if (!r || !r.name) return
    db.run('INSERT INTO regions (name, coefficient) VALUES (?, ?)', [r.name, r.coefficient || 1])
  })

  // Save DB
  const data = db.export()
  fs.writeFileSync(dbPath, Buffer.from(data))
  console.log('OK: reimported catalog/regions into', dbPath)
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
