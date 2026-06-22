const test = require('node:test');
const assert = require('node:assert/strict');

const { buildDocumentContext, generateDocument } = require('../src/document-kernel');
const {
  prepareWordTemplateDocument,
  generateDocxFromKernel,
  prepareRendererDocument,
} = require('../src/document-template-adapters');

function createFakeDb(overrides = {}) {
  const estimate = {
    id: 7,
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
    ...(overrides.estimate || {}),
  };

  const project = {
    id: 11,
    name: 'Квартира 145',
    client_name: 'Вера',
    address: 'Калинина 108 кв.145',
    folder_path: 'C:/Projects/Client',
    start_date: '2026-04-05T00:00:00.000Z',
    end_date: '2026-04-30T00:00:00.000Z',
    ...(overrides.project || {}),
  };

  const contract = {
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
    ...(overrides.contract || {}),
  };

  return {
    getEstimate: (id) => ({
      ...estimate,
      id,
    }),
    getProject: () => project,
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
    getContract: () => contract,
  };
}

function createHelpers() {
  return {
    formatAmount: (value) => Number(value || 0).toFixed(2),
    formatShortName: (fullName) => {
      const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
      if (parts.length >= 3) {
        return `${parts[0]} ${parts[1][0]}.${parts[2][0]}.`;
      }
      if (parts.length === 2) {
        return `${parts[0]} ${parts[1][0]}.`;
      }
      return String(fullName || '');
    },
    templates: {
      formatDateForDoc: (dateStr) => String(dateStr || '').slice(0, 10),
      numberToWords: (value) => `WORDS:${Number(value || 0).toFixed(2)}`,
    },
  };
}

test('prepareWordTemplateDocument maps contract kernel data into existing Word placeholders', () => {
  const context = buildDocumentContext(createFakeDb(), 7, { contractId: 51 });
  const prepared = prepareWordTemplateDocument({
    type: 'contract',
    context,
    helpers: createHelpers(),
  });

  assert.equal(prepared.templateId, 'contract-individual');
  assert.equal(prepared.document.totals.contractAmount, 2880);
  assert.equal(prepared.data['номер договора'], 'Д-001');
  assert.equal(prepared.data['цена договора'], '2880.00');
  assert.equal(prepared.data['информация о НДС'], 'В том числе НДС 20%: 480.00 руб.');
});

test('prepareWordTemplateDocument maps commercial offer kernel data into bookmark placeholders', () => {
  const context = buildDocumentContext(createFakeDb(), 7, { contractId: 51 });
  const prepared = prepareWordTemplateDocument({
    type: 'commercial_offer',
    context,
    helpers: createHelpers(),
  });

  assert.equal(prepared.templateId, 'commercial-offer');
  assert.equal(prepared.data['@bookmark:FullPrice'], '2880.00');
  assert.equal(prepared.data['@bookmark:StoimostRabot'], '1500.00');
  assert.equal(prepared.data['@bookmark:StoimostMaterialov'], '900.00');
  assert.match(prepared.data['наименование работ'], /Штукатурка стен/);
});

test('prepareWordTemplateDocument maps additional agreement kernel data into the current template contract', () => {
  const context = buildDocumentContext(createFakeDb(), 7, { contractId: 51 });
  const prepared = prepareWordTemplateDocument({
    type: 'additional_agreement',
    context,
    options: {
      agreementType: 'additional',
      agreementData: {
        number: 'ДС-1',
        amount: 500,
        subject: 'Дополнительные работы',
      },
    },
    helpers: createHelpers(),
  });

  assert.equal(prepared.templateId, 'additional-individual');
  assert.equal(prepared.document.totals.resultingContractTotal, 3380);
  assert.equal(prepared.data['номер доп. согл.'], 'ДС-1');
  assert.equal(prepared.data['цена доп. согл.'], '500.00');
  assert.equal(prepared.data['цена договора'], '3380.00');
});

test('prepareWordTemplateDocument derives additional agreement delta from estimate and switches templates by type', () => {
  const context = buildDocumentContext(
    createFakeDb({
      estimate: {
        total_with_vat: 3600,
      },
      contract: {
        amount: 3000,
        client_type: 'company',
      },
    }),
    7,
    { contractId: 51 }
  );

  const prepared = prepareWordTemplateDocument({
    type: 'additional_agreement',
    context,
    options: {
      agreementType: 'replacement',
      agreementData: {
        number: 'ДС-2',
      },
    },
    helpers: createHelpers(),
  });

  assert.equal(prepared.templateId, 'replacement-company');
  assert.equal(prepared.document.totals.deltaAmount, 600);
  assert.equal(prepared.document.totals.resultingContractTotal, 3600);
  assert.equal(prepared.data['цена доп. согл.'], '600.00');
  assert.equal(prepared.data['цена договора'], '3600.00');
});

