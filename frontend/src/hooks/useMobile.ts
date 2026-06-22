/**
 * ZARU Смета - Хук для определения мобильной платформы
 */

import { useState, useEffect } from 'react'

type MobilePlatform = 'web' | 'android' | 'ios'

interface CapacitorBridge {
    isNativePlatform?: () => boolean
    getPlatform?: () => string
}

const getCapacitorBridge = (): CapacitorBridge | undefined => {
    return (window as Window & { Capacitor?: CapacitorBridge }).Capacitor
}

const resolvePlatform = (): MobilePlatform => {
    const capacitor = getCapacitorBridge()
    if (!capacitor?.isNativePlatform?.()) {
        return 'web'
    }

    const platform = capacitor.getPlatform?.()
    if (platform === 'android' || platform === 'ios') {
        return platform
    }

    return 'web'
}

export const useMobile = () => {
    const [isMobile, setIsMobile] = useState(false)
    const [platform, setPlatform] = useState<MobilePlatform>('web')

    useEffect(() => {
        // Проверяем размер экрана
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768)
        }

        // Проверяем платформу Capacitor
        const checkPlatform = () => {
            setPlatform(resolvePlatform())
        }

        checkMobile()
        checkPlatform()

        window.addEventListener('resize', checkMobile)
        return () => window.removeEventListener('resize', checkMobile)
    }, [])

    return { isMobile, platform, isNative: platform !== 'web' }
}

/**
 * Проверить запущено ли приложение в Capacitor (нативно)
 */
export const isNativeApp = (): boolean => {
    return getCapacitorBridge()?.isNativePlatform?.() ?? false
}

/**
 * Получить платформу
 */
export const getPlatform = (): 'web' | 'android' | 'ios' => {
    return resolvePlatform()
}
