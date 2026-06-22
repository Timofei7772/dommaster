/**
 * ZARU Смета - Desktop Application
 * Главный процесс Electron
 * 
 * Архитектура: Standalone Desktop (без веб-сервера)
 * - Все данные хранятся локально в SQLite
 * - Документы в папке пользователя
 * - AI интеграция через прямые API вызовы
 */

const { app, BrowserWindow, Menu, shell, dialog, ipcMain, session } = require('electron')
const path = require('path')
const fs = require('fs')
const banksImport = require('./src/banksImport')

// Наши модули
const db = require('./src/database')
const docs = require('./src/documents')
const license = require('./src/license-secure') // ЗАЩИЩЁННАЯ версия
const templates = require('./src/templates')

let mainWindow
const isDev = !app.isPackaged
const appVersion = require('./package.json').version

// === Вспомогательные функции для шаблонов ===

// Форматирование ФИО для подписи (Иванов И.И.)
const formatShortName = (fullName) => {
  if (!fullName) return ''
  const parts = fullName.trim().split(/\s+/)
  if (parts.length >= 3) {
    return `${parts[0]} ${parts[1][0]}.${parts[2][0]}.`
  } else if (parts.length === 2) {
    return `${parts[0]} ${parts[1][0]}.`
  }
  return fullName
}

// Форматирование суммы с разделителями
const formatAmount = (amount) => {
  return new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount || 0)
}

// Безопасный парсинг settings.company (может быть строкой JSON или объектом)
const parseCompany = (settings) => {
  const raw = settings?.company
  if (!raw) return {}
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch { return {} }
  }
  return raw
}

// Единый снимок данных сметы для документов
const getEstimateContext = (estimateId) => {
  const estimate = db.getEstimate(estimateId)
  if (!estimate) throw new Error('Смета не найдена')

  const project = estimate.project_id ? db.getProject(estimate.project_id) : null
  const items = db.getEstimateItems(estimateId)
  const sections = db.getEstimateSections(estimateId)
  const coefficients = db.getCoefficients(estimateId)
  const settings = db.getAllSettings()
  const companyInfo = parseCompany(settings)
  const folderPath = project?.folder_path || db.getDataPath()

  return { estimate, project, items, sections, coefficients, settings, companyInfo, folderPath }
}

// Надёжная загрузка HTML в скрытое окно для PDF
const loadHtmlForPDF = async (win, htmlContent, timeoutMs = 15000) => {
  const url = `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`
  await new Promise((resolve, reject) => {
    const wc = win.webContents
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('PDF: timeout loading HTML'))
    }, timeoutMs)

    function cleanup() {
      clearTimeout(timer)
      wc.removeListener('did-finish-load', onFinish)
      wc.removeListener('did-fail-load', onFail)
    }

    function onFinish() {
      cleanup()
      resolve()
    }

    function onFail(_event, errorCode, errorDesc) {
      cleanup()
      reject(new Error(`PDF: failed to load HTML (${errorCode}): ${errorDesc}`))
    }

    wc.once('did-finish-load', onFinish)
    wc.once('did-fail-load', onFail)

    win.loadURL(url).catch((err) => {
      cleanup()
      reject(err)
    })
  })

  try {
    await win.webContents.executeJavaScript(
      'document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()',
      true
    )
  } catch {
    // Игнорируем проблемы со шрифтами, чтобы не ломать PDF
  }
}

// Построение данных для шаблона договора
const buildContractData = (contract, project, estimate, company, settings) => {
  const vatRate = settings?.estimates?.vatRate || 20
  const vatEnabled = settings?.estimates?.vatEnabled !== false
  const amount = contract.amount || estimate?.total_with_vat || 0
  const vatAmount = vatEnabled ? amount * vatRate / (100 + vatRate) : 0
  const vatInfo = vatEnabled
    ? `В том числе НДС ${vatRate}%: ${formatAmount(vatAmount)} руб.`
    : 'НДС не облагается'

  // Данные заказчика
  const clientName = contract.client || contract.client_name || project?.client_name || estimate?.client_name || ''
  const clientAddress = contract.client_address || project?.address || estimate?.address || ''

  return {
    // === Основные данные договора ===
    'номер договора': contract.number || '',
    'Дата договора': templates.formatDateForDoc(contract.date || new Date().toISOString()),
    'предмет договора': contract.subject || project?.name || estimate?.name || 'Выполнение строительно-монтажных работ',
    'цена договора': formatAmount(amount),
    'цена договора прописью': templates.numberToWords(amount),
    'информация о НДС': vatInfo,
    'начало работ по договору': templates.formatDateForDoc(contract.start_date || contract.date || new Date().toISOString()),
    'окончание работ по договору': templates.formatDateForDoc(contract.end_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()),

    // === Данные заказчика (физ. лицо) ===
    'Фамилия Имя Отчество': clientName,
    'Фамилия Имя Отчество заказчика': clientName,
    'Фамилия И.О.': formatShortName(clientName),
    'адрес заказчика': clientAddress,
    'телефоны заказчика': contract.client_phone || '',
    'ИНН заказчика': contract.client_inn || '',
    'серия  номер паспорта': contract.client_passport || '',
    'серия номер паспорта': contract.client_passport || '',
    'кем выдан паспорт и дата выдачи': contract.client_passport_issued || '',
    'код подразд': contract.client_passport_code || '',

    // === Данные подрядчика ===
    'Название подрядчика': company.name || contract.contractor || '',
    'ООО «Подрядчик»': company.name || contract.contractor || '',
    'должность, фамилия, инициалы подписывающего договор': `${company.directorPosition || 'Директора'} ${formatShortName(company.director)}`,
    'должность подписывающего, название подрядчика': `${company.directorPosition || 'Директор'}, ${company.name || ''}`,
    'Устава': company.directorBasis || 'Устава',
    'юридический адрес подрядчика': company.address || '',
    'адрес подрядчика': company.address || '',
    'телефоны подрядчика': company.phone || '',
    'ИНН подрядчика': company.inn || '',
    'КПП подрядчика': company.kpp || '',
    'ОГРН': company.ogrn || '',
    'ОГРН подрядчика': company.ogrn || '',
    'БИК банка подрядчика': company.bik || '',
    'расч. счёт подрядчика': company.checkingAccount || '',
    'корр. счёт подрядчика': company.correspondentAccount || '',
    'банк подрядчика': company.bankName || '',
    'название банка подрядчика': company.bankName || '',
    'Телефон подрядчика': company.phone || '',
    'E-mail подрядчика': company.email || '',

    // === Для подписей ===
    'должность подрядчика': company.directorPosition || 'Директор',
    'Фамилия И.О. подрядчика': formatShortName(company.director),

    // === Фиксированные значения ===
    'текст первого подпункта': '',
    '12 (двенадцать) месяцев': '12 (двенадцать) месяцев',
    '12.  ПРИЛОЖЕНИЯ К ДОГОВОРУ.': '12. ПРИЛОЖЕНИЯ К ДОГОВОРУ.',
    'Приложения к договору': 'Приложение №1 - Локальная смета',

    // === Дополнительные поля (совместимость) ===
    number: contract.number || '',
    date: templates.formatDateForDoc(contract.date || new Date().toISOString()),
    client: clientName,
    contractor: company.name || '',
    subject: contract.subject || project?.name || '',
    amount: formatAmount(amount),
    amount_words: templates.numberToWords(amount),
    project_name: project?.name || '',
    project_address: project?.address || '',
    client_type: contract.client_type || 'individual'
  }
}

