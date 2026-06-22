/**
 * ZARU Смета - Electron API Types
 * Типизация для доступа к Desktop API из React
 * 
 * @version 2.0.0
 * @author ZARU Team
 */

// =============================================================================
// УТИЛИТАРНЫЕ ТИПЫ
// =============================================================================

/** Формат даты ISO 8601 */
export type ISODateString = string

/** Идентификатор сущности */
export type EntityId = number

/** Результат операции с возможной ошибкой */
export interface OperationResult<T = void> {
  success: boolean
  data?: T
  error?: string
  errorCode?: string
}

/** Пагинация для списков */
export interface PaginationParams {
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

/** Результат с пагинацией */
export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

// =============================================================================
// ПЕРЕЧИСЛЕНИЯ (для избежания опечаток)
// =============================================================================

/** Статусы проекта */
export const ProjectStatus = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  ARCHIVED: 'archived',
} as const
export type ProjectStatusType = typeof ProjectStatus[keyof typeof ProjectStatus]

/** Типы клиентов */
export const ClientType = {
  INDIVIDUAL: 'individual',
  LEGAL: 'legal',
  IP: 'ip',
} as const
export type ClientTypeType = typeof ClientType[keyof typeof ClientType]

/** Типы смет */
export const EstimateType = {
  LOCAL: 'local',
  OBJECT: 'object',
  SUMMARY: 'summary',
  RESOURCE: 'resource',
  DEFECT: 'defect',
} as const
export type EstimateTypeType = typeof EstimateType[keyof typeof EstimateType]

/** Статусы документов */
export const DocumentStatus = {
  DRAFT: 'draft',
  IN_REVIEW: 'in_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  PENDING: 'pending',
  SIGNED: 'signed',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  CLOSED: 'closed',
} as const
export type DocumentStatusType = typeof DocumentStatus[keyof typeof DocumentStatus]

/** Типы позиций сметы */
export const ItemType = {
  WORK: 'work',
  MATERIAL: 'material',
  EQUIPMENT: 'equipment',
  TRANSPORT: 'transport',
  SERVICE: 'service',
  OTHER: 'other',
} as const
export type ItemTypeType = typeof ItemType[keyof typeof ItemType]

/** ZARU AI смета: Типы строк дефектовки */
export const RowType = {
  RASCENKA: 'rascenka',    // Расценка (работа) - родительская строка
  MATERIAL: 'material',     // Материал - дочерняя строка
  MECHANISM: 'mechanism',   // Механизм/техника
  COMMENT: 'comment',       // Комментарий (не участвует в расчётах)
  SECTION: 'section',       // Раздел/заголовок
} as const
export type RowTypeType = typeof RowType[keyof typeof RowType]

/** Типы лицензий */
export const LicenseType = {
  NONE: 'NONE',
  TRIAL: 'TRIAL',
  BASIC: 'BASIC',
  PRO: 'PRO',
  ENTERPRISE: 'ENTERPRISE',
} as const
export type LicenseTypeType = typeof LicenseType[keyof typeof LicenseType]

/** Категории шаблонов */
export const TemplateCategory = {
  CONTRACTS: 'contracts',
  DOCUMENTS: 'documents',
  AGREEMENTS: 'agreements',
} as const
export type TemplateCategoryType = typeof TemplateCategory[keyof typeof TemplateCategory]

/** Типы дополнительных соглашений */
export const AdditionalAgreementType = {
  ADDITIONAL: 'additional',
  INDEPENDENT: 'independent',
  REPLACEMENT: 'replacement',
} as const
export type AdditionalAgreementTypeType = typeof AdditionalAgreementType[keyof typeof AdditionalAgreementType]

// =============================================================================
// БАЗОВЫЕ ИНТЕРФЕЙСЫ
// =============================================================================

/** Базовый интерфейс сущности */
export interface BaseEntity {
  id: EntityId
  created_at: ISODateString
  updated_at?: ISODateString
}

/** Интерфейс для сущностей с файлом */
export interface WithFilePath {
  file_path?: string
}

/** Интерфейс для сущностей со статусом */
export interface WithStatus<T extends string> {
  status: T
}

/** Финансовые итоги */
export interface FinancialTotals {
  total_materials: number
  total_works: number
  total_overhead: number
  total_profit: number
  total_without_vat: number
  total_vat: number
  total_with_vat: number
}

