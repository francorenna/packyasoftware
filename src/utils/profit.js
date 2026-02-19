import { APP_CONFIG } from '../config/app'

const toPositiveNumber = (value) => {
  const parsed = Number(value)
  return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed
}

const isValidDate = (value) => value instanceof Date && !Number.isNaN(value.getTime())

const getMonthKeyFromValue = (value) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value.slice(0, 7)
  }

  const parsed = new Date(value)
  if (!isValidDate(parsed)) return ''

  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

const getOrderMonthKey = (order) => {
  const deliveryMonth = getMonthKeyFromValue(order?.deliveryDate)
  if (deliveryMonth) return deliveryMonth
  return getMonthKeyFromValue(order?.createdAt)
}

const getOrderItems = (order) => (Array.isArray(order?.items) ? order.items : [])

const getOrderPayments = (order) => (Array.isArray(order?.payments) ? order.payments : [])

const buildProductMap = (products) => {
  const safeProducts = Array.isArray(products) ? products : []

  return safeProducts.reduce((acc, product) => {
    const productId = String(product?.id ?? '')
    if (!productId) return acc
    acc[productId] = product
    return acc
  }, {})
}

const buildAverageCostMap = (purchases) => {
  const safePurchases = Array.isArray(purchases) ? purchases : []

  const accumulator = safePurchases.reduce((acc, purchase) => {
    const items = Array.isArray(purchase?.items) ? purchase.items : []

    items.forEach((item) => {
      const productId = String(item?.productId ?? '')
      const quantity = toPositiveNumber(item?.quantity)
      const unitCost = toPositiveNumber(item?.unitCost)

      if (!productId || quantity <= 0 || unitCost <= 0) return

      const row = acc[productId] ?? {
        totalCost: 0,
        totalUnits: 0,
      }

      row.totalCost += quantity * unitCost
      row.totalUnits += quantity
      acc[productId] = row
    })

    return acc
  }, {})

  return Object.entries(accumulator).reduce((map, [productId, row]) => {
    if (row.totalUnits <= 0) return map
    map[productId] = row.totalCost / row.totalUnits
    return map
  }, {})
}

const resolveUnitCost = (productId, averageCostMap, productMap) => {
  const safeAverageCostMap = averageCostMap && typeof averageCostMap === 'object' ? averageCostMap : {}
  const safeProductMap = productMap && typeof productMap === 'object' ? productMap : {}

  const averageCost = toPositiveNumber(safeAverageCostMap[productId])
  if (averageCost > 0) {
    return {
      unitCost: averageCost,
      isEstimatedCost: false,
    }
  }

  const product = safeProductMap[productId]
  const referenceCost = toPositiveNumber(product?.referenceCost)

  return {
    unitCost: referenceCost,
    isEstimatedCost: referenceCost > 0,
  }
}

const calculateOrderCostDetails = (order, costMap, productMap) => {
  let isEstimatedCost = false

  const cost = getOrderItems(order).reduce((acc, item) => {
    const productId = String(item?.productId ?? '')
    const quantity = toPositiveNumber(item?.quantity)
    const isClientMaterial = Boolean(item?.isClientMaterial ?? false)

    if (quantity <= 0) return acc

    if (isClientMaterial) {
      const printingBaseCost = toPositiveNumber(APP_CONFIG?.printingBaseCost)
      return acc + quantity * printingBaseCost
    }

    if (!productId) return acc

    const { unitCost, isEstimatedCost: isEstimatedLineCost } = resolveUnitCost(
      productId,
      costMap,
      productMap,
    )

    if (isEstimatedLineCost) isEstimatedCost = true

    return acc + quantity * unitCost
  }, 0)

  return {
    cost,
    isEstimatedCost,
  }
}

const calculateOrderCost = (order, costMap, productMap) => {
  const { cost } = calculateOrderCostDetails(order, costMap, productMap)
  return cost
}

