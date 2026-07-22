const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')

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

test('PyInstaller includes the persistent document-chain modules', () => {
  const specPath = path.join(__dirname, '..', '..', 'backend', 'dommaster-server.spec')
  const spec = fs.readFileSync(specPath, 'utf8')

  for (const moduleName of [
    'app.models.document_workflow',
    'app.repositories.document_workflow_repository',
    'app.services.snapshot_service',
    'app.services.document_chain_service',
    'app.routers.document_chain',
  ]) {
    assert.match(spec, new RegExp(`['"]${moduleName.replaceAll('.', '\\.') }['"]`))
  }
})