/** Устаревшие поля для обратной совместимости */
export interface LegacyFinancialFields {
  /** @deprecated Используйте total_materials */
  materials_cost?: number
  /** @deprecated Используйте total_works */
  labor_cost?: number
  /** @deprecated Используйте total_overhead */
  overhead_cost?: number
  /** @deprecated Используйте total_profit */
  profit_cost?: number
  /** @deprecated Используйте total_with_vat */
  total_cost?: number
}

// =============================================================================
// ОСНОВНЫЕ ИНТЕРФЕЙСЫ СУЩНОСТЕЙ
// =============================================================================

export interface Project extends BaseEntity, WithFilePath {
  /** Название проекта */
  name: string
  /** Адрес объекта */
  address?: string
  /** Имя клиента */
  client_name?: string
  /** Тип клиента */
  client_type?: ClientTypeType
  /** Телефон клиента */
  client_phone?: string
  /** Email клиента */
  client_email?: string
  /** Дата начала (ISO 8601) */
  start_date?: ISODateString
  /** Дата окончания (ISO 8601) */
  end_date?: ISODateString
  /** Статус проекта */
  status: ProjectStatusType
  /** Заметки */
  notes?: string
  /** Путь к папке проекта */
  folder_path?: string

  // Вычисляемые поля (только для чтения)
  readonly estimates_count?: number
  readonly contracts_count?: number
  readonly total_amount?: number
}

/** Данные для создания проекта (без автоматических полей) */
export interface CreateProjectData {
  name: string
  address?: string
  client_name?: string
  client_type?: ClientTypeType
  client_phone?: string
  client_email?: string
  start_date?: string
  end_date?: string
  status?: ProjectStatusType
  notes?: string
}

/** Данные для обновления проекта */
export type UpdateProjectData = Partial<CreateProjectData>

export interface Estimate extends BaseEntity, WithFilePath, FinancialTotals, LegacyFinancialFields {
  /** ID связанного проекта */
  project_id?: EntityId
  /** Номер сметы */
  number: string
  /** Название сметы */
  name: string
  /** Тип сметы */
  estimate_type: EstimateTypeType
  /** Статус сметы */
  status: 'draft' | 'in_review' | 'approved' | 'rejected'
  /** Описание */
  description?: string
  /** Процент накладных расходов */
  overhead_percent: number
  /** Процент сметной прибыли */
  profit_percent: number
  /** Процент НДС */
  vat_percent: number
  /** Источник (если создано из дефектовки) */
  source_defect_id?: EntityId

  // Связанные данные
  items?: EstimateItem[]

  // Денормализованные данные / ручной ввод
  project_name?: string
  client_name?: string
  address?: string
}

/** Данные для создания сметы */
export interface CreateEstimateData {
  project_id?: EntityId
  number?: string
  name: string
  estimate_type?: EstimateTypeType
  description?: string
  overhead_percent?: number
  profit_percent?: number
  vat_percent?: number
  source_defect_id?: EntityId
  // Добавлено для совместимости с фиксом
  client_name?: string
  address?: string
  status?: string
  total_cost?: number
}

export interface EstimateItem extends Omit<BaseEntity, 'updated_at'> {
  /** ID сметы */
  estimate_id: EntityId
  /** Порядковый номер */
  position: number
  /** Код расценки */
  code?: string
  /** Наименование */
  name: string
  /** Единица измерения */
  unit: string
  /** Количество */
  quantity: number
  /** Цена за единицу */
  price: number // мастер-цена или цена единицы
  /** Итоговая стоимость */
  total: number
  /** Тип позиции */
  item_type: ItemTypeType
  /** Примечание */
  note?: string

  // Совместимость с компонентами
  masterPrice?: number // алиас для price
  markup?: number
  clientPrice?: number
  materials_total?: number
  labor_total?: number
  total_cost?: number // итого
  material_cost?: number // цена материала
  work_cost?: number // цена работы
}

/** Данные для создания позиции сметы */
export interface CreateEstimateItemData {
  position?: number
  code?: string
  name: string
  unit: string
  quantity: number
  price?: number
  item_type?: ItemTypeType | string
  note?: string

