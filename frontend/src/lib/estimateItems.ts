/**
 * Estimate Items API - работа с позициями сметы через Electron IPC
 * В Electron: использует SQLite через IPC
 * В браузере: использует localStorage (fallback для разработки)
 */

import { isElectron, getElectronAPI } from './electron.ts'

export interface EstimateItem {
    id: number
    estimate_id: number
    name: string
    unit: string
    quantity: number
    material_price: number
    labor_price: number
    materials_total: number
    labor_total: number
    total: number
    justification?: string
    work_id?: number
    catalog_item_id?: number
    quantity_expr?: string
    coeff_expr?: string
    section_id?: number | null
    // Для совместимости со структурой БД
    code?: string
    unit_price?: number
    labor_cost?: number
    materials_cost?: number
}

// Преобразование данных из БД в формат frontend
const mapFromDB = (item: any): EstimateItem => ({
    id: item.id,
    estimate_id: item.estimate_id,
    name: item.name,
    unit: item.unit || 'шт',
    quantity: item.quantity || 0,
    material_price: item.materials_cost || item.material_price || 0,
    labor_price: item.labor_cost || item.labor_price || 0,
    materials_total: (item.materials_cost || item.material_price || 0) * (item.quantity || 0),
    labor_total: (item.labor_cost || item.labor_price || 0) * (item.quantity || 0),
    total: item.total_price || item.total || 0,
    justification: item.code || item.justification || '',
    work_id: item.work_id,
    catalog_item_id: item.catalog_item_id,
    quantity_expr: item.quantity_expr,
    coeff_expr: item.coeff_expr,
    section_id: item.section_id || null,
    code: item.code,
})

// Преобразование данных из frontend в формат БД
const mapToDB = (estimateId: number, data: Partial<EstimateItem>) => ({
    estimate_id: estimateId,
    name: data.name || '',
    unit: data.unit || 'шт',
    quantity: data.quantity || 0,
    unit_price: (data.material_price || 0) + (data.labor_price || 0),
    materials_cost: data.material_price || 0,
    labor_cost: data.labor_price || 0,
    code: data.justification || data.code || '',
    section_id: data.section_id || null,
    catalog_item_id: data.catalog_item_id ?? data.work_id ?? null,
    quantity_expr: data.quantity_expr,
    coeff_expr: data.coeff_expr,
})

// ================== ELECTRON (SQLite) ==================

const getItemsFromDB = async (estimateId: number): Promise<EstimateItem[]> => {
    const api = getElectronAPI()
    if (!api) return []

    try {
        const items = await api.estimateItems.getAll(estimateId)
        return items.map(mapFromDB)
    } catch (error) {
        console.error('Error getting items from DB:', error)
        return []
    }
}

const addItemToDB = async (estimateId: number, data: Partial<EstimateItem>): Promise<EstimateItem | null> => {
    const api = getElectronAPI()
    if (!api) return null

    try {
        const result = await api.estimateItems.add(estimateId, mapToDB(estimateId, data))
        return {
            id: result.id,
            estimate_id: estimateId,
            name: data.name || '',
            unit: data.unit || 'шт',
            quantity: data.quantity || 1,
            material_price: data.material_price || 0,
            labor_price: data.labor_price || 0,
            materials_total: (data.material_price || 0) * (data.quantity || 1),
            labor_total: (data.labor_price || 0) * (data.quantity || 1),
            total: ((data.material_price || 0) + (data.labor_price || 0)) * (data.quantity || 1),
            justification: data.justification || '',
            work_id: data.work_id,
        }
    } catch (error) {
        console.error('Error adding item to DB:', error)
        return null
    }
}

const updateItemInDB = async (itemId: number, data: Partial<EstimateItem>): Promise<boolean> => {
    const api = getElectronAPI()
    if (!api) return false

    try {
        // Маппинг полей frontend -> БД
        const dbData: any = {}
        if (data.name !== undefined) dbData.name = data.name
        if (data.unit !== undefined) dbData.unit = data.unit
        if (data.quantity !== undefined) dbData.quantity = data.quantity
        if (data.material_price !== undefined) {
            dbData.materials_cost = data.material_price
            dbData.material_price = data.material_price
        }
        if (data.labor_price !== undefined) {
            dbData.labor_cost = data.labor_price
            dbData.labor_price = data.labor_price
        }
        if (data.justification !== undefined || data.code !== undefined) {
            dbData.code = data.justification || data.code
            dbData.justification = data.justification || data.code
        }
        if (data.section_id !== undefined) {
            dbData.section_id = data.section_id
        }
        
        await api.estimateItems.update(itemId, dbData)
        return true
    } catch (error) {
        console.error('Error updating item in DB:', error)
        return false
    }
}

const deleteItemFromDB = async (itemId: number): Promise<boolean> => {
    const api = getElectronAPI()
    if (!api) return false

    try {
        await api.estimateItems.delete(itemId)
        return true
    } catch (error) {
        console.error('Error deleting item from DB:', error)
        return false
    }
}

// ================== LOCALSTORAGE (fallback) ==================

