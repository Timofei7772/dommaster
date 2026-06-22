const test = require('node:test')
const assert = require('node:assert/strict')

const { buildContentSecurityPolicy } = require('./csp-policy')

test('prod CSP allows local desktop backend over http and ws', () => {
  const policy = buildContentSecurityPolicy(false)

  assert.match(policy, /connect-src/)
  assert.match(policy, /http:\/\/localhost:\*/)
  assert.match(policy, /http:\/\/127\.0\.0\.1:\*/)
  assert.match(policy, /ws:\/\/localhost:\*/)
  assert.match(policy, /ws:\/\/127\.0\.0\.1:\*/)
  assert.match(policy, /https:/)
})

test('dev CSP keeps unsafe-eval for vite workflow', () => {
  const policy = buildContentSecurityPolicy(true)

  assert.match(policy, /script-src 'self' 'unsafe-inline' 'unsafe-eval'/)
})
