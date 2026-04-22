const toPositiveNumber = (value) => {
  const parsed = Number(value)
  return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed
}

const toNumber = (value) => {
  const parsed = Number(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

// Statuses considered "active" (stock is committed to these orders)
const ACTIVE_ORDER_STATUSES = new Set(['Pendiente', 'En Proceso', 'Listo'])

/**
 * Returns a map of { productId -> totalUnitsCommitted } from active non-sample,
 * non-archived orders. This does NOT deduct from stockDisponible in the current
 * model (stock is already debited on order creation via stockMovements). It is
 * exposed as stockComprometido for informational purposes and to support the
 * cloud model where stock debit will happen at delivery.
 */
export const calculateReservedByProduct = (orders) => {
  const safeOrders = Array.isArray(orders) ? orders : []

  return safeOrders.reduce((acc, order) => {
    if (!order || order.isArchived === true) return acc
    if (order.isSample === true) return acc
    if (!ACTIVE_ORDER_STATUSES.has(String(order.status ?? ''))) return acc

    const items = Array.isArray(order.items) ? order.items : []
    items.forEach((item) => {
      const productId = String(item?.productId ?? '').trim()
      const quantity = Math.max(Number(item?.quantity || 0), 0)
      if (!productId || quantity <= 0) return
      if (item.isClientMaterial === true) return
      acc[productId] = (acc[productId] ?? 0) + quantity
    })

    return acc
  }, {})
}

export const calculateStockSnapshot = (products, orders) => {
  const safeProducts = Array.isArray(products) ? products : []
  const reservedByProduct = calculateReservedByProduct(orders)

  return safeProducts.map((product) => {
    const stockTotal = toNumber(product.stockTotal)
    const stockMinimo = toPositiveNumber(product.stockMinimo)
    // stockDisponible = stockTotal because stock is debited immediately on order
    // creation (Venta/Muestra movements). stockComprometido is informational only.
    const stockComprometido = toPositiveNumber(reservedByProduct[product.id])
    const stockReservado = 0
    const stockDisponible = stockTotal - stockReservado

    return {
      ...product,
      stockTotal,
      stockMinimo,
      stockReservado,
      stockComprometido,
      stockDisponible,
    }
  })
}

export const getStockMapByProductId = (products, orders) => {
  return calculateStockSnapshot(products, orders).reduce((acc, product) => {
    acc[product.id] = product
    return acc
  }, {})
}
