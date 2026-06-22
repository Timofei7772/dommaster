/**
 * Хук для работы с настройками приложения
 * Сохраняет в SQLite через Electron API (надёжно)
 * Fallback на localStorage для веб-версии
 */
import { useState, useEffect } from 'react'

export interface AppSettings {
  general: {
    theme: 'light' | 'dark' | 'system'
    language: string
    currency: string
    autoSave: boolean
    region: string  // Регион для коэффициентов
  }
  company: {
    name: string
    inn: string
    kpp: string
    ogrn: string
    address: string
    phone: string
    email: string
    director: string
    directorPosition: string      // Должность руководителя (Директор, Генеральный директор и т.д.)
    directorBasis: string         // На основании чего действует (Устава, Доверенности и т.д.)
    accountant: string
    bankName: string              // Название банка
    bik: string                   // БИК банка
    checkingAccount: string       // Расчётный счёт
    correspondentAccount: string  // Корреспондентский счёт
  }
  estimates: {
    autoNumber: boolean
    numberPrefix: string
    defaultVat: number
    vatEnabled: boolean       // Включен ли НДС
    vatRate: number           // Ставка НДС: 0, 5, 10, 20
    defaultMarkup: number
    overheadPercent: number
    profitPercent: number
    includeMaterials: boolean // Включать материалы в смету
    regionCoefficient: number // Региональный коэффициент
    // === ZARU AI смета: Коэффициенты ===
    workCoefficient: number       // Коэффициент на работы (по умолч 1.8)
    materialCoefficient: number   // Коэффициент на материалы (по умолч 1.04)
    // === ZARU AI смета: Лимитированные затраты ===
    limitedCostsMode: string      // "Без лимитированных затрат" | "С лимитированными затратами"
    lniPercent: number            // Лимитированные накладные издержки %
    vnsPercent: number            // Временные/непредвиденные затраты %
  }
  // === ZARU AI смета: Настройки договоров ===
  contract: {
    withAdvance: boolean          // Договор с авансом
    advancePercent: number        // Процент аванса (по умолч 50%)
    workStartText: string         // Текст о начале работ
    workEndText: string           // Текст об окончании работ  
    paymentTermDays: number       // Срок оплаты в днях
    warrantyYears: number         // Срок гарантии в годах
    progressPayment: boolean      // Поэтапная оплата
    addAddressToSubject: boolean  // Добавлять адрес к предмету договора
    writeAppendices: boolean      // Писать приложения
    defaultTemplate: string       // Шаблон договора по умолчанию
  }
  // === ZARU AI смета: Настройки КС-2/КС-3 ===
  ks: {
    fillInvestor: boolean         // Заполнять инвестора
    minusPercentages: boolean     // Минус процентовки
    autoCalculate: boolean        // Авто-расчёт
    allowNullRows: boolean        // Разрешить нулевые строки
    hidePhone: boolean            // Скрыть телефон
    setSharedPercent: boolean     // Общий процент выполнения
    setPercentBySection: boolean  // Процент по разделам
  }
  // === ZARU AI смета: Настройки ФОТ ===
  fot: {
    mode: 'employee' | 'selfemployed' | 'ip_patent'  // Режим налогообложения
    ndflEnabled: boolean          // Удерживать НДФЛ
    insuranceEnabled: boolean     // Страховые взносы
    groupPrices: boolean          // Группировать работы
    combineSections: boolean      // Объединять разделы
    createInNewWorkbook: boolean  // Создавать в новой книге
    noExportPriceTC: boolean      // Не экспортировать цены ТЦ
  }
  // === ZARU AI смета: Настройки списка материалов ===
  materials: {
    combineSections: boolean      // Объединять разделы
    groupMaterials: boolean       // Группировать материалы
    createInNewWorkbook: boolean  // Создавать в новой книге
    noExportResourceTC: boolean   // Не экспортировать ресурсы ТЦ
    groupMechanisms: boolean      // Группировать механизмы отдельно
  }
  // === ZARU AI смета: Цвета документов ===
  documentColors: {
    printColor: boolean           // Цветная печать
    askPrintColor: boolean        // Спрашивать о цветной печати
    colorPrice: string            // Цвет работ (Black)
    colorMaterial: string         // Цвет материалов (RoyalBlue)
    colorQuantity: string         // Цвет количества (SaddleBrown)
    colorMechanism: string        // Цвет механизмов (Green)
    colorComment: string          // Цвет комментариев (Gray)
    highlightQuantity: boolean    // Выделять количество цветом
  }
  integrations: {
    aiProvider: 'gemini' | 'openai' | 'claude'
    geminiApiKey: string
    openaiApiKey: string
    aiModel: string
    claudeApiKey: string
    priceParserEnabled: boolean // Парсер цен на материалы
  }
  notifications: {
    emailEnabled: boolean
    deadlineReminder: number
    soundEnabled: boolean
  }
  security: {
    sessionTimeout: number
    autoBackup: boolean
    encryptionEnabled: boolean
  }
}

