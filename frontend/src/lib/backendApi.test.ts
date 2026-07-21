import assert from 'node:assert/strict'
import test from 'node:test'

import { buildBackendApiUrl, buildRuntimeBackendApiUrl } from './backendApi.ts'

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

test('buildRuntimeBackendApiUrl asks Electron for the actual backend port', async () => {
  let bridgeCalls = 0

  const url = await buildRuntimeBackendApiUrl('/api/auth/auto-login', {
    protocol: 'file:',
    getElectronBackendUrl: async () => {
      bridgeCalls += 1
      return 'http://127.0.0.1:8123/'
    },
  })

  assert.equal(bridgeCalls, 1)
  assert.equal(url, 'http://127.0.0.1:8123/api/auth/auto-login')
})
