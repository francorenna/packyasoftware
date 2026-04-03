import { Fragment, useMemo, useState } from 'react'
import { getOrderFinancialSummary } from '../utils/finance'
import { generateClientAccountPDF } from '../utils/reportsPdf'

const formatCurrency = (value) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value)

const formatDate = (value) => {
  if (!value) return 'Sin fecha'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sin fecha'
  return date.toLocaleDateString('es-AR')
}

const createInitialForm = () => ({
  id: '',
  name: '',
  phone: '',
  email: '',
  address: '',
  notes: '',
})

const normalizePhone = (value) => String(value ?? '').replace(/[^\d]/g, '').trim()
const paymentMethods = ['Efectivo', 'Transferencia', 'MercadoPago']
const HIGH_DEBT_THRESHOLD = 250000

const getPaymentStatus = (paid, balance) => {
  const safePaid = Number(paid) || 0
  const safeBalance = Number(balance) || 0

  if (safeBalance === 0) return 'Pagado'
  if (safePaid > 0 && safeBalance > 0) return 'Parcial'
  return 'Pendiente'
}

const getPaymentStatusClass = (status) => {
  if (status === 'Pagado') return 'badge-paid'
  if (status === 'Parcial') return 'badge-partial'
  return 'badge-pending'
}

const toTimestamp = (value) => {
  const parsed = new Date(value)
  const timestamp = parsed.getTime()
  return Number.isNaN(timestamp) ? 0 : timestamp
}

const normalizeName = (value) => String(value ?? '').trim().toLowerCase()

const isOrderFromClient = (order, client) => {
  const orderClientId = String(order?.clientId ?? '').trim()
  const clientId = String(client?.id ?? '').trim()
  if (orderClientId && clientId) return orderClientId === clientId

  const orderClientName = normalizeName(order?.clientName ?? order?.client)
  const clientName = normalizeName(client?.name)
  return Boolean(orderClientName && clientName && orderClientName === clientName)
}

const getDaysBetween = (value, now) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 0
  const diffMs = now.getTime() - date.getTime()
  return Math.max(Math.floor(diffMs / (1000 * 60 * 60 * 24)), 0)
}

const buildClientOrdersTimeline = (client, orders) => {
  const safeOrders = Array.isArray(orders) ? orders : []

  const rows = safeOrders
    .filter((order) => !order?.isSample)
    .filter((order) => isOrderFromClient(order, client))
    .map((order) => {
      const financial = getOrderFinancialSummary(order)
      const status = String(order?.status ?? '')
      const isCancelled = status === 'Cancelado'
      const total = isCancelled ? 0 : Number(financial.finalTotal || 0)
      const paid = isCancelled ? 0 : Number(financial.totalPaid || 0)
      const balance = isCancelled ? 0 : Number(financial.remainingDebt || 0)

      return {
        id: String(order?.id ?? ''),
        status,
        createdAt: String(order?.createdAt ?? ''),
        deliveryDate: String(order?.deliveryDate ?? ''),
        total,
        paid,
        balance,
        order,
      }
    })
    .sort((a, b) => toTimestamp(a.createdAt || a.deliveryDate) - toTimestamp(b.createdAt || b.deliveryDate))

  let runningBalance = 0
  return rows.map((row) => {
    runningBalance += row.balance
    return {
      ...row,
      currentAccount: runningBalance,
    }
  })
}

