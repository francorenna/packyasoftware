import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import OrdersForm from '../components/orders/OrdersForm'
import { formatOrderId } from '../utils/orders'
import OrdersList from '../components/orders/OrdersList'
import { getStockMapByProductId } from '../utils/stock'

const toPositiveNumber = (value) => {
  const parsed = Number(value)
  return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed
}

const getOrderTotalBoxes = (order) =>
  (Array.isArray(order?.items) ? order.items : []).reduce(
    (acc, item) => acc + toPositiveNumber(item?.quantity),
    0,
  )

const formatDateInput = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const parseDateInputToTimestamp = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return Number.POSITIVE_INFINITY
  }

  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day).getTime()
}

const parseDateTimeToTimestamp = (value) => {
  const parsed = new Date(value)
  const timestamp = parsed.getTime()
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp
}

const getOrderSortGroup = (order) => {
  if (!order || typeof order !== 'object') return Number.MAX_SAFE_INTEGER

  const isSample = order.isSample === true
  const isArchived = order.isArchived === true
  const status = String(order.status ?? '')

  if (!isSample && status === 'Pendiente') return 1
  if (status === 'En Proceso') return 2
  if (status === 'Listo') return 3
  if (status === 'Entregado' && !isArchived) return 4
  if (isSample && status === 'Pendiente') return 5
  if (status === 'Cancelado') return 6

  return Number.MAX_SAFE_INTEGER
}

const getOrderDateSortTimestamp = (order) => {
  const deliveryTimestamp = parseDateInputToTimestamp(order?.deliveryDate)
  if (deliveryTimestamp !== Number.POSITIVE_INFINITY) return deliveryTimestamp
  return parseDateTimeToTimestamp(order?.createdAt)
}

const generateNextOrderId = () =>
  `PED-${Date.now()}-${Math.floor(Math.random() * 1000)}`

