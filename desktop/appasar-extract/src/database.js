/**
 * ZARU Смета - База данных (sql.js)
 * Использует sql.js для работы с SQLite в памяти с сохранением в файл
 */

const path = require('path')
const fs = require('fs')
const { app } = require('electron')

let db = null
let dbPath = null
let saveInterval = null
let isDirty = false  // Флаг изменений для оптимизации сохранения
const BACKUP_RETENTION = 20
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000

// Получить путь к данным
function getDataPath() {
    return app.getPath('userData')
}

function ensureBackupDir() {
    const backupsDir = path.join(getDataPath(), 'backups')
    if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir, { recursive: true })
    }
    return backupsDir
}

function listBackups() {
    const dir = ensureBackupDir()
    const files = fs.readdirSync(dir)
        .filter(f => f.endsWith('.db'))
        .map(f => {
            const full = path.join(dir, f)
            const stat = fs.statSync(full)
            return { path: full, mtimeMs: stat.mtimeMs }
        })
        .sort((a, b) => b.mtimeMs - a.mtimeMs)
    return files
}

function pruneBackups() {
    const backups = listBackups()
    backups.slice(BACKUP_RETENTION).forEach(b => {
        try { fs.unlinkSync(b.path) } catch (e) { }
    })
}

function createBackupIfNeeded() {
    if (!dbPath || !fs.existsSync(dbPath)) return null
    const backups = listBackups()
    if (backups.length && (Date.now() - backups[0].mtimeMs) < BACKUP_INTERVAL_MS) {
        return backups[0].path
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = path.join(ensureBackupDir(), `smeta_zaru_${stamp}.db`)
    try {
        fs.copyFileSync(dbPath, backupPath)
        pruneBackups()
        return backupPath
    } catch (e) {
        console.error('Ошибка создания резервной копии БД:', e)
        return null
    }
}

// Инициализация базы данных
async function initDatabase() {
    const initSqlJs = require('sql.js')
    const SQL = await initSqlJs()
    dbPath = path.join(getDataPath(), 'smeta_zaru.db')


    // Загрузить существующую БД или создать новую
    if (fs.existsSync(dbPath)) {
        const buffer = fs.readFileSync(dbPath)
        db = new SQL.Database(buffer)
    } else {
        db = new SQL.Database()
    }

    // Резервная копия при запуске (не чаще 1 раза в сутки)
    createBackupIfNeeded()

    // Создать таблицы
    createTables()
    markDirty()

    // Запуск автосохранения каждые 30 секунд
    startAutoSave()

    return db
}

function createTables() {
    // Проекты
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

    // Сметы
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

    // Миграция: Добавляем поля client_name, address и file_path если их нет
    try { db.run("ALTER TABLE estimates ADD COLUMN client_name TEXT") } catch (e) { }
    try { db.run("ALTER TABLE estimates ADD COLUMN address TEXT") } catch (e) { }
    try { db.run("ALTER TABLE estimates ADD COLUMN file_path TEXT") } catch (e) { }
    // Миграция: тип сметы и источник дефектовки
    try { db.run("ALTER TABLE estimates ADD COLUMN estimate_type TEXT DEFAULT 'local'") } catch (e) { }
    try { db.run("ALTER TABLE estimates ADD COLUMN source_defect_id INTEGER") } catch (e) { }
    // Добавляем поля для расчёта НДС и суммарных значений
    try { db.run("ALTER TABLE estimates ADD COLUMN total_materials REAL DEFAULT 0") } catch (e) { }
    try { db.run("ALTER TABLE estimates ADD COLUMN total_labor REAL DEFAULT 0") } catch (e) { }
    try { db.run("ALTER TABLE estimates ADD COLUMN subtotal REAL DEFAULT 0") } catch (e) { }
    try { db.run("ALTER TABLE estimates ADD COLUMN overhead_amount REAL DEFAULT 0") } catch (e) { }
    try { db.run("ALTER TABLE estimates ADD COLUMN profit_amount REAL DEFAULT 0") } catch (e) { }
    try { db.run("ALTER TABLE estimates ADD COLUMN vat_cost REAL DEFAULT 0") } catch (e) { }
    try { db.run("ALTER TABLE estimates ADD COLUMN total_with_vat REAL DEFAULT 0") } catch (e) { }

    // Позиции сметы
    db.run(`CREATE TABLE IF NOT EXISTS estimate_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    estimate_id INTEGER,
    section_id INTEGER,
    name TEXT NOT NULL,
    unit TEXT DEFAULT 'шт.',
    quantity REAL DEFAULT 1,
    material_price REAL DEFAULT 0,
    labor_price REAL DEFAULT 0,
    justification TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(estimate_id) REFERENCES estimates(id) ON DELETE CASCADE,
    FOREIGN KEY(section_id) REFERENCES estimate_sections(id) ON DELETE SET NULL
  )`)

    // Миграция: добавить section_id если его нет
    try { db.run("ALTER TABLE estimate_items ADD COLUMN section_id INTEGER") } catch (e) { }

    // Миграции для полей ZARU AI смета
    try { db.run("ALTER TABLE estimate_items ADD COLUMN row_type TEXT DEFAULT 'rascenka'") } catch (e) { }
    try { db.run("ALTER TABLE estimate_items ADD COLUMN price_fact REAL DEFAULT 0") } catch (e) { }
    try { db.run("ALTER TABLE estimate_items ADD COLUMN price_smeta REAL DEFAULT 0") } catch (e) { }
    try { db.run("ALTER TABLE estimate_items ADD COLUMN parent_item_id INTEGER") } catch (e) { }
    try { db.run("ALTER TABLE estimate_items ADD COLUMN sum_fact REAL DEFAULT 0") } catch (e) { }
    try { db.run("ALTER TABLE estimate_items ADD COLUMN sum_smeta REAL DEFAULT 0") } catch (e) { }

    // Договоры
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)

    // КС-2
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
    client_name TEXT,
    client_address TEXT,
    contractor_name TEXT,
    contractor_address TEXT,
    object_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)

    // Миграции КС-2
    try { db.run("ALTER TABLE ks2_acts ADD COLUMN client_name TEXT") } catch (e) { }
    try { db.run("ALTER TABLE ks2_acts ADD COLUMN client_address TEXT") } catch (e) { }
    try { db.run("ALTER TABLE ks2_acts ADD COLUMN contractor_name TEXT") } catch (e) { }
    try { db.run("ALTER TABLE ks2_acts ADD COLUMN contractor_address TEXT") } catch (e) { }
    try { db.run("ALTER TABLE ks2_acts ADD COLUMN object_name TEXT") } catch (e) { }

    // Миграции contracts - дополнительные поля для заказчика и сроков
    try { db.run("ALTER TABLE contracts ADD COLUMN client_name TEXT") } catch (e) { }
    try { db.run("ALTER TABLE contracts ADD COLUMN client_address TEXT") } catch (e) { }
    try { db.run("ALTER TABLE contracts ADD COLUMN client_passport TEXT") } catch (e) { }
    try { db.run("ALTER TABLE contracts ADD COLUMN client_passport_issued TEXT") } catch (e) { }
    try { db.run("ALTER TABLE contracts ADD COLUMN client_passport_code TEXT") } catch (e) { }
    try { db.run("ALTER TABLE contracts ADD COLUMN client_inn TEXT") } catch (e) { }
    try { db.run("ALTER TABLE contracts ADD COLUMN client_phone TEXT") } catch (e) { }
    try { db.run("ALTER TABLE contracts ADD COLUMN client_email TEXT") } catch (e) { }
    try { db.run("ALTER TABLE contracts ADD COLUMN start_date TEXT") } catch (e) { }
    try { db.run("ALTER TABLE contracts ADD COLUMN end_date TEXT") } catch (e) { }

    // КС-3
    db.run(`CREATE TABLE IF NOT EXISTS ks3_certs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER,
    ks2_act_id INTEGER,
    number TEXT,
    date TEXT,
    period_from TEXT,
    period_to TEXT,
    amount_without_vat REAL DEFAULT 0,
    vat_amount REAL DEFAULT 0,
    amount REAL DEFAULT 0,
    total_without_vat REAL DEFAULT 0,
    total_vat REAL DEFAULT 0,
    total_with_vat REAL DEFAULT 0,
    status TEXT DEFAULT 'draft',
    file_path TEXT,
    client_name TEXT,
    client_address TEXT,
    contractor_name TEXT,
    contractor_address TEXT,
    object_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)

    // Миграции КС-3
    try { db.run("ALTER TABLE ks3_certs ADD COLUMN client_name TEXT") } catch (e) { }
    try { db.run("ALTER TABLE ks3_certs ADD COLUMN client_address TEXT") } catch (e) { }
    try { db.run("ALTER TABLE ks3_certs ADD COLUMN contractor_name TEXT") } catch (e) { }
    try { db.run("ALTER TABLE ks3_certs ADD COLUMN contractor_address TEXT") } catch (e) { }
    try { db.run("ALTER TABLE ks3_certs ADD COLUMN object_name TEXT") } catch (e) { }

    // М-29
    db.run(`CREATE TABLE IF NOT EXISTS m29_docs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER,
    estimate_id INTEGER,
    number TEXT,
    date TEXT,
    status TEXT DEFAULT 'draft',
    object_name TEXT,
    total_amount REAL DEFAULT 0,
    total_norm_cost REAL DEFAULT 0,
    total_actual_cost REAL DEFAULT 0,
    total_deviation REAL DEFAULT 0,
    file_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)

    // Миграции М-29
    try { db.run("ALTER TABLE m29_docs ADD COLUMN estimate_id INTEGER") } catch (e) { }
    try { db.run("ALTER TABLE m29_docs ADD COLUMN object_name TEXT") } catch (e) { }
    try { db.run("ALTER TABLE m29_docs ADD COLUMN total_amount REAL DEFAULT 0") } catch (e) { }
    try { db.run("ALTER TABLE m29_docs ADD COLUMN total_norm_cost REAL DEFAULT 0") } catch (e) { }
    try { db.run("ALTER TABLE m29_docs ADD COLUMN total_actual_cost REAL DEFAULT 0") } catch (e) { }
    try { db.run("ALTER TABLE m29_docs ADD COLUMN total_deviation REAL DEFAULT 0") } catch (e) { }

    // === ZARU AI смета: Коэффициенты ===
    db.run(`CREATE TABLE IF NOT EXISTS coefficients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    estimate_id INTEGER,
    work_coef REAL DEFAULT 1.8,
    material_coef REAL DEFAULT 1.04,
    overhead_coef REAL DEFAULT 1.0,
    profit_coef REAL DEFAULT 1.0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(estimate_id) REFERENCES estimates(id) ON DELETE CASCADE
  )`)

    // === ZARU AI смета: Разделы сметы ===
    db.run(`CREATE TABLE IF NOT EXISTS estimate_sections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    estimate_id INTEGER,
    parent_section_id INTEGER,
    name TEXT NOT NULL,
    code TEXT,
    level INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    FOREIGN KEY(estimate_id) REFERENCES estimates(id) ON DELETE CASCADE
  )`)

    // === ZARU AI смета: Шаблоны ===
    db.run(`CREATE TABLE IF NOT EXISTS estimate_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT,
    template_data TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)

    // === ZARU AI смета: Сценарии маржи ===
    db.run(`CREATE TABLE IF NOT EXISTS margin_scenarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    estimate_id INTEGER,
    name TEXT NOT NULL,
    work_coef_override REAL,
    material_coef_override REAL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(estimate_id) REFERENCES estimates(id) ON DELETE CASCADE
  )`)

    // Настройки
    db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`)

    // === Миграции для estimate_items (дополнительные поля) ===
    try { db.run("ALTER TABLE estimate_items ADD COLUMN catalog_item_id INTEGER") } catch (e) { }
    try { db.run("ALTER TABLE estimate_items ADD COLUMN quantity_expr TEXT") } catch (e) { }
    try { db.run("ALTER TABLE estimate_items ADD COLUMN coeff_expr TEXT") } catch (e) { }
    try { db.run("ALTER TABLE estimate_items ADD COLUMN supplier_url TEXT") } catch (e) { }

    // === Миграции для ks3_certs (КС-3) ===
    try { db.run("ALTER TABLE ks3_certs ADD COLUMN ks2_act_id INTEGER") } catch (e) { }
    try { db.run("ALTER TABLE ks3_certs ADD COLUMN amount_without_vat REAL DEFAULT 0") } catch (e) { }
    try { db.run("ALTER TABLE ks3_certs ADD COLUMN vat_amount REAL DEFAULT 0") } catch (e) { }
    try { db.run("ALTER TABLE ks3_certs ADD COLUMN total_without_vat REAL DEFAULT 0") } catch (e) { }
    try { db.run("ALTER TABLE ks3_certs ADD COLUMN total_vat REAL DEFAULT 0") } catch (e) { }
    try { db.run("ALTER TABLE ks3_certs ADD COLUMN total_with_vat REAL DEFAULT 0") } catch (e) { }

    // === ZARU AI смета: Накопительный учёт КС-2 ===
    db.run(`CREATE TABLE IF NOT EXISTS ks2_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ks2_id INTEGER NOT NULL,
      estimate_item_id INTEGER NOT NULL,
      quantity_closed REAL DEFAULT 0,
      amount_closed REAL DEFAULT 0,
      FOREIGN KEY (ks2_id) REFERENCES ks2_acts(id) ON DELETE CASCADE,
      FOREIGN KEY (estimate_item_id) REFERENCES estimate_items(id) ON DELETE CASCADE
    )`)

    // === ZARU AI смета: Ведомость ФОТ ===
    db.run(`CREATE TABLE IF NOT EXISTS fot_sheets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      estimate_id INTEGER NOT NULL,
      number TEXT,
      date TEXT,
      total_amount REAL DEFAULT 0,
      file_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (estimate_id) REFERENCES estimates(id) ON DELETE CASCADE
    )`)

    // === ZARU AI смета: Список ресурсов ===
    db.run(`CREATE TABLE IF NOT EXISTS resource_lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      estimate_id INTEGER NOT NULL,
      number TEXT,
      date TEXT,
      file_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (estimate_id) REFERENCES estimates(id) ON DELETE CASCADE
    )`)
}

