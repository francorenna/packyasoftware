import { useEffect, useMemo, useState } from 'react'
import { createDebouncedStorageWriter } from '../utils/storageDebounce'
import { getOrderFinancialSummary } from '../utils/finance'

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

const calculateOrderSubtotal = (order) =>
  (Array.isArray(order?.items) ? order.items : []).reduce(
    (acc, item) =>
      acc + toPositiveNumber(item?.quantity) * toPositiveNumber(item?.unitPrice),
    0,
  )

const getRemainingDebt = (order) => {
  if (!order || typeof order !== 'object') return 0
  const summary = getOrderFinancialSummary(order)
  return Math.max(Number(summary?.remainingDebt || 0), 0)
}

const normalizeName = (value) => String(value ?? '').trim().toLowerCase()

const isOrderFromClient = (order, clientId, clientName) => {
  const orderClientId = String(order?.clientId ?? '').trim()
  const safeClientId = String(clientId ?? '').trim()
  if (orderClientId && safeClientId) return orderClientId === safeClientId

  const orderClientName = normalizeName(order?.clientName ?? order?.client)
  const safeClientName = normalizeName(clientName)
  return Boolean(orderClientName && safeClientName && orderClientName === safeClientName)
}

const parseDebtPriorityTimestamp = (order) => {
  const delivery = String(order?.deliveryDate ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(delivery)) {
    const parsed = new Date(`${delivery}T00:00:00`).getTime()
    if (!Number.isNaN(parsed)) return parsed
  }

  const createdAt = new Date(order?.createdAt).getTime()
  if (!Number.isNaN(createdAt)) return createdAt

  return Number.POSITIVE_INFINITY
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
            itemCompleted: Boolean(item.itemCompleted ?? false),
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
            note: String(payment.note ?? '').trim(),
          }
        })
        .filter(Boolean)
    : []

  const safeFinancialAdjustments = Array.isArray(order.financialAdjustments)
    ? order.financialAdjustments
        .map((adjustment, adjustmentIndex) => {
          if (!adjustment || typeof adjustment !== 'object') return null

          const amount = Number(adjustment.amount)
          if (!Number.isFinite(amount) || amount === 0) return null

          return {
            id: String(adjustment.id ?? `ADJ-${index + 1}-${adjustmentIndex + 1}`),
            amount,
            note: String(adjustment.note ?? adjustment.reason ?? '').trim(),
            date: String(adjustment.date ?? new Date().toISOString()),
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
    urgent: Boolean(order.urgent ?? false),
    isSample: Boolean(order.isSample ?? false),
    isArchived: Boolean(order.isArchived ?? false),
    archivedAt: normalizedArchivedAt,
    items: safeItems,
    payments: safePayments,
    financialAdjustments: safeFinancialAdjustments,
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
  const ordersStorageWriter = useMemo(
    () => createDebouncedStorageWriter({
      key: ORDERS_STORAGE_KEY,
      storageGetter: () => (typeof window !== 'undefined' ? window.localStorage : null),
      label: 'orders',
    }),
    [],
  )

  useEffect(() => {
    ordersStorageWriter.schedule(orders)
  }, [orders, ordersStorageWriter])

  useEffect(() => {
    const handleBeforeUnload = () => {
      ordersStorageWriter.flush()
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', handleBeforeUnload)
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', handleBeforeUnload)
      }
      ordersStorageWriter.flush()
      ordersStorageWriter.cancel()
    }
  }, [ordersStorageWriter])

  const createOrder = (newOrder) => {
    const safeItems = Array.isArray(newOrder?.items)
      ? newOrder.items
          .map((item) => {
            if (!item || typeof item !== 'object') return null

            const productId = String(item.productId ?? '').trim()
            const productName = String(item.productName ?? item.product ?? '').trim()
            const quantity = toPositiveNumber(item.quantity)
            const unitPrice = toPositiveNumber(item.unitPrice)

            if (quantity <= 0) return null
            if (!productId && !productName) return null

            return {
              productId,
              productName,
              quantity,
              unitPrice,
              isClientMaterial: Boolean(item.isClientMaterial ?? false),
              itemCompleted: Boolean(item.itemCompleted ?? false),
            }
          })
          .filter(Boolean)
      : []

    setOrders((prevOrders) => {
      // Generar ID único con verificación de colisión
      let finalId = String(newOrder.id ?? '').trim()
      while (!finalId || prevOrders.some((o) => o.id === finalId)) {
        finalId = `PED-${Date.now()}-${Math.floor(Math.random() * 1000)}`
      }

      const newOrderEntry = applyAutoArchive({
        ...newOrder,
        id: finalId,
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
        urgent: Boolean(newOrder.urgent ?? false),
        isArchived: Boolean(newOrder.isArchived ?? false),
        archivedAt: newOrder.archivedAt ?? null,
        items: safeItems,
        payments: [],
        financialAdjustments: [],
        isSample: Boolean(newOrder.isSample ?? false),
      })

      const nextOrders = [newOrderEntry, ...prevOrders]

      // Validación post-guardado
      console.assert(
        nextOrders.some((o) => o.id === finalId),
        `[Packya] Error al guardar pedido ${finalId}`,
      )

      if (!nextOrders.some((o) => o.id === finalId)) {
        console.error(`[Packya] Error al guardar pedido ${finalId} — no se encontró en nextOrders`)
      }

      return nextOrders
    })
  }

  const duplicateOrder = (orderId) => {
    setOrders((prevOrders) => {
      const original = prevOrders.find((o) => o.id === orderId)
      if (!original) return prevOrders

      let newId
      do {
        newId = `PED-${Date.now()}-${Math.floor(Math.random() * 1000)}`
      } while (prevOrders.some((o) => o.id === newId))

      const duplicated = applyAutoArchive({
        ...original,
        id: newId,
        status: 'Pendiente',
        createdAt: new Date().toISOString(),
        isArchived: false,
        archivedAt: null,
        payments: [],
        financialAdjustments: [],
      })

      return [duplicated, ...prevOrders]
    })
  }

  const reopenArchivedOrderAsNew = (orderId) => {
    let createdOrderId = ''

    setOrders((prevOrders) => {
      const original = prevOrders.find((order) => order.id === orderId)
      if (!original || original.isArchived !== true) return prevOrders

      let newId
      do {
        newId = `PED-${Date.now()}-${Math.floor(Math.random() * 1000)}`
      } while (prevOrders.some((order) => order.id === newId))

      const nextStatus = original.isSample ? sampleStatuses[0] : 'Pendiente'

      const reopenedCopy = applyAutoArchive({
        ...original,
        id: newId,
        status: nextStatus,
        createdAt: new Date().toISOString(),
        isArchived: false,
        archivedAt: null,
        payments: [],
        financialAdjustments: [],
      })

      createdOrderId = newId
      return [reopenedCopy, ...prevOrders]
    })

    return createdOrderId
  }

  const registerPayment = (orderId, paymentData) => {
    const paymentAmount = toPositiveNumber(paymentData.amount)
    if (paymentAmount <= 0) return

    const paymentMethod = allowedPaymentMethods.includes(paymentData.method)
      ? paymentData.method
      : allowedPaymentMethods[0]

    setOrders((prevOrders) => {
      const targetOrder = prevOrders.find((o) => o.id === orderId)

      const newPayment = {
        id: `PAY-${Date.now()}`,
        amount: paymentAmount,
        method: paymentMethod,
        date: new Date().toISOString(),
        note: String(paymentData.note ?? '').trim(),
        orderId,
        clientId: String(targetOrder?.clientId ?? ''),
      }

      return prevOrders.map((order) => {
        if (order.id !== orderId) return order

        // Do not register payments for sample orders
        if (order.isSample) return order

        const remainingDebt = getRemainingDebt(order)
        if (paymentAmount > remainingDebt) return order

        const nextOrder = {
          ...order,
          payments: [...(Array.isArray(order.payments) ? order.payments : []), newPayment],
        }

        return applyAutoArchive(nextOrder)
      })
    })
  }

  const registerClientPayment = (paymentData) => {
    const safePaymentData = paymentData && typeof paymentData === 'object' ? paymentData : {}
    const paymentAmount = toPositiveNumber(safePaymentData.amount)
    if (paymentAmount <= 0) return

    let allocationResult = null

    const paymentMethod = allowedPaymentMethods.includes(safePaymentData.method)
      ? safePaymentData.method
      : allowedPaymentMethods[0]

    const targetClientId = String(safePaymentData.clientId ?? '').trim()
    const targetClientName = String(safePaymentData.clientName ?? '').trim()
    if (!targetClientId && !targetClientName) return

    setOrders((prevOrders) => {
      const eligibleOrders = prevOrders
        .filter((order) => !order?.isSample)
        .filter((order) => String(order?.status ?? '') !== 'Cancelado')
        .filter((order) => isOrderFromClient(order, targetClientId, targetClientName))
        .filter((order) => getRemainingDebt(order) > 0)
        .toSorted((a, b) => {
          const aTs = parseDebtPriorityTimestamp(a)
          const bTs = parseDebtPriorityTimestamp(b)
          if (aTs !== bTs) return aTs - bTs
          return String(a?.id ?? '').localeCompare(String(b?.id ?? ''))
        })

      if (eligibleOrders.length === 0) return prevOrders

      let remainingToAllocate = paymentAmount
      const allocationMap = {}

      eligibleOrders.forEach((order) => {
        if (remainingToAllocate <= 0) return

        const debt = getRemainingDebt(order)
        if (debt <= 0) return

        const allocation = Math.min(debt, remainingToAllocate)
        if (allocation <= 0) return

        allocationMap[String(order.id)] = allocation
        remainingToAllocate -= allocation
      })

      const allocatedOrderIds = Object.keys(allocationMap)
      if (allocatedOrderIds.length === 0) return prevOrders

      const allocationBatchId = `PAYB-${Date.now()}`
      const createdAt = new Date().toISOString()
      const totalApplied = allocatedOrderIds.reduce(
        (acc, id) => acc + Number(allocationMap[id] || 0),
        0,
      )
      const overpayCredit = Math.max(paymentAmount - totalApplied, 0)

      allocationResult = {
        paymentAmount,
        totalApplied,
        overpayCredit,
        allocationBatchId,
        clientId: targetClientId,
        clientName: targetClientName,
        createdAt,
        method: paymentMethod,
        note: String(safePaymentData.note ?? '').trim(),
        allocations: allocatedOrderIds.map((id) => ({
          orderId: id,
          amount: Number(allocationMap[id] || 0),
        })),
      }

      return prevOrders.map((order) => {
        const orderId = String(order?.id ?? '')
        const allocatedAmount = Number(allocationMap[orderId] || 0)
        if (allocatedAmount <= 0) return order

        const allocationIndex = allocatedOrderIds.findIndex((id) => id === orderId)
        const newPayment = {
          id: `PAY-${Date.now()}-${allocationIndex + 1}`,
          amount: allocatedAmount,
          method: paymentMethod,
          date: createdAt,
          note: String(safePaymentData.note ?? '').trim(),
          orderId,
          clientId: String(order?.clientId ?? targetClientId),
          allocationBatchId,
          allocationOrder: allocationIndex + 1,
          isAutoAllocated: true,
          clientPaymentAmount: paymentAmount,
          overpayCredit,
        }

        const nextOrder = {
          ...order,
          payments: [...(Array.isArray(order.payments) ? order.payments : []), newPayment],
        }

        return applyAutoArchive(nextOrder)
      })
    })

    return allocationResult
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

  const registerOrderFinancialAdjustment = (orderId, adjustmentData) => {
    const safeData = adjustmentData && typeof adjustmentData === 'object' ? adjustmentData : {}
    const amount = Number(safeData.amount)
    if (!Number.isFinite(amount) || amount === 0) return

    const note = String(safeData.note ?? safeData.reason ?? '').trim()
    if (!note) return

    const newAdjustment = {
      id: `ADJ-${Date.now()}`,
      amount,
      note,
      date: new Date().toISOString(),
    }

    setOrders((prevOrders) =>
      prevOrders.map((order) => {
        if (order.id !== orderId) return order

        return applyAutoArchive({
          ...order,
          financialAdjustments: [
            ...(Array.isArray(order.financialAdjustments) ? order.financialAdjustments : []),
            newAdjustment,
          ],
        })
      }),
    )
  }

  const appendOrderFinancialObservation = (orderId, observation) => {
    const note = String(observation ?? '').trim()
    if (!note) return

    const timestamp = new Date().toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

    setOrders((prevOrders) =>
      prevOrders.map((order) => {
        if (order.id !== orderId) return order

        const previousNote = String(order.financialNote ?? '').trim()
        const nextLine = `[${timestamp}] ${note}`
        const combinedNote = previousNote
          ? `${previousNote}\n${nextLine}`
          : nextLine

        return {
          ...order,
          financialNote: combinedNote,
        }
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

  const updateOrderUrgency = (orderId, isUrgent) => {
    setOrders((prevOrders) =>
      prevOrders.map((order) => {
        if (order.id !== orderId) return order

        return {
          ...order,
          urgent: Boolean(isUrgent),
        }
      }),
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
              itemCompleted: Boolean(item.itemCompleted ?? false),
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

  const updateOrderItemCompletion = (orderId, itemIndex, itemCompleted) => {
    const safeIndex = Number(itemIndex)
    if (!Number.isInteger(safeIndex) || safeIndex < 0) return

    setOrders((prevOrders) =>
      prevOrders.map((order) => {
        if (order.id !== orderId) return order

        const safeItems = Array.isArray(order.items) ? order.items : []
        if (safeIndex >= safeItems.length) return order

        const nextItems = safeItems.map((item, index) => {
          if (index !== safeIndex) return item
          return {
            ...item,
            itemCompleted: Boolean(itemCompleted),
          }
        })

        return {
          ...order,
          items: nextItems,
        }
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

  const deleteArchivedOrder = (orderId) => {
    const safeOrderId = String(orderId ?? '').trim()
    if (!safeOrderId) return

    setOrders((prevOrders) =>
      prevOrders.filter((order) => {
        if (String(order?.id ?? '') !== safeOrderId) return true
        return order?.isArchived !== true
      }),
    )
  }

  return {
    orders,
    createOrder,
    duplicateOrder,
    registerPayment,
    registerClientPayment,
    updateOrderStatus,
    updateOrderDelivery,
    registerOrderFinancialAdjustment,
    appendOrderFinancialObservation,
    reopenOrder,
    updateOrderClient,
    updateOrderItems,
    updateOrderItemCompletion,
    updateOrderUrgency,
    convertSampleToRealOrder,
    deleteCancelledOrder,
    reopenArchivedOrderAsNew,
    deleteArchivedOrder,
  }
}

export default useOrdersState