  // Дополнительные поля для бакенда
  materials_cost?: number
  labor_cost?: number
}

export interface Contract extends BaseEntity, WithFilePath {
  /** ID проекта */
  project_id?: EntityId
  /** Номер договора */
  number: string
  /** Дата договора */
  date: ISODateString
  /** Тип договора */
  contract_type: 'contract' | 'agreement'
  /** ID родительского договора (для допсоглашений) */
  parent_contract_id?: EntityId
  /** Сумма договора */
  amount: number
  /** Оплаченная сумма */
  paid_amount: number
  /** Процент аванса */
  prepayment_percent: number
  /** Статус */
  status: 'draft' | 'active' | 'completed' | 'cancelled'

  // Денормализованные данные
  readonly project_name?: string
  readonly client_name?: string

  // Совместимость
  client?: string
  client_type?: string
  contractor?: string
  subject?: string
}

/** Данные для создания договора */
export interface CreateContractData {
  project_id?: EntityId
  number: string
  date: string
  contract_type?: 'contract' | 'agreement'
  parent_contract_id?: EntityId
  amount?: number
  prepayment_percent?: number
  status?: 'draft' | 'active' | 'completed' | 'cancelled'

  // Дополнительно
  client?: string
  client_type?: string
  contractor?: string
  subject?: string
  estimate_id?: number
}

export interface KS2Act extends BaseEntity, WithFilePath {
  /** ID проекта */
  project_id?: EntityId
  /** ID сметы */
  estimate_id?: EntityId
  /** ID договора */
  contract_id?: EntityId
  /** Номер акта */
  number: string
  /** Дата акта */
  date: ISODateString
  /** Начало периода */
  period_from?: ISODateString
  /** Конец периода */
  period_to?: ISODateString
  /** Сумма */
  amount: number
  /** Статус */
  status: 'draft' | 'pending' | 'signed'

  // Денормализованные данные
  readonly project_name?: string
  readonly estimate_number?: string
}

/** Данные для создания КС-2 */
export interface CreateKS2Data {
  project_id?: EntityId
  estimate_id?: EntityId
  contract_id?: EntityId
  number: string
  date: string
  period_from?: string
  period_to?: string
  amount?: number
  status?: 'draft' | 'pending' | 'signed'
}

export interface KS2Item extends Omit<BaseEntity, 'updated_at'> {
  /** ID акта КС-2 */
  ks2_act_id: EntityId
  /** ID позиции сметы */
  estimate_item_id?: EntityId
  /** Код */
  code?: string
  /** Наименование */
  name: string
  /** Единица измерения */
  unit?: string
  /** Цена за единицу */
  unit_price: number
  /** Количество по смете */
  quantity_estimate: number
  /** Количество по акту */
  quantity_act: number
  /** Итоговая стоимость */
  total_price: number
}

/** Данные для создания позиции КС-2 */
export interface CreateKS2ItemData {
  ks2_act_id: EntityId
  estimate_item_id?: EntityId
  code?: string
  name: string
  unit?: string
  unit_price: number
  quantity_estimate: number
  quantity_act: number
}

export interface KS3Cert extends BaseEntity, WithFilePath, LegacyFinancialFields {
  /** ID проекта */
  project_id?: EntityId
  /** ID договора */
  contract_id?: EntityId
  /** ID акта КС-2 */
  ks2_act_id?: EntityId
  /** Номер справки */
  number: string
  /** Дата */
  date: ISODateString
  /** Начало периода */
  period_from?: ISODateString
  /** Конец периода */
  period_to?: ISODateString
  /** Сумма без НДС */
  amount_without_vat: number
  /** Сумма НДС */
  vat_amount: number
  /** Общая сумма */
  amount: number
  /** Статус */
  status: 'draft' | 'pending' | 'signed'

  // Денормализованные данные
  readonly project_name?: string
  readonly contract_number?: string

  // Связанные КС-2
  ks2_ids?: EntityId[]
}

/** Данные для создания КС-3 */
export interface CreateKS3Data {
  project_id?: EntityId
  contract_id?: EntityId
  ks2_act_id?: EntityId
  number: string
  date: string
  period_from?: string
  period_to?: string
  amount_without_vat?: number
  vat_amount?: number
  amount?: number
  status?: 'draft' | 'pending' | 'signed'
  ks2_ids?: EntityId[]
}