function saveDatabase() {
    if (db && dbPath) {
        try {
            const data = db.export()
            const buffer = Buffer.from(data)
            fs.writeFileSync(dbPath, buffer)
            isDirty = false
        } catch (error) {
            console.error('Error saving database:', error)
        }
    }
}

// Пометить базу как изменённую
function markDirty() {
    isDirty = true
}

// Автосохранение каждые 30 секунд (если есть изменения)
function startAutoSave() {
    if (saveInterval) clearInterval(saveInterval)
    saveInterval = setInterval(() => {
        if (isDirty) {
            saveDatabase()
        }
    }, 30000)  // 30 секунд
}

function stopAutoSave() {
    if (saveInterval) {
        clearInterval(saveInterval)
        saveInterval = null
    }
}

function closeDatabase() {
    stopAutoSave()
    saveDatabase()  // Гарантированное сохранение при закрытии
    if (db) {
        db.close()
        db = null
    }
}

// === ПРОЕКТЫ ===
function getProjects() {
    const result = db.exec("SELECT * FROM projects ORDER BY created_at DESC")
    return result.length ? rowsToObjects(result[0]) : []
}

function getProject(id) {
    const result = db.exec("SELECT * FROM projects WHERE id = ?", [id])
    return result.length ? rowsToObjects(result[0])[0] : null
}

function createProject(data) {
    const { name, client_name, address, status } = data
    db.run("INSERT INTO projects (name, client_name, address, status) VALUES (?, ?, ?, ?)",
        [name, client_name || '', address || '', status || 'active'])
    markDirty()
    const id = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0]
    return { id, folder_path: getDataPath() }
}

function updateProject(id, data) {
    const fields = [], values = []
    Object.entries(data).forEach(([k, v]) => { if (v !== undefined) { fields.push(`${k} = ?`); values.push(v) } })
    if (fields.length === 0) return
    values.push(id)
    db.run(`UPDATE projects SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, values)
    markDirty()
}

function deleteProject(id) {
    db.run("DELETE FROM projects WHERE id = ?", [id])
    markDirty()
}

// === СМЕТЫ ===
function getEstimates(projectId) {
    const query = projectId
        ? "SELECT e.*, p.name as project_name FROM estimates e LEFT JOIN projects p ON e.project_id = p.id WHERE e.project_id = ? ORDER BY e.created_at DESC"
        : "SELECT e.*, p.name as project_name FROM estimates e LEFT JOIN projects p ON e.project_id = p.id ORDER BY e.created_at DESC"
    const result = db.exec(query, projectId ? [projectId] : [])
    return result.length ? rowsToObjects(result[0]) : []
}

function getEstimate(id) {
    const result = db.exec("SELECT e.*, p.name as project_name FROM estimates e LEFT JOIN projects p ON e.project_id = p.id WHERE e.id = ?", [id])
    return result.length ? rowsToObjects(result[0])[0] : null
}

function createEstimate(data) {
    const {
        project_id,
        name,
        number,
        status,
        client_name,
        address,
        overhead_percent,
        profit_percent,
        vat_percent,
        estimate_type,
        source_defect_id
    } = data

    try {
        db.run(
            `INSERT INTO estimates (
                project_id, name, number, status, client_name, address,
                overhead_percent, profit_percent, vat_percent,
                estimate_type, source_defect_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                project_id || null,
                name,
                number || '',
                status || 'draft',
                client_name || '',
                address || '',
                overhead_percent ?? 0,
                profit_percent ?? 0,
                vat_percent ?? 20,
                estimate_type || 'local',
                source_defect_id || null
            ]
        )

        // sql.js: получаем ID через SELECT MAX или через rowid
        const id = db.exec("SELECT MAX(id) as id FROM estimates")[0]?.values[0]?.[0] || 0

        markDirty()
        saveDatabase()  // Немедленное сохранение при создании сметы
        return { id }
    } catch (error) {
        console.error('createEstimate error:', error)
        throw error
    }
}

