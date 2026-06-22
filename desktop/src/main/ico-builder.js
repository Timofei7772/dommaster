function normalizePngEntries(entries) {
  const normalized = (entries || [])
    .filter((entry) => entry && entry.buffer && entry.buffer.length > 0 && entry.size > 0)
    .sort((left, right) => right.size - left.size);

  if (normalized.length === 0) {
    throw new Error('Нет PNG данных для сборки ICO');
  }

  return normalized;
}

function buildIcoFromPngs(entries) {
  const pngEntries = normalizePngEntries(entries);
  const headerSize = 6;
  const directorySize = 16 * pngEntries.length;
  let currentOffset = headerSize + directorySize;

  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngEntries.length, 4);

  const directories = pngEntries.map(({ size, buffer }) => {
    const directory = Buffer.alloc(16);
    directory.writeUInt8(size >= 256 ? 0 : size, 0);
    directory.writeUInt8(size >= 256 ? 0 : size, 1);
    directory.writeUInt8(0, 2);
    directory.writeUInt8(0, 3);
    directory.writeUInt16LE(1, 4);
    directory.writeUInt16LE(32, 6);
    directory.writeUInt32LE(buffer.length, 8);
    directory.writeUInt32LE(currentOffset, 12);
    currentOffset += buffer.length;
    return directory;
  });

  return Buffer.concat([header, ...directories, ...pngEntries.map((entry) => entry.buffer)]);
}

module.exports = {
  buildIcoFromPngs,
};
