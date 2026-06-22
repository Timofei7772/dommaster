const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { resolveWritableFolderPath, buildPackageDir } = require('../src/output-paths');

test('resolveWritableFolderPath falls back to user data when preferred path is not writable', () => {
  const preferredPath = 'C:\\Program Files\\SmetaAI';
  const fallbackPath = 'C:\\Users\\User\\AppData\\Roaming\\SmetaAI';

  const fsImpl = {
    constants: fs.constants,
    mkdirSync(targetPath) {
      if (targetPath === preferredPath) {
        const error = new Error('EPERM');
        error.code = 'EPERM';
        throw error;
      }
    },
    accessSync(targetPath) {
      if (targetPath === preferredPath) {
        const error = new Error('EPERM');
        error.code = 'EPERM';
        throw error;
      }
    },
  };

  const resolved = resolveWritableFolderPath(preferredPath, fallbackPath, { fsImpl });

  assert.equal(resolved, fallbackPath);
});

test('buildPackageDir uses writable fallback instead of process cwd', () => {
  const preferredPath = 'C:\\Program Files\\SmetaAI';
  const fallbackPath = 'C:\\Users\\User\\AppData\\Roaming\\SmetaAI';
  const fsImpl = {
    constants: fs.constants,
    mkdirSync(targetPath) {
      if (targetPath === preferredPath) {
        const error = new Error('EPERM');
        error.code = 'EPERM';
        throw error;
      }
    },
    accessSync(targetPath) {
      if (targetPath === preferredPath) {
        const error = new Error('EPERM');
        error.code = 'EPERM';
        throw error;
      }
    },
  };

  const packageDir = buildPackageDir(
    {
      folderPath: preferredPath,
      dataPath: fallbackPath,
      estimate: { number: 'ЛС-001' },
    },
    {
      fsImpl,
      pathImpl: path,
      now: () => 177523318936,
    }
  );

  assert.equal(
    packageDir,
    path.join(fallbackPath, 'project-documents', 'Пакет_ЛС-001_177523318936')
  );
});
