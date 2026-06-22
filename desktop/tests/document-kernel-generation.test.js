const test = require('node:test');
const assert = require('node:assert/strict');

const { buildDocumentContext, generateDocument } = require('../src/document-kernel');

function createFakeDb() {
  return {
    getEstimate: (id) => ({
      id,
      project_id: 11,
      number: 'ЛС-001',
      name: 'Ремонт квартиры',
      status: 'draft',
      created_at: '2026-04-02T08:00:00.000Z',
      updated_at: '2026-04-02T10:00:00.000Z',
      total_materials: 900,
      total_labor: 1500,
      subtotal: 2400,
      vat_percent: 20,
      total_with_vat: 2880,
      client_name: 'Вера',
    }),
    getProject: () => ({
      id: 11,
      name: 'Квартира 145',
      client_name: 'Вера',
      address: 'Калинина 108 кв.145',
      folder_path: 'C:/Projects/Client',
      start_date: '2026-04-05T00:00:00.000Z',
      end_date: '2026-04-30T00:00:00.000Z',
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
        section_name: 'Ванная',
        code: 'W-001',
      },
      {
        id: 2,
        name: 'Штукатурная смесь',
        unit: 'мешок',
        quantity: 6,
        row_type: 'material',
        labor_price: 0,
        material_price: 150,
        section_name: 'Ванная',
        code: 'M-001',
      },
    ]),
    getEstimateItemMaterials: (itemId) => {
      if (itemId !== 1) return [];
      return [
        {
          name: 'Штукатурная смесь',
          unit: 'мешок',
          quantity: 0.6,
          price: 150,
        },
        {
          name: 'Грунтовка',
          unit: 'л',
          quantity: 0.02,
          price: 80,
        },
      ];
    },
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
        fullName: 'ООО «СК Афина»',
        director: 'Иванов Иван Иванович',
        directorPosition: 'Генеральный директор',
        address: 'г. Екатеринбург, ул. Пример, 1',
        phone: '+7 900 000-00-00',
        email: 'sales@example.com',
        inn: '6677000000',
        kpp: '667700001',
        ogrn: '1234567890123',
        checkingAccount: '40702810000000000001',
        bankName: 'ПАО Банк',
        bik: '046577001',
        correspondentAccount: '30101810000000000001',
      }),
      estimates: {
        vatEnabled: true,
        vatRate: 20,
      },
    }),
    getDataPath: () => 'C:/Data',
    getContract: () => ({
      id: 51,
      project_id: 11,
      estimate_id: 7,
      number: 'Д-001',
      date: '2026-04-02T00:00:00.000Z',
      start_date: '2026-04-05T00:00:00.000Z',
      end_date: '2026-04-30T00:00:00.000Z',
      amount: 2880,
      client_name: 'Вера',
      client_type: 'individual',
      subject: 'Ремонт квартиры',
    }),
  };
}

test('generateDocument keeps estimate, contract, ks2, ks3 and commercial offer totals consistent', () => {
  const context = buildDocumentContext(createFakeDb(), 7, { contractId: 51 });

  const estimateDoc = generateDocument({ type: 'estimate', context });
  const contractDoc = generateDocument({ type: 'contract', context });
  const ks2Doc = generateDocument({ type: 'ks2', context });
  const ks3Doc = generateDocument({ type: 'ks3', context });
  const offerDoc = generateDocument({ type: 'commercial_offer', context });

  assert.equal(estimateDoc.totals.grandTotal, 2880);
  assert.equal(contractDoc.totals.grandTotal, estimateDoc.totals.grandTotal);
  assert.equal(ks2Doc.totals.grandTotal, estimateDoc.totals.grandTotal);
  assert.equal(ks3Doc.totals.grandTotal, estimateDoc.totals.grandTotal);
  assert.equal(offerDoc.totals.grandTotal, estimateDoc.totals.grandTotal);
  assert.equal(ks2Doc.totals.currentPeriodTotal, ks3Doc.totals.currentPeriodTotal);
});