// === Создание окна ===
async function createWindow() {
  // Проверка лицензии при запуске
  const licenseCheck = license.checkLicense()

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'ZARU Смета',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      devTools: isDev
    },
    show: false,
    backgroundColor: '#f8fafc'
  })

  // Блокируем DevTools в production
  if (!isDev) {
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow.webContents.closeDevTools()
    })
  }

  // Content Security Policy — защита от XSS и инъекций
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' https:"
        ]
      }
    })
  })

  // Очистка кэша при старте для загрузки свежих файлов
  await session.defaultSession.clearCache()

  // Инициализация базы данных (асинхронная для sql.js)
  try {
    await db.initDatabase()
  } catch (err) {
    console.error('Ошибка инициализации БД:', err)
    dialog.showErrorBox('Ошибка', 'Не удалось инициализировать базу данных: ' + err.message)
  }

  // Импорт справочников
  try {
    const result = await db.importCatalog()
  } catch (err) {
    console.error('Ошибка импорта справочника:', err)
  }

  // Загрузка UI
  // Путь для упакованного приложения (ASAR)
  const packagedPath = path.join(process.resourcesPath, 'renderer', 'index.html')
  // Путь для разработки - dist-frontend в папке desktop
  const localPath = path.join(__dirname, 'dist-frontend', 'index.html')
  // Альтернативный путь - frontend/dist
  const altLocalPath = path.join(__dirname, '..', 'frontend', 'dist', 'index.html')
  // Альтернативный путь для упакованного приложения
  const altPackagedPath = path.join(__dirname, 'src', 'index.html')

  let loaded = false

  // В packaged app - сначала проверяем resourcesPath
  if (!isDev && fs.existsSync(packagedPath)) {
    mainWindow.loadFile(packagedPath)
    loaded = true
  }
  // В разработке - сначала dist-frontend
  else if (fs.existsSync(localPath)) {
    mainWindow.loadFile(localPath)
    loaded = true
  }
  // Альтернативный путь frontend/dist
  else if (fs.existsSync(altLocalPath)) {
    mainWindow.loadFile(altLocalPath)
    loaded = true
  }
  // Fallback на dev server
  else {
    mainWindow.loadURL('http://localhost:3001')
    if (isDev) {
      mainWindow.webContents.openDevTools()
    }
    loaded = true
  }

  // Обработка ошибок загрузки
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription)
    dialog.showErrorBox('Ошибка загрузки', `Не удалось загрузить интерфейс: ${errorDescription}\n\nКод ошибки: ${errorCode}`)
  })

  // Сохранение данных при закрытии окна
  mainWindow.on('close', (event) => {
    db.saveDatabase()
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    if (isDev) {
      mainWindow.webContents.openDevTools()
    }
  })

  // Меню
  createMenu()
}

// === Меню приложения ===
function createMenu() {
  const template = [
    {
      label: 'Файл',
      submenu: [
        {
          label: 'Новый проект',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow.webContents.send('menu-action', 'new-project')
        },
        {
          label: 'Открыть папку данных',
          click: () => shell.openPath(db.getDataPath())
        },
        { type: 'separator' },
        {
          label: 'Экспорт всех данных',
          click: () => exportAllData()
        },
        {
          label: 'Импорт данных',
          click: () => importData()
        },
        { type: 'separator' },
        { role: 'quit', label: 'Выход' }
      ]
    },
    {
      label: 'Редактирование',
      submenu: [
        { role: 'undo', label: 'Отменить' },
        { role: 'redo', label: 'Повторить' },
        { type: 'separator' },
        { role: 'cut', label: 'Вырезать' },
        { role: 'copy', label: 'Копировать' },
        { role: 'paste', label: 'Вставить' },
        { role: 'selectAll', label: 'Выделить всё' }
      ]
    },
    {
      label: 'Вид',
      submenu: [
        { role: 'reload', label: 'Обновить' },
        ...(isDev ? [{ role: 'toggleDevTools', label: 'Инструменты разработчика' }] : []),
        { type: 'separator' },
        { role: 'resetZoom', label: 'Сбросить масштаб' },
        { role: 'zoomIn', label: 'Увеличить' },
        { role: 'zoomOut', label: 'Уменьшить' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Полный экран' }
      ]
    },
    {
      label: 'Справка',
      submenu: [
        {
          label: 'О программе',
          click: () => showAbout()
        },
        {
          label: 'Документация',
          click: () => shell.openExternal('https://zaru-smeta.ru/docs')
        },
        { type: 'separator' },
        {
          label: 'Проверить обновления',
          click: () => checkUpdates()
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

function showAbout() {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'О программе',
    message: 'ZARU Смета',
    detail: `Версия: ${appVersion}\n\nПрофессиональная сметная программа с AI\n\nДанные хранятся в:\n${db.getDataPath()}`
  })
}

function checkUpdates() {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Обновления',
    message: 'У вас установлена актуальная версия'
  })
}

async function exportAllData() {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Экспорт данных',
    defaultPath: 'zaru-smeta-backup.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })

  if (result.filePath) {
    const data = {
      version: appVersion,
      exportDate: new Date().toISOString(),
      projects: db.getProjects(),
      estimates: db.getEstimates(),
      contracts: db.getContracts(),
      settings: db.getAllSettings()
    }
    fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf-8')
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      message: 'Данные экспортированы',
      detail: result.filePath
    })
  }
}

async function importData() {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Импорт данных',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })

  if (result.filePaths.length > 0) {
    try {
      const filePath = result.filePaths[0]
      const content = fs.readFileSync(filePath, 'utf-8')
      const data = JSON.parse(content)

      let imported = { projects: 0, estimates: 0, contracts: 0 }

      // Импортируем проекты
      if (data.projects && Array.isArray(data.projects)) {
        for (const project of data.projects) {
          try {
            db.createProject(project)
            imported.projects++
          } catch (e) {
            console.error('Error importing project:', e)
          }
        }
      }

      // Импортируем сметы
      if (data.estimates && Array.isArray(data.estimates)) {
        for (const estimate of data.estimates) {
          try {
            db.createEstimate(estimate)
            imported.estimates++
          } catch (e) {
            console.error('Error importing estimate:', e)
          }
        }
      }

      // Импортируем договоры
      if (data.contracts && Array.isArray(data.contracts)) {
        for (const contract of data.contracts) {
          try {
            db.createContract(contract)
            imported.contracts++
          } catch (e) {
            console.error('Error importing contract:', e)
          }
        }
      }

      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Импорт завершён',
        message: `Импортировано:\n• Проектов: ${imported.projects}\n• Смет: ${imported.estimates}\n• Договоров: ${imported.contracts}`
      })

      // Уведомляем UI об обновлении
      mainWindow.webContents.send('data-updated')

    } catch (error) {
      console.error('Import error:', error)
      dialog.showErrorBox('Ошибка импорта', 'Не удалось импортировать данные: ' + error.message)
    }
  }
}