function updateEstimate(id, data) {
    const fields = [], values = []
    Object.entries(data).forEach(([k, v]) => { if (v !== undefined) { fields.push(`${k} = ?`); values.push(v) } })
    if (fields.length === 0) return
    values.push(id)
    db.run(`UPDATE estimates SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, values)
    markDirty()
    saveDatabase()  // Немедленное сохранение при обновлении сметы
}

function deleteEstimate(id) {
    db.run("DELETE FROM estimates WHERE id = ?", [id])
    markDirty()
}

// === КОНВЕРТАЦИЯ ДЕФЕКТОВКИ В СМЕТУ ===
function convertDefectToEstimate(defectId, options = {}) {
    try {
        const defect = getEstimate(defectId)
        if (!defect) {
            return { success: false, error: 'Дефектовка не найдена' }
        }

        const targetName = options?.name || defect.name || 'Смета из дефектовки'
        const targetNumber = options?.number || defect.number || ''

        // Создаём новую смету
        const created = createEstimate({
            project_id: defect.project_id || null,
            name: targetName,
            number: targetNumber,
            estimate_type: 'local',
            status: 'draft',
            overhead_percent: defect.overhead_percent,
            profit_percent: defect.profit_percent,
            vat_percent: defect.vat_percent,
            client_name: defect.client_name,
            address: defect.address,
            source_defect_id: defectId
        })

        const newEstimateId = created?.id

        // Копируем разделы
        const sectionsResult = db.exec(
            "SELECT * FROM estimate_sections WHERE estimate_id = ? ORDER BY level, sort_order",
            [defectId]
        )
        const sections = sectionsResult.length ? rowsToObjects(sectionsResult[0]) : []
        const sectionMap = new Map()

        sections.forEach(section => {
            const newParentId = section.parent_section_id
                ? (sectionMap.get(section.parent_section_id) || null)
                : null
            const createdSection = createEstimateSection({
                estimate_id: newEstimateId,
                parent_section_id: newParentId,
                name: section.name,
                code: section.code,
                level: section.level,
                sort_order: section.sort_order
            })
            sectionMap.set(section.id, createdSection.id)
        })

        // Копируем позиции
        const itemsResult = db.exec(
            "SELECT * FROM estimate_items WHERE estimate_id = ? ORDER BY sort_order, id",
            [defectId]
        )
        const items = itemsResult.length ? rowsToObjects(itemsResult[0]) : []
        const itemMap = new Map()
        const pendingParents = []

        items.forEach((item, index) => {
            const newSectionId = item.section_id ? (sectionMap.get(item.section_id) || null) : null
            const qty = item.quantity || 0
            const rawRowType = item.row_type || 'rascenka'
            const normalizedRowType = rawRowType === 'work'
                ? 'rascenka'
                : (['rascenka', 'material', 'mechanism', 'comment'].includes(rawRowType) ? rawRowType : 'rascenka')

            let materialPrice = item.material_price || 0
            let laborPrice = item.labor_price || 0
            if (materialPrice === 0 && laborPrice === 0 && item.price_smeta) {
                if (normalizedRowType === 'material' || normalizedRowType === 'mechanism') {
                    materialPrice = item.price_smeta
                } else {
                    laborPrice = item.price_smeta
                }
            }

            const priceSmeta = item.price_smeta || (
                (normalizedRowType === 'material' || normalizedRowType === 'mechanism')
                    ? materialPrice
                    : laborPrice
            )
            const sumFact = item.sum_fact || ((item.price_fact || 0) * qty)
            const sumSmeta = item.sum_smeta || (priceSmeta * qty)

            db.run(
                `INSERT INTO estimate_items (
                    estimate_id, section_id, name, unit, quantity,
                    material_price, labor_price, justification, sort_order,
                    row_type, price_fact, price_smeta, parent_item_id,
                    sum_fact, sum_smeta, catalog_item_id, quantity_expr, coeff_expr, supplier_url
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    newEstimateId,
                    newSectionId,
                    item.name,
                    item.unit || 'шт.',
                    qty,
                    materialPrice,
                    laborPrice,
                    item.justification || '',
                    item.sort_order ?? index,
                    normalizedRowType,
                    item.price_fact || 0,
                    priceSmeta,
                    null,
                    sumFact,
                    sumSmeta,
                    item.catalog_item_id || null,
                    item.quantity_expr || null,
                    item.coeff_expr || null,
                    item.supplier_url || null
                ]
            )

            const newItemId = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0]
            itemMap.set(item.id, newItemId)

            if (item.parent_item_id) {
                pendingParents.push({ newItemId, oldParentId: item.parent_item_id })
            }
        })

        // Восстанавливаем связи parent_item_id после вставки
        pendingParents.forEach(({ newItemId, oldParentId }) => {
            const mappedParentId = itemMap.get(oldParentId)
            if (mappedParentId) {
                db.run(
                    "UPDATE estimate_items SET parent_item_id = ? WHERE id = ?",
                    [mappedParentId, newItemId]
                )
            }
        })

        // Копируем коэффициенты, если есть
        const coefResult = db.exec("SELECT * FROM coefficients WHERE estimate_id = ?", [defectId])
        if (coefResult.length && coefResult[0].values.length) {
            const coef = rowsToObjects(coefResult[0])[0]
            db.run(
                "INSERT INTO coefficients (estimate_id, work_coef, material_coef, overhead_coef, profit_coef) VALUES (?, ?, ?, ?, ?)",
                [
                    newEstimateId,
                    coef.work_coef || 1.8,
                    coef.material_coef || 1.04,
                    coef.overhead_coef || 1.0,
                    coef.profit_coef || 1.0
                ]
            )
        }

        markDirty()
        recalculateEstimate(newEstimateId)
        saveDatabase()

        return { success: true, data: { id: newEstimateId } }
    } catch (error) {
        console.error('convertDefectToEstimate error:', error)
        return { success: false, error: error.message || 'Ошибка конвертации' }
    }
}

// === ПОЗИЦИИ СМЕТЫ ===
// === ПОЗИЦИИ СМЕТЫ (ZARU AI смета STRUCTURE) ===
function getEstimateItems(estimateId) {
    const result = db.exec("SELECT * FROM estimate_items WHERE estimate_id = ? ORDER BY sort_order, id", [estimateId])
    if (!result.length) return []
    return rowsToObjects(result[0]).map(r => {
        // Логика расчета для разных типов строк
        const isLabor = r.row_type === 'rascenka' || !r.row_type
        const isMaterial = r.row_type === 'material'

        // Для обратной совместимости вычисляем старые поля из новых
        const calculatedLabor = isLabor ? (r.sum_smeta || (r.price_smeta || r.labor_price || 0) * (r.quantity || 0)) : 0
        const calculatedMaterial = isMaterial ? (r.sum_smeta || (r.price_smeta || r.material_price || 0) * (r.quantity || 0)) : 0
        const total = r.sum_smeta || (calculatedLabor + calculatedMaterial)

        return {
            ...r,
            // Новые поля ZARU AI смета
            row_type: r.row_type || 'rascenka',
            price_fact: r.price_fact || 0,
            price_smeta: r.price_smeta || (isLabor ? r.labor_price : r.material_price) || 0,
            sum_fact: r.sum_fact || ((r.price_fact || 0) * (r.quantity || 0)),
            sum_smeta: total,
            // Поля для обратной совместимости (frontend items list)
            materials_total: calculatedMaterial,
            labor_total: calculatedLabor,
            total: total
        }
    })
}

// === Формулы (KolFormula / KoeffFormula) ===
function normalizeFormula(expr) {
    if (expr === null || expr === undefined) return ''
    let text = String(expr).trim()
    // заменяем запятую как десятичный разделитель
    text = text.replace(/(\d),(?=\d)/g, '$1.')
    // типографские операторы
    text = text.replace(/[×]/g, '*').replace(/[÷]/g, '/').replace(/:/g, '/')
    return text
}

function tokenizeFormula(expr) {
    const tokens = []
    const text = normalizeFormula(expr)
    let i = 0
    while (i < text.length) {
        const ch = text[i]
        if (/\s/.test(ch)) { i++; continue }
        if (/[0-9.]/.test(ch)) {
            let num = ch
            i++
            while (i < text.length && /[0-9.]/.test(text[i])) {
                num += text[i]
                i++
            }
            if ((num.match(/\./g) || []).length > 1) {
                throw new Error(`Некорректное число в формуле: ${num}`)
            }
            tokens.push({ type: 'number', value: parseFloat(num) })
            continue
        }
        if (/[A-Za-zА-Яа-яЁё_]/.test(ch)) {
            let id = ch
            i++
            while (i < text.length && /[A-Za-zА-Яа-яЁё0-9_]/.test(text[i])) {
                id += text[i]
                i++
            }
            tokens.push({ type: 'identifier', value: id })
            continue
        }
        if ('+-*/^()'.includes(ch)) {
            tokens.push({ type: 'operator', value: ch })
            i++
            continue
        }
        if (ch === ',' || ch === ';') {
            tokens.push({ type: 'comma', value: ch })
            i++
            continue
        }
        throw new Error(`Недопустимый символ в формуле: "${ch}"`)
    }
    return tokens
}

function toRpn(tokens) {
    const output = []
    const stack = []
    const prec = { 'u+': 4, 'u-': 4, '^': 3, '*': 2, '/': 2, '+': 1, '-': 1 }
    const rightAssoc = { '^': true, 'u+': true, 'u-': true }
    let prev = null

    for (let idx = 0; idx < tokens.length; idx++) {
        const token = tokens[idx]
        if (token.type === 'number') {
            output.push(token)
            prev = 'number'
            continue
        }
        if (token.type === 'identifier') {
            const next = tokens[idx + 1]
            if (next && next.type === 'operator' && next.value === '(') {
                stack.push({ type: 'func', value: token.value })
            } else {
                output.push(token)
            }
            prev = 'identifier'
            continue
        }
        if (token.type === 'comma') {
            while (stack.length && !(stack[stack.length - 1].type === 'operator' && stack[stack.length - 1].value === '(')) {
                output.push(stack.pop())
            }
            if (!stack.length) {
                throw new Error('Ошибка формулы: лишняя запятая')
            }
            prev = 'comma'
            continue
        }
        if (token.type === 'operator' && token.value === '(') {
            stack.push(token)
            prev = '('
            continue
        }
        if (token.type === 'operator' && token.value === ')') {
            while (stack.length && !(stack[stack.length - 1].type === 'operator' && stack[stack.length - 1].value === '(')) {
                output.push(stack.pop())
            }
            if (!stack.length) throw new Error('Ошибка формулы: нет открывающей скобки')
            stack.pop() // remove '('
            if (stack.length && stack[stack.length - 1].type === 'func') {
                output.push(stack.pop())
            }
            prev = ')'
            continue
        }
        if (token.type === 'operator') {
            let op = token.value
            const isUnary = (prev === null || prev === 'operator' || prev === '(' || prev === 'comma')
            if ((op === '+' || op === '-') && isUnary) {
                op = op === '+' ? 'u+' : 'u-'
            }
            while (stack.length) {
                const top = stack[stack.length - 1]
                if (top.type !== 'operator') break
                const topOp = top.value
                if (topOp === '(') break
                const p1 = prec[op] ?? 0
                const p2 = prec[topOp] ?? 0
                if ((rightAssoc[op] && p1 < p2) || (!rightAssoc[op] && p1 <= p2)) {
                    output.push(stack.pop())
                } else {
                    break
                }
            }
            stack.push({ type: 'operator', value: op })
            prev = 'operator'
            continue
        }
    }

    while (stack.length) {
        const t = stack.pop()
        if (t.type === 'operator' && (t.value === '(' || t.value === ')')) {
            throw new Error('Ошибка формулы: несогласованные скобки')
        }
        output.push(t)
    }
    return output
}

