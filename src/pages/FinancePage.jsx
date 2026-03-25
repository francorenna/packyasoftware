import { useMemo, useState } from 'react'
import {
  calculateFinanceSummary,
  getCurrentMonthKey,
  getMonthlyFinanceMovements,
} from '../utils/finance'
import { buildMonthlyProfit } from '../utils/profit'
import { getMonthlyProductionClosure } from '../utils/production'

const companyExpenseCategories = ['Insumos', 'Reparación', 'Alquiler', 'Servicios', 'Otros']
const partnerOptions = ['DAMIAN', 'FRANCO']

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

const getTodayDateKey = () => {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function FinancePage({
  orders,
  purchases,
  products,
  expenses,
  onAddExpense,
  onDeleteExpense,
  getMonthlyExpenses,
}) {
  const [selectedMonth, setSelectedMonth] = useState(() => getCurrentMonthKey())
  const [movementFilter, setMovementFilter] = useState('Todos')
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false)
  const [expenseForm, setExpenseForm] = useState(() => ({
    type: 'empresa',
    person: null,
    amount: '',
    category: companyExpenseCategories[0],
    reason: '',
    date: getTodayDateKey(),
    note: '',
  }))
  const [expenseFormError, setExpenseFormError] = useState('')

  const [selectedYear, selectedMonthNumber] = useMemo(() => {
    const [year, month] = String(selectedMonth ?? '').split('-')
    return [Number(year), Number(month)]
  }, [selectedMonth])

  const monthlyExpenses = useMemo(() => {
    if (typeof getMonthlyExpenses === 'function') {
      return getMonthlyExpenses(selectedMonthNumber, selectedYear)
    }

    const safeExpenses = Array.isArray(expenses) ? expenses : []
    return safeExpenses.filter((expense) => String(expense?.date ?? '').slice(0, 7) === selectedMonth)
  }, [expenses, getMonthlyExpenses, selectedMonth, selectedMonthNumber, selectedYear])

  const totalMonthlyExpenses = useMemo(
    () => monthlyExpenses.reduce((acc, expense) => acc + Number(expense?.amount || 0), 0),
    [monthlyExpenses],
  )

  const summary = useMemo(
    () =>
      calculateFinanceSummary({
        orders,
        purchases,
        expenses,
        monthKey: selectedMonth,
      }),
    [orders, purchases, expenses, selectedMonth],
  )

  const monthlyMovements = useMemo(
    () =>
      getMonthlyFinanceMovements({
        orders,
        purchases,
        expenses,
        monthKey: selectedMonth,
      }),
    [orders, purchases, expenses, selectedMonth],
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

  const monthlyProduction = useMemo(
    () => getMonthlyProductionClosure(orders, selectedMonth),
    [orders, selectedMonth],
  )

  const averageTicket = useMemo(() => {
    const completedJobs = Number(monthlyProduction.completedJobs || 0)
    if (completedJobs <= 0) return 0
    return Number(summary.monthlyInvoiced || 0) / completedJobs
  }, [monthlyProduction.completedJobs, summary.monthlyInvoiced])

  const topProducts = useMemo(
    () =>
      Object.values(monthlyProfit.productProfitMap).sort(
        (a, b) => Number(b.profit || 0) - Number(a.profit || 0),
      ),
    [monthlyProfit],
  )

  const openExpenseModal = () => {
    setExpenseForm({
      type: 'empresa',
      person: null,
      amount: '',
      category: companyExpenseCategories[0],
      reason: '',
      date: getTodayDateKey(),
      note: '',
    })
    setExpenseFormError('')
    setIsExpenseModalOpen(true)
  }

  const closeExpenseModal = () => {
    setIsExpenseModalOpen(false)
    setExpenseFormError('')
  }

  const handleSaveExpense = () => {
    const normalizedAmount = Number(expenseForm.amount)
    const normalizedReason = String(expenseForm.reason ?? '').trim()
    const normalizedDate = String(expenseForm.date ?? '').trim()
    const normalizedType = String(expenseForm.type ?? 'empresa').trim().toLowerCase() === 'socio' ? 'socio' : 'empresa'
    const normalizedPerson = normalizedType === 'socio'
      ? String(expenseForm.person ?? '').trim().toUpperCase()
      : null
    const normalizedCategory = normalizedType === 'empresa'
      ? String(expenseForm.category ?? companyExpenseCategories[0]).trim()
      : 'Retiro socio'

    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      setExpenseFormError('Ingresá un monto válido mayor a 0.')
      return
    }

    if (!normalizedReason) {
      setExpenseFormError('Completá el motivo del egreso.')
      return
    }

    if (normalizedType === 'socio' && !partnerOptions.includes(normalizedPerson)) {
      setExpenseFormError('Seleccioná un socio para registrar el retiro.')
      return
    }

    if (normalizedType === 'empresa' && !normalizedCategory) {
      setExpenseFormError('Seleccioná una categoría para el egreso de empresa.')
      return
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
      setExpenseFormError('Seleccioná una fecha válida.')
      return
    }

    const savedExpense = onAddExpense?.({
      type: normalizedType,
      person: normalizedPerson,
      amount: normalizedAmount,
      category: normalizedCategory,
      reason: normalizedReason,
      description: normalizedReason,
      date: normalizedDate,
      note: String(expenseForm.note ?? '').trim(),
    })

    if (!savedExpense) {
      setExpenseFormError('No se pudo guardar el egreso. Revisá los datos cargados.')
      return
    }

    closeExpenseModal()
  }

  return (
    <section className="page-section">
      <header className="page-header">
        <h2 className="section-title">Finanzas</h2>
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
            <p>Total egresado hoy</p>
            <strong>{formatCurrency(summary.dailyOutflow)}</strong>
            <span className="muted-label">
              Compras: {formatCurrency(summary.dailyInvested)} · Egresos manuales: {formatCurrency(summary.dailyManualExpenses)}
            </span>
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
        <p className="payment-helper">
          Facturación del mes (pedidos entregados) · Cobrado real del mes · Resultado caja real
        </p>

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
          <h3>💸 Egresos del mes</h3>
          <button type="button" className="primary-btn" onClick={openExpenseModal}>
            + Nuevo egreso
          </button>
        </div>

        <div className="dashboard-grid">
          <article className="dashboard-card">
            <p>Total egresado del mes</p>
            <strong className="finance-result-negative">{formatCurrency(totalMonthlyExpenses)}</strong>
          </article>
        </div>

        <div className="table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Socio</th>
                <th>Categoría</th>
                <th>Motivo</th>
                <th>Observación</th>
                <th>Monto</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {monthlyExpenses.map((expense) => (
                <tr key={expense.id}>
                  <td>{formatDateTime(expense.date)}</td>
                  <td>{expense.type === 'socio' ? 'Socio' : 'Empresa'}</td>
                  <td>{expense.type === 'socio' ? String(expense.person ?? '—') : '—'}</td>
                  <td>{expense.category}</td>
                  <td>{String(expense.reason ?? expense.description ?? '').trim() || '—'}</td>
                  <td>{expense.note || '—'}</td>
                  <td className="finance-result-negative">{formatCurrency(Number(expense.amount || 0))}</td>
                  <td>
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() => onDeleteExpense?.(expense.id)}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}

              {monthlyExpenses.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty-detail">
                    No hay egresos manuales registrados para el mes seleccionado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
            <strong className={resultClassName(monthlyProfit.totalProfit - totalMonthlyExpenses)}>
              {formatCurrency(monthlyProfit.totalProfit - totalMonthlyExpenses)}
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
          <h3>📅 CIERRE MENSUAL</h3>
        </div>

        <div className="dashboard-grid">
          <article className="dashboard-card">
            <p>Cajas producidas</p>
            <strong>{String(monthlyProduction.producedBoxes)}</strong>
          </article>

          <article className="dashboard-card">
            <p>Trabajos realizados</p>
            <strong>{String(monthlyProduction.completedJobs)}</strong>
          </article>

          <article className="dashboard-card">
            <p>Muestras</p>
            <strong>{String(monthlyProduction.samples)}</strong>
          </article>

          <article className="dashboard-card">
            <p>Total facturado</p>
            <strong>{formatCurrency(summary.monthlyInvoiced)}</strong>
          </article>

          <article className="dashboard-card">
            <p>Total cobrado</p>
            <strong>{formatCurrency(summary.monthlyCollected)}</strong>
          </article>

          <article className="dashboard-card">
            <p>Total invertido</p>
            <strong>{formatCurrency(summary.monthlyInvested)}</strong>
          </article>

          <article className="dashboard-card">
            <p>Ganancia neta</p>
            <strong className={resultClassName(summary.monthlyNet)}>
              {formatCurrency(summary.monthlyNet)}
            </strong>
          </article>

          <article className="dashboard-card">
            <p>Margen promedio</p>
            <strong className={resultClassName(monthlyProfit.marginPercent)}>
              {formatPercent(monthlyProfit.marginPercent)}
            </strong>
          </article>

          <article className="dashboard-card">
            <p>Ticket promedio</p>
            <strong>{formatCurrency(averageTicket)}</strong>
          </article>
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
                <th>Categoría</th>
                <th>Monto</th>
              </tr>
            </thead>
            <tbody>
              {visibleMovements.map((movement) => (
                <tr key={movement.id}>
                  <td>{formatDateTime(movement.date)}</td>
                  <td>{movement.type}</td>
                  <td>{movement.concept}</td>
                  <td>{String(movement.category ?? '').trim() || '—'}</td>
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
                  <td colSpan={5} className="empty-detail">
                    No hay movimientos para el filtro seleccionado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isExpenseModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h4>Nuevo egreso</h4>

            <div className="adjustment-grid" style={{ marginTop: 12 }}>
              <label>
                Monto
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={expenseForm.amount}
                  onChange={(event) =>
                    setExpenseForm((prev) => ({ ...prev, amount: event.target.value }))
                  }
                  placeholder="0"
                  required
                />
              </label>

              <label>
                Tipo de egreso
                <select
                  value={expenseForm.type}
                  onChange={(event) =>
                    setExpenseForm((prev) => {
                      const nextType = String(event.target.value ?? 'empresa') === 'socio' ? 'socio' : 'empresa'
                      return {
                        ...prev,
                        type: nextType,
                        person: nextType === 'socio' ? partnerOptions[0] : null,
                        category: nextType === 'empresa' ? (prev.category || companyExpenseCategories[0]) : 'Retiro socio',
                      }
                    })
                  }
                >
                  <option value="empresa">Empresa</option>
                  <option value="socio">Socio</option>
                </select>
              </label>

              {expenseForm.type === 'socio' ? (
                <label>
                  Socio
                  <select
                    value={String(expenseForm.person ?? '')}
                    onChange={(event) =>
                      setExpenseForm((prev) => ({ ...prev, person: String(event.target.value ?? '').trim().toUpperCase() }))
                    }
                  >
                    <option value="">Seleccionar socio</option>
                    {partnerOptions.map((partner) => (
                      <option key={partner} value={partner}>
                        {partner}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label>
                Categoría
                <select
                  value={expenseForm.category}
                  onChange={(event) =>
                    setExpenseForm((prev) => ({ ...prev, category: event.target.value }))
                  }
                >
                  {companyExpenseCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              )}

              <label>
                Motivo
                <input
                  type="text"
                  value={expenseForm.reason}
                  onChange={(event) =>
                    setExpenseForm((prev) => ({ ...prev, reason: event.target.value }))
                  }
                  placeholder="Motivo del egreso"
                  required
                />
              </label>

              <label>
                Fecha
                <input
                  type="date"
                  value={expenseForm.date}
                  onChange={(event) =>
                    setExpenseForm((prev) => ({ ...prev, date: event.target.value }))
                  }
                />
              </label>

              <label>
                Observación
                <textarea
                  rows={3}
                  value={expenseForm.note}
                  onChange={(event) =>
                    setExpenseForm((prev) => ({ ...prev, note: event.target.value }))
                  }
                  placeholder="Observación opcional"
                />
              </label>

              {expenseFormError && <p className="payment-error">{expenseFormError}</p>}

              <div className="product-actions">
                <button type="button" className="secondary-btn" onClick={closeExpenseModal}>
                  Cancelar
                </button>
                <button type="button" className="primary-btn" onClick={handleSaveExpense}>
                  Guardar egreso
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default FinancePage