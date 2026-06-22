const fs = require('fs');
const path = require('path');

const CATALOG_BOOTSTRAP_VERSION = 2;

function normalizeCandidatePath(candidate) {
  return String(candidate || '').replace(/\\/g, '/');
}

function uniquePaths(candidates) {
  return [...new Set(candidates.filter(Boolean).map(normalizeCandidatePath))];
}

function resolveFirstExisting(candidates, existsSync = fs.existsSync) {
  return uniquePaths(candidates).find((candidate) => existsSync(candidate)) || null;
}

function resolveCatalogImportPaths({
  isPackaged,
  resourcesPath,
  moduleDir,
  existsSync = fs.existsSync,
}) {
  const dbRoot = isPackaged
    ? path.join(resourcesPath, 'db')
    : path.join(moduleDir, '..', 'db');

  const starterRoot = isPackaged
    ? path.join(resourcesPath, 'starter-db')
    : path.join(moduleDir, '..', '..', 'docs', 'client', 'starter-db');

  const fullCandidates = uniquePaths([
    path.join(dbRoot, 'catalog_rsk.json'),
    path.join(dbRoot, 'catalog.json'),
    path.join(starterRoot, 'full', 'catalog_rsk.json'),
    path.join(starterRoot, 'full', 'catalog.json'),
  ]);

  const quickCandidates = uniquePaths([
    path.join(dbRoot, 'catalog_simple.json'),
    path.join(starterRoot, 'quick', 'catalog_simple.json'),
  ]);

  const regionsCandidates = uniquePaths([
    path.join(dbRoot, 'regions.json'),
    path.join(starterRoot, 'full', 'regions.json'),
  ]);

  const fullCatalogPath = resolveFirstExisting(fullCandidates, existsSync);
  const quickCatalogPath = resolveFirstExisting(quickCandidates, existsSync);

  return {
    fullCatalogPath,
    quickCatalogPath,
    baseCatalogPath: fullCatalogPath || quickCatalogPath,
    simpleCatalogPath: quickCatalogPath,
    regionsPath: resolveFirstExisting(regionsCandidates, existsSync),
    fullCandidates,
    quickCandidates,
    regionsCandidates,
  };
}

function stripUtf8Bom(content) {
  return String(content || '').replace(/^\uFEFF/, '');
}

function parseCatalogJsonFile(filePath, readFileSync = fs.readFileSync) {
  const raw = readFileSync(filePath, 'utf-8');
  return JSON.parse(stripUtf8Bom(raw));
}

function planCatalogBootstrap({
  state,
  paths,
  requiredVersion = CATALOG_BOOTSTRAP_VERSION,
}) {
  const snapshot = {
    worksCount: Number(state?.worksCount || 0),
    materialsCount: Number(state?.materialsCount || 0),
    sectionsCount: Number(state?.sectionsCount || 0),
    linksCount: Number(state?.linksCount || 0),
    invalidRowsCount: Number(state?.invalidRowsCount || 0),
    storedVersion: Number(state?.storedVersion || 0),
  };

  const hasFull = Boolean(paths?.fullCatalogPath);
  const hasQuick = Boolean(paths?.quickCatalogPath);
  const preferredMode = hasFull ? 'full' : hasQuick ? 'quick' : 'none';

  if (!hasFull && !hasQuick) {
    return {
      action: 'skip',
      mode: 'none',
      reason: 'catalog sources unavailable',
      sourcePath: null,
      requiredVersion,
    };
  }

  const missingWorks = snapshot.worksCount < 10;
  const missingSections = snapshot.sectionsCount === 0;
  const missingMaterialsForFull = hasFull && snapshot.materialsCount === 0;
  const hasInvalidRows = snapshot.invalidRowsCount > 0;
  const versionOutdated = snapshot.storedVersion < requiredVersion;

  if (missingWorks || missingSections) {
    const mode = hasFull ? 'full' : 'quick';
    return {
      action: 'import',
      mode,
      reason: hasFull
        ? 'catalog missing core data'
        : 'fallback to quick catalog because full sources are unavailable',
      sourcePath: hasFull ? paths.fullCatalogPath : paths.quickCatalogPath,
      requiredVersion,
    };
  }

  if (hasFull && missingMaterialsForFull) {
    return {
      action: 'import',
      mode: 'full',
      reason: 'catalog materials are missing',
      sourcePath: paths.fullCatalogPath,
      requiredVersion,
    };
  }

  if (hasInvalidRows) {
    return {
      action: 'import',
      mode: preferredMode,
      reason: 'catalog contains invalid rows',
      sourcePath: hasFull ? paths.fullCatalogPath : paths.quickCatalogPath,
      requiredVersion,
    };
  }

  if (versionOutdated) {
    return {
      action: 'import',
      mode: preferredMode,
      reason: 'catalog bootstrap version is outdated',
      sourcePath: hasFull ? paths.fullCatalogPath : paths.quickCatalogPath,
      requiredVersion,
    };
  }

  return {
    action: 'skip',
    mode: preferredMode,
    reason: 'catalog bootstrap is healthy',
    sourcePath: hasFull ? paths.fullCatalogPath : paths.quickCatalogPath,
    requiredVersion,
  };
}

module.exports = {
  CATALOG_BOOTSTRAP_VERSION,
  parseCatalogJsonFile,
  planCatalogBootstrap,
  resolveCatalogImportPaths,
};
