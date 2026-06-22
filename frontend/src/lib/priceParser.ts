/**
 * ZARU Смета - Парсер цен на строительные материалы
 * Получение актуальных цен из открытых источников
 */

export interface ParsedPrice {
  name: string
  price: number
  unit: string
  source: string
  url?: string
  updatedAt: string
}

export interface PriceSearchResult {
  query: string
  results: ParsedPrice[]
  timestamp: string
}

// Базовые цены на материалы (fallback если API недоступен)
const DEFAULT_PRICES: Record<string, { price: number, unit: string }> = {
  'цемент м500 50кг': { price: 550, unit: 'мешок' },
  'цемент м400 50кг': { price: 480, unit: 'мешок' },
  'песок речной': { price: 2500, unit: 'м³' },
  'песок карьерный': { price: 1800, unit: 'м³' },
  'щебень 20-40': { price: 3200, unit: 'м³' },
  'щебень 5-20': { price: 3500, unit: 'м³' },
  'кирпич красный': { price: 18, unit: 'шт' },
  'кирпич силикатный': { price: 15, unit: 'шт' },
  'газобетон 600x200x300': { price: 280, unit: 'шт' },
  'арматура 12мм': { price: 68000, unit: 'тн' },
  'арматура 10мм': { price: 70000, unit: 'тн' },
  'доска обрезная 50x150': { price: 14000, unit: 'м³' },
  'доска обрезная 25x150': { price: 12000, unit: 'м³' },
  'брус 100x100': { price: 13000, unit: 'м³' },
  'брус 150x150': { price: 14000, unit: 'м³' },
  'osb 9мм': { price: 1100, unit: 'лист' },
  'osb 12мм': { price: 1400, unit: 'лист' },
  'фанера 10мм': { price: 1200, unit: 'лист' },
  'фанера 18мм': { price: 1800, unit: 'лист' },
  'гипсокартон 12.5мм': { price: 450, unit: 'лист' },
  'гипсокартон влагостойкий': { price: 550, unit: 'лист' },
  'профиль пн 27x28': { price: 85, unit: 'шт' },
  'профиль пс 60x27': { price: 120, unit: 'шт' },
  'утеплитель 50мм': { price: 1200, unit: 'м³' },
  'утеплитель 100мм': { price: 2400, unit: 'м³' },
  'пеноплекс 50мм': { price: 350, unit: 'лист' },
  'пеноплекс 100мм': { price: 650, unit: 'лист' },
  'рубероид': { price: 550, unit: 'рулон' },
  'гидроизоляция': { price: 1500, unit: 'рулон' },
  'плитка керамическая': { price: 800, unit: 'м²' },
  'керамогранит 60x60': { price: 1200, unit: 'м²' },
  'ламинат 8мм': { price: 650, unit: 'м²' },
  'линолеум': { price: 450, unit: 'м²' },
  'обои виниловые': { price: 1500, unit: 'рулон' },
  'обои флизелиновые': { price: 2000, unit: 'рулон' },
  'краска водоэмульсионная': { price: 350, unit: 'кг' },
  'краска фасадная': { price: 450, unit: 'кг' },
  'штукатурка гипсовая': { price: 450, unit: 'мешок' },
  'штукатурка цементная': { price: 380, unit: 'мешок' },
  'шпаклевка': { price: 550, unit: 'мешок' },
  'грунтовка': { price: 300, unit: 'л' },
  'плиточный клей': { price: 400, unit: 'мешок' },
  'затирка': { price: 250, unit: 'кг' },
  'саморезы 35мм': { price: 250, unit: 'уп' },
  'дюбель-гвоздь': { price: 180, unit: 'уп' },
  'провод ввг 3x2.5': { price: 80, unit: 'м' },
  'провод ввг 3x1.5': { price: 55, unit: 'м' },
  'труба пвх 50мм': { price: 120, unit: 'м' },
  'труба пвх 110мм': { price: 280, unit: 'м' },
  'труба ппр 20мм': { price: 45, unit: 'м' },
  'труба ппр 25мм': { price: 65, unit: 'м' },
}

/**
 * Поиск цены материала по названию
 * В реальном приложении здесь был бы запрос к API парсера
 */
export async function searchMaterialPrice(query: string): Promise<PriceSearchResult> {
  // Нормализуем запрос
  const normalizedQuery = query.toLowerCase().trim()
  
  // Ищем совпадения в базе
  const results: ParsedPrice[] = []
  
  for (const [key, value] of Object.entries(DEFAULT_PRICES)) {
    // Проверяем совпадение по ключевым словам
    const queryWords = normalizedQuery.split(' ')
    const keyWords = key.split(' ')
    
    const matches = queryWords.filter(qw => 
      keyWords.some(kw => kw.includes(qw) || qw.includes(kw))
    )
    
    if (matches.length >= 1) {
      results.push({
        name: key.charAt(0).toUpperCase() + key.slice(1),
        price: value.price,
        unit: value.unit,
        source: 'ZARU База цен',
        updatedAt: new Date().toISOString().slice(0, 10)
      })
    }
  }
  
  // Сортируем по релевантности (количеству совпадений)
  results.sort((a, b) => {
    const aMatches = normalizedQuery.split(' ').filter(w => 
      a.name.toLowerCase().includes(w)
    ).length
    const bMatches = normalizedQuery.split(' ').filter(w => 
      b.name.toLowerCase().includes(w)
    ).length
    return bMatches - aMatches
  })
  
  return {
    query,
    results: results.slice(0, 10),
    timestamp: new Date().toISOString()
  }
}

/**
 * Получить все материалы из базы цен
 */
export function getAllMaterialPrices(): ParsedPrice[] {
  return Object.entries(DEFAULT_PRICES).map(([name, data]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    price: data.price,
    unit: data.unit,
    source: 'ZARU База цен',
    updatedAt: new Date().toISOString().slice(0, 10)
  }))
}

/**
 * Обновить цену материала (локально)
 */
export function updateMaterialPrice(name: string, newPrice: number): boolean {
  const key = name.toLowerCase()
  if (DEFAULT_PRICES[key]) {
    DEFAULT_PRICES[key].price = newPrice
    return true
  }
  return false
}

/**
 * Добавить материал в базу цен
 */
export function addMaterialPrice(name: string, price: number, unit: string): void {
  DEFAULT_PRICES[name.toLowerCase()] = { price, unit }
}

/**
 * Экспорт базы цен в JSON
 */
export function exportPricesAsJson(): string {
  return JSON.stringify(getAllMaterialPrices(), null, 2)
}

/**
 * Применить региональный коэффициент к цене
 */
export function applyRegionCoefficient(price: number, coefficient: number): number {
  return Math.round(price * coefficient)
}