const calculateOrderProfit = (order, costMap, productMap) => {
  const revenue = getOrderPayments(order).reduce(
    (acc, payment) => acc + toPositiveNumber(payment?.amount),
    0,
  )
  const { cost, isEstimatedCost } = calculateOrderCostDetails(order, costMap, productMap)
  const profit = revenue - cost

  return {
    revenue,
    cost,
    profit,
    marginPercent: revenue > 0 ? (profit / revenue) * 100 : 0,
    isEstimatedCost,
  }
}

const buildMonthlyProfit = (orders, purchases, month, products) => {
  const safeOrders = Array.isArray(orders) ? orders : []
  const selectedMonth = typeof month === 'string' ? month : ''
  const costMap = buildAverageCostMap(purchases)
  const productMap = buildProductMap(products)

  const deliveredOrders = safeOrders.filter(
    (order) =>
      order?.status === 'Entregado' &&
      order?.isSample !== true &&
      getOrderMonthKey(order) === selectedMonth,
  )

  const totals = {
    totalRevenue: 0,
    totalCost: 0,
    totalProfit: 0,
    marginPercent: 0,
    costIsEstimated: false,
    productProfitMap: {},
  }

  deliveredOrders.forEach((order) => {
    const orderProfit = calculateOrderProfit(order, costMap, productMap)
    totals.totalRevenue += orderProfit.revenue
    totals.totalCost += orderProfit.cost
    totals.totalProfit += orderProfit.profit
    if (orderProfit.isEstimatedCost) totals.costIsEstimated = true

    const items = getOrderItems(order)
    const billedTotal = items.reduce(
      (acc, item) => acc + toPositiveNumber(item?.quantity) * toPositiveNumber(item?.unitPrice),
      0,
    )

    items.forEach((item) => {
      const productId = String(item?.productId ?? '')
      const quantity = toPositiveNumber(item?.quantity)
      const unitPrice = toPositiveNumber(item?.unitPrice)
      const productName = String(item?.productName ?? item?.product ?? 'Producto sin nombre').trim()
      const isClientMaterial = Boolean(item?.isClientMaterial ?? false)

      if (quantity <= 0) return

      if (isClientMaterial) {
        const lineBilled = quantity * unitPrice
        const realRevenue = billedTotal > 0 ? (orderProfit.revenue * lineBilled) / billedTotal : 0
        const lineCost = quantity * toPositiveNumber(APP_CONFIG?.printingBaseCost)
        const lineProfit = realRevenue - lineCost
        const mapKey = productId || `client-material-${productName || 'material'}`

        const current = totals.productProfitMap[mapKey] ?? {
          productId: mapKey,
          productName: productName || 'Material provisto por cliente',
          unitsSold: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
        }

        current.unitsSold += quantity
        current.revenue += realRevenue
        current.cost += lineCost
        current.profit += lineProfit

        totals.productProfitMap[mapKey] = current
        return
      }

      if (!productId) return

      const lineBilled = quantity * unitPrice
      const realRevenue = billedTotal > 0 ? (orderProfit.revenue * lineBilled) / billedTotal : 0
      const { unitCost, isEstimatedCost } = resolveUnitCost(productId, costMap, productMap)
      const lineCost = quantity * unitCost
      if (isEstimatedCost) totals.costIsEstimated = true
      const lineProfit = realRevenue - lineCost

      const current = totals.productProfitMap[productId] ?? {
        productId,
        productName: productName || 'Producto sin nombre',
        unitsSold: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
      }

      current.unitsSold += quantity
      current.revenue += realRevenue
      current.cost += lineCost
      current.profit += lineProfit

      totals.productProfitMap[productId] = current
    })
  })

  totals.marginPercent =
    totals.totalRevenue > 0 ? (totals.totalProfit / totals.totalRevenue) * 100 : 0

  return totals
}

export {
  buildAverageCostMap,
  calculateOrderCost,
  calculateOrderProfit,
  buildMonthlyProfit,
}