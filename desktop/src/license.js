/**
 * LEGACY: устаревший локальный license flow.
 * Не использовать для реальной выдачи лицензий.
 *
 * Рабочий процесс выдачи лицензий:
 * desktop admin UI / desktop generate-key.js -> backend /api/license/admin/issue -> БД.
 *
 * Этот файл оставлен только для совместимости со старыми сценариями и внутренних миграций.
 */

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { app } = require('electron')

// Секретные ключи (в production - на сервере)
const SECRET_KEY = 'ZARU-SMETA-2026-ULTRA-SECRET-KEY-DO-NOT-SHARE'
const SALT = 'zaru_smeta_salt_v2'

// Путь к файлу лицензии
const getLicensePath = () => {
  const userDataPath = app?.getPath?.('userData') || process.cwd()
  return path.join(userDataPath, 'license.dat')
}

// Типы лицензий
const LICENSE_TYPES = {
  TRIAL: { name: 'Пробная', days: 14, features: ['basic'] },
  BASIC: { name: 'Базовая', days: 365, features: ['basic', 'documents'] },
  PRO: { name: 'Профессиональная', days: 365, features: ['basic', 'documents', 'ai', 'export'] },
  ENTERPRISE: { name: 'Корпоративная', days: 365, features: ['basic', 'documents', 'ai', 'export', 'api', 'multiuser'] }
}

// Генерация уникального ID оборудования (HWID)
const getHardwareId = () => {
  try {
    const cpus = os.cpus()
    const cpu = cpus[0]?.model || 'unknown'
    const hostname = os.hostname()
    const username = os.userInfo().username
    const platform = os.platform()
    const arch = os.arch()
    const totalMem = os.totalmem()
    
    const rawId = [cpu, hostname, username, platform, arch, totalMem].join('|')
    
    return crypto
      .createHash('sha256')
      .update(rawId + SALT)
      .digest('hex')
      .substring(0, 32)
      .toUpperCase()
  } catch (error) {
    console.error('HWID generation error:', error)
    return 'UNKNOWN-HARDWARE-ID'
  }
}

// Шифрование данных лицензии
const encryptLicense = (data) => {
  const iv = crypto.randomBytes(16)
  const key = crypto.scryptSync(SECRET_KEY, SALT, 32)
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return iv.toString('hex') + ':' + encrypted
}

// Расшифровка данных лицензии
const decryptLicense = (encryptedData) => {
  try {
    const [ivHex, encrypted] = encryptedData.split(':')
    const iv = Buffer.from(ivHex, 'hex')
    const key = crypto.scryptSync(SECRET_KEY, SALT, 32)
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return JSON.parse(decrypted)
  } catch (error) {
    console.error('Decrypt error:', error)
    return null
  }
}

// Генерация подписи лицензии
const signLicense = (data) => {
  const str = JSON.stringify(data) + SECRET_KEY
  return crypto.createHash('sha512').update(str).digest('hex').substring(0, 64)
}

// Проверка подписи
const verifySignature = (data, signature) => {
  return signLicense(data) === signature
}

// LEGACY: локальная генерация больше не является рабочим механизмом выдачи.
// Для реальной выдачи используйте backend issuance через /api/license/admin/issue.
const generateLicenseKey = (email, type, hwid) => {
  const data = { email, type, hwid, ts: Date.now() }
  const hash = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(JSON.stringify(data))
    .digest('hex')
    .substring(0, 16)
    .toUpperCase()
  
  const typeCode = type.substring(0, 3).toUpperCase()
  return 'ZARU-' + hash.substring(0,4) + '-' + hash.substring(4,8) + '-' + hash.substring(8,12) + '-' + typeCode
}

// Проверка формата ключа
const validateKeyFormat = (key) => {
  if (!key || typeof key !== 'string') return false
  const parts = key.split('-')
  if (parts.length !== 5) return false
  if (parts[0] !== 'ZARU') return false
  return true
}

// Загрузка лицензии
const loadLicense = () => {
  try {
    const licensePath = getLicensePath()
    if (fs.existsSync(licensePath)) {
      const encrypted = fs.readFileSync(licensePath, 'utf-8')
      const data = decryptLicense(encrypted)
      
      if (data && verifySignature(data.license, data.signature)) {
        // Проверяем HWID
        const currentHwid = getHardwareId()
        if (data.license.hwid && data.license.hwid !== currentHwid) {
          console.warn('HWID mismatch! License may be copied.')
          return null
        }
        return data.license
      }
    }
  } catch (error) {
    console.error('Load license error:', error)
  }
  return null
}

