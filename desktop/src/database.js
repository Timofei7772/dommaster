/**
 * ZARU Смета - База данных (sql.js)
 * Использует sql.js для работы с SQLite в памяти с сохранением в файл
 */

const path = require('path')
const fs = require('fs')
const { app } = require('electron')
const {
    CATALOG_BOOTSTRAP_VERSION,
    parseCatalogJsonFile,
    planCatalogBootstrap,
    resolveCatalogImportPaths,
} = require('./catalog-bootstrap')

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

    // === Настройки по умолчанию (ZaruAI Смета) ===
    const smeta2007Defaults = {
      smeta_koeff_material: '1.04',
      smeta_koeff_price: '1.8',
      smeta_stavka_nds: '0.2',
      smeta_lni: '0',
      smeta_vns: '0',
      smeta_limitir_zatrats: 'none',
      smeta_format: '6-grafka',
      smeta_print_color: 'true',
      smeta_color_price: '#000000',
      smeta_color_material: '#4169E1',
      smeta_color_mechanism: '#008000',
      smeta_color_comment: '#808080',
      smeta_color_quantity: '#8B4513',
      smeta_dog_stavka_avansa: '50',
      smeta_print_sostavil_proveril: 'false',
      smeta_add_limit_zatr_k_stoimost_materials: 'true',
      smeta_predstavlenie_nds: '0',
      smeta_kol_price_in_new_razdel: '3',
      smeta_kol_strok_material_in_price: '3'
    }
    for (const [key, value] of Object.entries(smeta2007Defaults)) {
      try {
        db.run("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", [key, value])
      } catch (e) { /* уже существует */ }
    }
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
function normalizeEstimateRowType(rowType) {
    return rowType || 'rascenka'
}

function isNonCalculableEstimateRow(rowType) {
    const type = normalizeEstimateRowType(rowType)
    return type === 'comment' || type === 'spr' || type === 'empt' ||
        type.startsWith('irazd') || type.startsWith('itog') || type.startsWith('lz_')
}

function getEstimateCalculationCoefficients(estimateId) {
    try {
        const coef = getCoefficients(estimateId)
        return {
            material_coef: Number(coef?.material_coef) || 1.04,
            work_coef: Number(coef?.work_coef) || 1.8
        }
    } catch (error) {
        return {
            material_coef: 1.04,
            work_coef: 1.8
        }
    }
}

function calculateEstimateItemAmounts(item, coefficients = {}) {
    const rowType = normalizeEstimateRowType(item?.row_type)
    const quantity = Number(item?.quantity ?? 0) || 0
    const quantityRounded = r2(quantity)
    const materialPrice = Number(item?.material_price ?? item?.materials_cost ?? 0) || 0
    const laborPrice = Number(item?.labor_price ?? item?.labor_cost ?? item?.price ?? 0) || 0
    const priceFact = Number(item?.price_fact ?? 0) || 0
    const materialCoef = Number(coefficients?.material_coef) || 1.04
    const workCoef = Number(coefficients?.work_coef) || 1.8
    const sumFact = r2(priceFact * quantityRounded)

    if (isNonCalculableEstimateRow(rowType)) {
        return {
            rowType,
            quantity: quantityRounded,
            priceFact,
            sumFact,
            priceSmeta: 0,
            sumSmeta: 0,
            materialsTotal: 0,
            laborTotal: 0,
            isCalculable: false,
            isMaterial: false,
            isMechanism: false
        }
    }

    if (rowType === 'material' || rowType === 'mat') {
        const priceSmeta = r2(materialPrice * materialCoef)
        const sumSmeta = r2(priceSmeta * quantityRounded)
        return {
            rowType,
            quantity: quantityRounded,
            priceFact,
            sumFact,
            priceSmeta,
            sumSmeta,
            materialsTotal: sumSmeta,
            laborTotal: 0,
            isCalculable: true,
            isMaterial: true,
            isMechanism: false
        }
    }

    if (rowType === 'mechanism' || rowType === 'meh') {
        const priceSmeta = r2(materialPrice * materialCoef)
        const sumSmeta = r2(priceSmeta * quantityRounded)
        return {
            rowType,
            quantity: quantityRounded,
            priceFact,
            sumFact,
            priceSmeta,
            sumSmeta,
            materialsTotal: sumSmeta,
            laborTotal: 0,
            isCalculable: true,
            isMaterial: false,
            isMechanism: true
        }
    }

    const smetaLaborPrice = r2(laborPrice * workCoef)
    const smetaMaterialPrice = r2(materialPrice * materialCoef)
    const laborTotal = r2(smetaLaborPrice * quantityRounded)
    const materialsTotal = r2(smetaMaterialPrice * quantityRounded)

    return {
        rowType,
        quantity: quantityRounded,
        priceFact,
        sumFact,
        priceSmeta: r2(smetaLaborPrice + smetaMaterialPrice),
        sumSmeta: r2(laborTotal + materialsTotal),
        materialsTotal,
        laborTotal,
        isCalculable: true,
        isMaterial: false,
        isMechanism: false
    }
}

