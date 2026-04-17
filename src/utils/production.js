const isValidDate = (value) => value instanceof Date && !Number.isNaN(value.getTime())

const toPositiveNumber = (value) => {
  const parsed = Number(value)
  return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed
}

const toDateKey = (date) => {
  if (!isValidDate(date)) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const parseDateKey = (value) => {
  if (typeof value !== 'string') return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null

  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(year, month - 1, day)
  return isValidDate(parsed) ? parsed : null
}

const getMonthKey = (dateKey) => (typeof dateKey === 'string' ? dateKey.slice(0, 7) : '')

const getOrderDeliveryDateKey = (order) => {
  const deliveryDate = String(order?.deliveryDate ?? '')
  return /^\d{4}-\d{2}-\d{2}$/.test(deliveryDate) ? deliveryDate : ''
}

const isProductionOrder = (order) => {
  const status = String(order?.status ?? '')
  if (status === 'Cancelado') return false
  if (status === 'Entregado') return true
  return order?.isSample === true && status === 'Lista'
}

const getOrderPrintedBoxes = (order) => {
  const items = Array.isArray(order?.items) ? order.items : []
  return items.reduce((acc, item) => acc + toPositiveNumber(item?.quantity), 0)
}

const isSameWeekMondayStart = (targetDate, today) => {
  if (!isValidDate(targetDate) || !isValidDate(today)) return false

  const normalize = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const safeToday = normalize(today)
  const safeTarget = normalize(targetDate)

  const day = safeToday.getDay()
  const offsetToMonday = day === 0 ? 6 : day - 1
  const start = new Date(safeToday)
  start.setDate(safeToday.getDate() - offsetToMonday)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)

  return safeTarget >= start && safeTarget <= end
}

const getDashboardProductionMetrics = (orders, now = new Date()) => {
  const safeOrders = Array.isArray(orders) ? orders : []
  const todayKey = toDateKey(now)
  const monthKey = todayKey.slice(0, 7)

  const totals = safeOrders.reduce(
    (acc, order) => {
      if (!isProductionOrder(order)) return acc

      const deliveryDateKey = getOrderDeliveryDateKey(order)
      if (!deliveryDateKey) return acc

      const deliveryDate = parseDateKey(deliveryDateKey)
      if (!deliveryDate) return acc

      const boxes = getOrderPrintedBoxes(order)
      const isCurrentMonth = getMonthKey(deliveryDateKey) === monthKey

      if (deliveryDateKey === todayKey) {
        acc.boxesToday += boxes
      }

      if (isSameWeekMondayStart(deliveryDate, now)) {
        acc.boxesWeek += boxes
      }

      if (isCurrentMonth) {
        acc.boxesMonth += boxes

        if (String(order?.status ?? '') === 'Entregado') {
          acc.jobsMonth += 1
        }

        if (order?.isSample === true) {
          acc.samplesMonth += 1
        }
      }

      return acc
    },
    {
      boxesToday: 0,
      boxesWeek: 0,
      boxesMonth: 0,
      jobsMonth: 0,
      samplesMonth: 0,
    },
  )

  const elapsedDays = Math.max(now.getDate(), 1)

  return {
    ...totals,
    averageDailyMonth: totals.boxesMonth / elapsedDays,
  }
}

const getMonthlyProductionClosure = (orders, monthKey) => {
  const safeOrders = Array.isArray(orders) ? orders : []
  const selectedMonth = typeof monthKey === 'string' ? monthKey : ''

  return safeOrders.reduce(
    (acc, order) => {
      if (!isProductionOrder(order)) return acc

      const deliveryDateKey = getOrderDeliveryDateKey(order)
      if (!deliveryDateKey || getMonthKey(deliveryDateKey) !== selectedMonth) return acc

      acc.producedBoxes += getOrderPrintedBoxes(order)

      if (String(order?.status ?? '') === 'Entregado') {
        acc.completedJobs += 1
      }

      if (order?.isSample === true) {
        acc.samples += 1
      }

      return acc
    },
    {
      producedBoxes: 0,
      completedJobs: 0,
      samples: 0,
    },
  )
}

const getPendingProductionNeeds = (orders, products) => {
  const safeOrders = Array.isArray(orders) ? orders : []
  const safeProducts = Array.isArray(products) ? products : []

  const productNameById = safeProducts.reduce((acc, product) => {
    const productId = String(product?.id ?? '').trim()
    if (!productId) return acc

    acc[productId] = String(product?.name ?? '').trim()
    return acc
  }, {})

  const totalsByProductKey = {}

  safeOrders.forEach((order) => {
    if (order?.isArchived === true) return
    if (order?.isSample === true) return

    const status = String(order?.status ?? '')
    if (status !== 'Pendiente' && status !== 'En Proceso') return

    const items = Array.isArray(order?.items) ? order.items : []

    items.forEach((item) => {
      const quantity = toPositiveNumber(item?.quantity)
      if (quantity <= 0) return

      const productId = String(item?.productId ?? '').trim()
      const rawName = String(item?.productName ?? item?.product ?? '').trim()
      const fallbackName = productId ? String(productNameById[productId] ?? '').trim() : ''
      const productName = rawName || fallbackName || 'Producto sin nombre'

      const productKey = productId || `name:${productName.toLowerCase()}`
      const current = totalsByProductKey[productKey] ?? {
        productId,
        productName,
        quantity: 0,
      }

      current.quantity += quantity
      if (!current.productName) {
        current.productName = productName
      }

      totalsByProductKey[productKey] = current
    })
  })

  return Object.values(totalsByProductKey).sort((a, b) => {
    const quantityDiff = Number(b.quantity || 0) - Number(a.quantity || 0)
    if (quantityDiff !== 0) return quantityDiff

    return String(a.productName ?? '').localeCompare(String(b.productName ?? ''), 'es', {
      sensitivity: 'base',
    })
  })
}

export {
  getDashboardProductionMetrics,
  getMonthlyProductionClosure,
  getPendingProductionNeeds,
}