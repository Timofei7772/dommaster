import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getLicenseStatusPresentation,
  getPlanBadge,
} from './licensePageContent.ts'

test('free license status uses positive copy', () => {
  const result = getLicenseStatusPresentation({
    isValid: false,
    typeName: 'Демо-режим',
  })

  assert.equal(result.title, 'Вы используете бесплатную версию')
  assert.equal(result.tone, 'info')
  assert.match(result.lines.join(' '), /5 смет/i)
})

test('valid license status keeps active state', () => {
  const result = getLicenseStatusPresentation({
    isValid: true,
    typeName: 'Enterprise',
    email: 'pro@example.com',
    expiresAt: '2026-12-31',
    daysLeft: 120,
  })

  assert.equal(result.title, 'Enterprise')
  assert.equal(result.tone, 'success')
  assert.match(result.lines.join(' '), /Действует до/i)
})

test('plan badges map to sales hints', () => {
  assert.deepEqual(getPlanBadge('standard'), { label: 'Самый популярный', tone: 'indigo' })
  assert.deepEqual(getPlanBadge('double'), { label: 'Для дома и офиса', tone: 'emerald' })
  assert.deepEqual(getPlanBadge('enterprise'), { label: 'Для команды', tone: 'amber' })
})
