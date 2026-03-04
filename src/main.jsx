import React from 'react'
import * as ReactDOM from 'react-dom/client'
import './index.css'
import App from './App.jsx'

const reportDiagnosticError = (level, message, stack = '') => {
  try {
    window?.packyaLogger?.log?.(level, message, stack)
  } catch {
    void 0
  }
}

const previousOnError = window.onerror
window.onerror = (message, source, lineno, colno, error) => {
  try {
    const text = String(message ?? 'Error desconocido')
    const origin = `${String(source ?? 'unknown')}:${Number(lineno ?? 0)}:${Number(colno ?? 0)}`
    reportDiagnosticError('error', `window.onerror: ${text} (${origin})`, error?.stack ?? '')
  } catch {
    void 0
  }

  if (typeof previousOnError === 'function') {
    try {
      return previousOnError(message, source, lineno, colno, error)
    } catch {
      return false
    }
  }

  return false
}

window.addEventListener('unhandledrejection', (event) => {
  try {
    const reason = event?.reason

    if (reason instanceof Error) {
      reportDiagnosticError('error', `unhandledrejection: ${reason.message || 'Error sin mensaje'}`, reason.stack ?? '')
      return
    }

    if (typeof reason === 'string') {
      reportDiagnosticError('error', `unhandledrejection: ${reason}`)
      return
    }

    const serializedReason = (() => {
      try {
        return JSON.stringify(reason)
      } catch {
        return String(reason)
      }
    })()

    reportDiagnosticError('error', `unhandledrejection: ${serializedReason}`)
  } catch {
    void 0
  }
})

const root = ReactDOM.createRoot(document.getElementById('root'))
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
