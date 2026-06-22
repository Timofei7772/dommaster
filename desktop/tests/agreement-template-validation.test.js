const test = require('node:test');
const assert = require('node:assert/strict');

const { inspectWordTemplatePlaceholders } = require('../src/templates');

const agreementTemplateIds = [
  'additional-individual',
  'additional-company',
  'independent-individual',
  'independent-company',
  'replacement-individual',
  'replacement-company',
];

for (const templateId of agreementTemplateIds) {
  test(`${templateId} uses exactly one semantic delta placeholder and no legacy cost placeholders`, () => {
    const result = inspectWordTemplatePlaceholders(templateId, {
      requiredFields: ['текст изменения стоимости'],
      forbiddenFields: ['цена доп. согл.', 'увеличение стоимости', 'уменьшение стоимости'],
    });

    assert.equal(result.exists, true);
    assert.deepEqual(result.missingFields, []);
    assert.deepEqual(result.forbiddenFieldsPresent, []);
    assert.equal(result.fieldCounts['текст изменения стоимости'], 1);
  });
}
