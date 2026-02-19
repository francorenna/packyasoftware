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
