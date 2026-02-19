import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import OrdersForm from '../components/orders/OrdersForm'
import OrdersList from '../components/orders/OrdersList'
import { getOrderFinancialSummary } from '../utils/finance'
import { getStockMapByProductId } from '../utils/stock'

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
  onCreateClient,
}) {
  const [searchParams] = useSearchParams()
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

      const orderStatus = String(order?.status ?? '')
      const { remainingDebt } = getOrderFinancialSummary(order)
      const isDeliveredWithDebt = orderStatus === 'Entregado' && remainingDebt > 0

      return (
        orderStatus === 'Pendiente' ||
        orderStatus === 'En Proceso' ||
        orderStatus === 'Listo' ||
        isDeliveredWithDebt
      )
    })

    const filteredOrders = activeOrders.filter((order) => {
      if (deliveryFilter === 'today') return order.deliveryDate === todayKey
      if (deliveryFilter === 'tomorrow') return order.deliveryDate === tomorrowKey
      return true
    })

    return [...filteredOrders].sort(
      (a, b) =>
        parseDateInputToTimestamp(a.deliveryDate) -
        parseDateInputToTimestamp(b.deliveryDate),
    )
  }, [deliveryFilter, orders, todayKey, tomorrowKey])

  const openOrderId = searchParams.get('open') ?? null
  const stockByProductId = useMemo(
    () => getStockMapByProductId(products, orders),
    [products, orders],
  )

  return (
    <section className="page-section">
      <header className="page-header">
        <h2>Pedidos</h2>
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
        <OrdersList
          orders={displayedOrders}
          products={products}
          purchases={purchases}
          clients={clients}
          deliveryFilter={deliveryFilter}
          onFilterChange={setDeliveryFilter}
          onRegisterPayment={onRegisterPayment}
          onUpdateOrderStatus={onUpdateOrderStatus}
          onUpdateOrderDelivery={onUpdateOrderDelivery}
          onUpdateOrderClient={onUpdateOrderClient}
          onUpdateOrderItems={onUpdateOrderItems}
          forcedOpenOrderId={openOrderId}
        />
      </div>
    </section>
  )
}

export default OrdersPage
