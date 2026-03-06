import { NavLink } from 'react-router-dom'
import { APP_CONFIG } from '../config/app'
import logo from '../assets/logo.png'

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
  { to: '/reportes', label: '📄 Reportes' },
  { to: '/configuracion', label: '⚙ Configuración' },
]

function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <img src={logo} alt="Packya" className="sidebar-logo" />
        <div className="sidebar-title">
          <h1>{APP_CONFIG.name}</h1>
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

      <p className="sidebar-version">{`${APP_CONFIG.name} v${APP_CONFIG.version}`}</p>
    </aside>
  )
}

export default Sidebar