// Регионы России с коэффициентами к ценам
export const REGIONS_DATA: Record<string, { name: string, coefficient: number }> = {
  'moscow': { name: 'Москва', coefficient: 1.0 },
  'moscow_region': { name: 'Московская область', coefficient: 0.85 },
  'spb': { name: 'Санкт-Петербург', coefficient: 0.9 },
  'spb_region': { name: 'Ленинградская область', coefficient: 0.8 },
  'krasnodar': { name: 'Краснодарский край', coefficient: 0.75 },
  'sochi': { name: 'Сочи', coefficient: 0.95 },
  'crimea': { name: 'Крым / Севастополь', coefficient: 0.7 },
  'kazan': { name: 'Казань / Татарстан', coefficient: 0.75 },
  'ekaterinburg': { name: 'Екатеринбург / Свердловская', coefficient: 0.8 },
  'novosibirsk': { name: 'Новосибирск', coefficient: 0.7 },
  'nizhny': { name: 'Нижний Новгород', coefficient: 0.7 },
  'samara': { name: 'Самара', coefficient: 0.65 },
  'rostov': { name: 'Ростов-на-Дону', coefficient: 0.7 },
  'voronezh': { name: 'Воронеж', coefficient: 0.6 },
  'ufa': { name: 'Уфа / Башкортостан', coefficient: 0.65 },
  'chelyabinsk': { name: 'Челябинск', coefficient: 0.65 },
  'perm': { name: 'Пермь', coefficient: 0.65 },
  'volgograd': { name: 'Волгоград', coefficient: 0.6 },
  'tyumen': { name: 'Тюмень', coefficient: 0.85 },
  'hmao': { name: 'ХМАО (Ханты-Мансийск)', coefficient: 1.5 },
  'yanao': { name: 'ЯНАО (Салехард, Новый Уренгой)', coefficient: 1.8 },
  'sakhalin': { name: 'Сахалин / Дальний Восток', coefficient: 1.6 },
  'murmansk': { name: 'Мурманск / Крайний Север', coefficient: 1.4 },
  'arkhangelsk': { name: 'Архангельск', coefficient: 1.2 },
  'komi': { name: 'Республика Коми', coefficient: 1.3 },
  'yakutia': { name: 'Якутия (Саха)', coefficient: 1.7 },
  'kamchatka': { name: 'Камчатка', coefficient: 1.9 },
  'magadan': { name: 'Магадан', coefficient: 1.8 },
  'chukotka': { name: 'Чукотка', coefficient: 2.0 },
  'kaliningrad': { name: 'Калининград', coefficient: 0.75 },
  'other_central': { name: 'Центральная Россия (прочие)', coefficient: 0.6 },
  'other_south': { name: 'Южная Россия (прочие)', coefficient: 0.55 },
  'other_volga': { name: 'Поволжье (прочие)', coefficient: 0.55 },
  'other_ural': { name: 'Урал (прочие)', coefficient: 0.6 },
  'other_siberia': { name: 'Сибирь (прочие)', coefficient: 0.6 },
}

