/**
 * AI Провайдеры для ZARU Смета
 * Поддержка: Google Gemini, OpenAI GPT-4o, Anthropic Claude
 */

export type AIProvider = 'gemini' | 'openai' | 'claude'

export interface AIConfig {
  provider: AIProvider
  geminiKey?: string
  openaiKey?: string
  claudeKey?: string
}

// Получение конфигурации AI из настроек
export function getAIConfig(): AIConfig {
  const saved = localStorage.getItem('zaru_settings_v2')
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      const integrations = parsed.integrations || {}

      const decryptKey = (encrypted: string): string => {
        if (!encrypted) return ''
        try {
          return decodeURIComponent(atob(encrypted))
        } catch {
          return encrypted
        }
      }

      return {
        provider: integrations.aiProvider || 'gemini',
        geminiKey: decryptKey(integrations.geminiApiKey || ''),
        openaiKey: decryptKey(integrations.openaiApiKey || ''),
        claudeKey: decryptKey(integrations.claudeApiKey || '')
      }
    } catch (e) {
      console.error('Error parsing settings:', e)
    }
  }
  return { provider: 'gemini' }
}

// Задержка
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// ============ GEMINI API ============
async function callGemini(prompt: string, imageBase64?: string, apiKey?: string, retries = 3): Promise<string> {
  const config = getAIConfig()
  const key = apiKey || config.geminiKey

  if (!key) {
    throw new Error('API ключ Gemini не настроен. Перейдите в Настройки → Интеграции')
  }

  const model = 'gemini-2.0-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`

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
        const waitTime = attempt * 2000
        console.log(`Gemini rate limit, waiting ${waitTime}ms...`)
        if (attempt < retries) {
          await delay(waitTime)
          continue
        }
        throw new Error('Превышен лимит запросов Gemini. Подождите минуту.')
      }

      if (response.status === 400) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error('Ошибка Gemini: ' + (errorData.error?.message || 'Неверный запрос'))
      }

      if (response.status === 403) {
        throw new Error('API ключ Gemini недействителен или заблокирован.')
      }

      if (!response.ok) {
        throw new Error(`Ошибка Gemini API: ${response.status}`)
      }

      const data = await response.json()

      if (data.candidates?.[0]?.finishReason === 'SAFETY') {
        throw new Error('Запрос заблокирован фильтром безопасности.')
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
      if (!text) throw new Error('Пустой ответ от Gemini')

      return text
    } catch (error: any) {
      if (attempt === retries) throw error
      await delay(1000)
    }
  }
  throw new Error('Не удалось получить ответ от Gemini')
}

// ============ OPENAI API ============
async function callOpenAI(prompt: string, imageBase64?: string, apiKey?: string, retries = 3): Promise<string> {
  const config = getAIConfig()
  const key = apiKey || config.openaiKey

  if (!key) {
    throw new Error('API ключ OpenAI не настроен. Перейдите в Настройки → Интеграции')
  }

  const messages: any[] = []

  if (imageBase64) {
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        {
          type: 'image_url',
          image_url: {
            url: `data:image/jpeg;base64,${base64Data}`,
            detail: 'high'
          }
        }
      ]
    })
  } else {
    messages.push({ role: 'user', content: prompt })
  }

  const request = {
    model: 'gpt-4o',
    messages,
    max_tokens: 4096,
    temperature: 0.2
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify(request)
      })

      if (response.status === 429) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error?.message || ''
        const waitTime = attempt * 3000
        if (attempt < retries) {
          console.log(`OpenAI rate limit (${errorMessage}), waiting ${waitTime}ms...`)
          await delay(waitTime)
          continue
        }
        // Определяем тип ошибки по сообщению
        if (errorMessage.toLowerCase().includes('quota') || errorMessage.toLowerCase().includes('billing')) {
          throw new Error('Квота OpenAI исчерпана. Проверьте баланс на platform.openai.com')
        }
        throw new Error('Слишком много запросов к OpenAI. Подождите минуту и попробуйте снова.')
      }

      if (response.status === 401) {
        throw new Error('Неверный API ключ OpenAI. Проверьте ключ в настройках.')
      }

      if (response.status === 402) {
        throw new Error('Недостаточно средств на счёте OpenAI. Пополните баланс.')
      }

      if (response.status === 403) {
        throw new Error('Доступ к OpenAI API запрещён. Проверьте ключ и регион.')
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error?.message || `Код ${response.status}`
        throw new Error(`Ошибка OpenAI: ${errorMessage}`)
      }

      const data = await response.json()
      const text = data.choices?.[0]?.message?.content || ''
      if (!text) throw new Error('Пустой ответ от OpenAI')

      return text
    } catch (error: any) {
      if (attempt === retries) throw error
      await delay(1000)
    }
  }
  throw new Error('Не удалось получить ответ от OpenAI')
}

