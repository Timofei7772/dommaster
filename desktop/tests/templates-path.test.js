const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  ensureWritableTemplatesPath,
  resolveTemplatesPath,
} = require('../src/templates');

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('resolveTemplatesPath keeps dev mode on the local desktop db folder', () => {
  const moduleDir = 'C:/Projects/SmetaAI/desktop/src';
  const resolved = resolveTemplatesPath({
    appImpl: {
      isPackaged: false,
      getPath: () => 'C:/Ignored',
    },
    moduleDir,
    resourcesPath: 'C:/IgnoredResources',
  });

  assert.equal(resolved, path.join(moduleDir, '..', 'db'));
});

test('resolveTemplatesPath bootstraps packaged templates into userData/templates', () => {
  const resourcesRoot = makeTempDir('smeta-templates-resources-');
  const userDataRoot = makeTempDir('smeta-templates-userdata-');

  const sourceRoot = path.join(resourcesRoot, 'db');
  const sourceAgreementDir = path.join(sourceRoot, 'DopSoglTemplates', 'additional');
  const sourceDocDir = path.join(sourceRoot, 'DocTemplates');
  fs.mkdirSync(sourceAgreementDir, { recursive: true });
  fs.mkdirSync(sourceDocDir, { recursive: true });
  fs.writeFileSync(path.join(sourceAgreementDir, 'agreement.dotx'), 'agreement-template');
  fs.writeFileSync(path.join(sourceDocDir, 'request.xltx'), 'doc-template');

  const resolved = resolveTemplatesPath({
    appImpl: {
      isPackaged: true,
      getPath: (key) => {
        assert.equal(key, 'userData');
        return userDataRoot;
      },
    },
    resourcesPath: resourcesRoot,
  });

  const expectedUserTemplatesRoot = path.join(userDataRoot, 'templates');
  assert.equal(resolved, expectedUserTemplatesRoot);
  assert.equal(
    fs.readFileSync(path.join(expectedUserTemplatesRoot, 'DopSoglTemplates', 'additional', 'agreement.dotx'), 'utf8'),
    'agreement-template'
  );
  assert.equal(
    fs.readFileSync(path.join(expectedUserTemplatesRoot, 'DocTemplates', 'request.xltx'), 'utf8'),
    'doc-template'
  );
});

test('ensureWritableTemplatesPath copies bundled templates into writable user templates', () => {
  const sourceRoot = makeTempDir('smeta-templates-src-');
  const userTemplatesRoot = makeTempDir('smeta-templates-user-');

  const sourceAgreementDir = path.join(sourceRoot, 'DopSoglTemplates', 'additional');
  const sourceDocDir = path.join(sourceRoot, 'DocTemplates');
  fs.mkdirSync(sourceAgreementDir, { recursive: true });
  fs.mkdirSync(sourceDocDir, { recursive: true });
  fs.writeFileSync(path.join(sourceAgreementDir, 'agreement.dotx'), 'agreement-template');
  fs.writeFileSync(path.join(sourceDocDir, 'request.xltx'), 'doc-template');

  const resolved = ensureWritableTemplatesPath({
    sourceRoot,
    userTemplatesRoot,
  });

  assert.equal(resolved, userTemplatesRoot);
  assert.equal(
    fs.readFileSync(path.join(userTemplatesRoot, 'DopSoglTemplates', 'additional', 'agreement.dotx'), 'utf8'),
    'agreement-template'
  );
  assert.equal(
    fs.readFileSync(path.join(userTemplatesRoot, 'DocTemplates', 'request.xltx'), 'utf8'),
    'doc-template'
  );
});

test('ensureWritableTemplatesPath preserves user-edited templates when they already exist', () => {
  const sourceRoot = makeTempDir('smeta-templates-src-');
  const userTemplatesRoot = makeTempDir('smeta-templates-user-');

  const sourceAgreementDir = path.join(sourceRoot, 'DopSoglTemplates', 'replacement');
  const targetAgreementDir = path.join(userTemplatesRoot, 'DopSoglTemplates', 'replacement');
  fs.mkdirSync(sourceAgreementDir, { recursive: true });
  fs.mkdirSync(targetAgreementDir, { recursive: true });
  fs.writeFileSync(path.join(sourceAgreementDir, 'agreement.dotx'), 'bundled-version');
  fs.writeFileSync(path.join(targetAgreementDir, 'agreement.dotx'), 'user-version');

  ensureWritableTemplatesPath({
    sourceRoot,
    userTemplatesRoot,
  });

  assert.equal(
    fs.readFileSync(path.join(userTemplatesRoot, 'DopSoglTemplates', 'replacement', 'agreement.dotx'), 'utf8'),
    'user-version'
  );
});
