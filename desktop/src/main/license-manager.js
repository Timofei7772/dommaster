const crypto = require('crypto');
const path = require('path');

const HardwareFingerprint = require('./hardware-fingerprint');
const LicenseStorage = require('./license-storage');
const SecurityLogger = require('./security-logger');

function resolveElectronApp() {
  try {
    return require('electron').app;
  } catch {
    return {
      isPackaged: false,
      getVersion: () => '0.0.0',
      getPath: () => path.join(process.cwd(), '.smetaai'),
    };
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = canonicalize(value[key]);
        return acc;
      }, {});
  }

  return value;
}

function canonicalStringify(value) {
  return JSON.stringify(canonicalize(value));
}

function normalizeApiUrl(value) {
  return (value || 'http://localhost:8000').replace(/\/$/, '');
}

function daysUntil(dateString) {
  if (!dateString) return 0;
  const target = new Date(dateString);
  const now = new Date();
  return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
}

function canCreateEstimate({ mode, estimatesCount }) {
  if (mode === 'DEMO' && Number(estimatesCount || 0) >= 5) {
    return {
      allowed: false,
      reason: 'Вы уже создали 5 бесплатных смет. Чтобы создавать новые проекты, приобретите лицензию.',
    };
  }
  return { allowed: true };
}

function canUsePdfExport({ mode, license }) {
  if (mode === 'DEMO') {
    return { allowed: true };
  }

  if (license?.features?.export_pdf === false) {
    return { allowed: false, reason: 'Экспорт PDF доступен только в полной версии' };
  }

  return { allowed: true };
}

function canUseAiRequest({ mode, usedRequests = 0, limit = 5 }) {
  if (mode === 'DEMO' && Number(usedRequests) >= Number(limit)) {
    return { allowed: false, reason: 'Достигнут лимит AI-запросов в демо-режиме (5)' };
  }
  return { allowed: true };
}

class LicenseManager {
  constructor(options = {}) {
    this.app = options.app || resolveElectronApp();
    this.fetchImpl = options.fetchImpl || global.fetch?.bind(global);
    this.apiUrl = normalizeApiUrl(options.apiUrl || process.env.LICENSE_API_URL);
    this.publicKey = options.publicKey || process.env.LICENSE_PUBLIC_KEY || '';
    this.allowUnsigned = options.allowUnsigned ?? !this.app.isPackaged;
    this.cacheExpiryMs = options.cacheExpiryMs || 7 * 24 * 60 * 60 * 1000;

    this.fingerprint = options.fingerprint || new HardwareFingerprint(options.hardwareOptions);
    this.storage = options.storage || new LicenseStorage({ app: this.app });
    this.logger = options.logger || new SecurityLogger({ app: this.app, fetchImpl: this.fetchImpl, apiUrl: this.apiUrl });
  }

