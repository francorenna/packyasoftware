import { useMemo, useState } from 'react'
import OrdersForm from '../components/orders/OrdersForm'
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
  onUpdateOrderUrgency,
  onDeleteCancelledOrder,
  onCreateClient,
}) {
  const [deliveryFilter, setDeliveryFilter] = useState('all')

  const nextOrderId = useMemo(
    () => `PED-${String(orders.length + 1).padStart(3, '0')}`,
    [orders.length],
  )

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

    return [...filteredOrders].sort((a, b) => {
      const aUrgent = Boolean(a?.urgent)
      const bUrgent = Boolean(b?.urgent)
      if (aUrgent && !bUrgent) return -1
      if (!aUrgent && bUrgent) return 1

      const groupDiff = getOrderSortGroup(a) - getOrderSortGroup(b)
      if (groupDiff !== 0) return groupDiff

      return getOrderDateSortTimestamp(a) - getOrderDateSortTimestamp(b)
    })
  }, [deliveryFilter, orders, todayKey, tomorrowKey])

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
        <h2 className="section-title">Pedidos</h2>
        <p>Gestioná pedidos con múltiples productos y seguimiento por estado.</p>
      </header>

      <div className="orders-grid">
        <OrdersForm
          orderId={nextOrderId}
          products={products}
          purchases={purchases}
          clients={clients}
          stockByProductId={stockByProductId}
          onCreate={onCreateOrder}
          onCreateClient={onCreateClient}
        />
        <div className="orders-list-column">
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
            onRegisterPayment={onRegisterPayment}
            onUpdateOrderStatus={onUpdateOrderStatus}
            onUpdateOrderDelivery={onUpdateOrderDelivery}
            onUpdateOrderClient={onUpdateOrderClient}
            onUpdateOrderItems={onUpdateOrderItems}
            onUpdateOrderUrgency={onUpdateOrderUrgency}
            onDeleteCancelledOrder={onDeleteCancelledOrder}
          />
        </div>
      </div>
    </section>
  )
}

export default OrdersPage
