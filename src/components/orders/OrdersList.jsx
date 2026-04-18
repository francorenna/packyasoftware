import { Fragment, memo, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { APP_CONFIG } from '../../config/app'
import { getOrderFinancialSummary } from '../../utils/finance'
import { formatOrderId } from '../../utils/orders'
import { generateOrderPDF } from '../../utils/pdf'
import ConfirmDeliveryModal from './ConfirmDeliveryModal'
import QuickPaymentModal from './QuickPaymentModal'
import { createCustomCompare } from '../../hooks/useMemoizedOrdersList'
import useAppDialog from '../../hooks/useAppDialog'

const paymentMethods = ['Efectivo', 'Transferencia', 'MercadoPago']
const orderStatuses = ['Pendiente', 'En Proceso', 'Listo', 'Entregado', 'Cancelado']
const sampleOrderStatuses = ['Pendiente', 'Lista']
const deliveryMethods = ['Presencial', 'Envío', 'Otro']
const COLLAPSED_SECTIONS_STORAGE_KEY = 'packya_orders_collapsed_sections_v1'

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
const CRITICAL_OBSERVATION_REGEX = /(⚠|siempre|revisar|urgente|especial|no olvidar|problema)/i

const normalizeObservationEntry = (entry, index = 0) => {
  const rawText = typeof entry === 'string' ? entry : entry?.text
  const text = String(rawText ?? '').trim()
  if (!text) return null

  return {
    id: String(entry?.id ?? `OBS-${Date.now()}-${index}`),
    text,
    createdAt: String(entry?.createdAt ?? new Date().toISOString()),
    isCritical:
      typeof entry?.isCritical === 'boolean'
        ? entry.isCritical
        : CRITICAL_OBSERVATION_REGEX.test(text),
  }
}

const getClientObservations = (client) => {
  if (!client || typeof client !== 'object') return []
  const source = Array.isArray(client.observations) ? client.observations : []
  return source
    .map((entry, index) => normalizeObservationEntry(entry, index))
    .filter(Boolean)
}

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

const getOrderStatusIcon = (status) => {
  if (status === 'Pendiente') return '🟡'
  if (status === 'En Proceso') return '🔵'
  if (status === 'Listo') return '🟢'
  if (status === 'Entregado') return '🚚'
  return '•'
}

const parseDeliveryTimestamp = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return Number.POSITIVE_INFINITY
  }

  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day).getTime()
}

const parseCreatedTimestamp = (value) => {
  const parsed = new Date(value)
  const timestamp = parsed.getTime()
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp
}

const getDaysSinceDelivery = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null

  const [year, month, day] = value.split('-').map(Number)
  const deliveryDate = new Date(year, month - 1, day)
  if (Number.isNaN(deliveryDate.getTime())) return null

  const today = new Date()
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const deliveryOnly = new Date(deliveryDate.getFullYear(), deliveryDate.getMonth(), deliveryDate.getDate())
  const diffMs = todayOnly.getTime() - deliveryOnly.getTime()
  const days = Math.max(0, Math.floor(diffMs / 86400000))
  return days
}

const getDaysSinceTimestamp = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 0

  const today = new Date()
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffMs = todayOnly.getTime() - dateOnly.getTime()
  return Math.max(0, Math.floor(diffMs / 86400000))
}

const getDebtAgingClassName = (days) => {
  if (days > 10) return 'collections-client-card-critical'
  if (days >= 4) return 'collections-client-card-warning'
  return 'collections-client-card-fresh'
}

const orderSectionMeta = {
  production: {
    title: 'Producción',
    badge: 'Producción',
    description: 'Pedidos en preparación y trabajo de planta.',
    accentClassName: 'orders-section-production',
    emptyText: 'No hay pedidos en producción para este filtro.',
  },
  ready: {
    title: 'Listos para entregar',
    badge: 'Listo',
    description: 'Pedidos terminados, pendientes de salida.',
    accentClassName: 'orders-section-ready',
    emptyText: 'No hay pedidos listos para entregar.',
  },
  collections: {
    title: 'Por cobrar',
    badge: 'Cobranza',
    description: 'Pedidos entregados con saldo pendiente.',
    accentClassName: 'orders-section-collections',
    emptyText: 'No hay pedidos entregados con deuda.',
  },
  delivered: {
    title: 'Entregados',
    badge: 'Entregado',
    description: 'Pedidos entregados sin deuda pendiente.',
    accentClassName: 'orders-section-ready',
    emptyText: 'No hay pedidos entregados para mostrar.',
  },
  cancelled: {
    title: 'Cancelados',
    badge: 'Cancelado',
    description: 'Pedidos fuera de operación, visibles para control.',
    accentClassName: 'orders-section-cancelled',
    emptyText: 'No hay pedidos cancelados.',
  },
}

const getOperationalSectionKey = (order, remainingDebt = 0) => {
  const status = String(order?.status ?? '')

  if (status === 'Listo') return 'ready'
  if (status === 'Entregado' && remainingDebt > 0) return 'collections'
  if (status === 'Entregado') return 'delivered'
  if (status === 'Cancelado') return 'cancelled'
  return 'production'
}

