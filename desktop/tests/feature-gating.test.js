const test = require('node:test');
const assert = require('node:assert/strict');

const { canCreateEstimate, canUsePdfExport } = require('../src/main/license-manager');

test('demo mode keeps pdf export available inside the free estimate tier', () => {
  const result = canUsePdfExport({ mode: 'DEMO' });
  assert.equal(result.allowed, true);
});

test('demo mode allows up to five free estimates and then asks for a license', () => {
  const result = canCreateEstimate({ mode: 'DEMO', estimatesCount: 5 });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /приобретите лицензию/i);
});
