const test = require('node:test');
const assert = require('node:assert/strict');

const { buildCommercialOfferData } = require('../src/commercial-offer');
const { replaceBookmarkPlaceholdersInXml } = require('../src/word-template-utils');
const { resolveCatalogImportPaths } = require('../src/catalog-bootstrap');

function formatAmount(value) {
  return new Intl.NumberFormat('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function formatShortName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 3) {
    return `${parts[0]} ${parts[1][0]}.${parts[2][0]}.`;
  }
  if (parts.length === 2) {
    return `${parts[0]} ${parts[1][0]}.`;
  }
  return String(fullName || '');
}

test('buildCommercialOfferData creates detailed works list and distinct totals for KP bookmarks', () => {
  const data = buildCommercialOfferData({
    estimate: {
      number: '42/1',
      name: 'Ремонт квартиры',
      client_name: 'ООО Ромашка',
      total_labor: 35000,
      total_materials: 15000,
      total_with_vat: 60000,
      vat_percent: 20,
    },
    items: [
      { name: 'Штукатурка стен', quantity: 10, unit: 'м²', labor_price: 2000, material_price: 500, section_name: 'Стены' },
      { name: 'Покраска потолка', quantity: 5, unit: 'м²', labor_price: 1000, material_price: 300, section_name: 'Потолок' },
    ],
    project: {
      client_name: 'ООО Ромашка',
      start_date: '2026-03-27T00:00:00.000Z',
      end_date: '2026-04-30T00:00:00.000Z',
    },
    settings: {
      estimates: {
        vatEnabled: true,
        vatRate: 20,
      },
    },
    company: {
      name: 'ZARU',
      fullName: 'ООО «ЗАРУ»',
      address: 'г. Екатеринбург, ул. Пример, 1',
      phone: '+7 900 000-00-00',
      email: 'sales@example.com',
      website: 'https://example.com',
      inn: '1234567890',
      kpp: '123456789',
      ogrn: '1234567890123',
      checkingAccount: '40702810000000000001',
      bankName: 'ПАО Банк',
      bik: '046577001',
      correspondentAccount: '30101810000000000001',
      director: 'Иванов Иван Иванович',
      directorPosition: 'Генеральный директор',
    },
    templates: {
      formatDateForDoc: (dateStr) => new Date(dateStr).toISOString().slice(0, 10),
      numberToWords: () => 'шестьдесят тысяч рублей 00 копеек',
    },
    formatAmount,
    formatShortName,
    now: new Date('2026-03-27T00:00:00.000Z'),
  });

  assert.match(data['наименование работ'], /Штукатурка стен/);
  assert.match(data['наименование работ'], /Покраска потолка/);
  assert.match(data['наименование работ'], /Стены:/);
  assert.equal(data['@bookmark:FullPrice'], '60 000,00');
  assert.equal(data['@bookmark:StoimostRabot'], '35 000,00');
  assert.equal(data['@bookmark:StoimostMaterialov'], '15 000,00');
  assert.equal(data['@bookmark:CustomerName'], 'ООО Ромашка');
});

test('replaceBookmarkPlaceholdersInXml supports duplicate visible placeholders via bookmark names', () => {
  const xml = [
    '<w:p>',
    '<w:bookmarkStart w:id="12" w:name="FullPrice"/>',
    '<w:r><w:t>[__________]</w:t></w:r>',
    '<w:bookmarkEnd w:id="12"/>',
    '</w:p>',
    '<w:p>',
    '<w:bookmarkStart w:id="13" w:name="StoimostRabot"/>',
    '<w:r><w:t>[__________]</w:t></w:r>',
    '<w:bookmarkEnd w:id="13"/>',
    '</w:p>',
  ].join('');

  const result = replaceBookmarkPlaceholdersInXml(xml, {
    FullPrice: '60 000,00',
    StoimostRabot: '35 000,00',
  });

  assert.match(result, /60 000,00/);
  assert.match(result, /35 000,00/);
  assert.equal(result.includes('[__________]'), false);
});

test('resolveCatalogImportPaths falls back to packaged starter-db when db catalog is unavailable', () => {
  const paths = resolveCatalogImportPaths({
    isPackaged: true,
    resourcesPath: 'C:/App/resources',
    moduleDir: 'C:/Projects/SmetaAI/desktop/src',
    existsSync: (candidate) => candidate === 'C:/App/resources/starter-db/full/catalog.json'
      || candidate === 'C:/App/resources/starter-db/quick/catalog_simple.json'
      || candidate === 'C:/App/resources/starter-db/full/regions.json',
  });

  assert.equal(paths.baseCatalogPath, 'C:/App/resources/starter-db/full/catalog.json');
  assert.equal(paths.simpleCatalogPath, 'C:/App/resources/starter-db/quick/catalog_simple.json');
  assert.equal(paths.regionsPath, 'C:/App/resources/starter-db/full/regions.json');
});
