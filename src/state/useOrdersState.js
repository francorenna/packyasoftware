import { useEffect, useState } from 'react'

const ORDERS_STORAGE_KEY = 'packya_orders'
const STORAGE_VERSION_KEY = 'packya_storage_version'
const regularStatuses = ['Pendiente', 'En Proceso', 'Listo', 'Entregado', 'Cancelado']
const sampleStatuses = ['Pendiente', 'Lista']
const allowedPaymentMethods = ['Efectivo', 'Transferencia', 'MercadoPago']

const initialOrders = [
  {
    id: 'PED-001',
    client: 'Cartonera Norte SRL',
    status: 'Pendiente',
    createdAt: '2026-02-12T09:10:00.000Z',
    deliveryDate: '2026-02-15',
    discount: 5000,
    items: [
      { product: 'Caja 30x20', quantity: 100, unitPrice: 600 },
      { product: 'Caja 40x30', quantity: 50, unitPrice: 600 },
    ],
    payments: [
      {
        id: 'PAY-001',
        amount: 30000,
        method: 'Transferencia',
        date: '2026-02-13T13:00:00.000Z',
      },
    ],
    total: 85000,
  },
  {
    id: 'PED-002',
    client: 'Distribuidora M&G',
    status: 'En Proceso',
    createdAt: '2026-02-13T11:25:00.000Z',
    deliveryDate: '2026-02-16',
    discount: 4500,
    items: [
      { product: 'Caja reforzada 50x40', quantity: 80, unitPrice: 1400 },
      { product: 'Separadores internos', quantity: 30, unitPrice: 430 },
    ],
    payments: [],
    total: 120500,
  },
]

const toPositiveNumber = (value) => {
  const parsed = Number(value)
  return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed
}

const toIsoString = (value) => {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString()
}

const toDateOnlyIso = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return ''
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString()
}

const calculateTotalPaid = (payments) =>
  (Array.isArray(payments) ? payments : []).reduce(
    (acc, payment) => acc + toPositiveNumber(payment.amount),
    0,
  )

const calculateOrderSubtotal = (order) =>
  (Array.isArray(order?.items) ? order.items : []).reduce(
    (acc, item) =>
      acc + toPositiveNumber(item?.quantity) * toPositiveNumber(item?.unitPrice),
    0,
  )

const getRemainingDebt = (order) => {
  if (!order || typeof order !== 'object') return 0
  const finalTotal = toPositiveNumber(order.total)
  const totalPaid = calculateTotalPaid(order.payments)
  return Math.max(finalTotal - totalPaid, 0)
}

const applySampleAutoArchive = (order) => {
  if (!order?.isSample) return order

  if (String(order.status ?? '') === 'Lista') {
    if (order.isArchived === true && String(order.archivedAt ?? '').trim()) return order

    return {
      ...order,
      isArchived: true,
      archivedAt: String(order.archivedAt ?? '').trim() || new Date().toISOString(),
    }
  }

  if (order.isArchived !== true && !String(order.archivedAt ?? '').trim()) return order

  return {
    ...order,
    isArchived: false,
    archivedAt: null,
  }
}

const applyAutoArchive = (order) => {
  if (!order || typeof order !== 'object') return order
  if (order.isSample) return applySampleAutoArchive(order)
  if (String(order.status ?? '') !== 'Entregado') return order

  const remainingDebt = getRemainingDebt(order)
  if (remainingDebt > 0) {
    if (order.isArchived !== true && !String(order.archivedAt ?? '').trim()) return order

    return {
      ...order,
      isArchived: false,
      archivedAt: null,
    }
  }

  if (order.isArchived === true && String(order.archivedAt ?? '').trim()) return order

  return {
    ...order,
    isArchived: true,
    archivedAt: String(order.archivedAt ?? '').trim() || new Date().toISOString(),
  }
}

