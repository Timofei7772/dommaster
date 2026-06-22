/**
 * ZARU Смета - Система автоматического резервного копирования
 * Локальное и облачное резервирование данных
 */

interface BackupData {
    version: string
    timestamp: string
    estimates: unknown[]
    clients: unknown[]
    settings: unknown
    requests: unknown[]
}

const BACKUP_KEY = 'zaru_backup_settings'
const BACKUP_HISTORY_KEY = 'zaru_backup_history'

interface BackupSettings {
    enabled: boolean
    frequency: 'daily' | 'weekly' | 'manual'
    lastBackup: string | null
    cloudEnabled: boolean
    cloudProvider: 'google' | 'yandex' | 'local'
}

const defaultSettings: BackupSettings = {
    enabled: true,
    frequency: 'daily',
    lastBackup: null,
    cloudEnabled: false,
    cloudProvider: 'local'
}

// Получить настройки бэкапа
export const getBackupSettings = (): BackupSettings => {
    try {
        const stored = localStorage.getItem(BACKUP_KEY)
        return stored ? { ...defaultSettings, ...JSON.parse(stored) } : defaultSettings
    } catch {
        return defaultSettings
    }
}

// Сохранить настройки
export const saveBackupSettings = (settings: Partial<BackupSettings>) => {
    const current = getBackupSettings()
    const updated = { ...current, ...settings }
    localStorage.setItem(BACKUP_KEY, JSON.stringify(updated))
    return updated
}

// Собрать данные для бэкапа
export const collectBackupData = (): BackupData => {
    const data: BackupData = {
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        estimates: [],
        clients: [],
        settings: {},
        requests: []
    }

    try {
        // Собираем все данные из localStorage
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (!key) continue

            if (key.includes('estimates') || key.includes('smeta')) {
                data.estimates = JSON.parse(localStorage.getItem(key) || '[]')
            }
            if (key.includes('clients')) {
                data.clients = JSON.parse(localStorage.getItem(key) || '[]')
            }
            if (key.includes('settings')) {
                data.settings = JSON.parse(localStorage.getItem(key) || '{}')
            }
            if (key.includes('requests')) {
                data.requests = JSON.parse(localStorage.getItem(key) || '[]')
            }
        }
    } catch (e) {
        console.error('Ошибка сбора данных:', e)
    }

    return data
}

// Создать локальный бэкап (скачать файл)
export const createLocalBackup = (): boolean => {
    try {
        const data = collectBackupData()
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `ZARU_Backup_${new Date().toISOString().slice(0, 10)}.json`
        a.click()
        URL.revokeObjectURL(url)

        // Обновить время последнего бэкапа
        saveBackupSettings({ lastBackup: new Date().toISOString() })

        // Добавить в историю
        addBackupToHistory('local', true)

        return true
    } catch (e) {
        console.error('Ошибка создания бэкапа:', e)
        return false
    }
}

// Восстановить из бэкапа
export const restoreFromBackup = async (file: File): Promise<boolean> => {
    try {
        const text = await file.text()
        const data: BackupData = JSON.parse(text)

        if (!data.version || !data.timestamp) {
            throw new Error('Неверный формат файла')
        }

        // Восстанавливаем данные
        if (data.estimates.length > 0) {
            localStorage.setItem('zaru_estimates_v1', JSON.stringify(data.estimates))
        }
        if (data.clients.length > 0) {
            localStorage.setItem('zaru_clients_v1', JSON.stringify(data.clients))
        }
        if (data.settings && Object.keys(data.settings).length > 0) {
            localStorage.setItem('zaru_settings', JSON.stringify(data.settings))
        }
        if (data.requests.length > 0) {
            localStorage.setItem('zaru_material_requests_v1', JSON.stringify(data.requests))
        }

        return true
    } catch (e) {
        console.error('Ошибка восстановления:', e)
        return false
    }
}

// Добавить запись в историю бэкапов
const addBackupToHistory = (type: 'local' | 'cloud', success: boolean) => {
    try {
        const history = JSON.parse(localStorage.getItem(BACKUP_HISTORY_KEY) || '[]')
        history.unshift({
            date: new Date().toISOString(),
            type,
            success
        })
        // Храним только последние 10 записей
        localStorage.setItem(BACKUP_HISTORY_KEY, JSON.stringify(history.slice(0, 10)))
    } catch {
        // ignore
    }
}

// Получить историю бэкапов
export const getBackupHistory = () => {
    try {
        return JSON.parse(localStorage.getItem(BACKUP_HISTORY_KEY) || '[]')
    } catch {
        return []
    }
}

// Проверить нужен ли автобэкап
export const checkAutoBackup = () => {
    const settings = getBackupSettings()
    if (!settings.enabled) return false
    if (!settings.lastBackup) return true

    const lastBackup = new Date(settings.lastBackup)
    const now = new Date()
    const diffDays = (now.getTime() - lastBackup.getTime()) / (1000 * 60 * 60 * 24)

    switch (settings.frequency) {
        case 'daily': return diffDays >= 1
        case 'weekly': return diffDays >= 7
        default: return false
    }
}

// Автобэкап при старте приложения
export const initAutoBackup = () => {
    if (checkAutoBackup()) {
        // Сохраняем в localStorage как автобэкап
        const data = collectBackupData()
        localStorage.setItem('zaru_auto_backup', JSON.stringify(data))
        saveBackupSettings({ lastBackup: new Date().toISOString() })
        console.log('Автобэкап создан:', new Date().toISOString())
    }
}
