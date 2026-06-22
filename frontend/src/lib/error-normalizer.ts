const ERROR_MESSAGE_MAP: Record<string, string> = {
  PDF_LICENSE_REQUIRED: 'Экспорт PDF доступен только в полной версии',
  NO_DATA: 'Нет данных для формирования документа',
}

export function normalizeErrorMessage(message: string) {
  let normalized = message.trim()

  normalized = normalized.replace(
    /^Error invoking remote method ['"][^'"]+['"]:\s*/i,
    ''
  )

  while (/^Error:\s*/i.test(normalized)) {
    normalized = normalized.replace(/^Error:\s*/i, '')
  }

  const codeMatch = normalized.match(/^[A-Z0-9_]+$/)
  if (codeMatch) {
    return ERROR_MESSAGE_MAP[codeMatch[0]] || normalized
  }

  return normalized.trim()
}

export function normalizeError(
  error: unknown,
  fallbackMessage = 'Неизвестная ошибка'
) {
  if (error instanceof Error && error.message) {
    return normalizeErrorMessage(error.message) || fallbackMessage
  }

  if (typeof error === 'string' && error.trim()) {
    return normalizeErrorMessage(error) || fallbackMessage
  }

  return fallbackMessage
}
