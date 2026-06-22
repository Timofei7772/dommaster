import assert from 'node:assert/strict'
import test from 'node:test'

import {
  EMAIL_VALIDATION_MESSAGE,
  getEmailValidationError,
  getPurchaseRecipientState,
  pickPreferredEmail,
  resolvePurchaseFlow,
} from './purchaseEmail.ts'

test('resolvePurchaseFlow requests prompt when email is empty', () => {
  assert.deepEqual(resolvePurchaseFlow('', 'standard'), {
    kind: 'prompt',
    plan: 'standard',
  })
})

test('resolvePurchaseFlow requests prompt when email is invalid', () => {
  assert.deepEqual(resolvePurchaseFlow('timofei7772', 'double'), {
    kind: 'prompt',
    plan: 'double',
  })
})

test('resolvePurchaseFlow normalizes valid email before payment', () => {
  assert.deepEqual(resolvePurchaseFlow('  timofei7772@ya.ru  ', 'enterprise'), {
    kind: 'proceed',
    plan: 'enterprise',
    email: 'timofei7772@ya.ru',
  })
})

test('pickPreferredEmail prefers license email over saved email', () => {
  assert.equal(
    pickPreferredEmail({
      licenseEmail: 'license@example.com',
      savedEmail: 'saved@example.com',
    }),
    'license@example.com',
  )
})

test('pickPreferredEmail falls back to saved email when license email missing', () => {
  assert.equal(
    pickPreferredEmail({
      licenseEmail: '   ',
      savedEmail: 'saved@example.com',
    }),
    'saved@example.com',
  )
})

test('getEmailValidationError returns user-friendly message for invalid email', () => {
  assert.equal(getEmailValidationError('timofei7772'), EMAIL_VALIDATION_MESSAGE)
})

test('getEmailValidationError accepts normalized valid email', () => {
  assert.equal(getEmailValidationError('  timofei7772@ya.ru '), null)
})

test('getPurchaseRecipientState returns ready state for valid email', () => {
  assert.deepEqual(getPurchaseRecipientState(' buyer@example.com '), {
    kind: 'ready',
    email: 'buyer@example.com',
  })
})

test('getPurchaseRecipientState returns missing state for invalid email', () => {
  assert.deepEqual(getPurchaseRecipientState('buyer-example.com'), {
    kind: 'missing',
  })
})
