const fs = require('fs')
const path = require('path')
const XLSX = require('xlsx')

const { app } = require('electron')
const BANKS_PATH = path.join(app.getPath('userData'), 'banks.json')

/**
 * Импорт банковских данных из Excel/CSV
 * Ожидает столбцы: name, bik, account, corr_account, city
 */
async function banksImportFromExcel(filePath) {
  if (!fs.existsSync(filePath)) throw new Error('Файл не найден: ' + filePath)
  const ext = path.extname(filePath).toLowerCase()
  let rows = []
  if (ext === '.csv') {
    const content = fs.readFileSync(filePath, 'utf-8')
    rows = content.split('\n').map(line => line.split(';'))
  } else {
    const wb = XLSX.readFile(filePath)
    const ws = wb.Sheets[wb.SheetNames[0]]
    rows = XLSX.utils.sheet_to_json(ws, { header: 1 })
  }
  // Определяем заголовки
  const headers = rows[0].map(h => h.toLowerCase())
  const idx = {
    name: headers.indexOf('name'),
    bik: headers.indexOf('bik'),
    account: headers.indexOf('account'),
    corr_account: headers.indexOf('corr_account'),
    city: headers.indexOf('city')
  }
  const banks = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row[idx.name] || !row[idx.bik]) continue
    banks.push({
      name: String(row[idx.name]),
      bik: String(row[idx.bik]),
      account: String(row[idx.account] || ''),
      corr_account: String(row[idx.corr_account] || ''),
      city: String(row[idx.city] || '')
    })
  }
  // Сохраняем
  fs.writeFileSync(BANKS_PATH, JSON.stringify(banks, null, 2), 'utf-8')
  return banks.length
}

/**
 * Получить список банков
 */
function getBanksList() {
  if (!fs.existsSync(BANKS_PATH)) return []
  try {
    const content = fs.readFileSync(BANKS_PATH, 'utf-8')
    return JSON.parse(content)
  } catch (e) {
    console.error('Ошибка чтения банков:', e)
    return []
  }
}

module.exports = { banksImportFromExcel, getBanksList }
