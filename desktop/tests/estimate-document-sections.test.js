const test = require('node:test');
const assert = require('node:assert/strict');

const { generateEstimateHTML } = require('../src/documents');

function createEstimateFixture() {
  return {
    estimate: {
      id: 7,
      number: 'ЛС-001',
      name: 'Ремонт квартиры',
      date: '2026-04-04T00:00:00.000Z',
      total_with_vat: 1200,
      total_cost: 1000,
      client_name: 'Вера',
      contract_number: 'Д-001',
    },
    items: [
      {
        id: 101,
        section_id: 22,
        name: 'Штукатурка стен',
        unit: 'м2',
        quantity: 10,
        row_type: 'rascenka',
        labor_price: 100,
        material_price: 0,
      },
    ],
    sections: [
      { id: 22, name: 'Ванная' },
    ],
    project: {
      name: 'Квартира 145',
      client_name: 'Вера',
      address: 'Калинина 108',
    },
    companyInfo: {
      name: 'СК Афина',
    },
  };
}

test('generateEstimateHTML uses provided section list instead of falling back to generic section title', () => {
  const { estimate, items, sections, project, companyInfo } = createEstimateFixture();

  const html = generateEstimateHTML(estimate, items, project, companyInfo, sections);

  assert.match(html, /Раздел 1\. Ванная/);
  assert.doesNotMatch(html, /Раздел 1\. Раздел 1/);
});
