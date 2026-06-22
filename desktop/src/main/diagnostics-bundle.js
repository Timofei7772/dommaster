const fs = require('fs');
const os = require('os');
const path = require('path');
const AdmZip = require('adm-zip');

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
}

function ensureLogsDirectory({ logger }) {
  return ensureDirectory(logger.logDirectory);
}

function exportDiagnosticsBundle({
  logger,
  userDataPath,
  appVersion,
  processInfo = process,
  now = () => new Date().toISOString(),
} = {}) {
  const diagnosticsDir = ensureDirectory(path.join(userDataPath || os.tmpdir(), 'diagnostics'));
  const logsDir = ensureLogsDirectory({ logger });
  const timestamp = now();
  const safeTimestamp = timestamp.replace(/[:.]/g, '-');
  const bundlePath = path.join(diagnosticsDir, `diagnostics-${safeTimestamp}.zip`);

  const zip = new AdmZip();
  const logContents = fs.existsSync(logger.logFilePath)
    ? fs.readFileSync(logger.logFilePath, 'utf8')
    : '';

  zip.addFile('logs.txt', Buffer.from(logContents, 'utf8'));
  zip.addFile('system-info.json', Buffer.from(JSON.stringify({
    platform: processInfo.platform,
    arch: processInfo.arch,
    versions: processInfo.versions || {},
    logs_directory: logsDir,
  }, null, 2), 'utf8'));
  zip.addFile('version.json', Buffer.from(JSON.stringify({
    version: appVersion || 'unknown',
    generated_at: timestamp,
  }, null, 2), 'utf8'));

  zip.writeZip(bundlePath);

  return {
    path: bundlePath,
  };
}

module.exports = {
  ensureLogsDirectory,
  exportDiagnosticsBundle,
};
