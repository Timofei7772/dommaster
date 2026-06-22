/**
 * ZARU Смета - Работа с шаблонами документов
 * Генерация документов на основе шаблонов .dotx/.xltx
 */

const path = require('path')
const fs = require('fs')
const PizZip = require('pizzip')
const Docxtemplater = require('docxtemplater')
const ExcelJS = require('exceljs')
const { app } = require('electron')

// Путь к папке с шаблонами документов
const getTemplatesPath = () => {
  const isDev = !app.isPackaged
  if (isDev) {
    // В режиме разработки - папка db в desktop
    return path.join(__dirname, '..', 'db')
  }
  // В production - папка db в ресурсах
  return path.join(process.resourcesPath, 'db')
}

// Список доступных шаблонов с правильными путями
const TEMPLATES = {
  contracts: {
    'contract-individual': {
      name: 'Договор подряда (физ. лицо)',
      file: 'Договор подряда (заказчик - физ. лицо).dotx'
    },
    'contract-company': {
      name: 'Договор подряда (юр. лицо / ИП)',
      file: 'Договор подряда (заказчик - юр. лицо или ИП).dotx'
    }
  },
  documents: {
    'm29': {
      name: 'Ведомость М-29',
      file: 'DocTemplates/Ведомость списания материалов (М-29).xltx'
    },
    'material-request': {
      name: 'Заявка на материалы',
      file: 'DocTemplates/Заявка на материалы.xltx'
    },
    'commercial-offer': {
      name: 'Коммерческое предложение',
      file: 'DocTemplates/Коммерческое предложение.dotx'
    },
    'invoice': {
      name: 'Счёт-фактура',
      file: 'DocTemplates/Счет-фактура.xltx'
    }
  },
  agreements: {
    'additional-individual': {
      name: 'Доп. согл. допсмета (физ. лицо)',
      file: 'DopSoglTemplates/additional/Доп. согл. допсмета (заказчик - Физ. лицо).dotx'
    },
    'additional-company': {
      name: 'Доп. согл. допсмета (юр. лицо / ИП)',
      file: 'DopSoglTemplates/additional/Доп. согл. допсмета (заказчик - Юр. лицо, ИП).dotx'
    },
    'independent-individual': {
      name: 'Доп. согл. отдельное (физ. лицо)',
      file: 'DopSoglTemplates/independent/Доп. согл. отдельное (заказчик - Физ. лицо).dotx'
    },
    'independent-company': {
      name: 'Доп. согл. отдельное (юр. лицо / ИП)',
      file: 'DopSoglTemplates/independent/Доп. согл. отдельное (заказчик - Юр. лицо, ИП).dotx'
    },
    'replacement-individual': {
      name: 'Доп. согл. замена (физ. лицо)',
      file: 'DopSoglTemplates/replacement/Доп. согл. замена (заказчик - Физ. лицо).dotx'
    },
    'replacement-company': {
      name: 'Доп. согл. замена (юр. лицо / ИП)',
      file: 'DopSoglTemplates/replacement/Доп. согл. замена (заказчик - Юр. лицо или ИП).dotx'
    }
  }
}

// Получить список всех шаблонов
const getTemplatesList = () => {
  const result = []

  Object.entries(TEMPLATES).forEach(([category, templates]) => {
    Object.entries(templates).forEach(([id, info]) => {
      const templatePath = path.join(getTemplatesPath(), info.file)
      const exists = fs.existsSync(templatePath)
      result.push({
        id,
        category,
        name: info.name,
        file: info.file,
        exists
      })
    })
  })

  return result
}

// Генерация документа из Excel шаблона (.xltx/.xlsx)
const generateFromExcelTemplate = async (templateId, data, outputPath) => {
  // Найти шаблон
  let templateInfo = null
  for (const category of Object.values(TEMPLATES)) {
    if (category[templateId]) {
      templateInfo = category[templateId]
      break
    }
  }

  if (!templateInfo) {
    throw new Error('Шаблон не найден: ' + templateId)
  }

  const templatePath = path.join(getTemplatesPath(), templateInfo.file)
  if (!fs.existsSync(templatePath)) {
    throw new Error('Файл шаблона не найден: ' + templatePath)
  }

  // Копируем шаблон в целевой файл
  fs.copyFileSync(templatePath, outputPath)

  // Открываем скопированный файл для редактирования
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(outputPath)

  // Заполнение данными (Специфическая логика для разных типов документов)
  // В будущем можно сделать более универсальный маппер
  const sheet = workbook.getWorksheet(1)

  if (templateId === 'm29' && data.items) {
    // Пример заполнения M-29
    // Предполагаем, что таблица начинается с 15 строки (нужно проверять шаблон)
    // Для универсальности пока просто добавим данные в конец или перезапишем, 
    // но для "Copy + Edit" нужно знать структуру шаблона.

    // Временное решение: Если это M-29, используем логику заполнения
    // Но лучше если generateM29 в documents.js будет вызывать эту функцию с callback-ом
    // или эта функция будет просто копировать, а documents.js заполнять.

    // ПОКА ПРОСТО КОПИРУЕМ. Заполнение должно быть в documents.js
  }

  // Если просто копирование шаблона достаточно (например для ручного заполнения):
  // await workbook.xlsx.writeFile(outputPath) // Сохраняем изменения если были
  return outputPath
}

