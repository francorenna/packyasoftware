import { Outlet } from 'react-router-dom'
import Sidebar from '../components/Sidebar'
import ClosingOverlay from '../components/ClosingOverlay'
import SaveToast from '../components/SaveToast'

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
}) {
  const statusLabel =
    saveStatus === 'saving'
      ? 'Guardando...'
      : saveStatus === 'error'
        ? 'Error al guardar'
        : 'Guardado ✔'

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-content">
        <aside className="save-indicator" role="status" aria-live="polite">
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
          <p className="save-indicator-time">Último guardado: {formatSavedTime(lastSavedAt)}</p>
        </aside>
        <SaveToast
          key={saveToastToken}
          visible={saveToastVisible}
          message="✔ Guardado correctamente"
          duration={1500}
          onClose={onCloseSaveToast}
        />
        <Outlet />
      </main>
      {isClosing && <ClosingOverlay visible={isClosing} message={closeMessage} />}
    </div>
  )
}

export default AppLayout
