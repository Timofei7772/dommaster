const test = require('node:test');
const assert = require('node:assert/strict');

const { getEstimateContext } = require('../src/document-context');

test('getEstimateContext returns a normalized document context for the hidden document kernel', () => {
  const fakeDb = {
    getEstimate: (id) => ({
      id,
      project_id: 11,
      number: 'ЛС-001',
      name: 'Ремонт квартиры',
      status: 'draft',
      created_at: '2026-04-02T08:00:00.000Z',
      updated_at: '2026-04-02T10:00:00.000Z',
      total_materials: 900,
      total_works: 1500,
      total_with_vat: 2880,
    }),
    getProject: () => ({
      id: 11,
      name: 'Квартира 145',
      client_name: 'Вера',
      address: 'Калинина 108 кв.145',
      folder_path: 'C:/Projects/Client',
    }),
    getEstimateItems: () => ([
      {
        id: 1,
        name: 'Штукатурка стен',
        unit: 'м2',
        quantity: 10,
        row_type: 'rascenka',
        labor_price: 150,
        material_price: 0,
      },
      {
        id: 2,
        name: 'Штукатурная смесь',
        unit: 'мешок',
        quantity: 6,
        row_type: 'material',
        labor_price: 0,
        material_price: 150,
      },
    ]),
    getEstimateSections: () => ([
      { id: 21, name: 'Ванная', sort_order: 0 },
    ]),
    getCoefficients: () => ({
      work_coef: 1.8,
      material_coef: 1.04,
    }),
    getAllSettings: () => ({
      company: JSON.stringify({
        name: 'СК Афина',
        inn: '6677000000',
      }),
    }),
    getDataPath: () => 'C:/Data',
  };

  const context = getEstimateContext(fakeDb, 7);

  assert.equal(context.estimate.number, 'ЛС-001');
  assert.equal(context.project?.name, 'Квартира 145');
  assert.equal(context.contract, null);
  assert.equal(context.folderPath, 'C:/Projects/Client');

  assert.equal(context.meta.version, 1);
  assert.equal(context.meta.updatedAt, '2026-04-02T10:00:00.000Z');
  assert.match(context.meta.createdAt, /^\d{4}-\d{2}-\d{2}T/);

  assert.equal(Array.isArray(context.execution.completedWorks), true);
  assert.equal(context.execution.completedWorks.length, 1);
  assert.equal(context.execution.completedWorks[0].name, 'Штукатурка стен');

  assert.equal(context.labor.summary.totalAmount, 1500);
  assert.equal(context.materials.summary.totalAmount, 900);
  assert.equal(context.materials.summary.totalItems, 1);

  assert.equal(context.companyInfo.name, 'СК Афина');
  assert.equal(context.documentTypes.includes('ks2'), true);
  assert.equal(context.additionalAgreementTypes.includes('replacement'), true);
});