// === IPC Handlers (связь с UI) ===

// Проекты
ipcMain.handle('projects:getAll', () => db.getProjects())
ipcMain.handle('projects:get', (_, id) => db.getProject(id))
ipcMain.handle('projects:create', (_, data) => db.createProject(data))
ipcMain.handle('projects:update', (_, id, data) => db.updateProject(id, data))
ipcMain.handle('projects:delete', (_, id) => db.deleteProject(id))

// Сметы
ipcMain.handle('estimates:getAll', (_, projectId) => db.getEstimates(projectId))
ipcMain.handle('estimates:get', (_, id) => db.getEstimate(id))
ipcMain.handle('estimates:create', (_, data) => {
  try {
    return db.createEstimate(data)
  } catch (error) {
    console.error('estimates:create error:', error)
    throw error
  }
})
ipcMain.handle('estimates:update', (_, id, data) => db.updateEstimate(id, data))
ipcMain.handle('estimates:delete', (_, id) => db.deleteEstimate(id))
ipcMain.handle('estimates:recalculate', (_, id) => {
  db.recalculateEstimate(id)
  return db.getEstimate(id)
})

// Позиции сметы
ipcMain.handle('estimateItems:getAll', (_, estimateId) => db.getEstimateItems(estimateId))
ipcMain.handle('estimateItems:add', (_, estimateId, data) => db.createEstimateItem({ ...data, estimate_id: estimateId }))
ipcMain.handle('estimateItems:update', (_, id, data) => db.updateEstimateItem(id, data))
ipcMain.handle('estimateItems:delete', (_, id) => db.deleteEstimateItem(id))

// Договоры
ipcMain.handle('contracts:getAll', (_, projectId) => db.getContracts(projectId))
ipcMain.handle('contracts:create', (_, data) => db.createContract(data))
ipcMain.handle('contracts:update', (_, id, data) => db.updateContract(id, data))
ipcMain.handle('contracts:delete', (_, id) => db.deleteContract(id))

// КС-2
ipcMain.handle('ks2:getAll', (_, projectId) => db.getKS2Acts(projectId))
ipcMain.handle('ks2:create', (_, data) => db.createKS2Act(data))
ipcMain.handle('ks2:delete', (_, id) => db.deleteKS2Act(id))

// === СМЕТА 2007: КС-2 Накопительный учёт ===
ipcMain.handle('ks2:getItems', (_, ks2Id) => db.getKS2Items(ks2Id))
ipcMain.handle('ks2:createItems', (_, ks2Id, items) => db.createKS2Items(ks2Id, items))
ipcMain.handle('ks2:getRemainder', (_, estimateId) => db.getKS2Remainder(estimateId))

// === СМЕТА 2007: Ведомость ФОТ ===
ipcMain.handle('fot:create', (_, estimateId) => db.createFOTSheet(estimateId))
ipcMain.handle('fot:getAll', (_, estimateId) => db.getFOTSheets(estimateId))

// === СМЕТА 2007: Список ресурсов ===
ipcMain.handle('resources:getSummary', (_, estimateId) => db.getResourceSummary(estimateId))


// === КС-2 позиции ===
ipcMain.handle('ks2:createItem', (_, data) => db.createKS2Item(data))
ipcMain.handle('ks2:deleteItem', (_, id) => db.deleteKS2Item(id))

// КС-3
ipcMain.handle('ks3:getAll', (_, projectId) => db.getKS3Certs(projectId))
ipcMain.handle('ks3:create', (_, data) => db.createKS3Cert(data))
ipcMain.handle('ks3:delete', (_, id) => db.deleteKS3Cert(id))


// М-29
ipcMain.handle('m29:getAll', (_, projectId) => db.getM29Docs(projectId))
ipcMain.handle('m29:create', (_, data) => db.createM29Doc(data))

// Настройки
ipcMain.handle('settings:get', (_, key) => db.getSetting(key))
ipcMain.handle('settings:set', (_, key, value) => db.setSetting(key, value))
ipcMain.handle('settings:getAll', () => db.getAllSettings())

// Каталог работ и материалов
ipcMain.handle('catalog:getWorks', (_, search) => db.searchReferenceWorks(search))
ipcMain.handle('catalog:getMaterials', (_, search) => db.searchReferenceMaterials(search))
ipcMain.handle('catalog:getRegions', () => db.getReferenceRegions())
ipcMain.handle('catalog:createRegion', (_, data) => db.createReferenceRegion(data))
ipcMain.handle('catalog:deleteRegion', (_, id) => db.deleteReferenceRegion(id))

// Импорт банков
ipcMain.handle('banks:importFromExcel', async (_, filePath) => {
  const count = await banksImport.banksImportFromExcel(filePath)
  return { success: true, count }
})

ipcMain.handle('banks:getAll', async () => {
  return banksImport.getBanksList()
})

