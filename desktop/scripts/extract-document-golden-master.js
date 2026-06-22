const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const ExcelJS = require('exceljs')
const AdmZip = require('adm-zip')

const REFERENCE_DIR = process.env.SMETAAI_REFERENCE_DIR || 'C:\\Users\\User\\OneDrive\\Desktop\\сметы нов'
const REPO_ROOT = path.resolve(__dirname, '..', '..')
const OUTPUT_MD = path.join(REPO_ROOT, 'docs', 'reference', 'document-golden-master.md')

const TARGET_EXTENSIONS = new Set(['.xlsx', '.pdf', '.docx'])

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function safeRelPath(baseDir, filePath) {
  return path.relative(baseDir, filePath).replace(/\\/g, '/')
}

function readRecursiveFiles(rootDir) {
  const results = []
  const stack = [rootDir]
  while (stack.length) {
    const current = stack.pop()
    const entries = fs.readdirSync(current, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
        continue
      }
      const ext = path.extname(entry.name).toLowerCase()
      if (TARGET_EXTENSIONS.has(ext)) {
        results.push(fullPath)
      }
    }
  }
  return results.sort((a, b) => a.localeCompare(b, 'ru'))
}

function getCellFormula(value) {
  if (!value || typeof value !== 'object') return null
  if (typeof value.formula === 'string') return value.formula
  if (value.sharedFormula) return String(value.sharedFormula)
  return null
}

async function extractXlsxMeta(filePath, relPath, stat, bufferHash) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)

  const sheets = workbook.worksheets.map((sheet) => {
    let formulaCount = 0
    let nonEmptyRows = 0
    let maxColumnsUsed = 0
    let customRowHeightCount = 0
    let customColumnWidthCount = 0
    const mergeCount = (sheet.model && Array.isArray(sheet.model.merges)) ? sheet.model.merges.length : 0

    sheet.eachRow({ includeEmpty: false }, (row) => {
      nonEmptyRows += 1
      if (row.height) customRowHeightCount += 1
      const cellCount = row.cellCount || 0
      if (cellCount > maxColumnsUsed) maxColumnsUsed = cellCount
      row.eachCell({ includeEmpty: false }, (cell) => {
        const formula = getCellFormula(cell.value)
        if (formula) formulaCount += 1
      })
    })

    ;(sheet.columns || []).forEach((column) => {
      if (column && column.width) customColumnWidthCount += 1
    })

    return {
      name: sheet.name,
      rowCount: sheet.rowCount || 0,
      actualRowCount: sheet.actualRowCount || 0,
      columnCount: sheet.columnCount || 0,
      mergeCount,
      formulaCount,
      nonEmptyRows,
      maxColumnsUsed,
      customRowHeightCount,
      customColumnWidthCount
    }
  })

  return {
    type: 'xlsx',
    relPath,
    bytes: stat.size,
    mtimeUtc: stat.mtime.toISOString(),
    hashSha256: bufferHash,
    sheetCount: sheets.length,
    sheetNames: sheets.map((sheet) => sheet.name),
    sheets
  }
}

function extractPdfAnchors(buffer) {
  const raw = buffer.toString('latin1')
  const matches = raw.match(/\((?:\\.|[^\\)])*\)/g) || []
  const anchors = []
  const seen = new Set()

  for (const token of matches) {
    const unwrapped = token.slice(1, -1)
    const unescaped = unwrapped
      .replace(/\\([()\\])/g, '$1')
      .replace(/\\r/g, ' ')
      .replace(/\\n/g, ' ')
      .replace(/\\t/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (!unescaped) continue
    if (unescaped.length < 4) continue
    if (/[^\x20-\x7E\u0400-\u04FF]/.test(unescaped)) continue
    if (seen.has(unescaped)) continue
    seen.add(unescaped)
    anchors.push(unescaped)
    if (anchors.length >= 60) break
  }

  return anchors
}

function extractDocxAnchors(buffer) {
  const zip = new AdmZip(buffer)
  const entry = zip.getEntry('word/document.xml')
  if (!entry) return []
  const xml = entry.getData().toString('utf8')
  const plainText = xml
    .replace(/<w:tab\/>/g, ' ')
    .replace(/<w:br\/>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

  const words = plainText.split(' ')
  const anchors = []
  const seen = new Set()
  for (const word of words) {
    const normalized = word.trim()
    if (normalized.length < 4) continue
    if (seen.has(normalized)) continue
    seen.add(normalized)
    anchors.push(normalized)
    if (anchors.length >= 80) break
  }
  return anchors
}

function buildSummary(files) {
  const byType = {}
  for (const file of files) {
    byType[file.type] = (byType[file.type] || 0) + 1
  }
  return {
    totalFiles: files.length,
    byType
  }
}

async function extractFile(filePath, rootDir) {
  const relPath = safeRelPath(rootDir, filePath)
  const ext = path.extname(filePath).toLowerCase()
  const stat = fs.statSync(filePath)
  const buffer = fs.readFileSync(filePath)
  const bufferHash = sha256(buffer)

  if (ext === '.xlsx') {
    return extractXlsxMeta(filePath, relPath, stat, bufferHash)
  }
  if (ext === '.pdf') {
    return {
      type: 'pdf',
      relPath,
      bytes: stat.size,
      mtimeUtc: stat.mtime.toISOString(),
      hashSha256: bufferHash,
      textAnchors: extractPdfAnchors(buffer)
    }
  }
  if (ext === '.docx') {
    return {
      type: 'docx',
      relPath,
      bytes: stat.size,
      mtimeUtc: stat.mtime.toISOString(),
      hashSha256: bufferHash,
      textAnchors: extractDocxAnchors(buffer)
    }
  }
  return null
}

async function buildManifest(referenceDir) {
  if (!fs.existsSync(referenceDir)) {
    throw new Error(`Reference directory not found: ${referenceDir}`)
  }

  const filePaths = readRecursiveFiles(referenceDir)
  const files = []
  for (const filePath of filePaths) {
    const file = await extractFile(filePath, referenceDir)
    if (file) files.push(file)
  }

  return {
    schemaVersion: 1,
    generatedAtUtc: new Date().toISOString(),
    sourceDir: referenceDir,
    summary: buildSummary(files),
    files
  }
}

function toMarkdown(manifest) {
  return [
    '# Document Golden Master',
    '',
    `Generated at (UTC): ${manifest.generatedAtUtc}`,
    `Source directory: ${manifest.sourceDir}`,
    '',
    '## Summary',
    '',
    `- Total files: ${manifest.summary.totalFiles}`,
    `- XLSX: ${manifest.summary.byType.xlsx || 0}`,
    `- PDF: ${manifest.summary.byType.pdf || 0}`,
    `- DOCX: ${manifest.summary.byType.docx || 0}`,
    '',
    '## Manifest (JSON)',
    '',
    '```json',
    JSON.stringify(manifest, null, 2),
    '```',
    ''
  ].join('\n')
}

async function main() {
  const manifest = await buildManifest(REFERENCE_DIR)
  fs.mkdirSync(path.dirname(OUTPUT_MD), { recursive: true })
  fs.writeFileSync(OUTPUT_MD, toMarkdown(manifest), 'utf8')
  console.log(`golden master written: ${OUTPUT_MD}`)
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : error)
    process.exit(1)
  })
}

module.exports = {
  buildManifest,
  toMarkdown,
  REFERENCE_DIR,
  OUTPUT_MD
}

