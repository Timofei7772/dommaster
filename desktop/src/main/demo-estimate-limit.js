const DEMO_ESTIMATES_CREATED_KEY = 'demo_estimates_created_total';
const DEMO_DEVICE_ID_KEY = 'demo_device_id';
const DEMO_UPDATED_AT_KEY = 'demo_estimates_updated_at';

const deviceStorageUtils = require('./device-storage');

function parseEstimateCount(rawValue) {
  const parsed = Number.parseInt(String(rawValue ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function parseUpdatedAt(rawValue) {
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function getLocalDemoState(dbFacade) {
  return {
    deviceId: String(dbFacade?.getSetting?.(DEMO_DEVICE_ID_KEY) || '').trim(),
    demoEstimateCount: parseEstimateCount(dbFacade?.getSetting?.(DEMO_ESTIMATES_CREATED_KEY)),
    updatedAt: parseUpdatedAt(dbFacade?.getSetting?.(DEMO_UPDATED_AT_KEY)),
  };
}

function persistLocalDemoState(dbFacade, state) {
  dbFacade?.setSetting?.(DEMO_ESTIMATES_CREATED_KEY, String(state.demoEstimateCount));
  dbFacade?.setSetting?.(DEMO_DEVICE_ID_KEY, state.deviceId);
  dbFacade?.setSetting?.(DEMO_UPDATED_AT_KEY, String(state.updatedAt));
}

function initializeDemoEstimateStorage(dbFacade, options = {}) {
  const storageFacade = options.deviceStorage || null;
  const localState = getLocalDemoState(dbFacade);
  const externalState = storageFacade?.getDeviceState?.() || null;

  const mergedState = deviceStorageUtils.createDeviceState({
    deviceId: externalState?.deviceId || localState.deviceId,
    demoEstimateCount: Math.max(localState.demoEstimateCount, externalState?.demoEstimateCount || 0),
    updatedAt: Math.max(localState.updatedAt, externalState?.updatedAt || 0, Date.now()),
  });

  persistLocalDemoState(dbFacade, mergedState);

  try {
    storageFacade?.setDeviceState?.(mergedState);
  } catch {
    // Внешнее хранилище используется как восстановление после удаления userData.
    // Если оно временно недоступно, локальный state остаётся источником правды.
  }

  return mergedState;
}

function getDemoEstimateCreationCount(dbFacade, options = {}) {
  return initializeDemoEstimateStorage(dbFacade, options).demoEstimateCount;
}

function incrementDemoEstimateCreationCount(dbFacade, amount = 1, options = {}) {
  const currentState = initializeDemoEstimateStorage(dbFacade, options);
  const nextState = deviceStorageUtils.createDeviceState({
    deviceId: currentState.deviceId,
    demoEstimateCount: currentState.demoEstimateCount + Math.max(0, Number(amount) || 0),
    updatedAt: Date.now(),
  });

  persistLocalDemoState(dbFacade, nextState);

  try {
    (options.deviceStorage || null)?.setDeviceState?.(nextState);
  } catch {
    // Локальный state остаётся достаточным для работы, внешний нужен для восстановления.
  }

  return nextState.demoEstimateCount;
}

async function ensureEstimateCreationAllowed(licenseFacade, dbFacade, options = {}) {
  const status = await licenseFacade.getStatus();
  const estimatesCount = status.mode === 'DEMO'
    ? getDemoEstimateCreationCount(dbFacade, options)
    : 0;

  const gate = licenseFacade.canCreateEstimate({
    mode: status.mode,
    estimatesCount,
  });

  if (!gate.allowed) {
    throw new Error(gate.reason);
  }

  return {
    status,
    estimatesCount,
  };
}

function registerCreatedEstimate({ status, dbFacade, amount = 1, deviceStorage: storageFacade } = {}) {
  if (status?.mode !== 'DEMO') {
    return getDemoEstimateCreationCount(dbFacade, { deviceStorage: storageFacade });
  }

  return incrementDemoEstimateCreationCount(dbFacade, amount, { deviceStorage: storageFacade });
}

module.exports = {
  DEMO_ESTIMATES_CREATED_KEY,
  DEMO_DEVICE_ID_KEY,
  DEMO_UPDATED_AT_KEY,
  getDemoEstimateCreationCount,
  incrementDemoEstimateCreationCount,
  initializeDemoEstimateStorage,
  ensureEstimateCreationAllowed,
  registerCreatedEstimate,
};
