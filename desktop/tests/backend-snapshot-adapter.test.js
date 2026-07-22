const test = require('node:test');
const assert = require('node:assert/strict');

const {
  adaptBackendSnapshot,
} = require('../src/main/backend-snapshot-adapter');
const {
  buildPackageDefaults,
  normalizePackageContext,
} = require('../src/main/document-package');


function estimateRevision() {
  return {
    id: 11,
    revision_number: 1,
    payload_hash: 'revision-hash',
    payload_json: {
      schema_version: 'estimate-snapshot.v1',
      calculation_schema_version: 'smeta-2007.v1',
      estimate: { id: 7, number: 'ЛС-001', name: 'Ремонт', status: 'approved' },
      project: { id: 5, code: 'PRJ-5', name: 'Школа' },
      object: { id: 8, code: 'OBJ-8', name: 'Корпус', address: 'ул. Школьная, 1' },
      parties: {
        customer: { id: 3, name: 'ООО Заказчик', client_type: 'company' },
        contractor: { id: 1, name: 'ООО Подрядчик' },
      },
      coefficients: { work: '1.8', material: '1.04' },
      vat: { percent: '20', on_top: true, amount: '300' },
      totals: {
        labor: '1000', materials: '500', machines: '0',
        total_without_vat: '1500', total_with_vat: '1800',
      },
      sections: [{ source_id: 21, number: '1', name: 'Работы', order_index: 1, total: '1500' }],
      rows: [
        {
          source_id: 31, section_source_id: 21, item_number: '1',
          justification: 'ФЕР-1', name: 'Монтаж', unit: 'м2', quantity: '10',
          row_type: 'pr', labor_unit_price: '100', materials_unit_price: '0',
          labor_total: '1000', materials_total: '0', machines_total: '0', total: '1000',
        },
        {
          source_id: 32, section_source_id: 21, item_number: '2',
          justification: 'МАТ-1', name: 'Листы ГКЛ', unit: 'лист', quantity: '5',
          row_type: 'mat', labor_unit_price: '0', materials_unit_price: '100',
          labor_total: '0', materials_total: '500', machines_total: '0', total: '500',
        },
      ],
    },
  };
}


function snapshot(documentType, payload) {
  return {
    id: 50,
    document_type: documentType,
    entity_id: 70,
    version: 1,
    status: 'draft',
    payload_json: payload,
  };
}


test('estimate revision maps to the existing DocumentContext contract', () => {
  const context = adaptBackendSnapshot({ estimateRevision: estimateRevision() });

  assert.equal(context.estimate.id, 7);
  assert.equal(context.estimate.total_with_vat, 1800);
  assert.equal(context.project.name, 'Школа');
  assert.equal(context.project.address, 'ул. Школьная, 1');
  assert.equal(context.companyInfo.name, 'ООО Подрядчик');
  assert.equal(context.items[0].id, 31);
  assert.equal(context.items[1].material_price, 100);
  assert.equal(context.materials.items.length, 1);
  assert.equal(context.labor.summary.totalAmount, 1000);
  assert.equal(context.meta.backend.revisionHash, 'revision-hash');
});


test('contract snapshot maps exact frozen contract fields', () => {
  const context = adaptBackendSnapshot({
    estimateRevision: estimateRevision(),
    documentSnapshot: snapshot('contract', {
      schema_version: 'contract-snapshot.v1',
      contract: {
        id: 70, number: 'Д-001', contract_date: '2026-07-22',
        type: 'legal_entity', status: 'draft', total_amount: '1800',
        customer: { name: 'ООО Заказчик', client_type: 'company' },
      },
    }),
  });

  assert.equal(context.contract.id, 70);
  assert.equal(context.contract.number, 'Д-001');
  assert.equal(context.contract.client, 'ООО Заказчик');
  assert.equal(context.contract.amount, 1800);
});


test('KS-2 and KS-3 snapshots preserve period totals for existing renderers', () => {
  const ks2Context = adaptBackendSnapshot({
    estimateRevision: estimateRevision(),
    documentSnapshot: snapshot('ks2', {
      schema_version: 'ks2-snapshot.v1',
      ks2: {
        id: 71, number: 'КС2-1', status: 'signed',
        total_without_vat: '400', vat_amount: '80', total_with_vat: '480',
        rows: [{
          source_row_id: 31, name: 'Монтаж', unit: 'м2',
          quantity_done: '4', unit_price: '100', total: '400',
        }],
      },
    }),
  });
  assert.equal(ks2Context.execution.completedWorks[0].quantity, 4);
  assert.equal(ks2Context.estimate.total_with_vat, 480);

  const ks3Context = adaptBackendSnapshot({
    estimateRevision: estimateRevision(),
    documentSnapshot: snapshot('ks3', {
      schema_version: 'ks3-snapshot.v1',
      ks3: {
        id: 72, number: 'КС3-1', status: 'draft',
        total_current_period: '400', vat_amount: '80', total_with_vat: '480',
        total_from_start: '700', ks2_ids: [71],
      },
    }),
  });
  assert.equal(ks3Context.ks3.total_from_start, 700);
  assert.equal(ks3Context.estimate.total_cost, 400);
  assert.equal(ks3Context.estimate.total_with_vat, 480);
});


test('M-29 snapshot exposes material-only rows and package adapter accepts backend bundle', () => {
  const bundle = {
    backendRevision: estimateRevision(),
    backendDocument: snapshot('m29', {
      schema_version: 'm29-snapshot.v1',
      m29: {
        id: 73, report_number: 'М29-1', status: 'draft',
        total_norm_cost: '500', total_actual_cost: '630',
        rows: [{
          source_row_id: 32, name: 'Листы ГКЛ', unit: 'лист',
          normative_quantity: '5', normative_cost: '500',
          actual_quantity: '6', actual_cost: '630', cost_deviation: '130',
        }],
      },
    }),
  };
  const context = normalizePackageContext(bundle);
  const defaults = buildPackageDefaults(context, '2026-07-22');

  assert.equal(context.m29.rows.length, 1);
  assert.equal(context.materials.items[0].actualCost, 630);
  assert.equal(defaults.contract.amount, 1800);
});


test('adapter rejects unsupported backend schema versions', () => {
  const revision = estimateRevision();
  revision.payload_json.schema_version = 'estimate-snapshot.v99';
  assert.throws(
    () => adaptBackendSnapshot({ estimateRevision: revision }),
    /Unsupported backend snapshot schema/,
  );
});
