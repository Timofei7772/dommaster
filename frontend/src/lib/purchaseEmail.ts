export type PurchasePlanId = 'standard' | 'double' | 'enterprise'

export const EMAIL_VALIDATION_MESSAGE = 'Введите корректный email — туда придёт лицензия.'

export type PurchaseFlowResult =
  | {
      kind: 'prompt'
      plan: PurchasePlanId
    }
  | {
      kind: 'proceed'
      plan: PurchasePlanId
      email: string
    }

export type PurchaseRecipientState =
  | {
      kind: 'missing'
    }
  | {
      kind: 'ready'
      email: string
    }

export function normalizeEmail(email: string): string {
  return email.trim()
}

export function isValidEmail(email: string): boolean {
  const normalizedEmail = normalizeEmail(email)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
}

export function getEmailValidationError(email: string): string | null {
  return isValidEmail(email) ? null : EMAIL_VALIDATION_MESSAGE
}

export function pickPreferredEmail(input: {
  licenseEmail?: string | null
  savedEmail?: string | null
}): string {
  const normalizedLicenseEmail = normalizeEmail(input.licenseEmail || '')
  if (isValidEmail(normalizedLicenseEmail)) {
    return normalizedLicenseEmail
  }

  const normalizedSavedEmail = normalizeEmail(input.savedEmail || '')
  if (isValidEmail(normalizedSavedEmail)) {
    return normalizedSavedEmail
  }

  return ''
}

export function getPurchaseRecipientState(email: string): PurchaseRecipientState {
  const normalizedEmail = normalizeEmail(email)
  if (!isValidEmail(normalizedEmail)) {
    return { kind: 'missing' }
  }

  return {
    kind: 'ready',
    email: normalizedEmail,
  }
}

export function resolvePurchaseFlow(email: string, plan: PurchasePlanId): PurchaseFlowResult {
  const normalizedEmail = normalizeEmail(email)

  if (!isValidEmail(normalizedEmail)) {
    return {
      kind: 'prompt',
      plan,
    }
  }

  return {
    kind: 'proceed',
    plan,
    email: normalizedEmail,
  }
}
