const fs = require('fs');
const path = require('path');
const { buildPackageDir } = require('../output-paths');
const { adaptBackendSnapshot } = require('./backend-snapshot-adapter');

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function defaultPackageDirBuilder(context) {
  return buildPackageDir(context, {
    fsImpl: fs,
    pathImpl: path,
    now: () => Date.now(),
  });
}

function buildPackageDefaults(context, nowValue) {
  const estimate = context?.estimate || {};
  const number = estimate.number || 'Б-Н';
  const date = String(nowValue).split('T')[0];
  const amount = toNumber(
    estimate.total_with_vat
    ?? estimate.total_cost
    ?? estimate.total_without_vat
    ?? 0
  );
  const amountWithoutVat = toNumber(
    estimate.total_without_vat
    ?? estimate.total_cost
    ?? (amount > 0 ? amount / 1.2 : 0)
  );
  const vatAmount = toNumber(
    estimate.total_vat
    ?? Math.max(0, amount - amountWithoutVat)
  );

  return {
    contract: {
      estimate_id: estimate.id,
      project_id: estimate.project_id || context?.project?.id || null,
      number: `Д-${number}`,
      date,
      client: estimate.client_name || context?.project?.client_name || '',
      amount,
      status: 'draft',
    },
    ks2: {
      estimate_id: estimate.id,
      project_id: estimate.project_id || context?.project?.id || null,
      number: `КС2-${number}-1`,
      date,
      period_from: date,
      period_to: date,
      amount,
    },
    ks3: {
      project_id: estimate.project_id || context?.project?.id || null,
      estimate_id: estimate.id,
      number: `КС3-${number}-1`,
      date,
      period_from: date,
      period_to: date,
      amount_without_vat: amountWithoutVat,
      vat_amount: vatAmount,
      amount,
      total_with_vat: amount,
    },
  };
}

function normalizePackageContext(context) {
  if (context?.backendRevision) {
    return adaptBackendSnapshot({
      estimateRevision: context.backendRevision,
      documentSnapshot: context.backendDocument,
    });
  }
  return context;
}

async function generateDocumentPackage({
  context,
  createRecords,
  generators,
  packageDirBuilder = defaultPackageDirBuilder,
  logger,
  now = () => new Date().toISOString(),
} = {}) {
  context = normalizePackageContext(context);
  if (!context?.estimate?.id || !(context?.items || []).length) {
    throw new Error('Нет данных для генерации');
  }

  const generated = [];
  const errors = [];
  const packageDir = packageDirBuilder(context);
  if (!fs.existsSync(packageDir)) {
    fs.mkdirSync(packageDir, { recursive: true });
  }
  const defaults = buildPackageDefaults(context, now());

  const runStep = async (label, action) => {
    try {
      const result = await action();
      if (result?.path) {
        generated.push({ type: label, path: result.path });
      } else {
        throw new Error('Путь к файлу не получен');
      }
    } catch (error) {
      logger?.logError?.('PACKAGE_GENERATION_ERROR', {
        label,
        error,
      });
      errors.push(`${label}: ${error.message}`);
    }
  };

  await runStep('Смета', async () => generators.estimate(context.estimate.id, { packageDir }));

  await runStep('Договор', async () => {
    const contract = await createRecords.contract(defaults.contract);
    return generators.contract(contract.id, { packageDir });
  });

  await runStep('КС-2', async () => {
    const ks2 = await createRecords.ks2(defaults.ks2);
    return generators.ks2(ks2.id, { packageDir });
  });

  await runStep('КС-3', async () => {
    const ks3 = await createRecords.ks3(defaults.ks3);
    return generators.ks3(ks3.id, { packageDir });
  });

  await runStep('ФОТ', async () => generators.fot(context.estimate.id, { packageDir }));
  await runStep('Материалы', async () => generators.materials(context.estimate.id, { packageDir }));

  return {
    folder: packageDir,
    generated,
    errors,
  };
}

module.exports = {
  buildPackageDefaults,
  generateDocumentPackage,
  normalizePackageContext,
};