export interface M29Doc extends BaseEntity, WithFilePath {
  /** ID проекта */
  project_id?: EntityId
  /** Номер документа */
  number: string
  /** Дата */
  date: ISODateString
  /** Период */
  period?: string
  /** Итого нормативная стоимость */
  total_norm_cost: number
  /** Итого фактическая стоимость */
  total_actual_cost: number
  /** Итого отклонение */
  total_deviation: number
  /** Статус */
  status: 'draft' | 'approved' | 'closed'

  // Денормализованные данные
  readonly project_name?: string
}

/** Данные для создания М-29 */
export interface CreateM29Data {
  project_id?: EntityId
  number: string
  date: string
  period?: string
  status?: 'draft' | 'approved' | 'closed'
}

export interface M29Item {
  id: EntityId
  /** ID документа М-29 */
  m29_id: EntityId
  /** Название материала */
  material_name: string
  /** Единица измерения */
  unit: string
  /** Нормативное количество */
  norm_quantity: number
  /** Фактическое количество */
  actual_quantity: number
  /** Цена */
  price: number
  /** Причина отклонения */
  reason?: string
}

// =============================================================================
// СПРАВОЧНИКИ
// =============================================================================

/** Элемент справочника работ */
export interface CatalogWork {
  id: EntityId
  code: string
  name: string
  unit: string
  price: number
  category?: string
  description?: string
}

/** Элемент справочника материалов */
export interface CatalogMaterial {
  id: EntityId
  code?: string
  name: string
  unit: string
  price: number
  category?: string
  manufacturer?: string
}

/** Регион */
export interface Region {
  id: EntityId
  name: string
  code?: string
  coefficient?: number
}

/** Данные для создания региона */
export interface CreateRegionData {
  name: string
  code?: string
  coefficient?: number
}

// =============================================================================
// ШАБЛОНЫ И ДОКУМЕНТЫ
// =============================================================================

export interface DocumentContext {
  estimate: Estimate
  project: Project | null
  items: EstimateItem[]
  sections: Array<{
    id: number
    estimate_id: number
    name: string
    sort_order?: number
  }>
  coefficients: {
    estimate_id?: number
    work_coef: number
    material_coef: number
    overhead_coef?: number
    profit_coef?: number
  }
  settings: Record<string, any>
  companyInfo: Record<string, any>
  folderPath: string
}

export interface EstimateDocumentSnapshot {
  schemaVersion: number
  generatedAt: ISODateString
  templateVersion: string
  estimate: {
    id?: number
    number: string
    name: string
    status: string
    totals: Record<string, number>
  }
  project: Project | null
  company: Record<string, any>
  coefficients: Record<string, number>
  sections: Array<{ id: number; name: string; sort_order: number }>
  rows: Array<Record<string, any>>
}

export interface AgreementGenerationData {
  number?: string
  date?: string
  subject?: string
  amount?: number
  reason?: string
  appendices?: string
  startDate?: string
  endDate?: string
  paymentTerms?: string
  changePayment?: boolean
  changeTerms?: boolean
}
export interface Template {
  /** Уникальный ID шаблона */
  id: string
  /** Категория */
  category: TemplateCategoryType
  /** Название */
  name: string
  /** Имя файла */
  file: string
  /** Существует ли файл */
  exists: boolean
}

/** Результат операции с шаблоном */
export interface TemplateOperationResult {
  success: boolean
  path?: string
  error?: string
}

export interface TemplatesAPI {
  /** Получить список шаблонов */
  getList: () => Promise<Template[]>
  /** Открыть шаблон для редактирования */
  open: (templateId: string) => Promise<TemplateOperationResult>
  /** Сгенерировать документ из шаблона */
  generate: (
    templateId: string,
    data: Record<string, string | number | boolean | null>,
    outputPath: string
  ) => Promise<TemplateOperationResult>
  /** Скопировать шаблон */
  copy: (
    templateId: string,
    outputDir: string,
    filename: string
  ) => Promise<TemplateOperationResult>
  /** Открыть папку с шаблонами */
  openFolder: () => Promise<string>
}

// =============================================================================
// ЛИЦЕНЗИРОВАНИЕ
// =============================================================================

