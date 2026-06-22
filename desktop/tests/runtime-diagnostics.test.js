const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { generateDocument } = require('../src/document-kernel');
const { createRuntimeLogger } = require('../src/main/runtime-logger');
const { createMinimalSelfCheckContext, runSystemSelfCheck } = require('../src/main/system-self-check');

test('createRuntimeLogger writes serialized error entries into the local runtime log', () => {
  const appDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'smetaai-runtime-log-'));
  const logger = createRuntimeLogger({
    appDataPath,
    now: () => '2026-04-02T12:00:00.000Z',
  });

  logger.logError('DOCX_ERROR', new Error('template render failed'));

  const contents = fs.readFileSync(logger.logFilePath, 'utf8').trim().split(/\r?\n/);
  assert.equal(contents.length, 1);

  const entry = JSON.parse(contents[0]);
  assert.equal(entry.time, '2026-04-02T12:00:00.000Z');
  assert.equal(entry.level, 'error');
  assert.equal(entry.type, 'DOCX_ERROR');
  assert.equal(entry.data.message, 'template render failed');
  assert.equal(entry.data.name, 'Error');
  assert.match(entry.data.stack, /template render failed/);
});

test('runSystemSelfCheck passes against the real document kernel using the minimal context', () => {
  const errors = [];
  const infos = [];

  const result = runSystemSelfCheck({
    generateDocument,
    logger: {
      logError: (type, data) => errors.push({ type, data }),
      logInfo: (type, data) => infos.push({ type, data }),
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
  assert.equal(errors.length, 0);
  assert.equal(infos.length, 1);
  assert.equal(infos[0].type, 'SELF_CHECK_OK');
});

test('runSystemSelfCheck logs mismatches from a broken generator without crashing the app', () => {
  const errors = [];

  const result = runSystemSelfCheck({
    generateDocument: ({ type }) => {
      if (type === 'estimate') {
        return { totals: { grandTotal: 120 } };
      }
      if (type === 'ks2') {
        return { totals: { totalWithVat: 90 } };
      }
      if (type === 'ks3') {
        return { totals: { estimateTotal: 130, payable: 95 } };
      }
      if (type === 'fot') {
        return { totals: { totalAmount: 10 } };
      }
      if (type === 'materials_request') {
        return { rows: [], totals: { totalItems: 0 } };
      }
      throw new Error(`Unexpected type ${type}`);
    },
    logger: {
      logError: (type, data) => errors.push({ type, data }),
      logInfo: () => {},
    },
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.issues, [
    'SELF_CHECK_TOTAL_MISMATCH',
    'SELF_CHECK_PAYMENT_MISMATCH',
  ]);
  assert.deepEqual(
    errors.map((entry) => entry.type),
    ['SELF_CHECK_TOTAL_MISMATCH', 'SELF_CHECK_PAYMENT_MISMATCH']
  );
});
