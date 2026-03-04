import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('packyaDesktop', {
  platform: process.platform,
  onCloseStatus: (callback) => {
    if (typeof callback !== 'function') return () => {}

    const handler = (_event, payload) => callback(payload)
    ipcRenderer.on('packya:close-status', handler)

    return () => {
      ipcRenderer.removeListener('packya:close-status', handler)
    }
  },
})

contextBridge.exposeInMainWorld('packyaLogger', {
  log: (level, message, stack) => {
    try {
      ipcRenderer.send('log:error', {
        level,
        message,
        stack,
      })
    } catch {
      void 0
    }
  },
})
