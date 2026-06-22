const test = require('node:test');
const assert = require('node:assert/strict');

const licenseModule = require('../src/license-secure');
const { LicenseSecureFacade } = licenseModule;

test('facade keeps legacy methods and exposes new device methods', async () => {
  const facade = new LicenseSecureFacade({
    manager: {
      validateOnStartup: async () => ({
        valid: true,
        mode: 'FULL',
        license: {
          license_type: 'standard',
          expiry_date: '2027-03-26T00:00:00.000Z',
          features: { export_pdf: true, export_excel: true },
        },
      }),
      activateLicense: async () => ({ success: true }),
      getActiveDevices: async () => ({ success: true, devices: [] }),
      deactivateDevice: async () => ({ success: true }),
      getHardwareFingerprint: async () => 'fp-1',
    },
  });

  assert.equal(typeof facade.checkLicense, 'function');
  assert.equal(typeof facade.activateLicense, 'function');
  assert.equal(typeof facade.getActiveDevices, 'function');
  assert.equal(typeof facade.deactivateDevice, 'function');

  const info = await facade.getLicenseInfo();
  assert.equal(info.isValid, true);
});
