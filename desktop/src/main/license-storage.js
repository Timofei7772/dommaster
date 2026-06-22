const crypto = require('crypto');
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

class LicenseStorage {
  constructor(options = {}) {
    this.crypto = options.cryptoModule || crypto;
    this.fs = options.fsModule || fs;
    this.os = options.osModule || os;
    this.path = options.pathModule || path;
    this.app = options.app || resolveElectronApp();
    this.algorithm = 'aes-256-gcm';
    this.storagePath = options.storagePath || this.path.join(this._getBaseDir(), 'license.dat');
  }

  async save(payload, signature, metadata = {}) {
    const iv = this.crypto.randomBytes(16);
    const cipher = this.crypto.createCipheriv(this.algorithm, this._deriveKey(), iv);

    const data = {
      payload,
      signature,
      timestamp: metadata.timestamp || Date.now(),
      hardwareSnapshot: metadata.hardwareSnapshot || null,
      version: 1,
    };

    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');

    this.fs.mkdirSync(this.path.dirname(this.storagePath), { recursive: true });
    this.fs.writeFileSync(
      this.storagePath,
      JSON.stringify(
        {
          iv: iv.toString('hex'),
          authTag: cipher.getAuthTag().toString('hex'),
          encrypted,
        },
        null,
        2,
      ),
      'utf8',
    );
    return true;
  }

  async load() {
    if (!this.fs.existsSync(this.storagePath)) {
      return null;
    }

    try {
      const raw = JSON.parse(this.fs.readFileSync(this.storagePath, 'utf8'));
      const decipher = this.crypto.createDecipheriv(
        this.algorithm,
        this._deriveKey(),
        Buffer.from(raw.iv, 'hex'),
      );
      decipher.setAuthTag(Buffer.from(raw.authTag, 'hex'));

      let decrypted = decipher.update(raw.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return JSON.parse(decrypted);
    } catch {
      return null;
    }
  }

  async delete() {
    if (this.fs.existsSync(this.storagePath)) {
      this.fs.unlinkSync(this.storagePath);
    }
    return true;
  }

  _deriveKey() {
    const username = this.os.userInfo?.().username || process.env.USERNAME || 'user';
    return this.crypto
      .createHash('sha256')
      .update([process.platform, username, this.storagePath].join('|'))
      .digest();
  }

  _getBaseDir() {
    try {
      if (this.app?.getPath) {
        return this.path.join(this.app.getPath('userData'), 'license');
      }
    } catch {
      // fall back to home dir
    }
    return this.path.join(this.os.homedir(), '.smetaai', 'license');
  }
}

module.exports = LicenseStorage;