  async activateLicense(key, options = {}) {
    const licenseKey = String(key || '').trim().toUpperCase();
    if (!this.isValidFormat(licenseKey)) {
      return { success: false, error: 'Неверный формат ключа', code: 'INVALID_FORMAT' };
    }

    const hardwareSnapshot = await this.fingerprint.generate();
    try {
      if (!this.fetchImpl) {
        throw new Error('NO_FETCH');
      }

      const response = await this.fetchImpl(`${this.apiUrl}/api/license/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          license_key: licenseKey,
          hardware_fingerprint: hardwareSnapshot.fingerprint,
          hardware_components: hardwareSnapshot.components,
          force_deactivate_previous: Boolean(options.forceDeactivatePrevious),
          device_name: options.deviceName || null,
          app_version: this.app.getVersion?.() || '0.0.0',
          timestamp: Date.now(),
        }),
      });
      const data = await response.json();

      if (!data.success) {
        if (data.error_code === 'ACTIVATION_LIMIT_REACHED') {
          this.logger.logLicenseViolation(licenseKey, hardwareSnapshot.fingerprint, 'LIMIT_REACHED');
        }
        return {
          success: false,
          error: data.error || 'Ошибка активации',
          code: data.error_code || 'UNKNOWN_ERROR',
          details: data.details || data,
          active_devices: data.active_devices || [],
        };
      }

      if (!this.verifySignature(data.payload, data.signature)) {
        this.logger.logViolation('SIGNATURE_INVALID', { license_key: licenseKey });
        return { success: false, error: 'Неверная подпись лицензии', code: 'SIGNATURE_INVALID' };
      }

      const payload = {
        ...data.payload,
        tolerance: data.payload?.tolerance || hardwareSnapshot.tolerance,
      };
      await this.storage.save(payload, data.signature, { hardwareSnapshot });
      return {
        success: true,
        message: 'Лицензия активирована',
        expires: payload.expiry_date,
        type: payload.license_type,
        device_slot_id: payload.device_slot_id,
        active_devices: data.active_devices || [],
      };
    } catch {
      const cached = await this.storage.load();
      if (cached && this.isCacheFresh(cached)) {
        if (!this.verifySignature(cached.payload, cached.signature)) {
          this.logger.logViolation('CACHED_SIGNATURE_INVALID', {});
          return { success: false, error: 'Лицензия повреждена', code: 'CACHED_SIGNATURE_INVALID' };
        }

        const match = this.matchHardware(hardwareSnapshot, cached);
        if (!match.match) {
          this.logger.logLicenseViolation(licenseKey, hardwareSnapshot.fingerprint, cached.payload?.hardware_fingerprint);
          return { success: false, error: 'Лицензия привязана к другому компьютеру', code: 'HARDWARE_MISMATCH_OFFLINE' };
        }

        return {
          success: true,
          offline: true,
          message: 'Работа в оффлайн-режиме',
          expires: cached.payload.expiry_date,
          type: cached.payload.license_type,
        };
      }

      return { success: false, error: 'Нет подключения к серверу активации', code: 'NO_CONNECTION', requiresOnline: true };
    }
  }

  async validateOnStartup() {
    const cached = await this.storage.load();
    if (!cached) {
      return { valid: false, mode: 'DEMO', estimatesLimit: 5 };
    }

    if (!this.verifySignature(cached.payload, cached.signature)) {
      await this.storage.delete();
      return { valid: false, mode: 'DEMO', error: 'Лицензия повреждена' };
    }

    const expiresAt = new Date(cached.payload.expiry_date || 0);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
      await this.storage.delete();
      return { valid: false, mode: 'DEMO', error: 'Срок лицензии истёк' };
    }

    const currentFingerprint = await this.fingerprint.generate();
    const match = this.matchHardware(currentFingerprint, cached);
    if (!match.match) {
      return {
        valid: false,
        mode: 'DEMO',
        error: 'Лицензия привязана к другому компьютеру',
        code: 'HARDWARE_MISMATCH',
      };
    }

    return {
      valid: true,
      mode: 'FULL',
      requiresOnlineValidation: !this.isCacheFresh(cached),
      license: cached.payload,
      expires: cached.payload.expiry_date,
      daysLeft: daysUntil(cached.payload.expiry_date),
    };
  }

  async hasFeature(feature) {
    const status = await this.validateOnStartup();
    if (!status.valid) {
      return false;
    }

    const features = status.license?.features || {};
    if (Array.isArray(features)) {
      return features.includes(feature) || features.includes('all');
    }
    return Boolean(features[feature] || features.all);
  }

  async getHardwareFingerprint() {
    const generated = await this.fingerprint.generate();
    return generated.fingerprint;
  }

  async getActiveDevices() {
    const cached = await this.storage.load();
    if (!cached?.payload?.license_key) {
      return { success: false, error: 'Нет активной лицензии' };
    }
    if (!this.fetchImpl) {
      return { success: false, error: 'Нет подключения к серверу' };
    }

    try {
      const response = await this.fetchImpl(`${this.apiUrl}/api/license/devices/${cached.payload.license_key}`);
      return await response.json();
    } catch {
      return { success: false, error: 'Нет подключения к серверу' };
    }
  }

  async deactivateDevice(slotId) {
    const cached = await this.storage.load();
    if (!cached?.payload?.license_key) {
      return { success: false, error: 'Нет активной лицензии' };
    }
    if (!this.fetchImpl) {
      return { success: false, error: 'Нет подключения к серверу' };
    }

    try {
      const response = await this.fetchImpl(`${this.apiUrl}/api/license/deactivate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          license_key: cached.payload.license_key,
          device_slot_id: slotId,
          reason: 'user_request',
        }),
      });
      const data = await response.json();
      if (data.success && slotId === cached.payload.device_slot_id) {
        await this.storage.delete();
      }
      return data;
    } catch {
      return { success: false, error: 'Нет подключения к серверу' };
    }
  }

  async extendLicense(key, options = {}) {
    return this.activateLicense(key, options);
  }

  verifySignature(payload, signature) {
    if (!signature) {
      return false;
    }
    if (!this.publicKey) {
      return Boolean(this.allowUnsigned);
    }

    try {
      const verify = crypto.createVerify('RSA-SHA256');
      verify.update(canonicalStringify(payload), 'utf8');
      verify.end();
      return verify.verify(this.publicKey, signature, 'hex');
    } catch {
      return false;
    }
  }

  isValidFormat(key) {
    return /^ZARU-[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}$/.test(String(key || '').trim().toUpperCase());
  }

  isCacheFresh(cached) {
    return Boolean(cached?.timestamp) && Date.now() - cached.timestamp <= this.cacheExpiryMs;
  }

  matchHardware(currentSnapshot, cached) {
    if (cached.hardwareSnapshot && this.fingerprint.compareFingerprints) {
      return this.fingerprint.compareFingerprints(
        currentSnapshot,
        cached.hardwareSnapshot,
        cached.payload?.tolerance || currentSnapshot.tolerance,
      );
    }

    const cachedFingerprint = cached.payload?.hardware_fingerprint;
    const match = cachedFingerprint === currentSnapshot.fingerprint;
    return { match, score: match ? 1 : 0, matches: match ? 5 : 0 };
  }
}

module.exports = {
  LicenseManager,
  canonicalize,
  canonicalStringify,
  canCreateEstimate,
  canUsePdfExport,
  canUseAiRequest,
};

