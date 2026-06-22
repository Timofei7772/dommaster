const fs = require('fs');
const path = require('path');

function normalizeForLog(value, seen = new WeakSet()) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack || '',
    };
  }

  if (value === null || value === undefined) {
    return value ?? null;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeForLog(item, seen));
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);

    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeForLog(item, seen)])
    );
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  return value;
}

function summarizeForLog(value) {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => summarizeForLog(item));
  }
  if (value instanceof Error) {
    return normalizeForLog(value);
  }
  if (typeof value === 'object') {
    const summary = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === null || item === undefined) {
        summary[key] = item ?? null;
      } else if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
        summary[key] = item;
      } else if (Array.isArray(item)) {
        summary[key] = `[Array(${item.length})]`;
      } else {
        summary[key] = '[Object]';
      }
    }
    return summary;
  }
  return String(value);
}

function createRuntimeLogger({
  appDataPath,
  logDirectory,
  logFileName = 'runtime-errors.ndjson',
  fsImpl = fs,
  pathImpl = path,
  now = () => new Date().toISOString(),
} = {}) {
  const resolvedLogDirectory = logDirectory || pathImpl.join(appDataPath || process.cwd(), 'logs');
  const logFilePath = pathImpl.join(resolvedLogDirectory, logFileName);

  const ensureDirectory = () => {
    if (!fsImpl.existsSync(resolvedLogDirectory)) {
      fsImpl.mkdirSync(resolvedLogDirectory, { recursive: true });
    }
  };

  const writeEntry = (level, type, data = {}) => {
    ensureDirectory();
    const entry = {
      time: now(),
      level,
      type,
      data: normalizeForLog(data),
    };
    fsImpl.appendFileSync(logFilePath, `${JSON.stringify(entry)}\n`, 'utf8');
    return entry;
  };

  return {
    logDirectory: resolvedLogDirectory,
    logFilePath,
    logInfo: (type, data = {}) => writeEntry('info', type, data),
    logWarn: (type, data = {}) => writeEntry('warn', type, data),
    logError: (type, data = {}) => writeEntry('error', type, data),
  };
}

function installProcessDiagnostics({ logger, processImpl = process }) {
  if (!logger || processImpl.__smetaAiProcessDiagnosticsInstalled) {
    return;
  }

  processImpl.__smetaAiProcessDiagnosticsInstalled = true;

  processImpl.on('uncaughtException', (error) => {
    logger.logError('UNCAUGHT_EXCEPTION', error);
  });

  processImpl.on('unhandledRejection', (reason) => {
    logger.logError('UNHANDLED_REJECTION', { reason });
  });
}

function registerLoggedHandler(ipcMain, logger, channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...args);
    } catch (error) {
      logger?.logError('IPC_HANDLER_ERROR', {
        channel,
        args: summarizeForLog(args),
        error,
      });
      throw error;
    }
  });
}

module.exports = {
  createRuntimeLogger,
  installProcessDiagnostics,
  normalizeForLog,
  summarizeForLog,
  registerLoggedHandler,
};
