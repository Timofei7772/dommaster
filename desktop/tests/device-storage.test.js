const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  encodeDeviceState,
  decodeDeviceState,
  getDeviceState,
  setDeviceState,
  getDeviceStorageFilePath,
} = require('../src/main/device-storage');

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('encodeDeviceState and decodeDeviceState round-trip a valid state', () => {
  const encoded = encodeDeviceState({
    deviceId: 'device-1',
    demoEstimateCount: 4,
    updatedAt: 1710000000000,
  });

  assert.deepEqual(decodeDeviceState(encoded), {
    deviceId: 'device-1',
    demoEstimateCount: 4,
    updatedAt: 1710000000000,
  });
});

test('decodeDeviceState rejects tampered payloads', () => {
  const encoded = encodeDeviceState({
    deviceId: 'device-1',
    demoEstimateCount: 4,
    updatedAt: 1710000000000,
  });

  const tampered = Buffer.from(
    Buffer.from(encoded, 'base64').toString('utf8').replace('"demoEstimateCount":4', '"demoEstimateCount":9'),
    'utf8'
  ).toString('base64');

  assert.equal(decodeDeviceState(tampered), null);
});

test('getDeviceState falls back to file storage when registry is unavailable', () => {
  const tempRoot = makeTempDir('smeta-device-storage-');
  const filePath = path.join(tempRoot, 'device.dat');
  fs.writeFileSync(
    filePath,
    encodeDeviceState({
      deviceId: 'file-device',
      demoEstimateCount: 5,
      updatedAt: 1710000000000,
    })
  );

  const state = getDeviceState({
    execFileSyncImpl() {
      throw new Error('registry unavailable');
    },
    appDataPath: tempRoot,
    filePath,
  });

  assert.deepEqual(state, {
    deviceId: 'file-device',
    demoEstimateCount: 5,
    updatedAt: 1710000000000,
  });
});

test('setDeviceState writes external state into file storage', () => {
  const tempRoot = makeTempDir('smeta-device-storage-');
  const filePath = path.join(tempRoot, 'device.dat');

  const state = setDeviceState(
    {
      deviceId: 'persisted-device',
      demoEstimateCount: 2,
      updatedAt: 1710000000000,
    },
    {
      execFileSyncImpl() {
        throw new Error('registry unavailable');
      },
      appDataPath: tempRoot,
      filePath,
    }
  );

  assert.deepEqual(state, {
    deviceId: 'persisted-device',
    demoEstimateCount: 2,
    updatedAt: 1710000000000,
  });
  assert.ok(fs.existsSync(filePath));
  assert.deepEqual(decodeDeviceState(fs.readFileSync(filePath, 'utf8')), state);
});

test('getDeviceStorageFilePath resolves under appData', () => {
  const resolved = getDeviceStorageFilePath({
    appDataPath: 'C:/Users/User/AppData/Roaming',
  });

  assert.equal(resolved, path.join('C:/Users/User/AppData/Roaming', 'ZARU', 'SmetaAI', 'device.dat'));
});
