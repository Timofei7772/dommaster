/**
 * Catalog Loader - загрузка справочника работ и материалов
 * Использует статический JSON файл с данными на основе ФЕР
 */

import catalogData from '@/data/catalog.json'

export interface Work {
    id: number
    code: string
    name: string
    unit: string
    labor_price: number
    material_price: number
    price?: number
    category: string
}

export interface Material {
    id: number
    code: string
    name: string
    unit: string
    price: number
    category: string
}

// Получить все работы
export const getWorks = (): Work[] => {
    return catalogData.works as Work[]
}

// Получить все материалы  
export const getMaterials = (): Material[] => {
    return catalogData.materials as Material[]
}

// Поиск работ
export const searchWorks = (query: string): Work[] => {
    if (!query || query.length < 2) return getWorks()

    const q = query.toLowerCase()
    return getWorks().filter(work =>
        work.name.toLowerCase().includes(q) ||
        work.code.toLowerCase().includes(q) ||
        work.category.toLowerCase().includes(q)
    )
}

// Поиск материалов
export const searchMaterials = (query: string): Material[] => {
    if (!query || query.length < 2) return getMaterials()

    const q = query.toLowerCase()
    return getMaterials().filter(mat =>
        mat.name.toLowerCase().includes(q) ||
        mat.code.toLowerCase().includes(q) ||
        mat.category.toLowerCase().includes(q)
    )
}

// Получить работу по ID
export const getWorkById = (id: number): Work | undefined => {
    return getWorks().find(w => w.id === id)
}

// Получить материал по ID
export const getMaterialById = (id: number): Material | undefined => {
    return getMaterials().find(m => m.id === id)
}

// Получить категории работ
export const getWorkCategories = (): string[] => {
    const cats = catalogData.categories
    if (Array.isArray(cats)) return cats as string[]
    return (cats as any)?.works || []
}

// Получить категории материалов
export const getMaterialCategories = (): string[] => {
    const cats = catalogData.categories
    if (Array.isArray(cats)) return cats as string[]
    return (cats as any)?.materials || []
}

// Получить работы по категории
export const getWorksByCategory = (category: string): Work[] => {
    return getWorks().filter(w => w.category === category)
}

// Получить материалы по категории
export const getMaterialsByCategory = (category: string): Material[] => {
    return getMaterials().filter(m => m.category === category)
}

// Статистика каталога
export const getCatalogStats = () => ({
    totalWorks: getWorks().length,
    totalMaterials: getMaterials().length,
    workCategories: getWorkCategories().length,
    materialCategories: getMaterialCategories().length,
    lastUpdated: (catalogData as any).lastUpdated || new Date().toISOString()
})

