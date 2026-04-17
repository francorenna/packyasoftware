import { app, BrowserWindow, ipcMain } from 'electron'
import fs from 'node:fs'
import fsPromises from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
let mainWindowRef = null
let isHandlingCloseFlow = false
let allowWindowClose = false
let backupAlreadyExecuted = false
let backupInFlightPromise = null
const AUTO_BACKUP_ENABLED = true
const LOG_RETENTION_DAYS = 7
let logsDirPath = ''
let currentLogFilePath = ''

const BACKUP_KEYS = [
  'packya_orders',
  'packya_products',
  'packya_clients',
  'packya_purchases',
  'packya_suppliers',
  'packya_purchase_plans',
  'packya_expenses',
  'packya_manual_purchase_lists',
  'packya_quotes',
  'packya_storage_version',
]

const toDatePart = (value) => String(value).padStart(2, '0')

const formatLogDate = (date) => {
  const year = date.getFullYear()
  const month = toDatePart(date.getMonth() + 1)
  const day = toDatePart(date.getDate())
  return `${year}-${month}-${day}`
}

const getLogFilePathForDate = (date) => path.join(logsDirPath, `app-${formatLogDate(date)}.log`)

const appendInternalLog = (level, message, stack = '') => {
  try {
    if (!currentLogFilePath) return

    const allowedLevel = ['error', 'warn', 'info'].includes(level) ? level : 'info'
    const normalizedMessage = String(message ?? '').trim() || 'Mensaje vacío'
    const timestamp = new Date().toISOString()
    const stackBlock = stack ? `\n${String(stack)}` : ''
    const line = `[${timestamp}] [${allowedLevel.toUpperCase()}] ${normalizedMessage}${stackBlock}\n`

    fs.appendFile(currentLogFilePath, line, 'utf-8', () => {
    })
  } catch {
    void 0
  }
}

const cleanupOldLogs = async () => {
  try {
    if (!logsDirPath) return

    const entries = await fsPromises.readdir(logsDirPath, { withFileTypes: true })
    const now = Date.now()
    const maxAgeMs = LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000

    await Promise.all(
      entries
        .filter((entry) => entry.isFile() && /^app-\d{4}-\d{2}-\d{2}\.log$/i.test(entry.name))
        .map(async (entry) => {
          const filePath = path.join(logsDirPath, entry.name)
          const stats = await fsPromises.stat(filePath)
          if (now - stats.mtimeMs > maxAgeMs) {
            await fsPromises.unlink(filePath)
          }
        }),
    )
  } catch {
    void 0
  }
}

const initializeLogger = async () => {
  try {
    const userDataPath = app.getPath('userData')
    logsDirPath = path.join(userDataPath, 'logs')
    await fsPromises.mkdir(logsDirPath, { recursive: true })

    currentLogFilePath = getLogFilePathForDate(new Date())
    await fsPromises.writeFile(currentLogFilePath, '', { flag: 'a', encoding: 'utf-8' })

    await cleanupOldLogs()
    appendInternalLog('info', `Logger inicializado en ${currentLogFilePath}`)
  } catch {
    void 0
  }
}

const getBackupFileName = (date) => {
  const year = date.getFullYear()
  const month = toDatePart(date.getMonth() + 1)
  const day = toDatePart(date.getDate())
  const hour = toDatePart(date.getHours())
  const minute = toDatePart(date.getMinutes())
  return `packya-backup-${year}-${month}-${day}-${hour}-${minute}.json`
}

const buildBackupReadScript = () => `
  (() => {
    const keys = ${JSON.stringify(BACKUP_KEYS)}
    const data = {}

    keys.forEach((key) => {
      const raw = window.localStorage.getItem(key)
      if (raw === null) {
        data[key] = null
        return
      }

      try {
        data[key] = JSON.parse(raw)
      } catch {
        data[key] = raw
      }
    })

    return data
  })()
`

const writeAutomaticBackup = async (data) => {
  const now = new Date()
  const payload = {
    version: '1.2',
    exportDate: now.toISOString(),
    data,
  }

  const documentsPath = app.getPath('documents')
  const backupDir = path.join(documentsPath, 'Packya Backups')
  await fsPromises.mkdir(backupDir, { recursive: true })

  const fileName = getBackupFileName(now)
  const targetPath = path.join(backupDir, fileName)
  await fsPromises.writeFile(targetPath, JSON.stringify(payload, null, 2), 'utf-8')
  console.info('[auto-backup] Claves exportadas:', BACKUP_KEYS)
}