function evaluateFormula(expr, variables = {}) {
    if (expr === null || expr === undefined || String(expr).trim() === '') return 0
    const tokens = tokenizeFormula(expr)
    const rpn = toRpn(tokens)

    const vars = {}
    Object.entries(variables || {}).forEach(([k, v]) => {
        vars[String(k).toLowerCase()] = Number(v)
    })
    const constants = { pi: Math.PI, e: Math.E }
    const funcs = {
        min: (a, b) => Math.min(a, b),
        max: (a, b) => Math.max(a, b),
        abs: (a) => Math.abs(a),
        ceil: (a) => Math.ceil(a),
        floor: (a) => Math.floor(a),
        round: (a) => Math.round(a),
        sqrt: (a) => Math.sqrt(a),
        pow: (a, b) => Math.pow(a, b)
    }
    const arity = { min: 2, max: 2, abs: 1, ceil: 1, floor: 1, round: 1, sqrt: 1, pow: 2 }

    const stack = []
    for (const token of rpn) {
        if (token.type === 'number') {
            stack.push(token.value)
            continue
        }
        if (token.type === 'identifier') {
            const key = token.value.toLowerCase()
            if (vars.hasOwnProperty(key)) {
                stack.push(vars[key])
            } else if (constants.hasOwnProperty(key)) {
                stack.push(constants[key])
            } else {
                throw new Error(`Неизвестная переменная: ${token.value}`)
            }
            continue
        }
        if (token.type === 'func') {
            const name = token.value.toLowerCase()
            if (!funcs[name]) throw new Error(`Неизвестная функция: ${token.value}`)
            const n = arity[name]
            if (stack.length < n) throw new Error(`Недостаточно аргументов для функции ${token.value}`)
            const args = stack.splice(stack.length - n, n)
            stack.push(funcs[name](...args))
            continue
        }
        if (token.type === 'operator') {
            const op = token.value
            if (op === 'u+' || op === 'u-') {
                if (!stack.length) throw new Error('Ошибка формулы: пустой унарный оператор')
                const v = stack.pop()
                stack.push(op === 'u-' ? -v : v)
                continue
            }
            if (stack.length < 2) throw new Error('Ошибка формулы: недостаточно операндов')
            const b = stack.pop()
            const a = stack.pop()
            switch (op) {
                case '+': stack.push(a + b); break
                case '-': stack.push(a - b); break
                case '*': stack.push(a * b); break
                case '/': stack.push(b === 0 ? 0 : (a / b)); break
                case '^': stack.push(Math.pow(a, b)); break
                default: throw new Error(`Неизвестный оператор: ${op}`)
            }
            continue
        }
    }
    if (stack.length !== 1) throw new Error('Ошибка формулы: неверное выражение')
    const result = stack[0]
    if (!Number.isFinite(result)) throw new Error('Ошибка формулы: результат не число')
    return result
}

