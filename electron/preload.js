import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('packyaDesktop', {
  platform: process.platform,
  focusWindow: async () => {
    try {
      return await ipcRenderer.invoke('packya:focus-window')
    } catch {
      return false
    }
  },
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

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  let lastFocusPingAt = 0
  let lastWritableElement = null

  const isWritableTarget = (element) => {
    if (!(element instanceof HTMLElement)) return false

    if (element instanceof HTMLTextAreaElement) {
      return !element.disabled && !element.readOnly
    }

    if (element instanceof HTMLInputElement) {
      const blockedTypes = new Set([
        'button',
        'checkbox',
        'color',
        'file',
        'hidden',
        'image',
        'radio',
        'range',
        'reset',
        'submit',
      ])
      if (blockedTypes.has(String(element.type ?? '').toLowerCase())) return false
      return !element.disabled && !element.readOnly
    }

    return element.isContentEditable
  }

  const rememberWritableTarget = (target) => {
    const element = target instanceof HTMLElement
      ? target.closest('input, textarea, [contenteditable="true"]')
      : null
    if (!(element instanceof HTMLElement)) return
    if (!isWritableTarget(element)) return
    lastWritableElement = element
  }

  document.addEventListener('pointerdown', (event) => {
    rememberWritableTarget(event.target)

    const now = Date.now()
    if (now - lastFocusPingAt < 120) return
    lastFocusPingAt = now

    void ipcRenderer.invoke('packya:focus-window').catch(() => false)
  }, true)

  document.addEventListener('focusin', (event) => {
    rememberWritableTarget(event.target)
  }, true)

  document.addEventListener('keydown', (event) => {
    const key = String(event.key ?? '')
    const isTypingKey = key.length === 1 || key === 'Backspace' || key === 'Delete'
    if (!isTypingKey) return
    if (!(lastWritableElement instanceof HTMLElement)) return
    if (!document.contains(lastWritableElement)) return
    if (document.activeElement !== document.body) return

    void ipcRenderer.invoke('packya:focus-window').catch(() => false)
    lastWritableElement.focus({ preventScroll: true })
  }, true)
}