const backupOnBeforeQuit = async () => {
  if (!AUTO_BACKUP_ENABLED) return
  if (backupAlreadyExecuted) return
  if (backupInFlightPromise) {
    await backupInFlightPromise
    return
  }

  backupInFlightPromise = (async () => {
    try {
      const window = mainWindowRef || BrowserWindow.getAllWindows()[0]
      if (!window || window.isDestroyed()) return

      const data = await window.webContents.executeJavaScript(
        buildBackupReadScript(),
        true,
      )

      await writeAutomaticBackup(data)
      backupAlreadyExecuted = true
    } catch {
      // Best effort: if backup fails, do not block app shutdown.
    }
  })()

  try {
    await backupInFlightPromise
  } finally {
    backupInFlightPromise = null
  }
}

const waitMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const runGracefulCloseFlow = async (window) => {
  const targetWindow = window && !window.isDestroyed() ? window : null
  if (!targetWindow) return

  const flowStartedAt = Date.now()

  try {
    targetWindow.webContents.send('packya:close-status', {
      isClosing: true,
      message: AUTO_BACKUP_ENABLED ? 'Guardando respaldo...' : '🔄 Guardando datos...',
    })
  } catch {
    // renderer might already be unavailable; continue close flow
  }

  if (AUTO_BACKUP_ENABLED) {
    await Promise.race([backupOnBeforeQuit(), waitMs(550)])

    try {
      targetWindow.webContents.send('packya:close-status', {
        isClosing: true,
        message: '✔ Respaldo creado correctamente',
      })
    } catch {
      // renderer might already be unavailable; continue close flow
    }
  } else {
    await waitMs(250)

    try {
      targetWindow.webContents.send('packya:close-status', {
        isClosing: true,
        message: '✔ Datos guardados correctamente',
      })
    } catch {
      // renderer might already be unavailable; continue close flow
    }
  }

  const elapsedMs = Date.now() - flowStartedAt
  const minDurationMs = 800
  const maxDurationMs = 1200
  const remainingForMin = Math.max(minDurationMs - elapsedMs, 0)
  const remainingForMax = Math.max(maxDurationMs - elapsedMs, 0)

  await waitMs(Math.min(remainingForMin, remainingForMax))
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html')
    mainWindow.loadFile(indexPath)
  }

  mainWindowRef = mainWindow

  mainWindow.on('focus', () => {
    if (mainWindow.isDestroyed() || mainWindow.isMinimized()) return

    try {
      mainWindow.webContents.focus()
    } catch {
      void 0
    }
  })

  mainWindow.webContents.on('before-input-event', (_event, input) => {
    const inputType = String(input?.type ?? '')
    const key = String(input?.key ?? '')
    const isTypingKey = key.length === 1 || key === 'Backspace' || key === 'Delete'

    if (inputType !== 'keyDown' || !isTypingKey) return
    if (mainWindow.isDestroyed() || mainWindow.isMinimized()) return
    if (!mainWindow.isFocused()) return
    if (mainWindow.webContents.isFocused()) return

    try {
      mainWindow.webContents.focus()
    } catch {
      void 0
    }
  })

  mainWindow.on('close', (event) => {
    if (allowWindowClose || isHandlingCloseFlow) return

    event.preventDefault()
    isHandlingCloseFlow = true

    void runGracefulCloseFlow(mainWindow)
      .catch(() => {
        // Closing must continue even if overlay/backup flow fails.
      })
      .finally(() => {
        allowWindowClose = true
        isHandlingCloseFlow = false
        if (!mainWindow.isDestroyed()) {
          mainWindow.close()
        }
      })
  })

  mainWindow.on('closed', () => {
    if (mainWindowRef === mainWindow) mainWindowRef = null
  })
}

app.whenReady().then(() => {
  void initializeLogger()

  ipcMain.handle('packya:focus-window', async () => {
    try {
      const targetWindow =
        mainWindowRef || BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]

      if (!targetWindow || targetWindow.isDestroyed()) return false

      if (targetWindow.isMinimized()) {
        targetWindow.restore()
      }

      targetWindow.show()
      targetWindow.focus()
      targetWindow.webContents.focus()
      return true
    } catch {
      return false
    }
  })

  ipcMain.on('log:error', (_event, payload) => {
    try {
      const level = String(payload?.level ?? 'error').toLowerCase()
      const message = String(payload?.message ?? 'Sin mensaje')
      const stack = payload?.stack ? String(payload.stack) : ''
      appendInternalLog(level, message, stack)
    } catch {
      void 0
    }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  appendInternalLog('info', 'Cierre de aplicación iniciado')
  void backupOnBeforeQuit()
})
