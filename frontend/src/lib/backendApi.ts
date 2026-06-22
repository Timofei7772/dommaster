export interface BackendApiOptions {
  protocol?: string
  apiUrl?: string
}

export function resolveBackendApiBaseUrl(options: BackendApiOptions = {}): string {
  const normalizedApiUrl = (options.apiUrl || '').trim().replace(/\/$/, '')
  if (normalizedApiUrl) {
    return normalizedApiUrl
  }

  if (options.protocol === 'file:') {
    return 'http://localhost:8000'
  }

  return ''
}

export function buildBackendApiUrl(path: string, options: BackendApiOptions = {}): string {
  const baseUrl = resolveBackendApiBaseUrl(options)
  return baseUrl ? `${baseUrl}${path}` : path
}