function createEstimateItem(data) {
    const {
        estimate_id, name, unit, quantity,
        materials_cost, labor_cost, code,
        row_type, price_fact, price_smeta, parent_item_id, sum_fact, sum_smeta,
        section_id, sort_order, catalog_item_id, quantity_expr, coeff_expr, variables
    } = data

    // ===== ВАЛИДАЦИЯ ВХОДНЫХ ДАННЫХ =====
    if (!estimate_id) throw new Error('estimate_id обязателен')
    if (!name || name.trim().length === 0) throw new Error('Название позиции обязательно')
    if (name.length > 500) throw new Error('Название слишком длинное (максимум 500 символов)')

    let qty = quantity || 1
    const vars = (variables && typeof variables === 'object') ? variables : {}
    if (quantity_expr) {
        qty = evaluateFormula(quantity_expr, vars)
    }
    if (coeff_expr) {
        const coeff = evaluateFormula(coeff_expr, vars)
        qty = qty * coeff
    }
    if (qty <= 0) throw new Error(`Количество должно быть положительным (текущее значение: ${qty})`)
    if (qty > 10000) throw new Error('Количество слишком большое (максимум 10000)')

    const mat_price = materials_cost || 0
    const lab_price = labor_cost || 0

    if (mat_price < 0) throw new Error(`Цена материалов не может быть отрицательной (текущее значение: ${mat_price})`)
    if (lab_price < 0) throw new Error(`Цена труда не может быть отрицательной (текущее значение: ${lab_price})`)
    if (mat_price > 1000000) throw new Error('Цена материалов слишком большая (максимум 1,000,000)')
    if (lab_price > 1000000) throw new Error('Цена труда слишком большая (максимум 1,000,000)')

    // Определяем тип
    const type = row_type || 'rascenka'
    if (!['rascenka', 'material', 'mechanism', 'comment'].includes(type)) {
        throw new Error(`Неверный тип позиции: ${type}`)
    }

    const p_fact = price_fact || 0
    const p_smeta = price_smeta || (mat_price + lab_price)

    // Вычисляем суммы сразу
    const s_fact = sum_fact || (p_fact * qty)
    const s_smeta = sum_smeta || (p_smeta * qty)

    try {
        db.run(
            `INSERT INTO estimate_items (
                estimate_id, name, unit, quantity, 
                material_price, labor_price, justification,
                row_type, price_fact, price_smeta, parent_item_id,
                sum_fact, sum_smeta, section_id, sort_order,
                catalog_item_id, quantity_expr, coeff_expr
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                estimate_id, name, unit || 'шт.', qty,
                mat_price, lab_price, code || '',
                type, p_fact, p_smeta, parent_item_id || null,
                s_fact, s_smeta, section_id || null, sort_order || 0,
                catalog_item_id || null, quantity_expr || null, coeff_expr || null
            ]
        )
        markDirty()
        const id = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0]
        recalculateEstimate(estimate_id)
        saveDatabase()  // Сохранение после добавления позиции
        return { id }
    } catch (error) {
        console.error('Error creating estimate item:', error)
        throw error
    }
}

function updateEstimateItem(id, data) {
    // Получаем estimate_id и текущие данные
    const itemResult = db.exec("SELECT * FROM estimate_items WHERE id = ?", [id])
    if (!itemResult.length) throw new Error(`Позиция с ID ${id} не найдена`)

    const currentItem = rowsToObjects(itemResult[0])[0]
    const estimateId = currentItem.estimate_id
    const vars = (data.variables && typeof data.variables === 'object') ? data.variables : {}

    // Если пришли формулы, вычисляем количество
    let exprQty = null
    let exprCoeff = null
    if (data.quantity_expr !== undefined) {
        exprQty = data.quantity_expr ? evaluateFormula(data.quantity_expr, vars) : null
    }
    if (data.coeff_expr !== undefined) {
        exprCoeff = data.coeff_expr ? evaluateFormula(data.coeff_expr, vars) : null
    }
    if (data.quantity_expr !== undefined || data.coeff_expr !== undefined) {
        const baseQty = (data.quantity_expr !== undefined)
            ? (exprQty !== null ? exprQty : (data.quantity ?? currentItem.quantity))
            : (data.quantity !== undefined ? data.quantity : currentItem.quantity)
        const coeff = (data.coeff_expr !== undefined)
            ? (exprCoeff !== null ? exprCoeff : 1)
            : 1
        data.quantity = baseQty * coeff
    }

    // ===== ВАЛИДАЦИЯ ВХОДНЫХ ДАННЫХ =====
    if (data.name !== undefined) {
        if (!data.name || data.name.trim().length === 0) throw new Error('Название позиции не может быть пустым')
        if (data.name.length > 500) throw new Error('Название слишком длинное (максимум 500 символов)')
    }

    if (data.quantity !== undefined) {
        if (data.quantity <= 0) throw new Error(`Количество должно быть положительным (текущее значение: ${data.quantity})`)
        if (data.quantity > 10000) throw new Error('Количество слишком большое (максимум 10000)')
    }

    const incomingMaterial = data.materials_cost !== undefined ? data.materials_cost : data.material_price
    if (incomingMaterial !== undefined) {
        if (incomingMaterial < 0) throw new Error(`Цена материалов не может быть отрицательной (текущее значение: ${incomingMaterial})`)
        if (incomingMaterial > 1000000) throw new Error('Цена материалов слишком большая (максимум 1,000,000)')
    }

    const incomingLabor = data.labor_cost !== undefined ? data.labor_cost : data.labor_price
    if (incomingLabor !== undefined) {
        if (incomingLabor < 0) throw new Error(`Цена труда не может быть отрицательной (текущее значение: ${incomingLabor})`)
        if (incomingLabor > 1000000) throw new Error('Цена труда слишком большая (максимум 1,000,000)')
    }

    if (data.price_fact !== undefined && data.price_fact < 0) {
        throw new Error(`price_fact не может быть отрицательной`)
    }
    if (data.price_smeta !== undefined && data.price_smeta < 0) {
        throw new Error(`price_smeta не может быть отрицательной`)
    }

    const fields = [], values = []

    // Обновляем поля, если переданы
    const keys = ['name', 'unit', 'quantity', 'row_type', 'price_fact', 'price_smeta', 'sum_fact', 'sum_smeta', 'parent_item_id', 'justification', 'section_id', 'sort_order', 'quantity_expr', 'coeff_expr', 'catalog_item_id']

    const rowType = data.row_type || currentItem.row_type || 'rascenka'
    const hasMaterialPrice = data.materials_cost !== undefined || data.material_price !== undefined
    const hasLaborPrice = data.labor_cost !== undefined || data.labor_price !== undefined
    const newMaterialPrice = hasMaterialPrice ? (data.materials_cost ?? data.material_price ?? 0) : (currentItem.material_price || 0)
    const newLaborPrice = hasLaborPrice ? (data.labor_cost ?? data.labor_price ?? 0) : (currentItem.labor_price || 0)

    // Обновляем базовые цены материалов/работ (для локальных смет)
    if (hasMaterialPrice) { fields.push('material_price = ?'); values.push(newMaterialPrice) }
    if (hasLaborPrice) { fields.push('labor_price = ?'); values.push(newLaborPrice) }

    // Маппинг старых полей на новые
    if (data.code !== undefined) data.justification = data.code

    // Пересчет сумм, если изменились количество или цена
    let newQty = data.quantity !== undefined ? data.quantity : currentItem.quantity
    let newPriceFact = data.price_fact !== undefined ? data.price_fact : currentItem.price_fact
    let newPriceSmeta = data.price_smeta !== undefined ? data.price_smeta : currentItem.price_smeta
    const shouldRecalcPriceSmeta = data.price_smeta === undefined && (hasMaterialPrice || hasLaborPrice || data.row_type !== undefined || newPriceSmeta === undefined || newPriceSmeta === null)
    if (shouldRecalcPriceSmeta) {
        newPriceSmeta = (rowType === 'material' || rowType === 'mechanism') ? newMaterialPrice : newLaborPrice
        data.price_smeta = newPriceSmeta
    }

    if (data.quantity !== undefined || data.price_fact !== undefined) {
        data.sum_fact = newQty * newPriceFact
    }
    if (data.quantity !== undefined || data.price_smeta !== undefined || shouldRecalcPriceSmeta) {
        data.sum_smeta = newQty * newPriceSmeta
    }

    Object.entries(data).forEach(([k, v]) => {
        if (v !== undefined && keys.includes(k)) {
            fields.push(`${k} = ?`); values.push(v)
        }
    })

    if (fields.length === 0) return

    values.push(id)

    db.run(`UPDATE estimate_items SET ${fields.join(', ')} WHERE id = ?`, values)
    markDirty()

    if (estimateId) recalculateEstimate(estimateId)
    saveDatabase()  // Сохранение после обновления позиции
}

function deleteEstimateItem(id) {
    const itemResult = db.exec("SELECT estimate_id FROM estimate_items WHERE id = ?", [id])
    const estimateId = itemResult.length ? itemResult[0].values[0][0] : null

    db.run("DELETE FROM estimate_items WHERE id = ?", [id])
    markDirty()

    if (estimateId) recalculateEstimate(estimateId)
    saveDatabase()  // Сохранение после удаления позиции
    return { success: true }
}

/**
 * ПРАВИЛЬНЫЙ РАСЧЕТ СМЕТЫ - по спецификации SPECIFICATION_ESTIMATE_WORKFLOW.md
 * 
 * ЛОГИКА:
 * 1. Материалы базовые (БЕЗ коэффициента) = SUM(material_price × qty)
 * 2. Работы базовые (БЕЗ коэффициента) = SUM(labor_price × qty)
 * 3. Материалы с коэффициентом = базовые_материалы × material_coef
 * 4. Работы с коэффициентом = базовые_работы × work_coef
 * 5. Подитог = материалы_с_коэф + работы_с_коэф
 * 6. Накладные = подитог × overhead_percent
 * 7. Прибыль = (подитог + накладные) × profit_percent
 * 8. Сумма БЕЗ НДС = подитог + накладные + прибыль
 * 9. НДС = сумма_без_НДС × vat_percent (если vat_enabled)
 * 10. ИТОГО С НДС = сумма_без_НДС + НДС
 */
function recalculateEstimate(estimateId) {
    const estimateResult = db.exec("SELECT * FROM estimates WHERE id = ?", [estimateId])
    if (!estimateResult.length) return

    const estimate = rowsToObjects(estimateResult[0])[0]

    // Получаем коэффициенты сметы (по умолчанию: материалы 1.04, работы 1.8)
    let material_coef = 1.04  // +4% на материалы
    let work_coef = 1.8       // +80% на работы (типичная надбавка)

    // Попробуем получить из таблицы коэффициентов если есть
    try {
        const coef = getCoefficients(estimateId)
        if (coef) {
            material_coef = coef.material_coef || 1.04
            work_coef = coef.work_coef || 1.8
        }
    } catch (e) {
        // Если таблица коэффициентов не существует, используем умолчания
    }

    // Получаем все позиции сметы
    const itemsResult = db.exec("SELECT * FROM estimate_items WHERE estimate_id = ?", [estimateId])

    // ===== ИНИЦИАЛИЗАЦИЯ ПЕРЕМЕННЫХ РАСЧЕТА =====
    let total_materials_base = 0   // Базовые материалы (без коэффициента)
    let total_labor_base = 0       // Базовые работы (без коэффициента)

    // Обработка позиций
    if (itemsResult.length && itemsResult[0].values.length) {
        const items = rowsToObjects(itemsResult[0])

        items.forEach(item => {
            // Пропускаем комментарии и пустые строки
            if (!item.name || item.name.trim() === '') return

            const qty = parseFloat(item.quantity) || 0
            if (qty <= 0) return  // Пропускаем нулевые позиции

            const mat_price = parseFloat(item.material_price) || 0
            const lab_price = parseFloat(item.labor_price) || 0

            // ШАГИ 1-2: Базовые суммы БЕЗ коэффициентов
            total_materials_base += mat_price * qty
            total_labor_base += lab_price * qty
        })
    }

    // ===== РАСЧЕТЫ ПО СПЕЦИФИКАЦИИ =====

    // ШАГИ 3-4: Применяем коэффициенты
    const total_materials_with_coef = total_materials_base * material_coef
    const total_labor_with_coef = total_labor_base * work_coef

    // ШАГ 5: Подитог с коэффициентами
    const subtotal_with_coef = total_materials_with_coef + total_labor_with_coef

    // ШАГ 6: Накладные расходы (% от подитога с коэффициентами)
    const overhead_percent = parseFloat(estimate.overhead_percent) || 0
    const overhead_amount = subtotal_with_coef * (overhead_percent / 100)

    // ШАГ 7: Прибыль подрядчика (% от подитога + накладные)
    const profit_percent = parseFloat(estimate.profit_percent) || 0
    const profit_amount = (subtotal_with_coef + overhead_amount) * (profit_percent / 100)

    // ШАГ 8: Сумма БЕЗ НДС
    const total_cost = subtotal_with_coef + overhead_amount + profit_amount

    // ШАГ 9: НДС (применяется только если vat_enabled = true или vat_percent > 0)
    // ⚠️ ВАЖНО: НДС считается от суммы БЕЗ НДС!
    const vat_percent_value = parseFloat(estimate.vat_percent) || 0
    const vat_cost = total_cost * (vat_percent_value / 100)

    // ШАГ 10: ИТОГО С НДС
    const total_with_vat = total_cost + vat_cost

    // ===== ОБНОВЛЯЕМ СМЕТЫ В БД =====
    db.run(
        `UPDATE estimates SET 
         total_materials = ?, 
         total_labor = ?,
         subtotal = ?,
         overhead_amount = ?,
         profit_amount = ?,
         total_cost = ?,
         vat_cost = ?,
         total_with_vat = ?
         WHERE id = ?`,
        [
            Math.round(total_materials_base * 100) / 100,  // Базовые материалы
            Math.round(total_labor_base * 100) / 100,      // Базовые работы
            Math.round(subtotal_with_coef * 100) / 100,    // С коэффициентами
            Math.round(overhead_amount * 100) / 100,       // Накладные
            Math.round(profit_amount * 100) / 100,         // Прибыль
            Math.round(total_cost * 100) / 100,            // БЕЗ НДС
            Math.round(vat_cost * 100) / 100,              // НДС
            Math.round(total_with_vat * 100) / 100,        // С НДС
            estimateId
        ]
    )

    markDirty()
}

// === ДОГОВОРЫ ===
function getContracts(projectId) {
    const query = projectId
        ? "SELECT * FROM contracts WHERE project_id = ? ORDER BY created_at DESC"
        : "SELECT * FROM contracts ORDER BY created_at DESC"
    const result = db.exec(query, projectId ? [projectId] : [])
    return result.length ? rowsToObjects(result[0]) : []
}

function getContract(id) {
    const result = db.exec("SELECT * FROM contracts WHERE id = ?", [id])
    return result.length ? rowsToObjects(result[0])[0] : null
}

function createContract(data) {
    const cols = Object.keys(data).filter(k => data[k] !== undefined)
    const vals = cols.map(k => data[k])
    db.run(`INSERT INTO contracts (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, vals)
    markDirty()
    const id = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0]
    return { id }
}

function updateContract(id, data) {
    const fields = [], values = []
    Object.entries(data).forEach(([k, v]) => { if (v !== undefined) { fields.push(`${k} = ?`); values.push(v) } })
    if (fields.length === 0) return
    values.push(id)
    db.run(`UPDATE contracts SET ${fields.join(', ')} WHERE id = ?`, values)
    markDirty()
}

function deleteContract(id) {
    db.run("DELETE FROM contracts WHERE id = ?", [id])
    markDirty()
}

// === КС-2 ===
function getKS2Acts(projectId) {
    const query = projectId ? "SELECT * FROM ks2_acts WHERE project_id = ?" : "SELECT * FROM ks2_acts"
    const result = db.exec(query, projectId ? [projectId] : [])
    return result.length ? rowsToObjects(result[0]) : []
}

function createKS2Act(data) {
    const cols = Object.keys(data).filter(k => data[k] !== undefined)
    const vals = cols.map(k => data[k])
    db.run(`INSERT INTO ks2_acts (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, vals)
    markDirty()
    const id = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0]
    return { id }
}

function deleteKS2Act(id) {
    db.run("DELETE FROM ks2_acts WHERE id = ?", [id])
    markDirty()
}

// === КС-3 ===
function getKS3Certs(projectId) {
    const query = projectId ? "SELECT * FROM ks3_certs WHERE project_id = ?" : "SELECT * FROM ks3_certs"
    const result = db.exec(query, projectId ? [projectId] : [])
    return result.length ? rowsToObjects(result[0]) : []
}

function createKS3Cert(data) {
    const cols = Object.keys(data).filter(k => data[k] !== undefined)
    const vals = cols.map(k => data[k])
    db.run(`INSERT INTO ks3_certs (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, vals)
    markDirty()
    const id = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0]
    return { id }
}

function deleteKS3Cert(id) {
    db.run("DELETE FROM ks3_certs WHERE id = ?", [id])
    markDirty()
}

// === ZARU AI смета: КС-2 ПОЗИЦИИ (Накопительный учёт) ===
function getKS2Items(ks2Id) {
    const result = db.exec("SELECT * FROM ks2_items WHERE ks2_id = ?", [ks2Id])
    return result.length ? rowsToObjects(result[0]) : []
}

function createKS2Item(data) {
    const cols = Object.keys(data).filter(k => data[k] !== undefined)
    const vals = cols.map(k => data[k])
    db.run(`INSERT INTO ks2_items (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, vals)
    markDirty()
}

function createKS2Items(ks2Id, items) {
    // Получаем КС-2 акт чтобы знать estimate_id
    const ks2Result = db.exec("SELECT estimate_id FROM ks2_acts WHERE id = ?", [ks2Id])
    const estimateId = ks2Result.length ? ks2Result[0].values[0][0] : null

    // Рассчитываем остатки (без текущего акта) для валидации
    const remainderMap = {}
    if (estimateId) {
        const estItems = getEstimateItems(estimateId)
        const ks2Acts = db.exec(
            "SELECT id FROM ks2_acts WHERE estimate_id = ? AND id != ?",
            [estimateId, ks2Id]
        )
        const ks2Ids = ks2Acts.length ? ks2Acts[0].values.map(r => r[0]) : []
        const closedMap = {}
        ks2Ids.forEach(id => {
            getKS2Items(id).forEach(k => {
                closedMap[k.estimate_item_id] = (closedMap[k.estimate_item_id] || 0) + (k.quantity_closed || 0)
            })
        })
        estItems.forEach(i => {
            remainderMap[i.id] = Math.max(0, i.quantity - (closedMap[i.id] || 0))
        })
    }

    items.forEach(item => {
        const maxAllowed = remainderMap[item.estimate_item_id]
        const qtyClosed = (maxAllowed !== undefined)
            ? Math.min(item.quantity_closed, maxAllowed)
            : item.quantity_closed

        // Пересчитываем amount_closed пропорционально, если количество было скорректировано
        let amountClosed = item.amount_closed
        if (maxAllowed !== undefined && item.quantity_closed > 0 && qtyClosed !== item.quantity_closed) {
            amountClosed = item.amount_closed * (qtyClosed / item.quantity_closed)
        }

        if (qtyClosed > 0) {
            db.run(
                "INSERT INTO ks2_items (ks2_id, estimate_item_id, quantity_closed, amount_closed) VALUES (?, ?, ?, ?)",
                [ks2Id, item.estimate_item_id, qtyClosed, amountClosed]
            )
        }
    })
    markDirty()
}

function deleteKS2Item(id) {
    db.run("DELETE FROM ks2_items WHERE id = ?", [id])
    markDirty()
}

/**
 * ZARU AI смета: Расчёт остатков для накопительного КС-2
 * Возвращает позиции сметы с quantity_remaining = total - закрыто во всех предыдущих актах
 */
function getKS2Remainder(estimateId) {
    // Получаем все позиции сметы
    const items = getEstimateItems(estimateId)

    // Получаем все КС-2 для этой сметы
    const ks2Acts = db.exec(
        "SELECT id FROM ks2_acts WHERE estimate_id = ?",
        [estimateId]
    )
    const ks2Ids = ks2Acts.length ? ks2Acts[0].values.map(r => r[0]) : []

    // Получаем все закрытые позиции из всех КС-2
    const closedItems = []
    ks2Ids.forEach(ks2Id => {
        const items = getKS2Items(ks2Id)
        closedItems.push(...items)
    })

    // Рассчитываем остатки
    return items.map(item => {
        const closed = closedItems
            .filter(k => k.estimate_item_id === item.id)
            .reduce((sum, k) => sum + (k.quantity_closed || 0), 0)
        const closedAmount = closedItems
            .filter(k => k.estimate_item_id === item.id)
            .reduce((sum, k) => sum + (k.amount_closed || 0), 0)

        return {
            ...item,
            quantity_total: item.quantity,
            quantity_closed: closed,
            quantity_remaining: Math.max(0, item.quantity - closed),
            amount_closed: closedAmount
        }
    }).filter(item => item.quantity_remaining > 0)
}

// === ZARU AI смета: Ведомость ФОТ ===
function createFOTSheet(estimateId) {
    const items = getEstimateItems(estimateId)
    // Только расценки (работы), сметные цены с коэффициентами
    const workItems = items.filter(i => i.row_type === 'rascenka' || !i.row_type)
    const totalFOT = workItems.reduce((sum, i) => sum + (i.sum_smeta || (i.price_smeta || i.labor_price || 0) * (i.quantity || 0)), 0)

    const date = new Date().toISOString().split('T')[0]
    db.run(
        "INSERT INTO fot_sheets (estimate_id, date, total_amount) VALUES (?, ?, ?)",
        [estimateId, date, totalFOT]
    )
    markDirty()
    const id = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0]
    return { id, items: workItems, total: totalFOT }
}

function getFOTSheets(estimateId) {
    const result = db.exec("SELECT * FROM fot_sheets WHERE estimate_id = ?", [estimateId])
    return result.length ? rowsToObjects(result[0]) : []
}

// === ZARU AI смета: Список ресурсов (сводка материалов) ===
function getResourceSummary(estimateId) {
    const items = getEstimateItems(estimateId)
    // Только материалы
    const materials = items.filter(i => i.row_type === 'material')

    // Группировка по названию
    const grouped = {}
    materials.forEach(m => {
        const key = m.name
        if (!grouped[key]) {
            grouped[key] = {
                name: m.name,
                unit: m.unit,
                quantity: 0,
                price_fact: m.price_fact || m.material_price || 0,
                sum_fact: 0,
                supplier_url: m.supplier_url
            }
        }
        grouped[key].quantity += m.quantity || 0
        grouped[key].sum_fact += m.sum_fact || ((m.price_fact || m.material_price || 0) * (m.quantity || 0))
    })

    return Object.values(grouped)
}

// === М-29 ===
function getM29Docs(projectId) {
    const query = projectId ? "SELECT * FROM m29_docs WHERE project_id = ?" : "SELECT * FROM m29_docs"
    const result = db.exec(query, projectId ? [projectId] : [])
    return result.length ? rowsToObjects(result[0]) : []
}

function createM29Doc(data) {
    const cols = Object.keys(data).filter(k => data[k] !== undefined)
    const vals = cols.map(k => data[k])
    db.run(`INSERT INTO m29_docs (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, vals)
    markDirty()
    const id = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0]
    return { id }
}

// === НАСТРОЙКИ ===
function getSetting(key) {
    const result = db.exec("SELECT value FROM settings WHERE key = ?", [key])
    return result.length ? result[0].values[0][0] : null
}

function setSetting(key, value) {
    db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, value])
    markDirty()
}