const normalizeOrder = (order, index) => {
  if (!order || typeof order !== 'object') return null

  const safeItems = Array.isArray(order.items)
    ? order.items
        .map((item) => {
          if (!item || typeof item !== 'object') return null

          return {
            productId: item.productId ? String(item.productId) : '',
            productName: String(item.productName ?? item.product ?? '').trim(),
            quantity: toPositiveNumber(item.quantity),
            unitPrice: toPositiveNumber(item.unitPrice),
            isClientMaterial: Boolean(item.isClientMaterial ?? false),
          }
        })
        .filter(Boolean)
    : []

  const safePayments = Array.isArray(order.payments)
    ? order.payments
        .map((payment, paymentIndex) => {
          if (!payment || typeof payment !== 'object') return null

          const method = allowedPaymentMethods.includes(payment.method)
            ? payment.method
            : allowedPaymentMethods[0]

          return {
            id: String(payment.id ?? `PAY-${index + 1}-${paymentIndex + 1}`),
            amount: toPositiveNumber(payment.amount),
            method,
            date: String(payment.date ?? new Date().toISOString()),
          }
        })
        .filter(Boolean)
    : []

  const safeStatus = (() => {
    if (order?.isSample) {
      return sampleStatuses.includes(order.status) ? order.status : sampleStatuses[0]
    }

    return regularStatuses.includes(order.status) ? order.status : regularStatuses[0]
  })()

  const normalizedCreatedAt = String(order.createdAt ?? new Date().toISOString())
  const normalizedProductionDate =
    toIsoString(order.productionDate) ||
    toDateOnlyIso(typeof order.productionDate === 'string' ? order.productionDate : '') ||
    toIsoString(normalizedCreatedAt) ||
    new Date().toISOString()

  const normalizedArchivedAt = (() => {
    if (order.archivedAt === null) return null
    const parsed = toIsoString(order.archivedAt)
    return parsed || null
  })()

  return {
    id: String(order.id ?? `PED-${String(index + 1).padStart(3, '0')}`),
    clientId: String(order.clientId ?? ''),
    clientName: String(order.clientName ?? order.client ?? 'Sin cliente'),
    client: String(order.client ?? order.clientName ?? 'Sin cliente'),
    status: safeStatus,
    createdAt: normalizedCreatedAt,
    productionDate: normalizedProductionDate,
    deliveryDate:
      typeof order.deliveryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(order.deliveryDate)
        ? order.deliveryDate
        : '',
    deliveredVia: String(order.deliveredVia ?? '').trim(),
    deliveryType: String(order.deliveryType ?? '').trim(),
    deliveredBy: String(order.deliveredBy ?? '').trim(),
    trackingNumber: String(order.trackingNumber ?? '').trim(),
    deliveryNote: String(order.deliveryNote ?? order.deliveryDetails ?? '').trim(),
    deliveryDetails: String(order.deliveryDetails ?? '').trim(),
    productionTime: String(order.productionTime ?? '').trim(),
    sourceQuoteId: String(order.sourceQuoteId ?? '').trim(),
    shippingCost: toPositiveNumber(order.shippingCost),
    financialNote: String(order.financialNote ?? '').trim(),
    discount: toPositiveNumber(order.discount),
    isSample: Boolean(order.isSample ?? false),
    isArchived: Boolean(order.isArchived ?? false),
    archivedAt: normalizedArchivedAt,
    items: safeItems,
    payments: safePayments,
    total: toPositiveNumber(order.total),
  }
}

const loadOrdersFromStorage = () => {
  const storedOrders = localStorage.getItem(ORDERS_STORAGE_KEY)

  if (storedOrders === null) {
    const alreadySeeded = localStorage.getItem(STORAGE_VERSION_KEY)
    if (!alreadySeeded) {
      try {
        localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(initialOrders))
      } catch (error) {
        void error
      }
      return initialOrders
    }

    try {
      localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify([]))
    } catch (error) {
      void error
    }
    return []
  }

  try {
    const parsedOrders = JSON.parse(storedOrders)
    if (!Array.isArray(parsedOrders)) return []

    const normalizedOrders = parsedOrders
      .map((order, index) => normalizeOrder(order, index))
      .filter(Boolean)
      .map((order) => applyAutoArchive(order))

    return normalizedOrders
  } catch {
    return []
  }
}