const getItemsFromLS = (estimateId: number): EstimateItem[] => {
    const key = `estimate_items_${estimateId}`
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored) : []
}

const addItemToLS = (estimateId: number, data: Partial<EstimateItem>): EstimateItem => {
    const key = `estimate_items_${estimateId}`
    const items = getItemsFromLS(estimateId)

    const newItem: EstimateItem = {
        id: Date.now(),
        estimate_id: estimateId,
        name: data.name || '',
        unit: data.unit || 'шт',
        quantity: data.quantity || 1,
        material_price: data.material_price || 0,
        labor_price: data.labor_price || 0,
        materials_total: (data.material_price || 0) * (data.quantity || 1),
        labor_total: (data.labor_price || 0) * (data.quantity || 1),
        total: ((data.material_price || 0) + (data.labor_price || 0)) * (data.quantity || 1),
        justification: data.justification || '',
        work_id: data.work_id
    }

    items.push(newItem)
    localStorage.setItem(key, JSON.stringify(items))
    return newItem
}

const updateItemInLS = (estimateId: number, itemId: number, data: Partial<EstimateItem>): EstimateItem | null => {
    const key = `estimate_items_${estimateId}`
    const items = getItemsFromLS(estimateId)
    const index = items.findIndex(item => item.id === itemId)

    if (index === -1) return null

    const updatedItem = {
        ...items[index],
        ...data,
        materials_total: (data.material_price ?? items[index].material_price) * (data.quantity ?? items[index].quantity),
        labor_total: (data.labor_price ?? items[index].labor_price) * (data.quantity ?? items[index].quantity),
    }
    updatedItem.total = updatedItem.materials_total + updatedItem.labor_total

    items[index] = updatedItem
    localStorage.setItem(key, JSON.stringify(items))

    return updatedItem
}

const deleteItemFromLS = (estimateId: number, itemId: number): boolean => {
    const key = `estimate_items_${estimateId}`
    let items = getItemsFromLS(estimateId)
    const initialLength = items.length
    items = items.filter(item => item.id !== itemId)
    localStorage.setItem(key, JSON.stringify(items))
    return items.length < initialLength
}

// ================== PUBLIC API ==================

// Получить позиции сметы (синхронный для совместимости)
export const getEstimateItems = (estimateId: number): EstimateItem[] => {
    // Для синхронного вызова используем localStorage
    // В Electron данные будут загружены через useQuery с async функцией
    if (isElectron()) {
        // Возвращаем пустой массив - данные загрузятся асинхронно
        // Это нужно для совместимости со старым кодом
        return getItemsFromLS(estimateId)
    }
    return getItemsFromLS(estimateId)
}

// Получить позиции сметы (асинхронный)
export const getEstimateItemsAsync = async (estimateId: number): Promise<EstimateItem[]> => {
    if (isElectron()) {
        return getItemsFromDB(estimateId)
    }
    return getItemsFromLS(estimateId)
}

// Добавить позицию в смету
export const addEstimateItem = async (
    estimateId: number,
    data: Partial<EstimateItem>
): Promise<EstimateItem> => {
    if (isElectron()) {
        const createdItem = await addItemToDB(estimateId, data)
        if (!createdItem) {
            throw new Error('Не удалось добавить позицию в смету')
        }
        return createdItem
    }
    return addItemToLS(estimateId, data)
}

// Удалить позицию из сметы
export const removeEstimateItem = async (estimateId: number, itemId: number): Promise<boolean> => {
    if (isElectron()) {
        const removed = await deleteItemFromDB(itemId)
        if (!removed) {
            throw new Error('Не удалось удалить позицию из сметы')
        }
        return true
    }
    return deleteItemFromLS(estimateId, itemId)
}

// Обновить позицию сметы
export const updateEstimateItem = async (estimateId: number, itemId: number, data: Partial<EstimateItem>): Promise<EstimateItem | null> => {
    if (isElectron()) {
        const updated = await updateItemInDB(itemId, data)
        if (!updated) {
            throw new Error('Не удалось сохранить изменения в позиции сметы')
        }

        // Возвращаем результат после сохранения в БД
        return {
            id: itemId,
            estimate_id: estimateId,
            name: data.name || '',
            unit: data.unit || 'шт',
            quantity: data.quantity || 1,
            material_price: data.material_price || 0,
            labor_price: data.labor_price || 0,
            materials_total: (data.material_price || 0) * (data.quantity || 1),
            labor_total: (data.labor_price || 0) * (data.quantity || 1),
            total: ((data.material_price || 0) + (data.labor_price || 0)) * (data.quantity || 1),
            justification: data.justification || '',
            work_id: data.work_id
        }
    }
    return updateItemInLS(estimateId, itemId, data)
}

// Очистить все позиции сметы
export const clearEstimateItems = (estimateId: number): void => {
    const key = `estimate_items_${estimateId}`
    localStorage.removeItem(key)
}

// Экспорт для API
export const estimateItemsStore = {
    getItems: getEstimateItems,
    getItemsAsync: getEstimateItemsAsync,
    addItem: addEstimateItem,
    removeItem: removeEstimateItem,
    updateItem: updateEstimateItem,
    clear: clearEstimateItems
}
