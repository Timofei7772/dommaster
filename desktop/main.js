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
const { buildContentSecurityPolicy } = require('./src/main/csp-policy')

// Наши модули
const db = require('./src/database')
const docs = require('./src/documents')
const license = require('./src/license-secure') // ЗАЩИЩЁННАЯ версия
const templates = require('./src/templates')
const documentContext = require('./src/document-context')
const documentKernel = require('./src/document-kernel')
const documentTemplateAdapters = require('./src/document-template-adapters')
const documentSnapshots = require('./src/document-snapshots')
const { resolveWritableFolderPath } = require('./src/output-paths')
const { loadHtmlForPdfWindow, openPathOrThrow } = require('./src/main/pdf-runtime')
const { ensurePdfExportAllowed } = require('./src/main/pdf-access')
const deviceStorage = require('./src/main/device-storage')
const { ensureEstimateCreationAllowed, initializeDemoEstimateStorage, registerCreatedEstimate } = require('./src/main/demo-estimate-limit')
const { ensureLogsDirectory, exportDiagnosticsBundle } = require('./src/main/diagnostics-bundle')
const { generateDocumentPackage } = require('./src/main/document-package')
const { createRuntimeLogger, installProcessDiagnostics, registerLoggedHandler } = require('./src/main/runtime-logger')
const { runSystemSelfCheck } = require('./src/main/system-self-check')
const { launchBackend, shutdownBackend, getBackendUrl } = require('./src/main/backend-launcher')

let mainWindow
const isDev = !app.isPackaged
const appVersion = require('./package.json').version
let runtimeLogger = null

const getRuntimeLogger = () => {
  if (!runtimeLogger) {
    runtimeLogger = createRuntimeLogger({
      appDataPath: app.getPath('userData')
    })
  }
  return runtimeLogger
}

const handleWithRuntimeLogging = (channel, handler) => {
  registerLoggedHandler(
    ipcMain,
    {
      logError: (type, data) => getRuntimeLogger().logError(type, data)
    },
    channel,
    handler
  )
}

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
const parseCompany = documentContext.parseCompany

// Единый снимок данных сметы для документов
const getEstimateContext = (estimateId, options = {}) => documentKernel.buildDocumentContext(db, estimateId, options)
const getWritableOutputRoot = (preferredPath) => resolveWritableFolderPath(preferredPath, db.getDataPath())
const runEstimateCreationWithLicense = async (createFn, options = {}) => {
  const { status } = await ensureEstimateCreationAllowed(license, db, { deviceStorage })
  const result = await createFn()
  const shouldCount = options.shouldCount ? options.shouldCount(result) : true

  if (shouldCount) {
    registerCreatedEstimate({ status, dbFacade: db, deviceStorage })
  }

  return result
}

// Универсальная функция: HTML строка → PDF файл
const htmlToPdfFile = async (htmlContent, outputPath, landscape = false) => {
  const { BrowserWindow } = require('electron')
  const printWin = new BrowserWindow({
    width: 1200, height: 900, show: false,
    webPreferences: { contextIsolation: true, sandbox: false }
  })
  let preparedHtml = null
  try {
    preparedHtml = await loadHtmlForPdfWindow(printWin, htmlContent, { timeoutMs: 15000 })
    const pdfData = await printWin.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      marginsType: 1,
      landscape: !!landscape
    })
    const dir = path.dirname(outputPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(outputPath, pdfData)
    return outputPath
  } finally {
    preparedHtml?.cleanup?.()
    if (printWin && !printWin.isDestroyed()) printWin.close()
  }
}

const applyDemoWatermark = (htmlContent, watermarkText = 'DEMO VERSION') => {
  const watermark = '<div style="position:fixed;top:42%;left:5%;right:5%;text-align:center;font-size:72px;font-weight:800;letter-spacing:10px;color:rgba(239,68,68,0.16);transform:rotate(-28deg);z-index:9999;pointer-events:none;">' + watermarkText + '</div>'
  return htmlContent.includes('</body>') ? htmlContent.replace('</body>', `${watermark}</body>`) : `${watermark}${htmlContent}`
}

const generateEstimatePdfFile = async (estimateId, options = {}) => {
  await ensurePdfExportAllowed(license, { feature: options.licenseFeature || 'estimate_pdf' })
  const { estimate, project, items, sections, companyInfo, folderPath } = getEstimateContext(estimateId)
  const safeNumber = (estimate.number || 'Б-Н').replace(/[/\\]/g, '-')
  const fileName = options.fileName || `Смета_${safeNumber}${options.withTimestamp === false ? '' : `_${Date.now()}`}.pdf`
  const outputPath = options.outputPath || path.join(folderPath, 'Сметы', fileName)

  const htmlContent = docs.generateEstimateHTML(estimate, items, project, companyInfo, sections)
  const finalHtml = options.demoWatermark ? applyDemoWatermark(htmlContent, options.demoWatermarkText || 'DEMO VERSION') : htmlContent
  await htmlToPdfFile(finalHtml, outputPath)

  if (options.updateEstimateFilePath) {
    try {
      db.updateEstimate(estimateId, { file_path: outputPath })
    } catch (e) {
      console.log('Не удалось обновить file_path:', e.message)
    }
  }

  return { path: outputPath }
}

