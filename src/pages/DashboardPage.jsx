import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { getClientsWithDebtCount } from '../utils/clients'
import { calculateStockSnapshot } from '../utils/stock'
import { calculateFinanceSummary, getCurrentMonthKey, getSampleMetrics } from '../utils/finance'
import { getDashboardProductionMetrics } from '../utils/production'
import { formatOrderId } from '../utils/orders'

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

const formatDecimal = (value) =>
  Number(value || 0).toLocaleString('es-AR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })

const stockAlertBadgeStyle = {
  display: 'inline-flex',
  justifyContent: 'center',
  minWidth: '110px',
}

function DashboardPage({ orders, products, clients, purchases, expenses }) {
  const navigate = useNavigate()
  const safeOrders = useMemo(() => (Array.isArray(orders) ? orders : []), [orders])
  const safePurchases = useMemo(() => (Array.isArray(purchases) ? purchases : []), [purchases])
  const safeExpenses = useMemo(() => (Array.isArray(expenses) ? expenses : []), [expenses])

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

  const monthlyFinanceSummary = useMemo(
    () =>
      calculateFinanceSummary({
        orders: safeOrders,
        purchases: safePurchases,
        expenses: safeExpenses,
        monthKey: getCurrentMonthKey(),
      }),
    [safeOrders, safePurchases, safeExpenses],
  )

  const monthlyRealCash = Number(monthlyFinanceSummary.monthlyNet || 0)
  const monthlyRealCashClassName =
    monthlyRealCash > 0
      ? 'dashboard-real-cash-value dashboard-real-cash-positive'
      : monthlyRealCash < 0
        ? 'dashboard-real-cash-value dashboard-real-cash-negative'
        : 'dashboard-real-cash-value dashboard-real-cash-neutral'

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

  const dailySummary = useMemo(() => {
    const todayKey = formatDateInput(new Date())

    return safeOrders.reduce(
      (acc, order) => {
        if (order?.isArchived === true) return acc
        if (String(order?.deliveryDate ?? '') !== todayKey) return acc

        const status = String(order?.status ?? '')
        if (status === 'Pendiente') acc.pending += 1
        if (status === 'En Proceso') acc.inProgress += 1
        if (status === 'Listo') acc.toDeliver += 1
        return acc
      },
      { pending: 0, inProgress: 0, toDeliver: 0 },
    )
  }, [safeOrders])

  const productionMetrics = useMemo(
    () => getDashboardProductionMetrics(safeOrders),
    [safeOrders],
  )

  const negativeStockProducts = useMemo(
    () => stockRows.filter((product) => Number(product.stockDisponible) <= 0),
    [stockRows],
  )

  const lowStockProducts = useMemo(
    () =>
      stockRows.filter(
        (product) =>
          Number(product.stockDisponible) > 0 &&
          Number(product.stockDisponible) <= 10,
      ),
    [stockRows],
  )

  return (
    <section className="page-section">
      <header className="page-header">
        <h2 className="section-title">Dashboard</h2>
        <p>Resumen ejecutivo en tiempo real basado en los pedidos registrados.</p>
      </header>

      <section className="dashboard-recent dashboard-real-cash-block">
        <article className="dashboard-card dashboard-real-cash-card">
          <p>💰 Caja real del mes (cobrado - invertido - egresos)</p>
          <strong className={monthlyRealCashClassName}>{formatCurrency(monthlyRealCash)}</strong>
        </article>
      </section>

      <section className="dashboard-recent">
        <div className="card-head">
          <h3>Resumen del día</h3>
        </div>
        <div className="dashboard-day-summary-grid">
          <article className="dashboard-card dashboard-day-summary-card">
            <p>🟡 Pedidos pendientes</p>
            <strong>{String(dailySummary.pending)}</strong>
          </article>
          <article className="dashboard-card dashboard-day-summary-card">
            <p>🔵 En proceso</p>
            <strong>{String(dailySummary.inProgress)}</strong>
          </article>
          <article className="dashboard-card dashboard-day-summary-card">
            <p>🚚 Por entregar</p>
            <strong>{String(dailySummary.toDeliver)}</strong>
          </article>
        </div>
      </section>

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
                  <td>{formatOrderId(order.id)}</td>
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
            <h4>🔴 Sin stock</h4>
            <div className="table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Estado</th>
                    <th>Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {negativeStockProducts.map((product) => (
                    <tr key={`neg-${product.id}`}>
                      <td>{product.name}</td>
                      <td>
                        <span className="status-badge status-cancelado" style={stockAlertBadgeStyle}>🔴 Sin stock</span>
                      </td>
                      <td>{product.stockDisponible}</td>
                    </tr>
                  ))}

                  {negativeStockProducts.length === 0 && (
                    <tr>
                      <td colSpan={3} className="empty-detail">
                        Sin alertas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>

          <article className="stock-alert-block">
            <h4>🟡 Bajo stock</h4>
            <div className="table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Estado</th>
                    <th>Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStockProducts.map((product) => (
                    <tr key={`low-${product.id}`}>
                      <td>{product.name}</td>
                      <td>
                        <span className="status-badge status-pendiente" style={stockAlertBadgeStyle}>🟡 Bajo stock</span>
                      </td>
                      <td>{product.stockDisponible}</td>
                    </tr>
                  ))}

                  {lowStockProducts.length === 0 && (
                    <tr>
                      <td colSpan={3} className="empty-detail">
                        Sin alertas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </div>
      </section>

      <section className="dashboard-recent">
        <div className="card-head">
          <h3>🖨️ PRODUCCIÓN</h3>
        </div>

        <div className="dashboard-grid">
          <article className="dashboard-card">
            <p>Cajas impresas hoy</p>
            <strong>{String(productionMetrics.boxesToday)}</strong>
          </article>

          <article className="dashboard-card">
            <p>Cajas impresas esta semana</p>
            <strong>{String(productionMetrics.boxesWeek)}</strong>
          </article>

          <article className="dashboard-card">
            <p>Cajas impresas este mes</p>
            <strong>{String(productionMetrics.boxesMonth)}</strong>
          </article>

          <article className="dashboard-card">
            <p>Trabajos realizados este mes</p>
            <strong>{String(productionMetrics.jobsMonth)}</strong>
          </article>

          <article className="dashboard-card">
            <p>Muestras del mes</p>
            <strong>{String(productionMetrics.samplesMonth)}</strong>
          </article>

          <article className="dashboard-card">
            <p>Promedio diario del mes actual</p>
            <strong>{formatDecimal(productionMetrics.averageDailyMonth)}</strong>
          </article>
        </div>
      </section>
    </section>
  )
}

export default DashboardPage
