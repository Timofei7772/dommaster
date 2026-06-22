const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { generateDocumentPackage } = require('../src/main/document-package');

const createContext = () => ({
  estimate: {
    id: 10,
    number: 'ИМП-42',
    name: 'Тестовая смета',
    project_id: 5,
    client_name: 'Заказчик',
    address: 'Екатеринбург',
    total_with_vat: 120000,
    total_cost: 100000,
    total_without_vat: 100000,
    total_vat: 20000,
  },
  project: {
    id: 5,
    name: 'Тестовый объект',
    address: 'Екатеринбург',
    folder_path: 'C:/Projects/Test',
  },
  items: [
    { id: 1, name: 'Штукатурка', quantity: 10, total: 50000 },
  ],
});

test('generateDocumentPackage creates the full document package and keeps going on partial errors', async () => {
  const calls = [];

  const result = await generateDocumentPackage({
    context: createContext(),
    createRecords: {
      contract: async (data) => {
        calls.push(`create-contract:${data.number}`);
        return { id: 101 };
      },
      ks2: async (data) => {
        calls.push(`create-ks2:${data.number}`);
        return { id: 201 };
      },
      ks3: async (data) => {
        calls.push(`create-ks3:${data.number}`);
        return { id: 301 };
      },
    },
    generators: {
      estimate: async (estimateId) => {
        calls.push(`estimate:${estimateId}`);
        return { path: 'C:/out/estimate.pdf' };
      },
      contract: async (contractId) => {
        calls.push(`contract:${contractId}`);
        return { path: 'C:/out/contract.docx' };
      },
      ks2: async (ks2Id) => {
        calls.push(`ks2:${ks2Id}`);
        return { path: 'C:/out/ks2.pdf' };
      },
      ks3: async () => {
        calls.push('ks3:301');
        throw new Error('ks3 failed');
      },
      fot: async (estimateId) => {
        calls.push(`fot:${estimateId}`);
        return { path: 'C:/out/fot.pdf' };
      },
      materials: async (estimateId) => {
        calls.push(`materials:${estimateId}`);
        return { path: 'C:/out/materials.pdf' };
      },
    },
    packageDirBuilder: () => 'C:/out/project-documents',
    now: () => '2026-04-02',
  });

  assert.equal(result.folder, 'C:/out/project-documents');
  assert.equal(result.generated.length, 5);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /КС-3/);
  assert.deepEqual(calls, [
    'estimate:10',
    'create-contract:Д-ИМП-42',
    'contract:101',
    'create-ks2:КС2-ИМП-42-1',
    'ks2:201',
    'create-ks3:КС3-ИМП-42-1',
    'ks3:301',
    'fot:10',
    'materials:10',
  ]);
});

test('generateDocumentPackage rejects empty estimates before generation starts', async () => {
  await assert.rejects(async () => {
    await generateDocumentPackage({
      context: {
        estimate: { id: 1, number: 'EMPTY' },
        items: [],
      },
      createRecords: {},
      generators: {},
      packageDirBuilder: () => 'C:/out/project-documents',
    });
  }, /Нет данных для генерации/);
});

test('generateDocumentPackage creates the package folder before file generation starts', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'smetaai-package-'));
  const packageDir = path.join(tempRoot, 'project-documents', 'Пакет_ИМП-42');

  const result = await generateDocumentPackage({
    context: createContext(),
    createRecords: {
      contract: async () => ({ id: 101 }),
      ks2: async () => ({ id: 201 }),
      ks3: async () => ({ id: 301 }),
    },
    generators: {
      estimate: async () => ({ path: path.join(packageDir, 'estimate.pdf') }),
      contract: async () => ({ path: path.join(packageDir, 'contract.docx') }),
      ks2: async () => ({ path: path.join(packageDir, 'ks2.pdf') }),
      ks3: async () => ({ path: path.join(packageDir, 'ks3.pdf') }),
      fot: async () => ({ path: path.join(packageDir, 'fot.pdf') }),
      materials: async () => ({ path: path.join(packageDir, 'materials.pdf') }),
    },
    packageDirBuilder: () => packageDir,
    now: () => '2026-04-02',
  });

  assert.equal(result.folder, packageDir);
  assert.equal(fs.existsSync(packageDir), true);
});
