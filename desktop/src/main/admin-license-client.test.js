const assert = require('node:assert/strict');
const test = require('node:test');

const { issueAdminLicense, normalizeLicenseApiUrl } = require('./admin-license-client');

test('normalizeLicenseApiUrl trims trailing slash and falls back to localhost', () => {
  assert.equal(normalizeLicenseApiUrl('http://localhost:8000/'), 'http://localhost:8000');
  assert.equal(normalizeLicenseApiUrl(''), 'http://localhost:8000');
});

test('issueAdminLicense posts admin issuance request to backend', async () => {
  let capturedRequest = null;

  const result = await issueAdminLicense({
    apiUrl: 'http://127.0.0.1:8000/',
    email: 'buyer@example.com',
    plan: 'double',
    adminSecret: 'super-secret',
    fetchImpl: async (url, options) => {
      capturedRequest = { url, options };
      return {
        ok: true,
        async json() {
          return {
            success: true,
            license_key: 'ZARU-ABCD-EFGH-JKLM-NPQR',
            expires_at: '2027-04-10T12:00:00+00:00',
            plan: 'double',
            max_pcs: 2,
          };
        },
      };
    },
  });

  assert.deepEqual(capturedRequest, {
    url: 'http://127.0.0.1:8000/api/license/admin/issue',
    options: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Secret': 'super-secret',
      },
      body: JSON.stringify({
        email: 'buyer@example.com',
        plan: 'double',
      }),
    },
  });

  assert.deepEqual(result, {
    licenseKey: 'ZARU-ABCD-EFGH-JKLM-NPQR',
    expiresAt: '2027-04-10T12:00:00+00:00',
    plan: 'double',
    maxPcs: 2,
  });
});

test('issueAdminLicense surfaces backend detail errors', async () => {
  await assert.rejects(
    issueAdminLicense({
      apiUrl: 'http://127.0.0.1:8000',
      email: 'buyer@example.com',
      plan: 'standard',
      adminSecret: 'wrong-secret',
      fetchImpl: async () => ({
        ok: false,
        async json() {
          return { detail: 'Invalid admin secret' };
        },
      }),
    }),
    /Invalid admin secret/,
  );
});

test('issueAdminLicense validates required inputs before fetch', async () => {
  await assert.rejects(
    issueAdminLicense({
      apiUrl: 'http://127.0.0.1:8000',
      email: '',
      plan: 'standard',
      adminSecret: 'secret',
      fetchImpl: async () => {
        throw new Error('should not be called');
      },
    }),
    /Введите email покупателя/,
  );
});

test('issueAdminLicense rejects non-ascii admin secret before fetch', async () => {
  await assert.rejects(
    issueAdminLicense({
      apiUrl: 'http://127.0.0.1:8000',
      email: 'buyer@example.com',
      plan: 'standard',
      adminSecret: 'секрет',
      fetchImpl: async () => {
        throw new Error('should not be called');
      },
    }),
    /Admin secret должен содержать только латинские символы/,
  );
});
