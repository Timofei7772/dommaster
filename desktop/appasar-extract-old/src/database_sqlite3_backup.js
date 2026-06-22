const initSqlJs = require('sql.js')
const path = require('path')
const { app } = require('electron')
const fs = require('fs')

let db = null

// Начальные данные справочника работ
const INITIAL_WORKS = [
    // Электрика
    { code: "ЭЛ-030", name: "Штробление под провода в бетоне", unit: "м.п.", price: 450, category: "Электрика" },
    { code: "ЭЛ-031", name: "Штробление под провода в кирпиче", unit: "м.п.", price: 320, category: "Электрика" },
    { code: "ЭЛ-032", name: "Прокладка кабеля в кабель-канале", unit: "м.п.", price: 280, category: "Электрика" },
    { code: "ЭЛ-033", name: "Установка подрозетника (бетон)", unit: "шт.", price: 350, category: "Электрика" },
    { code: "ЭЛ-035", name: "Монтаж розетки/выключателя", unit: "шт.", price: 200, category: "Электрика" },
    // Вентиляция
    { code: "ПР-030", name: "Монтаж кондиционера сплит-системы", unit: "шт.", price: 8500, category: "Вентиляция" },
    { code: "ПР-031", name: "Монтаж мульти-сплит системы", unit: "шт.", price: 15000, category: "Вентиляция" },
    // Сантехника
    { code: "ПР-032", name: "Замена радиатора отопления", unit: "шт.", price: 4500, category: "Сантехника" },
    { code: "САН-001", name: "Разводка труб водоснабжения (точка)", unit: "шт.", price: 2500, category: "Сантехника" },
    { code: "САН-002", name: "Установка инсталляции унитаза", unit: "шт.", price: 4500, category: "Сантехника" },
    // Отделка
    { code: "ОТД-001", name: "Грунтовка стен (1 слой)", unit: "м2", price: 80, category: "Стены" },
    { code: "ОТД-002", name: "Шпаклевка стен под обои (2 слоя)", unit: "м2", price: 350, category: "Стены" },
    { code: "ОТД-003", name: "Поклейка обоев (винил/флизелин)", unit: "м2", price: 400, category: "Стены" },
    { code: "ОТД-005", name: "Укладка ламината + подложка", unit: "м2", price: 450, category: "Полы" }
]

function getDataPath() {
    return app.getPath('userData')
}

function getDbPath() {
    return path.join(getDataPath(), 'smeta_zaru.db')
}

// Сохранение базы на диск
function saveDatabase() {
    if (db) {
        const data = db.export()
        const buffer = Buffer.from(data)
        fs.writeFileSync(getDbPath(), buffer)
    }
}

// Автосохранение каждые 30 секунд
let saveInterval = null

