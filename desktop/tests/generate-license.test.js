const test = require('node:test');
const assert = require('node:assert/strict');

const {
  LicenseGenerator,
  canonicalStringify,
  parseArgs,
} = require('../../scripts/admin/generate_license');

test('generateLicense returns branded key with expected slot count', () => {
  const generator = new LicenseGenerator();
  const result = generator.generateLicense({
    clientName: 'OOO Romashka',
    clientEmail: 'client@example.com',
    licenseType: 'double',
    maxPcs: 2,
    durationDays: 365,
  });

  assert.match(result.license_key, /^ZARU-[A-Z2-9]{4}(?:-[A-Z2-9]{4}){3}$/);
  assert.equal(result.payload.max_pcs, 2);
});

test('canonicalStringify is stable for nested objects', () => {
  const left = canonicalStringify({ b: 1, a: { y: 2, x: 1 } });
  const right = canonicalStringify({ a: { x: 1, y: 2 }, b: 1 });

  assert.equal(left, right);
});

test('generateLicense disables PDF export by default', () => {
  const generator = new LicenseGenerator();
  const result = generator.generateLicense({
    clientName: 'OOO Romashka',
    clientEmail: 'client@example.com',
    licenseType: 'standard',
  });

  assert.equal(result.payload.features.export_pdf, false);
});

test('generateLicense enables PDF export for plus edition', () => {
  const generator = new LicenseGenerator();
  const result = generator.generateLicense({
    clientName: 'OOO Romashka',
    clientEmail: 'client@example.com',
    licenseType: 'standard',
    plus: true,
  });

  assert.equal(result.payload.features.export_pdf, true);
});

test('parseArgs recognizes --plus flag', () => {
  const args = parseArgs(['--license_type', 'double', '--plus']);

  assert.equal(args.license_type, 'double');
  assert.equal(args.plus, 'true');
});
