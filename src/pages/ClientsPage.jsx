import { useMemo, useState } from 'react'
import { getClientStatsMap } from '../utils/clients'
import { generateClientStatementPDF } from '../utils/pdf'

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
  address: '',
  notes: '',
})

const normalizePhone = (value) => String(value ?? '').replace(/[^\d]/g, '').trim()
const toPositiveNumber = (value) => {
  const parsed = Number(value)
  return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed
}

function ClientsPage({ clients, orders, onSaveClient, onDeleteClient }) {
  const [form, setForm] = useState(createInitialForm())
  const [editingId, setEditingId] = useState(null)
  const [selectedClientId, setSelectedClientId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [listFilter, setListFilter] = useState('all')

  const safeClients = Array.isArray(clients) ? clients : []
  const safeOrders = Array.isArray(orders) ? orders : []

  const statsMap = useMemo(
    () => getClientStatsMap(safeClients, safeOrders),
    [safeClients, safeOrders],
  )

  const selectedClient = useMemo(
    () => safeClients.find((client) => client.id === selectedClientId) ?? null,
    [safeClients, selectedClientId],
  )

  const selectedStats = selectedClient ? statsMap[selectedClient.id] : null

  const deliveredUnpaidCount = useMemo(() => {
    if (!selectedStats) return 0

    return selectedStats.orders.reduce((acc, order) => {
      const orderStatus = String(order?.status ?? '')
      if (orderStatus !== 'Entregado') return acc

      const total = toPositiveNumber(order?.total)
      const totalPaid = (Array.isArray(order?.payments) ? order.payments : []).reduce(
        (sum, payment) => sum + toPositiveNumber(payment?.amount),
        0,
      )
      const remainingDebt = Math.max(total - totalPaid, 0)
      return remainingDebt > 0 ? acc + 1 : acc
    }, 0)
  }, [selectedStats])

  const filteredClients = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()

    return safeClients.filter((client) => {
      const stats = statsMap[client.id]
      const matchesQuery =
        !query ||
        client.name.toLowerCase().includes(query) ||
        String(client.phone ?? '').toLowerCase().includes(query)

      if (!matchesQuery) return false
      if (listFilter === 'debt') return (stats?.totalPendiente ?? 0) > 0
      if (listFilter === 'active') return (stats?.activeOrdersCount ?? 0) > 0
      return true
    })
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
      address: form.address,
      notes: form.notes,
    })

    if (saved?.id) {
      setSelectedClientId(saved.id)
    }

    setEditingId(null)
    setForm(createInitialForm())
  }

  const handleEdit = (client) => {
    setEditingId(client.id)
    setSelectedClientId(client.id)
    setForm({
      id: client.id,
      name: client.name,
      phone: client.phone,
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
    if (selectedClientId === client.id) {
      setSelectedClientId(null)
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
                  <th>Deuda actual</th>
                  <th>Último pedido</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map((client) => {
                  const stats = statsMap[client.id]
                  return (
                    <tr key={client.id}>
                      <td>
                        <button
                          type="button"
                          className="quick-fill-btn"
                          onClick={() => setSelectedClientId(client.id)}
                        >
                          {client.name}
                        </button>
                      </td>
                      <td>{client.phone || '-'}</td>
                      <td>{formatCurrency(stats?.totalPendiente ?? 0)}</td>
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
                  )
                })}

                {safeClients.length === 0 && (
                  <tr>
                    <td colSpan={5} className="empty-detail">
                      No hay clientes registrados.
                    </td>
                  </tr>
                )}

                {safeClients.length > 0 && filteredClients.length === 0 && (
                  <tr>
                    <td colSpan={5} className="empty-detail">
                      No hay resultados para los filtros aplicados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {selectedClient && selectedStats && (
        <section className="dashboard-recent">
          <div className="card-head">
            <h3>Ficha de cliente · {selectedClient.name}</h3>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => {
                generateClientStatementPDF(selectedClient, selectedStats.orders).catch(() => {
                  window.alert('No se pudo generar el estado de cuenta del cliente.')
                })
              }}
            >
              📄 Generar estado de cuenta
            </button>
          </div>

          <div className="client-detail-grid">
            <div className="card-block">
              <p><strong>Teléfono:</strong> {selectedClient.phone || '-'}</p>
              <p><strong>Dirección:</strong> {selectedClient.address || '-'}</p>
              <p><strong>Notas:</strong> {selectedClient.notes || '-'}</p>
              <p><strong>Alta:</strong> {formatDate(selectedClient.createdAt)}</p>
            </div>

            <div className="card-block">
              <p><strong>Total facturado:</strong> {formatCurrency(selectedStats.totalFacturado)}</p>
              <p><strong>Total pagado:</strong> {formatCurrency(selectedStats.totalPagado)}</p>
              <p><strong>Total pendiente:</strong> {formatCurrency(selectedStats.totalPendiente)}</p>
              <p>
                <strong>Total adeudado actual:</strong>{' '}
                <span className={selectedStats.totalPendiente > 0 ? 'finance-result-negative' : ''}>
                  {formatCurrency(selectedStats.totalPendiente)}
                </span>
              </p>
              <p>
                <strong>Pedidos entregados sin pagar:</strong> {deliveredUnpaidCount}
              </p>
              <p><strong>Última compra:</strong> {formatDate(selectedStats.lastOrderDate)}</p>
            </div>
          </div>

          <div className="table-wrap client-orders-table">
            <table className="products-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Entrega</th>
                  <th>Estado</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {selectedStats.orders
                  .slice()
                  .sort(
                    (a, b) =>
                      new Date(b.deliveryDate || 0).getTime() -
                      new Date(a.deliveryDate || 0).getTime(),
                  )
                  .map((order) => (
                    <tr key={order.id}>
                      <td>{order.id}</td>
                      <td>{formatDate(order.deliveryDate)}</td>
                      <td>{order.status}</td>
                      <td>{formatCurrency(Number(order.total || 0))}</td>
                    </tr>
                  ))}

                {selectedStats.orders.length === 0 && (
                  <tr>
                    <td colSpan={4} className="empty-detail">
                      Este cliente no tiene pedidos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  )
}

export default ClientsPage
