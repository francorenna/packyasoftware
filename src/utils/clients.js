const toPositiveNumber = (value) => {
  const parsed = Number(value)
  return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed
}

const getOrderClientId = (order, clientNameIndex) => {
  if (order?.clientId) return String(order.clientId)

  const key = String(order?.clientName ?? order?.client ?? '')
    .trim()
    .toLowerCase()

  return key ? clientNameIndex[key] ?? null : null
}

export const buildClientNameIndex = (clients) =>
  (Array.isArray(clients) ? clients : []).reduce((acc, client) => {
    const key = String(client.name ?? '').trim().toLowerCase()
    if (key) acc[key] = client.id
    return acc
  }, {})

export const getClientStatsMap = (clients, orders) => {
  const stats = {}
  const safeClients = Array.isArray(clients) ? clients : []
  const safeOrders = Array.isArray(orders) ? orders : []
  const clientNameIndex = buildClientNameIndex(safeClients)

  safeClients.forEach((client) => {
    stats[client.id] = {
      totalFacturado: 0,
      totalPagado: 0,
      totalPendiente: 0,
      lastOrderDate: '',
      lastOrderId: '',
      orders: [],
      activeOrdersCount: 0,
    }
  })

  safeOrders.forEach((order) => {
    const clientId = getOrderClientId(order, clientNameIndex)
    if (!clientId || !stats[clientId]) return

    const total = toPositiveNumber(order.total)
    const totalPagado = (Array.isArray(order.payments) ? order.payments : []).reduce(
      (acc, payment) => acc + toPositiveNumber(payment.amount),
      0,
    )
    const totalPendiente = Math.max(total - totalPagado, 0)
    const orderDate = String(order.deliveryDate ?? '')

    const current = stats[clientId]
    current.totalFacturado += total
    current.totalPagado += totalPagado
    current.totalPendiente += totalPendiente
    current.orders.push(order)

    const isActiveOrder = !['Entregado', 'Cancelado'].includes(String(order.status ?? ''))
    if (isActiveOrder) {
      current.activeOrdersCount += 1
    }

    if (
      orderDate &&
      (!current.lastOrderDate || new Date(orderDate) > new Date(current.lastOrderDate))
    ) {
      current.lastOrderDate = orderDate
      current.lastOrderId = String(order.id ?? '')
    }
  })

  return stats
}

export const getClientsWithDebtCount = (clients, orders) => {
  const statsMap = getClientStatsMap(clients, orders)
  return Object.values(statsMap).filter((stats) => stats.totalPendiente > 0).length
}
