const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');

const clientFacingFiles = [
  'frontend/src/pages/Purchase.tsx',
  'frontend/src/components/AddItemModal.tsx',
  'docs/client/getting_started.md',
  'docs/client/README.txt',
  'desktop/src/documents.js',
];

const forbiddenPatterns = [
  { pattern: /Гарантия возврата 14 дней/i, label: 'refund-badge' },
  { pattern: /Смета 2007/i, label: 'smeta-2007-text' },
  { pattern: /МДС 81-34\.2007/i, label: '2007-placeholder' },
];

const visibleResourceRoots = [
  'desktop/db/DocTemplates',
  'desktop/templates',
];

test('client-facing copy no longer mentions refund promises or "Смета 2007"', () => {
  for (const relativeFile of clientFacingFiles) {
    const filePath = path.join(repoRoot, relativeFile);
    const content = fs.readFileSync(filePath, 'utf8');

    for (const { pattern, label } of forbiddenPatterns) {
      assert.equal(
        pattern.test(content),
        false,
        `${label} still present in ${relativeFile}`
      );
    }
  }
});

test('visible packaged resource names do not expose legacy 2007 branding', () => {
  const forbiddenNamePattern = /(smeta2007|2007)/i;

  for (const relativeRoot of visibleResourceRoots) {
    const rootPath = path.join(repoRoot, relativeRoot);
    const queue = [rootPath];

    while (queue.length > 0) {
      const currentPath = queue.pop();
      for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
        const absolutePath = path.join(currentPath, entry.name);
        if (entry.isDirectory()) {
          queue.push(absolutePath);
        }

        assert.equal(
          forbiddenNamePattern.test(entry.name),
          false,
          `legacy resource name still visible: ${path.relative(repoRoot, absolutePath)}`
        );
      }
    }
  }
});
