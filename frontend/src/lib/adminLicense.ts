export interface AdminIssueFormInput {
  email: string
  adminSecret: string
}

export interface AdminIssuedLicense {
  success: true
  licenseKey: string
  expiresAt: string
  plan: string
  maxPcs: number
}

export function validateAdminIssueForm(input: AdminIssueFormInput): string | null {
  if (!input.email.trim() || !input.email.includes('@')) {
    return 'Введите email покупателя'
  }

  if (!input.adminSecret.trim()) {
    return 'Введите admin secret'
  }

  return null
}

export function isAdminIssueHotkey(event: Pick<KeyboardEvent, 'ctrlKey' | 'shiftKey' | 'key'>): boolean {
  return event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'l'
}

export function normalizeAdminIssueResponse(payload: unknown): AdminIssuedLicense {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('Не удалось выдать лицензию')
  }

  const raw = payload as Record<string, unknown>
  if (typeof raw.detail === 'string' && raw.detail.trim()) {
    throw new Error(raw.detail)
  }

  if (
    raw.success === true &&
    typeof raw.license_key === 'string' &&
    typeof raw.expires_at === 'string' &&
    typeof raw.plan === 'string' &&
    typeof raw.max_pcs === 'number'
  ) {
    return {
      success: true,
      licenseKey: raw.license_key,
      expiresAt: raw.expires_at,
      plan: raw.plan,
      maxPcs: raw.max_pcs,
    }
  }

  throw new Error('Не удалось выдать лицензию')
}