async function initDatabase() {
    const dbPath = getDbPath()
    const isNew = !fs.existsSync(dbPath)
    console.log('Database path:', dbPath, 'isNew:', isNew)

    const SQL = await initSqlJs()

    if (isNew) {
        db = new SQL.Database()
    } else {
        const fileBuffer = fs.readFileSync(dbPath)
        db = new SQL.Database(fileBuffer)
    }

    // Создаём таблицы
    db.run(`CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        client_name TEXT,
        address TEXT,
        status TEXT DEFAULT 'active',
        folder_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`)

    db.run(`CREATE TABLE IF NOT EXISTS estimates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER,
        name TEXT NOT NULL,
        number TEXT,
        total_cost REAL DEFAULT 0,
        overhead_percent REAL DEFAULT 0,
        profit_percent REAL DEFAULT 0,
        vat_percent REAL DEFAULT 20,
        status TEXT DEFAULT 'draft',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(project_id) REFERENCES projects(id)
    )`)

    db.run(`CREATE TABLE IF NOT EXISTS estimate_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        estimate_id INTEGER,
        name TEXT NOT NULL,
        unit TEXT DEFAULT 'шт.',
        quantity REAL DEFAULT 1,
        material_price REAL DEFAULT 0,
        labor_price REAL DEFAULT 0,
        justification TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(estimate_id) REFERENCES estimates(id) ON DELETE CASCADE
    )`)

    db.run(`CREATE TABLE IF NOT EXISTS contracts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER,
        estimate_id INTEGER,
        number TEXT,
        date TEXT,
        client TEXT,
        client_type TEXT DEFAULT 'individual',
        contractor TEXT,
        subject TEXT,
        amount REAL DEFAULT 0,
        prepayment_percent REAL DEFAULT 30,
        status TEXT DEFAULT 'draft',
        file_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(project_id) REFERENCES projects(id)
    )`)

    db.run(`CREATE TABLE IF NOT EXISTS ks2_acts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER,
        estimate_id INTEGER,
        number TEXT,
        date TEXT,
        period_from TEXT,
        period_to TEXT,
        amount REAL DEFAULT 0,
        status TEXT DEFAULT 'draft',
        file_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`)

    db.run(`CREATE TABLE IF NOT EXISTS ks3_certs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER,
        number TEXT,
        date TEXT,
        period_from TEXT,
        period_to TEXT,
        amount REAL DEFAULT 0,
        status TEXT DEFAULT 'draft',
        file_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`)

    db.run(`CREATE TABLE IF NOT EXISTS m29_docs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER,
        number TEXT,
        date TEXT,
        status TEXT DEFAULT 'draft',
        file_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`)

    db.run(`CREATE TABLE IF NOT EXISTS work_catalog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT,
        name TEXT NOT NULL,
        unit TEXT,
        price REAL DEFAULT 0,
        category TEXT
    )`)

    db.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )`)

    // Инициализация начальных данных
    if (isNew) {
        const stmt = db.prepare("INSERT INTO work_catalog (code, name, unit, price, category) VALUES (?, ?, ?, ?, ?)")
        INITIAL_WORKS.forEach(w => {
            stmt.run([w.code, w.name, w.unit, w.price, w.category])
        })
        stmt.free()
        console.log('Database seeded with initial works')
    }

    // Сохраняем БД
    saveDatabase()

    // Запускаем автосохранение
    saveInterval = setInterval(saveDatabase, 30000)

    return db
}

function closeDatabase() {
    if (saveInterval) {
        clearInterval(saveInterval)
        saveInterval = null
    }
    if (db) {
        saveDatabase()
        db.close()
        db = null
    }
}

// Вспомогательная функция: получить все строки
function dbAll(sql, params = []) {
    const stmt = db.prepare(sql)
    stmt.bind(params)
    const rows = []
    while (stmt.step()) {
        rows.push(stmt.getAsObject())
    }
    stmt.free()
    return rows
}

// Вспомогательная функция: получить одну строку
function dbGet(sql, params = []) {
    const rows = dbAll(sql, params)
    return rows[0] || null
}

// Вспомогательная функция: выполнить запрос
function dbRun(sql, params = []) {
    db.run(sql, params)
    saveDatabase()
    return { lastID: db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0] || 0 }
}

// === ПРОЕКТЫ ===
const getProjects = () => Promise.resolve(dbAll("SELECT * FROM projects ORDER BY created_at DESC"))
const getProject = (id) => Promise.resolve(dbGet("SELECT * FROM projects WHERE id = ?", [id]))

const createProject = (data) => {
    const { name, client_name, address, status } = data
    db.run(
        "INSERT INTO projects (name, client_name, address, status) VALUES (?, ?, ?, ?)",
        [name, client_name || '', address || '', status || 'active']
    )
    saveDatabase()
    const lastId = db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0] || 0
    return Promise.resolve({ id: lastId, folder_path: getDataPath() })
}

const updateProject = (id, data) => {
    const fields = [], values = []
    Object.entries(data).forEach(([k, v]) => { if (v !== undefined) { fields.push(`${k} = ?`); values.push(v) } })
    if (fields.length === 0) return Promise.resolve()
    values.push(id)
    db.run(`UPDATE projects SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, values)
    saveDatabase()
    return Promise.resolve()
}

const deleteProject = (id) => {
    db.run("DELETE FROM projects WHERE id = ?", [id])
    saveDatabase()
    return Promise.resolve()
}

// === СМЕТЫ ===
const getEstimates = (projectId) => {
    const query = projectId
        ? "SELECT e.*, p.name as project_name FROM estimates e LEFT JOIN projects p ON e.project_id = p.id WHERE e.project_id = ? ORDER BY e.created_at DESC"
        : "SELECT e.*, p.name as project_name FROM estimates e LEFT JOIN projects p ON e.project_id = p.id ORDER BY e.created_at DESC"
    return Promise.resolve(dbAll(query, projectId ? [projectId] : []))
}

const getEstimate = (id) => Promise.resolve(
    dbGet("SELECT e.*, p.name as project_name FROM estimates e LEFT JOIN projects p ON e.project_id = p.id WHERE e.id = ?", [id])
)