function getEstimateItems(estimateId) {
    const result = db.exec("SELECT * FROM estimate_items WHERE estimate_id = ? ORDER BY sort_order, id", [estimateId])
    if (!result.length) return []

    const coefficients = getEstimateCalculationCoefficients(estimateId)
    return rowsToObjects(result[0]).map(r => {
        const calculated = calculateEstimateItemAmounts(r, coefficients)
        return {
            ...r,
            row_type: calculated.rowType,
            quantity: calculated.quantity,
            material_price: Number(r.material_price ?? 0) || 0,
            labor_price: Number(r.labor_price ?? 0) || 0,
            price_fact: Number(r.price_fact ?? 0) || 0,
            price_smeta: calculated.priceSmeta,
            sum_fact: calculated.sumFact,
            sum_smeta: calculated.sumSmeta,
            materials_total: calculated.materialsTotal,
            labor_total: calculated.laborTotal,
            total: calculated.sumSmeta
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

    const p_fact = price_fact ?? 0
    const calculatedRow = calculateEstimateItemAmounts({
        row_type: type,
        quantity: qty,
        material_price: mat_price,
        labor_price: lab_price,
        price_fact: p_fact
    }, getEstimateCalculationCoefficients(estimate_id))
    const p_smeta = price_smeta ?? calculatedRow.priceSmeta

    // Вычисляем суммы сразу по единому алгоритму сметы
    const s_fact = sum_fact ?? calculatedRow.sumFact
    const s_smeta = sum_smeta ?? calculatedRow.sumSmeta

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
    const calculatedRow = calculateEstimateItemAmounts({
        row_type: rowType,
        quantity: newQty,
        material_price: newMaterialPrice,
        labor_price: newLaborPrice,
        price_fact: newPriceFact
    }, getEstimateCalculationCoefficients(estimateId))
    if (shouldRecalcPriceSmeta) {
        newPriceSmeta = calculatedRow.priceSmeta
        data.price_smeta = newPriceSmeta
    }

    if (data.quantity !== undefined || data.price_fact !== undefined) {
        data.sum_fact = data.sum_fact !== undefined ? data.sum_fact : calculatedRow.sumFact
    }
    if (data.quantity !== undefined || data.price_smeta !== undefined || shouldRecalcPriceSmeta) {
        const defaultSumSmeta = data.price_smeta !== undefined
            ? r2((Number(data.price_smeta) || 0) * calculatedRow.quantity)
            : calculatedRow.sumSmeta
        data.sum_smeta = data.sum_smeta !== undefined ? data.sum_smeta : defaultSumSmeta
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
    return { success: true, id }
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
// =========================================================
// ТОЧНЫЙ РАСЧЁТ ПО АЛГОРИТМУ СМЕТА 2007
// Все промежуточные суммы округляются до 2 знаков (ROUND)
// Цена строки = ROUND(Кол-во × ROUND(ЦенаФакт × КоэффЦены, 2), 2)
// =========================================================
function r2(v) {
    return Math.round((v || 0) * 100) / 100
}

function recalculateEstimate(estimateId) {
    const estimateResult = db.exec("SELECT * FROM estimates WHERE id = ?", [estimateId])
    if (!estimateResult.length) return

    const estimate = rowsToObjects(estimateResult[0])[0]

    const coefficients = getEstimateCalculationCoefficients(estimateId)

    // Все позиции сметы
    const itemsResult = db.exec("SELECT * FROM estimate_items WHERE estimate_id = ? ORDER BY sort_order, id", [estimateId])

    // Накопители по типам строк (как в SUMIF ZaruAI Смета)
    let sum_pr  = 0   // сумма по расценкам (работы)
    let sum_mat = 0   // сумма по материалам
    let sum_meh = 0   // сумма по механизмам

    if (itemsResult.length && itemsResult[0].values.length) {
        const items = rowsToObjects(itemsResult[0])

        items.forEach(item => {
            const calculated = calculateEstimateItemAmounts(item, coefficients)
            if (!calculated.isCalculable) return

            if (calculated.isMaterial) {
                sum_mat += calculated.sumSmeta
            } else if (calculated.isMechanism) {
                sum_meh += calculated.sumSmeta
            } else {
                sum_pr += calculated.sumSmeta
            }
        })
    }

    // Итого по разделам (как ItogoPoRazdelam в ZaruAI Смета)
    const itogo_po_razdelam = r2(sum_pr + sum_mat + sum_meh)

    // Лимитированные затраты (overhead + profit)
    // Накладные начисляются на итого; прибыль — на итого + накладные
    const overhead_percent = parseFloat(estimate.overhead_percent) || 0
    const profit_percent   = parseFloat(estimate.profit_percent) || 0
    const overhead_amount  = r2(itogo_po_razdelam * overhead_percent / 100)
    const base_for_profit  = r2(itogo_po_razdelam + overhead_amount)
    const profit_amount    = r2(base_for_profit * profit_percent / 100)

    // Итого без НДС
    const total_cost = r2(itogo_po_razdelam + overhead_amount + profit_amount)

    // НДС сверху (ставка применяется к итого без НДС)
    const vat_percent_value = parseFloat(estimate.vat_percent) || 0
    const vat_cost          = r2(total_cost * vat_percent_value / 100)

    // ВСЕГО с НДС
    const total_with_vat = r2(total_cost + vat_cost)

    // Обновляем смету в БД
    db.run(
        `UPDATE estimates SET
         total_materials = ?,
         total_labor     = ?,
         subtotal        = ?,
         overhead_amount = ?,
         profit_amount   = ?,
         total_cost      = ?,
         vat_cost        = ?,
         total_with_vat  = ?
         WHERE id = ?`,
        [
            r2(sum_mat + sum_meh),  // материалы + механизмы
            r2(sum_pr),             // работы
            itogo_po_razdelam,      // итого по разделам
            overhead_amount,
            profit_amount,
            total_cost,             // итого без НДС
            vat_cost,
            total_with_vat,
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
    items.forEach(item => {
        db.run(
            "INSERT INTO ks2_items (ks2_id, estimate_item_id, quantity_closed, amount_closed) VALUES (?, ?, ?, ?)",
            [ks2Id, item.estimate_item_id, item.quantity_closed, item.amount_closed]
        )
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
    // Только расценки (работы), фактические цены
    const workItems = items.filter(i => i.row_type === 'rascenka' || !i.row_type)
    const totalFOT = workItems.reduce((sum, i) => sum + (i.sum_fact || (i.labor_price * i.quantity) || 0), 0)

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

function normalizeCatalogText(value) {
    return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function getScalarCount(query, params = []) {
    const result = db.exec(query, params)
    return result.length ? Number(result[0].values[0][0] || 0) : 0
}

function getCatalogBootstrapState() {
    return {
        worksCount: getScalarCount("SELECT COUNT(*) FROM work_catalog"),
        materialsCount: getScalarCount("SELECT COUNT(*) FROM material_catalog"),
        sectionsCount: getScalarCount("SELECT COUNT(*) FROM work_sections"),
        linksCount: getScalarCount("SELECT COUNT(*) FROM work_materials"),
        invalidRowsCount:
            getScalarCount("SELECT COUNT(*) FROM work_catalog WHERE TRIM(COALESCE(name, '')) = ''") +
            getScalarCount("SELECT COUNT(*) FROM material_catalog WHERE TRIM(COALESCE(name, '')) = ''") +
            getScalarCount("SELECT COUNT(*) FROM work_sections WHERE TRIM(COALESCE(name, '')) = ''"),
        storedVersion: Number(getSetting('catalog_bootstrap_version') || 0),
    }
}

function putLookup(map, key, value) {
    if (key) {
        map.set(key, value)
    }
}

function buildCatalogIndexes() {
    const sectionsResult = db.exec("SELECT * FROM work_sections")
    const worksResult = db.exec("SELECT * FROM work_catalog")
    const materialsResult = db.exec("SELECT * FROM material_catalog")
    const linksResult = db.exec("SELECT work_id, material_id, norm, formula, sort_order FROM work_materials")

    const sections = sectionsResult.length ? rowsToObjects(sectionsResult[0]) : []
    const works = worksResult.length ? rowsToObjects(worksResult[0]) : []
    const materials = materialsResult.length ? rowsToObjects(materialsResult[0]) : []
    const links = linksResult.length ? rowsToObjects(linksResult[0]) : []

    const sectionByExternalId = new Map()
    const sectionByName = new Map()
    sections.forEach(section => {
        putLookup(sectionByExternalId, String(section.external_id || '').trim(), section)
        putLookup(sectionByName, normalizeCatalogText(section.name), section)
    })

    const workByExternalId = new Map()
    const workByCode = new Map()
    const workByName = new Map()
    works.forEach(work => {
        putLookup(workByExternalId, String(work.external_id || '').trim(), work)
        putLookup(workByCode, String(work.code || '').trim(), work)
        putLookup(workByName, normalizeCatalogText(work.name), work)
    })

    const materialByExternalId = new Map()
    const materialByCode = new Map()
    const materialByName = new Map()
    materials.forEach(material => {
        putLookup(materialByExternalId, String(material.external_id || '').trim(), material)
        putLookup(materialByCode, String(material.code || '').trim(), material)
        putLookup(materialByName, normalizeCatalogText(material.name), material)
    })

    const linkSet = new Set(
        links.map(link =>
            [
                Number(link.work_id || 0),
                Number(link.material_id || 0),
                Number(link.norm || 0),
                String(link.formula || ''),
                Number(link.sort_order || 0),
            ].join(':')
        )
    )

    return {
        sectionByExternalId,
        sectionByName,
        workByExternalId,
        workByCode,
        workByName,
        materialByExternalId,
        materialByCode,
        materialByName,
        linkSet,
    }
}

function hydrateText(currentValue, incomingValue) {
    if (String(currentValue || '').trim()) {
        return currentValue
    }
    return incomingValue ?? currentValue
}

function hydrateNumber(currentValue, incomingValue) {
    const current = Number(currentValue || 0)
    const incoming = Number(incomingValue || 0)
    if (current > 0 || incoming <= 0) {
        return currentValue
    }
    return incoming
}

function upsertCatalogSection(section, indexes) {
    const externalId = String(section.id || section.external_id || '').trim()
    const normalizedName = normalizeCatalogText(section.name)
    let existing = null

    if (externalId && indexes.sectionByExternalId.has(externalId)) {
        existing = indexes.sectionByExternalId.get(externalId)
    } else if (normalizedName && indexes.sectionByName.has(normalizedName)) {
        existing = indexes.sectionByName.get(normalizedName)
    }

    if (existing) {
        const nextExternalId = hydrateText(existing.external_id, externalId)
        const nextParentExternalId = hydrateText(existing.parent_external_id, section.parent_id || section.parent_external_id || null)
        const nextPath = hydrateText(existing.path, section.path || '')
        const nextLevel = hydrateNumber(existing.level, section.level || 0)
        const nextSortOrder = hydrateNumber(existing.sort_order, section.sort_order || 0)

        db.run(
            "UPDATE work_sections SET external_id = ?, parent_external_id = ?, path = ?, level = ?, sort_order = ? WHERE id = ?",
            [nextExternalId, nextParentExternalId, nextPath, nextLevel, nextSortOrder, existing.id]
        )

        const updated = {
            ...existing,
            external_id: nextExternalId,
            parent_external_id: nextParentExternalId,
            path: nextPath,
            level: nextLevel,
            sort_order: nextSortOrder,
        }

        if (nextExternalId) {
            indexes.sectionByExternalId.set(nextExternalId, updated)
        }
        if (normalizedName) {
            indexes.sectionByName.set(normalizedName, updated)
        }
        return updated
    }

    db.run(
        "INSERT INTO work_sections (external_id, name, parent_external_id, path, level, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
        [
            externalId,
            section.name || '',
            section.parent_id || section.parent_external_id || null,
            section.path || '',
            section.level || 0,
            section.sort_order || 0,
        ]
    )

    const inserted = {
        id: db.exec("SELECT last_insert_rowid() as id")[0].values[0][0],
        external_id: externalId,
        name: section.name || '',
        parent_external_id: section.parent_id || section.parent_external_id || null,
        path: section.path || '',
        level: section.level || 0,
        sort_order: section.sort_order || 0,
    }

    if (externalId) {
        indexes.sectionByExternalId.set(externalId, inserted)
    }
    if (normalizedName) {
        indexes.sectionByName.set(normalizedName, inserted)
    }
    return inserted
}

function upsertCatalogWork(work, indexes) {
    const externalId = String(work.id || work.external_id || '').trim()
    const code = String(work.code || '').trim()
    const normalizedName = normalizeCatalogText(work.name)
    let existing = null

    if (externalId && indexes.workByExternalId.has(externalId)) {
        existing = indexes.workByExternalId.get(externalId)
    } else if (code && indexes.workByCode.has(code)) {
        existing = indexes.workByCode.get(code)
    } else if (normalizedName && indexes.workByName.has(normalizedName)) {
        existing = indexes.workByName.get(normalizedName)
    }

    const laborPrice = work.labor_price ?? work.price ?? 0
    const materialPrice = work.material_price ?? 0
    const totalPrice = (work.price ?? (laborPrice + materialPrice)) || 0

    if (existing) {
        const next = {
            external_id: hydrateText(existing.external_id, externalId),
            code: hydrateText(existing.code, code),
            unit: hydrateText(existing.unit, work.unit || 'шт.'),
            price: hydrateNumber(existing.price, totalPrice),
            labor_price: hydrateNumber(existing.labor_price, laborPrice),
            material_price: hydrateNumber(existing.material_price, materialPrice),
            category: hydrateText(existing.category, work.category || ''),
            section_id: hydrateText(existing.section_id, work.section_id || null),
            price_fakt: hydrateNumber(existing.price_fakt, work.price_fakt ?? laborPrice),
            price_est: hydrateNumber(existing.price_est, work.price_est ?? work.price_estimate ?? 0),
            coeff: Number(existing.coeff || 1) > 0 ? existing.coeff : (work.coeff ?? work.koeff ?? 1),
            trudozatrats: hydrateNumber(existing.trudozatrats, work.trudozatrats ?? 0),
            razrjad: hydrateNumber(existing.razrjad, work.razrjad ?? 0),
        }

        db.run(
            `UPDATE work_catalog
             SET external_id = ?, code = ?, unit = ?, price = ?, labor_price = ?, material_price = ?,
                 category = ?, section_id = ?, price_fakt = ?, price_est = ?, coeff = ?, trudozatrats = ?, razrjad = ?
             WHERE id = ?`,
            [
                next.external_id,
                next.code,
                next.unit,
                next.price,
                next.labor_price,
                next.material_price,
                next.category,
                next.section_id,
                next.price_fakt,
                next.price_est,
                next.coeff,
                next.trudozatrats,
                next.razrjad,
                existing.id,
            ]
        )

        const updated = { ...existing, ...next }
        if (next.external_id) indexes.workByExternalId.set(next.external_id, updated)
        if (next.code) indexes.workByCode.set(next.code, updated)
        if (normalizedName) indexes.workByName.set(normalizedName, updated)
        return updated
    }

    db.run(
        `INSERT INTO work_catalog (
            external_id, code, name, unit, price, labor_price, material_price,
            category, section_id, price_fakt, price_est, coeff, trudozatrats, razrjad
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            externalId,
            code,
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
            work.razrjad ?? 0,
        ]
    )

    const inserted = {
        id: db.exec("SELECT last_insert_rowid() as id")[0].values[0][0],
        external_id: externalId,
        code,
        name: work.name || '',
        unit: work.unit || 'шт.',
        price: totalPrice,
        labor_price: laborPrice,
        material_price: materialPrice,
        category: work.category || '',
        section_id: work.section_id || null,
        price_fakt: work.price_fakt ?? laborPrice,
        price_est: work.price_est ?? work.price_estimate ?? 0,
        coeff: work.coeff ?? work.koeff ?? 1,
        trudozatrats: work.trudozatrats ?? 0,
        razrjad: work.razrjad ?? 0,
    }

    if (externalId) indexes.workByExternalId.set(externalId, inserted)
    if (code) indexes.workByCode.set(code, inserted)
    if (normalizedName) indexes.workByName.set(normalizedName, inserted)
    return inserted
}

function upsertCatalogMaterial(material, indexes) {
    const externalId = String(material.id || material.external_id || '').trim()
    const code = String(material.code || '').trim()
    const normalizedName = normalizeCatalogText(material.name)
    let existing = null

    if (externalId && indexes.materialByExternalId.has(externalId)) {
        existing = indexes.materialByExternalId.get(externalId)
    } else if (code && indexes.materialByCode.has(code)) {
        existing = indexes.materialByCode.get(code)
    } else if (normalizedName && indexes.materialByName.has(normalizedName)) {
        existing = indexes.materialByName.get(normalizedName)
    }

    if (existing) {
        const next = {
            external_id: hydrateText(existing.external_id, externalId),
            code: hydrateText(existing.code, code),
            unit: hydrateText(existing.unit, material.unit || 'шт.'),
            price: hydrateNumber(existing.price, material.price ?? material.price_fakt ?? 0),
            price_est: hydrateNumber(existing.price_est, material.price_est ?? 0),
            coeff: Number(existing.coeff || 1) > 0 ? existing.coeff : (material.coeff ?? material.koeff ?? 1),
            group_name: hydrateText(existing.group_name, material.group || material.group_name || ''),
            group_id: hydrateText(existing.group_id, material.group_id || null),
        }

        db.run(
            `UPDATE material_catalog
             SET external_id = ?, code = ?, unit = ?, price = ?, price_est = ?, coeff = ?, group_name = ?, group_id = ?
             WHERE id = ?`,
            [
                next.external_id,
                next.code,
                next.unit,
                next.price,
                next.price_est,
                next.coeff,
                next.group_name,
                next.group_id,
                existing.id,
            ]
        )

        const updated = { ...existing, ...next }
        if (next.external_id) indexes.materialByExternalId.set(next.external_id, updated)
        if (next.code) indexes.materialByCode.set(next.code, updated)
        if (normalizedName) indexes.materialByName.set(normalizedName, updated)
        return updated
    }

    db.run(
        `INSERT INTO material_catalog (external_id, code, name, unit, price, price_est, coeff, group_name, group_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            externalId,
            code,
            material.name || '',
            material.unit || 'шт.',
            material.price ?? material.price_fakt ?? 0,
            material.price_est ?? 0,
            material.coeff ?? material.koeff ?? 1,
            material.group || material.group_name || '',
            material.group_id || null,
        ]
    )

    const inserted = {
        id: db.exec("SELECT last_insert_rowid() as id")[0].values[0][0],
        external_id: externalId,
        code,
        name: material.name || '',
        unit: material.unit || 'шт.',
        price: material.price ?? material.price_fakt ?? 0,
        price_est: material.price_est ?? 0,
        coeff: material.coeff ?? material.koeff ?? 1,
        group_name: material.group || material.group_name || '',
        group_id: material.group_id || null,
    }

    if (externalId) indexes.materialByExternalId.set(externalId, inserted)
    if (code) indexes.materialByCode.set(code, inserted)
    if (normalizedName) indexes.materialByName.set(normalizedName, inserted)
    return inserted
}

function mergeSimpleCatalogData(catalogData, simpleData) {
    const norm = normalizeCatalogText

    const mergedSections = []
    const sectionByName = new Map()
    ;(catalogData.sections || []).forEach(section => {
        const key = norm(section.name)
        if (!sectionByName.has(key)) {
            sectionByName.set(key, section)
            mergedSections.push(section)
        }
    })
    ;(simpleData.sections || []).forEach(section => {
        const key = norm(section.name)
        if (!sectionByName.has(key)) {
            sectionByName.set(key, section)
            mergedSections.push(section)
        }
    })
    catalogData.sections = mergedSections

    const works = catalogData.works || []
    const workByName = new Map()
    works.forEach(work => {
        workByName.set(norm(work.name), work)
    })
    ;(simpleData.works || []).forEach(work => {
        const key = norm(work.name)
        if (!workByName.has(key)) {
            works.push(work)
            workByName.set(key, work)
        } else {
            const base = workByName.get(key)
            if (!base.category && work.category) base.category = work.category
            if (!base.section_id && work.section_id) base.section_id = work.section_id
            if (!base.unit && work.unit) base.unit = work.unit
            if (!base.price && work.price) base.price = work.price
            if (!base.labor_price && work.labor_price) base.labor_price = work.labor_price
        }
    })
    catalogData.works = works
}

function importCatalogData(catalogData) {
    const indexes = buildCatalogIndexes()
    const workIdMap = new Map()
    const materialIdMap = new Map()
    let importedCount = 0

    if (catalogData.sections && Array.isArray(catalogData.sections)) {
        catalogData.sections.forEach(section => {
            upsertCatalogSection(section, indexes)
        })
    }

    if (catalogData.works && Array.isArray(catalogData.works)) {
        catalogData.works.forEach(work => {
            const row = upsertCatalogWork(work, indexes)
            const externalId = String(work.id || work.external_id || work.code || '').trim()
            if (externalId) {
                workIdMap.set(externalId, row.id)
            }
            importedCount++
        })
    }

    if (catalogData.materials && Array.isArray(catalogData.materials)) {
        catalogData.materials.forEach(material => {
            const row = upsertCatalogMaterial(material, indexes)
            const externalId = String(material.id || material.external_id || material.code || '').trim()
            if (externalId) {
                materialIdMap.set(externalId, row.id)
            }
        })
    }

    if (catalogData.work_materials && Array.isArray(catalogData.work_materials)) {
        catalogData.work_materials.forEach(link => {
            const workId = workIdMap.get(String(link.work_id || link.workId || link.work || '').trim())
            const materialId = materialIdMap.get(String(link.material_id || link.materialId || link.material || '').trim())
            if (!workId || !materialId) {
                return
            }

            const norm = Number(link.norm ?? link.norma ?? 0)
            const formula = String(link.formula || link.kol_formula || '')
            const sortOrder = Number(link.sort_order || link.order || 0)
            const linkKey = [workId, materialId, norm, formula, sortOrder].join(':')

            if (indexes.linkSet.has(linkKey)) {
                return
            }

            db.run(
                "INSERT INTO work_materials (work_id, material_id, norm, formula, sort_order) VALUES (?, ?, ?, ?, ?)",
                [workId, materialId, norm, formula || null, sortOrder]
            )
            indexes.linkSet.add(linkKey)
        })
    }

    return importedCount
}

async function importCatalog() {
    ensureCatalogTables()

    // Загружаем данные из JSON-файла каталога
    try {
        const paths = resolveCatalogImportPaths({
            isPackaged: app.isPackaged,
            resourcesPath: process.resourcesPath,
            moduleDir: __dirname,
            existsSync: fs.existsSync,
        })
        const stateBefore = getCatalogBootstrapState()
        const plan = planCatalogBootstrap({
            state: stateBefore,
            paths,
            requiredVersion: CATALOG_BOOTSTRAP_VERSION,
        })

        if (plan.action === 'skip') {
            return {
                success: true,
                count: stateBefore.worksCount,
                mode: plan.mode,
                reason: plan.reason,
                message: 'Справочник уже загружен',
            }
        }

        const baseCatalogPath = plan.mode === 'full' ? paths.fullCatalogPath : paths.quickCatalogPath
        const simpleCatalogPath = paths.quickCatalogPath

        if (baseCatalogPath) {
            let catalogData = parseCatalogJsonFile(baseCatalogPath)

            // Если есть простой каталог из Excel — дополним категории/разделы
            if (plan.mode === 'full' && simpleCatalogPath && simpleCatalogPath !== baseCatalogPath && fs.existsSync(simpleCatalogPath)) {
                try {
                    const simpleData = parseCatalogJsonFile(simpleCatalogPath)
                    mergeSimpleCatalogData(catalogData, simpleData)
                } catch (e) {
                    console.error('Ошибка объединения catalog_simple.json:', e)
                }
            }

            const importedCount = importCatalogData(catalogData)

            setSetting('catalog_bootstrap_version', String(CATALOG_BOOTSTRAP_VERSION))
            setSetting('catalog_bootstrap_mode', plan.mode)
            setSetting('catalog_bootstrap_source', baseCatalogPath)
            setSetting('catalog_bootstrap_completed_at', new Date().toISOString())
            markDirty()
            const stateAfter = getCatalogBootstrapState()
            return {
                success: true,
                count: stateAfter.worksCount,
                importedCount,
                mode: plan.mode,
                reason: plan.reason,
            }
        }
    } catch (err) {
        console.error('Ошибка импорта справочника:', err)
        return { success: false, count: 0, message: err.message }
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
        const { regionsPath } = resolveCatalogImportPaths({
            isPackaged: app.isPackaged,
            resourcesPath: process.resourcesPath,
            moduleDir: __dirname,
            existsSync: fs.existsSync,
        })
        if (!regionsPath) {
            return { success: true, count: 0, message: 'regions.json не найден' }
        }
        const data = parseCatalogJsonFile(regionsPath)
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

function createWork(data) {
    const { name, code, unit, price, category } = data
    if (!name) throw new Error('Название работы обязательно')
    db.run(
        "INSERT INTO work_catalog (name, code, unit, price, category) VALUES (?, ?, ?, ?, ?)",
        [name, code || '', unit || 'шт', price || 0, category || '']
    )
    markDirty()
    saveDatabase()
    const result = db.exec("SELECT last_insert_rowid() as id")
    const id = result.length ? result[0].values[0][0] : null
    return { success: true, id }
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

function updateEstimateSection(id, data) {
    const fields = []
    const values = []
    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name) }
    if (data.code !== undefined) { fields.push('code = ?'); values.push(data.code) }
    if (data.sort_order !== undefined) { fields.push('sort_order = ?'); values.push(data.sort_order) }
    if (!fields.length) return { success: false }
    values.push(id)
    db.run(`UPDATE estimate_sections SET ${fields.join(', ')} WHERE id = ?`, values)
    markDirty()
    return { success: true }
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

function getEstimateDocumentSource(estimateId) {
    const estimate = getEstimate(estimateId)
    if (!estimate) return null

    return {
        estimate,
        project: estimate.project_id ? getProject(estimate.project_id) : null,
        items: getEstimateItems(estimateId),
        sections: getEstimateSections(estimateId),
        coefficients: getCoefficients(estimateId),
        settings: getAllSettings()
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
    getEstimates, getEstimate, getEstimateDocumentSource, createEstimate, updateEstimate, deleteEstimate, convertDefectToEstimate,
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
    importCatalog, importRegions, searchReferenceWorks, searchReferenceMaterials, createWork,
    // Регионы
    getReferenceRegions, createReferenceRegion, deleteReferenceRegion,
    // Настройки
    getSetting, setSetting, getAllSettings,
    // === ZARU AI смета ===
    // Коэффициенты и расчёты
    getCoefficients, setCoefficients, recalculateEstimate,
    // Разделы
    getEstimateSections, createEstimateSection, updateEstimateSection, deleteEstimateSection,
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






