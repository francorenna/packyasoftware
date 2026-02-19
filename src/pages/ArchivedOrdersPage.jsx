import { useMemo, useState } from 'react'
import { getOrderFinancialSummary } from '../utils/finance'

const normalizePhone = (value) => String(value ?? '').replace(/[^\d]/g, '').trim()

const createClientForm = () => ({
  name: '',
  phone: '',
  address: '',
})

const formatCurrency = (value) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))

const formatDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Sin fecha'

  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('es-AR')
}

const formatDateTime = (value) => {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Sin registro'

  return parsed.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function ArchivedOrdersPage({ orders, onReopenOrder, onCreateClient, onConvertSampleToRealOrder }) {
  const safeOrders = Array.isArray(orders) ? orders : []
  const [sampleConversionOrderId, setSampleConversionOrderId] = useState(null)
  const [sampleClientForm, setSampleClientForm] = useState(() => createClientForm())

  const archivedOrders = useMemo(
    () =>
      safeOrders
        .filter((order) => {
          if (order?.isArchived !== true) return false
          const orderStatus = String(order?.status ?? '')
          const { remainingDebt } = getOrderFinancialSummary(order)
          return !(orderStatus === 'Entregado' && remainingDebt > 0)
        })
        .sort((a, b) => {
          const aTime = new Date(a.archivedAt || 0).getTime()
          const bTime = new Date(b.archivedAt || 0).getTime()
          return bTime - aTime
        }),
    [safeOrders],
  )

  const closeSampleConversionModal = () => {
    setSampleConversionOrderId(null)
    setSampleClientForm(createClientForm())
  }

  const handleConfirmSampleConversion = () => {
    const orderId = String(sampleConversionOrderId ?? '')
    if (!orderId) return

    const name = String(sampleClientForm.name ?? '').trim()
    const phone = normalizePhone(sampleClientForm.phone)
    const address = String(sampleClientForm.address ?? '').trim()
    if (!name || !phone) return

    const createdClient = onCreateClient?.({
      name,
      phone,
      address,
      notes: '',
    })

    if (!createdClient?.id) {
      window.alert('No se pudo crear el cliente para dar de alta la muestra.')
      return
    }

    onConvertSampleToRealOrder?.(orderId, {
      clientId: String(createdClient.id),
      clientName: String(createdClient.name ?? name),
    })

    closeSampleConversionModal()
  }

  return (
    <section className="page-section">
      <header className="page-header">
        <h2>Pedidos Archivados</h2>
        <p>Historial de pedidos archivados, incluyendo muestras y pedidos completos.</p>
      </header>

      <section className="card-block">
        <div className="card-head">
          <h3>Archivados</h3>
        </div>

        <div className="table-wrap">
          <table className="orders-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Tipo</th>
                <th>Total</th>
                <th>Fecha producción</th>
                <th>Fecha entrega</th>
                <th>Tipo entrega</th>
                <th>Costo envío</th>
                <th>Fecha archivado</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {archivedOrders.map((order, index) => {
                const orderId = String(order.id ?? `archivado-${index}`)

                return (
                  <tr key={orderId}>
                    <td>{String(order.clientName ?? order.client ?? 'Sin cliente')}</td>
                    <td>
                      {order.isSample ? (
                        <span className="status-badge status-muestra">MUESTRA</span>
                      ) : (
                        <span className="muted-label">Pedido</span>
                      )}
                    </td>
                    <td>{formatCurrency(order.total)}</td>
                    <td>{formatDateTime(order.productionDate)}</td>
                    <td>{formatDate(order.deliveryDate)}</td>
                    <td>{String(order.deliveredVia ?? '').trim() || 'Sin registro'}</td>
                    <td>{formatCurrency(order.shippingCost)}</td>
                    <td>{formatDateTime(order.archivedAt)}</td>
                    <td>
                      {order.isSample ? (
                        <button
                          type="button"
                          className="primary-btn"
                          onClick={() => {
                            setSampleConversionOrderId(orderId)
                            setSampleClientForm(createClientForm())
                          }}
                        >
                          Dar alta como cliente
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="secondary-btn"
                          onClick={() => {
                            onReopenOrder?.(orderId)
                            window.location.hash = `#/pedidos?open=${encodeURIComponent(orderId)}`
                          }}
                        >
                          Reabrir pedido
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}

              {archivedOrders.length === 0 && (
                <tr>
                  <td colSpan={9} className="empty-detail">
                    No hay pedidos archivados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {sampleConversionOrderId && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h4>Dar alta muestra como pedido real</h4>
            <p className="payment-helper">
              Completá el cliente para convertir la muestra archivada en pedido normal.
            </p>

            <div className="adjustment-grid" style={{ marginTop: 10 }}>
              <label>
                Nombre
                <input
                  type="text"
                  value={sampleClientForm.name}
                  onChange={(event) =>
                    setSampleClientForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  required
                />
              </label>

              <label>
                Teléfono
                <input
                  type="text"
                  value={sampleClientForm.phone}
                  onChange={(event) =>
                    setSampleClientForm((prev) => ({ ...prev, phone: event.target.value }))
                  }
                  required
                />
              </label>

              <label>
                Dirección (opcional)
                <input
                  type="text"
                  value={sampleClientForm.address}
                  onChange={(event) =>
                    setSampleClientForm((prev) => ({ ...prev, address: event.target.value }))
                  }
                />
              </label>
            </div>

            <div className="product-actions" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="secondary-btn"
                onClick={closeSampleConversionModal}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={handleConfirmSampleConversion}
                disabled={
                  !String(sampleClientForm.name ?? '').trim() ||
                  !normalizePhone(sampleClientForm.phone)
                }
              >
                Confirmar alta
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default ArchivedOrdersPage
