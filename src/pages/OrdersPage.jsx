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

const formatCurrency = (value) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))

const getDaysSinceDateInput = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 0
  const [year, month, day] = value.split('-').map(Number)
  const target = new Date(year, month - 1, day)
  if (Number.isNaN(target.getTime())) return 0

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const base = new Date(target.getFullYear(), target.getMonth(), target.getDate())
  return Math.max(0, Math.floor((today.getTime() - base.getTime()) / 86400000))
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

const ORDER_MODAL_FORM_ID = 'order-create-form'

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

  useEffect(() => {
    const handleShortcut = (event) => {
      const target = event.target
      const isInputLike =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLButtonElement

      const key = String(event.key ?? '').toLowerCase()

      if (key === 'n' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (isInputLike) return
        event.preventDefault()
        openFormModal()
        return
      }

      if ((event.ctrlKey || event.metaKey) && key === 's') {
        if (!isFormModalOpen) return
        event.preventDefault()
        const form = document.getElementById(ORDER_MODAL_FORM_ID)
        form?.requestSubmit()
        return
      }

      if (event.key === 'Escape' && isFormModalOpen) {
        event.preventDefault()
        closeFormModal()
      }
    }

    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [closeFormModal, isFormModalOpen, openFormModal])

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

  const archivedOrderCount = useMemo(
    () => orders.filter((order) => order?.isArchived === true).length,
    [orders],
  )

  const productionSummary = useMemo(() => {
    const summary = {
      urgent: { cantidadPedidos: 0, totalCajas: 0 },
      production: { cantidadPedidos: 0, totalCajas: 0 },
      ready: { cantidadPedidos: 0, totalCajas: 0 },
      collections: { cantidadPedidos: 0, totalDeuda: 0 },
      cancelled: { cantidadPedidos: 0, totalCajas: 0 },
    }

    displayedOrders.forEach((order) => {
      const status = String(order?.status ?? '')
      const totalCajas = getOrderTotalBoxes(order)

      if (order?.urgent) {
        summary.urgent.cantidadPedidos += 1
        summary.urgent.totalCajas += totalCajas
      }

      if (status === 'Pendiente' || status === 'En Proceso') {
        summary.production.cantidadPedidos += 1
        summary.production.totalCajas += totalCajas
      }

      if (status === 'Listo') {
        summary.ready.cantidadPedidos += 1
        summary.ready.totalCajas += totalCajas
      }

      if (status === 'Entregado' && order?.isArchived !== true) {
        const totalPaid = (Array.isArray(order?.payments) ? order.payments : []).reduce(
          (acc, payment) => acc + toPositiveNumber(payment?.amount),
          0,
        )
        const remainingDebt = Math.max(toPositiveNumber(order?.total) - totalPaid, 0)

        if (remainingDebt > 0) {
          summary.collections.cantidadPedidos += 1
          summary.collections.totalDeuda += remainingDebt
        }
      }

      if (status === 'Cancelado') {
        summary.cancelled.cantidadPedidos += 1
        summary.cancelled.totalCajas += totalCajas
      }
    })

    return summary
  }, [displayedOrders])

  const summaryCards = [
    {
      key: 'urgent',
      icon: '🔥',
      title: 'Urgentes',
      value: productionSummary.urgent.cantidadPedidos,
      helper: 'Pedidos',
      secondaryValue: productionSummary.urgent.totalCajas,
      secondaryHelper: 'Cajas',
    },
    {
      key: 'production',
      icon: '⚙',
      title: 'Producción',
      value: productionSummary.production.cantidadPedidos,
      helper: 'Pedidos activos',
      secondaryValue: productionSummary.production.totalCajas,
      secondaryHelper: 'Cajas',
    },
    {
      key: 'ready',
      icon: '✅',
      title: 'Listos',
      value: productionSummary.ready.cantidadPedidos,
      helper: 'Para entregar',
      secondaryValue: productionSummary.ready.totalCajas,
      secondaryHelper: 'Cajas',
    },
    {
      key: 'collections',
      icon: '💸',
      title: 'Por cobrar',
      value: productionSummary.collections.cantidadPedidos,
      helper: 'Pedidos',
      secondaryValue: new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        maximumFractionDigits: 0,
      }).format(productionSummary.collections.totalDeuda),
      secondaryHelper: 'Saldo pendiente',
    },
    {
      key: 'cancelled',
      icon: '🧾',
      title: 'Cancelados',
      value: productionSummary.cancelled.cantidadPedidos,
      helper: 'Pedidos',
      secondaryValue: productionSummary.cancelled.totalCajas,
      secondaryHelper: 'Cajas',
    },
  ]

  const collectionsIntelligence = useMemo(() => {
    const safeOrders = Array.isArray(orders) ? orders : []
    const activeOrders = safeOrders.filter(
      (order) => !order?.isSample && order?.isArchived !== true && String(order?.status ?? '') !== 'Cancelado',
    )

    const debtRows = activeOrders
      .map((order) => {
        const totalPaid = (Array.isArray(order?.payments) ? order.payments : []).reduce(
          (acc, payment) => acc + toPositiveNumber(payment?.amount),
          0,
        )
        const finalTotal = toPositiveNumber(order?.total)
        const remainingDebt = Math.max(finalTotal - totalPaid, 0)
        const daysSinceDelivery = getDaysSinceDateInput(order?.deliveryDate)

        return {
          order,
          totalPaid,
          finalTotal,
          remainingDebt,
          daysSinceDelivery,
        }
      })
      .filter((row) => String(row.order?.status ?? '') === 'Entregado' && row.remainingDebt > 0)

    const totalPending = debtRows.reduce((acc, row) => acc + row.remainingDebt, 0)
    const avgDaysToCollect = debtRows.length > 0
      ? debtRows.reduce((acc, row) => acc + row.daysSinceDelivery, 0) / debtRows.length
      : 0

    const agingBuckets = {
      range0_7: debtRows.filter((row) => row.daysSinceDelivery <= 7).length,
      range8_15: debtRows.filter((row) => row.daysSinceDelivery >= 8 && row.daysSinceDelivery <= 15).length,
      range16_30: debtRows.filter((row) => row.daysSinceDelivery >= 16 && row.daysSinceDelivery <= 30).length,
      range31Plus: debtRows.filter((row) => row.daysSinceDelivery > 30).length,
    }

    const debtByClient = debtRows.reduce((acc, row) => {
      const key = String(row.order?.clientId ?? '').trim() || String(row.order?.clientName ?? row.order?.client ?? 'Sin cliente').trim().toLowerCase()
      const label = String(row.order?.clientName ?? row.order?.client ?? 'Sin cliente')
      const current = acc[key] ?? { label, amount: 0 }
      current.amount += row.remainingDebt
      acc[key] = current
      return acc
    }, {})

    const topDebtors = Object.values(debtByClient)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)

    const paidByClient = activeOrders.reduce((acc, order) => {
      const paid = (Array.isArray(order?.payments) ? order.payments : []).reduce(
        (sum, payment) => sum + toPositiveNumber(payment?.amount),
        0,
      )
      if (paid <= 0) return acc

      const key = String(order?.clientId ?? '').trim() || String(order?.clientName ?? order?.client ?? 'Sin cliente').trim().toLowerCase()
      const label = String(order?.clientName ?? order?.client ?? 'Sin cliente')
      const current = acc[key] ?? { label, amount: 0 }
      current.amount += paid
      acc[key] = current
      return acc
    }, {})

    const topPayers = Object.values(paidByClient)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)

    return {
      pendingOrders: debtRows.length,
      totalPending,
      avgDaysToCollect,
      agingBuckets,
      topDebtors,
      topPayers,
    }
  }, [orders])

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
                <p className="summary-number">{card.value}</p>
                <p className="summary-helper">{card.helper}</p>
                <p className="summary-number">{card.secondaryValue}</p>
                <p className="summary-helper">{card.secondaryHelper}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="dashboard-recent" aria-label="Panel de cobranza inteligente">
          <div className="card-head">
            <h3>Cobranza Inteligente 1.9</h3>
            <p className="muted-label">Foco en liquidez y seguimiento de deuda activa.</p>
          </div>

          <div className="collections-kpi-grid">
            <article className="dashboard-card">
              <p>Deuda total activa</p>
              <strong>{formatCurrency(collectionsIntelligence.totalPending)}</strong>
            </article>
            <article className="dashboard-card">
              <p>Pedidos por cobrar</p>
              <strong>{collectionsIntelligence.pendingOrders}</strong>
            </article>
            <article className="dashboard-card">
              <p>Días promedio de cobro</p>
              <strong>{collectionsIntelligence.avgDaysToCollect.toFixed(1)}</strong>
            </article>
            <article className="dashboard-card">
              <p>Aging 30+ días</p>
              <strong>{collectionsIntelligence.agingBuckets.range31Plus}</strong>
            </article>
          </div>

          <div className="collections-aging-grid">
            <article className="summary-card collections-aging-card">
              <p className="summary-label">0-7 días</p>
              <p className="summary-number">{collectionsIntelligence.agingBuckets.range0_7}</p>
              <p className="summary-helper">Pedidos</p>
            </article>
            <article className="summary-card collections-aging-card">
              <p className="summary-label">8-15 días</p>
              <p className="summary-number">{collectionsIntelligence.agingBuckets.range8_15}</p>
              <p className="summary-helper">Pedidos</p>
            </article>
            <article className="summary-card collections-aging-card">
              <p className="summary-label">16-30 días</p>
              <p className="summary-number">{collectionsIntelligence.agingBuckets.range16_30}</p>
              <p className="summary-helper">Pedidos</p>
            </article>
            <article className="summary-card collections-aging-card">
              <p className="summary-label">31+ días</p>
              <p className="summary-number">{collectionsIntelligence.agingBuckets.range31Plus}</p>
              <p className="summary-helper">Pedidos</p>
            </article>
          </div>

          <div className="ranking-grid collections-ranking-grid">
            <article className="ranking-panel">
              <h4>Top deudores</h4>
              <ul className="collections-ranking-list">
                {collectionsIntelligence.topDebtors.length > 0 ? (
                  collectionsIntelligence.topDebtors.map((row, index) => (
                    <li key={`debtor-${index}`}>
                      <span>{row.label}</span>
                      <strong>{formatCurrency(row.amount)}</strong>
                    </li>
                  ))
                ) : (
                  <li><span>Sin deuda activa</span><strong>{formatCurrency(0)}</strong></li>
                )}
              </ul>
            </article>

            <article className="ranking-panel">
              <h4>Top pagadores</h4>
              <ul className="collections-ranking-list">
                {collectionsIntelligence.topPayers.length > 0 ? (
                  collectionsIntelligence.topPayers.map((row, index) => (
                    <li key={`payer-${index}`}>
                      <span>{row.label}</span>
                      <strong>{formatCurrency(row.amount)}</strong>
                    </li>
                  ))
                ) : (
                  <li><span>Sin pagos registrados</span><strong>{formatCurrency(0)}</strong></li>
                )}
              </ul>
            </article>
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
          archivedCount={archivedOrderCount}
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
                formId={ORDER_MODAL_FORM_ID}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default OrdersPage