export const defaultSettings: AppSettings = {
  general: {
    theme: 'system',
    language: 'ru',
    currency: 'RUB',
    autoSave: true,
    region: 'moscow',
  },
  company: {
    name: '',
    inn: '',
    kpp: '',
    ogrn: '',
    address: '',
    phone: '',
    email: '',
    director: '',
    directorPosition: 'Директор',
    directorBasis: 'Устава',
    accountant: '',
    bankName: '',
    bik: '',
    checkingAccount: '',
    correspondentAccount: '',
  },
  estimates: {
    autoNumber: true,
    numberPrefix: 'СМ-',
    defaultVat: 20,
    vatEnabled: true,
    vatRate: 20,
    defaultMarkup: 30,
    overheadPercent: 15,
    profitPercent: 10,
    includeMaterials: false,
    regionCoefficient: 1.0,
    // === ZARU AI смета: Коэффициенты ===
    workCoefficient: 1.8,         // Как в ZARU AI смета: Def_KoeffPrice
    materialCoefficient: 1.04,    // Как в ZARU AI смета: Def_KoeffMaterial
    // === ZARU AI смета: Лимитированные затраты ===
    limitedCostsMode: 'Без лимитированных затрат',
    lniPercent: 0,
    vnsPercent: 0,
  },
  // === ZARU AI смета: Настройки договоров ===
  contract: {
    withAdvance: true,            // Dog_WithAvans
    advancePercent: 50,           // Dog_StavkaAvansa
    workStartText: 'в течение 5 (пяти) рабочих дней с момента оплаты Заказчиком авансового платежа',
    workEndText: 'в течение 20 (двадцати) рабочих дней с момента начала работ',
    paymentTermDays: 5,           // Dog_SrokPayments: "В течение 5 (пяти) банковских дней"
    warrantyYears: 2,             // Dog_SrokGarantii: "2 (два) года"
    progressPayment: false,       // Dog_ProgressPayment
    addAddressToSubject: true,    // Dog_AddAddresKPredmetuDog
    writeAppendices: true,        // Dog_WritePrilogenija
    defaultTemplate: 'Договор подряда (заказчик - юр. лицо или ИП).dotx',
  },
  // === ZARU AI смета: Настройки КС-2/КС-3 ===
  ks: {
    fillInvestor: true,           // KC2_FillInvestor, KC3_FillInvestor
    minusPercentages: true,       // KC2_MinusProcentovki
    autoCalculate: true,          // KC2_SetAuto
    allowNullRows: false,         // KC2_AllowNullRow
    hidePhone: false,             // KC2_NoWriteTelefon
    setSharedPercent: false,      // KC2_SetSharedProcent
    setPercentBySection: false,   // KC2_SetProcentByEveryRazdel
  },
  // === ZARU AI смета: Настройки ФОТ ===
  fot: {
    mode: 'employee',
    ndflEnabled: true,
    insuranceEnabled: true,
    groupPrices: true,            // FOT_GroupPrices
    combineSections: false,       // FOT_CombineRazdels
    createInNewWorkbook: false,   // FOT_CreatingInNewWorkbook
    noExportPriceTC: true,        // FOT_NoExportPrice_TC
  },
  // === ZARU AI смета: Настройки списка материалов ===
  materials: {
    combineSections: true,        // SpMat_CombineRazdels
    groupMaterials: true,         // SpMat_GroupMaterials
    createInNewWorkbook: false,   // SpMat_CreatingInNewWorkBook
    noExportResourceTC: true,     // SpMat_NoExportResurs_TC
    groupMechanisms: false,       // SpMat_GroupMehanizmInIndividualRazdel
  },
  // === ZARU AI смета: Цвета документов ===
  documentColors: {
    printColor: true,             // PrintColor
    askPrintColor: true,          // QuestionPrintColor
    colorPrice: '#000000',        // Black
    colorMaterial: '#4169E1',     // RoyalBlue
    colorQuantity: '#8B4513',     // SaddleBrown
    colorMechanism: '#008000',    // Green
    colorComment: '#808080',      // Gray
    highlightQuantity: true,      // OuterColorKolichestvo
  },
  integrations: {
    aiProvider: 'gemini',
    geminiApiKey: '',
    openaiApiKey: '',
    aiModel: 'gemini-2.0-flash',
    claudeApiKey: '',
    priceParserEnabled: false,
  },
  notifications: {
    emailEnabled: true,
    deadlineReminder: 3,
    soundEnabled: false,
  },
  security: {
    sessionTimeout: 60,
    autoBackup: true,
    encryptionEnabled: false,
  },
}