function OrdersList({
  orders,
  products,
  purchases,
  clients,
  stockByProductId,
  deliveryFilter,
  onFilterChange,
  searchQuery,
  onSearchChange,
  archivedCount = 0,
  initialExpandedOrderId,
  onRegisterPayment,
  onRegisterClientPayment,
  onUpdateOrderStatus,
  onUpdateOrderDelivery,
  onUpdateOrderClient,
  onUpdateOrderItems,
  onUpdateOrderItemCompletion,
  onUpdateOrderUrgency,
  onDeleteCancelledOrder,
  onSaveClient,
}) {
  const [expandedOrderId, setExpandedOrderId] = useState(null)
  const didExpandFromPropRef = useRef('')
  const collectionCardRefs = useRef({})
  const hasAutoScrolledCriticalRef = useRef(false)
  const collectingFeedbackTimeoutRef = useRef(null)
  const [paymentDrafts, setPaymentDrafts] = useState({})
  const [deliveryDrafts, setDeliveryDrafts] = useState({})
  const [itemsDrafts, setItemsDrafts] = useState({})
  const [deliverySaveUiByOrder, setDeliverySaveUiByOrder] = useState({})
  const [autoReadyPromptedByOrder, setAutoReadyPromptedByOrder] = useState({})
  const [deliveryConfirmModal, setDeliveryConfirmModal] = useState({
    isOpen: false,
    orderId: '',
    initialDeliveryType: '',
    initialDeliveredBy: '',
    initialDeliveryNote: '',
  })
  const [paymentQuickModal, setPaymentQuickModal] = useState({
    isOpen: false,
    orderId: '',
    mode: 'order',
    clientKey: '',
  })
  const [collectingOrderId, setCollectingOrderId] = useState('')
  const [collectingClientKey, setCollectingClientKey] = useState('')
  const [expandedCollectionClients, setExpandedCollectionClients] = useState({})
  const [collapsedSections, setCollapsedSections] = useState({
    production: false,
    ready: false,
    collections: false,
    delivered: true,
    cancelled: true,
  })
  const [clientObservationsModal, setClientObservationsModal] = useState({
    isOpen: false,
    client: null,
    orderId: '',
    observations: [],
    draft: '',
  })

  const { dialogNode, appAlert, appConfirm } = useAppDialog()
  const safeOrders = useMemo(() => {
    const baseOrders = Array.isArray(orders) ? orders : []
    const seen = new Set()

    return baseOrders.filter((order) => {
      const orderId = String(order?.id ?? '')
      if (seen.has(orderId)) return false
      seen.add(orderId)
      return true
    })
  }, [orders])
  const safeProducts = useMemo(() => (Array.isArray(products) ? products : []), [products])
  const safePurchases = useMemo(() => (Array.isArray(purchases) ? purchases : []), [purchases])
  const safeClients = useMemo(() => (Array.isArray(clients) ? clients : []), [clients])
  const safeStockByProductId = stockByProductId ?? {}
  const sortedProducts = useMemo(
    () =>
      (Array.isArray(products) ? products : []).toSorted((a, b) =>
        String(a?.name ?? '').localeCompare(String(b?.name ?? ''), 'es', { sensitivity: 'base' }),
      ),
    [products],
  )
  const sortedClients = useMemo(
    () =>
      (Array.isArray(clients) ? clients : []).toSorted((a, b) =>
        String(a?.name ?? '').localeCompare(String(b?.name ?? ''), 'es', { sensitivity: 'base' }),
      ),
    [clients],
  )
  useEffect(() => {
    if (!expandedOrderId) return
    if (!safeOrders.some((order) => String(order?.id ?? '') === expandedOrderId)) {
      setExpandedOrderId(null)
    }
  }, [safeOrders, expandedOrderId])

  useEffect(() => {
    if (!initialExpandedOrderId) return
    if (didExpandFromPropRef.current === initialExpandedOrderId) return
    didExpandFromPropRef.current = initialExpandedOrderId
    setExpandedOrderId(initialExpandedOrderId)
  }, [initialExpandedOrderId])

  useEffect(() => {
    if (typeof onUpdateOrderStatus !== 'function') return

    let hasMapChanges = false
    const nextPromptMap = { ...autoReadyPromptedByOrder }

    safeOrders.forEach((order) => {
      const orderId = String(order?.id ?? '')
      if (!orderId) return

      const status = String(order?.status ?? '')
      const items = Array.isArray(order?.items) ? order.items : []
      const hasItems = items.length > 0
      const allCompleted = hasItems && items.every((item) => Boolean(item?.itemCompleted))
      const shouldAutoPrompt = status === 'En Proceso' && allCompleted

      if (!shouldAutoPrompt) {
        if (nextPromptMap[orderId]) {
          nextPromptMap[orderId] = false
          hasMapChanges = true
        }
        return
      }

      if (nextPromptMap[orderId]) return

      nextPromptMap[orderId] = true
      hasMapChanges = true

      void appConfirm('Todos los ítems están completados.\n¿Deseas marcar el pedido como LISTO?').then((shouldMarkReady) => {
        if (shouldMarkReady) onUpdateOrderStatus(orderId, 'Listo')
      })
    })

    if (hasMapChanges) {
      setAutoReadyPromptedByOrder(nextPromptMap)
    }
  }, [autoReadyPromptedByOrder, onUpdateOrderStatus, safeOrders, appConfirm])

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

  const sendPaymentReminder = (order, remainingDebt) => {
    if (!order || typeof order !== 'object') return

    const clientById = clientsById[String(order.clientId ?? '')]
    const clientNameKey = String(order.clientName ?? order.client ?? '')
      .trim()
      .toLowerCase()
    const clientByName = clientsByName[clientNameKey]
    const targetClient = clientById ?? clientByName ?? null
    const clientPhone = normalizePhone(targetClient?.phone)

    if (!clientPhone) {
      void appAlert('Este cliente no tiene número de WhatsApp registrado.')
      return
    }

    const orderId = String(order.id ?? '')
    const clientName = String(targetClient?.name ?? order?.clientName ?? order?.client ?? 'Cliente')
    const safeDebt = Math.max(Number(remainingDebt || 0), 0)
    const lines = [
      `Hola ${clientName} 👋`,
      '',
      `Te recordamos que tenés un saldo pendiente de ${formatCurrency(safeDebt)}.`,
      `Pedido: ${formatOrderId(orderId)}`,
      `Fecha de entrega: ${formatDate(order.deliveryDate)}`,
      '',
      'Cualquier consulta, estamos a disposición.',
      'PACKYA',
    ]

    const text = encodeURIComponent(lines.join('\n'))
    const url = `https://wa.me/${clientPhone}?text=${text}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

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

  const orderFinancialMap = useMemo(
    () =>
      safeOrders.reduce((acc, order) => {
        const orderId = String(order?.id ?? '')
        if (!orderId) return acc
        acc[orderId] = getOrderFinancialSummary(order)
        return acc
      }, {}),
    [safeOrders],
  )

  const groupedSections = useMemo(() => {
    const sectionBuckets = {
      production: [],
      ready: [],
      collections: [],
      delivered: [],
      cancelled: [],
    }

    safeOrders.forEach((order) => {
      const orderId = String(order?.id ?? '')
      const financialSummary = orderFinancialMap[orderId] ?? getOrderFinancialSummary(order)
      const sectionKey = getOperationalSectionKey(order, financialSummary.remainingDebt)
      sectionBuckets[sectionKey].push(order)
    })

    sectionBuckets.production.sort((a, b) => {
      const aUrgent = Boolean(a?.urgent)
      const bUrgent = Boolean(b?.urgent)
      if (aUrgent && !bUrgent) return -1
      if (!aUrgent && bUrgent) return 1

      const aStatusRank = String(a?.status ?? '') === 'Pendiente' ? 0 : 1
      const bStatusRank = String(b?.status ?? '') === 'Pendiente' ? 0 : 1
      if (aStatusRank !== bStatusRank) return aStatusRank - bStatusRank

      return parseDeliveryTimestamp(a?.deliveryDate) - parseDeliveryTimestamp(b?.deliveryDate)
    })

    sectionBuckets.ready.sort((a, b) => {
      const aUrgent = Boolean(a?.urgent)
      const bUrgent = Boolean(b?.urgent)
      if (aUrgent && !bUrgent) return -1
      if (!aUrgent && bUrgent) return 1
      return parseDeliveryTimestamp(a?.deliveryDate) - parseDeliveryTimestamp(b?.deliveryDate)
    })

    sectionBuckets.collections.sort((a, b) => {
      const aDebt = Number(orderFinancialMap[String(a?.id ?? '')]?.remainingDebt || 0)
      const bDebt = Number(orderFinancialMap[String(b?.id ?? '')]?.remainingDebt || 0)
      if (aDebt !== bDebt) return bDebt - aDebt
      return parseDeliveryTimestamp(a?.deliveryDate) - parseDeliveryTimestamp(b?.deliveryDate)
    })

    sectionBuckets.cancelled.sort(
      (a, b) => parseCreatedTimestamp(b?.createdAt) - parseCreatedTimestamp(a?.createdAt),
    )

    return Object.entries(orderSectionMeta).map(([key, meta]) => {
      const sectionOrders = sectionBuckets[key] ?? []
      const totalDebt = sectionOrders.reduce((acc, order) => {
        const orderId = String(order?.id ?? '')
        return acc + Number(orderFinancialMap[orderId]?.remainingDebt || 0)
      }, 0)

      return {
        key,
        ...meta,
        orders: sectionOrders,
        count: sectionOrders.length,
        totalDebt,
      }
    })
  }, [orderFinancialMap, safeOrders])

  const operationalSections = useMemo(
    () => groupedSections.filter((section) => section.key !== 'collections'),
    [groupedSections],
  )

  const collectionClients = useMemo(() => {
    const clientsMap = safeOrders.reduce((acc, order) => {
      if (order?.isSample) return acc

      const orderId = String(order?.id ?? '')
      const status = String(order?.status ?? '')
      const summary = orderFinancialMap[orderId] ?? getOrderFinancialSummary(order)
      const remainingDebt = Number(summary?.remainingDebt || 0)
      if (status !== 'Entregado' || remainingDebt <= 0) return acc

      const clientKey = getClientDebtKey(order)
      if (!clientKey) return acc

      const orderClientId = String(order?.clientId ?? '')
      const fallbackName = String(order?.clientName ?? order?.client ?? 'Sin cliente').trim()
      const resolvedClient =
        clientsById[orderClientId] ??
        clientsByName[fallbackName.toLowerCase()] ??
        null
      const clientName = String(resolvedClient?.name ?? fallbackName ?? 'Sin cliente')

      const deliveryDays = getDaysSinceDelivery(order?.deliveryDate)
      const daysSinceDebt = Number.isInteger(deliveryDays)
        ? deliveryDays
        : getDaysSinceTimestamp(order?.createdAt)

      const row = {
        orderId,
        displayOrderId: formatOrderId(orderId),
        remainingDebt,
        daysSinceDebt,
      }

      if (!acc[clientKey]) {
        acc[clientKey] = {
          key: clientKey,
          clientId: orderClientId,
          clientName,
          clientEntity: resolvedClient,
          creditBalance: Number(resolvedClient?.creditBalance || 0),
          totalDebt: 0,
          maxDays: 0,
          rows: [],
        }
      }

      acc[clientKey].totalDebt += remainingDebt
      acc[clientKey].maxDays = Math.max(acc[clientKey].maxDays, daysSinceDebt)
      acc[clientKey].rows.push(row)

      return acc
    }, {})

    return Object.values(clientsMap)
      .map((client) => ({
        ...client,
        rows: client.rows.toSorted((a, b) => {
          if (b.daysSinceDebt !== a.daysSinceDebt) return b.daysSinceDebt - a.daysSinceDebt
          return b.remainingDebt - a.remainingDebt
        }),
      }))
      .toSorted((a, b) => {
        if (b.maxDays !== a.maxDays) return b.maxDays - a.maxDays
        return b.totalDebt - a.totalDebt
      })
  }, [clientsById, clientsByName, orderFinancialMap, safeOrders])

  const collectionsSummary = useMemo(() => {
    const totalDebt = collectionClients.reduce((acc, client) => acc + Number(client.totalDebt || 0), 0)
    const clientsWithOldDebt = collectionClients.filter((client) => Number(client.maxDays || 0) > 10).length

    return {
      clientsCount: collectionClients.length,
      totalDebt,
      clientsWithOldDebt,
    }
  }, [collectionClients])

  useEffect(() => {
    if (!initialExpandedOrderId) return

    const expandedOrder = safeOrders.find(
      (order) => String(order?.id ?? '') === String(initialExpandedOrderId),
    )
    if (!expandedOrder) return

    const remainingDebt = Number(
      orderFinancialMap[String(expandedOrder?.id ?? '')]?.remainingDebt || 0,
    )
    const sectionKey = getOperationalSectionKey(expandedOrder, remainingDebt)

    setCollapsedSections((prev) => ({
      ...prev,
      [sectionKey]: false,
    }))
  }, [initialExpandedOrderId, orderFinancialMap, safeOrders])

  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      const rawValue = window.localStorage.getItem(COLLAPSED_SECTIONS_STORAGE_KEY)
      if (!rawValue) return

      const parsed = JSON.parse(rawValue)
      if (!parsed || typeof parsed !== 'object') return

      setCollapsedSections((prev) => ({
        production: Boolean(parsed.production ?? prev.production),
        ready: Boolean(parsed.ready ?? prev.ready),
        collections: Boolean(parsed.collections ?? prev.collections),
        delivered: Boolean(parsed.delivered ?? prev.delivered),
        cancelled: Boolean(parsed.cancelled ?? prev.cancelled),
      }))
    } catch {
      // Ignore malformed local storage content.
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      window.localStorage.setItem(COLLAPSED_SECTIONS_STORAGE_KEY, JSON.stringify(collapsedSections))
    } catch {
      // Ignore storage quota issues.
    }
  }, [collapsedSections])

  useEffect(() => {
    return () => {
      if (collectingFeedbackTimeoutRef.current) {
        clearTimeout(collectingFeedbackTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (hasAutoScrolledCriticalRef.current) return

    const firstCriticalClient = collectionClients.find((client) => Number(client.maxDays || 0) > 10)
    if (!firstCriticalClient) return

    const cardNode = collectionCardRefs.current[firstCriticalClient.key]
    if (!cardNode || typeof cardNode.scrollIntoView !== 'function') return

    hasAutoScrolledCriticalRef.current = true
    cardNode.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [collectionClients])

  const toggleSection = (sectionKey) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [sectionKey]: !prev[sectionKey],
    }))
  }

  const toggleCollectionClient = (clientKey) => {
    setExpandedCollectionClients((prev) => ({
      ...prev,
      [clientKey]: !prev[clientKey],
    }))
  }

  const toggleOrder = (orderId) => {
    setExpandedOrderId((currentId) => (currentId === orderId ? null : orderId))
  }

  const openClientObservationsModal = (order, client) => {
    const orderId = String(order?.id ?? '').trim()
    const fallbackName = String(order?.clientName ?? order?.client ?? '').trim()
    let targetClient = client && typeof client === 'object' ? client : null

    if (!targetClient?.id) {
      const knownByName = clientsByName[fallbackName.toLowerCase()] ?? null
      if (knownByName?.id) {
        targetClient = knownByName
      }
    }

    if (!targetClient?.id && fallbackName) {
      const createdOrUpdated = onSaveClient?.({ name: fallbackName })
      if (createdOrUpdated?.id) {
        targetClient = createdOrUpdated
        onUpdateOrderClient?.(orderId, {
          clientId: String(createdOrUpdated.id),
          clientName: String(createdOrUpdated.name ?? fallbackName),
        })
      }
    }

    if (!targetClient?.id) {
      void appAlert('No se pudo asociar un cliente para gestionar observaciones.')
      return
    }

    setClientObservationsModal({
      isOpen: true,
      client: targetClient,
      orderId,
      observations: getClientObservations(targetClient),
      draft: '',
    })
  }

  const closeClientObservationsModal = () => {
    setClientObservationsModal({
      isOpen: false,
      client: null,
      orderId: '',
      observations: [],
      draft: '',
    })
  }

  const saveClientObservations = (nextObservations) => {
    const targetClient = clientObservationsModal.client
    if (!targetClient?.id) return

    onSaveClient?.({
      ...targetClient,
      observations: nextObservations,
    })

    setClientObservationsModal((prev) => ({
      ...prev,
      observations: nextObservations,
      client: {
        ...targetClient,
        observations: nextObservations,
      },
      draft: '',
    }))
  }

  const addClientObservation = () => {
    const text = String(clientObservationsModal.draft ?? '').trim()
    if (!text) return

    const newEntry = normalizeObservationEntry({ text }, clientObservationsModal.observations.length)
    if (!newEntry) return

    saveClientObservations([newEntry, ...clientObservationsModal.observations])
  }

  const removeClientObservation = (observationId) => {
    const next = clientObservationsModal.observations.filter(
      (entry) => String(entry?.id ?? '') !== String(observationId ?? ''),
    )
    saveClientObservations(next)
  }

  const openDeliveryConfirmation = (orderId, order) => {
    setDeliveryConfirmModal({
      isOpen: true,
      orderId,
      initialDeliveryType: String(order?.deliveryType ?? order?.deliveredVia ?? '').trim(),
      initialDeliveredBy: String(order?.deliveredBy ?? '').trim(),
      initialDeliveryNote: String(order?.deliveryNote ?? order?.deliveryDetails ?? '').trim(),
    })
  }

  const handleCancelDeliveryConfirmation = () => {
    setDeliveryConfirmModal({
      isOpen: false,
      orderId: '',
      initialDeliveryType: '',
      initialDeliveredBy: '',
      initialDeliveryNote: '',
    })
  }

  const handleConfirmDeliveredStatus = (deliveryData) => {
    const targetOrderId = String(deliveryConfirmModal.orderId ?? '').trim()
    if (!targetOrderId) return

    const safeDeliveryData = deliveryData && typeof deliveryData === 'object' ? deliveryData : {}

    onUpdateOrderDelivery?.(targetOrderId, {
      deliveryType: String(safeDeliveryData.deliveryType ?? '').trim(),
      deliveredVia: String(safeDeliveryData.deliveryType ?? '').trim(),
      deliveredBy: String(safeDeliveryData.deliveredBy ?? '').trim(),
      deliveryNote: String(safeDeliveryData.deliveryNote ?? '').trim(),
      deliveryDetails: String(safeDeliveryData.deliveryNote ?? '').trim(),
    })
    onUpdateOrderStatus?.(targetOrderId, 'Entregado')
    handleCancelDeliveryConfirmation()

    void appConfirm('Entrega confirmada.\n¿Querés registrar un pago ahora?').then((shouldRegisterPaymentNow) => {
      if (shouldRegisterPaymentNow) openPaymentQuickModalForOrder(targetOrderId)
    })
  }

  const handleDeliveryOverlayClick = (event) => {
    if (event.target !== event.currentTarget) return
    handleCancelDeliveryConfirmation()
  }

  const openPaymentQuickModalForOrder = (orderId) => {
    setPaymentQuickModal({
      isOpen: true,
      orderId,
      mode: 'order',
      clientKey: '',
    })

    setPaymentDrafts((prevDrafts) => {
      if (prevDrafts[orderId]) return prevDrafts
      return {
        ...prevDrafts,
        [orderId]: {
          amount: '',
          method: paymentMethods[0],
        },
      }
    })
  }

  const openPaymentQuickModalForClient = (client) => {
    const oldestOrderId = String(client?.rows?.[0]?.orderId ?? '').trim()
    if (!oldestOrderId) return

    setPaymentQuickModal({
      isOpen: true,
      orderId: oldestOrderId,
      mode: 'client',
      clientKey: String(client?.key ?? ''),
    })

    setPaymentDrafts((prevDrafts) => {
      if (prevDrafts[oldestOrderId]) return prevDrafts
      return {
        ...prevDrafts,
        [oldestOrderId]: {
          amount: '',
          method: paymentMethods[0],
        },
      }
    })
  }

  const handleClosePaymentQuickModal = () => {
    setPaymentQuickModal({
      isOpen: false,
      orderId: '',
      mode: 'order',
      clientKey: '',
    })
  }

  const paymentQuickClient = useMemo(
    () =>
      paymentQuickModal.mode === 'client'
        ? collectionClients.find((client) => client.key === paymentQuickModal.clientKey) ?? null
        : null,
    [collectionClients, paymentQuickModal.clientKey, paymentQuickModal.mode],
  )

  const paymentQuickOrder = useMemo(
    () => safeOrders.find((order) => String(order?.id ?? '') === String(paymentQuickModal.orderId ?? '')) ?? null,
    [paymentQuickModal.orderId, safeOrders],
  )

  const paymentQuickSummary = useMemo(() => {
    if (paymentQuickModal.mode === 'client') {
      if (!paymentQuickClient) return null

      const totalPaid = paymentQuickClient.rows.reduce((acc, row) => {
        return acc + Number(orderFinancialMap[String(row.orderId)]?.totalPaid || 0)
      }, 0)

      return {
        totalPaid,
        remainingDebt: Number(paymentQuickClient.totalDebt || 0),
      }
    }

    return paymentQuickOrder ? getOrderFinancialSummary(paymentQuickOrder) : null
  }, [orderFinancialMap, paymentQuickClient, paymentQuickModal.mode, paymentQuickOrder])

  const paymentQuickTitle =
    paymentQuickModal.mode === 'client' && paymentQuickClient
      ? `Cobrar saldo total de ${paymentQuickClient.clientName}`
      : ''

  const paymentQuickConfirmLabel = paymentQuickModal.mode === 'client'
    ? 'Agregar pago y distribuir'
    : 'Agregar pago'

  const applyAutomaticClientCollection = ({
    client,
    paymentAmount,
    method,
    note,
    closeModal = false,
  }) => {
    if (!client) return

    setCollectingClientKey(client.key)

    if (collectingFeedbackTimeoutRef.current) {
      clearTimeout(collectingFeedbackTimeoutRef.current)
    }

    collectingFeedbackTimeoutRef.current = setTimeout(() => {
      const knownClient = client.clientEntity ?? null
      const currentCredit = Math.max(Number(knownClient?.creditBalance || 0), 0)
      const safePaymentAmount = Math.max(Number(paymentAmount || 0), 0)
      const distributableAmount = safePaymentAmount + currentCredit
      if (distributableAmount <= 0) {
        setCollectingClientKey('')
        return
      }

      const allocationResult = onRegisterClientPayment?.({
        clientId: client.clientId,
        clientName: client.clientName,
        amount: distributableAmount,
        method,
        note,
      })

      if (allocationResult) {
        const nextCredit = Math.max(Number(allocationResult.overpayCredit || 0), 0)

        onSaveClient?.({
          id: String(knownClient?.id ?? client.clientId ?? '').trim() || undefined,
          name: String(knownClient?.name ?? client.clientName ?? 'Sin cliente').trim(),
          phone: String(knownClient?.phone ?? ''),
          email: String(knownClient?.email ?? ''),
          address: String(knownClient?.address ?? ''),
          notes: String(knownClient?.notes ?? ''),
          observations: Array.isArray(knownClient?.observations) ? knownClient.observations : [],
          creditBalance: nextCredit,
          paymentAllocations: [
            {
              id: String(allocationResult.allocationBatchId ?? `CPAY-${Date.now()}`),
              amount: Number(allocationResult.paymentAmount || 0),
              method: String(allocationResult.method ?? method),
              createdAt: String(allocationResult.createdAt ?? new Date().toISOString()),
              note: String(allocationResult.note ?? ''),
              overpayCredit: Number(allocationResult.overpayCredit || 0),
              allocations: Array.isArray(allocationResult.allocations) ? allocationResult.allocations : [],
            },
            ...(Array.isArray(knownClient?.paymentAllocations) ? knownClient.paymentAllocations : []),
          ],
        })

        const lines = [
          'Pago aplicado:',
          ...(Array.isArray(allocationResult.allocations)
            ? allocationResult.allocations.map((allocation) => {
                const orderId = String(allocation?.orderId ?? '')
                const amount = Number(allocation?.amount || 0)
                const originalDebt = Number(
                  client.rows.find((row) => String(row.orderId) === orderId)?.remainingDebt || 0,
                )
                const status = amount >= originalDebt ? 'completo' : 'parcial'
                return `- ${formatOrderId(orderId)} -> ${formatCurrency(amount)} (${status})`
              })
            : []),
          `Total aplicado: ${formatCurrency(Number(allocationResult.totalApplied || 0))}`,
        ]

        if (safePaymentAmount > 0) {
          lines.push(`Pago ingresado: ${formatCurrency(safePaymentAmount)}`)
        }

        if (currentCredit > 0) {
          lines.push(`Saldo a favor aplicado: ${formatCurrency(currentCredit)}`)
        }

        if (Number(allocationResult.overpayCredit || 0) > 0) {
          lines.push(`Saldo a favor generado: ${formatCurrency(Number(allocationResult.overpayCredit || 0))}`)
        }

        void appAlert(lines.join('\n'))
      }

      if (closeModal) {
        handleClosePaymentQuickModal()
      }

      collectingFeedbackTimeoutRef.current = setTimeout(() => {
        setCollectingClientKey('')
      }, 850)
    }, 180)
  }

  const handleQuickPaymentConfirm = ({ amount, method }) => {
    if (!paymentQuickSummary) return

    const safeAmount = Number(amount)
    const remainingDebt = Number(paymentQuickSummary.remainingDebt || 0)

    if (Number.isNaN(safeAmount) || safeAmount <= 0) return
    if (paymentQuickModal.mode !== 'client' && safeAmount > remainingDebt) return

    if (paymentQuickModal.mode === 'client') {
      if (!paymentQuickClient) return

      applyAutomaticClientCollection({
        client: paymentQuickClient,
        paymentAmount: safeAmount,
        method,
        note:
          Number(paymentQuickClient.clientEntity?.creditBalance || 0) > 0
            ? 'Pago automático imputado por deuda total de cliente (incluye saldo a favor previo).'
            : 'Pago automático imputado por deuda total de cliente.',
        closeModal: true,
      })

      return
    }

    const targetOrderId = String(paymentQuickModal.orderId ?? '').trim()
    if (!targetOrderId || !paymentQuickSummary) return

    setCollectingOrderId(targetOrderId)

    if (collectingFeedbackTimeoutRef.current) {
      clearTimeout(collectingFeedbackTimeoutRef.current)
    }

    collectingFeedbackTimeoutRef.current = setTimeout(() => {
      onRegisterPayment?.(targetOrderId, {
        amount: safeAmount,
        method,
      })

      setPaymentDrafts((prevDrafts) => ({
        ...prevDrafts,
        [targetOrderId]: {
          amount: '',
          method: method || paymentMethods[0],
        },
      }))

      handleClosePaymentQuickModal()

      collectingFeedbackTimeoutRef.current = setTimeout(() => {
        setCollectingOrderId('')
      }, 850)
    }, 180)
  }

  const deliveryConfirmTarget = useMemo(
    () => safeOrders.find((order) => String(order?.id ?? '') === String(deliveryConfirmModal.orderId ?? '')) ?? null,
    [deliveryConfirmModal.orderId, safeOrders],
  )

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
      <div className="card-head orders-card-head">
        <div>
          <h3>Flujo operativo de pedidos</h3>
          <p className="orders-card-helper">
            Archivados fuera del tablero: <strong>{archivedCount}</strong>
          </p>
        </div>
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

      <div className="clients-toolbar">
        <input
          type="text"
          placeholder="Buscar por cliente, ID o producto..."
          value={searchQuery ?? ''}
          onChange={(event) => onSearchChange?.(event.target.value)}
        />
      </div>

      <div className="table-wrap">
        <table className="orders-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Cliente</th>
              <th>Entrega</th>
              <th>Estado</th>
              <th>Total / acción</th>
            </tr>
          </thead>
          <tbody>
            {operationalSections.map((section) => {
              const isCollapsed = Boolean(collapsedSections[section.key])

              return (
                <Fragment key={section.key}>
                  <tr className={`orders-section-row ${section.accentClassName}`}>
                    <td colSpan={5}>
                      <button
                        type="button"
                        className="orders-section-toggle"
                        onClick={() => toggleSection(section.key)}
                        aria-expanded={!isCollapsed}
                      >
                        <span className="orders-section-toggle-title">
                          <span className="orders-section-chevron">{isCollapsed ? '▸' : '▾'}</span>
                          <span>{section.title}</span>
                          <span className="orders-section-count">{section.count}</span>
                        </span>
                        <span className="orders-section-description">{section.description}</span>
                      </button>
                    </td>
                  </tr>

                  {!isCollapsed && section.orders.length === 0 && (
                    <tr className="orders-section-empty-row">
                      <td colSpan={5} className="empty-detail">
                        {section.emptyText}
                      </td>
                    </tr>
                  )}

                  {!isCollapsed && section.orders.map((order, index) => {
                    const orderId = String(order.id ?? `pedido-${index}`)
              const displayOrderId = formatOrderId(orderId)
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
              const deliveryAgeDays = getDaysSinceDelivery(order?.deliveryDate)
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
              const completedItems = items.filter((item) => Boolean(item?.itemCompleted)).length
              const itemsProgressLabel = `${completedItems}/${items.length} completados`
              const hasItems = items.length > 0
              const allItemsCompleted = hasItems && items.every((item) => Boolean(item?.itemCompleted))
              const selectedClientId = String(order?.clientId ?? '')
              const clientDebtKey = getClientDebtKey(order)
              const hasClientDebt = clientDebtKey ? clientsWithDebt.has(clientDebtKey) : false
              const resolvedClientByName = clientsByName[
                String(order?.clientName ?? order?.client ?? '').trim().toLowerCase()
              ]
              const resolvedClient = selectedClientId
                ? clientsById[selectedClientId] ?? resolvedClientByName ?? null
                : resolvedClientByName ?? null
              const clientObservations = getClientObservations(resolvedClient)
              const hasClientObservations = clientObservations.length > 0
              const hasCriticalClientObservations = clientObservations.some((entry) => Boolean(entry?.isCritical))
              const canShowClientObservations = String(orderClient).trim().length > 0
              const hasLinkedClient = Boolean(resolvedClient?.id)
              const selectedClientIdForSelect =
                selectedClientId || String(resolvedClientByName?.id ?? '')
              const sectionBadgeLabel = section.badge
              const rowAccentClassName = section.accentClassName

              const isUrgent = Boolean(order?.urgent)
              const isExpanded = expandedOrderId === orderId
              const paymentDraft = getDraftForOrder(orderId)
              const deliveryDraft = getDeliveryDraftForOrder(order)
              const deliverySaveUi = getDeliverySaveUiForOrder(orderId)
              const itemsDraft = itemsDrafts[orderId] ?? null
              const isEditingItems = Array.isArray(itemsDraft)
              const draftReservedByProductId = (Array.isArray(itemsDraft) ? itemsDraft : []).reduce((acc, item) => {
                const productId = String(item?.productId ?? '').trim()
                if (!productId) return acc
                if (item?.isClientMaterial) return acc

                acc[productId] = (acc[productId] ?? 0) + toPositiveNumber(item?.quantity)
                return acc
              }, {})
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
              const quickActionLabel =
                order.isSample && orderStatus === 'Pendiente'
                  ? 'Marcar lista'
                  : orderStatus === 'Pendiente'
                    ? 'Iniciar producción'
                    : orderStatus === 'En Proceso'
                    ? 'Marcar listo'
                    : orderStatus === 'Listo'
                      ? 'Registrar entrega'
                      : isDeliveredWithDebt
                        ? 'Cobrar saldo'
                        : ''

              const handleQuickAction = (event) => {
                event.stopPropagation()

                if (order.isSample && orderStatus === 'Pendiente') {
                  onUpdateOrderStatus?.(orderId, 'Lista')
                  return
                }

                if (orderStatus === 'Pendiente') {
                  onUpdateOrderStatus?.(orderId, 'En Proceso')
                  return
                }

                if (orderStatus === 'En Proceso') {
                  if (!allItemsCompleted) {
                    void appConfirm('Todavía hay ítems sin completar. ¿Querés marcar igual este pedido como LISTO?').then((shouldContinue) => {
                      if (shouldContinue) onUpdateOrderStatus?.(orderId, 'Listo')
                    })
                    return
                  }

                  onUpdateOrderStatus?.(orderId, 'Listo')
                  return
                }

                if (orderStatus === 'Listo') {
                  openDeliveryConfirmation(orderId, order)
                  return
                }

                if (isDeliveredWithDebt) {
                  openPaymentQuickModalForOrder(orderId)
                }
              }

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
                  void appAlert('Este cliente no tiene número de WhatsApp registrado.')
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
                  void appAlert('Agregá al menos un producto válido para guardar el pedido.')
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

                openDeliveryConfirmation(orderId, order)
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

                void appConfirm('¿Desea eliminar definitivamente este pedido cancelado?').then((confirmed) => {
                  if (confirmed) onDeleteCancelledOrder?.(orderId)
                })
              }

              const handleToggleUrgent = (event) => {
                event.stopPropagation()
                onUpdateOrderUrgency?.(orderId, !isUrgent)
              }

              const handleToggleItemCompleted = (event, itemIndex, nextCompleted) => {
                event.stopPropagation()
                onUpdateOrderItemCompletion?.(orderId, itemIndex, nextCompleted)
              }

              return (
                <Fragment key={orderId}>
                  <tr
                    className={`order-main-row ${rowAccentClassName} ${order.isSample ? 'order-main-row-sample' : ''} ${isExpanded ? 'order-main-row-expanded' : ''}`}
                    onClick={() => toggleOrder(orderId)}
                  >
                    <td>
                      <div className="order-id-cell">
                        <div className="order-id-stack">
                          <span>{displayOrderId}</span>
                          <span className={`order-flow-badge ${rowAccentClassName}`}>{sectionBadgeLabel}</span>
                        </div>
                        <button
                          type="button"
                          className={`urgent-toggle-btn ${isUrgent ? 'urgent-toggle-btn-active' : ''}`}
                          onClick={handleToggleUrgent}
                          title={isUrgent ? 'Quitar urgencia' : 'Marcar urgente'}
                          aria-label={isUrgent ? 'Quitar urgencia del pedido' : 'Marcar pedido urgente'}
                        >
                          🔥
                        </button>
                      </div>
                    </td>
                    <td>
                      <div className="order-client-cell">
                        {isUrgent && <span className="urgent-badge">🔥 URGENTE</span>}
                        <span>{orderClient}</span>
                        {canShowClientObservations && (
                          <button
                            type="button"
                            className="client-observation-info-btn"
                            onClick={(event) => {
                              event.stopPropagation()
                              openClientObservationsModal(order, resolvedClient)
                            }}
                            title={!hasLinkedClient
                              ? 'Asociá un cliente para guardar observaciones'
                              : hasClientObservations
                                ? 'Ver observaciones del cliente'
                                : 'Cargar observaciones del cliente'}
                            aria-label="Ver observaciones del cliente"
                          >
                            ℹ
                          </button>
                        )}
                        {hasCriticalClientObservations && (
                          <span className="client-special-badge">⚠ Cliente especial</span>
                        )}
                        {hasClientDebt && <span className="client-debt-badge">⚠ Cliente con deuda</span>}
                      </div>
                    </td>
                    <td>{formatDate(order.deliveryDate)}</td>
                    <td>
                      <div className="order-status-cell">
                        {order.isSample && <span className="status-badge status-muestra">MUESTRA</span>}
                        {allItemsCompleted && !order.isSample && (
                          <span className="status-badge status-completed">✔ Completado</span>
                        )}
                        <span className={`status-badge ${statusBadgeClass}`}>
                          {`${getOrderStatusIcon(orderStatus)} ${statusLabel}`}
                        </span>
                        {hasItems && <span className="order-items-progress-badge">{itemsProgressLabel}</span>}
                        {isDeliveredWithDebt && Number.isInteger(deliveryAgeDays) && (
                          <span className="order-collection-age-badge">
                            ⏳ Hace {deliveryAgeDays} {deliveryAgeDays === 1 ? 'día' : 'días'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="order-total-cell">
                        <strong>{order.isSample ? 'Muestra' : formatCurrency(finalTotal)}</strong>
                        {quickActionLabel && (
                          <button
                            type="button"
                            className={`order-quick-action-btn ${rowAccentClassName}`}
                            onClick={handleQuickAction}
                          >
                            {quickActionLabel}
                          </button>
                        )}
                        {isDeliveredWithDebt && (
                          <button
                            type="button"
                            className="order-reminder-btn"
                            onClick={(event) => {
                              event.stopPropagation()
                              sendPaymentReminder(order, remainingDebt)
                            }}
                          >
                            📩 Recordar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {isExpanded && (() => {
                    if (!order || !order.items || !Array.isArray(order.items)) {
                      return null
                    }

                    try {
                      return (
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
                                  const itemCompleted = Boolean(item?.itemCompleted ?? false)
                                  const canTrackProgress = orderStatus === 'En Proceso'
                                  return (
                                    <tr key={`${orderId}-item-${index}`}>
                                      <td>
                                        <div className="order-item-product-cell">
                                          {canTrackProgress && (
                                            <label className="order-item-progress-check">
                                              <input
                                                type="checkbox"
                                                checked={itemCompleted}
                                                onChange={(event) =>
                                                  handleToggleItemCompleted(event, index, event.target.checked)
                                                }
                                                aria-label={`Marcar progreso de ${item.productName || item.product || 'ítem'}`}
                                              />
                                              <span>{itemCompleted ? 'Completado' : 'Pendiente'}</span>
                                            </label>
                                          )}
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

                          {!order.isSample && orderStatus !== 'Entregado' && (
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
                                      const draftProductId = String(item?.productId ?? '').trim()
                                      const currentAvailable = Number(
                                        safeStockByProductId[draftProductId]?.stockDisponible
                                          ?? productsById[draftProductId]?.stockTotal
                                          ?? 0,
                                      )
                                      const lineQuantity = toPositiveNumber(item?.quantity)
                                      const reservedInDraft = draftReservedByProductId[draftProductId] ?? 0
                                      const availableForLine = currentAvailable + lineQuantity - reservedInDraft
                                      const exceedsStock =
                                        draftProductId && !item?.isClientMaterial && lineQuantity > availableForLine
                                      const safeAvailable = Math.max(availableForLine, 0)
                                      const shortageUnits = Math.max(lineQuantity - safeAvailable, 0)
                                      return (
                                        <div key={`${orderId}-draft-item-${itemIndex}`} className="order-items-edit-row">
                                          <select
                                            value={item.productId}
                                            onChange={(event) =>
                                              handleItemsDraftChange(itemIndex, 'productId', event.target.value)
                                            }
                                          >
                                            <option value="">Seleccionar producto</option>
                                            {sortedProducts.map((product) => (
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
                                          {exceedsStock && (
                                            <p className="payment-error">
                                              No hay stock suficiente para este pedido.<br />
                                              Stock disponible: {safeAvailable}<br />
                                              Pedido solicitado: {lineQuantity}<br />
                                              Faltante estimado: {shortageUnits}
                                            </p>
                                          )}
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
                                    {sortedClients.map((client) => (
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
                                  void appAlert('No se pudo generar el PDF del pedido.')
                                })
                              }}
                            >
                              🖨 Orden de trabajo
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
                      )
                    } catch (err) {
                      console.error('Order render error', err)
                      return null
                    }
                  })()}
                </Fragment>
              )})}
            </Fragment>
          )
        })}
          </tbody>
        </table>
      </div>

      <section className="collections-compact-zone" aria-label="Resumen de cobranzas">
        <div className="collections-compact-head">
          <h4>
            💰 Por cobrar ({collectionsSummary.clientsCount} clientes · {formatCurrency(collectionsSummary.totalDebt)})
          </h4>
          {collectionsSummary.clientsWithOldDebt > 0 && (
            <p className="collections-compact-alert">
              ⚠ Tenés {collectionsSummary.clientsWithOldDebt} cliente(s) con deuda mayor a 10 días.
            </p>
          )}
        </div>

        {collectionClients.length === 0 ? (
          <div className="collections-compact-empty">
            No hay deudas pendientes. Todo lo entregado está al día.
          </div>
        ) : (
          <div className="collections-compact-grid">
            {collectionClients.map((client) => {
              const isExpanded = Boolean(expandedCollectionClients[client.key])
              const oldestOrder = client.rows[0] ?? null
              const clientCredit = Math.max(Number(client.creditBalance || 0), 0)
              const hasCollectingFeedback = client.rows.some((row) => row.orderId === collectingOrderId)
              const cardAgingClassName = getDebtAgingClassName(client.maxDays)
              const criticalTooltip = client.maxDays > 10 ? 'Deuda mayor a 10 días' : undefined

              const handleQuickCollect = (event) => {
                event.stopPropagation()
                openPaymentQuickModalForClient(client)
              }

              const handleUseCreditOnly = (event) => {
                event.stopPropagation()
                if (clientCredit <= 0) return

                applyAutomaticClientCollection({
                  client,
                  paymentAmount: 0,
                  method: 'Transferencia',
                  note: 'Aplicación directa de saldo a favor sin ingreso de pago nuevo.',
                  closeModal: false,
                })
              }

              const cardCollecting = collectingClientKey === client.key
              const hasCollectingCardFeedback = hasCollectingFeedback || cardCollecting

              return (
                <article
                  key={client.key}
                  ref={(node) => {
                    if (node) {
                      collectionCardRefs.current[client.key] = node
                    } else {
                      delete collectionCardRefs.current[client.key]
                    }
                  }}
                  className={`collections-client-card ${cardAgingClassName} ${hasCollectingCardFeedback ? 'collections-client-card-collecting' : ''}`}
                  role="button"
                  tabIndex={0}
                  title={criticalTooltip}
                  onClick={() => toggleCollectionClient(client.key)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      toggleCollectionClient(client.key)
                    }
                  }}
                  aria-expanded={isExpanded}
                >
                  <div className="collections-client-head">
                    <div>
                      <h5>{client.clientName}</h5>
                      <p>
                        {client.rows.length} pedido(s) · más viejo hace {client.maxDays} {client.maxDays === 1 ? 'día' : 'días'}
                      </p>
                      {oldestOrder && (
                        <p className="collections-client-oldest-hint">
                          Distribución automática: se aplica de {oldestOrder.displayOrderId} en adelante.
                        </p>
                      )}
                    </div>
                    <div className="collections-client-actions">
                      <strong>{formatCurrency(client.totalDebt)}</strong>
                      {clientCredit > 0 && (
                        <span className="client-credit-badge">Saldo a favor {formatCurrency(clientCredit)}</span>
                      )}
                      <button
                        type="button"
                        className="quick-fill-btn"
                        disabled={cardCollecting || clientCredit <= 0}
                        aria-busy={cardCollecting}
                        onClick={handleUseCreditOnly}
                      >
                        Usar saldo a favor
                      </button>
                      <button
                        type="button"
                        className="secondary-btn"
                        disabled={cardCollecting}
                        aria-busy={cardCollecting}
                        onClick={handleQuickCollect}
                      >
                        {cardCollecting ? 'Procesando...' : 'Cobrar deuda total'}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="collections-client-orders">
                      {client.rows.map((row) => (
                        <div key={row.orderId} className="collections-client-order-row">
                          <span>{row.displayOrderId}</span>
                          <span>{formatCurrency(row.remainingDebt)}</span>
                          <span>
                            {row.daysSinceDebt} {row.daysSinceDebt === 1 ? 'día' : 'días'}
                          </span>
                          <button
                            type="button"
                            className="quick-fill-btn"
                            disabled={collectingOrderId === row.orderId}
                            aria-busy={collectingOrderId === row.orderId}
                            onClick={(event) => {
                              event.stopPropagation()
                              openPaymentQuickModalForOrder(row.orderId)
                            }}
                          >
                            {collectingOrderId === row.orderId ? 'Procesando...' : 'Cobrar'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>

      {deliveryConfirmModal.isOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar entrega del pedido"
          onClick={handleDeliveryOverlayClick}
        >
          <div
            className="modal-card confirm-delivery-modal-shell"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') handleCancelDeliveryConfirmation()
            }}
          >
            <h4 className="confirm-delivery-modal-title">
              Confirmar entrega {deliveryConfirmTarget ? `de ${formatOrderId(String(deliveryConfirmTarget.id ?? ''))}` : ''}
            </h4>
            <ConfirmDeliveryModal
              initialDeliveryType={deliveryConfirmModal.initialDeliveryType}
              initialDeliveredBy={deliveryConfirmModal.initialDeliveredBy}
              initialDeliveryNote={deliveryConfirmModal.initialDeliveryNote}
              showTitle={false}
              onConfirm={handleConfirmDeliveredStatus}
              onCancel={handleCancelDeliveryConfirmation}
            />
          </div>
        </div>,
        document.body,
      )}

      <QuickPaymentModal
        key={`${paymentQuickModal.mode}-${paymentQuickModal.clientKey}-${paymentQuickModal.orderId}-${paymentQuickModal.isOpen ? 'open' : 'closed'}`}
        isOpen={paymentQuickModal.isOpen}
        order={paymentQuickOrder}
        summary={paymentQuickSummary}
        title={paymentQuickTitle}
        confirmLabel={paymentQuickConfirmLabel}
        showReminder={paymentQuickModal.mode !== 'client'}
        allowOverpay={paymentQuickModal.mode === 'client'}
        clientName={paymentQuickClient?.clientName}
        onClose={handleClosePaymentQuickModal}
        onConfirm={handleQuickPaymentConfirm}
        onSendReminder={sendPaymentReminder}
        formatCurrency={formatCurrency}
      />

      {clientObservationsModal.isOpen && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Observaciones del cliente"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeClientObservationsModal()
          }}
        >
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <h4>
              Observaciones de cliente {clientObservationsModal.client?.name ? `· ${clientObservationsModal.client.name}` : ''}
            </h4>
            <p className="muted-label">
              Pedido {formatOrderId(String(clientObservationsModal.orderId ?? ''))}
            </p>

            <div className="client-observations-list">
              {clientObservationsModal.observations.length > 0 ? (
                clientObservationsModal.observations.map((entry) => (
                  <div key={entry.id} className={`client-observation-item ${entry.isCritical ? 'client-observation-item-critical' : ''}`}>
                    <div>
                      <p>{entry.text}</p>
                      <small>
                        {entry.createdAt ? formatDateTime(entry.createdAt) : 'Sin fecha'}
                        {entry.isCritical ? ' · Crítica' : ''}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="quick-fill-btn"
                      onClick={() => removeClientObservation(entry.id)}
                    >
                      Quitar
                    </button>
                  </div>
                ))
              ) : (
                <p className="empty-detail">Este cliente no tiene observaciones cargadas.</p>
              )}
            </div>

            <div className="payment-form" style={{ marginTop: 10 }}>
              <h4>Agregar observación rápida</h4>
              <textarea
                value={clientObservationsModal.draft}
                onChange={(event) =>
                  setClientObservationsModal((prev) => ({ ...prev, draft: event.target.value }))
                }
                placeholder="Ej: ⚠ revisar diseño SIEMPRE"
              />
              <p className="payment-helper">Tip: si incluye "⚠" se marcará como observación crítica.</p>
            </div>

            <div className="product-actions" style={{ marginTop: 12 }}>
              <button type="button" className="primary-btn" onClick={addClientObservation}>
                Guardar observación
              </button>
              <button type="button" className="secondary-btn" onClick={closeClientObservationsModal}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
      {dialogNode}
    </section>
  )
}

export default memo(OrdersList, createCustomCompare())
