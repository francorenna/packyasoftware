import { Fragment, useEffect, useMemo, useState } from 'react'
import { APP_CONFIG } from '../../config/app'
import { getOrderFinancialSummary } from '../../utils/finance'
import { generateOrderPDF } from '../../utils/pdf'
import ConfirmDeliveryModal from './ConfirmDeliveryModal'

const paymentMethods = ['Efectivo', 'Transferencia', 'MercadoPago']
const orderStatuses = ['Pendiente', 'En Proceso', 'Listo', 'Entregado', 'Cancelado']
const sampleOrderStatuses = ['Pendiente', 'Lista']
const deliveryMethods = ['Presencial', 'Envío', 'Otro']

const toPositiveNumber = (value) => {
  const parsed = Number(value)
  return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed
}

const createEditableItem = (item = {}) => ({
  productId: String(item?.productId ?? ''),
  quantity: Math.max(toPositiveNumber(item?.quantity), 1),
  unitPrice: toPositiveNumber(item?.unitPrice),
  isClientMaterial: Boolean(item?.isClientMaterial ?? false),
})

const normalizePhone = (value) => String(value ?? '').replace(/[^\d]/g, '').trim()

const getClientDebtKey = (order) => {
  const clientId = String(order?.clientId ?? '').trim()
  if (clientId) return `id:${clientId}`

  const clientNameKey = String(order?.clientName ?? order?.client ?? '').trim().toLowerCase()
  if (clientNameKey) return `name:${clientNameKey}`

  return ''
}

const formatCurrency = (value) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value)

const formatDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Sin fecha'

  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('es-AR')
}

