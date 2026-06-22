import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeError } from './error-normalizer.ts'

test('normalizeError removes raw Electron invoke prefixes and nested Error wrappers', () => {
  assert.equal(
    normalizeError(
      new Error("Error invoking remote method 'docs:generateEstimatePDF': Error: Экспорт PDF доступен только в полной версии"),
      'Неизвестная ошибка'
    ),
    'Экспорт PDF доступен только в полной версии'
  )
})

test('normalizeError maps known error codes to user-facing messages', () => {
  assert.equal(
    normalizeError('PDF_LICENSE_REQUIRED', 'Неизвестная ошибка'),
    'Экспорт PDF доступен только в полной версии'
  )

  assert.equal(
    normalizeError(
      "Error invoking remote method 'docs:generateEstimatePDF': Error: PDF_LICENSE_REQUIRED",
      'Неизвестная ошибка'
    ),
    'Экспорт PDF доступен только в полной версии'
  )
})

test('normalizeError falls back when there is no usable message', () => {
  assert.equal(normalizeError(null, 'Неизвестная ошибка'), 'Неизвестная ошибка')
})
