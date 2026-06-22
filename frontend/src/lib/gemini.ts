/**
 * Интеграция с Google Gemini API
 * Для анализа фото и генерации смет
 */

// Получение API ключа из настроек (синхронно из localStorage)
export const getApiKey = (): string => {
  // Из localStorage (zaru_settings_v2)
  const saved = localStorage.getItem('zaru_settings_v2')
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      const encrypted = parsed.integrations?.geminiApiKey || ''
      if (encrypted) {
        try {
          return decodeURIComponent(atob(encrypted))
        } catch {
          return encrypted
        }
      }
    } catch (e) {
      console.error('Error parsing settings:', e)
    }
  }

  const oldSaved = localStorage.getItem('zaru_settings')
  if (oldSaved) {
    try {
      const parsed = JSON.parse(oldSaved)
      const encrypted = parsed.integrations?.geminiApiKey || ''
      if (encrypted) {
        try {
          return decodeURIComponent(atob(encrypted))
        } catch {
          return encrypted
        }
      }
    } catch {
      return ''
    }
  }

  return ''
}

interface EstimateItem {
  name: string
  unit: string
  quantity: number
  price: number
  total?: number
}

// Задержка
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Вызов Gemini API с retry логикой
async function callGemini(prompt: string, imageBase64?: string, apiKey?: string, retries = 3): Promise<string> {
  const key = apiKey || getApiKey()

  if (!key) {
    throw new Error('API ключ Gemini не настроен. Перейдите в Настройки → Интеграции')
  }

  // Используем более стабильную модель
  const model = 'gemini-2.0-flash'
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + key

  const parts: any[] = [{ text: prompt }]

  if (imageBase64) {
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')
    parts.unshift({
      inlineData: {
        mimeType: 'image/jpeg',
        data: base64Data
      }
    })
  }

  const request = {
    contents: [{ parts }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 4096
    }
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      })

      if (response.status === 429) {
        // Rate limit - ждём и пробуем снова
        const waitTime = attempt * 3000 // 3, 6, 9 секунд
        console.log('Rate limit, waiting ' + waitTime + 'ms...')
        if (attempt < retries) {
          await delay(waitTime)
          continue
        }
        throw new Error('⏳ Превышен лимит запросов Gemini. Подождите 1 минуту и попробуйте снова.')
      }

      if (response.status === 400) {
        const errorData = await response.json().catch(() => ({}))
        if (errorData.error?.message?.includes('API_KEY')) {
          throw new Error('Неверный API ключ. Проверьте ключ в настройках.')
        }
        throw new Error('Ошибка запроса: ' + (errorData.error?.message || 'Неизвестная ошибка'))
      }

      if (response.status === 403) {
        throw new Error('API ключ не имеет доступа к Gemini. Проверьте настройки в Google Cloud.')
      }

      if (!response.ok) {
        throw new Error('Ошибка API: ' + response.status)
      }

      const data = await response.json()
      
      // Проверяем блокировку контента
      if (data.candidates?.[0]?.finishReason === 'SAFETY') {
        throw new Error('Запрос заблокирован фильтром безопасности. Попробуйте другое описание.')
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
      if (!text) {
        throw new Error('Пустой ответ от AI. Попробуйте переформулировать запрос.')
      }

      return text
    } catch (error: any) {
      if (attempt === retries || !error.message?.includes('fetch')) {
        throw error
      }
      await delay(1000)
    }
  }

  throw new Error('Не удалось получить ответ от AI после ' + retries + ' попыток')
}

// Парсинг JSON из ответа Gemini
function parseJsonFromResponse(text: string): any {
  // Ищем JSON в ответе
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) ||
                    text.match(/```\s*([\s\S]*?)\s*```/) ||
                    text.match(/\[[\s\S]*?\]/) ||
                    text.match(/\{[\s\S]*?\}/)

  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1] || jsonMatch[0])
    } catch {
      return null
    }
  }

  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

