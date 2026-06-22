const test = require('node:test');
const assert = require('node:assert/strict');

const { buildIcoFromPngs } = require('../src/main/ico-builder');

const makePngBuffer = (size, fillByte) => {
  const header = Buffer.from([0x89, 0x50, 0x4E, 0x47, size & 0xff, fillByte]);
  return Buffer.concat([header, Buffer.alloc(10, fillByte)]);
};

test('buildIcoFromPngs creates a valid ico header and directory for all provided sizes', () => {
  const pngs = [
    { size: 256, buffer: makePngBuffer(0, 0x11) },
    { size: 128, buffer: makePngBuffer(128, 0x22) },
    { size: 64, buffer: makePngBuffer(64, 0x33) },
    { size: 32, buffer: makePngBuffer(32, 0x44) },
  ];

  const icoBuffer = buildIcoFromPngs(pngs);

  assert.equal(icoBuffer.readUInt16LE(0), 0);
  assert.equal(icoBuffer.readUInt16LE(2), 1);
  assert.equal(icoBuffer.readUInt16LE(4), 4);

  const firstEntryOffset = 6;
  const firstImageOffset = icoBuffer.readUInt32LE(firstEntryOffset + 12);
  assert.equal(firstImageOffset, 6 + (16 * pngs.length));

  const secondEntryOffset = firstEntryOffset + 16;
  assert.equal(icoBuffer.readUInt8(secondEntryOffset), 128);

  const firstImageSize = icoBuffer.readUInt32LE(firstEntryOffset + 8);
  const firstImage = icoBuffer.subarray(firstImageOffset, firstImageOffset + firstImageSize);
  assert.equal(firstImage.equals(pngs[0].buffer), true);
});

test('buildIcoFromPngs sorts sizes descending and rejects empty image lists', async () => {
  const pngs = [
    { size: 32, buffer: makePngBuffer(32, 0x44) },
    { size: 256, buffer: makePngBuffer(0, 0x11) },
  ];

  const icoBuffer = buildIcoFromPngs(pngs);
  assert.equal(icoBuffer.readUInt8(6), 0);

  assert.throws(() => buildIcoFromPngs([]), /Нет PNG данных/);
});
