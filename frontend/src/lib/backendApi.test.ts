import assert from 'node:assert/strict'
import test from 'node:test'

import { buildBackendApiUrl } from './backendApi.ts'

test('buildBackendApiUrl uses localhost backend in desktop file protocol', () => {
  assert.equal(
    buildBackendApiUrl('/api/payment/create', {
      protocol: 'file:',
      apiUrl: '',
    }),
    'http://localhost:8000/api/payment/create',
  )
})

test('buildBackendApiUrl prefers explicit api url when provided', () => {
  assert.equal(
    buildBackendApiUrl('/api/license/admin/issue', {
      protocol: 'file:',
      apiUrl: 'https://api.smeta.local/',
    }),
    'https://api.smeta.local/api/license/admin/issue',
  )
})

test('buildBackendApiUrl keeps relative path for normal web mode', () => {
  assert.equal(
    buildBackendApiUrl('/api/payment/create', {
      protocol: 'http:',
      apiUrl: '',
    }),
    '/api/payment/create',
  )
})
