import type { LicenseInfo } from '@/lib/electron'

export type LicensePlanId = 'standard' | 'double' | 'enterprise'

export interface LicenseStatusPresentation {
  title: string
  tone: 'info' | 'success'
  lines: string[]
}

export function getLicenseStatusPresentation(info: Partial<LicenseInfo>): LicenseStatusPresentation {
  if (!info.isValid) {
    return {
      title: 'Вы используете бесплатную версию',
      tone: 'info',
      lines: [
        'Доступно 5 смет бесплатно.',
        'Для полной версии выберите тариф ниже.',
      ],
    }
  }

  const lines = []
  if (info.email) {
    lines.push(`Email: ${info.email}`)
  }
  if (info.expiresAt) {
    lines.push(`Действует до: ${info.expiresAt}`)
  }
  if (typeof info.daysLeft === 'number') {
    lines.push(`Осталось дней: ${info.daysLeft}`)
  }
  if (info.warning) {
    lines.push(info.warning)
  }

  return {
    title: info.typeName || 'Лицензия активна',
    tone: 'success',
    lines,
  }
}

export function getPlanBadge(planId: LicensePlanId): { label: string; tone: 'indigo' | 'emerald' | 'amber' } {
  switch (planId) {
    case 'double':
      return { label: 'Для дома и офиса', tone: 'emerald' }
    case 'enterprise':
      return { label: 'Для команды', tone: 'amber' }
    case 'standard':
    default:
      return { label: 'Самый популярный', tone: 'indigo' }
  }
}
