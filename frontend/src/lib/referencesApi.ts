/**
 * References API - Справочники работ и материалов
 * Использует каталог на основе ФЕР (70+ работ, 60+ материалов)
 */

import { searchWorks, searchMaterials } from './catalog'

export interface WorkItem {
    id: number
    code: string
    name: string
    unit: string
    labor_price: number
    material_price: number
    price: number
    category: string
}

export interface MaterialItem {
    id: number
    code: string
    name: string
    unit: string
    price: number
    category: string
}

// Поиск работ
export const searchWorksApi = async (query?: string): Promise<{ data: { items: WorkItem[] } }> => {
    // В Electron используем API базы данных
    if (window.electronAPI?.catalog?.getWorks) {
        try {
            const works = await window.electronAPI.catalog.getWorks(query || '')
            return {
                data: {
                    items: works.map((w: any) => ({
                        id: w.id,
                        code: w.code,
                        name: w.name,
                        unit: w.unit,
                        labor_price: (w.labor_price ?? w.price ?? 0),
                        material_price: (w.material_price ?? 0),
                        price: (w.labor_price ?? w.price ?? 0) + (w.material_price ?? 0),
                        category: w.category
                    }))
                }
            }
        } catch (e) {
            console.error('Failed to search works via API:', e)
            return { data: { items: [] } }
        }
    }

    // Fallback для браузера
    const works = searchWorks(query || '')
    return {
        data: {
            items: works.map(w => ({
                id: w.id,
                code: w.code,
                name: w.name,
                unit: w.unit,
                labor_price: (w.labor_price ?? w.price ?? 0),
                material_price: (w.material_price ?? 0),
                price: (w.labor_price ?? w.price ?? 0) + (w.material_price ?? 0),
                category: w.category
            }))
        }
    }
}

// Поиск материалов
export const searchMaterialsApi = async (query?: string): Promise<{ data: { items: MaterialItem[] } }> => {
    // В будущем тоже через API
    const materials = searchMaterials(query || '')
    return {
        data: {
            items: materials.map(m => ({
                id: m.id,
                code: m.code,
                name: m.name,
                unit: m.unit,
                price: m.price,
                category: m.category
            }))
        }
    }
}

// Экспорт для совместимости с существующим кодом
export const worksApiNew = {
    search: searchWorksApi,
    list: searchWorksApi
}

export const materialsApiNew = {
    search: searchMaterialsApi,
    list: searchMaterialsApi
}