export interface LicenseInfo {
  /** Валидна ли лицензия */
  isValid: boolean
  /** Тип лицензии */
  type: LicenseTypeType
  /** Название типа */
  typeName: string
  /** Email владельца */
  email: string
  /** Осталось дней */
  daysLeft: number
  /** Дата истечения */
  expiresAt: ISODateString
  /** Пробный период */
  isTrial: boolean
  /** Истекла ли */
  isExpired: boolean
  /** Доступные функции */
  features: string[]
  /** HWID устройства */
  hwid?: string
  /** Нужна ли активация */
  needActivation?: boolean
  /** Ошибка проверки */
  error?: string
  /** Предупреждение о необходимости online-проверки */
  warning?: string
}

export interface LicenseDevice {
  slot: number
  hardware_fingerprint: string
  device_name?: string
  activated_at?: ISODateString
}

export interface LicenseActivationResult {
  success: boolean
  error?: string
  errorCode?: 'INVALID_KEY' | 'ALREADY_ACTIVATED' | 'EXPIRED' | 'NETWORK_ERROR' | 'ACTIVATION_LIMIT_REACHED'
  message?: string
  deviceSlotId?: number
  activeDevices?: LicenseDevice[]
  details?: {
    active_devices?: LicenseDevice[]
    max_pcs?: number
    [key: string]: unknown
  }
  license?: {
    key: string
    email: string
    type: LicenseTypeType
    features: string[]
    activatedAt: ISODateString
    expiresAt: ISODateString
  }
}

// =============================================================================
// ИМПОРТ ДАННЫХ
// =============================================================================

/** Распарсенные данные сметы из Excel */
export interface ParsedEstimateData {
  name: string
  number?: string
  items: Array<{
    position: number
    code?: string
    name: string
    unit: string
    quantity: number
    price: number
    item_type?: ItemTypeType | string
    note?: string
  }>
  metadata?: {
    source_file: string
    parsed_at: ISODateString
    rows_count: number
    errors?: string[]
  }
}

export interface ImportAPI {
  /** Выбрать Excel-файл */
  selectExcelFile: () => Promise<{
    success: boolean
    filePath?: string
    canceled?: boolean
  }>

  /** Распарсить Excel-файл сметы */
  parseEstimateExcel: (filePath: string) => Promise<{
    success: boolean
    data?: ParsedEstimateData
    error?: string
    errors?: string[]
  }>

  /** Создать смету из распарсенных данных */
  createEstimateFromData: (
    projectId: EntityId | null,
    estimateData: ParsedEstimateData
  ) => Promise<{
    success: boolean
    estimate?: Estimate
    error?: string
  }>
}

// =============================================================================
// ДИАЛОГИ
// =============================================================================

export interface SaveDialogOptions {
  title?: string
  defaultPath?: string
  filters?: Array<{
    name: string
    extensions: string[]
  }>
  buttonLabel?: string
}

export interface OpenDialogOptions {
  title?: string
  defaultPath?: string
  filters?: Array<{
    name: string
    extensions: string[]
  }>
  properties?: Array<'openFile' | 'openDirectory' | 'multiSelections'>
  buttonLabel?: string
}

export interface DialogAPI {
  showSaveDialog: (options: SaveDialogOptions) => Promise<{
    filePath?: string
    canceled: boolean
  }>

  showOpenDialog: (options: OpenDialogOptions) => Promise<{
    filePaths: string[]
    canceled: boolean
  }>
}

// =============================================================================
// ГЛАВНЫЙ API ИНТЕРФЕЙС
// =============================================================================

export interface ElectronAPI {
  // === Проекты ===
  projects: {
    getAll: (params?: PaginationParams) => Promise<Project[]>
    get: (id: EntityId) => Promise<Project | null>
    create: (data: Partial<CreateProjectData>) => Promise<{ id: EntityId; folder_path: string }>
    update: (id: EntityId, data: UpdateProjectData) => Promise<void>
    delete: (id: EntityId) => Promise<void>
    getStats?: (id: EntityId) => Promise<{
      estimates_count: number
      contracts_count: number
      total_amount: number
    }>
  }