// ============ CLAUDE API ============
async function callClaude(prompt: string, imageBase64?: string, apiKey?: string, retries = 3): Promise<string> {
  const config = getAIConfig()
  const key = apiKey || config.claudeKey

  if (!key) {
    throw new Error('API ключ Claude не настроен. Перейдите в Настройки → Интеграции')
  }

  const content: any[] = []

  if (imageBase64) {
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/jpeg',
        data: base64Data
      }
    })
  }
  content.push({ type: 'text', text: prompt })

  const request = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{ role: 'user', content }]
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify(request)
      })

      if (response.status === 429) {
        const waitTime = attempt * 3000
        if (attempt < retries) {
          await delay(waitTime)
          continue
        }
        throw new Error('Превышен лимит запросов Claude.')
      }

      if (response.status === 401) {
        throw new Error('Неверный API ключ Claude.')
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Ошибка Claude: ${errorData.error?.message || response.status}`)
      }

      const data = await response.json()
      const text = data.content?.[0]?.text || ''
      if (!text) throw new Error('Пустой ответ от Claude')

      return text
    } catch (error: any) {
      if (attempt === retries) throw error
      await delay(1000)
    }
  }
  throw new Error('Не удалось получить ответ от Claude')
}

// ============ УНИВЕРСАЛЬНЫЙ ВЫЗОВ ============
export async function callAI(prompt: string, imageBase64?: string): Promise<string> {
  const config = getAIConfig()
  console.log(`AI: Используем провайдер ${config.provider}`)

  switch (config.provider) {
    case 'openai':
      return callOpenAI(prompt, imageBase64)
    case 'claude':
      return callClaude(prompt, imageBase64)
    default:
      return callGemini(prompt, imageBase64)
  }
}

// Парсинг JSON из ответа
function parseJsonFromResponse(text: string): any {
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

// ============ ПУБЛИЧНЫЕ ФУНКЦИИ ============

interface EstimateItem {
  name: string
  unit: string
  quantity: number
  price: number
  total?: number
}

// Анализ фото
export async function analyzePhoto(imageBase64: string): Promise<{ items: EstimateItem[], description: string, rawText?: string, detectedText?: string }> {
  const prompt = `Ты - эксперт по сметам на строительные и ремонтные работы. Проанализируй изображение.

ЗАДАЧА 1: РАСПОЗНАЙ ВЕСЬ ТЕКСТ с фотографии. Если это рукописный текст - расшифруй его максимально точно.

ЗАДАЧА 2: Извлеки список работ/позиций из текста.

ФОРМАТ ОТВЕТА (строго соблюдай):
---ТЕКСТ---
(Здесь весь распознанный текст с фото, построчно)
---КОНЕЦ ТЕКСТА---

---ПОЗИЦИИ---
[
  {"name": "Название работы", "unit": "м²", "quantity": 10, "price": 500},
  {"name": "Другая работа", "unit": "шт", "quantity": 5, "price": 1200}
]
---КОНЕЦ ПОЗИЦИЙ---

Правила:
- Единицы измерения: м², м.п., м³, шт., компл., точка, кв.м, п.м
- Если цена не указана - поставь 0
- Если количество не указано - поставь 1
- Цены для России 2024-2025 года
- Распознай ВСЁ что написано, даже если почерк неразборчивый

Начни анализ!`

  const response = await callAI(prompt, imageBase64)
  
  // Извлекаем распознанный текст
  let detectedText = ''
  const textMatch = response.match(/---ТЕКСТ---([\s\S]*?)---КОНЕЦ ТЕКСТА---/)
  if (textMatch) {
    detectedText = textMatch[1].trim()
  }
  
  // Извлекаем позиции
  let items: EstimateItem[] = []
  const itemsMatch = response.match(/---ПОЗИЦИИ---([\s\S]*?)---КОНЕЦ ПОЗИЦИЙ---/)
  if (itemsMatch) {
    const parsed = parseJsonFromResponse(itemsMatch[1])
    if (Array.isArray(parsed)) {
      items = parsed
    }
  } else {
    // Fallback - пробуем найти JSON в любом месте
    const parsed = parseJsonFromResponse(response)
    if (Array.isArray(parsed)) {
      items = parsed
    }
  }

  if (items.length > 0) {
    return {
      items: items.map((item: any) => ({
        name: String(item.name || item.наименование || ''),
        unit: String(item.unit || item.единица || 'шт'),
        quantity: parseFloat(item.quantity || item.количество || 1) || 1,
        price: parseFloat(item.price || item.цена || 0) || 0,
        total: parseFloat(item.total || item.сумма || 0) || undefined
      })).filter((item: EstimateItem) => item.name && item.name.length > 2),
      description: `Распознано ${items.length} позиций`,
      rawText: response,
      detectedText: detectedText || response
    }
  }

  return {
    items: [],
    description: 'Не удалось извлечь позиции. Попробуйте фото с более чётким текстом.',
    rawText: response,
    detectedText: detectedText || response
  }
}

// Генерация сметы по описанию
export async function generateEstimateItems(description: string, city?: string): Promise<{ items: EstimateItem[] }> {
  const cityNote = city ? `Регион: ${city}.` : 'Регион: Россия (средние цены).'

  const prompt = `Составь смету на работы:
"${description}"

${cityNote}

Верни JSON массив позиций:
[{"name": "Демонтаж стяжки", "unit": "м²", "quantity": 20, "price": 350}, ...]

Включи: подготовку, основные работы, отделку, материалы.
Единицы: м², м.п., шт., компл., точка
Цены актуальные для 2024-2025.
Ответь ТОЛЬКО валидным JSON массивом!`

  const response = await callAI(prompt)
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

// Чат с AI
export async function chat(message: string, _context?: string, history?: Array<{role: string, content: string}>): Promise<string> {
  let prompt = 'Ты AI-ассистент сметной программы ZARU Смета. Помогаешь со сметами, расчётами, строительством.\n\n'

  if (history && history.length > 0) {
    prompt += 'История:\n'
    for (const msg of history.slice(-4)) {
      prompt += (msg.role === 'user' ? 'Вопрос: ' : 'Ответ: ') + msg.content + '\n'
    }
    prompt += '\n'
  }

  prompt += `Вопрос: ${message}

Ответь кратко на русском. Если про расценки - дай конкретные цифры для России 2024-2025.`

  return callAI(prompt)
}

// Экспорт для совместимости
export const getApiKey = (): string => {
  const config = getAIConfig()
  return config.geminiKey || ''
}

// Транскрибация аудио через Gemini
export async function transcribeAudio(audioBase64: string, mimeType: string = 'audio/webm', apiKey?: string): Promise<string> {
  // Ключ передаётся как есть - без дешифровки
  let key = apiKey
  
  // Если ключ не передан - пробуем из конфига
  if (!key) {
    const config = getAIConfig()
    key = config.geminiKey
  }

  if (!key) {
    throw new Error('API ключ Gemini не настроен. Перейдите в Настройки → Интеграции')
  }

  return transcribeAudioWithKey(audioBase64, mimeType, key)
}

async function transcribeAudioWithKey(audioBase64: string, mimeType: string, key: string): Promise<string> {

  const model = 'gemini-2.0-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`

  // Убираем data: prefix если есть
  const base64Data = audioBase64.replace(/^data:audio\/\w+;base64,/, '')

  const request = {
    contents: [{
      parts: [
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Data
          }
        },
        {
          text: 'Транскрибируй эту аудиозапись на русском языке. Верни ТОЛЬКО текст того что сказано, без комментариев и пояснений.'
        }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2048
    }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error?.message || 'Ошибка транскрибации')
  }

  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

  return text.trim()
}