function getAllSettings() {
    const result = db.exec("SELECT key, value FROM settings")
    if (!result.length) return {}
    const settings = {}
    result[0].values.forEach(([k, v]) => { settings[k] = v })
    return settings
}

// === СПРАВОЧНИК РАБОТ ===
function ensureCatalogTables() {
    // Основной каталог работ
    db.run(`CREATE TABLE IF NOT EXISTS work_catalog (
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
    try { db.run("ALTER TABLE work_catalog ADD COLUMN external_id TEXT") } catch (e) { }
    try { db.run("ALTER TABLE work_catalog ADD COLUMN labor_price REAL DEFAULT 0") } catch (e) { }
    try { db.run("ALTER TABLE work_catalog ADD COLUMN material_price REAL DEFAULT 0") } catch (e) { }
    try { db.run("ALTER TABLE work_catalog ADD COLUMN section_id TEXT") } catch (e) { }
    try { db.run("ALTER TABLE work_catalog ADD COLUMN price_fakt REAL DEFAULT 0") } catch (e) { }
    try { db.run("ALTER TABLE work_catalog ADD COLUMN price_est REAL DEFAULT 0") } catch (e) { }
    try { db.run("ALTER TABLE work_catalog ADD COLUMN coeff REAL DEFAULT 1.0") } catch (e) { }
    try { db.run("ALTER TABLE work_catalog ADD COLUMN trudozatrats REAL DEFAULT 0") } catch (e) { }
    try { db.run("ALTER TABLE work_catalog ADD COLUMN razrjad REAL DEFAULT 0") } catch (e) { }

    // Каталог материалов
    db.run(`CREATE TABLE IF NOT EXISTS material_catalog (
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
    try { db.run("ALTER TABLE material_catalog ADD COLUMN external_id TEXT") } catch (e) { }
    try { db.run("ALTER TABLE material_catalog ADD COLUMN price_est REAL DEFAULT 0") } catch (e) { }
    try { db.run("ALTER TABLE material_catalog ADD COLUMN coeff REAL DEFAULT 1.0") } catch (e) { }
    try { db.run("ALTER TABLE material_catalog ADD COLUMN group_id TEXT") } catch (e) { }

    // Связь работ и материалов (нормы)
    db.run(`CREATE TABLE IF NOT EXISTS work_materials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        work_id INTEGER,
        material_id INTEGER,
        norm REAL DEFAULT 0,
        formula TEXT,
        sort_order INTEGER DEFAULT 0,
        FOREIGN KEY(work_id) REFERENCES work_catalog(id) ON DELETE CASCADE,
        FOREIGN KEY(material_id) REFERENCES material_catalog(id) ON DELETE CASCADE
    )`)

    // Разделы прайс-листа
    db.run(`CREATE TABLE IF NOT EXISTS work_sections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_id TEXT,
        name TEXT NOT NULL,
        parent_external_id TEXT,
        path TEXT,
        level INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0
    )`)
}

async function importCatalog() {
    ensureCatalogTables()

    // Проверяем, есть ли уже данные
    const countResult = db.exec("SELECT COUNT(*) FROM work_catalog")
    const count = countResult.length ? countResult[0].values[0][0] : 0

    // Если данных < 10 (например, пустая или почти пустая), пробуем импортировать
    if (count > 10) {
        return { success: true, count: count, message: 'Справочник уже загружен' }
    }

    // Загружаем данные из JSON-файла каталога
    try {
        const baseCandidatePaths = [
            path.join(app.isPackaged
                ? path.join(process.resourcesPath, 'db', 'catalog_rsk.json')
                : path.join(__dirname, '..', 'db', 'catalog_rsk.json')),
            path.join(app.isPackaged
                ? path.join(process.resourcesPath, 'db', 'catalog.json')
                : path.join(__dirname, '..', 'db', 'catalog.json'))
        ]
        let baseCatalogPath = baseCandidatePaths.find(p => fs.existsSync(p))
        const simpleCatalogPath = path.join(app.isPackaged
            ? path.join(process.resourcesPath, 'db', 'catalog_simple.json')
            : path.join(__dirname, '..', 'db', 'catalog_simple.json'))

        if (!baseCatalogPath && fs.existsSync(simpleCatalogPath)) {
            baseCatalogPath = simpleCatalogPath
        }

        if (baseCatalogPath) {
            let catalogData = JSON.parse(fs.readFileSync(baseCatalogPath, 'utf-8'))

            // Если есть простой каталог из Excel — дополним категории/разделы
            if (fs.existsSync(simpleCatalogPath)) {
                try {
                    const simpleData = JSON.parse(fs.readFileSync(simpleCatalogPath, 'utf-8'))
                    const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim()

                    // Merge sections by name
                    const mergedSections = []
                    const sectionByName = new Map()
                    ;(catalogData.sections || []).forEach(s => {
                        const key = norm(s.name)
                        if (!sectionByName.has(key)) {
                            sectionByName.set(key, s)
                            mergedSections.push(s)
                        }
                    })
                    ;(simpleData.sections || []).forEach(s => {
                        const key = norm(s.name)
                        if (!sectionByName.has(key)) {
                            sectionByName.set(key, s)
                            mergedSections.push(s)
                        }
                    })
                    catalogData.sections = mergedSections

                    // Merge works by name
                    const works = catalogData.works || []
                    const workByName = new Map()
                    works.forEach(w => {
                        workByName.set(norm(w.name), w)
                    })
                    ;(simpleData.works || []).forEach(w => {
                        const key = norm(w.name)
                        if (!workByName.has(key)) {
                            works.push(w)
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
                    catalogData.works = works
                } catch (e) {
                    console.error('Ошибка объединения catalog_simple.json:', e)
                }
            }

            let importedCount = 0

            // Импорт разделов (если есть)
            if (catalogData.sections && Array.isArray(catalogData.sections)) {
                catalogData.sections.forEach(section => {
                    db.run(
                        "INSERT INTO work_sections (external_id, name, parent_external_id, path, level, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
                        [
                            section.id || section.external_id || '',
                            section.name || '',
                            section.parent_id || section.parent_external_id || null,
                            section.path || '',
                            section.level || 0,
                            section.sort_order || 0
                        ]
                    )
                })
            }

            // Импорт работ
            if (catalogData.works && Array.isArray(catalogData.works)) {
                const workIdMap = new Map()
                catalogData.works.forEach(work => {
                    const laborPrice = work.labor_price ?? work.price ?? 0
                    const materialPrice = work.material_price ?? 0
                    const totalPrice = (work.price ?? (laborPrice + materialPrice)) || 0
                    db.run(
                        `INSERT INTO work_catalog (
                            external_id, code, name, unit, price, labor_price, material_price,
                            category, section_id, price_fakt, price_est, coeff, trudozatrats, razrjad
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            work.id || work.external_id || '',
                            work.code || '',
                            work.name || '',
                            work.unit || 'шт.',
                            totalPrice,
                            laborPrice,
                            materialPrice,
                            work.category || '',
                            work.section_id || null,
                            work.price_fakt ?? laborPrice,
                            work.price_est ?? work.price_estimate ?? 0,
                            work.coeff ?? work.koeff ?? 1,
                            work.trudozatrats ?? 0,
                            work.razrjad ?? 0
                        ]
                    )
                    const internalId = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0]
                    const extId = work.id || work.external_id || work.code
                    if (extId) workIdMap.set(String(extId), internalId)
                    importedCount++
                })

                // Импорт материалов
                const materialIdMap = new Map()
                if (catalogData.materials && Array.isArray(catalogData.materials)) {
                    catalogData.materials.forEach(mat => {
                        db.run(
                            `INSERT INTO material_catalog (external_id, code, name, unit, price, price_est, coeff, group_name, group_id)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            [
                                mat.id || mat.external_id || '',
                                mat.code || '',
                                mat.name || '',
                                mat.unit || 'шт.',
                                mat.price ?? mat.price_fakt ?? 0,
                                mat.price_est ?? 0,
                                mat.coeff ?? mat.koeff ?? 1,
                                mat.group || mat.group_name || '',
                                mat.group_id || null
                            ]
                        )
                        const internalId = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0]
                        const extId = mat.id || mat.external_id || mat.code
                        if (extId) materialIdMap.set(String(extId), internalId)
                    })
                }

                // Импорт связей работ и материалов
                if (catalogData.work_materials && Array.isArray(catalogData.work_materials)) {
                    catalogData.work_materials.forEach(link => {
                        const wId = workIdMap.get(String(link.work_id || link.workId || link.work))
                        const mId = materialIdMap.get(String(link.material_id || link.materialId || link.material))
                        if (!wId || !mId) return
                        db.run(
                            "INSERT INTO work_materials (work_id, material_id, norm, formula, sort_order) VALUES (?, ?, ?, ?, ?)",
                            [
                                wId,
                                mId,
                                link.norm ?? link.norma ?? 0,
                                link.formula || link.kol_formula || null,
                                link.sort_order || link.order || 0
                            ]
                        )
                    })
                }
            }

            markDirty()
            return { success: true, count: importedCount }
        }
    } catch (err) {
        console.error('Ошибка импорта справочника:', err)
    }

    return { success: true, count: 0 }
}

// === ИМПОРТ РЕГИОНОВ ===
function importRegions() {
    // Создаём таблицу если не существует
    db.run(`CREATE TABLE IF NOT EXISTS regions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        coefficient REAL DEFAULT 1.0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`)

    const countResult = db.exec("SELECT COUNT(*) FROM regions")
    const count = countResult.length ? countResult[0].values[0][0] : 0
    if (count > 0) {
        return { success: true, count }
    }

    try {
        const candidatePaths = [
            path.join(app.isPackaged
                ? path.join(process.resourcesPath, 'db', 'regions.json')
                : path.join(__dirname, '..', 'db', 'regions.json'))
        ]
        const regionsPath = candidatePaths.find(p => fs.existsSync(p))
        if (!regionsPath) {
            return { success: true, count: 0, message: 'regions.json не найден' }
        }
        const data = JSON.parse(fs.readFileSync(regionsPath, 'utf-8'))
        const list = Array.isArray(data) ? data : (data.regions || [])
        let imported = 0
        list.forEach(r => {
            if (!r || !r.name) return
            db.run("INSERT INTO regions (name, coefficient) VALUES (?, ?)", [
                r.name,
                r.coefficient || 1
            ])
            imported++
        })
        markDirty()
        return { success: true, count: imported }
    } catch (e) {
        console.error('Ошибка импорта регионов:', e)
        return { success: false, count: 0 }
    }
}

// Поиск материалов в справочнике
function searchReferenceMaterials(search) {
    let query = "SELECT * FROM material_catalog"
    let params = []

    if (search) {
        query += " WHERE name LIKE ? OR code LIKE ?"
        const term = `%${search}%`
        params = [term, term]
    }
    query += " ORDER BY name"

    const result = db.exec(query, params)
    return result.length ? rowsToObjects(result[0]) : []
}

function searchReferenceWorks(search) {
    let query = "SELECT * FROM work_catalog"
    let params = []

    if (search) {
        query += " WHERE name LIKE ? OR code LIKE ? OR category LIKE ?"
        const term = `%${search}%`
        params = [term, term, term]
    }
    query += " ORDER BY category, name"

    const result = db.exec(query, params)
    return result.length ? rowsToObjects(result[0]) : []
}

// === М-29 (дополнительные функции) ===
function getM29Doc(id) {
    const result = db.exec("SELECT * FROM m29_docs WHERE id = ?", [id])
    return result.length ? rowsToObjects(result[0])[0] : null
}

function getM29Items(m29Id) {
    // Создаём таблицу если не существует
    db.run(`CREATE TABLE IF NOT EXISTS m29_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        m29_id INTEGER,
        name TEXT NOT NULL,
        unit TEXT DEFAULT 'шт.',
        quantity REAL DEFAULT 0,
        price REAL DEFAULT 0,
        FOREIGN KEY(m29_id) REFERENCES m29_docs(id) ON DELETE CASCADE
    )`)

    const result = db.exec("SELECT * FROM m29_items WHERE m29_id = ? ORDER BY id", [m29Id])
    return result.length ? rowsToObjects(result[0]) : []
}

// === РЕГИОНЫ ===
function getReferenceRegions() {
    // Создаём таблицу если не существует
    db.run(`CREATE TABLE IF NOT EXISTS regions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        coefficient REAL DEFAULT 1.0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`)

    const result = db.exec("SELECT * FROM regions ORDER BY name")
    return result.length ? rowsToObjects(result[0]) : []
}

function createReferenceRegion(data) {
    const { name, coefficient } = data
    db.run("INSERT INTO regions (name, coefficient) VALUES (?, ?)", [name, coefficient || 1.0])
    markDirty()
    const id = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0]
    return { id }
}

function deleteReferenceRegion(id) {
    db.run("DELETE FROM regions WHERE id = ?", [id])
    markDirty()
    return { success: true }
}

// =========================================
// === ZARU AI смета: КОЭФФИЦИЕНТЫ ===
// =========================================

function getCoefficients(estimateId) {
    const result = db.exec("SELECT * FROM coefficients WHERE estimate_id = ?", [estimateId])
    if (result.length && result[0].values.length > 0) {
        return rowsToObjects(result[0])[0]
    }
    // Возвращаем значения по умолчанию
    return {
        estimate_id: estimateId,
        work_coef: 1.8,
        material_coef: 1.04,
        overhead_coef: 1.0,
        profit_coef: 1.0
    }
}

function setCoefficients(estimateId, data) {
    const { work_coef, material_coef } = data

    // Проверяем существует ли запись
    const existing = db.exec("SELECT id FROM coefficients WHERE estimate_id = ?", [estimateId])

    if (existing.length && existing[0].values.length > 0) {
        db.run(
            "UPDATE coefficients SET work_coef = ?, material_coef = ? WHERE estimate_id = ?",
            [work_coef || 1.8, material_coef || 1.04, estimateId]
        )
    } else {
        db.run(
            "INSERT INTO coefficients (estimate_id, work_coef, material_coef, overhead_coef, profit_coef) VALUES (?, ?, ?, ?, ?)",
            [estimateId, work_coef || 1.8, material_coef || 1.04, 1.0, 1.0]
        )
    }
    markDirty()

    // ИСПРАВКА: вызываем новую правильную функцию расчёта
    recalculateEstimate(estimateId)

    return getCoefficients(estimateId)
}

// =========================================
// === КОЭФФИЦИЕНТЫ [DEPRECATED] ===
// === Старая функция расчёта, заменена на recalculateEstimate ===
// =========================================
// recalculateEstimateWithCoefficients() - УДАЛЕНА (неправильная логика)
// Новая функция recalculateEstimate() содержит правильный алгоритм

// =========================================
// === ZARU AI смета: РАЗДЕЛЫ ===
// =========================================

function getEstimateSections(estimateId) {
    const result = db.exec(
        "SELECT * FROM estimate_sections WHERE estimate_id = ? ORDER BY level, sort_order",
        [estimateId]
    )
    return result.length ? rowsToObjects(result[0]) : []
}

function createEstimateSection(data) {
    const { estimate_id, parent_section_id, name, code, level, sort_order } = data
    db.run(
        "INSERT INTO estimate_sections (estimate_id, parent_section_id, name, code, level, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
        [estimate_id, parent_section_id || null, name, code || '', level || 1, sort_order || 0]
    )
    markDirty()
    const id = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0]
    return { id }
}

function deleteEstimateSection(id) {
    db.run("DELETE FROM estimate_sections WHERE id = ?", [id])
    markDirty()
    return { success: true }
}

// =========================================
// === ZARU AI смета: ШАБЛОНЫ ===
// =========================================

function getTemplates() {
    const result = db.exec("SELECT * FROM estimate_templates ORDER BY category, name")
    return result.length ? rowsToObjects(result[0]) : []
}

function getTemplate(id) {
    const result = db.exec("SELECT * FROM estimate_templates WHERE id = ?", [id])
    return result.length ? rowsToObjects(result[0])[0] : null
}

function saveAsTemplate(estimateId, templateName, category, description) {
    // Получаем смету и её позиции
    const estimate = getEstimate(estimateId)
    const items = getEstimateItems(estimateId)
    const sections = getEstimateSections(estimateId)
    const coef = getCoefficients(estimateId)

    const templateData = JSON.stringify({
        estimate: { name: estimate.name },
        items: items.map(i => ({
            name: i.name,
            unit: i.unit,
            quantity: i.quantity,
            material_price: i.material_price,
            labor_price: i.labor_price,
            row_type: i.row_type || 'rascenka',
            justification: i.justification
        })),
        sections: sections,
        coefficients: coef
    })

    db.run(
        "INSERT INTO estimate_templates (name, description, category, template_data) VALUES (?, ?, ?, ?)",
        [templateName, description || '', category || 'Общие', templateData]
    )
    markDirty()
    const id = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0]
    return { id }
}

