const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const REGISTRY_KEY = 'HKCU\\Software\\ZARU\\SmetaAI';
const REGISTRY_VALUE_NAME = 'DeviceState';
const STORAGE_FILE_NAME = 'device.dat';
const STORAGE_CHECKSUM_SALT = 'zaru-device-storage-v1';

function resolveElectronApp() {
  try {
    return require('electron').app;
  } catch {
    return null;
  }
}

function normalizeDemoEstimateCount(rawValue) {
  const parsed = Number.parseInt(String(rawValue ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function normalizeUpdatedAt(rawValue) {
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Date.now();
}

function createDeviceState(state = {}) {
  const deviceId = String(state.deviceId || '').trim() || crypto.randomUUID();

  return {
    deviceId,
    demoEstimateCount: normalizeDemoEstimateCount(state.demoEstimateCount),
    updatedAt: normalizeUpdatedAt(state.updatedAt),
  };
}

function buildChecksum(state) {
  return crypto
    .createHash('sha256')
    .update(
      [
        state.deviceId,
        String(state.demoEstimateCount),
        String(state.updatedAt),
        STORAGE_CHECKSUM_SALT,
      ].join('|'),
      'utf8'
    )
    .digest('hex');
}

function encodeDeviceState(state) {
  const normalized = createDeviceState(state);
  const payload = {
    ...normalized,
    checksum: buildChecksum(normalized),
  };

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

function decodeDeviceState(encodedValue) {
  if (!encodedValue || !String(encodedValue).trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(String(encodedValue).trim(), 'base64').toString('utf8'));
    const deviceId = String(parsed.deviceId || '').trim();
    const demoEstimateCount = Number.parseInt(String(parsed.demoEstimateCount ?? ''), 10);
    const updatedAt = Number(parsed.updatedAt);

    if (!deviceId || !Number.isFinite(demoEstimateCount) || demoEstimateCount < 0 || !Number.isFinite(updatedAt) || updatedAt <= 0) {
      return null;
    }

    const normalized = {
      deviceId,
      demoEstimateCount,
      updatedAt,
    };

    if (parsed.checksum !== buildChecksum(normalized)) {
      return null;
    }

    return normalized;
  } catch {
    return null;
  }
}

function resolveAppDataPath({ appImpl = resolveElectronApp(), appDataPath, envImpl = process.env, osImpl = os, pathImpl = path } = {}) {
  if (appDataPath) {
    return appDataPath;
  }

  if (appImpl && typeof appImpl.getPath === 'function') {
    try {
      return appImpl.getPath('appData');
    } catch {
      // fall through
    }
  }

  if (envImpl.APPDATA) {
    return envImpl.APPDATA;
  }

  return pathImpl.join(osImpl.homedir(), 'AppData', 'Roaming');
}

function getDeviceStorageFilePath(options = {}) {
  if (options.filePath) {
    return options.filePath;
  }

  const appDataRoot = resolveAppDataPath(options);
  return path.join(appDataRoot, 'ZARU', 'SmetaAI', STORAGE_FILE_NAME);
}

function readRegistryEncoded({
  execFileSyncImpl = execFileSync,
  registryKey = REGISTRY_KEY,
  registryValueName = REGISTRY_VALUE_NAME,
  platform = process.platform,
} = {}) {
  if (platform !== 'win32') {
    return null;
  }

  try {
    const output = execFileSyncImpl(
      'reg.exe',
      ['QUERY', registryKey, '/v', registryValueName],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );

    const line = output
      .split(/\r?\n/)
      .find((entry) => entry.includes(registryValueName) && entry.includes('REG_'));

    if (!line) {
      return null;
    }

    const parts = line.trim().split(/\s{2,}/);
    return parts.length >= 3 ? parts[parts.length - 1].trim() : null;
  } catch {
    return null;
  }
}

function writeRegistryEncoded(
  encodedValue,
  {
    execFileSyncImpl = execFileSync,
    registryKey = REGISTRY_KEY,
    registryValueName = REGISTRY_VALUE_NAME,
    platform = process.platform,
  } = {}
) {
  if (platform !== 'win32') {
    return false;
  }

  try {
    execFileSyncImpl(
      'reg.exe',
      ['ADD', registryKey, '/v', registryValueName, '/t', 'REG_SZ', '/d', encodedValue, '/f'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    return true;
  } catch {
    return false;
  }
}

function readFileEncoded({ fsImpl = fs, filePath } = {}) {
  const resolvedFilePath = getDeviceStorageFilePath({ filePath });

  try {
    if (!fsImpl.existsSync(resolvedFilePath)) {
      return null;
    }

    return fsImpl.readFileSync(resolvedFilePath, 'utf8').trim() || null;
  } catch {
    return null;
  }
}

function writeFileEncoded(encodedValue, { fsImpl = fs, filePath } = {}) {
  const resolvedFilePath = getDeviceStorageFilePath({ filePath });

  try {
    fsImpl.mkdirSync(path.dirname(resolvedFilePath), { recursive: true });
    fsImpl.writeFileSync(resolvedFilePath, encodedValue, 'utf8');
    return true;
  } catch {
    return false;
  }
}

function getDeviceState(options = {}) {
  const registryState = decodeDeviceState(readRegistryEncoded(options));
  if (registryState) {
    return registryState;
  }

  return decodeDeviceState(readFileEncoded(options));
}

function setDeviceState(state, options = {}) {
  const normalized = createDeviceState(state);
  const encodedValue = encodeDeviceState(normalized);

  const wroteRegistry = writeRegistryEncoded(encodedValue, options);
  const wroteFile = writeFileEncoded(encodedValue, options);

  if (!wroteRegistry && !wroteFile) {
    throw new Error('Не удалось сохранить состояние устройства');
  }

  return normalized;
}

module.exports = {
  REGISTRY_KEY,
  REGISTRY_VALUE_NAME,
  createDeviceState,
  encodeDeviceState,
  decodeDeviceState,
  getDeviceStorageFilePath,
  getDeviceState,
  setDeviceState,
};
