const test = require('node:test');
const assert = require('node:assert/strict');

const { ensurePdfExportAllowed } = require('../src/main/pdf-access');

test('ensurePdfExportAllowed returns trusted status for plus license', async () => {
  const status = {
    mode: 'FULL',
    license: {
      features: {
        export_pdf: true,
      },
    },
  };

  const result = await ensurePdfExportAllowed({
    getStatus: async () => status,
    canUsePdfExport: (value) => ({ allowed: value.license.features.export_pdf === true }),
  });

  assert.equal(result, status);
});

test('ensurePdfExportAllowed returns trusted status for demo mode', async () => {
  const status = { mode: 'DEMO', license: null };

  const result = await ensurePdfExportAllowed({
    getStatus: async () => status,
    canUsePdfExport: () => ({
      allowed: true,
    }),
  });

  assert.equal(result, status);
});

test('ensurePdfExportAllowed throws PDF_LICENSE_REQUIRED for full base license', async () => {
  await assert.rejects(
    () =>
      ensurePdfExportAllowed({
        getStatus: async () => ({
          mode: 'FULL',
          license: {
            features: {
              export_pdf: false,
            },
          },
        }),
        canUsePdfExport: () => ({
          allowed: false,
          reason: 'Экспорт PDF доступен только в полной версии',
        }),
      }),
    /PDF_LICENSE_REQUIRED/
  );
});

test('ensurePdfExportAllowed allows core document generation for full base license', async () => {
  const status = {
    mode: 'FULL',
    license: {
      features: {
        export_pdf: false,
      },
    },
  };

  const result = await ensurePdfExportAllowed(
    {
      getStatus: async () => status,
      canUsePdfExport: () => ({
        allowed: false,
        reason: 'Экспорт PDF доступен только в полной версии',
      }),
    },
    { feature: 'core_document' }
  );

  assert.equal(result, status);
});

test('ensurePdfExportAllowed allows core document generation for demo mode', async () => {
  const status = { mode: 'DEMO', license: null };

  const result = await ensurePdfExportAllowed(
    {
      getStatus: async () => status,
      canUsePdfExport: () => ({
        allowed: true,
      }),
    },
    { feature: 'core_document' }
  );

  assert.equal(result, status);
});
