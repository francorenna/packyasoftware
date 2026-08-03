import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { APP_CONFIG } from '../config/app'
import { brandLogoUrl } from '../utils/brandLogo'
import { CLOUD_SYNC_STATUS_EVENT, getCloudSyncStatus, processCloudSyncQueue } from '../utils/cloudSync'

const navItems = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/panel-diario', label: '📒 Panel Diario' },
  { to: '/finanzas', label: 'Finanzas' },
  { to: '/pedidos', label: 'Pedidos' },
  { to: '/presupuestos', label: 'Presupuestos' },
  { to: '/archivados', label: 'Archivados' },
  { to: '/clientes', label: 'Clientes' },
  { to: '/productos', label: 'Productos' },
  { to: '/compras', label: 'Compras' },
  { to: '/listas-compra', label: '🛒 Listas de Compra' },
  { to: '/stock', label: 'Stock' },
  { to: '/base-datos', label: '🗄 Base de Datos' },
  { to: '/reportes', label: '📄 Reportes' },
  { to: '/configuracion', label: '⚙ Configuración' },
]

function Sidebar({ session, onSignOut }) {
  const [cloudStatus, setCloudStatus] = useState(() => getCloudSyncStatus())
  const [isRetrying, setIsRetrying] = useState(false)

  useEffect(() => {
    const refreshStatus = () => {
      setCloudStatus(getCloudSyncStatus())
    }

    window.addEventListener('online', refreshStatus)
    window.addEventListener('offline', refreshStatus)
    window.addEventListener('focus', refreshStatus)
    window.addEventListener(CLOUD_SYNC_STATUS_EVENT, refreshStatus)

    return () => {
      window.removeEventListener('online', refreshStatus)
      window.removeEventListener('offline', refreshStatus)
      window.removeEventListener('focus', refreshStatus)
      window.removeEventListener(CLOUD_SYNC_STATUS_EVENT, refreshStatus)
    }
  }, [])

  const toRelativeTime = (value) => {
    if (!value) return 'sin registro'
    const parsed = new Date(value)
    const ts = parsed.getTime()
    if (Number.isNaN(ts)) return 'sin registro'

    const diffMs = Date.now() - ts
    const diffSeconds = Math.max(0, Math.floor(diffMs / 1000))
    if (diffSeconds < 60) return `hace ${diffSeconds}s`

    const diffMinutes = Math.floor(diffSeconds / 60)
    if (diffMinutes < 60) return `hace ${diffMinutes}m`

    const diffHours = Math.floor(diffMinutes / 60)
    if (diffHours < 24) return `hace ${diffHours}h`

    const diffDays = Math.floor(diffHours / 24)
    return `hace ${diffDays}d`
  }

  const handleRetryNow = async () => {
    setIsRetrying(true)
    try {
      await processCloudSyncQueue()
      setCloudStatus(getCloudSyncStatus())
    } finally {
      setIsRetrying(false)
    }
  }

  const cloudVisualState = (() => {
    if (!cloudStatus.configured) {
      return {
        className: 'cloud-status-unconfigured',
        label: 'Nube no configurada',
        detail: 'Modo local activo',
      }
    }

    if (!cloudStatus.online) {
      return {
        className: 'cloud-status-offline',
        label: 'Sin internet',
        detail: 'Trabajando en local',
      }
    }

    if (cloudStatus.processing && cloudStatus.failedAttempts > 0) {
      return {
        className: 'cloud-status-retrying',
        label: 'Reintentando sincronización',
        detail: `${cloudStatus.pendingCount} cambio(s) en cola`,
      }
    }

    if (cloudStatus.pendingCount > 0 || cloudStatus.processing) {
      const errorSuffix = cloudStatus.lastError
        ? ` | ${String(cloudStatus.lastError).slice(0, 90)}`
        : ''

      return {
        className: 'cloud-status-syncing',
        label: cloudStatus.processing ? 'Sincronizando...' : 'Pendiente de sincronizar',
        detail: `${cloudStatus.pendingCount} cambio(s) pendiente(s)${errorSuffix}`,
      }
    }

    return {
      className: 'cloud-status-online',
      label: 'Nube conectada',
      detail: 'Sincronización al día',
    }
  })()

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <img src={brandLogoUrl} alt="Packya" className="sidebar-logo" />
        <div className="sidebar-title">
          <h1>
            {APP_CONFIG.name}
            {APP_CONFIG.environment === 'testing' && <span className="env-badge env-badge-test">TEST</span>}
            {APP_CONFIG.environment === 'production' && <span className="env-badge env-badge-prod">PROD</span>}
          </h1>
          <p>{APP_CONFIG.company}</p>
        </div>
      </div>

      <nav className="nav-menu">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `nav-item ${isActive ? 'nav-item-active' : ''}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <section className={`cloud-status-widget ${cloudVisualState.className}`} aria-live="polite">
        <div className="cloud-status-headline">
          <span className="cloud-status-dot" aria-hidden="true" />
          <strong>{cloudVisualState.label}</strong>
        </div>
        <p>{cloudVisualState.detail}</p>
        <div className="cloud-status-metrics">
          <small>Ultimo OK: {toRelativeTime(cloudStatus.lastSuccessAt)}</small>
          <small>Pendientes: {cloudStatus.pendingCount}</small>
          <small>Pico hoy: {cloudStatus.queuePeakToday}</small>
        </div>
        {cloudStatus.configured && cloudStatus.online && (
          <button
            type="button"
            className="cloud-status-retry-btn"
            onClick={() => { void handleRetryNow() }}
            disabled={isRetrying || cloudStatus.processing}
          >
            {isRetrying ? 'Reintentando...' : 'Reintentar ahora'}
          </button>
        )}
      </section>

      {session && (
        <div style={{ marginTop: 'auto', fontSize: '0.78rem', color: '#64748b', paddingTop: '8px', borderTop: '1px solid #e2e8f0' }}>
          <small>{session.user?.email}</small>
          <button
            type="button"
            className="sidebar-signout-btn"
            onClick={() => { void onSignOut() }}
          >
            Cerrar sesión
          </button>
        </div>
      )}

      <p className="sidebar-version">{`${APP_CONFIG.name} v${APP_CONFIG.version}`}</p>
    </aside>
  )
}

export default Sidebar
