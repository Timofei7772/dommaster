const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const {
  LicenseManager,
  canonicalStringify,
  canCreateEstimate,
  canUsePdfExport,
} = require('../src/main/license-manager');

function buildSignedPayload(overrides = {}) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const payload = {
    license_key: 'ZARU-ABCD-EFGH-JKLM-NPQR',
    license_type: 'standard',
    max_pcs: 1,
    issued_date: '2026-03-26T00:00:00.000Z',
    expiry_date: '2027-03-26T00:00:00.000Z',
    device_slot_id: 1,
    hardware_fingerprint: 'fp-1',
    device_name: 'OFFICE-PC',
    features: {
      export_pdf: true,
      export_excel: true,
      ai_scanner: true,
      ai_requests_limit: null,
    },
    is_active: true,
    public_key_id: 'v1',
    ...overrides,
  };

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(canonicalStringify(payload), 'utf8');
  sign.end();

  return {
    payload,
    signature: sign.sign(privateKey, 'hex'),
    publicKey,
  };
}

test('validateOnStartup returns demo mode when cache is missing', async () => {
  const manager = new LicenseManager({
    storage: { load: async () => null },
    fingerprint: {
      generate: async () => ({
        fingerprint: 'fp-1',
        components: {},
        tolerance: { required_matches: 3, total_components: 5 },
      }),
      compareFingerprints: () => ({ match: true, score: 1, matches: 5 }),
    },
    logger: { logViolation() {}, logLicenseViolation() {} },
    app: { isPackaged: false, getVersion: () => '1.0.0', getPath: () => 'C:/Temp' },
  });

  const result = await manager.validateOnStartup();
  assert.equal(result.valid, false);
  assert.equal(result.mode, 'DEMO');
  assert.equal(result.estimatesLimit, 5);
});

test('activateLicense uses cached signed payload when offline and within cache window', async () => {
  const signed = buildSignedPayload();
  const manager = new LicenseManager({
    fetchImpl: async () => { throw new Error('offline'); },
    storage: {
      load: async () => ({ payload: signed.payload, signature: signed.signature, timestamp: Date.now() }),
      save: async () => true,
    },
    fingerprint: {
      generate: async () => ({
        fingerprint: 'fp-1',
        components: { cpu: 'cpu', mac: ['mac'], disk: ['disk'], motherboard: 'mb', bios: 'bios' },
        tolerance: { required_matches: 3, total_components: 5 },
      }),
      compareFingerprints: () => ({ match: true, score: 1, matches: 5 }),
    },
    logger: { logViolation() {}, logLicenseViolation() {} },
    publicKey: signed.publicKey,
    app: { isPackaged: false, getVersion: () => '1.0.0', getPath: () => 'C:/Temp' },
  });

  const result = await manager.activateLicense('ZARU-ABCD-EFGH-JKLM-NPQR');
  assert.equal(result.success, true);
  assert.equal(result.offline, true);
});

test('canUsePdfExport allows PDF in demo mode within the free estimate tier', () => {
  const result = canUsePdfExport({ mode: 'DEMO', license: null });

  assert.equal(result.allowed, true);
});

test('canUsePdfExport blocks PDF for full base license', () => {
  const result = canUsePdfExport({
    mode: 'FULL',
    license: {
      features: {
        export_pdf: false,
      },
    },
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'Экспорт PDF доступен только в полной версии');
});

test('canUsePdfExport allows PDF for full plus license', () => {
  const result = canUsePdfExport({
    mode: 'FULL',
    license: {
      features: {
        export_pdf: true,
      },
    },
  });

  assert.equal(result.allowed, true);
});

test('canUsePdfExport keeps backward compatibility when export_pdf is missing', () => {
  const result = canUsePdfExport({
    mode: 'FULL',
    license: {},
  });

  assert.equal(result.allowed, true);
});

test('canCreateEstimate allows up to five demo estimates', () => {
  const result = canCreateEstimate({
    mode: 'DEMO',
    estimatesCount: 4,
  });

  assert.equal(result.allowed, true);
});

test('canCreateEstimate blocks the sixth demo estimate', () => {
  const result = canCreateEstimate({
    mode: 'DEMO',
    estimatesCount: 5,
  });

  assert.equal(result.allowed, false);
  assert.equal(
    result.reason,
    'Вы уже создали 5 бесплатных смет. Чтобы создавать новые проекты, приобретите лицензию.'
  );
});
