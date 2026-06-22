const fs = require('fs');
const os = require('os');
const path = require('path');

function createTempHtmlForPdf(htmlContent, options = {}) {
  const tempRoot = options.tempRoot || os.tmpdir();
  const runDir = fs.mkdtempSync(path.join(tempRoot, 'smetaai-pdf-'));
  const filePath = path.join(runDir, 'document.html');

  fs.writeFileSync(filePath, htmlContent, 'utf8');

  return {
    filePath,
    cleanup() {
      try {
        fs.rmSync(runDir, { recursive: true, force: true });
      } catch {
        // Игнорируем ошибки cleanup временного каталога.
      }
    },
  };
}

async function loadHtmlForPdfWindow(win, htmlContent, options = {}) {
  const timeoutMs = options.timeoutMs || 15000;
  const prepared = createTempHtmlForPdf(htmlContent, options);

  try {
    await new Promise((resolve, reject) => {
      const wc = win.webContents;
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('PDF: timeout loading HTML'));
      }, timeoutMs);

      function cleanup() {
        clearTimeout(timer);
        wc.removeListener('did-finish-load', onFinish);
        wc.removeListener('did-fail-load', onFail);
      }

      function onFinish() {
        cleanup();
        resolve();
      }

      function onFail(_event, errorCode, errorDesc) {
        cleanup();
        reject(new Error(`PDF: failed to load HTML (${errorCode}): ${errorDesc}`));
      }

      wc.once('did-finish-load', onFinish);
      wc.once('did-fail-load', onFail);

      win.loadFile(prepared.filePath).catch((error) => {
        cleanup();
        reject(error);
      });
    });

    try {
      await win.webContents.executeJavaScript(
        'document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()',
        true
      );
    } catch {
      // Игнорируем проблемы со шрифтами, чтобы не ломать PDF.
    }

    return prepared;
  } catch (error) {
    prepared.cleanup();
    throw error;
  }
}

async function openPathOrThrow(shellImpl, filePath) {
  const result = await shellImpl.openPath(filePath);
  if (typeof result === 'string' && result.trim()) {
    throw new Error(result.trim());
  }
  return true;
}

module.exports = {
  createTempHtmlForPdf,
  loadHtmlForPdfWindow,
  openPathOrThrow,
};