test('generateDocument keeps ks2, ks3, fot and materials_request in a single financial model', () => {
  const context = buildDocumentContext(createFakeDb(), 7, { contractId: 51 });

  const estimateDoc = generateDocument({ type: 'estimate', context });
  const ks2Doc = generateDocument({ type: 'ks2', context });
  const ks3Doc = generateDocument({ type: 'ks3', context });
  const fotDoc = generateDocument({ type: 'fot', context });
  const materialsDoc = generateDocument({ type: 'materials_request', context });

  assert.equal(ks3Doc.totals.estimateTotal, estimateDoc.totals.grandTotal);
  assert.equal(ks2Doc.totals.totalWithVat, ks3Doc.totals.payable);
  assert.equal(fotDoc.totals.totalAmount, 1500);
  assert.equal(materialsDoc.totals.totalItems, 2);
  assert.equal(materialsDoc.rows[0].name, 'Штукатурная смесь');
  assert.equal(materialsDoc.rows[0].totalQty, 6);
  assert.equal(materialsDoc.rows[0].total, 900);
});

test('generateDocument is idempotent for the same normalized context', () => {
  const context = buildDocumentContext(createFakeDb(), 7, { contractId: 51 });

  const first = generateDocument({ type: 'estimate', context });
  const second = generateDocument({ type: 'estimate', context });

  assert.deepEqual(first, second);
});

test('generateDocument supports all hidden additional agreement variants through one API', () => {
  const context = buildDocumentContext(createFakeDb(), 7, { contractId: 51 });

  const additional = generateDocument({
    type: 'additional_agreement',
    context,
    options: {
      agreementType: 'additional',
      agreementData: { number: 'ДС-1', amount: 500, subject: 'Дополнительные работы' },
    },
  });

  const independent = generateDocument({
    type: 'additional_agreement',
    context,
    options: {
      agreementType: 'independent',
      agreementData: { number: 'ДС-2', amount: 800, subject: 'Отдельный этап' },
    },
  });

  const replacement = generateDocument({
    type: 'additional_agreement',
    context,
    options: {
      agreementType: 'replacement',
      agreementData: { number: 'ДС-3', amount: 300, subject: 'Замена материалов' },
    },
  });

  assert.equal(additional.meta.agreementType, 'additional');
  assert.equal(independent.meta.agreementType, 'independent');
  assert.equal(replacement.meta.agreementType, 'replacement');
  assert.equal(additional.totals.resultingContractTotal, 3380);
  assert.equal(independent.totals.resultingContractTotal, 3680);
  assert.equal(replacement.totals.resultingContractTotal, 3180);
});

test('generateDocument classifies additional agreement delta semantics for increase, decrease and no_change', () => {
  const increaseDb = createFakeDb();
  increaseDb.getEstimate = (id) => ({
    ...createFakeDb().getEstimate(id),
    total_with_vat: 3200,
  });
  const increaseContext = buildDocumentContext(increaseDb, 7, { contractId: 51 });
  const increase = generateDocument({
    type: 'additional_agreement',
    context: increaseContext,
    options: {
      agreementType: 'additional',
    },
  });

  const decreaseDb = createFakeDb();
  decreaseDb.getEstimate = (id) => ({
    ...createFakeDb().getEstimate(id),
    total_with_vat: 2500,
  });
  const decreaseContext = buildDocumentContext(decreaseDb, 7, { contractId: 51 });
  const decrease = generateDocument({
    type: 'additional_agreement',
    context: decreaseContext,
    options: {
      agreementType: 'replacement',
    },
  });

  const noChangeContext = buildDocumentContext(createFakeDb(), 7, { contractId: 51 });
  const noChange = generateDocument({
    type: 'additional_agreement',
    context: noChangeContext,
    options: {
      agreementType: 'independent',
      agreementData: { amount: 0 },
    },
  });

  assert.equal(increase.meta.deltaDirection, 'increase');
  assert.equal(increase.totals.deltaAmount, 320);
  assert.equal(increase.totals.deltaAbsAmount, 320);
  assert.equal(increase.totals.resultingContractTotal, 3200);

  assert.equal(decrease.meta.deltaDirection, 'decrease');
  assert.equal(decrease.totals.deltaAmount, -380);
  assert.equal(decrease.totals.deltaAbsAmount, 380);
  assert.equal(decrease.totals.resultingContractTotal, 2500);

  assert.equal(noChange.meta.deltaDirection, 'no_change');
  assert.equal(noChange.totals.deltaAmount, 0);
  assert.equal(noChange.totals.deltaAbsAmount, 0);
});