function OrdersPage({
  orders,
  products,
  purchases,
  clients,
  onCreateOrder,
  onRegisterPayment,
  onUpdateOrderStatus,
  onUpdateOrderDelivery,
  onUpdateOrderClient,
  onUpdateOrderItems,
  onUpdateOrderItemCompletion,
  onUpdateOrderUrgency,
  onDeleteCancelledOrder,
  onCreateClient,
  onMarkProductAsUsed,
}) {
  const [deliveryFilter, setDeliveryFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [nextOrderId, setNextOrderId] = useState(generateNextOrderId)
  const [isFormModalOpen, setIsFormModalOpen] = useState(false)
  const [saveSuccessMessage, setSaveSuccessMessage] = useState('')
  const saveMessageTimerRef = useRef(null)
  const displayNextOrderId = useMemo(() => formatOrderId(nextOrderId), [nextOrderId])

  const location = useLocation()
  const openOrderId = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return params.get('open') ?? ''
  }, [location.search])

  const openFormModal = useCallback(() => setIsFormModalOpen(true), [])

  const closeFormModal = useCallback(() => setIsFormModalOpen(false), [])

  const handleCreateOrder = useCallback((orderData) => {
    onCreateOrder(orderData)
    setNextOrderId(generateNextOrderId())
    setIsFormModalOpen(false)
  }, [onCreateOrder])

  const handleOrderFormSuccess = useCallback((message) => {
    setSaveSuccessMessage(String(message ?? 'Pedido guardado correctamente'))
  }, [])

  useEffect(() => {
    if (!saveSuccessMessage) return undefined

    if (saveMessageTimerRef.current) {
      clearTimeout(saveMessageTimerRef.current)
    }

    saveMessageTimerRef.current = setTimeout(() => {
      setSaveSuccessMessage('')
    }, 2600)

    return () => {
      if (saveMessageTimerRef.current) {
        clearTimeout(saveMessageTimerRef.current)
      }
    }
  }, [saveSuccessMessage])

  const todayDate = useMemo(() => new Date(), [])
  const todayKey = useMemo(() => formatDateInput(todayDate), [todayDate])
  const tomorrowKey = useMemo(() => {
    const tomorrow = new Date(todayDate)
    tomorrow.setDate(tomorrow.getDate() + 1)
    return formatDateInput(tomorrow)
  }, [todayDate])

  const displayedOrders = useMemo(() => {
    const activeOrders = orders.filter((order) => {
      if (order?.isArchived === true) return false
      return getOrderSortGroup(order) !== Number.MAX_SAFE_INTEGER
    })

    const filteredOrders = activeOrders.filter((order) => {
      if (deliveryFilter === 'today') return order.deliveryDate === todayKey
      if (deliveryFilter === 'tomorrow') return order.deliveryDate === tomorrowKey
      return true
    })

    const q = searchQuery.trim().toLowerCase()
    const searchedOrders = q
      ? filteredOrders.filter((order) => {
          const clientMatch = String(order.clientName ?? order.client ?? '').toLowerCase().includes(q)
          const idMatch = String(order.id ?? '').toLowerCase().includes(q)
          const productMatch = (Array.isArray(order.items) ? order.items : []).some((item) =>
            String(item.productName ?? item.product ?? '').toLowerCase().includes(q),
          )
          return clientMatch || idMatch || productMatch
        })
      : filteredOrders

    return [...searchedOrders].sort((a, b) => {
      const aUrgent = Boolean(a?.urgent)
      const bUrgent = Boolean(b?.urgent)
      if (aUrgent && !bUrgent) return -1
      if (!aUrgent && bUrgent) return 1

      const groupDiff = getOrderSortGroup(a) - getOrderSortGroup(b)
      if (groupDiff !== 0) return groupDiff

      return getOrderDateSortTimestamp(a) - getOrderDateSortTimestamp(b)
    })
  }, [deliveryFilter, orders, searchQuery, todayKey, tomorrowKey])

  const productionSummary = useMemo(() => {
    const summary = {
      urgent: { cantidadPedidos: 0, totalCajas: 0 },
      pending: { cantidadPedidos: 0, totalCajas: 0 },
      inProgress: { cantidadPedidos: 0, totalCajas: 0 },
      ready: { cantidadPedidos: 0, totalCajas: 0 },
      toDeliver: { cantidadPedidos: 0, totalCajas: 0 },
    }

    displayedOrders.forEach((order) => {
      const status = String(order?.status ?? '')
      const totalCajas = getOrderTotalBoxes(order)

      if (order?.urgent) {
        summary.urgent.cantidadPedidos += 1
        summary.urgent.totalCajas += totalCajas
      }

      if (status === 'Pendiente') {
        summary.pending.cantidadPedidos += 1
        summary.pending.totalCajas += totalCajas
      }

      if (status === 'En Proceso') {
        summary.inProgress.cantidadPedidos += 1
        summary.inProgress.totalCajas += totalCajas
      }

      if (status === 'Listo') {
        summary.ready.cantidadPedidos += 1
        summary.ready.totalCajas += totalCajas
      }

      if (status === 'Entregado' && order?.isArchived !== true) {
        summary.toDeliver.cantidadPedidos += 1
        summary.toDeliver.totalCajas += totalCajas
      }
    })

    return summary
  }, [displayedOrders])

  const summaryCards = [
    {
      key: 'urgent',
      icon: '🔥',
      title: 'Urgentes',
      data: productionSummary.urgent,
    },
    {
      key: 'pending',
      icon: '⏳',
      title: 'Pendientes',
      data: productionSummary.pending,
    },
    {
      key: 'inProgress',
      icon: '⚙',
      title: 'En producción',
      data: productionSummary.inProgress,
    },
    {
      key: 'ready',
      icon: '✅',
      title: 'Listos',
      data: productionSummary.ready,
    },
    {
      key: 'toDeliver',
      icon: '🚚',
      title: 'Por entregar',
      data: productionSummary.toDeliver,
    },
  ]

  const stockByProductId = useMemo(
    () => getStockMapByProductId(products, orders),
    [products, orders],
  )

  return (
    <section className="page-section">
      <header className="page-header">
        <div className="page-header-row">
          <div>
            <h2 className="section-title">Pedidos</h2>
            <p>Gestioná pedidos con múltiples productos y seguimiento por estado.</p>
            {saveSuccessMessage && (
              <p className="delivery-save-success">{saveSuccessMessage}</p>
            )}
          </div>
          <button type="button" className="primary-btn" onClick={openFormModal}>
            + Nuevo pedido
          </button>
        </div>
      </header>

      <div className="orders-list-full">
        <section className="production-summary" aria-label="Resumen de Producción">
          <h3>Resumen de Producción</h3>
          <div className="production-summary-grid">
            {summaryCards.map((card) => (
              <article key={card.key} className="summary-card">
                <p className="summary-label">{card.icon} {card.title}</p>
                <p className="summary-number">{card.data.cantidadPedidos}</p>
                <p className="summary-helper">Pedidos</p>
                <p className="summary-number">{card.data.totalCajas}</p>
                <p className="summary-helper">Cajas</p>
              </article>
            ))}
          </div>
        </section>

        <OrdersList
          orders={displayedOrders}
          products={products}
          purchases={purchases}
          clients={clients}
          stockByProductId={stockByProductId}
          deliveryFilter={deliveryFilter}
          onFilterChange={setDeliveryFilter}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          initialExpandedOrderId={openOrderId}
          onRegisterPayment={onRegisterPayment}
          onUpdateOrderStatus={onUpdateOrderStatus}
          onUpdateOrderDelivery={onUpdateOrderDelivery}
          onUpdateOrderClient={onUpdateOrderClient}
          onUpdateOrderItems={onUpdateOrderItems}
          onUpdateOrderItemCompletion={onUpdateOrderItemCompletion}
          onUpdateOrderUrgency={onUpdateOrderUrgency}
          onDeleteCancelledOrder={onDeleteCancelledOrder}
        />
      </div>

      {isFormModalOpen && (
        <div
          className="modal-overlay order-form-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Nuevo pedido"
          onKeyDown={(e) => { if (e.key === 'Escape') closeFormModal() }}
        >
          <div className="order-form-modal">
            <div className="order-form-modal-header">
              <h3>Nuevo pedido</h3>
              <span className="muted-label">{displayNextOrderId}</span>
            </div>
            <div className="order-form-modal-body">
              <OrdersForm
                orderId={nextOrderId}
                products={products}
                purchases={purchases}
                clients={clients}
                stockByProductId={stockByProductId}
                onCreate={handleCreateOrder}
                onSuccess={handleOrderFormSuccess}
                onCancel={closeFormModal}
                onCreateClient={onCreateClient}
                onProductUsed={onMarkProductAsUsed}
                isModal
              />
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default OrdersPage