// Универсальная функция генерации
const generateDocument = async (templateId, data, outputPath) => {
  let templateInfo = null
  for (const category of Object.values(TEMPLATES)) {
    if (category[templateId]) {
      templateInfo = category[templateId]
      break
    }
  }

  if (!templateInfo) throw new Error('Шаблон не найден')

  if (templateInfo.file.endsWith('.dotx') || templateInfo.file.endsWith('.docx')) {
    return generateFromWordTemplate(templateId, data, outputPath)
  } else if (templateInfo.file.endsWith('.xltx') || templateInfo.file.endsWith('.xlsx')) {
    // Для Excel используем простую генерацию (копирование) + заполнение если реализовано
    // В текущем виде просто копирует шаблон для "Создать по шаблону"
    return generateFromExcelTemplate(templateId, data, outputPath)
  }

  throw new Error('Неизвестный формат шаблона')
}

// Функция для замены плейсхолдеров в XML, включая разбитые теги
// Word часто разбивает текст [плейсхолдер] на несколько <w:t> тегов
const replacePlaceholdersInXml = (xml, data) => {
  let result = xml

  // Для каждого плейсхолдера
  Object.entries(data).forEach(([placeholder, value]) => {
    const safeValue = String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')

    // 1. Сначала пробуем простую замену (если плейсхолдер не разбит)
    const simpleRegex = new RegExp('\\[' + placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\]', 'g')
    result = result.replace(simpleRegex, safeValue)

    // 2. Теперь ищем разбитые плейсхолдеры
    // Паттерн: символы плейсхолдера могут быть разделены XML тегами
    // Например: [номер</w:t></w:r><w:r><w:t> договора]
    const chars = ('[' + placeholder + ']').split('')
    const pattern = chars.map((c, i) => {
      const escaped = c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      // Между символами могут быть закрывающие/открывающие теги
      if (i < chars.length - 1) {
        return escaped + '(?:</w:t>(?:<[^>]*>)*<w:t[^>]*>)?'
      }
      return escaped
    }).join('')

    try {
      const splitRegex = new RegExp(pattern, 'g')
      result = result.replace(splitRegex, safeValue)
    } catch (e) {
      console.warn('Regex error for placeholder:', placeholder, e.message)
    }
  })

  return result
}

// Генерация документа из Word шаблона (.dotx/.docx)
const generateFromWordTemplate = (templateId, data, outputPath) => {
  // Логика Word остается прежней
  let templateInfo = null
  for (const category of Object.values(TEMPLATES)) {
    if (category[templateId]) {
      templateInfo = category[templateId]
      break
    }
  }
  // ... (повторный поиск избыточен, но оставим для совместимости функции)

  if (!templateInfo) {
    throw new Error('Шаблон не найден: ' + templateId)
  }

  const templatePath = path.join(getTemplatesPath(), templateInfo.file)

  if (!fs.existsSync(templatePath)) {
    throw new Error('Файл шаблона не найден: ' + templatePath)
  }

  // Читаем шаблон
  const content = fs.readFileSync(templatePath, 'binary')
  const zip = new PizZip(content)

  // Заменяем плейсхолдеры напрямую в XML (обходим проблему разбитых тегов)
  const documentXml = zip.file('word/document.xml')
  if (documentXml) {
    let xmlContent = documentXml.asText()
    xmlContent = replacePlaceholdersInXml(xmlContent, data)
    zip.file('word/document.xml', xmlContent)
  }

  // Также обрабатываем headers и footers
  const headerFooterFiles = ['word/header1.xml', 'word/header2.xml', 'word/header3.xml',
    'word/footer1.xml', 'word/footer2.xml', 'word/footer3.xml']
  headerFooterFiles.forEach(fileName => {
    const file = zip.file(fileName)
    if (file) {
      let content = file.asText()
      content = replacePlaceholdersInXml(content, data)
      zip.file(fileName, content)
    }
  })

  // ВАЖНО: Конвертация .dotx (шаблон) в .docx (документ)
  // Word не открывает .docx файлы с Content_Type "template"
  const contentTypesFile = zip.file('[Content_Types].xml')
  if (contentTypesFile) {
    let ct = contentTypesFile.asText()
    // Заменяем template на document
    ct = ct.replace(/wordprocessingml\.template/g, 'wordprocessingml.document')
    zip.file('[Content_Types].xml', ct)
  }

  // Сохраняем результат
  const buf = zip.generate({
    type: 'nodebuffer',
    compression: 'DEFLATE'
  })

  fs.writeFileSync(outputPath, buf)

  return outputPath
}