const formatDateTime = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sin registro'

  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const toDateInput = (value) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function OrdersList({
  orders,
  products,
  purchases,
  clients,
  deliveryFilter,
  onFilterChange,
  onRegisterPayment,
  onUpdateOrderStatus,
  onUpdateOrderDelivery,
  onUpdateOrderClient,
  onUpdateOrderItems,
  onDeleteCancelledOrder,
  forcedOpenOrderId,
}) {
  const [expandedOrderId, setExpandedOrderId] = useState(null)
  const [paymentDrafts, setPaymentDrafts] = useState({})
  const [deliveryDrafts, setDeliveryDrafts] = useState({})
  const [itemsDrafts, setItemsDrafts] = useState({})
  const [deliverySaveUiByOrder, setDeliverySaveUiByOrder] = useState({})
  const [deliveryConfirmModal, setDeliveryConfirmModal] = useState({
    isOpen: false,
    orderId: '',
    initialDeliveryType: '',
    initialDeliveredBy: '',
    initialDeliveryNote: '',
  })
  const safeOrders = Array.isArray(orders) ? orders : []
  const safeProducts = Array.isArray(products) ? products : []
  const safePurchases = Array.isArray(purchases) ? purchases : []
  const safeClients = Array.isArray(clients) ? clients : []
  const safeForcedOpenOrderId = useMemo(
    () => (forcedOpenOrderId ? String(forcedOpenOrderId) : null),
    [forcedOpenOrderId],
  )

  useEffect(() => {
    if (!safeForcedOpenOrderId) return
    setExpandedOrderId(safeForcedOpenOrderId)
  }, [safeForcedOpenOrderId])

  const clientsById = useMemo(
    () =>
      safeClients.reduce((acc, client) => {
        if (!client?.id) return acc
        acc[String(client.id)] = client
        return acc
      }, {}),
    [safeClients],
  )

  const clientsByName = useMemo(
    () =>
      safeClients.reduce((acc, client) => {
        const key = String(client?.name ?? '').trim().toLowerCase()
        if (!key) return acc
        acc[key] = client
        return acc
      }, {}),
    [safeClients],
  )

  const productsById = useMemo(
    () =>
      safeProducts.reduce((acc, product) => {
        if (!product?.id) return acc
        acc[String(product.id)] = product
        return acc
      }, {}),
    [safeProducts],
  )

  const clientsWithDebt = (() => {
    const debtByClientKey = safeOrders.reduce((acc, order) => {
      if (order?.isSample) return acc
      if (String(order?.status ?? '') === 'Cancelado') return acc

      const clientKey = getClientDebtKey(order)
      if (!clientKey) return acc

      const { remainingDebt } = getOrderFinancialSummary(order)
      if (remainingDebt <= 0) return acc

      acc[clientKey] = (acc[clientKey] ?? 0) + Number(remainingDebt || 0)
      return acc
    }, {})

    return new Set(
      Object.keys(debtByClientKey).filter((clientKey) => Number(debtByClientKey[clientKey] || 0) > 0),
    )
  })()

  const productIdByName = useMemo(
    () =>
      safeProducts.reduce((acc, product) => {
        const key = String(product?.name ?? '').trim().toLowerCase()
        if (!key || !product?.id) return acc
        acc[key] = String(product.id)
        return acc
      }, {}),
    [safeProducts],
  )

  const averageUnitCostByProductId = useMemo(() => {
    const totals = {}

    safePurchases.forEach((purchase) => {
      const purchaseItems = Array.isArray(purchase?.items) ? purchase.items : []
      purchaseItems.forEach((item) => {
        const productId = String(item?.productId ?? '')
        if (!productId) return

        const quantity = Number(item?.quantity || 0)
        const unitCost = Number(item?.unitCost || 0)
        if (quantity <= 0 || unitCost <= 0) return

        const row = totals[productId] ?? { units: 0, amount: 0 }
        row.units += quantity
        row.amount += quantity * unitCost
        totals[productId] = row
      })
    })

    return Object.keys(totals).reduce((acc, productId) => {
      const row = totals[productId]
      acc[productId] = row.units > 0 ? row.amount / row.units : 0
      return acc
    }, {})
  }, [safePurchases])

  const toggleOrder = (orderId) => {
    setExpandedOrderId((currentId) => (currentId === orderId ? null : orderId))
  }

  const getDraftForOrder = (orderId) =>
    paymentDrafts[orderId] ?? { amount: '', method: paymentMethods[0] }

  const updateDraft = (orderId, field, value) => {
    setPaymentDrafts((prevDrafts) => ({
      ...prevDrafts,
      [orderId]: {
        ...getDraftForOrder(orderId),
        [field]: value,
      },
    }))
  }

  const getDeliveryDraftForOrder = (order) => {
    const orderId = String(order?.id ?? '')
    const existingDraft = deliveryDrafts[orderId]
    if (existingDraft) return existingDraft

    return {
      productionDate: toDateInput(order?.productionDate ?? order?.createdAt),
      deliveredVia: String(order?.deliveredVia ?? '').trim(),
      deliveredBy: String(order?.deliveredBy ?? '').trim(),
      trackingNumber: String(order?.trackingNumber ?? '').trim(),
      deliveryDetails: String(order?.deliveryDetails ?? '').trim(),
      shippingCost: String(Number(order?.shippingCost || 0)),
    }
  }

  const updateDeliveryDraft = (orderId, field, value) => {
    setDeliveryDrafts((prevDrafts) => {
      const currentDraft = prevDrafts[orderId] ?? {
        productionDate: '',
        deliveredVia: '',
        deliveredBy: '',
        trackingNumber: '',
        deliveryDetails: '',
        shippingCost: '0',
      }

      return {
        ...prevDrafts,
        [orderId]: {
          ...currentDraft,
          [field]: value,
        },
      }
    })
  }

  const getDeliverySaveUiForOrder = (orderId) =>
    deliverySaveUiByOrder[orderId] ?? {
      isEditing: true,
      status: 'idle',
      savedData: null,
      errorMessage: '',
    }

  return (
    <section className="card-block">
      <div className="card-head">
        <h3>Listado de pedidos</h3>
        <div className="list-filters" role="group" aria-label="Filtrar por fecha de entrega">
          <button
            type="button"
            className={`filter-btn ${deliveryFilter === 'today' ? 'filter-btn-active' : ''}`}
            onClick={() => onFilterChange('today')}
          >
            Hoy
          </button>
          <button
            type="button"
            className={`filter-btn ${deliveryFilter === 'tomorrow' ? 'filter-btn-active' : ''}`}
            onClick={() => onFilterChange('tomorrow')}
          >
            Mañana
          </button>
          <button
            type="button"
            className={`filter-btn ${deliveryFilter === 'all' ? 'filter-btn-active' : ''}`}
            onClick={() => onFilterChange('all')}
          >
            Todos
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="orders-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Cliente</th>
              <th>Entrega</th>
              <th>Estado</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {safeOrders.map((order, index) => {
              const orderId = String(order.id ?? `pedido-${index}`)
              const orderClient = String(order.clientName ?? order.client ?? 'Sin cliente')
              const orderStatus = String(order.status ?? 'Pendiente')
              const financialNote = String(order.financialNote ?? '').trim()
              const statusClass = `status-${orderStatus.toLowerCase().replace(/\s+/g, '-')}`
              const {
                items,
                payments,
                discount,
                effectiveSubtotal,
                finalTotal,
                totalPaid,
                remainingDebt,
                financialStatus,
              } = getOrderFinancialSummary(order)
              const isDeliveredWithDebt = !order.isSample && orderStatus === 'Entregado' && remainingDebt > 0
              const isReadyPendingDelivery = !order.isSample && orderStatus === 'Listo'
              const statusLabel = isDeliveredWithDebt
                ? `Entregado – Deuda ${formatCurrency(remainingDebt)}`
                : isReadyPendingDelivery
                  ? remainingDebt > 0
                    ? `Listo – Pendiente de entrega · Deuda ${formatCurrency(remainingDebt)}`
                    : 'Listo – Pendiente de entrega'
                  : orderStatus
              const statusBadgeClass = isDeliveredWithDebt
                ? 'status-entregado-deuda'
                : statusClass
              const statusOptions = order.isSample ? sampleOrderStatuses : orderStatuses
              const selectedClientId = String(order?.clientId ?? '')
              const clientDebtKey = getClientDebtKey(order)
              const hasClientDebt = clientDebtKey ? clientsWithDebt.has(clientDebtKey) : false
              const resolvedClientByName = clientsByName[
                String(order?.clientName ?? order?.client ?? '').trim().toLowerCase()
              ]
              const selectedClientIdForSelect =
                selectedClientId || String(resolvedClientByName?.id ?? '')

              const isExpanded = expandedOrderId === orderId
              const isForcedOpened = safeForcedOpenOrderId === orderId
              const paymentDraft = getDraftForOrder(orderId)
              const deliveryDraft = getDeliveryDraftForOrder(order)
              const deliverySaveUi = getDeliverySaveUiForOrder(orderId)
              const itemsDraft = itemsDrafts[orderId] ?? null
              const isEditingItems = Array.isArray(itemsDraft)
              const estimatedCost = items.reduce((acc, item) => {
                const fromItemId = String(item?.productId ?? '')
                const fromName = productIdByName[
                  String(item?.productName ?? item?.product ?? '').trim().toLowerCase()
                ]
                const productId = fromItemId || fromName || ''
                const quantity = Number(item?.quantity || 0)
                const isClientMaterial = Boolean(item?.isClientMaterial ?? false)

                if (quantity <= 0) return acc

                if (isClientMaterial) {
                  const printingBaseCost = Number(APP_CONFIG.printingBaseCost || 0)
                  return acc + quantity * Math.max(printingBaseCost, 0)
                }

                if (!productId) return acc

                const avgUnitCost = Number(averageUnitCostByProductId[productId] || 0)
                const referenceCost = Number(productsById[productId]?.referenceCost || 0)
                const unitCost = avgUnitCost > 0 ? avgUnitCost : referenceCost > 0 ? referenceCost : 0

                return acc + quantity * unitCost
              }, 0)
              const estimatedIncome = Number(finalTotal || 0)
              const estimatedProfit = estimatedIncome - estimatedCost
              const estimatedMargin = estimatedIncome > 0
                ? (estimatedProfit / estimatedIncome) * 100
                : 0
              const profitabilityClassName =
                estimatedProfit > 0
                  ? 'finance-result-positive'
                  : estimatedProfit < 0
                    ? 'finance-result-negative'
                    : 'muted-label'
              const enteredAmount = Number(paymentDraft.amount)
              const hasAmountValue = paymentDraft.amount !== ''
              const isAmountPositive = !Number.isNaN(enteredAmount) && enteredAmount > 0
              const exceedsDebt = isAmountPositive && enteredAmount > remainingDebt
              const isPaymentAmountInvalid = !isAmountPositive || exceedsDebt
              const shippingCostValue = Number(deliveryDraft.shippingCost)
              const normalizedShippingCost = Number.isNaN(shippingCostValue)
                ? 0
                : Math.max(shippingCostValue, 0)

              const handleAddPayment = () => {
                const amount = Number(paymentDraft.amount)
                if (Number.isNaN(amount) || amount <= 0) return
                if (amount > remainingDebt) return

                onRegisterPayment(orderId, {
                  amount,
                  method: paymentDraft.method,
                })

                setPaymentDrafts((prevDrafts) => ({
                  ...prevDrafts,
                  [orderId]: {
                    amount: '',
                    method: paymentDraft.method,
                  },
                }))
              }

              const handleSendByWhatsApp = () => {
                const clientById = clientsById[String(order.clientId ?? '')]
                const clientNameKey = String(order.clientName ?? order.client ?? '')
                  .trim()
                  .toLowerCase()
                const clientByName = clientsByName[clientNameKey]
                const targetClient = clientById ?? clientByName ?? null
                const clientPhone = normalizePhone(targetClient?.phone)

                if (!clientPhone) {
                  window.alert('Este cliente no tiene número de WhatsApp registrado.')
                  return
                }

                const clientName = String(targetClient?.name ?? orderClient)
                const lines = [
                  `Hola 👋 ${clientName}`,
                  '',
                  `Te envío tu orden de pedido ${orderId}.`,
                  `Fecha de entrega: ${formatDate(order.deliveryDate)}`,
                  '',
                  `Total: ${formatCurrency(finalTotal)}`,
                  `Saldo pendiente: ${formatCurrency(remainingDebt)}`,
                ]

                if (!order.isSample && remainingDebt > 0) {
                  lines.push('', 'Podés pagar escaneando el QR en el PDF.')
                }

                lines.push('', 'Quedamos atentos.', 'PACKYA')

                const text = encodeURIComponent(lines.join('\n'))
                const url = `https://wa.me/${clientPhone}?text=${text}`
                window.open(url, '_blank', 'noopener,noreferrer')
              }

              const handleSaveDeliveryData = () => {
                const productionDate = deliveryDraft.productionDate
                  ? new Date(`${deliveryDraft.productionDate}T00:00:00`).toISOString()
                  : order.productionDate

                const payload = {
                  productionDate,
                  deliveredVia: deliveryDraft.deliveredVia,
                  deliveredBy: deliveryDraft.deliveredBy,
                  trackingNumber: deliveryDraft.trackingNumber,
                  deliveryDetails: deliveryDraft.deliveryDetails,
                  shippingCost: normalizedShippingCost,
                }

                const savedDataSnapshot = {
                  productionDate: deliveryDraft.productionDate,
                  deliveredVia: deliveryDraft.deliveredVia,
                  deliveredBy: deliveryDraft.deliveredBy,
                  trackingNumber: deliveryDraft.trackingNumber,
                  deliveryDetails: deliveryDraft.deliveryDetails,
                  shippingCost: normalizedShippingCost,
                }

                try {
                  if (typeof onUpdateOrderDelivery !== 'function') {
                    throw new Error('Handler de entrega no disponible')
                  }

                  onUpdateOrderDelivery(orderId, payload)

                  setDeliverySaveUiByOrder((prev) => ({
                    ...prev,
                    [orderId]: {
                      isEditing: false,
                      status: 'success',
                      savedData: savedDataSnapshot,
                      errorMessage: '',
                    },
                  }))
                } catch {
                  setDeliverySaveUiByOrder((prev) => ({
                    ...prev,
                    [orderId]: {
                      isEditing: true,
                      status: 'error',
                      savedData: prev[orderId]?.savedData ?? null,
                      errorMessage: 'No se pudieron guardar los datos de entrega. Revisá y volvé a intentar.',
                    },
                  }))
                }
              }

              const handleEditDeliveryData = () => {
                setDeliverySaveUiByOrder((prev) => ({
                  ...prev,
                  [orderId]: {
                    isEditing: true,
                    status: 'idle',
                    savedData: prev[orderId]?.savedData ?? null,
                    errorMessage: '',
                  },
                }))
              }

              const handleStartItemsEdit = () => {
                const draftFromOrder = items.length > 0
                  ? items.map((item) => createEditableItem(item))
                  : [createEditableItem()]

                setItemsDrafts((prev) => ({
                  ...prev,
                  [orderId]: draftFromOrder,
                }))
              }

              const handleCancelItemsEdit = () => {
                setItemsDrafts((prev) => {
                  const next = { ...prev }
                  delete next[orderId]
                  return next
                })
              }

              const handleItemsDraftChange = (itemIndex, field, value) => {
                setItemsDrafts((prev) => {
                  const current = Array.isArray(prev[orderId]) ? prev[orderId] : []
                  const nextRows = current.map((row, index) => {
                    if (index !== itemIndex) return row

                    if (field === 'quantity' || field === 'unitPrice') {
                      return { ...row, [field]: toPositiveNumber(value) }
                    }

                    return { ...row, [field]: value }
                  })

                  return {
                    ...prev,
                    [orderId]: nextRows,
                  }
                })
              }

              const handleAddItemDraftRow = () => {
                setItemsDrafts((prev) => {
                  const current = Array.isArray(prev[orderId]) ? prev[orderId] : []
                  return {
                    ...prev,
                    [orderId]: [...current, createEditableItem()],
                  }
                })
              }

              const handleRemoveItemDraftRow = (itemIndex) => {
                setItemsDrafts((prev) => {
                  const current = Array.isArray(prev[orderId]) ? prev[orderId] : []
                  if (current.length <= 1) return prev

                  return {
                    ...prev,
                    [orderId]: current.filter((_, index) => index !== itemIndex),
                  }
                })
              }

              const handleSaveItemsDraft = () => {
                const safeDraft = Array.isArray(itemsDraft) ? itemsDraft : []

                const sanitized = safeDraft
                  .map((item) => {
                    const productId = String(item?.productId ?? '').trim()
                    const quantity = toPositiveNumber(item?.quantity)
                    const unitPrice = toPositiveNumber(item?.unitPrice)

                    if (!productId || quantity <= 0) return null

                    return {
                      productId,
                      productName: String(productsById[productId]?.name ?? ''),
                      quantity,
                      unitPrice,
                      isClientMaterial: Boolean(item?.isClientMaterial ?? false),
                    }
                  })
                  .filter(Boolean)

                if (sanitized.length === 0) {
                  window.alert('Agregá al menos un producto válido para guardar el pedido.')
                  return
                }

                onUpdateOrderItems?.(orderId, sanitized)
                handleCancelItemsEdit()
              }

              const handleChangeOrderStatus = (nextStatus) => {
                const isTransitionToDelivered = orderStatus !== 'Entregado' && nextStatus === 'Entregado'
                if (!isTransitionToDelivered) {
                  onUpdateOrderStatus?.(orderId, nextStatus)
                  return
                }

                setDeliveryConfirmModal({
                  isOpen: true,
                  orderId,
                  initialDeliveryType: String(order?.deliveryType ?? order?.deliveredVia ?? '').trim(),
                  initialDeliveredBy: String(order?.deliveredBy ?? '').trim(),
                  initialDeliveryNote: String(order?.deliveryNote ?? order?.deliveryDetails ?? '').trim(),
                })
              }

              const handleCancelDeliveryConfirmation = () => {
                setDeliveryConfirmModal((prev) => ({
                  ...prev,
                  isOpen: false,
                  orderId: '',
                }))
              }

              const handleConfirmDeliveredStatus = (deliveryData) => {
                const safeDeliveryData = deliveryData && typeof deliveryData === 'object' ? deliveryData : {}

                onUpdateOrderDelivery?.(orderId, {
                  deliveryType: String(safeDeliveryData.deliveryType ?? '').trim(),
                  deliveredVia: String(safeDeliveryData.deliveryType ?? '').trim(),
                  deliveredBy: String(safeDeliveryData.deliveredBy ?? '').trim(),
                  deliveryNote: String(safeDeliveryData.deliveryNote ?? '').trim(),
                  deliveryDetails: String(safeDeliveryData.deliveryNote ?? '').trim(),
                })
                onUpdateOrderStatus?.(orderId, 'Entregado')
                handleCancelDeliveryConfirmation()
              }

              const handleUpdateOrderClient = (nextClientId) => {
                const targetClient = safeClients.find((client) => String(client?.id) === String(nextClientId))
                if (!targetClient) {
                  onUpdateOrderClient?.(orderId, {
                    clientId: '',
                    clientName: '',
                  })
                  return
                }

                onUpdateOrderClient?.(orderId, {
                  clientId: String(targetClient.id),
                  clientName: String(targetClient.name ?? '').trim(),
                })
              }

              const handleDeleteCancelledOrder = () => {
                if (orderStatus !== 'Cancelado') return

                const confirmed = window.confirm('¿Desea eliminar definitivamente este pedido cancelado?')
                if (!confirmed) return

                onDeleteCancelledOrder?.(orderId)
              }

              return (
                <Fragment key={orderId}>
                  <tr
                    className={`order-main-row ${order.isSample ? 'order-main-row-sample' : ''} ${isExpanded ? 'order-main-row-expanded' : ''} ${isForcedOpened ? 'order-main-row-focus' : ''}`}
                    onClick={() => toggleOrder(orderId)}
                  >
                    <td>{orderId}</td>
                    <td>
                      <div className="order-client-cell">
                        <span>{orderClient}</span>
                        {hasClientDebt && <span className="client-debt-badge">⚠ Cliente con deuda</span>}
                      </div>
                    </td>
                    <td>{formatDate(order.deliveryDate)}</td>
                    <td>
                      <div className="order-status-cell">
                        {order.isSample && <span className="status-badge status-muestra">MUESTRA</span>}
                        <span className={`status-badge ${statusBadgeClass}`}>
                          {statusLabel}
                        </span>
                      </div>
                    </td>
                    <td>{order.isSample ? 'Muestra' : formatCurrency(finalTotal)}</td>
                  </tr>

                  {isExpanded && (
                    <tr className="order-detail-row">
                      <td colSpan={5}>
                        <div className="order-detail-content">
                          <table className="order-items-table">
                            <thead>
                              <tr>
                                <th>Producto</th>
                                <th>Cantidad</th>
                                <th>Precio unitario</th>
                                <th>Subtotal ítem</th>
                              </tr>
                            </thead>
                            <tbody>
                              {items.length > 0 ? (
                                items.map((item, index) => {
                                  const itemSubtotal = Number(item.quantity || 0) * Number(item.unitPrice || 0)
                                  const isClientMaterial = Boolean(item?.isClientMaterial ?? false)
                                  return (
                                    <tr key={`${orderId}-item-${index}`}>
                                      <td>
                                        <div className="order-item-product-cell">
                                          <span>{item.productName || item.product || 'Sin producto'}</span>
                                          {isClientMaterial && (
                                            <span className="item-client-material-badge">
                                              Material provisto por cliente
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                      <td>{item.quantity}</td>
                                      <td>{formatCurrency(Number(item.unitPrice || 0))}</td>
                                      <td>{formatCurrency(itemSubtotal)}</td>
                                    </tr>
                                  )
                                })
                              ) : (
                                <tr>
                                  <td colSpan={4} className="empty-detail">
                                    Este pedido no tiene detalle de productos cargado.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>

                          {!order.isSample && (
                            <div className="order-items-edit-card">
                              {!isEditingItems ? (
                                <button
                                  type="button"
                                  className="secondary-btn"
                                  onClick={handleStartItemsEdit}
                                >
                                  Editar productos del pedido
                                </button>
                              ) : (
                                <>
                                  <div className="order-items-edit-grid">
                                    {itemsDraft.map((item, itemIndex) => {
                                      const lineSubtotal = toPositiveNumber(item.quantity) * toPositiveNumber(item.unitPrice)
                                      return (
                                        <div key={`${orderId}-draft-item-${itemIndex}`} className="order-items-edit-row">
                                          <select
                                            value={item.productId}
                                            onChange={(event) =>
                                              handleItemsDraftChange(itemIndex, 'productId', event.target.value)
                                            }
                                          >
                                            <option value="">Seleccionar producto</option>
                                            {safeProducts.map((product) => (
                                              <option key={product.id} value={product.id}>
                                                {product.name}
                                              </option>
                                            ))}
                                          </select>
                                          <input
                                            type="number"
                                            min="1"
                                            value={item.quantity}
                                            onChange={(event) =>
                                              handleItemsDraftChange(itemIndex, 'quantity', event.target.value)
                                            }
                                            placeholder="Cantidad"
                                          />
                                          <input
                                            type="number"
                                            min="0"
                                            value={item.unitPrice}
                                            onChange={(event) =>
                                              handleItemsDraftChange(itemIndex, 'unitPrice', event.target.value)
                                            }
                                            placeholder="Precio unitario"
                                          />
                                          <span className="muted-label">{formatCurrency(lineSubtotal)}</span>
                                          <button
                                            type="button"
                                            className="danger-ghost-btn"
                                            onClick={() => handleRemoveItemDraftRow(itemIndex)}
                                          >
                                            Quitar
                                          </button>
                                          <label className="item-material-toggle">
                                            <input
                                              type="checkbox"
                                              checked={Boolean(item.isClientMaterial)}
                                              onChange={(event) =>
                                                handleItemsDraftChange(itemIndex, 'isClientMaterial', event.target.checked)
                                              }
                                            />
                                            Material provisto por el cliente
                                          </label>
                                        </div>
                                      )
                                    })}
                                  </div>
                                  <div className="product-actions">
                                    <button type="button" className="secondary-btn" onClick={handleAddItemDraftRow}>
                                      + Agregar producto
                                    </button>
                                    <button type="button" className="secondary-btn" onClick={handleCancelItemsEdit}>
                                      Cancelar
                                    </button>
                                    <button type="button" className="primary-btn" onClick={handleSaveItemsDraft}>
                                      Guardar productos
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          )}

                          <div className="order-summary">
                            <p>
                              <span>Estado del pedido</span>
                              <strong>
                                <select
                                  className="inline-select"
                                  value={orderStatus}
                                  onChange={(event) =>
                                    handleChangeOrderStatus(event.target.value)
                                  }
                                >
                                  {statusOptions.map((statusOption) => (
                                    <option key={statusOption} value={statusOption}>
                                      {statusOption}
                                    </option>
                                  ))}
                                </select>
                              </strong>
                            </p>
                            {deliveryConfirmModal.isOpen && deliveryConfirmModal.orderId === orderId && (
                              <ConfirmDeliveryModal
                                initialDeliveryType={deliveryConfirmModal.initialDeliveryType}
                                initialDeliveredBy={deliveryConfirmModal.initialDeliveredBy}
                                initialDeliveryNote={deliveryConfirmModal.initialDeliveryNote}
                                onConfirm={handleConfirmDeliveredStatus}
                                onCancel={handleCancelDeliveryConfirmation}
                              />
                            )}
                            {!order.isSample && (
                              <p>
                                <span>Cliente</span>
                                <strong>
                                  <select
                                    className="inline-select"
                                    value={selectedClientIdForSelect}
                                    onChange={(event) => handleUpdateOrderClient(event.target.value)}
                                  >
                                    <option value="">Seleccionar cliente</option>
                                    {safeClients.map((client) => (
                                      <option key={client.id} value={client.id}>
                                        {client.name}
                                      </option>
                                    ))}
                                  </select>
                                </strong>
                              </p>
                            )}
                            <p>
                              <span>Creado el</span>
                              <strong>{formatDateTime(order.createdAt)}</strong>
                            </p>
                            {order.isSample ? (
                              <p>
                                <span>Tipo</span>
                                <strong>Muestra sin gestión financiera</strong>
                              </p>
                            ) : (
                              <>
                                <p>
                                  <span>Subtotal del pedido</span>
                                  <strong>{formatCurrency(effectiveSubtotal)}</strong>
                                </p>
                                <p>
                                  <span>Descuento aplicado</span>
                                  <strong>- {formatCurrency(discount)}</strong>
                                </p>
                                <p>
                                  <span>Total final</span>
                                  <strong>{formatCurrency(finalTotal)}</strong>
                                </p>
                                {financialNote && (
                                  <p>
                                    <span>Observación financiera</span>
                                    <strong>{financialNote}</strong>
                                  </p>
                                )}
                              </>
                            )}
                          </div>

                          {!order.isSample && (
                            <div className="profitability-card">
                              <h4>Rentabilidad estimada (sobre facturado)</h4>
                              <p>
                                <span>Costo estimado</span>
                                <strong>{formatCurrency(estimatedCost)}</strong>
                              </p>
                              <p>
                                <span>Ingreso total</span>
                                <strong>{formatCurrency(estimatedIncome)}</strong>
                              </p>
                              <p>
                                <span>Ganancia estimada</span>
                                <strong className={profitabilityClassName}>{formatCurrency(estimatedProfit)}</strong>
                              </p>
                              <p>
                                <span>Margen %</span>
                                <strong className={profitabilityClassName}>{estimatedMargin.toFixed(2)}%</strong>
                              </p>
                            </div>
                          )}

                          {!order.isSample && (
                            <div className="payment-form">
                              <h4>Datos de entrega</h4>
                              {deliverySaveUi.status === 'success' && !deliverySaveUi.isEditing && (
                                <p className="delivery-save-success">Datos de entrega guardados correctamente.</p>
                              )}
                              {deliverySaveUi.status === 'error' && (
                                <p className="payment-error">{deliverySaveUi.errorMessage}</p>
                              )}

                              {deliverySaveUi.isEditing ? (
                                <>
                                  <div className="payment-form-row">
                                    <select
                                      value={deliveryDraft.deliveredVia}
                                      onChange={(event) =>
                                        updateDeliveryDraft(orderId, 'deliveredVia', event.target.value)
                                      }
                                    >
                                      <option value="">Tipo de entrega</option>
                                      {deliveryMethods.map((method) => (
                                        <option key={method} value={method}>
                                          {method}
                                        </option>
                                      ))}
                                    </select>
                                    <input
                                      type="text"
                                      value={deliveryDraft.deliveredBy}
                                      onChange={(event) =>
                                        updateDeliveryDraft(orderId, 'deliveredBy', event.target.value)
                                      }
                                      placeholder="Entregado por"
                                    />
                                  </div>
                                  <div className="payment-form-row">
                                    <input
                                      type="text"
                                      value={deliveryDraft.trackingNumber}
                                      onChange={(event) =>
                                        updateDeliveryDraft(orderId, 'trackingNumber', event.target.value)
                                      }
                                      placeholder="Número de envío (opcional)"
                                    />
                                    <input
                                      type="number"
                                      min="0"
                                      step="1"
                                      value={deliveryDraft.shippingCost}
                                      onChange={(event) =>
                                        updateDeliveryDraft(orderId, 'shippingCost', event.target.value)
                                      }
                                      placeholder="Costo de envío (informativo)"
                                    />
                                  </div>
                                  <div className="payment-form-row">
                                    <input
                                      type="date"
                                      value={deliveryDraft.productionDate}
                                      onChange={(event) =>
                                        updateDeliveryDraft(orderId, 'productionDate', event.target.value)
                                      }
                                    />
                                    <button
                                      type="button"
                                      className="secondary-btn"
                                      onClick={handleSaveDeliveryData}
                                    >
                                      Guardar datos de entrega
                                    </button>
                                  </div>
                                  <textarea
                                    value={deliveryDraft.deliveryDetails}
                                    onChange={(event) =>
                                      updateDeliveryDraft(orderId, 'deliveryDetails', event.target.value)
                                    }
                                    placeholder="Observaciones de entrega"
                                  />
                                  <p className="payment-helper">
                                    El costo de envío es informativo y no impacta finanzas.
                                  </p>
                                </>
                              ) : (
                                <>
                                  <div className="delivery-saved-summary">
                                    <p>
                                      <span>Tipo de entrega</span>
                                      <strong>{deliverySaveUi.savedData?.deliveredVia || 'Sin completar'}</strong>
                                    </p>
                                    <p>
                                      <span>Entregado por</span>
                                      <strong>{deliverySaveUi.savedData?.deliveredBy || 'Sin completar'}</strong>
                                    </p>
                                    <p>
                                      <span>Número de envío</span>
                                      <strong>{deliverySaveUi.savedData?.trackingNumber || 'Sin número'}</strong>
                                    </p>
                                    <p>
                                      <span>Observaciones</span>
                                      <strong>{deliverySaveUi.savedData?.deliveryDetails || 'Sin observaciones'}</strong>
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    className="secondary-btn"
                                    onClick={handleEditDeliveryData}
                                  >
                                    Editar
                                  </button>
                                </>
                              )}
                            </div>
                          )}

                          <div className="order-actions-row">
                            <button
                              type="button"
                              className="secondary-btn"
                              onClick={() => {
                                generateOrderPDF(order).catch(() => {
                                  window.alert('No se pudo generar el PDF del pedido.')
                                })
                              }}
                            >
                              📄 Imprimir orden de pedido
                            </button>
                            <button
                              type="button"
                              className="primary-btn"
                              onClick={handleSendByWhatsApp}
                            >
                              📲 Enviar por WhatsApp
                            </button>
                            {orderStatus === 'Cancelado' && (
                              <button
                                type="button"
                                className="danger-ghost-btn"
                                onClick={handleDeleteCancelledOrder}
                              >
                                ❌ Eliminar definitivamente
                              </button>
                            )}
                          </div>

                          {!order.isSample && (
                            <div className="payments-section">
                            <h4>Pagos registrados</h4>

                            <table className="payments-table">
                              <thead>
                                <tr>
                                  <th>ID</th>
                                  <th>Monto</th>
                                  <th>Método</th>
                                  <th>Fecha</th>
                                </tr>
                              </thead>
                              <tbody>
                                {payments.length > 0 ? (
                                  payments.map((payment) => (
                                    <tr key={payment.id}>
                                      <td>{payment.id}</td>
                                      <td>{formatCurrency(Number(payment.amount || 0))}</td>
                                      <td>{payment.method}</td>
                                      <td>{formatDateTime(payment.date)}</td>
                                    </tr>
                                  ))
                                ) : (
                                  <tr>
                                    <td colSpan={4} className="empty-detail">
                                      No hay pagos registrados.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>

                            <div className="payment-summary">
                              <p>
                                <span>Total pagado</span>
                                <strong>{formatCurrency(totalPaid)}</strong>
                              </p>
                              <p>
                                <span>Deuda restante</span>
                                <strong>{formatCurrency(remainingDebt)}</strong>
                              </p>
                              <p>
                                <span>Estado financiero</span>
                                <strong className={`finance-badge finance-${financialStatus.toLowerCase()}`}>
                                  {financialStatus}
                                </strong>
                              </p>
                            </div>

                            <div className="payment-form">
                              <h4>Registrar pago</h4>
                              <div className="payment-form-row">
                                <input
                                  type="number"
                                  min="0"
                                  max={remainingDebt}
                                  step="1"
                                  value={paymentDraft.amount}
                                  onChange={(event) =>
                                    updateDraft(orderId, 'amount', event.target.value)
                                  }
                                  placeholder="Monto"
                                />
                                <select
                                  value={paymentDraft.method}
                                  onChange={(event) =>
                                    updateDraft(orderId, 'method', event.target.value)
                                  }
                                >
                                  {paymentMethods.map((method) => (
                                    <option key={method} value={method}>
                                      {method}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  className="secondary-btn"
                                  onClick={handleAddPayment}
                                  disabled={remainingDebt <= 0 || isPaymentAmountInvalid}
                                >
                                  Agregar pago
                                </button>
                              </div>
                              <div className="payment-helper-row">
                                <p className="payment-helper">
                                  Deuda restante: {formatCurrency(remainingDebt)}
                                </p>
                                <button
                                  type="button"
                                  className="quick-fill-btn"
                                  onClick={() =>
                                    updateDraft(orderId, 'amount', String(remainingDebt))
                                  }
                                  disabled={remainingDebt <= 0}
                                >
                                  Completar deuda
                                </button>
                              </div>
                              {hasAmountValue && exceedsDebt && (
                                <p className="payment-error">
                                  El monto no puede superar la deuda restante.
                                </p>
                              )}
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

            {safeOrders.length === 0 && (
              <tr>
                <td colSpan={5} className="empty-detail">
                  No hay pedidos para el filtro seleccionado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default OrdersList
