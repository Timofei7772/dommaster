const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  CATALOG_BOOTSTRAP_VERSION,
  parseCatalogJsonFile,
  planCatalogBootstrap,
} = require('../src/catalog-bootstrap');

test('parseCatalogJsonFile strips UTF-8 BOM from bundled catalog files', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smetaai-catalog-json-'));
  const filePath = path.join(tempDir, 'catalog.json');
  fs.writeFileSync(filePath, '\uFEFF{"works":[{"name":"Штукатурка"}]}', 'utf8');

  const parsed = parseCatalogJsonFile(filePath);

  assert.equal(Array.isArray(parsed.works), true);
  assert.equal(parsed.works[0].name, 'Штукатурка');
});

test('planCatalogBootstrap repairs an empty catalog from full sources when available', () => {
  const plan = planCatalogBootstrap({
    state: {
      worksCount: 0,
      materialsCount: 0,
      sectionsCount: 0,
      linksCount: 0,
      invalidRowsCount: 0,
      storedVersion: 0,
    },
    paths: {
      fullCatalogPath: 'C:/db/catalog.json',
      quickCatalogPath: 'C:/starter/catalog_simple.json',
    },
    requiredVersion: CATALOG_BOOTSTRAP_VERSION,
  });

  assert.equal(plan.action, 'import');
  assert.equal(plan.mode, 'full');
  assert.match(plan.reason, /missing/i);
});

test('planCatalogBootstrap repairs a partially broken catalog when materials are missing', () => {
  const plan = planCatalogBootstrap({
    state: {
      worksCount: 120,
      materialsCount: 0,
      sectionsCount: 10,
      linksCount: 0,
      invalidRowsCount: 0,
      storedVersion: CATALOG_BOOTSTRAP_VERSION,
    },
    paths: {
      fullCatalogPath: 'C:/db/catalog_rsk.json',
      quickCatalogPath: 'C:/starter/catalog_simple.json',
    },
    requiredVersion: CATALOG_BOOTSTRAP_VERSION,
  });

  assert.equal(plan.action, 'import');
  assert.equal(plan.mode, 'full');
  assert.match(plan.reason, /materials/i);
});

test('planCatalogBootstrap leaves an existing healthy catalog untouched', () => {
  const plan = planCatalogBootstrap({
    state: {
      worksCount: 500,
      materialsCount: 200,
      sectionsCount: 10,
      linksCount: 0,
      invalidRowsCount: 0,
      storedVersion: CATALOG_BOOTSTRAP_VERSION,
    },
    paths: {
      fullCatalogPath: 'C:/db/catalog_rsk.json',
      quickCatalogPath: 'C:/starter/catalog_simple.json',
    },
    requiredVersion: CATALOG_BOOTSTRAP_VERSION,
  });

  assert.equal(plan.action, 'skip');
  assert.equal(plan.mode, 'full');
});

test('planCatalogBootstrap falls back to quick sources when full sources are unavailable', () => {
  const plan = planCatalogBootstrap({
    state: {
      worksCount: 0,
      materialsCount: 0,
      sectionsCount: 0,
      linksCount: 0,
      invalidRowsCount: 0,
      storedVersion: 0,
    },
    paths: {
      fullCatalogPath: null,
      quickCatalogPath: 'C:/starter/catalog_simple.json',
    },
    requiredVersion: CATALOG_BOOTSTRAP_VERSION,
  });

  assert.equal(plan.action, 'import');
  assert.equal(plan.mode, 'quick');
  assert.match(plan.reason, /fallback/i);
});