const createEstimate = (data) => {
    const { project_id, name, number, status } = data
    db.run(
        "INSERT INTO estimates (project_id, name, number, status) VALUES (?, ?, ?, ?)",
        [project_id || null, name, number || '', status || 'draft']
    )
    saveDatabase()
    const lastId = db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0] || 0
    return Promise.resolve({ id: lastId })
}

const updateEstimate = (id, data) => {
    const fields = [], values = []
    Object.entries(data).forEach(([k, v]) => { if (v !== undefined) { fields.push(`${k} = ?`); values.push(v) } })
    if (fields.length === 0) return Promise.resolve()
    values.push(id)
    db.run(`UPDATE estimates SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, values)
    saveDatabase()
    return Promise.resolve()
}

const deleteEstimate = (id) => {
    db.run("DELETE FROM estimates WHERE id = ?", [id])
    saveDatabase()
    return Promise.resolve()
}

// === ПОЗИЦИИ СМЕТЫ ===
const getEstimateItems = (estimateId) => {
    const rows = dbAll("SELECT * FROM estimate_items WHERE estimate_id = ? ORDER BY sort_order, id", [estimateId])
    return Promise.resolve(rows.map(r => ({
        ...r,
        materials_total: (r.material_price || 0) * (r.quantity || 0),
        labor_total: (r.labor_price || 0) * (r.quantity || 0),
        total: ((r.material_price || 0) + (r.labor_price || 0)) * (r.quantity || 0)
    })))
}

const createEstimateItem = (data) => {
    const { estimate_id, name, unit, quantity, materials_cost, labor_cost, code } = data
    db.run(
        "INSERT INTO estimate_items (estimate_id, name, unit, quantity, material_price, labor_price, justification) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [estimate_id, name, unit || 'шт.', quantity || 1, materials_cost || 0, labor_cost || 0, code || '']
    )
    saveDatabase()
    const lastId = db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0] || 0
    recalculateEstimate(estimate_id)
    return Promise.resolve({ id: lastId })
}

const updateEstimateItem = (id, data) => {
    const row = dbGet("SELECT estimate_id FROM estimate_items WHERE id = ?", [id])

    const fields = [], values = []
    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name) }
    if (data.unit !== undefined) { fields.push('unit = ?'); values.push(data.unit) }
    if (data.quantity !== undefined) { fields.push('quantity = ?'); values.push(data.quantity) }
    if (data.materials_cost !== undefined) { fields.push('material_price = ?'); values.push(data.materials_cost) }
    if (data.labor_cost !== undefined) { fields.push('labor_price = ?'); values.push(data.labor_cost) }
    if (data.code !== undefined) { fields.push('justification = ?'); values.push(data.code) }

    if (fields.length === 0) return Promise.resolve()
    values.push(id)

    db.run(`UPDATE estimate_items SET ${fields.join(', ')} WHERE id = ?`, values)
    saveDatabase()
    if (row?.estimate_id) recalculateEstimate(row.estimate_id)
    return Promise.resolve()
}

const deleteEstimateItem = (id) => {
    const row = dbGet("SELECT estimate_id FROM estimate_items WHERE id = ?", [id])
    db.run("DELETE FROM estimate_items WHERE id = ?", [id])
    saveDatabase()
    if (row?.estimate_id) recalculateEstimate(row.estimate_id)
    return Promise.resolve({ success: true })
}

const recalculateEstimate = (estimateId) => {
    const row = dbGet(
        "SELECT SUM((material_price + labor_price) * quantity) as total FROM estimate_items WHERE estimate_id = ?",
        [estimateId]
    )
    if (row) {
        db.run("UPDATE estimates SET total_cost = ? WHERE id = ?", [row.total || 0, estimateId])
        saveDatabase()
    }
}

// === ДОГОВОРЫ ===
const getContracts = (projectId) => {
    const query = projectId
        ? "SELECT * FROM contracts WHERE project_id = ? ORDER BY created_at DESC"
        : "SELECT * FROM contracts ORDER BY created_at DESC"
    return Promise.resolve(dbAll(query, projectId ? [projectId] : []))
}

const getContract = (id) => Promise.resolve(dbGet("SELECT * FROM contracts WHERE id = ?", [id]))

const createContract = (data) => {
    const cols = Object.keys(data).filter(k => data[k] !== undefined)
    const vals = cols.map(k => data[k])
    db.run(
        `INSERT INTO contracts (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        vals
    )
    saveDatabase()
    const lastId = db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0] || 0
    return Promise.resolve({ id: lastId })
}

