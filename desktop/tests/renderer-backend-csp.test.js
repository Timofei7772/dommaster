const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const rendererHtml = fs.readFileSync(
  path.join(__dirname, '..', '..', 'frontend', 'index.html'),
  'utf8',
)

test('renderer CSP permits the local packaged backend', () => {
  assert.match(rendererHtml, /connect-src[^;]*http:\/\/localhost:\*/)
  assert.match(rendererHtml, /connect-src[^;]*http:\/\/127\.0\.0\.1:\*/)
})
