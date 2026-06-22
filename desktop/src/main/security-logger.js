const fs = require('fs');
const os = require('os');
const path = require('path');

function resolveElectronApp() {
  try {
    return require('electron').app;
  } catch {
    return null;
  }
}

class SecurityLogger {
  constructor(options = {}) {
    this.fs = options.fsModule || fs;
    this.os = options.osModule || os;
    this.path = options.pathModule || path;
    this.fetchImpl = options.fetchImpl || global.fetch?.bind(global);
    this.apiUrl = (options.apiUrl || process.env.LICENSE_API_URL || '').replace(/\/$/, '');
    this.app = options.app || resolveElectronApp();
    this.logPath = options.logPath || this.path.join(this._getBaseDir(), 'security.log');
  }

  logViolation(type, details = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      type,
      details,
    };
    this.fs.mkdirSync(this.path.dirname(this.logPath), { recursive: true });
    this.fs.appendFileSync(this.logPath, `${JSON.stringify(entry)}\n`, 'utf8');
    void this.sendToServer(entry);
    return entry;
  }

  logLicenseViolation(licenseKey, currentHardwareId, licensedHardwareId) {
    return this.logViolation('LICENSE_MISMATCH', {
      license_key: licenseKey,
      current_hardware: currentHardwareId,
      licensed_hardware: licensedHardwareId,
    });
  }

  async sendToServer(entry) {
    if (!this.fetchImpl || !this.apiUrl) {
      return false;
    }

    try {
      await this.fetchImpl(`${this.apiUrl}/api/license/security-log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      return true;
    } catch {
      return false;
    }
  }

  _getBaseDir() {
    try {
      if (this.app?.getPath) {
        return this.path.join(this.app.getPath('userData'), 'logs');
      }
    } catch {
      // fall back to home dir
    }
    return this.path.join(this.os.homedir(), '.smetaai', 'logs');
  }
}

module.exports = SecurityLogger;