const copyGeneratedFileToPackage = async (sourcePath, packageDir) => {
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    throw new Error(`Не найден сгенерированный файл: ${sourcePath}`)
  }

  if (!fs.existsSync(packageDir)) {
    fs.mkdirSync(packageDir, { recursive: true })
  }

  const sourceDir = path.dirname(sourcePath)
  if (path.resolve(sourceDir) === path.resolve(packageDir)) {
    return { path: sourcePath }
  }

  const targetPath = path.join(packageDir, path.basename(sourcePath))
  fs.copyFileSync(sourcePath, targetPath)
  return { path: targetPath }
}

const generateKS2File = async (actId) => {
  await ensurePdfExportAllowed(license, { feature: 'core_document' })
  const acts = db.getKS2Acts()
  const act = acts.find(a => a.id === actId)
  if (!act) throw new Error('Акт не найден')

  let project = act.project_id ? db.getProject(act.project_id) : null
  let context = null
  const folderPath = getWritableOutputRoot(project?.folder_path)
  const timestamp = Date.now()
  const fileName = `КС2_${(act.number || actId).toString().replace(/[/\\]/g, '-')}_${timestamp}.pdf`
  const outputPath = path.join(folderPath, 'КС-2', fileName)

  let items = []
  let sections = []
  let estimate = null
  let coefficients = { work_coef: 1.8, material_coef: 1.04 }
  if (act.estimate_id) {
    context = getEstimateContext(act.estimate_id)
    estimate = context.estimate
    items = context.items
    sections = context.sections
    coefficients = context.coefficients
    project = project || context.project
  }

  const prepared = documentTemplateAdapters.prepareRendererDocument({
    type: 'ks2',
    context: context || {
      estimate,
      project,
      items,
      sections,
      coefficients,
      execution: {
        completedWorks: (items || []).filter((item) => !item.row_type || item.row_type === 'rascenka' || item.row_type === 'work' || item.row_type === 'pr'),
      },
      settings: db.getAllSettings(),
      companyInfo: parseCompany(db.getAllSettings()),
      meta: {
        createdAt: estimate?.created_at || new Date().toISOString(),
        updatedAt: estimate?.updated_at || estimate?.created_at || new Date().toISOString(),
      },
    },
    source: { act },
    helpers: { formatAmount },
  })

  const htmlContent = docs.generateKS2HTML(
    prepared.legacyArgs.act,
    prepared.legacyArgs.items,
    prepared.legacyArgs.sections,
    prepared.legacyArgs.project,
    prepared.legacyArgs.estimate,
    prepared.legacyArgs.coefficients
  )
  await htmlToPdfFile(htmlContent, outputPath)
  return { path: outputPath }
}

const generateKS3File = async (certId) => {
  await ensurePdfExportAllowed(license, { feature: 'core_document' })
  const certs = db.getKS3Certs()
  const cert = certs.find(c => c.id === certId)
  if (!cert) throw new Error('Справка не найдена')

  const project = cert.project_id ? db.getProject(cert.project_id) : null
  const folderPath = getWritableOutputRoot(project?.folder_path)
  const timestamp = Date.now()
  const fileName = `КС3_${(cert.number || certId).toString().replace(/[/\\]/g, '-')}_${timestamp}.pdf`
  const outputPath = path.join(folderPath, 'КС-3', fileName)

  const prepared = documentTemplateAdapters.prepareRendererDocument({
    type: 'ks3',
    context: {
      estimate: {
        id: cert.estimate_id || null,
        number: cert.estimate_number || '',
        total_with_vat: cert.total_with_vat ?? cert.amount ?? 0,
        subtotal: cert.total_without_vat ?? cert.amount_without_vat ?? 0,
        vat_cost: cert.vat_amount ?? cert.total_vat ?? 0,
        vat_percent: cert.vat_percent ?? 0,
      },
      project,
      settings: db.getAllSettings(),
      companyInfo: parseCompany(db.getAllSettings()),
      meta: {
        createdAt: cert.date || new Date().toISOString(),
        updatedAt: cert.date || new Date().toISOString(),
      },
    },
    source: { cert },
    helpers: { formatAmount },
  })

  const htmlContent = docs.generateKS3HTML(prepared.legacyArgs.cert, prepared.legacyArgs.project)
  await htmlToPdfFile(htmlContent, outputPath)
  return { path: outputPath }
}

