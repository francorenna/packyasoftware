import { useMemo, useState } from 'react'
import {
  calculateFinanceSummary,
  getCurrentMonthKey,
  getMonthlyFinanceMovements,
} from '../utils/finance'
import { buildMonthlyProfit } from '../utils/profit'

const formatCurrency = (value) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value)

const resultClassName = (value) => {
  if (value > 0) return 'finance-result finance-result-positive'
  if (value < 0) return 'finance-result finance-result-negative'
  return 'finance-result'
}

const formatDateTime = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sin fecha'
  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

const formatPercent = (value) => {
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0
  return `${safeValue.toLocaleString('es-AR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`
}

function FinancePage({ orders, purchases, products }) {
  const [selectedMonth, setSelectedMonth] = useState(() => getCurrentMonthKey())
  const [movementFilter, setMovementFilter] = useState('Todos')

  const summary = useMemo(
    () =>
      calculateFinanceSummary({
        orders,
        purchases,
        monthKey: selectedMonth,
      }),
    [orders, purchases, selectedMonth],
  )

  const monthlyMovements = useMemo(
    () =>
      getMonthlyFinanceMovements({
        orders,
        purchases,
        monthKey: selectedMonth,
      }),
    [orders, purchases, selectedMonth],
  )

  const visibleMovements = useMemo(() => {
    if (movementFilter === 'Solo ingresos') {
      return monthlyMovements.filter((movement) => movement.type === 'Ingreso')
    }
    if (movementFilter === 'Solo egresos') {
      return monthlyMovements.filter((movement) => movement.type === 'Egreso')
    }
    return monthlyMovements
  }, [monthlyMovements, movementFilter])

  const monthlyProfit = useMemo(
    () => buildMonthlyProfit(orders, purchases, selectedMonth, products),
    [orders, purchases, selectedMonth, products],
  )

  const topProducts = useMemo(
    () =>
      Object.values(monthlyProfit.productProfitMap).sort(
        (a, b) => Number(b.profit || 0) - Number(a.profit || 0),
      ),
    [monthlyProfit],
  )

  return (
    <section className="page-section">
      <header className="page-header">
        <h2>Finanzas</h2>
        <p>Control de caja diaria y seguimiento financiero mensual.</p>
      </header>

      <section className="dashboard-recent finance-controls">
        <div className="field">
          <label htmlFor="finance-month">Mes a analizar</label>
          <input
            id="finance-month"
            type="month"
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
          />
        </div>
      </section>

      <section className="dashboard-recent">
        <div className="card-head">
          <h3>Caja diaria (Hoy)</h3>
        </div>

        <div className="dashboard-grid">
          <article className="dashboard-card">
            <p>Total cobrado hoy</p>
            <strong>{formatCurrency(summary.dailyCollected)}</strong>
          </article>

          <article className="dashboard-card">
            <p>Total invertido hoy</p>
            <strong>{formatCurrency(summary.dailyInvested)}</strong>
          </article>

          <article className="dashboard-card">
            <p>Resultado neto del día</p>
            <strong className={resultClassName(summary.dailyNet)}>
              {formatCurrency(summary.dailyNet)}
            </strong>
          </article>
        </div>
      </section>

      <section className="dashboard-recent">
        <div className="card-head">
          <h3>Resumen mensual</h3>
        </div>

        <div className="dashboard-grid">
          <article className="dashboard-card">
            <p>Total facturado del mes</p>
            <strong>{formatCurrency(summary.monthlyInvoiced)}</strong>
          </article>

          <article className="dashboard-card">
            <p>Total cobrado del mes</p>
            <strong>{formatCurrency(summary.monthlyCollected)}</strong>
          </article>

          <article className="dashboard-card">
            <p>Total invertido en compras del mes</p>
            <strong>{formatCurrency(summary.monthlyInvested)}</strong>
          </article>

          <article className="dashboard-card">
            <p>Resultado mensual parcial</p>
            <strong className={resultClassName(summary.monthlyNet)}>
              {formatCurrency(summary.monthlyNet)}
            </strong>
          </article>
        </div>
      </section>

      <section className="dashboard-recent">
        <div className="card-head">
          <h3>Rentabilidad real del mes</h3>
        </div>

        <div className="dashboard-grid">
          <article className="dashboard-card">
            <p>Ingresos reales</p>
            <strong>{formatCurrency(monthlyProfit.totalRevenue)}</strong>
          </article>

          <article className="dashboard-card">
            <p>Costo mercadería vendida</p>
            <strong>{formatCurrency(monthlyProfit.totalCost)}</strong>
            {monthlyProfit.costIsEstimated && (
              <span className="muted-label">Costo estimado basado en costo de referencia</span>
            )}
          </article>

          <article className="dashboard-card">
            <p>Ganancia bruta</p>
            <strong className={resultClassName(monthlyProfit.totalProfit)}>
              {formatCurrency(monthlyProfit.totalProfit)}
            </strong>
          </article>

          <article className="dashboard-card">
            <p>Margen %</p>
            <strong className={resultClassName(monthlyProfit.marginPercent)}>
              {formatPercent(monthlyProfit.marginPercent)}
            </strong>
          </article>
        </div>

        <div className="card-head finance-products-head">
          <h3>Productos más rentables</h3>
        </div>

        <div className="table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Unidades vendidas</th>
                <th>Ingresos</th>
                <th>Costo</th>
                <th>Ganancia</th>
              </tr>
            </thead>
            <tbody>
              {topProducts.map((product) => (
                <tr key={product.productId}>
                  <td>{product.productName}</td>
                  <td>{Number(product.unitsSold || 0)}</td>
                  <td>{formatCurrency(Number(product.revenue || 0))}</td>
                  <td>{formatCurrency(Number(product.cost || 0))}</td>
                  <td className={resultClassName(Number(product.profit || 0))}>
                    {formatCurrency(Number(product.profit || 0))}
                  </td>
                </tr>
              ))}

              {topProducts.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-detail">
                    No hay productos rentables para el mes seleccionado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dashboard-recent">
        <div className="card-head">
          <h3>Movimientos financieros del mes</h3>
          <label className="finance-filter">
            <span>Filtrar</span>
            <select
              className="inline-select"
              value={movementFilter}
              onChange={(event) => setMovementFilter(event.target.value)}
            >
              <option>Todos</option>
              <option>Solo ingresos</option>
              <option>Solo egresos</option>
            </select>
          </label>
        </div>

        <div className="table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Concepto</th>
                <th>Monto</th>
              </tr>
            </thead>
            <tbody>
              {visibleMovements.map((movement) => (
                <tr key={movement.id}>
                  <td>{formatDateTime(movement.date)}</td>
                  <td>{movement.type}</td>
                  <td>{movement.concept}</td>
                  <td
                    className={
                      movement.type === 'Ingreso'
                        ? 'finance-result-positive'
                        : 'finance-result-negative'
                    }
                  >
                    {formatCurrency(movement.amount)}
                  </td>
                </tr>
              ))}

              {visibleMovements.length === 0 && (
                <tr>
                  <td colSpan={4} className="empty-detail">
                    No hay movimientos para el filtro seleccionado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}

export default FinancePage