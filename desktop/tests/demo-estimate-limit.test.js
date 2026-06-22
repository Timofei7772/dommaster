const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getDemoEstimateCreationCount,
  incrementDemoEstimateCreationCount,
  ensureEstimateCreationAllowed,
  initializeDemoEstimateStorage,
  registerCreatedEstimate,
} = require('../src/main/demo-estimate-limit');

function createDbFacade(initial = {}) {
  const settings = new Map(Object.entries(initial));

  return {
    settings,
    getSetting(key) {
      return settings.has(key) ? settings.get(key) : null;
    },
    setSetting(key, value) {
      settings.set(key, value);
    },
  };
}

function createDeviceStorage(initialState = null) {
  let state = initialState ? { ...initialState } : null;

  return {
    getDeviceState() {
      return state ? { ...state } : null;
    },
    setDeviceState(nextState) {
      state = { ...nextState };
      return { ...state };
    },
  };
}

test('getDemoEstimateCreationCount defaults to zero when setting is absent', () => {
  const dbFacade = createDbFacade();

  assert.equal(getDemoEstimateCreationCount(dbFacade), 0);
});

test('incrementDemoEstimateCreationCount persists the lifetime demo counter', () => {
  const dbFacade = createDbFacade();
  const deviceStorage = createDeviceStorage();

  const nextValue = incrementDemoEstimateCreationCount(dbFacade, 1, { deviceStorage });

  assert.equal(nextValue, 1);
  assert.equal(getDemoEstimateCreationCount(dbFacade), 1);
  assert.deepEqual(deviceStorage.getDeviceState(), {
    deviceId: deviceStorage.getDeviceState().deviceId,
    demoEstimateCount: 1,
    updatedAt: deviceStorage.getDeviceState().updatedAt,
  });
});

test('ensureEstimateCreationAllowed blocks creation after deletion because it uses lifetime counter', async () => {
  const dbFacade = createDbFacade({
    demo_estimates_created_total: '5',
  });
  const deviceStorage = createDeviceStorage({
    deviceId: 'device-1',
    demoEstimateCount: 5,
    updatedAt: 1710000000000,
  });

  await assert.rejects(
    () =>
      ensureEstimateCreationAllowed(
        {
          getStatus: async () => ({ mode: 'DEMO' }),
          canCreateEstimate: ({ mode, estimatesCount }) => {
            assert.equal(mode, 'DEMO');
            assert.equal(estimatesCount, 5);
            return {
              allowed: false,
              reason: 'Вы уже создали 5 бесплатных смет. Чтобы создавать новые проекты, приобретите лицензию.',
            };
          },
        },
        dbFacade,
        { deviceStorage }
      ),
    /5 бесплатных смет/
  );
});

test('registerCreatedEstimate increases the counter only for demo mode', () => {
  const dbFacade = createDbFacade();
  const deviceStorage = createDeviceStorage();

  assert.equal(registerCreatedEstimate({ status: { mode: 'FULL' }, dbFacade, deviceStorage }), 0);
  assert.equal(registerCreatedEstimate({ status: { mode: 'DEMO' }, dbFacade, deviceStorage }), 1);
  assert.equal(registerCreatedEstimate({ status: { mode: 'DEMO' }, dbFacade, deviceStorage }), 2);
  assert.equal(deviceStorage.getDeviceState().demoEstimateCount, 2);
});

test('initializeDemoEstimateStorage restores external demo state back into local storage', () => {
  const dbFacade = createDbFacade();
  const deviceStorage = createDeviceStorage({
    deviceId: 'device-restore',
    demoEstimateCount: 4,
    updatedAt: 1710000000000,
  });

  const state = initializeDemoEstimateStorage(dbFacade, { deviceStorage });

  assert.equal(state.deviceId, 'device-restore');
  assert.equal(state.demoEstimateCount, 4);
  assert.equal(getDemoEstimateCreationCount(dbFacade), 4);
});

test('initializeDemoEstimateStorage keeps the maximum of local and external counters', () => {
  const dbFacade = createDbFacade({
    demo_estimates_created_total: '3',
    demo_device_id: 'local-device',
  });
  const deviceStorage = createDeviceStorage({
    deviceId: 'external-device',
    demoEstimateCount: 5,
    updatedAt: 1710000000000,
  });

  const state = initializeDemoEstimateStorage(dbFacade, { deviceStorage });

  assert.equal(state.deviceId, 'external-device');
  assert.equal(state.demoEstimateCount, 5);
  assert.equal(getDemoEstimateCreationCount(dbFacade), 5);
});
