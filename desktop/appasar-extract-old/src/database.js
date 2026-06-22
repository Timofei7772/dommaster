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

// Получить путь к данным
function getDataPath() {
    return app.getPath('userData')
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
    number TEXT,
    date TEXT,
    status TEXT DEFAULT 'draft',
    file_path TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`)

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
    const { project_id, name, number, status, client_name, address } = data

    try {
        db.run("INSERT INTO estimates (project_id, name, number, status, client_name, address) VALUES (?, ?, ?, ?, ?, ?)",
            [project_id || null, name, number || '', status || 'draft', client_name || '', address || ''])

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

function createEstimateItem(data) {
    const {
        estimate_id, name, unit, quantity,
        materials_cost, labor_cost, code,
        row_type, price_fact, price_smeta, parent_item_id, sum_fact, sum_smeta,
        section_id, sort_order
    } = data

    // ===== ВАЛИДАЦИЯ ВХОДНЫХ ДАННЫХ =====
    if (!estimate_id) throw new Error('estimate_id обязателен')
    if (!name || name.trim().length === 0) throw new Error('Название позиции обязательно')
    if (name.length > 500) throw new Error('Название слишком длинное (максимум 500 символов)')

    const qty = quantity || 1
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
                sum_fact, sum_smeta, section_id, sort_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                estimate_id, name, unit || 'шт.', qty,
                mat_price, lab_price, code || '',
                type, p_fact, p_smeta, parent_item_id || null,
                s_fact, s_smeta, section_id || null, sort_order || 0
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

    // ===== ВАЛИДАЦИЯ ВХОДНЫХ ДАННЫХ =====
    if (data.name !== undefined) {
        if (!data.name || data.name.trim().length === 0) throw new Error('Название позиции не может быть пустым')
        if (data.name.length > 500) throw new Error('Название слишком длинное (максимум 500 символов)')
    }

    if (data.quantity !== undefined) {
        if (data.quantity <= 0) throw new Error(`Количество должно быть положительным (текущее значение: ${data.quantity})`)
        if (data.quantity > 10000) throw new Error('Количество слишком большое (максимум 10000)')
    }

    if (data.materials_cost !== undefined) {
        if (data.materials_cost < 0) throw new Error(`Цена материалов не может быть отрицательной (текущее значение: ${data.materials_cost})`)
        if (data.materials_cost > 1000000) throw new Error('Цена материалов слишком большая (максимум 1,000,000)')
    }

    if (data.labor_cost !== undefined) {
        if (data.labor_cost < 0) throw new Error(`Цена труда не может быть отрицательной (текущее значение: ${data.labor_cost})`)
        if (data.labor_cost > 1000000) throw new Error('Цена труда слишком большая (максимум 1,000,000)')
    }

    if (data.price_fact !== undefined && data.price_fact < 0) {
        throw new Error(`price_fact не может быть отрицательной`)
    }
    if (data.price_smeta !== undefined && data.price_smeta < 0) {
        throw new Error(`price_smeta не может быть отрицательной`)
    }

    const fields = [], values = []

    // Обновляем поля, если переданы
    const keys = ['name', 'unit', 'quantity', 'row_type', 'price_fact', 'price_smeta', 'sum_fact', 'sum_smeta', 'parent_item_id', 'justification', 'section_id', 'sort_order']

    // Маппинг старых полей на новые
    if (data.materials_cost !== undefined && currentItem.row_type === 'material') data.price_smeta = data.materials_cost
    if (data.labor_cost !== undefined && (currentItem.row_type === 'rascenka' || !currentItem.row_type)) data.price_smeta = data.labor_cost
    if (data.code !== undefined) data.justification = data.code

    // Пересчет сумм, если изменились количество или цена
    let newQty = data.quantity !== undefined ? data.quantity : currentItem.quantity
    let newPriceFact = data.price_fact !== undefined ? data.price_fact : currentItem.price_fact
    let newPriceSmeta = data.price_smeta !== undefined ? data.price_smeta : currentItem.price_smeta

    if (data.quantity !== undefined || data.price_fact !== undefined) {
        data.sum_fact = newQty * newPriceFact
    }
    if (data.quantity !== undefined || data.price_smeta !== undefined) {
        data.sum_smeta = newQty * newPriceSmeta
        // Обновляем также старые поля цен
        if (currentItem.row_type === 'material' || data.row_type === 'material') {
            fields.push('material_price = ?'); values.push(newPriceSmeta)
        } else {
            fields.push('labor_price = ?'); values.push(newPriceSmeta)
        }
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
async function importCatalog() {
    // Создаём таблицу work_catalog если не существует
    db.run(`CREATE TABLE IF NOT EXISTS work_catalog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT,
        name TEXT NOT NULL,
        unit TEXT,
        price REAL DEFAULT 0,
        category TEXT
    )`)

    // Проверяем, есть ли уже данные
    const countResult = db.exec("SELECT COUNT(*) FROM work_catalog")
    const count = countResult.length ? countResult[0].values[0][0] : 0

    // Если данных < 10 (например, пустая или почти пустая), пробуем импортировать
    if (count > 10) {
        return { success: true, count: count, message: 'Справочник уже загружен' }
    }

    // Загружаем данные из JSON-файла каталога
    try {
        const catalogPath = path.join(app.isPackaged
            ? path.join(process.resourcesPath, 'db', 'catalog.json')
            : path.join(__dirname, '..', 'db', 'catalog.json'))

        if (fs.existsSync(catalogPath)) {
            const catalogData = JSON.parse(fs.readFileSync(catalogPath, 'utf-8'))
            let importedCount = 0

            // Импорт работ
            if (catalogData.works && Array.isArray(catalogData.works)) {
                catalogData.works.forEach(work => {
                    db.run(
                        "INSERT INTO work_catalog (code, name, unit, price, category) VALUES (?, ?, ?, ?, ?)",
                        [work.code || '', work.name, work.unit || 'шт.', work.price || 0, work.category || '']
                    )
                    importedCount++
                })
            }

            // Создаём таблицу материалов
            db.run(`CREATE TABLE IF NOT EXISTS material_catalog (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT,
                name TEXT NOT NULL,
                unit TEXT DEFAULT 'шт.',
                price REAL DEFAULT 0,
                group_name TEXT
            )`)

            // Импорт материалов
            if (catalogData.materials && Array.isArray(catalogData.materials)) {
                catalogData.materials.forEach(mat => {
                    db.run(
                        "INSERT INTO material_catalog (code, name, unit, price, group_name) VALUES (?, ?, ?, ?, ?)",
                        [mat.code || '', mat.name, mat.unit || 'шт.', mat.price || 0, mat.group || '']
                    )
                })
            }

            markDirty()
            return { success: true, count: importedCount }
        }
    } catch (err) {
        console.error('Ошибка импорта справочника:', err)
    }

    return { success: true, count: 0 }
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

        // Используем material_price (правильное имя поля в БД)
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
    getM29Docs, createM29Doc, getM29Doc, getM29Items,
    // Справочник
    importCatalog, searchReferenceWorks, searchReferenceMaterials,
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