function createEstimateFromTemplate(templateId, projectId, newName) {
    const template = getTemplate(templateId)
    if (!template) return null

    const data = JSON.parse(template.template_data)

    // Создаём смету
    const estimate = createEstimate({
        project_id: projectId,
        name: newName || template.name,
        status: 'draft'
    })

    // Устанавливаем коэффициенты
    if (data.coefficients) {
        setCoefficients(estimate.id, data.coefficients)
    }

    // Создаём разделы
    const sectionMap = {}
    if (data.sections) {
        data.sections.forEach(s => {
            const newSection = createEstimateSection({
                estimate_id: estimate.id,
                name: s.name,
                code: s.code,
                level: s.level,
                sort_order: s.sort_order
            })
            sectionMap[s.id] = newSection.id
        })
    }

    // Создаём позиции
    if (data.items) {
        data.items.forEach((item, idx) => {
            db.run(
                `INSERT INTO estimate_items 
                (estimate_id, name, unit, quantity, material_price, labor_price, row_type, justification, sort_order) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    estimate.id,
                    item.name,
                    item.unit || 'шт.',
                    item.quantity || 1,
                    item.material_price || 0,
                    item.labor_price || 0,
                    item.row_type || 'rascenka',
                    item.justification || '',
                    idx
                ]
            )
        })
    }

    markDirty()
    recalculateEstimate(estimate.id)

    return estimate
}

function deleteTemplate(id) {
    db.run("DELETE FROM estimate_templates WHERE id = ?", [id])
    markDirty()
    return { success: true }
}

// =========================================
// === ZARU AI смета: СЦЕНАРИИ МАРЖИ ===
// =========================================

function getMarginScenarios(estimateId) {
    const result = db.exec(
        "SELECT * FROM margin_scenarios WHERE estimate_id = ? ORDER BY created_at",
        [estimateId]
    )
    return result.length ? rowsToObjects(result[0]) : []
}

function createMarginScenario(data) {
    const { estimate_id, name, work_coef_override, material_coef_override, description } = data
    db.run(
        "INSERT INTO margin_scenarios (estimate_id, name, work_coef_override, material_coef_override, description) VALUES (?, ?, ?, ?, ?)",
        [estimate_id, name, work_coef_override, material_coef_override, description || '']
    )
    markDirty()
    const id = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0]
    return { id }
}

function calculateScenario(estimateId, scenarioId) {
    const scenario = db.exec("SELECT * FROM margin_scenarios WHERE id = ?", [scenarioId])
    if (!scenario.length) return null

    const s = rowsToObjects(scenario[0])[0]
    const baseCoef = getCoefficients(estimateId)

    // Применяем переопределения из сценария
    const testCoef = {
        work_coef: s.work_coef_override || baseCoef.work_coef,
        material_coef: s.material_coef_override || baseCoef.material_coef,
        overhead_coef: baseCoef.overhead_coef,
        profit_coef: baseCoef.profit_coef
    }

    // Получаем позиции и считаем с новыми коэффициентами (без сохранения)
    const itemsResult = db.exec(
        "SELECT id, row_type, material_price, labor_price, quantity FROM estimate_items WHERE estimate_id = ?",
        [estimateId]
    )

    if (!itemsResult.length) return { total_fact: 0, total_smeta: 0, margin: 0 }

    const items = rowsToObjects(itemsResult[0])
    let total_fact = 0
    let total_smeta = 0

    items.forEach(item => {
        const qty = item.quantity || 0
        const mat = item.material_price || 0
        const lab = item.labor_price || 0
        const rowType = item.row_type || 'rascenka'

        const sum_fact = (mat + lab) * qty
        let sum_smeta = 0

        if (rowType === 'material' || rowType === 'mechanism') {
            sum_smeta = mat * qty * testCoef.material_coef + lab * qty
        } else if (rowType === 'rascenka') {
            sum_smeta = mat * qty * testCoef.material_coef + lab * qty * testCoef.work_coef
        }

        total_fact += sum_fact
        total_smeta += sum_smeta
    })

    const final_smeta = total_smeta * testCoef.overhead_coef * testCoef.profit_coef

    return {
        scenario_id: scenarioId,
        scenario_name: s.name,
        total_fact: total_fact,
        total_smeta: final_smeta,
        margin_abs: final_smeta - total_fact,
        margin_percent: total_fact > 0 ? ((final_smeta - total_fact) / total_fact * 100) : 0
    }
}

// === УТИЛИТЫ ===
function rowsToObjects(result) {
    const { columns, values } = result
    return values.map(row => {
        const obj = {}
        columns.forEach((col, i) => { obj[col] = row[i] })
        return obj
    })
}

// === МАТЕРИАЛЫ ПОЗИЦИИ СМЕТЫ ===
// Извлекает материалы из позиций сметы для заявок на материалы и М-29
function getEstimateItemMaterials(itemId) {
    if (!db) return []
    try {
        // Получаем данные позиции
        const itemResult = db.exec(
            `SELECT * FROM estimate_items WHERE id = ?`, [itemId]
        )
        if (!itemResult.length || !itemResult[0].values.length) return []

        const item = rowsToObjects(itemResult[0])[0]

        // Если позиция связана с каталогом работ — вытаскиваем материалы по нормам
        if (item.catalog_item_id) {
            const matsResult = db.exec(
                `SELECT wm.norm, wm.formula, m.name, m.unit, m.price 
                 FROM work_materials wm 
                 JOIN material_catalog m ON m.id = wm.material_id
                 WHERE wm.work_id = ? 
                 ORDER BY wm.sort_order, m.name`,
                [item.catalog_item_id]
            )
            if (matsResult.length && matsResult[0].values.length) {
                const rows = rowsToObjects(matsResult[0])
                const qtyVars = { Q: item.quantity || 0, q: item.quantity || 0, qty: item.quantity || 0 }
                return rows.map((m) => {
                    let normQty = 0
                    if (m.formula) {
                        try {
                            normQty = evaluateFormula(m.formula, qtyVars)
                        } catch (e) {
                            normQty = 0
                        }
                    } else {
                        normQty = (m.norm || 0) * (item.quantity || 0)
                    }
                    const price = m.price || 0
                    return {
                        id: item.id,
                        item_id: itemId,
                        name: m.name || 'Материал',
                        unit: m.unit || 'шт',
                        quantity: normQty,
                        price: price,
                        total: price * normQty,
                        code: item.justification || ''
                    }
                }).filter(x => x.quantity > 0)
            }
        }

        // Fallback: используем material_price позиции
        const matPrice = item.material_price || 0
        if (matPrice > 0) {
            return [{
                id: item.id,
                item_id: itemId,
                name: item.name || 'Материал',
                unit: item.unit || 'шт',
                quantity: item.quantity || 0,
                price: matPrice,
                total: matPrice * (item.quantity || 0),
                code: item.justification || ''
            }]
        }
        return []
    } catch (e) {
        console.error('getEstimateItemMaterials error:', e)
        return []
    }
}

module.exports = {
    initDatabase,
    closeDatabase,
    saveDatabase,
    getDataPath,
    // Проекты
    getProjects, getProject, createProject, updateProject, deleteProject,
    // Сметы
    getEstimates, getEstimate, createEstimate, updateEstimate, deleteEstimate, convertDefectToEstimate,
    // Позиции
    getEstimateItems, createEstimateItem, updateEstimateItem, deleteEstimateItem,
    // Договоры
    getContracts, getContract, createContract, updateContract, deleteContract,
    // КС-2
    getKS2Acts, createKS2Act, deleteKS2Act,
    // КС-3
    getKS3Certs, createKS3Cert, deleteKS3Cert,
    // М-29
    getM29Docs, createM29Doc, getM29Doc, getM29Items,
    // Справочник
    importCatalog, importRegions, searchReferenceWorks, searchReferenceMaterials,
    // Регионы
    getReferenceRegions, createReferenceRegion, deleteReferenceRegion,
    // Настройки
    getSetting, setSetting, getAllSettings,
    // === ZARU AI смета ===
    // Коэффициенты и расчёты
    getCoefficients, setCoefficients, recalculateEstimate,
    // Разделы
    getEstimateSections, createEstimateSection, deleteEstimateSection,
    // Шаблоны
    getTemplates, getTemplate, saveAsTemplate, createEstimateFromTemplate, deleteTemplate,
    // Сценарии маржи
    getMarginScenarios, createMarginScenario, calculateScenario,
    // КС-2 позиции (накопительный учёт)
    getKS2Items, createKS2Item, createKS2Items, deleteKS2Item, getKS2Remainder,
    // ФОТ
    createFOTSheet, getFOTSheets,
    // Список ресурсов
    getResourceSummary,
    // Материалы позиции
    getEstimateItemMaterials
}



