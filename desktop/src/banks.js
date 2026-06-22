const fs = require('fs')
const path = require('path')

const BANKS_PATH = path.join(__dirname, 'banks.json')

function getBanks() {
  if (!fs.existsSync(BANKS_PATH)) return []
  return JSON.parse(fs.readFileSync(BANKS_PATH, 'utf-8'))
}

function findBankByBik(bik) {
  const banks = getBanks()
  return banks.find(b => b.bik === bik)
}

function findBankByName(name) {
  const banks = getBanks()
  return banks.find(b => b.name.toLowerCase().includes(name.toLowerCase()))
}

module.exports = {
  getBanks,
  findBankByBik,
  findBankByName
}
