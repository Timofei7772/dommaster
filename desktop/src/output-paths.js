const fs = require('fs');
const path = require('path');

function canUseFolder(targetPath, { fsImpl = fs } = {}) {
  if (!targetPath) return false;

  try {
    fsImpl.mkdirSync(targetPath, { recursive: true });
    fsImpl.accessSync(targetPath, fsImpl.constants?.W_OK ?? fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function resolveWritableFolderPath(preferredPath, fallbackPath, { fsImpl = fs } = {}) {
  if (canUseFolder(preferredPath, { fsImpl })) {
    return preferredPath;
  }

  if (canUseFolder(fallbackPath, { fsImpl })) {
    return fallbackPath;
  }

  return fallbackPath || preferredPath || process.cwd();
}

function buildPackageDir(context = {}, options = {}) {
  const {
    fsImpl = fs,
    pathImpl = path,
    now = () => Date.now(),
  } = options;

  const safeNumber = String(context?.estimate?.number || 'Б-Н').replace(/[/\\]/g, '-');
  const rootFolder = resolveWritableFolderPath(
    context?.folderPath || context?.project?.folder_path,
    context?.dataPath || process.cwd(),
    { fsImpl }
  );

  return pathImpl.join(rootFolder, 'project-documents', `Пакет_${safeNumber}_${now()}`);
}

module.exports = {
  resolveWritableFolderPath,
  buildPackageDir,
};