// Генерация документов
ipcMain.handle('docs:generateEstimate', async (_, estimateId) => {
  const { estimate, project, items, companyInfo, folderPath } = getEstimateContext(estimateId)
  const timestamp = Date.now()
  const fileName = `Смета_${(estimate.number || 'Б-Н').replace(/[/\\]/g, '-')}_${timestamp}.xlsx`
  const outputPath = path.join(folderPath, 'Сметы', fileName)

  const dir = path.dirname(outputPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  await docs.generateEstimateExcel(estimate, items, project, companyInfo, outputPath)
  try {
    db.updateEstimate(estimateId, { file_path: outputPath })
  } catch (e) {
    console.log('Не удалось обновить file_path:', e.message)
  }

  return { path: outputPath }
})

// === Пакетная генерация документов ===
ipcMain.handle('docs:generatePackage', async (_, estimateId) => {
  const { estimate, project, items, sections, coefficients, companyInfo, folderPath } = getEstimateContext(estimateId)
  const timestamp = Date.now()
  const numSafe = (estimate.number || 'Б-Н').replace(/[/\\]/g, '-')

  const packageDir = path.join(folderPath, 'Сметы', `Пакет_${numSafe}_${timestamp}`)
  if (!fs.existsSync(packageDir)) fs.mkdirSync(packageDir, { recursive: true })

  const generated = []
  const errors = []

  // 1. Смета Excel
  try {
    const p = path.join(packageDir, `Смета_${numSafe}.xlsx`)
    await docs.generateEstimateExcel(estimate, items, project, companyInfo, p)
    generated.push({ type: 'Смета (Excel)', path: p })
  } catch (e) { errors.push(`Смета Excel: ${e.message}`) }

  // 2. Смета PDF
  try {
    const htmlContent = docs.generateEstimateHTML(estimate, items)
    const { BrowserWindow } = require('electron')
    const printWin = new BrowserWindow({ width: 1200, height: 900, show: false, webPreferences: { contextIsolation: true, sandbox: false } })
    try {
      await loadHtmlForPDF(printWin, htmlContent, 15000)
      const pdfData = await printWin.webContents.printToPDF({ pageSize: 'A4', printBackground: true, marginsType: 1 })
      const p = path.join(packageDir, `Смета_${numSafe}.pdf`)
      fs.writeFileSync(p, pdfData)
      generated.push({ type: 'Смета (PDF)', path: p })
    } finally {
      if (printWin && !printWin.isDestroyed()) printWin.close()
    }
  } catch (e) { errors.push(`Смета PDF: ${e.message}`) }

  // 3. Дефектовка
  try {
    const p = path.join(packageDir, `Дефектовка_${numSafe}.xlsx`)
    await docs.generateDefektovkaExcel(estimate, items, sections, coefficients, project, companyInfo, p)
    generated.push({ type: 'Дефектовка', path: p })
  } catch (e) { errors.push(`Дефектовка: ${e.message}`) }

  // 4. Смета 2007
  try {
    const p = path.join(packageDir, `Смета2007_${numSafe}.xlsx`)
    await docs.generateSmeta2007Excel(estimate, items, sections, coefficients, project, companyInfo, p)
    generated.push({ type: 'Смета 2007', path: p })
  } catch (e) { errors.push(`Смета 2007: ${e.message}`) }

  // Открываем папку с документами
  const { shell } = require('electron')
  shell.openPath(packageDir)

  return { folder: packageDir, generated, errors }
})

ipcMain.handle('docs:generateKS2', async (_, actId) => {
  const acts = db.getKS2Acts()
  const act = acts.find(a => a.id === actId)
  if (!act) throw new Error('Акт не найден')

  let project = act.project_id ? db.getProject(act.project_id) : null
  const folderPath = project?.folder_path || db.getDataPath()
  const timestamp = Date.now()
  const fileName = `КС2_${(act.number || actId).toString().replace(/[/\\]/g, '-')}_${timestamp}.xlsx`
  const outputPath = path.join(folderPath, 'КС-2', fileName)

  const dir = path.dirname(outputPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  // Получаем items и sections из сметы
  let items = []
  let sections = []
  let estimate = null
  let coefficients = { work_coef: 1.8, material_coef: 1.04 }
  if (act.estimate_id) {
    const ctx = getEstimateContext(act.estimate_id)
    estimate = ctx.estimate
    items = ctx.items
    sections = ctx.sections
    coefficients = ctx.coefficients
    project = project || ctx.project
  }

  await docs.generateKS2Excel(act, items, sections, project, estimate, coefficients, outputPath)
  return { path: outputPath }
})

ipcMain.handle('docs:generateKS3', async (_, certId) => {
  const certs = db.getKS3Certs()
  const cert = certs.find(c => c.id === certId)
  if (!cert) throw new Error('Справка не найдена')

  const project = cert.project_id ? db.getProject(cert.project_id) : null
  const folderPath = project?.folder_path || db.getDataPath()
  const timestamp = Date.now()
  const fileName = `КС3_${(cert.number || certId).toString().replace(/[/\\]/g, '-')}_${timestamp}.xlsx`
  const outputPath = path.join(folderPath, 'КС-3', fileName)

  const dir = path.dirname(outputPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  await docs.generateKS3Excel(cert, project, outputPath)
  return { path: outputPath }
})

ipcMain.handle('docs:generateContract', async (_, contractId) => {
  const contract = db.getContract(contractId)
  if (!contract) throw new Error('Договор не найден')

  const project = contract.project_id ? db.getProject(contract.project_id) : null
  const estimate = contract.estimate_id ? db.getEstimate(contract.estimate_id) : null
  const settings = db.getAllSettings()
  const company = parseCompany(settings)

  const folderPath = project?.folder_path || db.getDataPath()
  const timestamp = Date.now()
  const contractNumber = (contract.number || `Договор-${contractId}`).replace(/[/\\]/g, '-')
  const fileName = `Договор_${contractNumber}_${timestamp}.docx`
  const outputPath = path.join(folderPath, 'Договоры', fileName)

  const dir = path.dirname(outputPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  // Определяем тип заказчика и выбираем шаблон
  const clientType = contract.client_type || 'individual'
  const templateId = clientType === 'company' ? 'contract-company' : 'contract-individual'

  // Формируем данные для шаблона
  const data = buildContractData(contract, project, estimate, company, settings)

  // Генерируем документ из Word-шаблона
  templates.generateFromWordTemplate(templateId, data, outputPath)
  db.updateContract(contractId, { file_path: outputPath })
  return { path: outputPath }
})

ipcMain.handle('docs:generateContractFromTemplate', async (_, { contractId, templateId }) => {
  const contract = db.getContract(contractId)
  if (!contract) throw new Error('Договор не найден')

  const project = contract.project_id ? db.getProject(contract.project_id) : null
  const estimate = contract.estimate_id ? db.getEstimate(contract.estimate_id) : null
  const settings = db.getAllSettings()
  const company = parseCompany(settings)
  const folderPath = project?.folder_path || db.getDataPath()

  const contractNumber = (contract.number || `Договор-${contractId}`).replace(/[/\\]/g, '-')
  const fileName = `Договор_${contractNumber}.docx`
  const outputPath = path.join(folderPath, 'Договоры', fileName)

  const dir = path.dirname(outputPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  // Формируем данные для шаблона (единая функция)
  const data = buildContractData(contract, project, estimate, company, settings)

  templates.generateFromWordTemplate(templateId, data, outputPath)
  db.updateContract(contractId, { file_path: outputPath })

  return { path: outputPath }
})

// Генерация Коммерческого предложения из шаблона
ipcMain.handle('docs:generateCommercialOffer', async (_, estimateId) => {
  const { estimate, items, project, settings, companyInfo, folderPath } = getEstimateContext(estimateId)
  const company = companyInfo

  const fileName = `КП_${(estimate.number || 'Б-Н').replace(/[/\\]/g, '-')}.docx`
  const outputPath = path.join(folderPath, 'КП', fileName)

  const dir = path.dirname(outputPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  // Формируем список работ
  const worksList = (items || []).map((item, idx) =>
    `${idx + 1}. ${item.name} - ${item.quantity} ${item.unit} - ${formatAmount(item.total || 0)} руб.`
  ).join('\n')

  const amount = estimate.total_with_vat || estimate.total_cost || 0

  const data = {
    // Шапка компании
    'Общество с ограниченной ответственностью Строительная компания «Подрядчик»': company.fullName || company.name || '',
    '123456, г. Москва, ул. Самая длинная, д. 1, стр.2, оф.3а': company.address || '',
    '+7 (495) 123-45-67': company.phone || '',
    'info@podrjadchik.ru': company.email || '',
    'www.podrjadchik.ru': company.website || '',

    // Заказчик
    'наименование заказчика': estimate.client_name || project?.client_name || '',
    'дата комм. предл': templates.formatDateForDoc(new Date().toISOString()),

    // Реквизиты
    'Наименование участника, ИНН/КПП, юридический адрес, ОГРН, ОКВД, телефоны, email, сайт':
      `${company.name || ''}\nИНН: ${company.inn || ''}, КПП: ${company.kpp || ''}\n${company.address || ''}\nОГРН: ${company.ogrn || ''}\nТел: ${company.phone || ''}, ${company.email || ''}`,
    'банковские реквизиты участника':
      `Р/с: ${company.checkingAccount || ''}\n${company.bankName || ''}\nБИК: ${company.bik || ''}, К/с: ${company.correspondentAccount || ''}`,
    'должность, ФИО и телефон': `${company.directorPosition || 'Директор'} ${company.director || ''}, тел: ${company.phone || ''}`,

    // Работы
    'наименование работ': estimate.name || project?.name || 'Строительно-монтажные работы',
    '__________': formatAmount(amount),
    'Стоимость указана с учётом НДС 20%.': settings?.estimates?.vatEnabled !== false
      ? `Стоимость указана с учётом НДС ${settings?.estimates?.vatRate || 20}%.`
      : 'НДС не облагается.',

    // Сроки
    'начало работ по договору': templates.formatDateForDoc(project?.start_date || new Date().toISOString()),
    'окончание работ по договору': templates.formatDateForDoc(project?.end_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()),

    // Условия
    'порядок оплаты по договору': 'Аванс 30%, остаток после выполнения работ',
    'срок оплаты': '5 рабочих дней',
    'сведения о гарантии': '12 месяцев на выполненные работы',

    // Приложения
    'Приложения:…': 'Приложения:',
    'Приложение 1': 'Приложение 1 - Локальная смета',
    'дата': templates.formatDateForDoc(new Date().toISOString()),

    // Подпись
    'Генеральный директор ООО "Подрядчик"  ____________________  /Фамилия И.О./':
      `${company.directorPosition || 'Генеральный директор'} ${company.name || ''}  ____________________  /${formatShortName(company.director)}/`
  }

  templates.generateFromWordTemplate('commercial-offer', data, outputPath)
  return { path: outputPath }
})

// Генерация дополнительного соглашения
ipcMain.handle('docs:generateAgreement', async (_, { contractId, agreementType, agreementData }) => {
  const contract = db.getContract(contractId)
  if (!contract) throw new Error('Договор не найден')

  const project = contract.project_id ? db.getProject(contract.project_id) : null
  const estimate = contract.estimate_id ? db.getEstimate(contract.estimate_id) : null
  const settings = db.getAllSettings()
  const company = parseCompany(settings)
  const folderPath = project?.folder_path || db.getDataPath()

  // Определяем шаблон (additional/independent/replacement + individual/company)
  const clientType = contract.client_type === 'company' ? 'company' : 'individual'
  const templateId = `${agreementType}-${clientType}`

  const agreementNumber = agreementData?.number || `ДС-${contract.number}-1`
  const fileName = `Доп_согл_${agreementNumber.replace(/[/\\]/g, '-')}.docx`
  const outputPath = path.join(folderPath, 'Договоры', fileName)

  const dir = path.dirname(outputPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  const clientName = contract.client || contract.client_name || project?.client_name || ''
  const amount = agreementData?.amount || contract.amount || 0
  const newAmount = (contract.amount || 0) + amount

  const data = {
    // Номера и даты
    'номер доп. согл.': agreementNumber,
    'номер договора': contract.number || '',
    'дата договора': templates.formatDateForDoc(contract.date),
    'Дата договора': templates.formatDateForDoc(contract.date),
    'дата доп. согл.': templates.formatDateForDoc(agreementData?.date || new Date().toISOString()),
    'ном. дог.': contract.number || '',
    'дата дог.': templates.formatDateForDoc(contract.date),

    // Заказчик
    'Фамилия Имя Отчество': clientName,
    'Фамилия Имя Отчество заказчика': clientName,
    'Фамилия И.О.': formatShortName(clientName),
    'адрес заказчика': contract.client_address || project?.address || '',
    'телефоны заказчика': contract.client_phone || '',
    'ИНН заказчика': contract.client_inn || '',
    'серия  номер паспорта': contract.client_passport || '',
    'кем выдан паспорт и дата выдачи': contract.client_passport_issued || '',
    'код подразд': contract.client_passport_code || '',

    // Подрядчик
    'Название подрядчика': company.name || '',
    'ООО «Подрядчик»': company.name || '',
    'должность, фамилия, инициалы, подписывающего договор': `${company.directorPosition || 'Директора'} ${formatShortName(company.director)}`,
    'должность подписывающего, название подрядчика': `${company.directorPosition || 'Директор'}, ${company.name || ''}`,
    'Устава': company.directorBasis || 'Устава',
    'юридический адрес подрядчика': company.address || '',
    'телефоны подрядчика': company.phone || '',
    'ИНН подрядчика': company.inn || '',
    'КПП подрядчика': company.kpp || '',
    'ОГРН': company.ogrn || '',
    'расч. счёт подрядчика': company.checkingAccount || '',
    'банк подрядчика': company.bankName || '',
    'корр. счёт подрядчика': company.correspondentAccount || '',
    'БИК банка подрядчика': company.bik || '',
    'Фамилия И.О. подрядчика': formatShortName(company.director),

    // Смета
    'номер сметы': estimate?.number || '',
    'дата сметы': templates.formatDateForDoc(estimate?.created_at),
    'номер приложения': agreementData?.appendixNumber || '2',

    // Предмет и суммы
    'предмет доп. соглашения': agreementData?.subject || 'Выполнение дополнительных работ',
    'цена доп. согл.': formatAmount(amount),
    'цена доп. согл. прописью': templates.numberToWords(amount),
    'цена договора': formatAmount(newAmount),
    'цена договора прописью': templates.numberToWords(newAmount),
    'информация о НДС': settings?.estimates?.vatEnabled !== false
      ? `В том числе НДС ${settings?.estimates?.vatRate || 20}%`
      : 'НДС не облагается',

    // Условия оплаты
    'Изменить порядок и условия оплаты по Договору:': agreementData?.changePayment ? 'Изменить порядок и условия оплаты по Договору:' : '',
    'один или несколько подпунктов о порядке оплаты работ (определяются в программе)': agreementData?.paymentTerms || '',

    // Сроки
    'Изменить сроки выполнения работ по Договору:': agreementData?.changeTerms ? 'Изменить сроки выполнения работ по Договору:' : '',
    'Начало работ по договору': templates.formatDateForDoc(agreementData?.startDate || contract.start_date),
    'Окончание работ по договору': templates.formatDateForDoc(agreementData?.endDate || contract.end_date),
    'начало работ по договору': templates.formatDateForDoc(agreementData?.startDate || contract.start_date),
    'окончание работ по договору': templates.formatDateForDoc(agreementData?.endDate || contract.end_date),

    // Приложения
    'Приложения к доп. соглашению:': 'Приложения к доп. соглашению:',
    'приложение №1, №2 и т.д.': agreementData?.appendices || 'Приложение №1 - Дополнительная смета'
  }

  templates.generateFromWordTemplate(templateId, data, outputPath)
  return { path: outputPath }
})

// Генерация сметы в PDF (через HTML + printToPDF)
ipcMain.handle('docs:generateEstimatePDF', async (_, estimateId) => {
  let printWindow = null
  try {
    const { estimate, items, folderPath } = getEstimateContext(estimateId)

    const fileName = `Смета_${(estimate.number || 'Б-Н').replace(/[/\\]/g, '-')}.pdf`
    const outputPath = path.join(folderPath, 'Сметы', fileName)

    const dir = path.dirname(outputPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

    console.log('[PDF] Генерация HTML...')
    const htmlContent = docs.generateEstimateHTML(estimate, items)

    console.log('[PDF] Создание скрытого окна...')
    const { BrowserWindow } = require('electron')
    printWindow = new BrowserWindow({
      width: 1200,
      height: 900,
      show: false,
      webPreferences: {
        contextIsolation: true,
        sandbox: false
      }
    })

    // Загружаем HTML через loadURL с data URI
    console.log('[PDF] Загрузка HTML...')
    await loadHtmlForPDF(printWindow, htmlContent, 15000)

    console.log('[PDF] printToPDF...')
    const pdfData = await printWindow.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      marginsType: 1 // 0 = default, 1 = none, 2 = minimum
    })

    fs.writeFileSync(outputPath, pdfData)
    console.log('[PDF] Сохранён:', outputPath)

    printWindow.close()
    printWindow = null

    return { path: outputPath }
  } catch (error) {
    console.error('[PDF] ОШИБКА:', error.message, error.stack)
    if (printWindow) {
      try { printWindow.close() } catch (e) { /* ignore */ }
    }
    throw error
  }
})

// Экспорт сметы в HTML файл
ipcMain.handle('docs:generateEstimateHTML', async (_, estimateId) => {
  const { estimate, items, folderPath } = getEstimateContext(estimateId)

  const fileName = `Смета_${(estimate.number || '').replace(/[/\\]/g, '-')}.html`
  const outputPath = path.join(folderPath, 'Сметы', fileName)

  const dir = path.dirname(outputPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  docs.generateEstimateHTMLFile(estimate, items, outputPath)

  return { path: outputPath }
})

// Экспорт дефектовки в формате Смета 2007
ipcMain.handle('docs:generateDefektovka', async (_, estimateId) => {
  const { estimate, items, sections, coefficients, project, companyInfo, folderPath } = getEstimateContext(estimateId)

  const timestamp = Date.now()
  const fileName = `Дефектовка_${(estimate.number || '').replace(/[/\\]/g, '-')}_${timestamp}.xlsx`
  const outputPath = path.join(folderPath, 'Сметы', fileName)

  const dir = path.dirname(outputPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  await docs.generateDefektovkaExcel(estimate, items, sections, coefficients, project, companyInfo, outputPath)

  return { path: outputPath }
})

// Генерация М-29 в Excel (через шаблон)
ipcMain.handle('docs:generateM29', async (_, m29Id) => {
  const m29Doc = db.getM29Doc(m29Id)
  if (!m29Doc) throw new Error('Документ М-29 не найден')

  const items = db.getM29Items(m29Id) || []
  const project = m29Doc.project_id ? db.getProject(m29Doc.project_id) : null
  const folderPath = project?.folder_path || db.getDataPath()

  const timestamp = Date.now()
  const fileName = `М-29_${(m29Doc.number || '').replace(/[/\\]/g, '-')}_${timestamp}.xlsx`
  const outputPath = path.join(folderPath, 'Документы', fileName)

  const dir = path.dirname(outputPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  await docs.generateM29Excel(project, m29Doc, items, outputPath)

  return { path: outputPath }
})

// === СМЕТА 2007: Генерация ФОТ (Ведомость объёмов работ) ===
ipcMain.handle('docs:generateFOT', async (_, estimateId) => {
  const { estimate, items, sections, coefficients, folderPath } = getEstimateContext(estimateId)

  const fileName = `ФОТ_${(estimate.number || 'Б-Н').replace(/[/\\]/g, '-')}.xlsx`
  const outputPath = path.join(folderPath, 'Сметы', fileName)

  const dir = path.dirname(outputPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  await docs.generateFOTExcel(estimate, items, sections, coefficients, outputPath)

  return { path: outputPath }
})

// === СМЕТА 2007: Генерация Сметы в формате Смета 2007 ===
ipcMain.handle('docs:generateSmeta2007', async (_, estimateId) => {
  const { estimate, items, sections, coefficients, project, companyInfo, folderPath } = getEstimateContext(estimateId)

  const fileName = `Смета2007_${(estimate.number || 'Б-Н').replace(/[/\\]/g, '-')}.xlsx`
  const outputPath = path.join(folderPath, 'Сметы', fileName)

  const dir = path.dirname(outputPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  await docs.generateSmeta2007Excel(estimate, items, sections, coefficients, project, companyInfo, outputPath)

  return { path: outputPath }
})

// === Генерация Заявки на материалы из шаблона ===
ipcMain.handle('docs:generateMaterialRequest', async (_, estimateId) => {
  const { estimate, items, project, folderPath } = getEstimateContext(estimateId)

  const fileName = `Заявка_${(estimate.number || 'Б-Н').replace(/[/\\]/g, '-')}.xlsx`
  const outputPath = path.join(folderPath, 'Документы', fileName)

  const dir = path.dirname(outputPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  // Собираем материалы из позиций сметы
  const materials = []
  for (const item of items || []) {
    const itemMaterials = db.getEstimateItemMaterials(item.id) || []
    for (const mat of itemMaterials) {
      const existing = materials.find(m => m.name === mat.name && m.unit === mat.unit)
      if (existing) {
        existing.quantity += (mat.quantity || 0) * (item.quantity || 1)
      } else {
        materials.push({
          name: mat.name,
          unit: mat.unit || 'шт',
          quantity: (mat.quantity || 0) * (item.quantity || 1),
          price: mat.price || 0
        })
      }
    }
  }

  // Копируем шаблон и заполняем (Excel требует ExcelJS)
  const templatePath = path.join(templates.getTemplatesPath(), 'DocTemplates', 'Заявка на материалы.xltx')
  if (!fs.existsSync(templatePath)) {
    throw new Error('Шаблон не найден: ' + templatePath)
  }

  const ExcelJS = require('exceljs')
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(templatePath)
  const sheet = workbook.getWorksheet(1)

  // Подгоняем ширины по образцу
  const materialColumnWidths = [5.71, 67, 12.29, 9, 16, 18]
  materialColumnWidths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w
  })

  // Заполняем шапку
  sheet.getCell('A1').value = `Заявка на материалы к смете ${estimate.number || ''}`
  sheet.getCell('A2').value = `Объект: ${project?.name || estimate.name || ''}`
  sheet.getCell('A3').value = `Дата: ${templates.formatDateForDoc(new Date().toISOString())}`

  // Заполняем таблицу материалов (начиная с 6 строки)
  let row = 6
  materials.forEach((mat, idx) => {
    const name = mat.name || ''
    sheet.getCell(`A${row}`).value = idx + 1
    sheet.getCell(`B${row}`).value = name
    sheet.getCell(`C${row}`).value = mat.unit
    sheet.getCell(`D${row}`).value = mat.quantity
    sheet.getCell(`E${row}`).value = mat.price
    sheet.getCell(`F${row}`).value = mat.quantity * mat.price
    sheet.getCell(`A${row}`).alignment = { horizontal: 'center', vertical: 'middle' }
    sheet.getCell(`B${row}`).alignment = { horizontal: 'left', vertical: 'top', wrapText: true }
    sheet.getCell(`C${row}`).alignment = { horizontal: 'center', vertical: 'middle' }
    sheet.getCell(`D${row}`).alignment = { horizontal: 'right', vertical: 'middle' }
    sheet.getCell(`E${row}`).alignment = { horizontal: 'right', vertical: 'middle' }
    sheet.getCell(`F${row}`).alignment = { horizontal: 'right', vertical: 'middle' }
    sheet.getCell(`D${row}`).numFmt = '#,##0.00'
    sheet.getCell(`E${row}`).numFmt = '#,##0.00'
    sheet.getCell(`F${row}`).numFmt = '#,##0.00'
    sheet.getRow(row).height = Math.max(18, Math.ceil(name.length / 55) * 14)
    row++
  })

  await workbook.xlsx.writeFile(outputPath)
  return { path: outputPath }
})

// === Генерация Счёт-фактуры из шаблона ===
ipcMain.handle('docs:generateInvoice', async (_, { estimateId, invoiceData }) => {
  const { estimate, items, project, settings, companyInfo, folderPath } = getEstimateContext(estimateId)
  const company = companyInfo

  const timestamp = Date.now()
  const invoiceNumber = invoiceData?.number || `СФ-${estimate.number || Date.now()}`
  const fileName = `Счёт-фактура_${invoiceNumber.replace(/[/\\]/g, '-')}_${timestamp}.xlsx`
  const outputPath = path.join(folderPath, 'Документы', fileName)

  const dir = path.dirname(outputPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  const ExcelJS = require('exceljs')
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Счёт-фактура')

  // Настройка ширины столбцов
  sheet.columns = [
    { width: 5.14 },  // A
    { width: 58.43 }, // B - Наименование
    { width: 7.57 },  // C - Ед.
    { width: 10.57 }, // D - Кол-во
    { width: 15 },    // E - Цена
    { width: 16 },    // F - Сумма
  ]

  const amount = estimate.total_with_vat || estimate.total_cost || 0
  const vatRate = settings?.estimates?.vatRate || 20
  const vatEnabled = settings?.estimates?.vatEnabled !== false
  const vatAmount = vatEnabled ? amount * vatRate / (100 + vatRate) : 0
  const amountWithoutVat = amount - vatAmount

  // Заголовок
  sheet.mergeCells('A1:F1')
  sheet.getCell('A1').value = `СЧЁТ-ФАКТУРА № ${invoiceNumber}`
  sheet.getCell('A1').font = { bold: true, size: 14 }
  sheet.getCell('A1').alignment = { horizontal: 'center' }

  sheet.mergeCells('A2:F2')
  sheet.getCell('A2').value = `от ${invoiceData?.date || new Date().toISOString().split('T')[0]}`
  sheet.getCell('A2').alignment = { horizontal: 'center' }

  // Реквизиты
  let row = 4
  sheet.getCell(`A${row}`).value = `Продавец: ${company?.name || 'ООО "ПОДРЯДЧИК"'}`
  row++
  sheet.getCell(`A${row}`).value = `Покупатель: ${invoiceData?.client_name || project?.client_name || ''}`
  row += 2

  // Заголовки таблицы
  const headers = ['№', 'Наименование работ/услуг', 'Ед.', 'Кол-во', 'Цена', 'Сумма']
  headers.forEach((h, i) => {
    const cell = sheet.getCell(row, i + 1)
    cell.value = h
    cell.font = { bold: true }
    cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  })
  row++

  // Позиции
  let itemNum = 0
  let total = 0
  for (const item of items) {
    itemNum++
    const price = (item.labor_price || 0) + (item.material_price || 0)
    const sum = price * (item.quantity || 1)
    total += sum

    const name = item.name || ''
    sheet.getCell(row, 1).value = itemNum
    sheet.getCell(row, 2).value = name
    sheet.getCell(row, 3).value = item.unit || 'шт.'
    sheet.getCell(row, 4).value = item.quantity || 1
    sheet.getCell(row, 5).value = price
    sheet.getCell(row, 5).numFmt = '#,##0.00'
    sheet.getCell(row, 6).value = sum
    sheet.getCell(row, 6).numFmt = '#,##0.00'

    sheet.getCell(row, 1).alignment = { horizontal: 'center', vertical: 'middle' }
    sheet.getCell(row, 2).alignment = { horizontal: 'left', vertical: 'top', wrapText: true }
    sheet.getCell(row, 3).alignment = { horizontal: 'center', vertical: 'middle' }
    sheet.getCell(row, 4).alignment = { horizontal: 'right', vertical: 'middle' }
    sheet.getCell(row, 4).numFmt = '#,##0.00'
    sheet.getCell(row, 5).alignment = { horizontal: 'right', vertical: 'middle' }
    sheet.getCell(row, 6).alignment = { horizontal: 'right', vertical: 'middle' }

    for (let c = 1; c <= 6; c++) {
      sheet.getCell(row, c).border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
    }
    sheet.getRow(row).height = Math.max(18, Math.ceil(name.length / 55) * 14)
    row++
  }

  // Итоги
  row++
  sheet.mergeCells(`A${row}:E${row}`)
  sheet.getCell(`A${row}`).value = 'Итого без НДС:'
  sheet.getCell(`A${row}`).alignment = { horizontal: 'right' }
  sheet.getCell(`F${row}`).value = amountWithoutVat
  sheet.getCell(`F${row}`).numFmt = '#,##0.00'
  row++

  sheet.mergeCells(`A${row}:E${row}`)
  sheet.getCell(`A${row}`).value = `НДС (${vatRate}%):`
  sheet.getCell(`A${row}`).alignment = { horizontal: 'right' }
  sheet.getCell(`F${row}`).value = vatAmount
  sheet.getCell(`F${row}`).numFmt = '#,##0.00'
  row++

  sheet.mergeCells(`A${row}:E${row}`)
  sheet.getCell(`A${row}`).value = 'ВСЕГО:'
  sheet.getCell(`A${row}`).alignment = { horizontal: 'right' }
  sheet.getCell(`A${row}`).font = { bold: true }
  sheet.getCell(`F${row}`).value = amount
  sheet.getCell(`F${row}`).numFmt = '#,##0.00'
  sheet.getCell(`F${row}`).font = { bold: true }

  await workbook.xlsx.writeFile(outputPath)
  return { path: outputPath }
})

// Открыть файл/папку
ipcMain.handle('shell:openPath', (_, filePath) => {
  shell.openPath(filePath)
})

ipcMain.handle('shell:showItemInFolder', (_, filePath) => {
  shell.showItemInFolder(filePath)
})

ipcMain.handle('shell:openExternal', (_, url) => {
  shell.openExternal(url)
})

// Диалоги
ipcMain.handle('dialog:showSaveDialog', async (_, options) => {
  return dialog.showSaveDialog(mainWindow, options)
})

ipcMain.handle('dialog:showOpenDialog', async (_, options) => {
  return dialog.showOpenDialog(mainWindow, options)
})

// Путь к данным
ipcMain.handle('app:getDataPath', () => db.getDataPath())


// === IPC: Лицензирование ===
ipcMain.handle('license:check', async () => {
  return license.getLicenseInfo()
})

ipcMain.handle('license:activate', async (event, { key, email }) => {
  return license.activateLicense(key, email)
})

ipcMain.handle('license:hasFeature', async (event, feature) => {
  return license.hasFeature(feature)
})

ipcMain.handle('license:getHWID', async () => {
  return license.getHardwareId()
})

ipcMain.handle('license:extend', async (event, key) => {
  // Получаем email из текущей лицензии, т.к. frontend передаёт только ключ
  const currentInfo = license.getLicenseInfo()
  const email = currentInfo.email || ''
  return license.extendLicense(key, email)
})


// === IPC: Шаблоны документов ===
ipcMain.handle('templates:getList', () => templates.getTemplatesList())

ipcMain.handle('templates:open', (_, templateId) => {
  try {
    return { success: true, path: templates.openTemplate(templateId) }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('templates:generate', async (_, { templateId, data, outputPath }) => {
  try {
    const result = await templates.generateDocument(templateId, data, outputPath)
    return { success: true, path: result }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('templates:copy', async (_, { templateId, outputDir, filename }) => {
  try {
    const result = templates.copyTemplateForDocument(templateId, outputDir, filename)
    return { success: true, path: result }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('templates:openFolder', () => {
  const templatesPath = templates.getTemplatesPath()
  shell.openPath(templatesPath)
  return templatesPath
})

// === IPC: Импорт документов ===
ipcMain.handle('import:selectExcelFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Выберите файл сметы',
    filters: [
      { name: 'Excel Files', extensions: ['xlsx', 'xls', 'xltx'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  })

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, canceled: true }
  }

  return { success: true, filePath: result.filePaths[0] }
})

ipcMain.handle('import:parseEstimateExcel', async (_, filePath) => {
  try {
    const data = await docs.importEstimateFromExcel(filePath)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// Импорт дефектовки формата Смета 2007
ipcMain.handle('import:parseDefektovka', async (_, filePath) => {
  try {
    const data = await docs.importDefektovkaFromExcel(filePath)
    return { success: true, data }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// Создание сметы из данных дефектовки (с разделами и коэффициентами)
ipcMain.handle('import:createEstimateFromDefektovka', async (_, { projectId, defektovkaData }) => {
  try {
    // Создаём смету
    const estimate = db.createEstimate({
      project_id: projectId,
      name: defektovkaData.estimate?.name || 'Импорт дефектовки',
      number: defektovkaData.estimate?.number || `ДЕФ-${Date.now()}`
    })

    // Сохраняем коэффициенты
    if (defektovkaData.coefficients) {
      db.setCoefficients(estimate.id, defektovkaData.coefficients)
    }

    // Создаём разделы
    const sectionMap = new Map()
    if (defektovkaData.sections && defektovkaData.sections.length > 0) {
      defektovkaData.sections.forEach((section, index) => {
        const created = db.createEstimateSection({
          estimate_id: estimate.id,
          name: section.name,
          sort_order: index
        })
        sectionMap.set(section.name, created.id)
      })
    }

    // Добавляем позиции
    if (defektovkaData.items && defektovkaData.items.length > 0) {
      defektovkaData.items.forEach((item, index) => {
        const sectionId = item.section ? sectionMap.get(item.section) : null
        db.createEstimateItem({
          estimate_id: estimate.id,
          section_id: sectionId,
          code: item.code || '',
          name: item.name,
          unit: item.unit || 'шт',
          quantity: item.quantity || 0,
          price_smeta: item.estimate_price || item.unit_price || 0,
          row_type: item.type || 'rascenka',
          sort_order: index
        })
      })
    }

    return {
      success: true,
      estimate,
      stats: {
        sections: defektovkaData.sections?.length || 0,
        items: defektovkaData.items?.length || 0,
        totals: defektovkaData.totals
      }
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

ipcMain.handle('import:createEstimateFromData', async (_, { projectId, estimateData }) => {
  try {
    // Создаём смету
    const estimate = db.createEstimate({
      project_id: projectId,
      name: estimateData.name || 'Импортированная смета',
      number: estimateData.number || `ИМП-${Date.now()}`
    })

    // Добавляем позиции
    if (estimateData.items && estimateData.items.length > 0) {
      estimateData.items.forEach((item, index) => {
        db.createEstimateItem({
          estimate_id: estimate.id,
          code: item.code || '',
          name: item.name,
          unit: item.unit || 'шт',
          quantity: item.quantity || 0,
          price_smeta: item.unit_price || 0,
          sort_order: index
        })
      })
    }

    return { success: true, estimate }
  } catch (error) {
    return { success: false, error: error.message }
  }
})

// =========================================
// === СМЕТА 2007: IPC HANDLERS ===
// =========================================

// Коэффициенты
ipcMain.handle('coefficients:get', (_, estimateId) => db.getCoefficients(estimateId))
ipcMain.handle('coefficients:set', (_, estimateId, data) => db.setCoefficients(estimateId, data))
ipcMain.handle('estimates:recalculateWithCoefficients', (_, estimateId) => db.recalculateEstimate(estimateId))

// Разделы сметы
ipcMain.handle('estimateSections:getAll', (_, estimateId) => db.getEstimateSections(estimateId))
ipcMain.handle('estimateSections:create', (_, data) => db.createEstimateSection(data))
ipcMain.handle('estimateSections:delete', (_, id) => db.deleteEstimateSection(id))

// Шаблоны
ipcMain.handle('templates:getAll', () => db.getTemplates())
ipcMain.handle('templates:get', (_, id) => db.getTemplate(id))
ipcMain.handle('templates:saveFromEstimate', (_, estimateId, name, category, description) =>
  db.saveAsTemplate(estimateId, name, category, description))
ipcMain.handle('templates:createEstimate', (_, templateId, projectId, name) =>
  db.createEstimateFromTemplate(templateId, projectId, name))
ipcMain.handle('templates:delete', (_, id) => db.deleteTemplate(id))

// Сценарии маржи
ipcMain.handle('marginScenarios:getAll', (_, estimateId) => db.getMarginScenarios(estimateId))
ipcMain.handle('marginScenarios:create', (_, data) => db.createMarginScenario(data))
ipcMain.handle('marginScenarios:calculate', (_, estimateId, scenarioId) => db.calculateScenario(estimateId, scenarioId))

// === Запуск приложения ===
app.whenReady().then(() => {
  // Разрешение доступа к микрофону для голосового ввода
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['media', 'microphone', 'audioCapture'];
    if (allowedPermissions.includes(permission)) {
      callback(true);
    } else {
      callback(false);
    }
  });

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  db.closeDatabase()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  db.closeDatabase()
})

app.on('will-quit', () => {
  db.saveDatabase()
})
