/**
 * DomMaster OS — Backend Launcher
 * Запускает dommaster-server.exe как дочерний процесс.
 * Ждёт health-check, перезапускает при падении, глушит при выходе.
 */
const { spawn } = require('child_process')
const path = require('path')
const http = require('http')
const fs = require('fs')

const HEALTH_CHECK_TIMEOUT = 30000  // макс ожидание запуска (30 сек)
const HEALTH_CHECK_INTERVAL = 500   // интервал опроса
const RESTART_DELAY = 2000          // задержка перед рестартом

let backendProcess = null
let backendPort = 8000
let isShuttingDown = false

function getBackendExePath() {
  const isDev = !require('electron').app.isPackaged
  if (isDev) {
    // В разработке — запускаем Python напрямую
    return null
  }
  // В production — electron-builder extraResources копирует как resources/backend
  // (может быть файлом или папкой с dommaster-server.exe внутри)
  const asFile = path.join(process.resourcesPath, 'backend')
  if (fs.existsSync(asFile) && fs.statSync(asFile).isFile()) {
    return asFile
  }
  const asDirExe = path.join(process.resourcesPath, 'backend', 'dommaster-server.exe')
  if (fs.existsSync(asDirExe)) {
    return asDirExe
  }
  return null
}

function getBackendCwd() {
  const exePath = getBackendExePath()
  if (!exePath) return null
  return path.dirname(exePath)
}

function healthCheck(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/health`, { timeout: 3000 }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          const json = JSON.parse(data)
          resolve(json.status === 'healthy' || json.status === 'degraded')
        } catch {
          resolve(res.statusCode === 200)
        }
      })
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
  })
}

async function waitForBackend(port, timeoutMs = HEALTH_CHECK_TIMEOUT) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await healthCheck(port)) {
      return true
    }
    await new Promise((r) => setTimeout(r, HEALTH_CHECK_INTERVAL))
  }
  return false
}

function findBackendPort() {
  // Читаем порт из файла (пишется run.py при старте)
  try {
    const cwd = getBackendCwd()
    if (cwd) {
      const portFile = path.join(cwd, '.backend-port')
      if (fs.existsSync(portFile)) {
        const port = parseInt(fs.readFileSync(portFile, 'utf-8').trim())
        if (port > 0 && port < 65536) return port
      }
    }
  } catch {}
  return 8000
}

async function launchBackend(logger = console) {
  const isDev = !require('electron').app.isPackaged

  if (isDev) {
    logger.log('[backend] Dev mode — backend должен быть запущен отдельно')
    return { port: 8000, process: null, devMode: true }
  }

  const exePath = getBackendExePath()
  if (!exePath || !fs.existsSync(exePath)) {
    logger.warn('[backend] dommaster-server.exe не найден:', exePath)
    return { port: 8000, process: null, missing: true }
  }

  const cwd = path.dirname(exePath)
  logger.log('[backend] Запуск:', exePath)

  backendProcess = spawn(exePath, [], {
    cwd,
    env: { ...process.env, SMETAAI_DESKTOP_LOCAL_MODE: '1' },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  backendProcess.stdout?.on('data', (data) => {
    const text = data.toString().trim()
    if (text) logger.log('[backend]', text)
    // Ловим порт из вывода
    const m = text.match(/DOMSERVER_PORT=(\d+)/)
    if (m) backendPort = parseInt(m[1])
  })

  backendProcess.stderr?.on('data', (data) => {
    logger.error('[backend]', data.toString().trim())
  })

  backendProcess.on('exit', (code) => {
    logger.log('[backend] Процесс завершён, код:', code)
    if (!isShuttingDown && code !== 0) {
      logger.log('[backend] Перезапуск через', RESTART_DELAY, 'мс...')
      setTimeout(() => launchBackend(logger), RESTART_DELAY)
    }
  })

  // Ждём готовности
  const ready = await waitForBackend(backendPort)
  if (ready) {
    logger.log('[backend] Готов на порту', backendPort)
  } else {
    logger.warn('[backend] Backend не ответил за', HEALTH_CHECK_TIMEOUT, 'мс')
  }

  return { port: backendPort, process: backendProcess, devMode: false, ready }
}

function shutdownBackend() {
  isShuttingDown = true
  if (backendProcess) {
    backendProcess.kill('SIGTERM')
    // Жёсткое убийство через 5 сек если не завершился
    setTimeout(() => {
      try { backendProcess.kill('SIGKILL') } catch {}
    }, 5000)
  }
}

function getBackendUrl() {
  return `http://127.0.0.1:${backendPort}`
}

module.exports = { launchBackend, shutdownBackend, getBackendUrl, healthCheck }