// Анализ фото сметы или объекта
export async function analyzePhoto(imageBase64: string, apiKey?: string): Promise<{ items: EstimateItem[], description: string, rawText?: string }> {
  const prompt = `Ты эксперт по распознаванию строительных смет и рукописного текста.

ПРОАНАЛИЗИРУЙ ИЗОБРАЖЕНИЕ:

1. Если это РУКОПИСНЫЙ ТЕКСТ (записка, список работ):
   - Внимательно прочитай ВЕСЬ рукописный текст
   - Извлеки каждую строку/пункт как отдельную работу
   - Определи количество и единицы если указаны

2. Если это ПЕЧАТНАЯ СМЕТА:
   - Извлеки все позиции с ценами

3. Если это ФОТО ОБЪЕКТА (комната, стены):
   - Определи какие работы требуются

ВЕРНИ ОТВЕТ В ФОРМАТЕ:
{
  "rawText": "ПОЛНЫЙ распознанный текст с фото (каждая строка)",
  "items": [
    {"name": "Название работы", "unit": "м²", "quantity": 10, "price": 500},
    ...
  ]
}

Единицы: м², м.п., шт., компл., точка, услуга
Цены актуальные для России 2024-2025.

ВАЖНО: В rawText запиши ВСЁ что видишь на фото - это поможет пользователю проверить распознавание!
Ответь ТОЛЬКО валидным JSON!`

  const response = await callGemini(prompt, imageBase64, apiKey)
  console.log('Gemini response:', response.substring(0, 500))

  const parsed = parseJsonFromResponse(response)

  // Если пришёл объект с rawText и items
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const items = Array.isArray(parsed.items) ? parsed.items : []
    return {
      items: items.map((item: any) => ({
        name: String(item.name || item.наименование || ''),
        unit: String(item.unit || item.единица || 'шт'),
        quantity: parseFloat(item.quantity || item.количество || 1) || 1,
        price: parseFloat(item.price || item.цена || 0) || 0,
        total: parseFloat(item.total || item.сумма || 0) || undefined
      })).filter((item: EstimateItem) => item.name && item.name.length > 2),
      description: 'Распознано ' + items.length + ' позиций',
      rawText: parsed.rawText || response
    }
  }

  // Старый формат - просто массив
  if (Array.isArray(parsed) && parsed.length > 0) {
    return {
      items: parsed.map((item: any) => ({
        name: String(item.name || item.наименование || ''),
        unit: String(item.unit || item.единица || 'шт'),
        quantity: parseFloat(item.quantity || item.количество || 1) || 1,
        price: parseFloat(item.price || item.цена || 0) || 0,
        total: parseFloat(item.total || item.сумма || 0) || undefined
      })).filter((item: EstimateItem) => item.name && item.name.length > 2),
      description: 'Распознано ' + parsed.length + ' позиций',
      rawText: response
    }
  }

  // Если не распознали позиции, вернём сырой текст
  return { 
    items: [], 
    description: 'Не удалось извлечь позиции. Попробуйте чёткое фото.',
    rawText: response 
  }
}

// Генерация позиций сметы по текстовому описанию
export async function generateEstimateItems(description: string, city?: string, apiKey?: string): Promise<{ items: EstimateItem[] }> {
  const cityNote = city ? 'Регион: ' + city + '.' : 'Регион: Россия (средние цены).'

  const prompt = 'Составь смету на работы:\n"' + description + '"\n\n' +
    cityNote + '\n\n' +
    'Верни JSON массив позиций:\n' +
    '[{"name": "Демонтаж стяжки", "unit": "м²", "quantity": 20, "price": 350}, ...]\n\n' +
    'Включи: подготовку, основные работы, отделку, материалы.\n' +
    'Единицы: м², м.п., шт., компл., точка\n' +
    'Цены актуальные для 2024-2025.\n' +
    'Ответь ТОЛЬКО валидным JSON массивом!'

  const response = await callGemini(prompt, undefined, apiKey)
  const items = parseJsonFromResponse(response)

  if (Array.isArray(items) && items.length > 0) {
    return {
      items: items.map((item: any) => ({
        name: String(item.name || ''),
        unit: String(item.unit || 'шт'),
        quantity: parseFloat(item.quantity || 1) || 1,
        price: parseFloat(item.price || 0) || 0
      })).filter((item: EstimateItem) => item.name)
    }
  }

  return { items: [] }
}

// Чат с AI ассистентом
export async function chat(message: string, _context?: string, history?: Array<{role: string, content: string}>, apiKey?: string): Promise<string> {
  let prompt = 'Ты AI-ассистент сметной программы ZARU Смета. Помогаешь со сметами, расчётами, строительством.\n\n'

  if (history && history.length > 0) {
    prompt += 'История:\n'
    for (const msg of history.slice(-4)) {
      prompt += (msg.role === 'user' ? 'Вопрос: ' : 'Ответ: ') + msg.content + '\n'
    }
    prompt += '\n'
  }
  
  prompt += 'Вопрос: ' + message + '\n\n'
  prompt += 'Ответь кратко на русском. Если про расценки - дай конкретные цифры для России 2024-2025.'

  return await callGemini(prompt, undefined, apiKey)
}

// Подбор расценок
export async function suggestPrices(items: EstimateItem[], city?: string, apiKey?: string): Promise<EstimateItem[]> {
  const prompt = 'Актуализируй цены на работы' + (city ? ' для ' + city : '') + ':\n\n' +
    JSON.stringify(items, null, 2) + '\n\n' +
    'Верни тот же JSON с актуальными ценами 2024-2025:\n' +
    '[{"name": "...", "unit": "...", "quantity": N, "price": ЦЕНА}]\n' +
    'Только JSON!'

  const response = await callGemini(prompt, undefined, apiKey)
  const updated = parseJsonFromResponse(response)

  return Array.isArray(updated) ? updated : items
}

export default {
  analyzePhoto,
  generateEstimateItems,
  chat,
  suggestPrices,
  getApiKey
}

