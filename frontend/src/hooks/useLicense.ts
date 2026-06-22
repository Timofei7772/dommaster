import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'

import type { LicenseInfo } from '@/lib/electron'


export interface LicenseState {
  isActive: boolean
  plan: string | null
  expiresAt: string | null
  email: string | null
  source: 'electron' | 'backend' | 'demo'
}

export const INACTIVE_LICENSE_STATE: LicenseState = {
  isActive: false,
  plan: null,
  expiresAt: null,
  email: null,
  source: 'demo',
}

export function normalizeElectronLicenseState(info?: Partial<LicenseInfo> | null): LicenseState {
  return {
    isActive: Boolean(info?.isValid),
    plan: info?.typeName || null,
    expiresAt: info?.expiresAt || null,
    email: info?.email || null,
    source: 'electron',
  }
}

export function normalizeBackendLicenseState(data?: {
  success?: boolean
  is_active?: boolean
  plan?: string | null
  expires_at?: string | null
  email?: string | null
  license_key?: string | null
} | null): LicenseState {
  return {
    isActive: Boolean(data?.success && data?.is_active),
    plan: data?.plan || null,
    expiresAt: data?.expires_at || null,
    email: data?.email || null,
    source: 'backend',
  }
}

export function createLicenseGuard({
  getIsActive,
  onBlocked,
}: {
  getIsActive: () => boolean
  onBlocked: () => void
}) {
  return async (action: () => void | Promise<void>) => {
    if (!getIsActive()) {
      onBlocked()
      return false
    }

    await action()
    return true
  }
}

async function loadLicenseState(): Promise<LicenseState> {
  if (window.electronAPI?.license?.check) {
    try {
      const info = await window.electronAPI.license.check()
      return normalizeElectronLicenseState(info)
    } catch (error) {
      console.error('License check error:', error)
    }
  }

  try {
    const response = await fetch('/api/license/status')
    if (!response.ok) {
      return INACTIVE_LICENSE_STATE
    }

    return normalizeBackendLicenseState(await response.json())
  } catch (error) {
    console.error('License status fetch error:', error)
    return INACTIVE_LICENSE_STATE
  }
}

export function useLicense() {
  const [license, setLicense] = useState<LicenseState>(INACTIVE_LICENSE_STATE)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const refresh = async () => {
      setLoading(true)
      const nextState = await loadLicenseState()
      if (!cancelled) {
        setLicense(nextState)
        setLoading(false)
      }
    }

    void refresh()

    return () => {
      cancelled = true
    }
  }, [])

  const refresh = async () => {
    setLoading(true)
    const nextState = await loadLicenseState()
    setLicense(nextState)
    setLoading(false)
    return nextState
  }

  const requireLicense = createLicenseGuard({
    getIsActive: () => license.isActive,
    onBlocked: () => {
      toast.error('Доступно только в PRO версии. Активируйте лицензию, чтобы использовать эту функцию.')
    },
  })

  return {
    ...license,
    loading,
    refresh,
    requireLicense,
  }
}
