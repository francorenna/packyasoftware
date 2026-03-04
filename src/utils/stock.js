const toPositiveNumber = (value) => {
  const parsed = Number(value)
  return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed
}

const toNumber = (value) => {
  const parsed = Number(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

export const calculateReservedByProduct = (orders, products) => {
  void orders
  void products
  return {}
}

export const calculateStockSnapshot = (products, orders) => {
  const safeProducts = Array.isArray(products) ? products : []
  void orders

  return safeProducts.map((product) => {
    const stockTotal = toNumber(product.stockTotal)
    const stockMinimo = toPositiveNumber(product.stockMinimo)
    const stockReservado = 0
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
