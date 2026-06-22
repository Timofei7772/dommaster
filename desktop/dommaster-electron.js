/**
 * DomMaster OS — Electron Launcher
 * Запускает Python-бэкенд + отображает фронтенд в одном окне.
 *
 * Использование:
 *   electron dommaster-electron.js
 * Или собери: electron-builder --win (см. package.json)
 */
const { app, BrowserWindow, dialog } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const http = require('http')

let mainWindow = null
let backendProcess = null

const BACKEND_PORT = 8009
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`

function findBackendExe() {
    // 1. Рядом с electron.js
    const localExe = path.join(__dirname, '..', 'backend', 'dist', 'dommaster-backend', 'dommaster-backend.exe')
    const fs = require('fs')
    if (fs.existsSync(localExe)) return localExe

    // 2. В директории dist (собранный установщик)
    const distExe = path.join(__dirname, 'backend', 'dommaster-backend.exe')
    if (fs.existsSync(distExe)) return distExe

    // 3. Python run.py
    const runPy = path.join(__dirname, '..', 'backend', 'run.py')
    if (fs.existsSync(runPy)) return runPy

    return null
}

async function waitForBackend(timeout = 30000) {
    const start = Date.now()
    while (Date.now() - start < timeout) {
        try {
            await new Promise((resolve, reject) => {
                const req = http.get(`${BACKEND_URL}/`, (res) => {
                    let data = ''
                    res.on('data', (c) => data += c)
                    res.on('end', () => resolve(data))
                })
                req.on('error', reject)
                req.setTimeout(2000, () => { req.destroy(); reject(new Error('timeout')) })
            })
            return true
        } catch {
            await new Promise(r => setTimeout(r, 1000))
        }
    }
    return false
}

async function startBackend() {
    const exePath = findBackendExe()
    if (!exePath) {
        dialog.showErrorBox('Ошибка', 'Не найден backend. Убедитесь, что Python установлен.')
        app.quit()
        return
    }

    const isPython = exePath.endsWith('.py')
    const env = { ...process.env, DATABASE_URL: `sqlite+aiosqlite:///${path.join(app.getPath('userData'), 'dommaster.db')}` }

    return new Promise((resolve) => {
        if (isPython) {
            // Запуск через Python
            backendProcess = spawn('python', [exePath], {
                env,
                cwd: path.dirname(exePath),
                stdio: ['ignore', 'pipe', 'pipe'],
            })
        } else {
            // Запуск PyInstaller .exe
            backendProcess = spawn(exePath, [], {
                env,
                cwd: path.dirname(exePath),
                stdio: ['ignore', 'pipe', 'pipe'],
            })
        }

        backendProcess.stdout.on('data', (data) => {
            const msg = data.toString()
            console.log('[backend]', msg.trim())
        })
        backendProcess.stderr.on('data', (data) => {
            console.log('[backend:err]', data.toString().trim())
        })
        backendProcess.on('exit', (code) => {
            console.log(`[backend] exited with code ${code}`)
        })

        // Ждём готовности
        waitForBackend(60000).then((ready) => {
            if (!ready) {
                dialog.showErrorBox('Ошибка', 'Backend не запустился за 60 секунд.')
            }
            resolve(ready)
        })
    })
}

function findFrontendPath() {
    const fs = require('fs')
    const paths = [
        path.join(__dirname, '..', 'frontend', 'dist', 'index.html'),
        path.join(__dirname, 'frontend', 'index.html'),
        path.join(__dirname, 'renderer', 'index.html'),
    ]
    for (const p of paths) {
        if (fs.existsSync(p)) return path.dirname(p)
    }
    return null
}

async function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        title: 'DomMaster OS — Строительная ERP',
        icon: path.join(__dirname, 'assets', 'icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
        show: false,
    })

    mainWindow.once('ready-to-show', () => {
        mainWindow.show()
        mainWindow.maximize()
    })

    // Сначала показываем загрузку
    mainWindow.loadURL(`data:text/html,
<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;
background:#0f172a;color:#94a3b8;font-family:sans-serif;flex-direction:column;gap:20px">
<div style="font-size:48px">🏗️</div>
<div style="font-size:24px;font-weight:600;color:#e2e8f0">DomMaster OS</div>
<div style="font-size:14px">Запуск сервера...</div>
<div style="width:200px;height:4px;background:#1e293b;border-radius:2px;overflow:hidden">
<div style="width:30%;height:100%;background:#7c3aed;animation:load 1.5s ease infinite"></div>
</div>
<style>@keyframes load{50%{width:80%}}</style>
</body></html>`)

    // Запускаем бэкенд
    const backendReady = await startBackend()

    if (backendReady) {
        const frontendDir = findFrontendPath()
        if (frontendDir) {
            // Serve static files from backend proxy
            mainWindow.loadURL(`${BACKEND_URL}/`)
        } else {
            mainWindow.loadURL('http://localhost:5173')
        }
    }

    mainWindow.on('closed', () => {
        mainWindow = null
    })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
    if (backendProcess) {
        backendProcess.kill('SIGTERM')
        setTimeout(() => backendProcess.kill('SIGKILL'), 3000)
    }
    if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
    if (mainWindow === null) createWindow()
})
