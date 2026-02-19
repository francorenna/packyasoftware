const nonReservingStatuses = new Set(['Entregado', 'Cancelado'])

const toPositiveNumber = (value) => {
  const parsed = Number(value)
  return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed
}

const toNumber = (value) => {
  const parsed = Number(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

const getNameIndex = (products) => {
  const index = {}
  ;(Array.isArray(products) ? products : []).forEach((product) => {
    const key = String(product.name ?? '').trim().toLowerCase()
    if (!key) return
    index[key] = String(product.id)
  })
  return index
}

const resolveProductId = (item, productNameIndex) => {
  if (!item || typeof item !== 'object') return null
  if (item.productId) return String(item.productId)

  const key = String(item.productName ?? item.product ?? '')
    .trim()
    .toLowerCase()

  return key ? productNameIndex[key] ?? null : null
}

export const calculateReservedByProduct = (orders, products) => {
  const reservations = {}
  const safeOrders = Array.isArray(orders) ? orders : []
  const productNameIndex = getNameIndex(products)

  safeOrders.forEach((order) => {
    if (nonReservingStatuses.has(String(order.status ?? ''))) return

    const items = Array.isArray(order.items) ? order.items : []
    items.forEach((item) => {
      if (item?.isClientMaterial) return

      const productId = resolveProductId(item, productNameIndex)
      if (!productId) return

      reservations[productId] =
        (reservations[productId] ?? 0) + toPositiveNumber(item.quantity)
    })
  })

  return reservations
}

export const calculateStockSnapshot = (products, orders) => {
  const safeProducts = Array.isArray(products) ? products : []
  const reservedByProduct = calculateReservedByProduct(orders, safeProducts)

  return safeProducts.map((product) => {
    const stockTotal = toNumber(product.stockTotal)
    const stockMinimo = toPositiveNumber(product.stockMinimo)
    const stockReservado = reservedByProduct[product.id] ?? 0
    const stockDisponible = stockTotal - stockReservado

    return {
      ...product,
      stockTotal,
      stockMinimo,
      stockReservado,
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
