const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');

const { createTempHtmlForPdf, loadHtmlForPdfWindow, openPathOrThrow } = require('../src/main/pdf-runtime');

test('createTempHtmlForPdf writes utf-8 html to a temp file and cleans it up', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'smetaai-pdf-test-'));
  const html = '<html><body><h1>Смета №42</h1><p>Печать и PDF</p></body></html>';

  const prepared = createTempHtmlForPdf(html, { tempRoot });

  assert.equal(typeof prepared.filePath, 'string');
  assert.equal(path.extname(prepared.filePath), '.html');
  assert.equal(fs.existsSync(prepared.filePath), true);
  assert.match(fs.readFileSync(prepared.filePath, 'utf8'), /Смета №42/);

  prepared.cleanup();

  assert.equal(fs.existsSync(prepared.filePath), false);
  assert.equal(fs.existsSync(path.dirname(prepared.filePath)), false);
});

test('openPathOrThrow returns on success and throws on shell errors', async () => {
  await assert.doesNotReject(async () => {
    await openPathOrThrow({
      openPath: async () => '',
    }, 'C:/Temp/file.pdf');
  });

  await assert.rejects(async () => {
    await openPathOrThrow({
      openPath: async () => 'No application is associated with the specified file',
    }, 'C:/Temp/file.pdf');
  }, /associated/i);
});

test('loadHtmlForPdfWindow keeps temp html until caller cleanup', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'smetaai-pdf-load-'));
  const events = new EventEmitter();
  let loadedFilePath = null;

  const webContents = {
    once: events.once.bind(events),
    removeListener: events.removeListener.bind(events),
    executeJavaScript: async () => Promise.resolve(),
  };

  const win = {
    webContents,
    loadFile: async (filePath) => {
      loadedFilePath = filePath;
      setImmediate(() => {
        events.emit('did-finish-load');
      });
    },
  };

  const prepared = await loadHtmlForPdfWindow(
    win,
    '<html><body><h1>Смета</h1></body></html>',
    { tempRoot, timeoutMs: 1000 }
  );

  assert.equal(typeof prepared?.cleanup, 'function');
  assert.equal(fs.existsSync(loadedFilePath), true);

  prepared.cleanup();

  assert.equal(fs.existsSync(loadedFilePath), false);
});
