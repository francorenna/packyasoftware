import { useEffect, useState } from 'react'

const QUOTES_STORAGE_KEY = 'packya_quotes'

const quoteStatuses = ['Pendiente', 'Aceptado', 'Rechazado', 'Vencido']
const deliveryTypes = ['Retiro en fábrica', 'Envío']
const TEN_DAYS_MS = 10 * 24 * 60 * 60 * 1000

const toDateKey = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const toDefaultValidUntil = (createdAt) => {
  const baseDate = new Date(createdAt)
  if (Number.isNaN(baseDate.getTime())) return ''
  const nextDate = new Date(baseDate.getTime() + TEN_DAYS_MS)
  return toDateKey(nextDate)
}

const resolveValidUntil = (validUntil, createdAt) => {
  if (typeof validUntil === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(validUntil)) return validUntil
  return toDefaultValidUntil(createdAt)
}

export const getQuoteEffectiveStatus = (quote, now = new Date()) => {
  const baseStatus = String(quote?.status ?? 'Pendiente')
  if (baseStatus !== 'Pendiente') return baseStatus

  const validUntil = String(quote?.validUntil ?? '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) return baseStatus

  const todayKey = toDateKey(now)
  if (!todayKey) return baseStatus

  return validUntil < todayKey ? 'Vencido' : baseStatus
}

const toPositiveNumber = (value) => {
  const parsed = Number(value)
  return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed
}

const normalizeQuoteItem = (item, index) => {
  if (!item || typeof item !== 'object') return null

  const description = String(item.description ?? '').trim()
  const quantity = Math.max(Math.floor(Number(item.quantity ?? 0)), 0)
  const unitPrice = toPositiveNumber(item.unitPrice)
  if (!description || quantity <= 0) return null

  return {
    id: String(item.id ?? `QITEM-${index + 1}`),
    sourceMode: String(item.sourceMode ?? (item.productId ? 'existing' : 'manual')),
    productId: String(item.productId ?? '').trim(),
    description,
    quantity,
    unitPrice,
    lineTotal: quantity * unitPrice,
  }
}

const normalizeQuote = (quote, index) => {
  if (!quote || typeof quote !== 'object') return null

  const items = Array.isArray(quote.items)
    ? quote.items
        .map((item, itemIndex) => normalizeQuoteItem(item, itemIndex))
        .filter(Boolean)
    : []

  const createdAt = String(quote.createdAt ?? new Date().toISOString())
  const status = quoteStatuses.includes(String(quote.status ?? ''))
    ? String(quote.status)
    : quoteStatuses[0]

  const deliveryType = deliveryTypes.includes(String(quote.deliveryType ?? ''))
    ? String(quote.deliveryType)
    : deliveryTypes[0]

  const subtotal = items.reduce(
    (acc, item) => acc + toPositiveNumber(item.quantity) * toPositiveNumber(item.unitPrice),
    0,
  )
  const shippingCost = deliveryType === 'Envío' ? toPositiveNumber(quote.shippingCost) : 0
  const validUntil = resolveValidUntil(quote.validUntil, createdAt)
  const clientId = String(quote.clientId ?? '').trim()
  const clientName = String(quote.clientName ?? 'Sin cliente').trim() || 'Sin cliente'
  const clientSource = (() => {
    const source = String(quote.clientSource ?? '').trim()
    if (source === 'existing' || source === 'manual' || source === 'none') return source
    if (clientId) return 'existing'
    return clientName !== 'Sin cliente' ? 'manual' : 'none'
  })()

  return {
    id: String(quote.id ?? `COT-${String(index + 1).padStart(3, '0')}`),
    clientId,
    clientName,
    clientSource,
    productionLeadTime: String(quote.productionLeadTime ?? '').trim(),
    deliveryType,
    shippingCost,
    validUntil,
    createdAt,
    status,
    items,
    subtotal,
    total: subtotal + shippingCost,
  }
}

const loadQuotes = () => {
  try {
    const raw = localStorage.getItem(QUOTES_STORAGE_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed
      .map((quote, index) => normalizeQuote(quote, index))
      .filter(Boolean)
  } catch {
    return []
  }
}

function useQuotesState() {
  const [quotes, setQuotes] = useState(() => loadQuotes())

  useEffect(() => {
    try {
      localStorage.setItem(QUOTES_STORAGE_KEY, JSON.stringify(quotes))
    } catch (error) {
      void error
    }
  }, [quotes])

  const createQuote = (quoteData) => {
    const safeQuoteData = quoteData && typeof quoteData === 'object' ? quoteData : {}

    const items = Array.isArray(safeQuoteData.items)
      ? safeQuoteData.items
          .map((item, index) => normalizeQuoteItem(item, index))
          .filter(Boolean)
      : []

    if (items.length === 0) return null

    const createdAt = String(safeQuoteData.createdAt ?? new Date().toISOString())
    const deliveryType = deliveryTypes.includes(String(safeQuoteData.deliveryType ?? ''))
      ? String(safeQuoteData.deliveryType)
      : deliveryTypes[0]

    const subtotal = items.reduce((acc, item) => acc + item.lineTotal, 0)
    const shippingCost = deliveryType === 'Envío' ? toPositiveNumber(safeQuoteData.shippingCost) : 0
    const clientId = String(safeQuoteData.clientId ?? '').trim()
    const clientName = String(safeQuoteData.clientName ?? 'Sin cliente').trim() || 'Sin cliente'
    const clientSource = (() => {
      const source = String(safeQuoteData.clientSource ?? '').trim()
      if (source === 'existing' || source === 'manual' || source === 'none') return source
      if (clientId) return 'existing'
      return clientName !== 'Sin cliente' ? 'manual' : 'none'
    })()

    const nextQuote = {
      id: `COT-${Date.now()}`,
      clientId,
      clientName,
      clientSource,
      productionLeadTime: String(safeQuoteData.productionLeadTime ?? '').trim(),
      deliveryType,
      shippingCost,
      validUntil: resolveValidUntil(safeQuoteData.validUntil, createdAt),
      createdAt,
      status: quoteStatuses[0],
      items,
      subtotal,
      total: subtotal + shippingCost,
    }

    setQuotes((prevQuotes) => [nextQuote, ...prevQuotes])
    return nextQuote
  }

  const updateQuoteStatus = (quoteId, nextStatus) => {
    const safeStatus = quoteStatuses.includes(nextStatus) ? nextStatus : quoteStatuses[0]

    setQuotes((prevQuotes) =>
      prevQuotes.map((quote) =>
        String(quote.id) === String(quoteId)
          ? {
              ...quote,
              status: safeStatus,
            }
          : quote,
      ),
    )
  }

  const updateQuote = (quoteId, quoteData) => {
    const safeQuoteData = quoteData && typeof quoteData === 'object' ? quoteData : {}

    setQuotes((prevQuotes) =>
      prevQuotes.map((quote) => {
        if (String(quote.id) !== String(quoteId)) return quote

        const nextItems = Array.isArray(safeQuoteData.items)
          ? safeQuoteData.items
              .map((item, index) => normalizeQuoteItem(item, index))
              .filter(Boolean)
          : quote.items

        const subtotal = nextItems.reduce((acc, item) => acc + item.lineTotal, 0)
        const nextDeliveryType = deliveryTypes.includes(String(safeQuoteData.deliveryType ?? quote.deliveryType ?? ''))
          ? String(safeQuoteData.deliveryType ?? quote.deliveryType)
          : deliveryTypes[0]
        const nextShippingCost = nextDeliveryType === 'Envío'
          ? toPositiveNumber(safeQuoteData.shippingCost ?? quote.shippingCost)
          : 0

        const nextClientId = String(safeQuoteData.clientId ?? quote.clientId ?? '').trim()
        const nextClientName = String(safeQuoteData.clientName ?? quote.clientName ?? 'Sin cliente').trim() || 'Sin cliente'
        const nextCreatedAt = String(safeQuoteData.createdAt ?? quote.createdAt ?? new Date().toISOString())

        return {
          ...quote,
          clientId: nextClientId,
          clientName: nextClientName,
          clientSource: (() => {
            const source = String(safeQuoteData.clientSource ?? quote.clientSource ?? '').trim()
            if (source === 'existing' || source === 'manual' || source === 'none') return source
            if (nextClientId) return 'existing'
            return nextClientName !== 'Sin cliente' ? 'manual' : 'none'
          })(),
          productionLeadTime: String(safeQuoteData.productionLeadTime ?? quote.productionLeadTime ?? '').trim(),
          deliveryType: nextDeliveryType,
          shippingCost: nextShippingCost,
          createdAt: nextCreatedAt,
          validUntil:
            typeof safeQuoteData.validUntil === 'string'
              ? resolveValidUntil(safeQuoteData.validUntil, nextCreatedAt)
              : resolveValidUntil(quote.validUntil, nextCreatedAt),
          items: nextItems,
          subtotal,
          total: subtotal + nextShippingCost,
        }
      }),
    )
  }

  return {
    quotes,
    createQuote,
    updateQuoteStatus,
    updateQuote,
  }
}

export default useQuotesState
