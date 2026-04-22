import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { APP_CONFIG } from '../config/app'
import logo from '../assets/logo.png'
import { CLOUD_SYNC_STATUS_EVENT, getCloudSyncStatus } from '../utils/cloudSync'

const navItems = [
  { to: '/dashboard', label: 'Dashboard' },
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

function Sidebar() {
  const [cloudStatus, setCloudStatus] = useState(() => getCloudSyncStatus())

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

    if (cloudStatus.pendingCount > 0 || cloudStatus.processing) {
      const errorSuffix = cloudStatus.lastError
        ? ` | ${String(cloudStatus.lastError).slice(0, 90)}`
        : ''

      return {
        className: 'cloud-status-syncing',
        label: 'Sincronizando nube',
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
        <img src={logo} alt="Packya" className="sidebar-logo" />
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
      </section>

      <p className="sidebar-version">{`${APP_CONFIG.name} v${APP_CONFIG.version}`}</p>
    </aside>
  )
}

export default Sidebar
