/**
 * ZARU Смета - Preload Script
 * API для доступа из React UI
 */

const { ipcRenderer, contextBridge } = require('electron')

const normalizeRendererDiagnostic = (value) => {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack || '',
    }
  }

  if (value === null || value === undefined) {
    return value ?? null
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeRendererDiagnostic(item))
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeRendererDiagnostic(item)])
    )
  }

  return String(value)
}

const reportRendererDiagnostic = (type, payload) => {
  ipcRenderer.invoke('diagnostics:logRendererEvent', {
    type,
    payload: normalizeRendererDiagnostic(payload),
  }).catch(() => {
    // Диагностика должна быть полностью тихой для пользователя.
  })
}

if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    reportRendererDiagnostic('RENDERER_ERROR', {
      message: event.message,
      source: event.filename,
      line: event.lineno,
      column: event.colno,
      error: event.error,
    })
  }, true)

  window.addEventListener('unhandledrejection', (event) => {
    reportRendererDiagnostic('RENDERER_UNHANDLED_REJECTION', {
      reason: event.reason,
    })
  })
}

// Экспортируем API через contextBridge для безопасного доступа из React
contextBridge.exposeInMainWorld('electronAPI', {
  // === Проекты ===
  projects: {
    getAll: () => ipcRenderer.invoke('projects:getAll'),
    get: (id) => ipcRenderer.invoke('projects:get', id),
    create: (data) => ipcRenderer.invoke('projects:create', data),
    update: (id, data) => ipcRenderer.invoke('projects:update', id, data),
    delete: (id) => ipcRenderer.invoke('projects:delete', id)
  },

  // === Сметы ===
  estimates: {
    getAll: (projectId) => ipcRenderer.invoke('estimates:getAll', projectId),
    get: (id) => ipcRenderer.invoke('estimates:get', id),
    create: (data) => ipcRenderer.invoke('estimates:create', data),
    update: (id, data) => ipcRenderer.invoke('estimates:update', id, data),
    delete: (id) => ipcRenderer.invoke('estimates:delete', id),
    recalculate: (id) => ipcRenderer.invoke('estimates:recalculate', id),
    convertFromDefect: (defectId, options) => ipcRenderer.invoke('estimates:convertFromDefect', defectId, options)
  },

  // === Позиции сметы ===
  estimateItems: {
    getAll: (estimateId) => ipcRenderer.invoke('estimateItems:getAll', estimateId),
    add: (estimateId, data) => ipcRenderer.invoke('estimateItems:add', estimateId, data),
    update: (id, data) => ipcRenderer.invoke('estimateItems:update', id, data),
    delete: (id) => ipcRenderer.invoke('estimateItems:delete', id)
  },

  // === Договоры ===
  contracts: {
    getAll: (projectId) => ipcRenderer.invoke('contracts:getAll', projectId),
    create: (data) => ipcRenderer.invoke('contracts:create', data),
    update: (id, data) => ipcRenderer.invoke('contracts:update', id, data),
    delete: (id) => ipcRenderer.invoke('contracts:delete', id)
  },

  // === КС-2 ===
  ks2: {
    getAll: (projectId) => ipcRenderer.invoke('ks2:getAll', projectId),
    create: (data) => ipcRenderer.invoke('ks2:create', data),
    delete: (id) => ipcRenderer.invoke('ks2:delete', id),
    getItems: (id) => ipcRenderer.invoke('ks2:getItems', id),
    createItem: (data) => ipcRenderer.invoke('ks2:createItem', data),
    deleteItem: (id) => ipcRenderer.invoke('ks2:deleteItem', id),
    // СМЕТА 2007: Накопительный учёт
    createItems: (ks2Id, items) => ipcRenderer.invoke('ks2:createItems', ks2Id, items),
    getRemainder: (estimateId) => ipcRenderer.invoke('ks2:getRemainder', estimateId)
  },

  // === КС-3 ===
  ks3: {
    getAll: (projectId) => ipcRenderer.invoke('ks3:getAll', projectId),
    create: (data) => ipcRenderer.invoke('ks3:create', data),
    delete: (id) => ipcRenderer.invoke('ks3:delete', id)
  },

  // === М-29 ===
  m29: {
    getAll: (projectId) => ipcRenderer.invoke('m29:getAll', projectId),
    create: (data) => ipcRenderer.invoke('m29:create', data)
  },

  // === ФОТ ===
  fot: {
    create: (estimateId) => ipcRenderer.invoke('fot:create', estimateId),
    getAll: (estimateId) => ipcRenderer.invoke('fot:getAll', estimateId),
    getWorkers: () => ipcRenderer.invoke('fot:getWorkers'),
    saveWorkers: (data) => ipcRenderer.invoke('fot:saveWorkers', data)
  },

  // === СМЕТА 2007: Список ресурсов ===
  resources: {
    getSummary: (estimateId) => ipcRenderer.invoke('resources:getSummary', estimateId)
  },

  // === Настройки ===
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll')
  },

  // === Каталог работ и материалов ===
  catalog: {
    getWorks: (search) => ipcRenderer.invoke('catalog:getWorks', search),
    createWork: (data) => ipcRenderer.invoke('catalog:createWork', data),
    getMaterials: (search) => ipcRenderer.invoke('catalog:getMaterials', search),
    getRegions: () => ipcRenderer.invoke('catalog:getRegions'),
    createRegion: (data) => ipcRenderer.invoke('catalog:createRegion', data),
    deleteRegion: (id) => ipcRenderer.invoke('catalog:deleteRegion', id),
    getUnits: () => ipcRenderer.invoke('catalog:getUnits'),
    setUnits: (data) => ipcRenderer.invoke('catalog:setUnits', data),
    getCategories: () => ipcRenderer.invoke('catalog:getCategories'),
    setCategories: (data) => ipcRenderer.invoke('catalog:setCategories', data),
    getVatRates: () => ipcRenderer.invoke('catalog:getVatRates'),
    setVatRates: (data) => ipcRenderer.invoke('catalog:setVatRates', data),
    getRefCoefficients: () => ipcRenderer.invoke('catalog:getRefCoefficients'),
    setRefCoefficients: (data) => ipcRenderer.invoke('catalog:setRefCoefficients', data)
  },

  // === Контрагенты ===
  contractors: {
    getAll: () => ipcRenderer.invoke('contractors:getAll'),
    save: (data) => ipcRenderer.invoke('contractors:save', data)
  },

  // === Мастера/бригады ===
  workers: {
    getAll: () => ipcRenderer.invoke('workers:getAll'),
    save: (data) => ipcRenderer.invoke('workers:save', data)
  },

  // === Генерация документов ===
  docs: {
    generateEstimate: (estimateId) => ipcRenderer.invoke('docs:generateEstimate', estimateId),
    generateKS2: (actId) => ipcRenderer.invoke('docs:generateKS2', actId),
    generateKS3: (certId) => ipcRenderer.invoke('docs:generateKS3', certId),
    generateContract: (contractId) => ipcRenderer.invoke('docs:generateContract', contractId),
    generateM29: (m29Id) => ipcRenderer.invoke('docs:generateM29', m29Id),
    generateContractFromTemplate: (contractId, templateId) => ipcRenderer.invoke('docs:generateContractFromTemplate', { contractId, templateId }),
    generateEstimatePDF: (estimateId) => ipcRenderer.invoke('docs:generateEstimatePDF', estimateId),
    generateEstimateHTML: (estimateId) => ipcRenderer.invoke('docs:generateEstimateHTML', estimateId),
    generateDefektovka: (estimateId) => ipcRenderer.invoke('docs:generateDefektovka', estimateId),
    // Коммерческое предложение
    generateCommercialOffer: (estimateId) => ipcRenderer.invoke('docs:generateCommercialOffer', estimateId),
    // Дополнительные соглашения
    generateAgreement: (contractId, agreementType, agreementData) =>
      ipcRenderer.invoke('docs:generateAgreement', { contractId, agreementType, agreementData }),
    // Заявка на материалы
    generateMaterialRequest: (estimateId) => ipcRenderer.invoke('docs:generateMaterialRequest', estimateId),
    // Счёт-фактура
    generateInvoice: (estimateId, invoiceData) => ipcRenderer.invoke('docs:generateInvoice', { estimateId, invoiceData }),
    // СМЕТА 2007: Новые форматы документов
    generateFOT: (estimateId) => ipcRenderer.invoke('docs:generateFOT', estimateId),
    generateSmeta2007: (estimateId) => ipcRenderer.invoke('docs:generateSmeta2007', estimateId),
    generatePackage: (estimateId) => ipcRenderer.invoke('docs:generatePackage', estimateId),
    getEstimateContext: (estimateId) => ipcRenderer.invoke('docs:getEstimateContext', estimateId),
    getEstimateSnapshot: (estimateId, options) => ipcRenderer.invoke('docs:getEstimateSnapshot', estimateId, options)
  },

  // === Диагностика ===
  diagnostics: {
    openLogsFolder: () => ipcRenderer.invoke('diagnostics:openLogsFolder'),
    exportBundle: () => ipcRenderer.invoke('diagnostics:exportBundle'),
  },

  // === Лицензирование ===
  license: {
    check: () => ipcRenderer.invoke('license:check'),
    activate: (key, email) => ipcRenderer.invoke('license:activate', { key, email }),
    hasFeature: (feature) => ipcRenderer.invoke('license:hasFeature', feature),
    getHWID: () => ipcRenderer.invoke('license:getHWID'),
    extend: (key) => ipcRenderer.invoke('license:extend', key)
  },

  // === Шаблоны документов ===
  templates: {
    getList: () => ipcRenderer.invoke('templates:getList'),
    open: (templateId) => ipcRenderer.invoke('templates:open', templateId),
    generate: (templateId, data, outputPath) => ipcRenderer.invoke('templates:generate', { templateId, data, outputPath }),
    copy: (templateId, outputDir, filename) => ipcRenderer.invoke('templates:copy', { templateId, outputDir, filename }),
    openFolder: () => ipcRenderer.invoke('templates:openFolder')
  },

  // === Импорт документов ===
  import: {
    selectExcelFile: () => ipcRenderer.invoke('import:selectExcelFile'),
    parseEstimateExcel: (filePath) => ipcRenderer.invoke('import:parseEstimateExcel', filePath),
    createEstimateFromData: (projectId, estimateData) => ipcRenderer.invoke('import:createEstimateFromData', { projectId, estimateData }),
    // Импорт дефектовки формата ZaruAI Смета
    parseDefektovka: (filePath) => ipcRenderer.invoke('import:parseDefektovka', filePath),
    createEstimateFromDefektovka: (projectId, defektovkaData) => ipcRenderer.invoke('import:createEstimateFromDefektovka', { projectId, defektovkaData }),
    // Импорт банков из Excel/CSV
    importBanksFromExcel: (filePath) => ipcRenderer.invoke('banks:importFromExcel', filePath)
  },

  // === Банки ===
  banks: {
    getBanks: () => ipcRenderer.invoke('banks:getAll')
  },

  // === Shell (открытие файлов/папок) ===
  shell: {
    openPath: (path) => ipcRenderer.invoke('shell:openPath', path),
    showItemInFolder: (path) => ipcRenderer.invoke('shell:showItemInFolder', path),
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url)
  },

  // === Диалоги ===
  dialog: {
    showSaveDialog: (options) => ipcRenderer.invoke('dialog:showSaveDialog', options),
    showOpenDialog: (options) => ipcRenderer.invoke('dialog:showOpenDialog', options)
  },

  // === Приложение ===
  app: {
    getDataPath: () => ipcRenderer.invoke('app:getDataPath')
  },

  // === События от меню ===
  onMenuAction: (callback) => {
    ipcRenderer.on('menu-action', (_, action) => callback(action))
  },

  // =========================================
  // === СМЕТА 2007: API ===
  // =========================================

  // Коэффициенты (дефектовка → смета)
  coefficients: {
    get: (estimateId) => ipcRenderer.invoke('coefficients:get', estimateId),
    set: (estimateId, data) => ipcRenderer.invoke('coefficients:set', estimateId, data),
    recalculate: (estimateId) => ipcRenderer.invoke('estimates:recalculateWithCoefficients', estimateId)
  },

  // Разделы сметы
  estimateSections: {
    getAll: (estimateId) => ipcRenderer.invoke('estimateSections:getAll', estimateId),
    create: (data) => ipcRenderer.invoke('estimateSections:create', data),
    update: (id, data) => ipcRenderer.invoke('estimateSections:update', id, data),
    delete: (id) => ipcRenderer.invoke('estimateSections:delete', id)
  },

  // Шаблоны смет
  estimateTemplates: {
    getAll: () => ipcRenderer.invoke('templates:getAll'),
    get: (id) => ipcRenderer.invoke('templates:get', id),
    saveFromEstimate: (estimateId, name, category, description) =>
      ipcRenderer.invoke('templates:saveFromEstimate', estimateId, name, category, description),
    createEstimate: (templateId, projectId, name) =>
      ipcRenderer.invoke('templates:createEstimate', templateId, projectId, name),
    delete: (id) => ipcRenderer.invoke('templates:delete', id)
  },

  // Сценарии маржи
  marginScenarios: {
    getAll: (estimateId) => ipcRenderer.invoke('marginScenarios:getAll', estimateId),
    create: (data) => ipcRenderer.invoke('marginScenarios:create', data),
    calculate: (estimateId, scenarioId) => ipcRenderer.invoke('marginScenarios:calculate', estimateId, scenarioId)
  }
})

// Флаг для определения Electron
contextBridge.exposeInMainWorld('isElectron', true)