test('prepareWordTemplateDocument exposes semantic agreement texts for decrease and no_change cases', () => {
  const decreaseContext = buildDocumentContext(
    createFakeDb({
      estimate: {
        total_with_vat: 2500,
      },
      contract: {
        amount: 3000,
      },
    }),
    7,
    { contractId: 51 }
  );

  const decreasePrepared = prepareWordTemplateDocument({
    type: 'additional_agreement',
    context: decreaseContext,
    options: {
      agreementType: 'replacement',
      agreementData: {
        number: 'ДС-3',
      },
    },
    helpers: createHelpers(),
  });

  assert.equal(decreasePrepared.document.meta.deltaDirection, 'decrease');
  assert.equal(decreasePrepared.data['цена доп. согл.'], '500.00');
  assert.equal(decreasePrepared.data['тип изменения стоимости'], 'Уменьшение стоимости');
  assert.match(decreasePrepared.data['текст изменения стоимости'], /уменьшена на 500\.00 руб\./);

  const noChangeContext = buildDocumentContext(createFakeDb(), 7, { contractId: 51 });
  const noChangePrepared = prepareWordTemplateDocument({
    type: 'additional_agreement',
    context: noChangeContext,
    options: {
      agreementType: 'additional',
      agreementData: {
        number: 'ДС-4',
        amount: 0,
      },
    },
    helpers: createHelpers(),
  });

  assert.equal(noChangePrepared.document.meta.deltaDirection, 'no_change');
  assert.equal(noChangePrepared.data['тип изменения стоимости'], 'Стоимость без изменений');
  assert.match(noChangePrepared.data['текст изменения стоимости'], /не изменена/);
});

test('generateDocxFromKernel delegates the prepared mapping into the existing word runtime', () => {
  const context = buildDocumentContext(createFakeDb(), 7, { contractId: 51 });
  const calls = [];
  const runtime = {
    generateFromWordTemplate: (templateId, data, outputPath) => {
      calls.push({ templateId, data, outputPath });
      return outputPath;
    },
  };

  const result = generateDocxFromKernel({
    type: 'contract',
    context,
    outputPath: 'C:/Docs/contract.docx',
    helpers: createHelpers(),
    templateRuntime: runtime,
  });

  assert.equal(result.path, 'C:/Docs/contract.docx');
  assert.equal(result.templateId, 'contract-individual');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].templateId, 'contract-individual');
  assert.equal(calls[0].data['номер договора'], 'Д-001');
});

test('prepareRendererDocument maps ks2 and ks3 without modifying financial totals', () => {
  const context = buildDocumentContext(createFakeDb(), 7, { contractId: 51 });
  const rawKs2 = generateDocument({ type: 'ks2', context });
  const rawKs3 = generateDocument({ type: 'ks3', context });

  const ks2Prepared = prepareRendererDocument({
    type: 'ks2',
    context,
    source: {
      act: { id: 77, number: 'КС2-001', estimate_id: 7, project_id: 11 },
    },
    helpers: createHelpers(),
  });

  const ks3Prepared = prepareRendererDocument({
    type: 'ks3',
    context,
    source: {
      cert: { id: 88, number: 'КС3-001', estimate_number: 'ЛС-001', project_id: 11 },
    },
    helpers: createHelpers(),
  });

  assert.equal(ks2Prepared.document.totals.totalWithVat, rawKs2.totals.totalWithVat);
  assert.equal(ks3Prepared.document.totals.payable, rawKs3.totals.payable);
  assert.equal(ks2Prepared.model.totalWithVat, '2880.00');
  assert.equal(ks3Prepared.model.payable, '2880.00');
});

test('prepareRendererDocument maps fot and materials_request into stable renderer models', () => {
  const context = buildDocumentContext(createFakeDb(), 7, { contractId: 51 });

  const fotPrepared = prepareRendererDocument({
    type: 'fot',
    context,
    helpers: createHelpers(),
  });

  const materialsPrepared = prepareRendererDocument({
    type: 'materials_request',
    context,
    helpers: createHelpers(),
  });

  assert.equal(fotPrepared.model.total, '1500.00');
  assert.equal(fotPrepared.model.items[0].name, 'Штукатурка стен');
  assert.equal(materialsPrepared.model.total, '916.00');
  assert.equal(materialsPrepared.model.items.length, 2);
  assert.equal(materialsPrepared.model.items[0].qty, '6.00');
});
