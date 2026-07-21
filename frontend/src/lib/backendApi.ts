export interface BackendApiOptions {
  protocol?: string
  apiUrl?: string
}

export interface RuntimeBackendApiOptions extends BackendApiOptions {
  getElectronBackendUrl?: () => Promise<string>
}

const _defaultApiUrl = (() => {
  try {
    return import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
  } catch {
    return 'http://localhost:8000'
  }
})()

export function resolveBackendApiBaseUrl(options: BackendApiOptions = {}): string {
  const normalizedApiUrl = (options.apiUrl || '').trim().replace(/\/$/, '')
  if (normalizedApiUrl) {
    return normalizedApiUrl
  }

  if (options.protocol === 'file:') {
    return _defaultApiUrl
  }

  return ''
}

export function buildBackendApiUrl(path: string, options: BackendApiOptions = {}): string {
  const baseUrl = resolveBackendApiBaseUrl(options)
  return baseUrl ? `${baseUrl}${path}` : path
}

export async function buildRuntimeBackendApiUrl(
  path: string,
  options: RuntimeBackendApiOptions = {},
): Promise<string> {
  let apiUrl = options.apiUrl

  if (!apiUrl && options.protocol === 'file:' && options.getElectronBackendUrl) {
    apiUrl = await options.getElectronBackendUrl()
  }

  return buildBackendApiUrl(path, { protocol: options.protocol, apiUrl })
}
