import { useEffect, useRef } from 'react'

/**
 * AppDialog — reemplaza window.alert / window.confirm nativos.
 *
 * Props:
 *   type: 'alert' | 'confirm'
 *   message: string
 *   onConfirm: () => void   — siempre requerido
 *   onCancel:  () => void   — requerido sólo en type='confirm'
 *   confirmLabel: string    — default 'Aceptar'
 *   cancelLabel:  string    — default 'Cancelar'
 */
function AppDialog({
  type = 'alert',
  message = '',
  onConfirm,
  onCancel,
  confirmLabel = 'Aceptar',
  cancelLabel = 'Cancelar',
}) {
  const confirmBtnRef = useRef(null)

  useEffect(() => {
    const focusTimeout = window.setTimeout(() => {
      confirmBtnRef.current?.focus()
    }, 30)
    return () => window.clearTimeout(focusTimeout)
  }, [])

  const handleKeyDown = (event) => {
    if (event.key === 'Escape' && type === 'confirm') {
      onCancel?.()
    }
  }

  return (
    <div
      className="modal-overlay app-dialog-overlay"
      role="dialog"
      aria-modal="true"
      onKeyDown={handleKeyDown}
    >
      <div className="modal-card app-dialog-card">
        <p className="app-dialog-message">{message}</p>
        <div className="app-dialog-actions">
          {type === 'confirm' && (
            <button
              type="button"
              className="secondary-btn"
              onClick={onCancel}
            >
              {cancelLabel}
            </button>
          )}
          <button
            ref={confirmBtnRef}
            type="button"
            className="primary-btn"
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default AppDialog
