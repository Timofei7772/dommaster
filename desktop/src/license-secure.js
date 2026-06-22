const { LicenseManager, canCreateEstimate, canUsePdfExport, canUseAiRequest } = require('./main/license-manager');

const LICENSE_TYPES = {
  NONE: { code: 'NONE', name: 'Нет лицензии' },
  STANDARD: { code: 'PRO', name: 'Standard' },
  DOUBLE: { code: 'PRO', name: 'Double' },
  ENTERPRISE: { code: 'ENTERPRISE', name: 'Enterprise' },
};

function toFeatureList(features) {
  if (!features) {
    return [];
  }
  if (Array.isArray(features)) {
    return features;
  }
  return Object.entries(features)
    .filter(([, value]) => value === true)
    .map(([key]) => key);
}

function resolveTypeInfo(licenseType) {
  switch (licenseType) {
    case 'standard':
      return LICENSE_TYPES.STANDARD;
    case 'double':
      return LICENSE_TYPES.DOUBLE;
    case 'enterprise':
      return LICENSE_TYPES.ENTERPRISE;
    default:
      return LICENSE_TYPES.NONE;
  }
}

function daysLeft(dateString) {
  if (!dateString) {
    return 0;
  }
  const target = new Date(dateString);
  const now = new Date();
  return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
}

class LicenseSecureFacade {
  constructor(options = {}) {
    this.manager = options.manager || new LicenseManager(options);
  }

  async checkLicense() {
    return this.manager.validateOnStartup();
  }

  async getLicenseInfo() {
    const status = await this.manager.validateOnStartup();
    const hwid = await this.getHardwareId();
    const license = status.license || {};
    const typeInfo = resolveTypeInfo(license.license_type);
    const expiresAt = license.expiry_date || '';

    return {
      isValid: status.valid,
      needActivation: !status.valid,
      type: typeInfo.code,
      typeName: typeInfo.name,
      email: license.client_email || '',
      key: license.license_key || '',
      daysLeft: status.daysLeft ?? daysLeft(expiresAt),
      expiresAt,
      activatedAt: license.issued_date || '',
      isTrial: false,
      isExpired: Boolean(expiresAt) && new Date(expiresAt) <= new Date(),
      features: toFeatureList(license.features),
      hwid,
      error: status.error,
      warning: status.requiresOnlineValidation ? 'Требуется онлайн-проверка лицензии' : undefined,
    };
  }

  async activateLicense(key, emailOrOptions) {
    const options = typeof emailOrOptions === 'object' && emailOrOptions !== null
      ? emailOrOptions
      : { email: emailOrOptions };

    const result = await this.manager.activateLicense(key, options);
    if (!result.success) {
      return {
        success: false,
        error: result.error,
        errorCode: result.code,
        details: result.details,
        activeDevices: result.active_devices || result.details?.active_devices || [],
      };
    }

    const info = await this.getLicenseInfo();
    return {
      success: true,
      message: result.message || 'Лицензия активирована',
      deviceSlotId: result.device_slot_id,
      activeDevices: result.active_devices || [],
      license: {
        key: key.trim().toUpperCase(),
        email: options.email || '',
        type: info.type,
        features: info.features,
        activatedAt: new Date().toISOString(),
        expiresAt: info.expiresAt,
      },
    };
  }

  async extendLicense(key, email) {
    return this.activateLicense(key, { email });
  }

  async hasFeature(feature) {
    return this.manager.hasFeature(feature);
  }

  async getHardwareId() {
    return this.manager.getHardwareFingerprint();
  }

  async getActiveDevices() {
    return this.manager.getActiveDevices();
  }

  async deactivateDevice(slotId) {
    return this.manager.deactivateDevice(slotId);
  }

  async deactivateLicense() {
    const info = await this.manager.storage.load();
    if (info?.payload?.device_slot_id) {
      return this.manager.deactivateDevice(info.payload.device_slot_id);
    }
    await this.manager.storage.delete();
    return { success: true };
  }

  async getStatus() {
    return this.manager.validateOnStartup();
  }

  validateKeyFormat(key) {
    return this.manager.isValidFormat(key);
  }

  canCreateEstimate(context) {
    return canCreateEstimate(context);
  }

  canUsePdfExport(context) {
    return canUsePdfExport(context);
  }

  canUseAiRequest(context) {
    return canUseAiRequest(context);
  }

  generateLicenseKey() {
    // LEGACY: не использовать для реальной выдачи лицензий.
    // Оставлено только для внутренних тестов/совместимости со старыми сценариями.
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const block = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    return `ZARU-${block()}-${block()}-${block()}-${block()}`;
  }

  async loadLicense() {
    return this.manager.storage.load();
  }

  async saveLicense(payload, signature, metadata) {
    return this.manager.storage.save(payload, signature, metadata);
  }

  startAntiDebugMonitor() {
    return false;
  }
}

let defaultFacade = null;
function getDefaultFacade() {
  if (!defaultFacade) {
    defaultFacade = new LicenseSecureFacade();
  }
  return defaultFacade;
}

module.exports = {
  LICENSE_TYPES,
  LicenseSecureFacade,
  getHardwareId: (...args) => getDefaultFacade().getHardwareId(...args),
  generateLicenseKey: (...args) => getDefaultFacade().generateLicenseKey(...args),
  validateKeyFormat: (...args) => getDefaultFacade().validateKeyFormat(...args),
  activateLicense: (...args) => getDefaultFacade().activateLicense(...args),
  extendLicense: (...args) => getDefaultFacade().extendLicense(...args),
  checkLicense: (...args) => getDefaultFacade().checkLicense(...args),
  hasFeature: (...args) => getDefaultFacade().hasFeature(...args),
  getLicenseInfo: (...args) => getDefaultFacade().getLicenseInfo(...args),
  deactivateLicense: (...args) => getDefaultFacade().deactivateLicense(...args),
  loadLicense: (...args) => getDefaultFacade().loadLicense(...args),
  saveLicense: (...args) => getDefaultFacade().saveLicense(...args),
  startAntiDebugMonitor: (...args) => getDefaultFacade().startAntiDebugMonitor(...args),
  getActiveDevices: (...args) => getDefaultFacade().getActiveDevices(...args),
  deactivateDevice: (...args) => getDefaultFacade().deactivateDevice(...args),
  getStatus: (...args) => getDefaultFacade().getStatus(...args),
  canCreateEstimate: (...args) => getDefaultFacade().canCreateEstimate(...args),
  canUsePdfExport: (...args) => getDefaultFacade().canUsePdfExport(...args),
  canUseAiRequest: (...args) => getDefaultFacade().canUseAiRequest(...args),
};

