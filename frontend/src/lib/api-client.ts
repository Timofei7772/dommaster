import { buildRuntimeBackendApiUrl } from './backendApi'

type ElectronBackendBridge = {
  getBackendUrl?: () => Promise<string>
}

export async function getApiUrl(path: string): Promise<string> {
  const electronApi = window.electronAPI as (typeof window.electronAPI & ElectronBackendBridge) | undefined

  return buildRuntimeBackendApiUrl(`/api${path}`, {
    protocol: window.location.protocol,
    getElectronBackendUrl: electronApi?.getBackendUrl,
  })
}

function getHeaders(isMultipart = false): HeadersInit {
  const token = localStorage.getItem('access_token')
  const headers: Record<string, string> = {}
  if (!isMultipart) headers['Content-Type'] = 'application/json'
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

type ReqInfo = { method?: string; body?: unknown }

async function handleResponse<T>(res: Response, path: string, req?: ReqInfo): Promise<T> {
  if (res.status === 401) {
    try {
      const ok = await tryAutoLogin()
      if (ok) {
        const retry = await fetch(await getApiUrl(path), {
          method: req?.method || 'GET',
          headers: getHeaders(),
          body: req?.body ? JSON.stringify(req.body) : undefined,
        })
        if (retry.ok) return retry.json()
      }
    } catch {}
    throw new Error('Unauthorized')
  }
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    const detail = errorData.detail
    const message = typeof detail === 'string'
      ? detail
      : detail?.message || `Ошибка ${res.status}`
    throw new Error(message)
  }
  return res.json()
}

async function tryAutoLogin(): Promise<boolean> {
  try {
    const res = await fetch(await getApiUrl('/auth/auto-login'), { method: 'POST' })
    if (!res.ok) return false
    const data = await res.json()
    localStorage.setItem('access_token', data.access_token)
    localStorage.setItem('refresh_token', data.refresh_token)
    localStorage.setItem('user_profile', JSON.stringify(data.user))
    return true
  } catch {
    return false
  }
}

export async function autoLogin() {
  const ok = await tryAutoLogin()
  if (!ok) console.warn('Бэкенд недоступен — работа в ограниченном режиме')
  return ok
}

function logout() {
  localStorage.clear()
  window.location.reload()
}

async function ensureAuth(): Promise<void> {
  if (!localStorage.getItem('access_token')) {
    const ok = await tryAutoLogin()
    if (!ok) console.warn('auto-login не сработал')
  }
}

export async function apiGet<T = any>(path: string, params?: Record<string, any>): Promise<T> {
  await ensureAuth()
  let url = await getApiUrl(path)
  if (params) {
    const qs = Object.entries(params)
      .filter(([_, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')
    if (qs) url += `?${qs}`
  }
  const res = await fetch(url, { headers: getHeaders() })
  return handleResponse<T>(res, path)
}

export async function apiPost<T = any>(path: string, body: unknown): Promise<T> {
  await ensureAuth()
  const req = { method: 'POST', body }
  const res = await fetch(await getApiUrl(path), {
    method: 'POST', headers: getHeaders(), body: JSON.stringify(body),
  })
  return handleResponse<T>(res, path, req)
}

export async function apiPatch<T = any>(path: string, body: unknown): Promise<T> {
  await ensureAuth()
  const req = { method: 'PATCH', body }
  const res = await fetch(await getApiUrl(path), {
    method: 'PATCH', headers: getHeaders(), body: JSON.stringify(body),
  })
  return handleResponse<T>(res, path, req)
}

export async function apiPut<T = any>(path: string, body: unknown): Promise<T> {
  await ensureAuth()
  const req = { method: 'PUT', body }
  const res = await fetch(await getApiUrl(path), {
    method: 'PUT', headers: getHeaders(), body: JSON.stringify(body),
  })
  return handleResponse<T>(res, path, req)
}

export async function apiDelete(path: string): Promise<void> {
  await ensureAuth()
  const res = await fetch(await getApiUrl(path), { method: 'DELETE', headers: getHeaders() })
  if (res.status === 401) {
    try { await tryAutoLogin(); window.location.reload() } catch {}
    throw new Error('Unauthorized')
  }
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    const detail = errorData.detail
    const message = typeof detail === 'string'
      ? detail
      : detail?.message || `Ошибка ${res.status}`
    throw new Error(message)
  }
}

export async function apiUpload<T = any>(path: string, formData: FormData): Promise<T> {
  await ensureAuth()
  const res = await fetch(await getApiUrl(path), {
    method: 'POST', headers: getHeaders(true), body: formData,
  })
  return handleResponse<T>(res, path)
}