  // === Сметы ===
  estimates: {
    getAll: (projectId?: EntityId) => Promise<Estimate[]>
    get: (id: EntityId) => Promise<Estimate | null>
    create: (data: Partial<CreateEstimateData>) => Promise<{ id: EntityId }>
    update: (id: EntityId, data: Partial<CreateEstimateData>) => Promise<void>
    delete: (id: EntityId) => Promise<void>
    recalculate?: (id: EntityId) => Promise<Estimate>
    duplicate?: (id: EntityId, newProjectId?: EntityId) => Promise<{ id: EntityId }>
    convertFromDefect?: (defectId: EntityId, options?: { name?: string; number?: string }) => Promise<OperationResult<{ id: EntityId }>>
  }

  // === Позиции смет ===
  estimateItems: {
    getAll: (estimateId: EntityId) => Promise<EstimateItem[]>
    get?: (id: EntityId) => Promise<EstimateItem | null>
    add: (estimateId: EntityId, data: Partial<CreateEstimateItemData>) => Promise<{ id: EntityId }>
    update: (id: EntityId, data: Partial<CreateEstimateItemData>) => Promise<void>
    delete: (id: EntityId) => Promise<void>
    reorder?: (id: EntityId, newPosition: number) => Promise<void>
    addBatch?: (estimateId: EntityId, items: Partial<CreateEstimateItemData>[]) => Promise<{ ids: EntityId[] }>
  }

  // === Договоры ===
  contracts: {
    getAll: (projectId?: EntityId) => Promise<Contract[]>
    get?: (id: EntityId) => Promise<Contract | null>
    create: (data: Partial<CreateContractData>) => Promise<{ id: EntityId }>
    update: (id: EntityId, data: Partial<CreateContractData>) => Promise<void>
    delete: (id: EntityId) => Promise<void>
    getAgreements?: (contractId: EntityId) => Promise<Contract[]>
  }

  // === Акты КС-2 ===
  ks2: {
    getAll: (projectId?: EntityId) => Promise<KS2Act[]>
    get?: (id: EntityId) => Promise<KS2Act | null>
    create: (data: Partial<CreateKS2Data>) => Promise<{ id: EntityId }>
    update?: (id: EntityId, data: Partial<CreateKS2Data>) => Promise<void>
    delete: (id: EntityId) => Promise<void>
    getItems: (actId: EntityId) => Promise<KS2Item[]>
    createItem: (data: Partial<CreateKS2ItemData>) => Promise<KS2Item>
    updateItem?: (id: EntityId, data: Partial<CreateKS2ItemData>) => Promise<void>
    deleteItem: (id: EntityId) => Promise<void>
    fillFromEstimate?: (actId: EntityId, estimateId: EntityId) => Promise<void>
  }

  // === Справки КС-3 ===
  ks3: {
    getAll: (projectId?: EntityId) => Promise<KS3Cert[]>
    get?: (id: EntityId) => Promise<KS3Cert | null>
    create: (data: Partial<CreateKS3Data>) => Promise<{ id: EntityId }>
    update?: (id: EntityId, data: Partial<CreateKS3Data>) => Promise<void>
    delete: (id: EntityId) => Promise<void>
    createFromKS2?: (ks2Ids: EntityId[]) => Promise<{ id: EntityId }>
  }

  // === Документы М-29 ===
  m29: {
    getAll: (projectId?: EntityId) => Promise<M29Doc[]>
    get?: (id: EntityId) => Promise<M29Doc | null>
    create: (data: Partial<CreateM29Data>) => Promise<{ id: EntityId }>
    update?: (id: EntityId, data: Partial<CreateM29Data>) => Promise<void>
    delete?: (id: EntityId) => Promise<void>
    getItems?: (m29Id: EntityId) => Promise<M29Item[]>
  }

  // === Настройки ===
  settings: {
    get: <T extends string | number | boolean>(key: string) => Promise<T | null>
    set: <T extends string | number | boolean>(key: string, value: T) => Promise<void>
    getAll: () => Promise<Record<string, string | number | boolean>>
    reset?: () => Promise<void>
  }