function useOrdersState() {
  const [orders, setOrders] = useState(() => loadOrdersFromStorage())

  useEffect(() => {
    try {
      localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(orders))
    } catch (error) {
      void error
    }
  }, [orders])

  const createOrder = (newOrder) => {
    setOrders((prevOrders) => [
      applyAutoArchive({
        ...newOrder,
        clientId: String(newOrder.clientId ?? ''),
        clientName: String(newOrder.clientName ?? newOrder.client ?? 'Sin cliente'),
        client: String(newOrder.clientName ?? newOrder.client ?? 'Sin cliente'),
        createdAt: String(newOrder.createdAt ?? new Date().toISOString()),
        productionDate: toIsoString(newOrder.productionDate) || toIsoString(newOrder.createdAt) || new Date().toISOString(),
        deliveredVia: String(newOrder.deliveredVia ?? '').trim(),
        deliveryType: String(newOrder.deliveryType ?? '').trim(),
        deliveredBy: String(newOrder.deliveredBy ?? '').trim(),
        trackingNumber: String(newOrder.trackingNumber ?? '').trim(),
        deliveryNote: String(newOrder.deliveryNote ?? newOrder.deliveryDetails ?? '').trim(),
        deliveryDetails: String(newOrder.deliveryDetails ?? '').trim(),
        productionTime: String(newOrder.productionTime ?? '').trim(),
        sourceQuoteId: String(newOrder.sourceQuoteId ?? '').trim(),
        shippingCost: toPositiveNumber(newOrder.shippingCost),
        financialNote: String(newOrder.financialNote ?? '').trim(),
        isArchived: Boolean(newOrder.isArchived ?? false),
        archivedAt: newOrder.archivedAt ?? null,
        payments: [],
        isSample: Boolean(newOrder.isSample ?? false),
      }),
      ...prevOrders,
    ])
  }

  const registerPayment = (orderId, paymentData) => {
    const paymentAmount = toPositiveNumber(paymentData.amount)
    if (paymentAmount <= 0) return

    const paymentMethod = allowedPaymentMethods.includes(paymentData.method)
      ? paymentData.method
      : allowedPaymentMethods[0]

    const newPayment = {
      id: `PAY-${Date.now()}`,
      amount: paymentAmount,
      method: paymentMethod,
      date: new Date().toISOString(),
    }

    setOrders((prevOrders) =>
      prevOrders.map((order) => {
        if (order.id !== orderId) return order

        // Do not register payments for sample orders
        if (order.isSample) return order

        const totalPaid = calculateTotalPaid(order.payments)
        const remainingDebt = Math.max(toPositiveNumber(order.total) - totalPaid, 0)
        if (paymentAmount > remainingDebt) return order

        const nextOrder = {
          ...order,
          payments: [...(Array.isArray(order.payments) ? order.payments : []), newPayment],
        }

        return applyAutoArchive(nextOrder)
      }),
    )
  }

  const updateOrderStatus = (orderId, nextStatus) => {
    setOrders((prevOrders) =>
      prevOrders.map((order) => {
        if (order.id !== orderId) return order

        const statusList = order.isSample ? sampleStatuses : regularStatuses
        const safeStatus = statusList.includes(nextStatus) ? nextStatus : statusList[0]

        return applyAutoArchive({
          ...order,
          status: safeStatus,
        })
      }),
    )
  }

  const updateOrderDelivery = (orderId, deliveryData) => {
    const safeDeliveryData = deliveryData && typeof deliveryData === 'object' ? deliveryData : {}

    setOrders((prevOrders) =>
      prevOrders.map((order) => {
        if (order.id !== orderId) return order

        const nextOrder = {
          ...order,
          productionDate:
            toIsoString(safeDeliveryData.productionDate) ||
            toDateOnlyIso(String(safeDeliveryData.productionDate ?? '')) ||
            order.productionDate,
          deliveredVia: String(
            safeDeliveryData.deliveredVia ??
              safeDeliveryData.deliveryType ??
              order.deliveredVia ??
              order.deliveryType ??
              '',
          ).trim(),
          deliveryType: String(
            safeDeliveryData.deliveryType ??
              safeDeliveryData.deliveredVia ??
              order.deliveryType ??
              order.deliveredVia ??
              '',
          ).trim(),
          deliveredBy: String(safeDeliveryData.deliveredBy ?? order.deliveredBy ?? '').trim(),
          trackingNumber: String(safeDeliveryData.trackingNumber ?? order.trackingNumber ?? '').trim(),
          deliveryNote: String(
            safeDeliveryData.deliveryNote ??
              safeDeliveryData.deliveryDetails ??
              order.deliveryNote ??
              order.deliveryDetails ??
              '',
          ).trim(),
          deliveryDetails: String(
            safeDeliveryData.deliveryDetails ??
              safeDeliveryData.deliveryNote ??
              order.deliveryDetails ??
              order.deliveryNote ??
              '',
          ).trim(),
          shippingCost: toPositiveNumber(
            safeDeliveryData.shippingCost ?? order.shippingCost,
          ),
        }

        return applyAutoArchive(nextOrder)
      }),
    )
  }

  const reopenOrder = (orderId) => {
    setOrders((prevOrders) =>
      prevOrders.map((order) =>
        order.id === orderId
          ? applyAutoArchive({
              ...order,
              status: order.isSample ? sampleStatuses[0] : 'En Proceso',
              isArchived: false,
              archivedAt: null,
            })
          : order,
      ),
    )
  }

  const updateOrderItems = (orderId, nextItems) => {
    const safeNextItems = Array.isArray(nextItems)
      ? nextItems
          .map((item) => {
            if (!item || typeof item !== 'object') return null

            const productId = String(item.productId ?? '').trim()
            const productName = String(item.productName ?? item.product ?? '').trim()
            const quantity = toPositiveNumber(item.quantity)
            const unitPrice = toPositiveNumber(item.unitPrice)

            if (!productId || quantity <= 0) return null

            return {
              productId,
              productName,
              quantity,
              unitPrice,
              isClientMaterial: Boolean(item.isClientMaterial ?? false),
            }
          })
          .filter(Boolean)
      : []

    if (safeNextItems.length === 0) return

    setOrders((prevOrders) =>
      prevOrders.map((order) => {
        if (order.id !== orderId) return order

        const subtotal = safeNextItems.reduce(
          (acc, item) => acc + toPositiveNumber(item.quantity) * toPositiveNumber(item.unitPrice),
          0,
        )
        const currentDiscount = toPositiveNumber(order.discount)
        const adjustedDiscount = Math.min(currentDiscount, subtotal)
        const nextTotal = order.isSample ? 0 : Math.max(subtotal - adjustedDiscount, 0)

        return applyAutoArchive({
          ...order,
          items: safeNextItems,
          total: nextTotal,
        })
      }),
    )
  }

  const updateOrderClient = (orderId, clientData) => {
    const safeClientData = clientData && typeof clientData === 'object' ? clientData : {}

    setOrders((prevOrders) =>
      prevOrders.map((order) => {
        if (order.id !== orderId) return order

        const clientId = String(safeClientData.clientId ?? '').trim()
        const clientName = String(
          safeClientData.clientName ?? safeClientData.client ?? order.clientName ?? order.client ?? '',
        ).trim()

        return {
          ...order,
          clientId,
          clientName,
          client: clientName || 'Sin cliente',
        }
      }),
    )
  }

  const convertSampleToRealOrder = (orderId, clientData = null) => {
    setOrders((prevOrders) =>
      prevOrders.map((order) => {
        if (order.id !== orderId) return order
        if (!order.isSample) return order

        const subtotal = calculateOrderSubtotal(order)
        const discount = toPositiveNumber(order.discount)
        const total = Math.max(subtotal - Math.min(discount, subtotal), 0)

        const safeClientData = clientData && typeof clientData === 'object' ? clientData : {}
        const clientId = String(safeClientData.clientId ?? order.clientId ?? '').trim()
        const clientName = String(
          safeClientData.clientName ?? safeClientData.client ?? order.clientName ?? order.client ?? '',
        ).trim()

        return {
          ...order,
          isSample: false,
          status: 'Pendiente',
          isArchived: false,
          archivedAt: null,
          total,
          clientId,
          clientName,
          client: clientName || 'Sin cliente',
        }
      }),
    )
  }

  const deleteCancelledOrder = (orderId) => {
    setOrders((prevOrders) =>
      prevOrders.filter((order) => {
        if (order.id !== orderId) return true
        return String(order.status ?? '') !== 'Cancelado'
      }),
    )
  }

  return {
    orders,
    createOrder,
    registerPayment,
    updateOrderStatus,
    updateOrderDelivery,
    reopenOrder,
    updateOrderClient,
    updateOrderItems,
    convertSampleToRealOrder,
    deleteCancelledOrder,
  }
}

export default useOrdersState