// Простое шифрование для localStorage
const encrypt = (text: string): string => {
  try {
    return btoa(encodeURIComponent(text))
  } catch {
    return ''
  }
}

const decrypt = (encoded: string): string => {
  try {
    return decodeURIComponent(atob(encoded))
  } catch {
    return ''
  }
}

// Глубокое слияние объектов
const deepMerge = (target: any, source: any): any => {
  const result = { ...target }
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key])
    } else if (source[key] !== undefined) {
      result[key] = source[key]
    }
  }
  return result
}

export const useSettings = () => {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [loaded, setLoaded] = useState(false)

  // Загрузка настроек при монтировании
  useEffect(() => {
    const loadSettings = async () => {
      try {
        // Загружаем из localStorage
        const saved = localStorage.getItem('zaru_settings_v2')
        let parsed = defaultSettings
        if (saved) {
          try {
            const raw = JSON.parse(saved)
            // Глубокое слияние с defaultSettings чтобы все поля были
            parsed = deepMerge(defaultSettings, raw)
            // Расшифровываем API ключ
            if (parsed.integrations?.geminiApiKey) {
              try {
                parsed.integrations.geminiApiKey = decrypt(parsed.integrations.geminiApiKey)
              } catch {
                parsed.integrations.geminiApiKey = String(parsed.integrations.geminiApiKey || '')
              }
            }
          } catch {
            parsed = defaultSettings
          }
        }

        // Если есть Electron API - получаем API ключ оттуда (более надёжно)
        if (window.electronAPI?.settings) {
          console.log('Loading settings from Electron DB...')
          try {
            const geminiKey = await window.electronAPI.settings.get<string>('gemini_api_key')
            if (geminiKey) {
              parsed.integrations.geminiApiKey = geminiKey
            }
            console.log('Settings loaded, has Gemini key:', !!geminiKey)
          } catch (e) {
            console.error('Error loading from Electron:', e)
          }
        }

        setSettings(parsed)
      } catch (e) {
        console.error('Error loading settings:', e)
        setSettings(defaultSettings)
      }
      setLoaded(true)
    }

    loadSettings()
  }, [])

  const saveSettings = async (newSettings: AppSettings) => {
    try {
      // Сохраняем API ключи в SQLite через Electron (надёжно!)
      if (window.electronAPI?.settings) {
        console.log('Saving to Electron DB...')
        try {
          await window.electronAPI.settings.set('gemini_api_key', newSettings.integrations?.geminiApiKey || '')
          console.log('Saved to Electron DB successfully')
        } catch (e) {
          console.error('Error saving to Electron:', e)
        }
      }

      // Также сохраняем в localStorage
      const toSave = JSON.parse(JSON.stringify(newSettings))
      // Шифруем API ключ для localStorage
      if (toSave.integrations?.geminiApiKey) {
        toSave.integrations.geminiApiKey = encrypt(toSave.integrations.geminiApiKey)
      }
      localStorage.setItem('zaru_settings_v2', JSON.stringify(toSave))

      setSettings(newSettings)
    } catch (e) {
      console.error('Error saving settings:', e)
      throw e
    }
  }

  return { settings, saveSettings, loaded }
}

export default useSettings


