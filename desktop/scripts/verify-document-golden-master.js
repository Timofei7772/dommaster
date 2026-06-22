const assert = require('assert')
const fs = require('fs')

const { buildManifest, OUTPUT_MD, REFERENCE_DIR } = require('./extract-document-golden-master')

function parseManifestFromMarkdown(markdown) {
  const match = markdown.match(/```json\s*([\s\S]*?)\s*```/)
  if (!match) {
    throw new Error('JSON block not found in document-golden-master.md')
  }
  return JSON.parse(match[1])
}

function ensureCoreShape(manifest) {
  assert.strictEqual(typeof manifest.schemaVersion, 'number', 'schemaVersion is required')
  assert.ok(Array.isArray(manifest.files), 'files array is required')
  assert.ok(manifest.files.length > 0, 'files array must not be empty')

  const byType = { xlsx: 0, pdf: 0, docx: 0 }

  for (const file of manifest.files) {
    assert.ok(file.relPath, 'file.relPath is required')
    assert.ok(file.hashSha256, 'file.hashSha256 is required')
    assert.ok(typeof file.bytes === 'number' && file.bytes > 0, 'file.bytes must be > 0')
    assert.ok(file.type === 'xlsx' || file.type === 'pdf' || file.type === 'docx', `unsupported file type: ${file.type}`)
    byType[file.type] += 1

    if (file.type === 'xlsx') {
      assert.ok(Array.isArray(file.sheetNames), `${file.relPath}: sheetNames required`)
      assert.ok(Array.isArray(file.sheets), `${file.relPath}: sheets required`)
    }

    if (file.type === 'pdf' || file.type === 'docx') {
      assert.ok(Array.isArray(file.textAnchors), `${file.relPath}: textAnchors required`)
    }
  }

  assert.ok(byType.xlsx > 0, 'manifest must include at least one xlsx file')
  assert.ok(byType.pdf > 0, 'manifest must include at least one pdf file')
  assert.ok(byType.docx > 0, 'manifest must include at least one docx file')
}

function toMap(files) {
  const map = new Map()
  for (const file of files) {
    map.set(file.relPath, file)
  }
  return map
}

function compareFileSignatures(savedManifest, actualManifest, filter) {
  const expected = savedManifest.files.filter(filter)
  const actual = actualManifest.files.filter(filter)

  assert.strictEqual(actual.length, expected.length, `file count mismatch: expected ${expected.length}, actual ${actual.length}`)

  const actualMap = toMap(actual)
  for (const expectedFile of expected) {
    const actualFile = actualMap.get(expectedFile.relPath)
    assert.ok(actualFile, `missing file in source: ${expectedFile.relPath}`)
    assert.strictEqual(actualFile.type, expectedFile.type, `type mismatch for ${expectedFile.relPath}`)
    assert.strictEqual(actualFile.hashSha256, expectedFile.hashSha256, `hash mismatch for ${expectedFile.relPath}`)

    if (expectedFile.type === 'xlsx') {
      assert.deepStrictEqual(actualFile.sheetNames, expectedFile.sheetNames, `sheet names mismatch for ${expectedFile.relPath}`)
      assert.strictEqual(actualFile.sheetCount, expectedFile.sheetCount, `sheet count mismatch for ${expectedFile.relPath}`)
    }
  }
}

function resolveFilter(argument) {
  if (!argument) return () => true

  const key = argument.toLowerCase()
  const aliases = {
    defektovka: ['дефектовка'],
    estimate: ['смета', 'smeta'],
    ks2: ['кс-2', 'кс2'],
    ks3: ['кс-3', 'кс3'],
    m29: ['м-29', 'm-29'],
    fot: ['фот', 'fot'],
    invoice: ['счет', 'счёт', 'invoice'],
    'invoice-factura': ['фактура', 'factura'],
    'material-request': ['заявка', 'материал'],
    'commercial-offer': ['коммер', 'предлож']
  }

  const patterns = aliases[key]
  if (!patterns) {
    return () => true
  }

  return (file) => {
    const name = file.relPath.toLowerCase()
    return patterns.some((pattern) => name.includes(pattern))
  }
}

async function main() {
  const target = process.argv[2] || ''
  if (!fs.existsSync(OUTPUT_MD)) {
    throw new Error(`Golden master is missing. Run extractor first: ${OUTPUT_MD}`)
  }

  const markdown = fs.readFileSync(OUTPUT_MD, 'utf8')
  const savedManifest = parseManifestFromMarkdown(markdown)
  ensureCoreShape(savedManifest)

  const actualManifest = await buildManifest(REFERENCE_DIR)
  const filter = resolveFilter(target)
  compareFileSignatures(savedManifest, actualManifest, filter)

  console.log(target ? `golden master verification passed for: ${target}` : 'golden master verification passed')
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error)
  process.exit(1)
})