// Сохранение лицензии
const saveLicense = (licenseData) => {
  try {
    const licensePath = getLicensePath()
    const signature = signLicense(licenseData)
    const dataToSave = { license: licenseData, signature }
    const encrypted = encryptLicense(dataToSave)
    fs.writeFileSync(licensePath, encrypted, 'utf-8')
    return true
  } catch (error) {
    console.error('Save license error:', error)
    return false
  }
}

// Активация лицензии
const activateLicense = (licenseKey, email) => {
  if (!validateKeyFormat(licenseKey)) {
    return { success: false, error: 'Неверный формат ключа лицензии' }
  }

  // Получаем тип из ключа
  const parts = licenseKey.split('-')
  const typeCode = parts[4]
  let type = 'TRIAL'
  if (typeCode === 'BAS') type = 'BASIC'
  else if (typeCode === 'PRO') type = 'PRO'
  else if (typeCode === 'ENT') type = 'ENTERPRISE'

  const hwid = getHardwareId()
  const licenseInfo = LICENSE_TYPES[type]

  const licenseData = {
    key: licenseKey,
    email,
    type,
    hwid,
    features: licenseInfo.features,
    activatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + licenseInfo.days * 24 * 60 * 60 * 1000).toISOString(),
    machineInfo: {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch()
    }
  }

  if (saveLicense(licenseData)) {
    return { success: true, license: licenseData }
  }

  return { success: false, error: 'Не удалось сохранить лицензию' }
}

// Проверка лицензии
const checkLicense = () => {
  const license = loadLicense()
  const currentHwid = getHardwareId()

  if (!license) {
    // Создаём пробную лицензию
    const trialLicense = {
      key: 'TRIAL',
      email: '',
      type: 'TRIAL',
      hwid: currentHwid,
      features: LICENSE_TYPES.TRIAL.features,
      activatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + LICENSE_TYPES.TRIAL.days * 24 * 60 * 60 * 1000).toISOString(),
      isTrial: true
    }
    saveLicense(trialLicense)
    return {
      valid: true,
      license: trialLicense,
      daysLeft: LICENSE_TYPES.TRIAL.days,
      isTrial: true,
      hwid: currentHwid
    }
  }

  // Проверка HWID
  if (license.hwid && license.hwid !== currentHwid) {
    return {
      valid: false,
      license,
      error: 'Лицензия привязана к другому компьютеру',
      hwid: currentHwid
    }
  }

  // Проверка срока
  const expiresAt = new Date(license.expiresAt)
  const now = new Date()
  const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))

  if (daysLeft <= 0) {
    return {
      valid: false,
      license,
      daysLeft: 0,
      expired: true,
      error: 'Срок действия лицензии истёк',
      hwid: currentHwid
    }
  }

  return {
    valid: true,
    license,
    daysLeft,
    isTrial: license.isTrial || false,
    hwid: currentHwid
  }
}

// Проверка функции
const hasFeature = (feature) => {
  const { valid, license } = checkLicense()
  if (!valid) return false
  return license.features.includes(feature) || license.features.includes('all')
}

// Информация для UI
const getLicenseInfo = () => {
  const check = checkLicense()
  return {
    isValid: check.valid,
    type: check.license?.type || 'NONE',
    typeName: LICENSE_TYPES[check.license?.type]?.name || 'Нет лицензии',
    email: check.license?.email || '',
    daysLeft: check.daysLeft || 0,
    expiresAt: check.license?.expiresAt || '',
    isTrial: check.isTrial || false,
    isExpired: check.expired || false,
    features: check.license?.features || [],
    hwid: check.hwid || getHardwareId(),
    error: check.error
  }
}

// Деактивация (сброс)
const deactivateLicense = () => {
  try {
    const licensePath = getLicensePath()
    if (fs.existsSync(licensePath)) {
      fs.unlinkSync(licensePath)
    }
    return true
  } catch (error) {
    return false
  }
}

module.exports = {
  LICENSE_TYPES,
  getHardwareId,
  generateLicenseKey,
  validateKeyFormat,
  activateLicense,
  checkLicense,
  hasFeature,
  getLicenseInfo,
  deactivateLicense,
  loadLicense,
  saveLicense
}