  // === Справочники ===
  catalog: {
    getWorks: (search: string, limit?: number) => Promise<CatalogWork[]>
    createWork: (data: { name: string; code: string; unit?: string; price?: number; category?: string }) => Promise<{ success: boolean; id: number }>
    getMaterials: (search: string, limit?: number) => Promise<CatalogMaterial[]>
    getRegions: () => Promise<Region[]>
    createRegion: (data: CreateRegionData) => Promise<Region>
    updateRegion?: (id: EntityId, data: Partial<CreateRegionData>) => Promise<void>
    deleteRegion: (id: EntityId) => Promise<void>
    importCatalog?: (filePath: string, type: 'works' | 'materials') => Promise<{ count: number }>
    getUnits?: () => Promise<any[]>
    setUnits?: (data: any[]) => Promise<{ success: boolean }>
    getCategories?: () => Promise<any[]>
    setCategories?: (data: any[]) => Promise<{ success: boolean }>
    getVatRates?: () => Promise<any[]>
    setVatRates?: (data: any[]) => Promise<{ success: boolean }>
    getRefCoefficients?: () => Promise<any[]>
    setRefCoefficients?: (data: any[]) => Promise<{ success: boolean }>
  }

  // === Контрагенты ===
  contractors?: {
    getAll: () => Promise<any[]>
    save: (data: any[]) => Promise<{ success: boolean }>
  }

  // === Мастера/бригады ===
  workers?: {
    getAll: () => Promise<any[]>
    save: (data: any[]) => Promise<{ success: boolean }>
  }

  // === ФОТ ===
  fot?: {
    create?: (estimateId: EntityId) => Promise<{ id: EntityId }>
    getAll?: (estimateId: EntityId) => Promise<any[]>
    getWorkers: () => Promise<any[]>
    saveWorkers: (data: any[]) => Promise<{ success: boolean }>
  }

  // === Генерация документов ===
  docs: {
    generateEstimate: (estimateId: EntityId) => Promise<{ path: string }>
    generateKS2: (actId: EntityId) => Promise<{ path: string }>
    generateKS3: (certId: EntityId) => Promise<{ path: string }>
    generateFOT: (estimateId: EntityId) => Promise<{ path: string }>
    generateContract: (contractId: EntityId) => Promise<{ path: string }>
    generateM29: (m29Id: EntityId) => Promise<{ path: string }>
    generateDefektovka: (estimateId: EntityId) => Promise<{ path: string }>
    generateInvoice: (estimateId: EntityId, invoiceData: { number?: string; date?: string; client_name?: string; client_address?: string }) => Promise<{ path: string }>
    generateMaterialRequest: (estimateId: EntityId) => Promise<{ path: string }>
    generateContractFromTemplate: (
      contractId: EntityId,
      templateId: string
    ) => Promise<{ path: string }>
    generateAgreement?: (
      contractId: EntityId,
      agreementType: AdditionalAgreementTypeType,
      agreementData?: AgreementGenerationData
    ) => Promise<{ path: string }>
    generateToFormat?: (
      type: 'estimate' | 'ks2' | 'ks3' | 'contract' | 'm29',
      id: EntityId,
      format: 'docx' | 'pdf' | 'xlsx'
    ) => Promise<{ path: string }>
    generateEstimatePDF?: (estimateId: EntityId) => Promise<{ path: string }>
    generateEstimateHTML?: (estimateId: EntityId) => Promise<{ path: string }>
    generateSmeta2007?: (estimateId: EntityId) => Promise<{ path: string }>
    generateCommercialOffer?: (estimateId: EntityId) => Promise<{ path: string }>
    generatePackage?: (estimateId: EntityId) => Promise<{
      folder: string
      generated: Array<{ type: string; path: string }>
      errors: string[]
    }>
    getEstimateContext?: (estimateId: EntityId) => Promise<DocumentContext>
    getEstimateSnapshot?: (estimateId: EntityId, options?: { templateVersion?: string; generatedAt?: ISODateString }) => Promise<EstimateDocumentSnapshot>
  }

  diagnostics?: {
    openLogsFolder: () => Promise<{ path?: string } | void>
    exportBundle: () => Promise<{ path: string }>
  }

