const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const repoRoot = path.resolve(__dirname, '..', '..');

function loadPreloadApi() {
  const captured = {};
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        ipcRenderer: {
          invoke: async (channel, ...args) => ({ channel, args }),
          on: () => undefined,
        },
        contextBridge: {
          exposeInMainWorld(name, value) {
            captured[name] = value;
          },
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const preloadPath = path.join(repoRoot, 'desktop', 'preload.js');
    delete require.cache[preloadPath];
    require(preloadPath);
  } finally {
    Module._load = originalLoad;
  }

  return captured.electronAPI;
}

test('preload exposes the stable document contract plus hidden agreement generation', () => {
  const electronAPI = loadPreloadApi();
  assert.ok(electronAPI, 'electronAPI should be exposed from preload');

  const docs = electronAPI.docs;
  const requiredDocMethods = [
    'generateEstimate',
    'generateKS2',
    'generateKS3',
    'generateContract',
    'generateM29',
    'generateFOT',
    'generateMaterialRequest',
    'generateCommercialOffer',
    'generatePackage',
    'generateAgreement',
  ];

  for (const methodName of requiredDocMethods) {
    assert.equal(typeof docs?.[methodName], 'function', `docs.${methodName} should be exposed`);
  }
});

test('preload keeps all FOT capabilities in a single namespace', () => {
  const electronAPI = loadPreloadApi();
  const fot = electronAPI.fot;

  assert.equal(typeof fot?.create, 'function', 'fot.create should stay available');
  assert.equal(typeof fot?.getAll, 'function', 'fot.getAll should stay available');
  assert.equal(typeof fot?.getWorkers, 'function', 'fot.getWorkers should stay available');
  assert.equal(typeof fot?.saveWorkers, 'function', 'fot.saveWorkers should stay available');
});

test('frontend bridge typings and API adapter expose hidden agreement generation', () => {
  const electronTypes = fs.readFileSync(
    path.join(repoRoot, 'frontend', 'src', 'lib', 'electron.ts'),
    'utf8'
  );
  const apiAdapter = fs.readFileSync(
    path.join(repoRoot, 'frontend', 'src', 'lib', 'api.ts'),
    'utf8'
  );

  assert.match(electronTypes, /generateAgreement/, 'electron.ts should type generateAgreement');
  assert.match(apiAdapter, /generateAgreement/, 'api.ts should adapt generateAgreement');
});
