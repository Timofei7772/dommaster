import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createLicenseGuard,
  normalizeBackendLicenseState,
  normalizeElectronLicenseState,
} from './useLicense.ts'


test('normalizeElectronLicenseState maps valid desktop license to active state', () => {
  const state = normalizeElectronLicenseState({
    isValid: true,
    typeName: 'Standard',
    expiresAt: '2027-01-01',
    email: 'pro@example.com',
  })

  assert.equal(state.isActive, true)
  assert.equal(state.plan, 'Standard')
  assert.equal(state.expiresAt, '2027-01-01')
  assert.equal(state.email, 'pro@example.com')
  assert.equal(state.source, 'electron')
})

test('normalizeBackendLicenseState maps inactive backend status to demo state', () => {
  const state = normalizeBackendLicenseState({
    success: true,
    is_active: false,
    plan: null,
    expires_at: null,
    license_key: null,
  })

  assert.equal(state.isActive, false)
  assert.equal(state.plan, null)
  assert.equal(state.expiresAt, null)
  assert.equal(state.source, 'backend')
})

test('createLicenseGuard blocks action when license is inactive', async () => {
  const calls: string[] = []
  const guard = createLicenseGuard({
    getIsActive: () => false,
    onBlocked: () => calls.push('blocked'),
  })

  const result = await guard(async () => {
    calls.push('action')
  })

  assert.equal(result, false)
  assert.deepEqual(calls, ['blocked'])
})

test('createLicenseGuard runs action when license is active', async () => {
  const calls: string[] = []
  const guard = createLicenseGuard({
    getIsActive: () => true,
    onBlocked: () => calls.push('blocked'),
  })

  const result = await guard(async () => {
    calls.push('action')
  })

  assert.equal(result, true)
  assert.deepEqual(calls, ['action'])
})
