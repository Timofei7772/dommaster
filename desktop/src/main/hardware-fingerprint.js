const crypto = require('crypto');
const os = require('os');
const { execSync } = require('child_process');

class HardwareFingerprint {
  constructor(options = {}) {
    this.crypto = options.cryptoModule || crypto;
    this.os = options.osModule || os;
    this.execSync = options.execSync || execSync;
    this.platform = options.platform || process.platform;
  }

  async generate() {
    const components = {
      cpu: this._getCpuId(),
      mac: this._getMacAddresses(),
      disk: this._getDiskSerials(),
      motherboard: this._getMotherboardSerial(),
      bios: this._getBiosSerial(),
    };

    const normalized = this._normalize(components);
    const fingerprint = this.crypto
      .createHash('sha256')
      .update(JSON.stringify(normalized))
      .digest('hex');

    return {
      fingerprint,
      components: normalized,
      tolerance: { required_matches: 3, total_components: 5 },
    };
  }

  compareFingerprints(left, right, tolerance = { required_matches: 3, total_components: 5 }) {
    const leftNormalized = left?.components ? this._normalize(left.components) : this._normalize(left || {});
    const rightNormalized = right?.components ? this._normalize(right.components) : this._normalize(right || {});
    const leftFingerprint = left?.fingerprint || null;
    const rightFingerprint = right?.fingerprint || null;

    if (leftFingerprint && rightFingerprint && leftFingerprint === rightFingerprint) {
      return { match: true, score: 1, matches: tolerance.total_components || 5 };
    }

    let matches = 0;
    if (leftNormalized.cpu && leftNormalized.cpu === rightNormalized.cpu) matches += 1;
    if (this._arraysMatch(leftNormalized.mac, rightNormalized.mac)) matches += 1;
    if (this._arraysMatch(leftNormalized.disk, rightNormalized.disk)) matches += 1;
    if (leftNormalized.motherboard && leftNormalized.motherboard === rightNormalized.motherboard) matches += 1;
    if (leftNormalized.bios && leftNormalized.bios === rightNormalized.bios) matches += 1;

    const total = tolerance.total_components || 5;
    return {
      match: matches >= (tolerance.required_matches || 3),
      score: total ? matches / total : 0,
      matches,
    };
  }

  _runWindowsCommand(commands = []) {
    for (const command of commands) {
      try {
        const output = this.execSync(command, {
          encoding: 'utf8',
          timeout: 5000,
          windowsHide: true,
        });
        if (output && output.trim()) {
          return output;
        }
      } catch {
        // try next fallback
      }
    }
    return '';
  }

  _getCpuId() {
    if (this.platform === 'win32') {
      const output = this._runWindowsCommand([
        'wmic cpu get ProcessorId',
        'powershell -NoProfile -Command "(Get-CimInstance Win32_Processor | Select-Object -First 1 -ExpandProperty ProcessorId)"',
      ]);
      return output.split(/\r?\n/).slice(1).map((value) => value.trim()).find(Boolean) || '';
    }

    return this.os.cpus?.()?.[0]?.model || '';
  }

  _getMacAddresses() {
    if (this.platform === 'win32') {
      const output = this._runWindowsCommand([
        'wmic nic where "PhysicalAdapter=true" get MACAddress',
        'powershell -NoProfile -Command "Get-CimInstance Win32_NetworkAdapter | Where-Object { $_.PhysicalAdapter -eq $true -and $_.MACAddress } | Select-Object -ExpandProperty MACAddress"',
      ]);
      return output
        .split(/\r?\n/)
        .slice(1)
        .map((value) => value.trim())
        .filter(Boolean)
        .sort();
    }

    const interfaces = this.os.networkInterfaces?.() || {};
    return Object.values(interfaces)
      .flat()
      .filter((entry) => entry && !entry.internal && entry.mac && entry.mac !== '00:00:00:00:00:00')
      .map((entry) => entry.mac)
      .sort();
  }

  _getDiskSerials() {
    if (this.platform === 'win32') {
      const output = this._runWindowsCommand([
        'wmic diskdrive get SerialNumber',
        'powershell -NoProfile -Command "Get-CimInstance Win32_DiskDrive | Select-Object -ExpandProperty SerialNumber"',
      ]);
      return output
        .split(/\r?\n/)
        .slice(1)
        .map((value) => value.trim())
        .filter(Boolean)
        .sort();
    }

    return [];
  }

  _getMotherboardSerial() {
    if (this.platform === 'win32') {
      const output = this._runWindowsCommand([
        'wmic baseboard get SerialNumber',
        'powershell -NoProfile -Command "(Get-CimInstance Win32_BaseBoard | Select-Object -First 1 -ExpandProperty SerialNumber)"',
      ]);
      return output.split(/\r?\n/).slice(1).map((value) => value.trim()).find(Boolean) || '';
    }

    return '';
  }

  _getBiosSerial() {
    if (this.platform === 'win32') {
      const output = this._runWindowsCommand([
        'wmic bios get SerialNumber',
        'powershell -NoProfile -Command "(Get-CimInstance Win32_BIOS | Select-Object -First 1 -ExpandProperty SerialNumber)"',
      ]);
      return output.split(/\r?\n/).slice(1).map((value) => value.trim()).find(Boolean) || '';
    }

    return '';
  }

  _normalize(components = {}) {
    return {
      cpu: (components.cpu || '').toUpperCase().replace(/\s+/g, ''),
      mac: (components.mac || []).map((value) => value.toUpperCase().replace(/[:\-]/g, '')).sort(),
      disk: (components.disk || []).map((value) => value.toUpperCase().replace(/\s+/g, '')).sort(),
      motherboard: (components.motherboard || '').toUpperCase().replace(/\s+/g, ''),
      bios: (components.bios || '').toUpperCase().replace(/\s+/g, ''),
    };
  }

  _arraysMatch(left = [], right = []) {
    if (left.length !== right.length) {
      return false;
    }
    return left.every((value, index) => value === right[index]);
  }
}

module.exports = HardwareFingerprint;
