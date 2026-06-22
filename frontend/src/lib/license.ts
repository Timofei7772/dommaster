/**
 * ZARU Смета - Система лицензирования с привязкой к железу
 * Hardware ID + License Key verification
 */

interface LicenseInfo {
    key: string
    hwid: string
    type: 'trial' | 'standard' | 'pro' | 'enterprise'
    expiresAt: string
    activatedAt: string
    features: string[]
}

const LICENSE_KEY = 'zaru_license'
const HWID_KEY = 'zaru_hwid'

// Генерация Hardware ID на основе системных данных
export const generateHWID = (): string => {
    try {
        // В браузере используем fingerprint из доступных данных
        const components = [
            navigator.userAgent,
            navigator.language,
            screen.width,
            screen.height,
            screen.colorDepth,
            new Date().getTimezoneOffset(),
            navigator.hardwareConcurrency || 4,
            navigator.platform
        ]

        const fingerprint = components.join('|')

        // Простой хэш для браузера (в Electron используем crypto)
        let hash = 0
        for (let i = 0; i < fingerprint.length; i++) {
            const char = fingerprint.charCodeAt(i)
            hash = ((hash << 5) - hash) + char
            hash = hash & hash
        }

        // Формат HWID: ZARU-XXXX-XXXX-XXXX
        const hexHash = Math.abs(hash).toString(16).toUpperCase().padStart(12, '0')
        return `ZARU-${hexHash.slice(0, 4)}-${hexHash.slice(4, 8)}-${hexHash.slice(8, 12)}`
    } catch {
        return 'ZARU-0000-0000-0000'
    }
}

// Получить сохранённый HWID или сгенерировать новый
export const getHWID = (): string => {
    let hwid = localStorage.getItem(HWID_KEY)
    if (!hwid) {
        hwid = generateHWID()
        localStorage.setItem(HWID_KEY, hwid)
    }
    return hwid
}

// Проверка формата ключа лицензии
export const validateKeyFormat = (key: string): boolean => {
    // Формат: ZARU-XXXX-XXXX-XXXX-XXXX
    const pattern = /^ZARU-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/
    return pattern.test(key.toUpperCase())
}

// Активация лицензии
export const activateLicense = (key: string): { success: boolean; error?: string } => {
    if (!validateKeyFormat(key)) {
        return { success: false, error: 'Неверный формат ключа' }
    }

    const hwid = getHWID()

    // Определяем тип лицензии по первым символам ключа
    let type: LicenseInfo['type'] = 'standard'
    let features: string[] = ['estimates', 'documents']

    const keyPrefix = key.slice(5, 9).toUpperCase()

    if (keyPrefix.startsWith('TR')) {
        type = 'trial'
        features = ['estimates']
    } else if (keyPrefix.startsWith('PR')) {
        type = 'pro'
        features = ['estimates', 'documents', 'ai', 'export', 'backup']
    } else if (keyPrefix.startsWith('EN')) {
        type = 'enterprise'
        features = ['estimates', 'documents', 'ai', 'export', 'backup', 'multiuser', 'api']
    }

    // Рассчитываем срок действия
    const now = new Date()
    const expiresAt = new Date(now)

    if (type === 'trial') {
        expiresAt.setDate(expiresAt.getDate() + 14) // 14 дней триал
    } else {
        expiresAt.setFullYear(expiresAt.getFullYear() + 1) // 1 год
    }

    const license: LicenseInfo = {
        key: key.toUpperCase(),
        hwid,
        type,
        expiresAt: expiresAt.toISOString(),
        activatedAt: now.toISOString(),
        features
    }

    localStorage.setItem(LICENSE_KEY, JSON.stringify(license))

    return { success: true }
}

// Получить информацию о лицензии
export const getLicense = (): LicenseInfo | null => {
    try {
        const stored = localStorage.getItem(LICENSE_KEY)
        if (!stored) return null

        const license: LicenseInfo = JSON.parse(stored)

        // Проверяем привязку к железу
        if (license.hwid !== getHWID()) {
            console.warn('HWID mismatch - лицензия привязана к другому компьютеру')
            return null
        }

        return license
    } catch {
        return null
    }
}

// Проверить активна ли лицензия
export const isLicenseValid = (): boolean => {
    const license = getLicense()
    if (!license) return false

    const expires = new Date(license.expiresAt)
    return expires > new Date()
}

// Проверить доступность функции
export const hasFeature = (feature: string): boolean => {
    const license = getLicense()
    if (!license) return false
    if (!isLicenseValid()) return false

    return license.features.includes(feature)
}

// Деактивация лицензии
export const deactivateLicense = () => {
    localStorage.removeItem(LICENSE_KEY)
}

// Получить дней до окончания
export const getDaysRemaining = (): number => {
    const license = getLicense()
    if (!license) return 0

    const expires = new Date(license.expiresAt)
    const now = new Date()
    const diff = expires.getTime() - now.getTime()

    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

// Тип лицензии на русском
export const getLicenseTypeName = (type: LicenseInfo['type']): string => {
    const names = {
        trial: 'Пробная версия',
        standard: 'Стандартная',
        pro: 'Профессиональная',
        enterprise: 'Корпоративная'
    }
    return names[type] || type
}
