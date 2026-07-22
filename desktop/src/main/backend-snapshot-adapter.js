'use strict';

const SUPPORTED_SCHEMAS = new Set([
  'estimate-snapshot.v1',
  'contract-snapshot.v1',
  'ks2-snapshot.v1',
  'ks3-snapshot.v1',
  'm29-snapshot.v1',
]);

function toNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function payloadOf(record) {
  return record?.payload_json || record;
}

function assertSchema(payload) {
  if (!payload || !SUPPORTED_SCHEMAS.has(payload.schema_version)) {
    throw new Error(`Unsupported backend snapshot schema: ${payload?.schema_version || 'missing'}`);
  }
}

function buildEstimateContext(revision) {
  const payload = payloadOf(revision);
  assertSchema(payload);
  if (payload.schema_version !== 'estimate-snapshot.v1') {
    throw new Error(`Unsupported backend snapshot schema: ${payload.schema_version}`);
  }

  const estimateSource = payload.estimate || {};
  const projectSource = payload.project || {};
  const objectSource = payload.object || {};
  const customer = payload.parties?.customer || {};
  const contractor = payload.parties?.contractor || {};
  const totals = payload.totals || {};
  const vat = payload.vat || {};
  const rows = (payload.rows || []).map((row) => ({
    id: row.source_id,
    section_id: row.section_source_id,
    item_number: row.item_number,
    code: row.justification,
    justification: row.justification,
    name: row.name,
    description: row.description,
    unit: row.unit,
    quantity: toNumber(row.quantity),
    row_type: row.row_type,
    labor_price: toNumber(row.labor_unit_price),
    material_price: toNumber(row.materials_unit_price),
    machines_price: toNumber(row.machines_unit_price),
    labor_total: toNumber(row.labor_total),
    material_total: toNumber(row.materials_total),
    machines_total: toNumber(row.machines_total),
    total: toNumber(row.total),
  }));
  const materialRows = rows.filter((row) => ['mat', 'material'].includes(row.row_type));
  const laborRows = rows.filter((row) => !['mat', 'material', 'meh', 'mechanism'].includes(row.row_type));

  return {
    estimate: {
      id: estimateSource.id,
      project_id: projectSource.id,
      number: estimateSource.number,
      name: estimateSource.name,
      description: estimateSource.description,
      status: estimateSource.status,
      client_name: customer.name || '',
      address: objectSource.address || '',
      total_labor: toNumber(totals.labor),
      total_materials: toNumber(totals.materials),
      total_machines: toNumber(totals.machines),
      total_cost: toNumber(totals.total_without_vat),
      total_without_vat: toNumber(totals.total_without_vat),
      vat_percent: toNumber(vat.percent),
      vat_cost: toNumber(vat.amount),
      total_vat: toNumber(vat.amount),
      total_with_vat: toNumber(totals.total_with_vat),
    },
    project: {
      ...projectSource,
      address: objectSource.address || '',
      object_name: objectSource.name || '',
      client_name: customer.name || '',
    },
    contract: null,
    items: rows,
    rows,
    sections: (payload.sections || []).map((section) => ({
      id: section.source_id,
      number: section.number,
      name: section.name,
      sort_order: section.order_index,
      total: toNumber(section.total),
    })),
    execution: {
      completedWorks: laborRows,
    },
    labor: {
      costs: laborRows.map((row) => ({
        item_id: row.id,
        name: row.name,
        unit: row.unit,
        quantity: row.quantity,
        amount: row.labor_total,
      })),
      summary: {
        totalAmount: toNumber(totals.labor),
        totalHours: laborRows.reduce((sum, row) => sum + row.quantity, 0),
      },
    },
    materials: {
      items: materialRows.map((row) => ({
        id: row.id,
        name: row.name,
        unit: row.unit,
        quantity: row.quantity,
        totalQty: row.quantity,
        price: row.material_price,
        total: row.material_total || row.total,
      })),
      summary: {
        totalAmount: toNumber(totals.materials),
        totalItems: materialRows.length,
      },
    },
    settings: {
      estimates: {
        vatEnabled: Boolean(vat.on_top),
        vatRate: toNumber(vat.percent),
        workCoefficient: toNumber(payload.coefficients?.work, 1),
        materialCoefficient: toNumber(payload.coefficients?.material, 1),
      },
    },
    companyInfo: contractor,
    documentTypes: ['estimate', 'contract', 'ks2', 'ks3', 'fot', 'm29', 'materials_request', 'package'],
    additionalAgreementTypes: ['additional', 'independent', 'replacement'],
    meta: {
      version: 1,
      backend: {
        revisionId: revision?.id ?? null,
        revisionNumber: revision?.revision_number ?? null,
        revisionHash: revision?.payload_hash ?? null,
        schemaVersion: payload.schema_version,
        calculationSchemaVersion: payload.calculation_schema_version,
      },
    },
  };
}