  // === Лицензирование ===
  license: {
    check: () => Promise<LicenseInfo>
    activate: (
      key: string,
      email: string,
      options?: { forceDeactivatePrevious?: boolean; deviceName?: string }
    ) => Promise<LicenseActivationResult>
    hasFeature: (feature: string) => Promise<boolean>
    deactivate?: () => Promise<void>
    getHWID?: () => Promise<string>
    getActiveDevices?: () => Promise<{
      success: boolean
      devices?: LicenseDevice[]
      active_devices?: LicenseDevice[]
      max_pcs?: number
      error?: string
    }>
    deactivateDevice?: (slotId: number) => Promise<{ success: boolean; error?: string; message?: string }>
    getStatus?: () => Promise<LicenseInfo>
    extend?: (data: unknown) => Promise<unknown>
  }

  // === Разделы смет ===
  estimateSections: {
    getAll: (estimateId: EntityId) => Promise<Array<{
      id: number
      estimate_id: number
      name: string
      code?: string
      level: number
      sort_order: number
    }>>
    create: (data: {
      estimate_id: number
      name: string
      code?: string
      level?: number
      sort_order?: number
    }) => Promise<{ id: number }>
    delete: (id: EntityId) => Promise<void>
    update?: (id: EntityId, data: { name?: string; code?: string; sort_order?: number }) => Promise<void>
  }

  // === Системные функции ===
  shell: {
    openPath: (path: string) => Promise<void>
    showItemInFolder: (path: string) => Promise<void>
    openExternal: (url: string) => Promise<void>
  }

  // === Шаблоны ===
  templates: TemplatesAPI

  // === Диалоги ===
  dialog: DialogAPI

  // === Приложение ===
  app: {
    getDataPath: () => Promise<string>
    getVersion?: () => Promise<string>
    restart?: () => Promise<void>
    checkForUpdates?: () => Promise<{
      available: boolean
      version?: string
      releaseNotes?: string
    }>
  }

  // === События меню ===
  onMenuAction: (callback: (action: string) => void) => () => void

  // === Импорт ===
  import: ImportAPI

  // === Коэффициенты (ZARU AI смета) ===
  coefficients?: {
    get: (estimateId: EntityId) => Promise<{
      estimate_id: number
      work_coef: number
      material_coef: number
      overhead_coef: number
      profit_coef: number
    }>
    set: (estimateId: EntityId, data: Partial<{
      work_coef: number
      material_coef: number
      overhead_coef: number
      profit_coef: number
    }>) => Promise<{
      estimate_id: number
      work_coef: number
      material_coef: number
      overhead_coef: number
      profit_coef: number
    }>
    recalculate: (estimateId: EntityId) => Promise<{
      total_fact: number
      total_smeta: number
      margin_abs: number
      margin_percent: number
    }>
  }

  // === Сценарии маржи ===
  marginScenarios?: {
    getAll: (estimateId: EntityId) => Promise<Array<{
      id: number
      estimate_id: number
      name: string
      work_coef_override?: number
      material_coef_override?: number
      description?: string
      created_at: string
    }>>
    create: (data: Partial<{
      estimate_id: number
      name: string
      work_coef_override: number
      material_coef_override: number
      description: string
    }>) => Promise<{ id: number }>
    calculate: (estimateId: EntityId, scenarioId: number) => Promise<{
      scenario_id: number
      scenario_name: string
      total_fact: number
      total_smeta: number
      margin_abs: number
      margin_percent: number
    }>
  }
}

// =============================================================================
// ГЛОБАЛЬНЫЕ ТИПЫ
// =============================================================================

declare global {
  interface Window {
    electronAPI: ElectronAPI
    isElectron: boolean
  }
}

// =============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// =============================================================================

/**
 * Проверяет, работает ли приложение в Electron
 */
export const isElectron = (): boolean => {
  return typeof window !== 'undefined' &&
    window.isElectron === true &&
    typeof window.electronAPI !== 'undefined'
}

/**
 * Безопасно получает Electron API
 * @returns ElectronAPI или null если работаем в браузере
 */
export const getElectronAPI = (): ElectronAPI | null => {
  if (isElectron()) {
    return window.electronAPI
  }
  return null
}

/**
 * Получает Electron API или выбрасывает ошибку
 * @throws Error если API недоступен
 */
export const requireElectronAPI = (): ElectronAPI => {
  const api = getElectronAPI()
  if (!api) {
    throw new Error(
      'Electron API недоступен. Приложение должно работать в Electron.'
    )
  }
  return api
}