const updateContract = (id, data) => {
    const fields = [], values = []
    Object.entries(data).forEach(([k, v]) => { if (v !== undefined) { fields.push(`${k} = ?`); values.push(v) } })
    if (fields.length === 0) return Promise.resolve()
    values.push(id)
    db.run(`UPDATE contracts SET ${fields.join(', ')} WHERE id = ?`, values)
    saveDatabase()
    return Promise.resolve()
}

const deleteContract = (id) => {
    db.run("DELETE FROM contracts WHERE id = ?", [id])
    saveDatabase()
    return Promise.resolve()
}

// === КС-2 ===
const getKS2Acts = (projectId) => {
    const q = projectId ? "SELECT * FROM ks2_acts WHERE project_id = ?" : "SELECT * FROM ks2_acts"
    return Promise.resolve(dbAll(q, projectId ? [projectId] : []))
}

const createKS2Act = (data) => {
    const cols = Object.keys(data).filter(k => data[k] !== undefined)
    const vals = cols.map(k => data[k])
    db.run(`INSERT INTO ks2_acts (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, vals)
    saveDatabase()
    const lastId = db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0] || 0
    return Promise.resolve({ id: lastId })
}

const deleteKS2Act = (id) => {
    db.run("DELETE FROM ks2_acts WHERE id = ?", [id])
    saveDatabase()
    return Promise.resolve()
}

// === КС-3 ===
const getKS3Certs = (projectId) => {
    const q = projectId ? "SELECT * FROM ks3_certs WHERE project_id = ?" : "SELECT * FROM ks3_certs"
    return Promise.resolve(dbAll(q, projectId ? [projectId] : []))
}

const createKS3Cert = (data) => {
    const cols = Object.keys(data).filter(k => data[k] !== undefined)
    const vals = cols.map(k => data[k])
    db.run(`INSERT INTO ks3_certs (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, vals)
    saveDatabase()
    const lastId = db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0] || 0
    return Promise.resolve({ id: lastId })
}

const deleteKS3Cert = (id) => {
    db.run("DELETE FROM ks3_certs WHERE id = ?", [id])
    saveDatabase()
    return Promise.resolve()
}

// === М-29 ===
const getM29Docs = (projectId) => {
    const q = projectId ? "SELECT * FROM m29_docs WHERE project_id = ?" : "SELECT * FROM m29_docs"
    return Promise.resolve(dbAll(q, projectId ? [projectId] : []))
}

const createM29Doc = (data) => {
    const cols = Object.keys(data).filter(k => data[k] !== undefined)
    const vals = cols.map(k => data[k])
    db.run(`INSERT INTO m29_docs (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, vals)
    saveDatabase()
    const lastId = db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0] || 0
    return Promise.resolve({ id: lastId })
}

// === СПРАВОЧНИК ===
const searchReferenceWorks = (search) => {
    let q = "SELECT * FROM work_catalog"
    let params = []
    if (search) {
        q += " WHERE name LIKE ? OR code LIKE ? OR category LIKE ?"
        const term = `%${search}%`
        params = [term, term, term]
    }
    q += " ORDER BY category, name LIMIT 50"
    return Promise.resolve(dbAll(q, params))
}

// === НАСТРОЙКИ ===
const getSetting = (key) => {
    const row = dbGet("SELECT value FROM settings WHERE key = ?", [key])
    return Promise.resolve(row?.value || null)
}

const setSetting = (key, value) => {
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, value])
    saveDatabase()
    return Promise.resolve()
}

const getAllSettings = () => {
    const rows = dbAll("SELECT key, value FROM settings")
    const settings = {}
    rows.forEach(r => { settings[r.key] = r.value })
    return Promise.resolve(settings)
}

module.exports = {
    initDatabase,
    closeDatabase,
    getDataPath,
    saveDatabase,
    // Проекты
    getProjects, getProject, createProject, updateProject, deleteProject,
    // Сметы
    getEstimates, getEstimate, createEstimate, updateEstimate, deleteEstimate,
    // Позиции
    getEstimateItems, createEstimateItem, updateEstimateItem, deleteEstimateItem,
    // Договоры
    getContracts, getContract, createContract, updateContract, deleteContract,
    // КС-2
    getKS2Acts, createKS2Act, deleteKS2Act,
    // КС-3
    getKS3Certs, createKS3Cert, deleteKS3Cert,
    // М-29
    getM29Docs, createM29Doc,
    // Справочник
    searchReferenceWorks,
    // Настройки
    getSetting, setSetting, getAllSettings
}