const generateContractFile = async (contractId, options = {}) => {
  const contract = db.getContract(contractId)
  if (!contract) throw new Error('Договор не найден')

  const project = contract.project_id ? db.getProject(contract.project_id) : null
  const estimate = contract.estimate_id ? db.getEstimate(contract.estimate_id) : null
  const settings = db.getAllSettings()
  const company = parseCompany(settings)

  const folderPath = getWritableOutputRoot(project?.folder_path)
  const contractNumber = (contract.number || `Договор-${contractId}`).replace(/[/\\]/g, '-')
  const fileName = options.fileName || `Договор_${contractNumber}${options.withTimestamp === false ? '' : `_${Date.now()}`}.docx`
  const outputPath = options.outputPath || path.join(folderPath, 'Договоры', fileName)

  const dir = path.dirname(outputPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  const clientType = contract.client_type || 'individual'
  const templateId = options.templateId || (clientType === 'company' ? 'contract-company' : 'contract-individual')

  if (estimate?.id) {
    const context = getEstimateContext(estimate.id, { contractId })
    documentTemplateAdapters.generateDocxFromKernel({
      type: 'contract',
      context,
      outputPath,
      options: { templateId },
      helpers: {
        templates,
        formatAmount,
        formatShortName,
      },
    })
  } else {
    const data = buildContractData(contract, project, estimate, company, settings)
    templates.generateFromWordTemplate(templateId, data, outputPath)
  }

  db.updateContract(contractId, { file_path: outputPath })
  return { path: outputPath }
}

const generateFOTFile = async (estimateId) => {
  await ensurePdfExportAllowed(license, { feature: 'core_document' })
  const context = getEstimateContext(estimateId)
  const { estimate, folderPath } = context

  const fileName = `ФОТ_${(estimate.number || 'Б-Н').replace(/[/\\]/g, '-')}.pdf`
  const outputPath = path.join(folderPath, 'Сметы', fileName)

  const prepared = documentTemplateAdapters.prepareRendererDocument({
    type: 'fot',
    context,
    helpers: { formatAmount },
  })

  const htmlContent = docs.generateFOTHTML(
    prepared.legacyArgs.estimate,
    prepared.legacyArgs.items,
    prepared.legacyArgs.sections,
    prepared.legacyArgs.coefficients
  )
  await htmlToPdfFile(htmlContent, outputPath)

  return { path: outputPath }
}

const generateMaterialRequestFile = async (estimateId) => {
  await ensurePdfExportAllowed(license, { feature: 'core_document' })
  const context = getEstimateContext(estimateId)
  const { estimate, project, folderPath } = context

  const fileName = `Заявка_${(estimate.number || 'Б-Н').replace(/[/\\]/g, '-')}.pdf`
  const outputPath = path.join(folderPath, 'Документы', fileName)

  const prepared = documentTemplateAdapters.prepareRendererDocument({
    type: 'materials_request',
    context,
    helpers: { formatAmount },
  })

  const htmlContent = docs.generateMaterialRequestHTML(
    prepared.legacyArgs.estimate,
    prepared.legacyArgs.project,
    prepared.legacyArgs.rows,
    prepared.legacyArgs.totals
  )

  await htmlToPdfFile(htmlContent, outputPath)
  return { path: outputPath }
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
  const cspPolicy = buildContentSecurityPolicy(isDev)
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [cspPolicy]
      }
    })
  })

  // Очистка кэша при старте для загрузки свежих файлов
  await session.defaultSession.clearCache()

  // Инициализация базы данных (асинхронная для sql.js)
  try {
    await db.initDatabase()
    initializeDemoEstimateStorage(db, { deviceStorage })
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

  // Импорт регионов (если есть regions.json)
  try {
    const result = await db.importRegions()
  } catch (err) {
    console.error('Ошибка импорта регионов:', err)
  }

  // Тихая самопроверка ядра документов на реальных production-функциях.
  try {
    const selfCheck = runSystemSelfCheck({
      generateDocument: documentKernel.generateDocument,
      logger: getRuntimeLogger(),
    })
    if (!selfCheck.ok) {
      console.warn('Self-check issues:', selfCheck.issues.join(', '))
    }
  } catch (err) {
    console.error('Ошибка self-check:', err)
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
            await runEstimateCreationWithLicense(() => db.createEstimate(estimate))
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
ipcMain.handle('estimates:create', async (_, data) => {
  try {
    return await runEstimateCreationWithLicense(() => db.createEstimate(data))
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
ipcMain.handle('estimates:convertFromDefect', async (_, defectId, options) => {
  return runEstimateCreationWithLicense(
    () => db.convertDefectToEstimate(defectId, options || {}),
    { shouldCount: (result) => Boolean(result?.success && result?.data?.id) }
  )
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
ipcMain.handle('catalog:createWork', (_, data) => db.createWork(data))
ipcMain.handle('catalog:getMaterials', (_, search) => db.searchReferenceMaterials(search))
ipcMain.handle('catalog:getRegions', () => db.getReferenceRegions())
ipcMain.handle('catalog:createRegion', (_, data) => db.createReferenceRegion(data))
ipcMain.handle('catalog:deleteRegion', (_, id) => db.deleteReferenceRegion(id))

// Справочники (хранятся как JSON в settings)
ipcMain.handle('catalog:getUnits', () => {
  const raw = db.getSetting('reference_units')
  if (raw) return JSON.parse(raw)
  // Значения по умолчанию
  const defaults = [
    { id: 1, code: 'м²', name: 'кв. метр', fullName: 'квадратный метр' },
    { id: 2, code: 'м³', name: 'куб. метр', fullName: 'кубический метр' },
    { id: 3, code: 'м.п.', name: 'пог. метр', fullName: 'погонный метр' },
    { id: 4, code: 'шт', name: 'штука', fullName: 'штука' },
    { id: 5, code: 'компл', name: 'комплект', fullName: 'комплект' },
    { id: 6, code: 'кг', name: 'килограмм', fullName: 'килограмм' },
    { id: 7, code: 'т', name: 'тонна', fullName: 'тонна' },
    { id: 8, code: 'л', name: 'литр', fullName: 'литр' },
    { id: 9, code: 'упак', name: 'упаковка', fullName: 'упаковка' },
    { id: 10, code: 'рулон', name: 'рулон', fullName: 'рулон' },
    { id: 11, code: 'точка', name: 'точка', fullName: 'точка подключения' },
    { id: 12, code: 'узел', name: 'узел', fullName: 'узел соединения' },
  ]
  db.setSetting('reference_units', JSON.stringify(defaults))
  return defaults
})
ipcMain.handle('catalog:setUnits', (_, data) => {
  db.setSetting('reference_units', JSON.stringify(data))
  return { success: true }
})

ipcMain.handle('catalog:getCategories', () => {
  const raw = db.getSetting('reference_categories')
  if (raw) return JSON.parse(raw)
  const defaults = [
    { id: 1, code: 'ОТД', name: 'Отделочные работы', color: '#3B82F6' },
    { id: 2, code: 'ШТ', name: 'Штукатурные работы', parentId: 1, color: '#60A5FA' },
    { id: 3, code: 'МАЛ', name: 'Малярные работы', parentId: 1, color: '#93C5FD' },
    { id: 4, code: 'ПЛ', name: 'Плиточные работы', parentId: 1, color: '#BFDBFE' },
    { id: 5, code: 'ИНЖ', name: 'Инженерные системы', color: '#10B981' },
    { id: 6, code: 'ЭЛ', name: 'Электромонтажные работы', parentId: 5, color: '#34D399' },
    { id: 7, code: 'СН', name: 'Сантехнические работы', parentId: 5, color: '#6EE7B7' },
    { id: 8, code: 'ОВК', name: 'Отопление и вентиляция', parentId: 5, color: '#A7F3D0' },
    { id: 9, code: 'СТР', name: 'Строительные работы', color: '#F59E0B' },
    { id: 10, code: 'ДМ', name: 'Демонтажные работы', parentId: 9, color: '#FBBF24' },
    { id: 11, code: 'КЛД', name: 'Кладочные работы', parentId: 9, color: '#FCD34D' },
    { id: 12, code: 'ПОТ', name: 'Потолочные работы', color: '#8B5CF6' },
    { id: 13, code: 'ПОЛ', name: 'Напольные покрытия', color: '#EC4899' },
  ]
  db.setSetting('reference_categories', JSON.stringify(defaults))
  return defaults
})
ipcMain.handle('catalog:setCategories', (_, data) => {
  db.setSetting('reference_categories', JSON.stringify(data))
  return { success: true }
})

ipcMain.handle('catalog:getVatRates', () => {
  const raw = db.getSetting('reference_vat_rates')
  if (raw) return JSON.parse(raw)
  const defaults = [
    { id: 1, name: 'Без НДС', rate: 0, isDefault: false },
    { id: 2, name: 'НДС 10%', rate: 10, isDefault: false },
    { id: 3, name: 'НДС 20%', rate: 20, isDefault: true },
  ]
  db.setSetting('reference_vat_rates', JSON.stringify(defaults))
  return defaults
})
ipcMain.handle('catalog:setVatRates', (_, data) => {
  db.setSetting('reference_vat_rates', JSON.stringify(data))
  return { success: true }
})

ipcMain.handle('catalog:getRefCoefficients', () => {
  const raw = db.getSetting('reference_coefficients')
  if (raw) return JSON.parse(raw)
  const defaults = [
    { id: 1, code: 'К_СЛОЖ', name: 'Коэффициент сложности', value: 1.0, description: 'Применяется для сложных объектов' },
    { id: 2, code: 'К_СРОЧ', name: 'Коэффициент срочности', value: 1.3, description: 'Надбавка за срочные работы' },
    { id: 3, code: 'К_ВЫС', name: 'Коэффициент высотности', value: 1.15, description: 'Работы на высоте более 3м' },
    { id: 4, code: 'К_ТЕСН', name: 'Коэффициент стеснённости', value: 1.1, description: 'Работы в стеснённых условиях' },
    { id: 5, code: 'К_ЗИМ', name: 'Зимний коэффициент', value: 1.1, description: 'Работы в зимний период' },
    { id: 6, code: 'К_НАКЛ', name: 'Накладные расходы', value: 0.12, description: '12% от стоимости работ' },
    { id: 7, code: 'К_ПРИБ', name: 'Сметная прибыль', value: 0.08, description: '8% от стоимости работ' },
  ]
  db.setSetting('reference_coefficients', JSON.stringify(defaults))
  return defaults
})
ipcMain.handle('catalog:setRefCoefficients', (_, data) => {
  db.setSetting('reference_coefficients', JSON.stringify(data))
  return { success: true }
})

// Контрагенты (хранятся как JSON в settings)
ipcMain.handle('contractors:getAll', () => {
  const raw = db.getSetting('contractors_list')
  return raw ? JSON.parse(raw) : []
})
ipcMain.handle('contractors:save', (_, data) => {
  db.setSetting('contractors_list', JSON.stringify(data))
  return { success: true }
})

// Мастера/бригады (хранятся как JSON в settings)
ipcMain.handle('workers:getAll', () => {
  const raw = db.getSetting('workers_list')
  return raw ? JSON.parse(raw) : []
})
ipcMain.handle('workers:save', (_, data) => {
  db.setSetting('workers_list', JSON.stringify(data))
  return { success: true }
})

// ФОТ работники (хранятся как JSON в settings)
ipcMain.handle('fot:getWorkers', () => {
  const raw = db.getSetting('fot_workers')
  return raw ? JSON.parse(raw) : []
})
ipcMain.handle('fot:saveWorkers', (_, data) => {
  db.setSetting('fot_workers', JSON.stringify(data))
  return { success: true }
})

// Импорт банков
ipcMain.handle('banks:importFromExcel', async (_, filePath) => {
  const count = await banksImport.banksImportFromExcel(filePath)
  return { success: true, count }
})

ipcMain.handle('banks:getAll', async () => {
  return banksImport.getBanksList()
})

// Генерация документов
handleWithRuntimeLogging('docs:generateEstimate', async (_, estimateId) => {
  return generateEstimatePdfFile(estimateId, { updateEstimateFilePath: true })
})

// === Пакетная генерация документов ===
handleWithRuntimeLogging('docs:generatePackage', async (_, estimateId) => {
  const context = getEstimateContext(estimateId)
  const logger = getRuntimeLogger()

  return generateDocumentPackage({
    context,
    logger,
    createRecords: {
      contract: async (data) => db.createContract(data),
      ks2: async (data) => db.createKS2Act(data),
      ks3: async (data) => db.createKS3Cert(data),
    },
    generators: {
      estimate: async (id, { packageDir }) => {
        const result = await generateEstimatePdfFile(id, {
          updateEstimateFilePath: false,
          licenseFeature: 'core_document',
        })
        return copyGeneratedFileToPackage(result.path, packageDir)
      },
      contract: async (id, { packageDir }) => {
        const result = await generateContractFile(id)
        return copyGeneratedFileToPackage(result.path, packageDir)
      },
      ks2: async (id, { packageDir }) => {
        const result = await generateKS2File(id)
        return copyGeneratedFileToPackage(result.path, packageDir)
      },
      ks3: async (id, { packageDir }) => {
        const result = await generateKS3File(id)
        return copyGeneratedFileToPackage(result.path, packageDir)
      },
      fot: async (id, { packageDir }) => {
        const result = await generateFOTFile(id)
        return copyGeneratedFileToPackage(result.path, packageDir)
      },
      materials: async (id, { packageDir }) => {
        const result = await generateMaterialRequestFile(id)
        return copyGeneratedFileToPackage(result.path, packageDir)
      },
    },
  })
})

ipcMain.handle('docs:getEstimateContext', async (_, estimateId) => {
  return getEstimateContext(estimateId)
})

ipcMain.handle('docs:getEstimateSnapshot', async (_, estimateId, options = {}) => {
  const context = getEstimateContext(estimateId)
  return documentSnapshots.buildEstimateSnapshot(context, options)
})
handleWithRuntimeLogging('docs:generateKS2', async (_, actId) => {
  return generateKS2File(actId)
})

handleWithRuntimeLogging('docs:generateKS3', async (_, certId) => {
  return generateKS3File(certId)
})

handleWithRuntimeLogging('docs:generateContract', async (_, contractId) => {
  return generateContractFile(contractId)
})

handleWithRuntimeLogging('docs:generateContractFromTemplate', async (_, { contractId, templateId }) => {
  return generateContractFile(contractId, { templateId, withTimestamp: false })
})

// Генерация Коммерческого предложения из шаблона
handleWithRuntimeLogging('docs:generateCommercialOffer', async (_, estimateId) => {
  const context = getEstimateContext(estimateId)
  const { estimate, folderPath } = context
  const fileName = `КП_${(estimate.number || 'Б-Н').replace(/[/\\]/g, '-')}.docx`
  const outputPath = path.join(folderPath, 'КП', fileName)

  const dir = path.dirname(outputPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  documentTemplateAdapters.generateDocxFromKernel({
    type: 'commercial_offer',
    context,
    outputPath,
    helpers: {
      templates,
      formatAmount,
      formatShortName,
    },
  })
  return { path: outputPath }
})

// Генерация дополнительного соглашения
handleWithRuntimeLogging('docs:generateAgreement', async (_, { contractId, agreementType, agreementData }) => {
  const contract = db.getContract(contractId)
  if (!contract) throw new Error('Договор не найден')

  const project = contract.project_id ? db.getProject(contract.project_id) : null
  const estimate = contract.estimate_id ? db.getEstimate(contract.estimate_id) : null
  const settings = db.getAllSettings()
  const company = parseCompany(settings)
  const folderPath = getWritableOutputRoot(project?.folder_path)

  // Определяем шаблон (additional/independent/replacement + individual/company)
  const clientType = contract.client_type === 'company' ? 'company' : 'individual'
  const templateId = `${agreementType}-${clientType}`

  const agreementNumber = agreementData?.number || `ДС-${contract.number}-1`
  const fileName = `Доп_согл_${agreementNumber.replace(/[/\\]/g, '-')}.docx`
  const outputPath = path.join(folderPath, 'Договоры', fileName)

  const dir = path.dirname(outputPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  if (estimate?.id) {
    const context = getEstimateContext(estimate.id, { contractId })
    documentTemplateAdapters.generateDocxFromKernel({
      type: 'additional_agreement',
      context,
      outputPath,
      options: {
        templateId,
        agreementType,
        agreementData,
      },
      helpers: {
        templates,
        formatAmount,
        formatShortName,
      },
    })
  } else {
    const clientName = contract.client || contract.client_name || project?.client_name || ''
    const amount = agreementData?.amount || contract.amount || 0
    const newAmount = (contract.amount || 0) + amount

    const data = {
      'номер доп. согл.': agreementNumber,
      'номер договора': contract.number || '',
      'дата договора': templates.formatDateForDoc(contract.date),
      'Дата договора': templates.formatDateForDoc(contract.date),
      'дата доп. согл.': templates.formatDateForDoc(agreementData?.date || new Date().toISOString()),
      'ном. дог.': contract.number || '',
      'дата дог.': templates.formatDateForDoc(contract.date),
      'Фамилия Имя Отчество': clientName,
      'Фамилия Имя Отчество заказчика': clientName,
      'Фамилия И.О.': formatShortName(clientName),
      'адрес заказчика': contract.client_address || project?.address || '',
      'телефоны заказчика': contract.client_phone || '',
      'ИНН заказчика': contract.client_inn || '',
      'серия  номер паспорта': contract.client_passport || '',
      'кем выдан паспорт и дата выдачи': contract.client_passport_issued || '',
      'код подразд': contract.client_passport_code || '',
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
      'номер сметы': estimate?.number || '',
      'дата сметы': templates.formatDateForDoc(estimate?.created_at),
      'номер приложения': agreementData?.appendixNumber || '2',
      'предмет доп. соглашения': agreementData?.subject || 'Выполнение дополнительных работ',
      'цена доп. согл.': formatAmount(amount),
      'цена доп. согл. прописью': templates.numberToWords(amount),
      'цена договора': formatAmount(newAmount),
      'цена договора прописью': templates.numberToWords(newAmount),
      'информация о НДС': settings?.estimates?.vatEnabled !== false
        ? `В том числе НДС ${settings?.estimates?.vatRate || 20}%`
        : 'НДС не облагается',
      'Изменить порядок и условия оплаты по Договору:': agreementData?.changePayment ? 'Изменить порядок и условия оплаты по Договору:' : '',
      'один или несколько подпунктов о порядке оплаты работ (определяются в программе)': agreementData?.paymentTerms || '',
      'Изменить сроки выполнения работ по Договору:': agreementData?.changeTerms ? 'Изменить сроки выполнения работ по Договору:' : '',
      'Начало работ по договору': templates.formatDateForDoc(agreementData?.startDate || contract.start_date),
      'Окончание работ по договору': templates.formatDateForDoc(agreementData?.endDate || contract.end_date),
      'начало работ по договору': templates.formatDateForDoc(agreementData?.startDate || contract.start_date),
      'окончание работ по договору': templates.formatDateForDoc(agreementData?.endDate || contract.end_date),
      'Приложения к доп. соглашению:': 'Приложения к доп. соглашению:',
      'приложение №1, №2 и т.д.': agreementData?.appendices || 'Приложение №1 - Дополнительная смета'
    }

    templates.generateFromWordTemplate(templateId, data, outputPath)
  }
  return { path: outputPath }
})

// Генерация сметы в PDF (обратная совместимость для старых вызовов)
handleWithRuntimeLogging('docs:generateEstimatePDF', async (_, estimateId) => {
  return generateEstimatePdfFile(estimateId, { withTimestamp: false })
})
// Экспорт сметы в HTML файл
ipcMain.handle('docs:generateEstimateHTML', async (_, estimateId) => {
  const { estimate, items, sections, project, companyInfo, folderPath } = getEstimateContext(estimateId)

  const fileName = `Смета_${(estimate.number || '').replace(/[/\\]/g, '-')}.html`
  const outputPath = path.join(folderPath, 'Сметы', fileName)

  const dir = path.dirname(outputPath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  docs.generateEstimateHTMLFile(estimate, items, project, companyInfo, outputPath, sections)

  return { path: outputPath }
})

// Экспорт дефектовки в формате ZaruAI Смета
handleWithRuntimeLogging('docs:generateDefektovka', async (_, estimateId) => {
  await ensurePdfExportAllowed(license, { feature: 'core_document' })
  const { estimate, items, sections, coefficients, project, companyInfo, folderPath } = getEstimateContext(estimateId)

  const timestamp = Date.now()
  const fileName = `Дефектовка_${(estimate.number || '').replace(/[/\\]/g, '-')}_${timestamp}.pdf`
  const outputPath = path.join(folderPath, 'Сметы', fileName)

  const htmlContent = docs.generateDefektovkaHTML(estimate, items, sections, coefficients, project, companyInfo)
  await htmlToPdfFile(htmlContent, outputPath, true)

  return { path: outputPath }
})

// Генерация М-29 в PDF
handleWithRuntimeLogging('docs:generateM29', async (_, m29Id) => {
  await ensurePdfExportAllowed(license, { feature: 'core_document' })
  const m29Doc = db.getM29Doc(m29Id)
  if (!m29Doc) throw new Error('Документ М-29 не найден')

  const items = db.getM29Items(m29Id) || []
  const project = m29Doc.project_id ? db.getProject(m29Doc.project_id) : null
  const folderPath = getWritableOutputRoot(project?.folder_path)

  const timestamp = Date.now()
  const fileName = `М-29_${(m29Doc.number || '').replace(/[/\\]/g, '-')}_${timestamp}.pdf`
  const outputPath = path.join(folderPath, 'Документы', fileName)

  const htmlContent = docs.generateM29HTML(project, m29Doc, items)
  await htmlToPdfFile(htmlContent, outputPath, true)

  return { path: outputPath }
})

// === ZaruAI Смета: Генерация ФОТ (Ведомость объёмов работ) ===
handleWithRuntimeLogging('docs:generateFOT', async (_, estimateId) => {
  return generateFOTFile(estimateId)
})

// === ZaruAI Смета: Генерация Сметы в формате ZaruAI ===
handleWithRuntimeLogging('docs:generateSmeta2007', async (_, estimateId) => {
  await ensurePdfExportAllowed(license, { feature: 'core_document' })
  const { estimate, items, sections, coefficients, project, companyInfo, folderPath } = getEstimateContext(estimateId)

  const fileName = `ZaruAI_Смета_${(estimate.number || 'Б-Н').replace(/[/\\]/g, '-')}.pdf`
  const outputPath = path.join(folderPath, 'Сметы', fileName)

  // Используем стандартный HTML-генератор сметы
  const htmlContent = docs.generateEstimateHTML(estimate, items, project, companyInfo, sections)
  await htmlToPdfFile(htmlContent, outputPath)

  return { path: outputPath }
})

// === Генерация Заявки на материалы из шаблона ===
handleWithRuntimeLogging('docs:generateMaterialRequest', async (_, estimateId) => {
  return generateMaterialRequestFile(estimateId)
})

// === Генерация Счёт-фактуры в PDF ===
handleWithRuntimeLogging('docs:generateInvoice', async (_, { estimateId, invoiceData }) => {
  await ensurePdfExportAllowed(license, { feature: 'core_document' })
  const { estimate, items, settings, companyInfo, folderPath } = getEstimateContext(estimateId)

  const timestamp = Date.now()
  const invoiceNumber = invoiceData?.number || `СФ-${estimate.number || Date.now()}`
  const fileName = `Счёт-фактура_${invoiceNumber.replace(/[/\\]/g, '-')}_${timestamp}.pdf`
  const outputPath = path.join(folderPath, 'Документы', fileName)

  const htmlContent = docs.generateInvoiceHTML(estimate, items, invoiceData, companyInfo, settings)
  await htmlToPdfFile(htmlContent, outputPath)

  return { path: outputPath }
})

// Открыть файл/папку
handleWithRuntimeLogging('shell:openPath', async (_, filePath) => {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`Не найден файл для открытия: ${filePath}`)
  }
  await openPathOrThrow(shell, filePath)
  return true
})

handleWithRuntimeLogging('diagnostics:openLogsFolder', async () => {
  const logsPath = ensureLogsDirectory({ logger: getRuntimeLogger() })
  await openPathOrThrow(shell, logsPath)
  return { path: logsPath }
})

handleWithRuntimeLogging('diagnostics:exportBundle', async () => {
  const bundle = exportDiagnosticsBundle({
    logger: getRuntimeLogger(),
    userDataPath: app.getPath('userData'),
    appVersion,
    processInfo: process,
  })
  shell.showItemInFolder(bundle.path)
  return bundle
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
ipcMain.handle('app:getBackendUrl', () => global.__backendUrl || 'http://127.0.0.1:8000')


// === IPC: Лицензирование ===
ipcMain.handle('license:check', async () => {
  return license.getLicenseInfo()
})

ipcMain.handle('license:activate', async (event, payload = {}) => {
  const { key, email, forceDeactivatePrevious = false, deviceName = null } = payload
  return license.activateLicense(key, { email, forceDeactivatePrevious, deviceName })
})

ipcMain.handle('license:hasFeature', async (event, feature) => {
  return license.hasFeature(feature)
})

ipcMain.handle('license:getHWID', async () => {
  return license.getHardwareId()
})

ipcMain.handle('license:extend', async (event, key) => {
  const currentInfo = await license.getLicenseInfo()
  const email = currentInfo.email || ''
  return license.extendLicense(key, email)
})

ipcMain.handle('license:getActiveDevices', async () => {
  return license.getActiveDevices()
})

ipcMain.handle('license:deactivateDevice', async (event, slotId) => {
  return license.deactivateDevice(slotId)
})

ipcMain.handle('license:getStatus', async () => {
  return license.getStatus()
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

// Импорт дефектовки коммерческого формата
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
    const estimate = await runEstimateCreationWithLicense(() => db.createEstimate({
      project_id: projectId,
      name: defektovkaData.estimate?.name || 'Импорт дефектовки',
      number: defektovkaData.estimate?.number || `ДЕФ-${Date.now()}`,
      estimate_type: 'defect',
      status: 'draft'
    }))

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
    const estimate = await runEstimateCreationWithLicense(() => db.createEstimate({
      project_id: projectId,
      name: estimateData.name || 'Импортированная смета',
      number: estimateData.number || `ИМП-${Date.now()}`
    }))

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
ipcMain.handle('estimateSections:update', (_, id, data) => db.updateEstimateSection(id, data))
ipcMain.handle('estimateSections:delete', (_, id) => db.deleteEstimateSection(id))

// Шаблоны
ipcMain.handle('templates:getAll', () => db.getTemplates())
ipcMain.handle('templates:get', (_, id) => db.getTemplate(id))
ipcMain.handle('templates:saveFromEstimate', (_, estimateId, name, category, description) =>
  db.saveAsTemplate(estimateId, name, category, description))
ipcMain.handle('templates:createEstimate', async (_, templateId, projectId, name) =>
  runEstimateCreationWithLicense(() => db.createEstimateFromTemplate(templateId, projectId, name)))
ipcMain.handle('templates:delete', (_, id) => db.deleteTemplate(id))

// Сценарии маржи
ipcMain.handle('marginScenarios:getAll', (_, estimateId) => db.getMarginScenarios(estimateId))
ipcMain.handle('marginScenarios:create', (_, data) => db.createMarginScenario(data))
ipcMain.handle('marginScenarios:calculate', (_, estimateId, scenarioId) => db.calculateScenario(estimateId, scenarioId))

// === Запуск приложения ===
app.whenReady().then(async () => {
  getRuntimeLogger()
  installProcessDiagnostics({ logger: getRuntimeLogger() })

  // Разрешение доступа к микрофону для голосового ввода
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['media', 'microphone', 'audioCapture'];
    if (allowedPermissions.includes(permission)) {
      callback(true);
    } else {
      callback(false);
    }
  });

  // Запуск Python backend (в production)
  const backend = await launchBackend(console)
  if (backend && !backend.devMode && !backend.missing) {
    global.__backendProcess = backend.process
    global.__backendUrl = getBackendUrl()
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

ipcMain.handle('diagnostics:logRendererEvent', async (_, payload = {}) => {
  const type = payload?.type || 'RENDERER_ERROR'
  getRuntimeLogger().logError(type, payload)
  return true
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
  shutdownBackend()
  db.saveDatabase()
})









