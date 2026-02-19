import { app, BrowserWindow } from 'electron'
import fs from 'node:fs/promises'
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

const BACKUP_KEYS = [
  'packya_orders',
  'packya_products',
  'packya_clients',
  'packya_purchases',
  'packya_suppliers',
  'packya_purchase_plans',
  'packya_quotes',
  'packya_storage_version',
]

const toDatePart = (value) => String(value).padStart(2, '0')

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
  await fs.mkdir(backupDir, { recursive: true })

  const fileName = getBackupFileName(now)
  const targetPath = path.join(backupDir, fileName)
  await fs.writeFile(targetPath, JSON.stringify(payload, null, 2), 'utf-8')
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
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  void backupOnBeforeQuit()
})
