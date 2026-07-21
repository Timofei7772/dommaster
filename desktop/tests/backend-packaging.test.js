const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const packageJson = require('../package.json')


test('packaged backend keeps its Windows executable filename', () => {
  const backendResource = packageJson.build.extraResources.find((resource) =>
    String(resource.from).replaceAll('\\', '/').endsWith('/dommaster-server.exe')
  )

  assert.ok(backendResource, 'backend executable must be declared in extraResources')
  assert.equal(
    path.win32.normalize(backendResource.to),
    path.win32.join('backend', 'dommaster-server.exe'),
  )
})
