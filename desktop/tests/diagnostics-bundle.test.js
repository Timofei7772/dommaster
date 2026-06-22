const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const AdmZip = require('adm-zip');

const { createRuntimeLogger } = require('../src/main/runtime-logger');
const { ensureLogsDirectory, exportDiagnosticsBundle } = require('../src/main/diagnostics-bundle');

test('ensureLogsDirectory creates the logs folder when it does not exist', () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'smetaai-diagnostics-'));
  const logger = createRuntimeLogger({ appDataPath: userDataPath });

  assert.equal(fs.existsSync(logger.logDirectory), false);

  const logsPath = ensureLogsDirectory({ logger });

  assert.equal(logsPath, logger.logDirectory);
  assert.equal(fs.existsSync(logsPath), true);
});

test('exportDiagnosticsBundle creates a zip with logs, system-info and version metadata', () => {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'smetaai-diagnostics-'));
  const logger = createRuntimeLogger({
    appDataPath: userDataPath,
    now: () => '2026-04-02T15:00:00.000Z',
  });
  logger.logError('DOC_ERROR', { message: 'test failure' });

  const result = exportDiagnosticsBundle({
    logger,
    userDataPath,
    appVersion: '2.2.0',
    processInfo: {
      platform: 'win32',
      arch: 'x64',
      versions: { node: '24.14.0', electron: '28.3.3', chrome: '124.0.0.0' },
    },
    now: () => '2026-04-02T15:00:00.000Z',
  });

  assert.equal(fs.existsSync(result.path), true);

  const zip = new AdmZip(result.path);
  const entryNames = zip.getEntries().map((entry) => entry.entryName).sort();
  assert.deepEqual(entryNames, ['logs.txt', 'system-info.json', 'version.json']);

  const systemInfo = JSON.parse(zip.readAsText('system-info.json'));
  assert.equal(systemInfo.platform, 'win32');
  assert.equal(systemInfo.arch, 'x64');

  const versionInfo = JSON.parse(zip.readAsText('version.json'));
  assert.equal(versionInfo.version, '2.2.0');
  assert.equal(versionInfo.generated_at, '2026-04-02T15:00:00.000Z');

  const logs = zip.readAsText('logs.txt');
  assert.match(logs, /DOC_ERROR/);
});
