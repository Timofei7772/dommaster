const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const desktopRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(desktopRoot, relativePath), 'utf8');
}

test('package exposes deterministic market release commands', () => {
  const packageJson = JSON.parse(read('package.json'));

  assert.equal(
    packageJson.scripts['build:market'],
    'powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-market-release.ps1',
  );
  assert.equal(
    packageJson.scripts['verify:market'],
    'powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-market-release.ps1',
  );
});

test('market build fails closed unless electron-builder signing credentials exist', () => {
  const script = read('scripts/build-market-release.ps1');

  assert.match(script, /CSC_LINK/);
  assert.match(script, /CSC_KEY_PASSWORD/);
  assert.match(script, /throw .*Authenticode/i);
  assert.match(script, /ELECTRON_RUN_AS_NODE/);
  assert.match(script, /PyInstaller/);
  assert.match(script, /verify-market-release\.ps1/);
});

test('market verification requires a valid signature and immutable payload hashes', () => {
  const script = read('scripts/verify-market-release.ps1');

  assert.match(script, /Get-AuthenticodeSignature/);
  assert.match(script, /Status -ne ['"]Valid['"]/);
  assert.match(script, /dommaster-server\.exe/);
  assert.match(script, /Get-FileHash/);
  assert.match(script, /SHA256SUMS/);
  assert.match(script, /release-manifest\.json/);
});
