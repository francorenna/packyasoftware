import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import ClosingOverlay from '../components/ClosingOverlay'
import SaveToast from '../components/SaveToast'
import { brandLogoUrl } from '../utils/brandLogo'

const formatSavedTime = (value) => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '--:--:--'
  return date.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function AppLayout({
  isClosing,
  closeMessage,
  saveStatus,
  lastSavedAt,
  saveToastVisible,
  saveToastToken,
  onCloseSaveToast,
  globalAlerts,
  onOpenAlert,
  session,
  onSignOut,
}) {
  const [showWelcomeSplash, setShowWelcomeSplash] = useState(true)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setShowWelcomeSplash(false)
    }, 5000)

    return () => window.clearTimeout(timeoutId)
  }, [])

  const statusLabel =
    saveStatus === 'saving'
      ? 'Guardando...'
      : saveStatus === 'error'
        ? 'Error al guardar'
        : 'Guardado ✔'
  const isSaveIndicatorCompact = saveStatus === 'saved'

  return (
    <div className="app-shell">
      {showWelcomeSplash && (
        <div className="app-welcome-splash" role="status" aria-live="polite">
          <div className="app-welcome-card">
            <div className="app-welcome-isotype-shell" aria-hidden="true">
              <img src={brandLogoUrl} alt="" className="app-welcome-isotype" />
            </div>
            <p className="app-welcome-eyebrow">PACKYA GESTION</p>
            <h1>Bienvenido</h1>
            <p>Sistema operativo integral para producción, caja y seguimiento comercial.</p>
          </div>
        </div>
      )}
      <Sidebar session={session} onSignOut={onSignOut} />
      <main className="app-content">
        <aside
          className={`save-indicator ${isSaveIndicatorCompact ? 'save-indicator-compact' : ''}`}
          role="status"
          aria-live="polite"
        >
          <p
            className={`save-indicator-state ${
              saveStatus === 'saving'
                ? 'save-indicator-state-saving'
                : saveStatus === 'error'
                  ? 'save-indicator-state-error'
                  : 'save-indicator-state-saved'
            }`}
          >
            {statusLabel}
          </p>
          {!isSaveIndicatorCompact && (
            <p className="save-indicator-time">Último guardado: {formatSavedTime(lastSavedAt)}</p>
          )}
        </aside>
        <SaveToast
          key={saveToastToken}
          visible={saveToastVisible}
          message="✔ Guardado correctamente"
          duration={1500}
          onClose={onCloseSaveToast}
        />
        <section className="global-alerts-bar" aria-label="Alertas globales">
          {(Array.isArray(globalAlerts) ? globalAlerts : []).map((alert) => (
            <button
              key={String(alert.id ?? alert.label ?? 'global-alert')}
              type="button"
              className={`global-alert-chip global-alert-chip-${String(alert.severity ?? 'ok')}`}
              onClick={() => onOpenAlert?.(alert)}
            >
              <span>{String(alert.icon ?? '•')}</span>
              <span>{String(alert.label ?? '')}</span>
            </button>
          ))}
        </section>
        <Outlet />
      </main>
      {isClosing && <ClosingOverlay visible={isClosing} message={closeMessage} />}
    </div>
  )
}

export default AppLayout
