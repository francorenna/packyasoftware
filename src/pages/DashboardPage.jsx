import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getClientsWithDebtCount } from '../utils/clients'
import { calculateStockSnapshot } from '../utils/stock'
import { getSampleMetrics } from '../utils/finance'

const formatCurrency = (value) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value)

const formatDateInput = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const formatShortDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Sin fecha'

  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('es-AR')
}

function DashboardPage({ orders, products, clients, purchases }) {
  const navigate = useNavigate()
  const safeOrders = Array.isArray(orders) ? orders : []
  const safePurchases = Array.isArray(purchases) ? purchases : []

  const summary = useMemo(() => {
    const todayKey = formatDateInput(new Date())

    return safeOrders.reduce(
      (acc, order) => {
        const total = Number(order.total || 0)
        const totalPaid = (Array.isArray(order.payments) ? order.payments : []).reduce(
          (sum, payment) => sum + Number(payment.amount || 0),
          0,
        )
        const pending = Math.max(total - totalPaid, 0)

        return {
          totalInvoiced: acc.totalInvoiced + total,
          totalCollected: acc.totalCollected + totalPaid,
          totalPending: acc.totalPending + pending,
          ordersToday:
            acc.ordersToday + (order.deliveryDate === todayKey ? 1 : 0),
          inProgressOrders:
            acc.inProgressOrders + (order.status === 'En Proceso' ? 1 : 0),
        }
      },
      {
        totalInvoiced: 0,
        totalCollected: 0,
        totalPending: 0,
        ordersToday: 0,
        inProgressOrders: 0,
      },
    )
  }, [safeOrders])

  const sampleMetrics = useMemo(() => {
    const d = new Date()
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return getSampleMetrics({ orders: safeOrders, purchases: safePurchases, products, monthKey })
  }, [safeOrders, safePurchases, products])

  const cards = [
    { label: 'Total facturado', value: formatCurrency(summary.totalInvoiced) },
    { label: 'Total cobrado', value: formatCurrency(summary.totalCollected) },
    { label: 'Total pendiente', value: formatCurrency(summary.totalPending) },
    { label: 'Pedidos para hoy', value: String(summary.ordersToday) },
    { label: 'Pedidos en proceso', value: String(summary.inProgressOrders) },
    {
      label: 'Clientes con deuda activa',
      value: String(getClientsWithDebtCount(clients, safeOrders)),
    },
    {
      label: 'Total invertido en compras',
      value: formatCurrency(
        safePurchases.reduce(
          (acc, purchase) => acc + Number(purchase.totalAmount || 0),
          0,
        ),
      ),
    },
    {
      label: 'Muestras del mes',
      value: `${String(sampleMetrics.totalUnits || 0)} unidades · ${formatCurrency(sampleMetrics.estimatedCost || 0)}`,
    },
  ]

  const latestOrders = useMemo(() => {
    return [...safeOrders]
      .sort(
        (a, b) =>
          new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
      )
      .slice(0, 5)
  }, [safeOrders])

  const stockRows = useMemo(
    () => calculateStockSnapshot(products, safeOrders),
    [products, safeOrders],
  )

  const negativeStockProducts = useMemo(
    () => stockRows.filter((product) => product.stockDisponible < 0),
    [stockRows],
  )

  const lowStockProducts = useMemo(
    () =>
      stockRows.filter(
        (product) =>
          product.stockDisponible >= 0 &&
          product.stockDisponible < product.stockMinimo,
      ),
    [stockRows],
  )

  return (
    <section className="page-section">
      <header className="page-header">
        <h2>Dashboard</h2>
        <p>Resumen ejecutivo en tiempo real basado en los pedidos registrados.</p>
      </header>

      <div className="dashboard-grid">
        {cards.map((card) => (
          <article key={card.label} className="dashboard-card">
            <p>{card.label}</p>
            <strong>{card.value}</strong>
          </article>
        ))}
      </div>

      <section className="dashboard-recent">
        <div className="card-head">
          <h3>Últimos 5 pedidos</h3>
        </div>

        <div className="table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Cliente</th>
                <th>Entrega</th>
                <th>Estado</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {latestOrders.map((order) => (
                <tr
                  key={order.id}
                  className="dashboard-row-link"
                  onClick={() => navigate(`/pedidos?open=${encodeURIComponent(order.id)}`)}
                >
                  <td>{order.id}</td>
                  <td>{order.clientName || order.client || 'Sin cliente'}</td>
                  <td>{formatShortDate(order.deliveryDate)}</td>
                  <td>{order.status}</td>
                  <td>{formatCurrency(Number(order.total || 0))}</td>
                </tr>
              ))}

              {latestOrders.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-detail">
                    No hay pedidos registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dashboard-recent">
        <div className="card-head">
          <h3>Control de Stock</h3>
        </div>

        <div className="stock-alerts-grid">
          <article className="stock-alert-block">
            <h4>🔴 Productos con stock negativo</h4>
            <div className="table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Faltante</th>
                    <th>Sugerencia compra</th>
                  </tr>
                </thead>
                <tbody>
                  {negativeStockProducts.map((product) => {
                    const faltante = Math.abs(product.stockDisponible)
                    return (
                      <tr key={`neg-${product.id}`}>
                        <td>{product.name}</td>
                        <td>{faltante}</td>
                        <td>{faltante + product.stockMinimo}</td>
                      </tr>
                    )
                  })}

                  {negativeStockProducts.length === 0 && (
                    <tr>
                      <td colSpan={3} className="empty-detail">
                        Sin productos con stock negativo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <article className="stock-alert-block">
            <h4>🟡 Productos con stock bajo</h4>
            <div className="table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Disponible</th>
                    <th>Mínimo</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStockProducts.map((product) => (
                    <tr key={`low-${product.id}`}>
                      <td>{product.name}</td>
                      <td>{product.stockDisponible}</td>
                      <td>{product.stockMinimo}</td>
                    </tr>
                  ))}

                  {lowStockProducts.length === 0 && (
                    <tr>
                      <td colSpan={3} className="empty-detail">
                        Sin productos por debajo del mínimo.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </div>
      </section>
    </section>
  )
}

export default DashboardPage