// Открыть шаблон для редактирования (через системное приложение)
const openTemplate = (templateId) => {
  let templateInfo = null
  for (const category of Object.values(TEMPLATES)) {
    if (category[templateId]) {
      templateInfo = category[templateId]
      break
    }
  }

  if (!templateInfo) {
    throw new Error('Шаблон не найден: ' + templateId)
  }

  const templatePath = path.join(getTemplatesPath(), templateInfo.file)

  if (!fs.existsSync(templatePath)) {
    throw new Error('Файл шаблона не найден: ' + templatePath)
  }

  const { shell } = require('electron')
  shell.openPath(templatePath)

  return templatePath
}

// Копировать шаблон для пользовательских документов
const copyTemplateForDocument = (templateId, outputDir, filename) => {
  let templateInfo = null
  for (const category of Object.values(TEMPLATES)) {
    if (category[templateId]) {
      templateInfo = category[templateId]
      break
    }
  }

  if (!templateInfo) {
    throw new Error('Шаблон не найден: ' + templateId)
  }

  const templatePath = path.join(getTemplatesPath(), templateInfo.file)

  if (!fs.existsSync(templatePath)) {
    throw new Error('Файл шаблона не найден: ' + templatePath)
  }

  // Создаём папку если нужно
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  // Меняем расширение с .dotx на .docx (и .xltx на .xlsx)
  const ext = path.extname(templateInfo.file)
  let outputExt = ext
  if (ext === '.dotx') outputExt = '.docx'
  if (ext === '.xltx') outputExt = '.xlsx'

  const outputFilename = filename + outputExt
  const outputPath = path.join(outputDir, outputFilename)

  fs.copyFileSync(templatePath, outputPath)
  return outputPath
}

// Форматирование даты для документов
const formatDateForDoc = (dateStr) => {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const months = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
  ]
  return date.getDate() + ' ' + months[date.getMonth()] + ' ' + date.getFullYear() + ' г.'
}

// Форматирование суммы прописью
const numberToWords = (num) => {
  // Упрощённая версия - для полной реализации нужна библиотека
  const units = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять']
  const teens = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать']
  const tens = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто']
  const hundreds = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот']

  if (num === 0) return 'ноль'

  const intPart = Math.floor(num)
  const kopPart = Math.round((num - intPart) * 100)

  let result = ''

  // Тысячи
  const thousands = Math.floor(intPart / 1000) % 1000
  if (thousands > 0) {
    if (thousands >= 100) result += hundreds[Math.floor(thousands / 100)] + ' '
    const t10 = thousands % 100
    if (t10 >= 10 && t10 < 20) {
      result += teens[t10 - 10] + ' '
    } else {
      if (t10 >= 20) result += tens[Math.floor(t10 / 10)] + ' '
      const t1 = t10 % 10
      if (t1 === 1) result += 'одна '
      else if (t1 === 2) result += 'две '
      else if (t1 > 0) result += units[t1] + ' '
    }
    const lastTwo = thousands % 100
    const lastOne = thousands % 10
    if (lastTwo >= 11 && lastTwo <= 19) result += 'тысяч '
    else if (lastOne === 1) result += 'тысяча '
    else if (lastOne >= 2 && lastOne <= 4) result += 'тысячи '
    else result += 'тысяч '
  }

  // Сотни/десятки/единицы
  const rest = intPart % 1000
  if (rest >= 100) result += hundreds[Math.floor(rest / 100)] + ' '
  const r10 = rest % 100
  if (r10 >= 10 && r10 < 20) {
    result += teens[r10 - 10] + ' '
  } else {
    if (r10 >= 20) result += tens[Math.floor(r10 / 10)] + ' '
    if (r10 % 10 > 0) result += units[r10 % 10] + ' '
  }

  // Рубли
  const rubLastTwo = intPart % 100
  const rubLastOne = intPart % 10
  if (rubLastTwo >= 11 && rubLastTwo <= 19) result += 'рублей'
  else if (rubLastOne === 1) result += 'рубль'
  else if (rubLastOne >= 2 && rubLastOne <= 4) result += 'рубля'
  else result += 'рублей'

  // Копейки
  result += ' ' + String(kopPart).padStart(2, '0') + ' '
  const kopLastTwo = kopPart % 100
  const kopLastOne = kopPart % 10
  if (kopLastTwo >= 11 && kopLastTwo <= 19) result += 'копеек'
  else if (kopLastOne === 1) result += 'копейка'
  else if (kopLastOne >= 2 && kopLastOne <= 4) result += 'копейки'
  else result += 'копеек'

  return result.trim()
}

module.exports = {
  TEMPLATES,
  getTemplatesPath,
  getTemplatesList,
  generateFromWordTemplate,
  generateFromExcelTemplate,
  generateDocument,
  openTemplate,
  copyTemplateForDocument,
  formatDateForDoc,
  numberToWords
}
