import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isAdminIssueHotkey,
  normalizeAdminIssueResponse,
  validateAdminIssueForm,
} from './adminLicense.ts'

test('validateAdminIssueForm requires a buyer email and admin secret', () => {
  assert.equal(validateAdminIssueForm({ email: '', adminSecret: '' }), 'Введите email покупателя')
  assert.equal(
    validateAdminIssueForm({ email: 'buyer@example.com', adminSecret: '' }),
    'Введите admin secret',
  )
  assert.equal(
    validateAdminIssueForm({ email: 'buyer@example.com', adminSecret: 'super-secret' }),
    null,
  )
})

test('normalizeAdminIssueResponse maps issued license payload', () => {
  const result = normalizeAdminIssueResponse({
    success: true,
    license_key: 'ZARU-ABCD-EFGH-JKLM-NPQR',
    expires_at: '2027-04-09T10:00:00+00:00',
    plan: 'double',
    max_pcs: 2,
  })

  assert.deepEqual(result, {
    success: true,
    licenseKey: 'ZARU-ABCD-EFGH-JKLM-NPQR',
    expiresAt: '2027-04-09T10:00:00+00:00',
    plan: 'double',
    maxPcs: 2,
  })
})

test('normalizeAdminIssueResponse keeps backend error messages readable', () => {
  assert.throws(
    () => normalizeAdminIssueResponse({ detail: 'Invalid admin secret' }),
    /Invalid admin secret/,
  )
  assert.throws(
    () => normalizeAdminIssueResponse({}),
    /Не удалось выдать лицензию/,
  )
})

test('isAdminIssueHotkey matches Ctrl+Shift+L only', () => {
  assert.equal(
    isAdminIssueHotkey({
      ctrlKey: true,
      shiftKey: true,
      key: 'l',
    }),
    true,
  )

  assert.equal(
    isAdminIssueHotkey({
      ctrlKey: true,
      shiftKey: false,
      key: 'l',
    }),
    false,
  )

  assert.equal(
    isAdminIssueHotkey({
      ctrlKey: true,
      shiftKey: true,
      key: 'k',
    }),
    false,
  )
})