function ClientsPage({
  clients,
  orders,
  onSaveClient,
  onDeleteClient,
  onRegisterPayment,
  onRegisterOrderAdjustment,
  onAddOrderObservation,
}) {
  const [form, setForm] = useState(createInitialForm())
  const [editingId, setEditingId] = useState(null)
  const [expandedClientId, setExpandedClientId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [listFilter, setListFilter] = useState('all')
  const [paymentDraft, setPaymentDraft] = useState({ orderId: '', amount: '', method: paymentMethods[0], note: '' })
  const [adjustmentDraft, setAdjustmentDraft] = useState({ orderId: '', amount: '', note: '' })
  const [observationDraft, setObservationDraft] = useState({ orderId: '', note: '' })

  const safeClients = useMemo(() => (Array.isArray(clients) ? clients : []), [clients])
  const safeOrders = useMemo(() => (Array.isArray(orders) ? orders : []), [orders])

  const statsMap = useMemo(() => {
    const map = safeClients.reduce((acc, client) => {
      acc[client.id] = {
        totalFacturado: 0,
        totalPagado: 0,
        totalPendiente: 0,
        activeOrdersCount: 0,
        lastOrderId: '',
        lastOrderDate: '',
      }
      return acc
    }, {})

    safeClients.forEach((client) => {
      const timeline = buildClientOrdersTimeline(client, safeOrders)
      timeline.forEach((row) => {
        map[client.id].totalFacturado += row.total
        map[client.id].totalPagado += row.paid
        map[client.id].totalPendiente += row.balance

        if (!['Entregado', 'Cancelado'].includes(row.status)) {
          map[client.id].activeOrdersCount += 1
        }

        const rowDate = row.deliveryDate || row.createdAt
        if (toTimestamp(rowDate) >= toTimestamp(map[client.id].lastOrderDate)) {
          map[client.id].lastOrderDate = rowDate
          map[client.id].lastOrderId = row.id
        }
      })
    })

    return map
  }, [safeClients, safeOrders])

  const expandedClient = useMemo(
    () => safeClients.find((client) => client.id === expandedClientId) ?? null,
    [expandedClientId, safeClients],
  )

  const expandedOrdersTimeline = useMemo(
    () => (expandedClient ? buildClientOrdersTimeline(expandedClient, safeOrders) : []),
    [expandedClient, safeOrders],
  )

  const deliveredUnpaidCount = useMemo(() => {
    if (expandedOrdersTimeline.length === 0) return 0

    return expandedOrdersTimeline.reduce((acc, row) => {
      if (row.status !== 'Entregado') return acc
      return row.balance > 0 ? acc + 1 : acc
    }, 0)
  }, [expandedOrdersTimeline])

  const filteredClients = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()

    return safeClients.filter((client) => {
      const stats = statsMap[client.id]
      const matchesQuery =
        !query ||
        client.name.toLowerCase().includes(query) ||
        String(client.phone ?? '').toLowerCase().includes(query) ||
        String(client.email ?? '').toLowerCase().includes(query)

      if (!matchesQuery) return false
      if (listFilter === 'debt') return (stats?.totalPendiente ?? 0) > 0
      if (listFilter === 'active') return (stats?.activeOrdersCount ?? 0) > 0
      return true
    }).sort((a, b) => String(a?.name ?? '').localeCompare(String(b?.name ?? ''), 'es', { sensitivity: 'base' }))
  }, [listFilter, safeClients, searchTerm, statsMap])

  const handleInput = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!form.name.trim()) return

    const normalizedPhone = normalizePhone(form.phone)
    if (normalizedPhone && !normalizedPhone.startsWith('549')) {
      window.alert('Advertencia: el teléfono debería comenzar con 549 (formato internacional).')
    }

    const saved = onSaveClient({
      id: editingId ?? undefined,
      name: form.name,
      phone: normalizedPhone,
      email: String(form.email ?? '').trim(),
      address: form.address,
      notes: form.notes,
    })

    if (saved?.id) {
      setExpandedClientId(saved.id)
    }

    setEditingId(null)
    setForm(createInitialForm())
  }

  const handleEdit = (client) => {
    setEditingId(client.id)
    setExpandedClientId(client.id)
    setForm({
      id: client.id,
      name: client.name,
      phone: client.phone,
      email: client.email,
      address: client.address,
      notes: client.notes,
    })
  }

  const handleDelete = (client) => {
    const stats = statsMap[client.id]
    const activeOrders = stats?.activeOrdersCount ?? 0

    if (activeOrders > 0) {
      const warningAccepted = window.confirm(
        `Este cliente tiene ${activeOrders} pedido(s) activo(s). ¿Querés eliminarlo igualmente?`,
      )
      if (!warningAccepted) return
    }

    const confirmed = window.confirm(`¿Eliminar cliente ${client.name}?`)
    if (!confirmed) return

    onDeleteClient(client.id)
    if (expandedClientId === client.id) {
      setExpandedClientId(null)
    }
    if (editingId === client.id) {
      setEditingId(null)
      setForm(createInitialForm())
    }
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setForm(createInitialForm())
  }

  const registerPayment = () => {
    const latestOrder = expandedOrdersTimeline[expandedOrdersTimeline.length - 1]
    const fallbackOrderId = String(latestOrder?.id ?? '')
    const orderId = String(paymentDraft.orderId || fallbackOrderId).trim()
    const amount = Number(paymentDraft.amount)
    const note = String(paymentDraft.note ?? '').trim()

    if (!orderId || !Number.isFinite(amount) || amount <= 0) return

    onRegisterPayment?.(orderId, {
      amount,
      method: paymentDraft.method,
      note,
    })

    setPaymentDraft((prev) => ({
      ...prev,
      amount: '',
      note: '',
    }))
  }

  const registerAdjustment = () => {
    const latestOrder = expandedOrdersTimeline[expandedOrdersTimeline.length - 1]
    const fallbackOrderId = String(latestOrder?.id ?? '')
    const orderId = String(adjustmentDraft.orderId || fallbackOrderId).trim()
    const amount = Number(adjustmentDraft.amount)
    const note = String(adjustmentDraft.note ?? '').trim()

    if (!orderId || !Number.isFinite(amount) || amount === 0 || !note) return

    onRegisterOrderAdjustment?.(orderId, {
      amount,
      note,
    })

    setAdjustmentDraft((prev) => ({
      ...prev,
      amount: '',
      note: '',
    }))
  }

  const addObservation = () => {
    const latestOrder = expandedOrdersTimeline[expandedOrdersTimeline.length - 1]
    const fallbackOrderId = String(latestOrder?.id ?? '')
    const orderId = String(observationDraft.orderId || fallbackOrderId).trim()
    const note = String(observationDraft.note ?? '').trim()
    if (!orderId || !note) return

    onAddOrderObservation?.(orderId, note)
    setObservationDraft((prev) => ({
      ...prev,
      note: '',
    }))
  }

  const accountOrderOptions = expandedOrdersTimeline
    .slice()
    .reverse()
    .map((row) => ({
      id: row.id,
      label: `${row.id} · ${formatDate(row.createdAt)} · Saldo ${formatCurrency(row.balance)}`,
    }))

  const defaultOrderOptionId = String(
    accountOrderOptions[0]?.id ?? expandedOrdersTimeline[expandedOrdersTimeline.length - 1]?.id ?? '',
  )

  const generateAccountPdf = () => {
    if (!expandedClient) return

    const now = new Date()
    const rows = expandedOrdersTimeline.map((row) => {
      const items = Array.isArray(row.order?.items) ? row.order.items : []
      const productsLabel = items
        .map((item) => {
          const name = String(item?.productName ?? item?.product ?? '').trim()
          const quantity = Number(item?.quantity || 0)
          if (!name) return null
          return `${name} x${quantity}`
        })
        .filter(Boolean)
        .join(' | ')

      return {
        clientKey: `id:${expandedClient.id}`,
        orderId: row.id,
        clientName: expandedClient.name,
        dateLabel: formatDate(row.createdAt),
        timeLabel: formatDate(row.createdAt) === 'Sin fecha'
          ? 'Sin hora'
          : new Date(row.createdAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }),
        productsLabel,
        total: row.total,
        paid: row.paid,
        balance: row.balance,
        daysSinceOrder: getDaysBetween(row.createdAt || row.deliveryDate, now),
      }
    })

    try {
      generateClientAccountPDF({
        rows,
        scopeLabel: expandedClient.name,
      })
    } catch {
      window.alert('No se pudo generar el estado de cuenta del cliente.')
    }
  }

  return (
    <section className="page-section">
      <header className="page-header">
        <h2>Clientes</h2>
        <p>Gestioná clientes, deuda dinámica e historial de pedidos.</p>
      </header>

      <div className="clients-grid">
        <section className="card-block">
          <div className="card-head">
            <h3>{editingId ? 'Editar cliente' : 'Nuevo cliente'}</h3>
          </div>

          <form className="order-form" onSubmit={handleSubmit}>
            <label>
              Nombre
              <input
                type="text"
                value={form.name}
                onChange={(event) => handleInput('name', event.target.value)}
                required
              />
            </label>
            <label>
              Teléfono
              <input
                type="text"
                value={form.phone}
                onChange={(event) => handleInput('phone', event.target.value)}
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={form.email}
                onChange={(event) => handleInput('email', event.target.value)}
              />
            </label>
            <label>
              Dirección
              <input
                type="text"
                value={form.address}
                onChange={(event) => handleInput('address', event.target.value)}
              />
            </label>
            <label>
              Notas
              <input
                type="text"
                value={form.notes}
                onChange={(event) => handleInput('notes', event.target.value)}
              />
            </label>

            <div className="product-actions">
              {editingId && (
                <button type="button" className="secondary-btn" onClick={handleCancelEdit}>
                  Cancelar
                </button>
              )}
              <button type="submit" className="primary-btn">
                {editingId ? 'Guardar cambios' : 'Agregar cliente'}
              </button>
            </div>
          </form>
        </section>

        <section className="card-block">
          <div className="card-head">
            <h3>Listado de clientes</h3>
          </div>

          <div className="clients-toolbar">
            <input
              type="text"
              placeholder="Buscar por nombre o teléfono"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />

            <div className="list-filters" role="group" aria-label="Filtrar clientes">
              <button
                type="button"
                className={`filter-btn ${listFilter === 'debt' ? 'filter-btn-active' : ''}`}
                onClick={() => setListFilter('debt')}
              >
                Solo con deuda
              </button>
              <button
                type="button"
                className={`filter-btn ${listFilter === 'active' ? 'filter-btn-active' : ''}`}
                onClick={() => setListFilter('active')}
              >
                Con pedidos activos
              </button>
              <button
                type="button"
                className={`filter-btn ${listFilter === 'all' ? 'filter-btn-active' : ''}`}
                onClick={() => setListFilter('all')}
              >
                Todos
              </button>
            </div>
          </div>

          <div className="table-wrap">
            <table className="products-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Teléfono</th>
                  <th>Email</th>
                  <th>Deuda actual</th>
                  <th>Último pedido</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((client) => {
                  const stats = statsMap[client.id]
                  const isExpanded = expandedClientId === client.id
                  const hasHighDebt = Number(stats?.totalPendiente ?? 0) > HIGH_DEBT_THRESHOLD

                  return (
                    <Fragment key={client.id}>
                      <tr>
                        <td>
                          <button
                            type="button"
                            className="quick-fill-btn"
                            onClick={() => setExpandedClientId((currentId) => (currentId === client.id ? null : client.id))}
                          >
                            {client.name}
                          </button>
                        </td>
                        <td>{client.phone || '-'}</td>
                        <td>{client.email || '-'}</td>
                        <td>
                          <div className="client-debt-cell">
                            <span>{formatCurrency(stats?.totalPendiente ?? 0)}</span>
                            {hasHighDebt && <span className="client-high-debt-badge">🔴 Cliente con deuda alta</span>}
                          </div>
                        </td>
                        <td>{stats?.lastOrderId || '-'}</td>
                        <td>
                          <div className="product-row-actions">
                            <button type="button" className="quick-fill-btn" onClick={() => handleEdit(client)}>
                              Editar
                            </button>
                            <button type="button" className="quick-fill-btn" onClick={() => handleDelete(client)}>
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr>
                          <td colSpan={6}>
                            <div className="client-accordion-panel">
                              <div className="card-head">
                                <h3>Ficha de cliente · {client.name}</h3>
                                <button
                                  type="button"
                                  className="secondary-btn"
                                  onClick={generateAccountPdf}
                                >
                                  Generar estado de cuenta
                                </button>
                              </div>

                              <div className="client-detail-grid">
                                <div className="card-block">
                                  <p><strong>Nombre:</strong> {client.name}</p>
                                  <p><strong>Teléfono:</strong> {client.phone || '-'}</p>
                                  <p><strong>Email:</strong> {client.email || '-'}</p>
                                  <p><strong>Dirección:</strong> {client.address || '-'}</p>
                                  <p><strong>Notas:</strong> {client.notes || '-'}</p>
                                </div>

                                <div className="client-summary-cards">
                                  <div className="client-summary-card facturado">
                                    <p className="client-summary-label">Facturado</p>
                                    <p className="client-summary-value">{formatCurrency(stats?.totalFacturado ?? 0)}</p>
                                  </div>
                                  <div className="client-summary-card pagado">
                                    <p className="client-summary-label">Pagado</p>
                                    <p className="client-summary-value">{formatCurrency(stats?.totalPagado ?? 0)}</p>
                                  </div>
                                  <div className="client-summary-card deuda">
                                    <p className="client-summary-label">Deuda</p>
                                    <p className="client-summary-value">{formatCurrency(stats?.totalPendiente ?? 0)}</p>
                                    {hasHighDebt && <p className="client-summary-alert">🔴 Cliente con deuda alta</p>}
                                  </div>
                                  <div className="client-summary-card">
                                    <p className="client-summary-label">Pedidos activos</p>
                                    <p className="client-summary-value">{stats?.activeOrdersCount ?? 0}</p>
                                  </div>
                                  <div className="client-summary-card">
                                    <p className="client-summary-label">Entregados sin pagar</p>
                                    <p className="client-summary-value">{deliveredUnpaidCount}</p>
                                  </div>
                                  <div className="client-summary-card">
                                    <p className="client-summary-label">Último pedido</p>
                                    <p className="client-summary-value">{stats?.lastOrderId || '-'}</p>
                                  </div>
                                </div>
                              </div>

                              <div className="table-wrap client-orders-table">
                                <table className="products-table">
                                  <thead>
                                    <tr>
                                      <th>ID</th>
                                      <th>Fecha creación</th>
                                      <th>Fecha entrega</th>
                                      <th>Total</th>
                                      <th>Pagado</th>
                                      <th>Saldo</th>
                                      <th>Estado</th>
                                      <th>Cuenta corriente</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {expandedOrdersTimeline.map((row) => {
                                      const paymentStatus = getPaymentStatus(row.paid, row.balance)

                                      return (
                                        <tr key={row.id}>
                                          <td>
                                            <a
                                              href={`#/pedidos?open=${encodeURIComponent(row.id)}`}
                                              className="quick-fill-btn"
                                            >
                                              {row.id}
                                            </a>
                                          </td>
                                          <td>{formatDate(row.createdAt)}</td>
                                          <td>{formatDate(row.deliveryDate)}</td>
                                          <td>{formatCurrency(row.total)}</td>
                                          <td>{formatCurrency(row.paid)}</td>
                                          <td>{formatCurrency(row.balance)}</td>
                                          <td>
                                            <span className={`payment-status-badge ${getPaymentStatusClass(paymentStatus)}`}>
                                              {paymentStatus}
                                            </span>
                                          </td>
                                          <td>{formatCurrency(row.currentAccount)}</td>
                                        </tr>
                                      )
                                    })}

                                    {expandedOrdersTimeline.length === 0 && (
                                      <tr>
                                        <td colSpan={8} className="empty-detail">
                                          Este cliente no tiene pedidos.
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>

                              {accountOrderOptions.length > 0 && (
                                <div className="client-actions-grid">
                                  <div className="card-block client-action-card client-action-primary">
                                    <h4>Registrar pago</h4>
                                    <label>
                                      Pedido
                                      <select
                                        value={paymentDraft.orderId || defaultOrderOptionId}
                                        onChange={(event) => setPaymentDraft((prev) => ({ ...prev, orderId: event.target.value }))}
                                      >
                                        {accountOrderOptions.map((option) => (
                                          <option key={option.id} value={option.id}>{option.label}</option>
                                        ))}
                                      </select>
                                    </label>
                                    <label>
                                      Monto
                                      <input
                                        type="number"
                                        min="0"
                                        value={paymentDraft.amount}
                                        onChange={(event) => setPaymentDraft((prev) => ({ ...prev, amount: event.target.value }))}
                                      />
                                    </label>
                                    <label>
                                      Método
                                      <select
                                        value={paymentDraft.method}
                                        onChange={(event) => setPaymentDraft((prev) => ({ ...prev, method: event.target.value }))}
                                      >
                                        {paymentMethods.map((method) => (
                                          <option key={method} value={method}>{method}</option>
                                        ))}
                                      </select>
                                    </label>
                                    <label>
                                      Observación
                                      <input
                                        type="text"
                                        value={paymentDraft.note}
                                        onChange={(event) => setPaymentDraft((prev) => ({ ...prev, note: event.target.value }))}
                                        placeholder="Ej: Pago parcial en efectivo"
                                      />
                                    </label>
                                    <button type="button" className="primary-btn" onClick={registerPayment}>
                                      Registrar pago
                                    </button>
                                  </div>

                                  <div className="card-block client-action-card client-action-neutral">
                                    <h4>Agregar observación</h4>
                                    <label>
                                      Pedido
                                      <select
                                        value={observationDraft.orderId || defaultOrderOptionId}
                                        onChange={(event) => setObservationDraft((prev) => ({ ...prev, orderId: event.target.value }))}
                                      >
                                        {accountOrderOptions.map((option) => (
                                          <option key={option.id} value={option.id}>{option.label}</option>
                                        ))}
                                      </select>
                                    </label>
                                    <label>
                                      Observación
                                      <input
                                        type="text"
                                        value={observationDraft.note}
                                        onChange={(event) => setObservationDraft((prev) => ({ ...prev, note: event.target.value }))}
                                        placeholder="Observación administrativa"
                                      />
                                    </label>
                                    <button type="button" className="secondary-btn" onClick={addObservation}>
                                      Guardar observación
                                    </button>
                                  </div>

                                  <div className="card-block client-action-card client-action-secondary">
                                    <h4 title="Permite corregir saldos manualmente (errores administrativos)">Ajuste administrativo</h4>
                                    <p className="payment-helper">Uso interno para correcciones. No representa un pago real.</p>
                                    <p className="payment-error">⚠ Esto no modifica pagos reales del cliente</p>
                                    <label>
                                      Pedido
                                      <select
                                        value={adjustmentDraft.orderId || defaultOrderOptionId}
                                        onChange={(event) => setAdjustmentDraft((prev) => ({ ...prev, orderId: event.target.value }))}
                                      >
                                        {accountOrderOptions.map((option) => (
                                          <option key={option.id} value={option.id}>{option.label}</option>
                                        ))}
                                      </select>
                                    </label>
                                    <label>
                                      Monto ajuste
                                      <input
                                        type="number"
                                        value={adjustmentDraft.amount}
                                        onChange={(event) => setAdjustmentDraft((prev) => ({ ...prev, amount: event.target.value }))}
                                        placeholder="Ej: 1500 o -800"
                                      />
                                    </label>
                                    <label>
                                      Motivo
                                      <input
                                        type="text"
                                        value={adjustmentDraft.note}
                                        onChange={(event) => setAdjustmentDraft((prev) => ({ ...prev, note: event.target.value }))}
                                        placeholder="Motivo del ajuste"
                                      />
                                    </label>
                                    <button type="button" className="secondary-btn" onClick={registerAdjustment}>
                                      Aplicar ajuste
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}

                {safeClients.length === 0 && (
                  <tr>
                    <td colSpan={6} className="empty-detail">
                      No hay clientes registrados.
                    </td>
                  </tr>
                )}

                {safeClients.length > 0 && filteredClients.length === 0 && (
                  <tr>
                    <td colSpan={6} className="empty-detail">
                      No hay resultados para los filtros aplicados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </section>
  )
}

export default ClientsPage
