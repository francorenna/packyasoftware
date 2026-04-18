import { Fragment, useMemo, useState } from 'react'
import { getOrderFinancialSummary } from '../utils/finance'
import { formatOrderId } from '../utils/orders'
import useAppDialog from '../hooks/useAppDialog'
import SearchInput from '../components/SearchInput'

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

function ArchivedOrdersPage({
  orders,
  onReopenOrderAsNew,
  onCreateClient,
  onConvertSampleToRealOrder,
  onDuplicateOrder,
  onDeleteArchivedOrder,
}) {
  const safeOrders = useMemo(() => (Array.isArray(orders) ? orders : []), [orders])
  const [sampleConversionOrderId, setSampleConversionOrderId] = useState(null)
  const [sampleClientForm, setSampleClientForm] = useState(() => createClientForm())
  const [detailOrderId, setDetailOrderId] = useState(null)
  const [searchInput, setSearchInput] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  const { dialogNode, appAlert, appConfirm } = useAppDialog()

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

  const filteredArchivedOrders = useMemo(() => {
    const query = String(searchTerm ?? '').trim().toLowerCase()
    if (!query) return archivedOrders

    return archivedOrders.filter((order) => {
      const id = String(order?.id ?? '').toLowerCase()
      const client = String(order?.clientName ?? order?.client ?? '').toLowerCase()
      const status = String(order?.status ?? '').toLowerCase()
      const itemsLabel = (Array.isArray(order?.items) ? order.items : [])
        .map((item) => String(item?.productName ?? item?.product ?? '').toLowerCase())
        .join(' ')

      return id.includes(query) || client.includes(query) || status.includes(query) || itemsLabel.includes(query)
    })
  }, [archivedOrders, searchTerm])

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
      void appAlert('No se pudo crear el cliente para dar de alta la muestra.')
      return
    }

    onConvertSampleToRealOrder?.(orderId, {
      clientId: String(createdClient.id),
      clientName: String(createdClient.name ?? name),
    })

    closeSampleConversionModal()
  }

  const handleReopenAsNew = (orderId) => {
    const newOrderId = onReopenOrderAsNew?.(orderId)
    if (newOrderId) {
      window.location.hash = `#/pedidos?open=${encodeURIComponent(newOrderId)}`
      return
    }

    const duplicatedOrderId = onDuplicateOrder?.(orderId)
    if (duplicatedOrderId) {
      window.location.hash = `#/pedidos?open=${encodeURIComponent(duplicatedOrderId)}`
    }
  }

  const handleDeleteArchived = (orderId) => {
    void appConfirm('¿Eliminar definitivamente este pedido archivado? Esta acción no se puede deshacer.').then((confirmed) => {
      if (!confirmed) return
      onDeleteArchivedOrder?.(orderId)
      setDetailOrderId((current) => (current === orderId ? null : current))
    })
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

        <div className="clients-toolbar">
          <SearchInput
            value={searchInput}
            onValueChange={setSearchInput}
            onDebouncedChange={setSearchTerm}
            placeholder="Buscar archivados por cliente, ID, estado o producto"
            delay={220}
          />
        </div>

        <div className="table-wrap">
          <table className="orders-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Cliente</th>
                <th>Tipo</th>
                <th>Estado</th>
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
              {filteredArchivedOrders.map((order, index) => {
                const orderId = String(order.id ?? `archivado-${index}`)
                const displayOrderId = formatOrderId(orderId)
                const financialSummary = getOrderFinancialSummary(order)
                const orderStatus = String(order?.status ?? '-')

                return (
                  <Fragment key={orderId}>
                  <tr>
                    <td>{displayOrderId}</td>
                    <td>{String(order.clientName ?? order.client ?? 'Sin cliente')}</td>
                    <td>
                      {order.isSample ? (
                        <span className="status-badge status-muestra">MUESTRA</span>
                      ) : (
                        <span className="muted-label">Pedido</span>
                      )}
                    </td>
                    <td>{orderStatus}</td>
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
                        <div className="product-row-actions">
                          <button
                            type="button"
                            className="quick-fill-btn"
                            onClick={() =>
                              setDetailOrderId((prev) => (prev === orderId ? null : orderId))
                            }
                          >
                            {detailOrderId === orderId ? 'Ocultar' : 'Ver detalle'}
                          </button>
                          <button
                            type="button"
                            className="quick-fill-btn"
                            onClick={() => handleReopenAsNew(orderId)}
                          >
                            Reabrir (nuevo ID)
                          </button>
                          <button
                            type="button"
                            className="quick-fill-btn"
                            onClick={() => onDuplicateOrder?.(orderId)}
                          >
                            Duplicar
                          </button>
                          <button
                            type="button"
                            className="danger-ghost-btn"
                            onClick={() => handleDeleteArchived(orderId)}
                          >
                            Eliminar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>

                  {detailOrderId === orderId && !order.isSample && (
                    <tr key={`${orderId}-detail`}>
                      <td colSpan={9}>
                        <div className="client-accordion-panel" style={{ padding: '10px 0' }}>
                          <p><strong>ID:</strong> {displayOrderId}</p>
                          <p><strong>Estado:</strong> {orderStatus}</p>
                          <p><strong>Archivado:</strong> {formatDateTime(order.archivedAt)}</p>
                          <p><strong>Fecha creación:</strong> {formatDateTime(order.createdAt)}</p>
                          <p><strong>Fecha producción:</strong> {formatDateTime(order.productionDate)}</p>
                          <p><strong>Fecha entrega:</strong> {formatDate(order.deliveryDate)}</p>
                          <p><strong>Tipo entrega:</strong> {String(order.deliveredVia ?? '-')}</p>
                          <p><strong>Entregado por:</strong> {String(order.deliveredBy ?? '-')}</p>
                          <p><strong>Número envío:</strong> {String(order.trackingNumber ?? '-')}</p>
                          <p><strong>Nota financiera:</strong> {String(order.financialNote ?? '').trim() || '-'}</p>
                          <p><strong>Total:</strong> {formatCurrency(financialSummary.finalTotal)}</p>
                          <p><strong>Pagado:</strong> {formatCurrency(financialSummary.totalPaid)}</p>
                          <p><strong>Saldo:</strong> {formatCurrency(financialSummary.remainingDebt)}</p>

                          <table className="orders-table" style={{ marginTop: 8 }}>
                            <thead>
                              <tr>
                                <th>Producto</th>
                                <th>Cantidad</th>
                                <th>Precio unit.</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(Array.isArray(order.items) ? order.items : []).map((item, i) => (
                                <tr key={i}>
                                  <td>{String(item.productName ?? item.product ?? '-')}</td>
                                  <td>{Number(item.quantity)}</td>
                                  <td>{formatCurrency(item.unitPrice)}</td>
                                </tr>
                              ))}
                              {(Array.isArray(order.items) ? order.items : []).length === 0 && (
                                <tr>
                                  <td colSpan={3} className="empty-detail">Sin ítems registrados.</td>
                                </tr>
                              )}
                            </tbody>
                          </table>

                          <table className="orders-table" style={{ marginTop: 8 }}>
                            <thead>
                              <tr>
                                <th>Pago</th>
                                <th>Monto</th>
                                <th>Método</th>
                                <th>Fecha</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(Array.isArray(order.payments) ? order.payments : []).map((payment, paymentIndex) => (
                                <tr key={String(payment?.id ?? `${orderId}-payment-${paymentIndex}`)}>
                                  <td>{String(payment?.id ?? '-')}</td>
                                  <td>{formatCurrency(Number(payment?.amount || 0))}</td>
                                  <td>{String(payment?.method ?? '-')}</td>
                                  <td>{formatDateTime(payment?.date)}</td>
                                </tr>
                              ))}
                              {(Array.isArray(order.payments) ? order.payments : []).length === 0 && (
                                <tr>
                                  <td colSpan={4} className="empty-detail">Sin pagos registrados.</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                )
              })}

              {archivedOrders.length === 0 && (
                <tr>
                  <td colSpan={11} className="empty-detail">
                    No hay pedidos archivados.
                  </td>
                </tr>
              )}

              {archivedOrders.length > 0 && filteredArchivedOrders.length === 0 && (
                <tr>
                  <td colSpan={11} className="empty-detail">
                    No hay resultados para esa búsqueda.
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
      {dialogNode}
    </section>
  )
}

export default ArchivedOrdersPage