function applyDocumentSnapshot(context, snapshot) {
  if (!snapshot) return context;
  const payload = payloadOf(snapshot);
  assertSchema(payload);
  const type = snapshot.document_type
    || payload.schema_version.replace('-snapshot.v1', '');

  context.meta.backend.documentSnapshotId = snapshot.id ?? null;
  context.meta.backend.documentType = type;
  context.meta.backend.documentVersion = snapshot.version ?? null;

  if (type === 'contract') {
    const contract = payload.contract || {};
    context.contract = {
      id: contract.id,
      number: contract.number,
      date: contract.contract_date,
      start_date: contract.start_date,
      end_date: contract.end_date,
      client: contract.customer?.name || context.project.client_name,
      client_name: contract.customer?.name || context.project.client_name,
      client_type: contract.customer?.client_type === 'company' ? 'company' : 'individual',
      amount: toNumber(contract.total_amount),
      status: contract.status,
    };
  } else if (type === 'ks2') {
    const ks2 = payload.ks2 || {};
    context.ks2 = ks2;
    context.execution.completedWorks = (ks2.rows || []).map((row) => ({
      id: row.source_row_id,
      name: row.name,
      unit: row.unit,
      quantity: toNumber(row.quantity_done),
      total: toNumber(row.total),
      code: row.justification || '',
    }));
    context.estimate.total_cost = toNumber(ks2.total_without_vat);
    context.estimate.total_without_vat = toNumber(ks2.total_without_vat);
    context.estimate.vat_cost = toNumber(ks2.vat_amount);
    context.estimate.total_vat = toNumber(ks2.vat_amount);
    context.estimate.total_with_vat = toNumber(ks2.total_with_vat);
  } else if (type === 'ks3') {
    const ks3 = payload.ks3 || {};
    context.ks3 = {
      ...ks3,
      total_contract: toNumber(ks3.total_contract),
      total_from_start: toNumber(ks3.total_from_start),
      total_current_period: toNumber(ks3.total_current_period),
      vat_amount: toNumber(ks3.vat_amount),
      total_with_vat: toNumber(ks3.total_with_vat),
    };
    context.estimate.total_cost = toNumber(ks3.total_current_period);
    context.estimate.total_without_vat = toNumber(ks3.total_current_period);
    context.estimate.vat_cost = toNumber(ks3.vat_amount);
    context.estimate.total_vat = toNumber(ks3.vat_amount);
    context.estimate.total_with_vat = toNumber(ks3.total_with_vat);
  } else if (type === 'm29') {
    const m29 = payload.m29 || {};
    const rows = (m29.rows || []).map((row) => ({
      id: row.source_row_id,
      name: row.name,
      unit: row.unit,
      totalQty: toNumber(row.normative_quantity),
      normativeCost: toNumber(row.normative_cost),
      actualQty: toNumber(row.actual_quantity),
      actualCost: toNumber(row.actual_cost),
      costDeviation: toNumber(row.cost_deviation),
      deviationReason: row.deviation_reason || '',
      price: toNumber(row.normative_quantity)
        ? toNumber(row.normative_cost) / toNumber(row.normative_quantity)
        : 0,
      total: toNumber(row.actual_cost),
    }));
    context.m29 = { ...m29, rows };
    context.materials = {
      items: rows,
      summary: {
        totalAmount: toNumber(m29.total_actual_cost),
        totalItems: rows.length,
      },
    };
  }
  return context;
}

function adaptBackendSnapshot({ estimateRevision, documentSnapshot } = {}) {
  if (!estimateRevision) {
    throw new Error('Backend estimate revision is required');
  }
  return applyDocumentSnapshot(
    buildEstimateContext(estimateRevision),
    documentSnapshot,
  );
}

module.exports = {
  SUPPORTED_SCHEMAS,
  adaptBackendSnapshot,
};
