const isValidDate = (value) => value instanceof Date && !Number.isNaN(value.getTime())

const toPositiveNumber = (value) => {
  const parsed = Number(value)
  return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed
}

const toDate = (value) => {
  if (typeof value !== 'string' && !(value instanceof Date)) return null
  const parsed = new Date(value)
  return isValidDate(parsed) ? parsed : null
}

const toDateKey = (date) => {
  if (!isValidDate(date)) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getDateKeyFromValue = (value) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = toDate(value)
  return date ? toDateKey(date) : ''
}

const getMonthKeyFromValue = (value) => {
  const dateKey = getDateKeyFromValue(value)
  return dateKey ? dateKey.slice(0, 7) : ''
}

const getCurrentMonthKey = () => toDateKey(new Date()).slice(0, 7)

const getOrderFinancialSummary = (order) => {
  const items = Array.isArray(order?.items) ? order.items : []
  const payments = Array.isArray(order?.payments) ? order.payments : []

  const subtotal = items.reduce(
    (acc, item) => acc + toPositiveNumber(item?.quantity) * toPositiveNumber(item?.unitPrice),
    0,
  )
  const discount = toPositiveNumber(order?.discount)
  const finalTotal = toPositiveNumber(order?.total)
  const fallbackSubtotal = finalTotal + discount
  const effectiveSubtotal = subtotal > 0 ? subtotal : fallbackSubtotal

  const totalPaid = payments.reduce(
    (acc, payment) => acc + toPositiveNumber(payment?.amount),
    0,
  )
  const remainingDebt = Math.max(finalTotal - totalPaid, 0)

  let financialStatus = 'Parcial'
  if (totalPaid <= 0) financialStatus = 'Pendiente'
  if (totalPaid >= finalTotal) financialStatus = 'Pagado'

  return {
    items,
    payments,
    subtotal,
    discount,
    effectiveSubtotal,
    finalTotal,
    totalPaid,
    remainingDebt,
    financialStatus,
  }
}

const getMonthlyFinanceMovements = ({ orders, purchases, expenses, monthKey }) => {
  const safeOrders = Array.isArray(orders) ? orders : []
  const safePurchases = Array.isArray(purchases) ? purchases : []
  const safeExpenses = Array.isArray(expenses) ? expenses : []
  const selectedMonth = monthKey || getCurrentMonthKey()

  const incomeMovements = safeOrders.flatMap((order, orderIndex) => {
    if (order.isSample) return []
    const payments = Array.isArray(order?.payments) ? order.payments : []

    return payments
      .map((payment, paymentIndex) => {
        const parsedDate = toDate(payment?.date)
        if (!isValidDate(parsedDate)) return null

        const date = toDateKey(parsedDate)
        if (date.slice(0, 7) !== selectedMonth) return null

        const amount = toPositiveNumber(payment?.amount)
        if (amount <= 0) return null

        const orderId = String(order?.id ?? `PED-${orderIndex + 1}`)

        return {
          id: `income-${String(payment?.id ?? `${orderId}-${paymentIndex + 1}`)}`,
          date: parsedDate.toISOString(),
          type: 'Ingreso',
          concept: `Pago pedido ${orderId}`,
          category: '',
          amount,
        }
      })
      .filter(Boolean)
  })

  const expenseMovements = safePurchases
    .map((purchase, purchaseIndex) => {
      const parsedDate = toDate(purchase?.createdAt)
      if (!isValidDate(parsedDate)) return null

      const date = toDateKey(parsedDate)
      if (date.slice(0, 7) !== selectedMonth) return null

      const totalAmount = toPositiveNumber(purchase?.totalAmount)
      if (totalAmount <= 0) return null

      const supplierName = String(
        purchase?.supplierName ?? purchase?.supplier ?? 'Proveedor sin nombre',
      ).trim()

      return {
        id: `expense-${String(purchase?.id ?? `COM-${purchaseIndex + 1}`)}`,
        date: parsedDate.toISOString(),
        type: 'Egreso',
        concept: `Compra a ${supplierName || 'Proveedor sin nombre'}`,
        category: 'Compras',
        amount: -totalAmount,
      }
    })
    .filter(Boolean)

  const manualExpenseMovements = safeExpenses
    .map((expense, expenseIndex) => {
      const date = getDateKeyFromValue(expense?.date)
      if (!date || date.slice(0, 7) !== selectedMonth) return null

      const amount = toPositiveNumber(expense?.amount)
      if (amount <= 0) return null

      const description = String(expense?.description ?? '').trim() || 'Egreso manual'
      const category = String(expense?.category ?? '').trim()

      return {
        id: `manual-expense-${String(expense?.id ?? expenseIndex + 1)}`,
        date,
        type: 'Egreso',
        concept: description,
        category,
        amount: -amount,
      }
    })
    .filter(Boolean)

  return [...incomeMovements, ...expenseMovements, ...manualExpenseMovements].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  )
}

const getSampleMetrics = ({ orders, purchases, products, monthKey }) => {
  const safeOrders = Array.isArray(orders) ? orders : []
  const safePurchases = Array.isArray(purchases) ? purchases : []
  const safeProducts = Array.isArray(products) ? products : []
  const selectedMonth = monthKey || getCurrentMonthKey()

  const referenceCostByProduct = safeProducts.reduce((acc, product) => {
    const productId = String(product?.id ?? '')
    if (!productId) return acc
    acc[productId] = toPositiveNumber(product?.referenceCost)
    return acc
  }, {})

  // Helper: compute average unit cost per product from purchases
  const purchaseStats = {}
  safePurchases.forEach((purchase) => {
    const items = Array.isArray(purchase.items) ? purchase.items : []
    items.forEach((item) => {
      const pid = String(item.productId ?? '')
      if (!pid) return
      const qty = Number(item.quantity || 0)
      const unit = Number(item.unitCost || 0)
      if (qty <= 0) return
      const stat = purchaseStats[pid] ?? { qty: 0, cost: 0 }
      stat.qty += qty
      stat.cost += qty * unit
      purchaseStats[pid] = stat
    })
  })

  const purchaseAvg = {}
  Object.keys(purchaseStats).forEach((pid) => {
    const s = purchaseStats[pid]
    if (s.qty > 0) purchaseAvg[pid] = s.cost / s.qty
  })

  // Filter sample orders for selected month (by createdAt)
  const sampleOrders = safeOrders.filter((order) => {
    if (!order?.isSample) return false
    const key = getMonthKeyFromValue(order?.createdAt)
    return key === selectedMonth
  })

  const sampleOrdersCount = sampleOrders.length

  // Sum total units by product
  const unitsByProduct = {}
  sampleOrders.forEach((order) => {
    const items = Array.isArray(order.items) ? order.items : []
    items.forEach((item) => {
      const pid = String(item.productId ?? '')
      if (!pid) return
      const qty = Number(item.quantity || 0)
      if (qty <= 0) return
      unitsByProduct[pid] = (unitsByProduct[pid] || 0) + qty
    })
  })

  const totalUnits = Object.values(unitsByProduct).reduce((a, b) => a + b, 0)

  // Estimate cost: use purchaseAvg > referenceCost > 0
  let estimatedCost = 0
  Object.keys(unitsByProduct).forEach((pid) => {
    const qty = unitsByProduct[pid]
    const unitCost = purchaseAvg[pid] > 0 ? purchaseAvg[pid] : referenceCostByProduct[pid] ?? 0
    estimatedCost += qty * unitCost
  })

  return {
    sampleOrdersCount,
    totalUnits,
    estimatedCost,
    unitsByProduct,
  }
}

const calculateFinanceSummary = ({ orders, purchases, expenses, monthKey, todayKey }) => {
  const safeOrders = Array.isArray(orders) ? orders : []
  const safePurchases = Array.isArray(purchases) ? purchases : []
  const safeExpenses = Array.isArray(expenses) ? expenses : []
  const selectedMonth = monthKey || getCurrentMonthKey()
  const safeToday = todayKey || toDateKey(new Date())

  const totals = {
    dailyCollected: 0,
    dailyInvested: 0,
    dailyManualExpenses: 0,
    monthlyInvoiced: 0,
    monthlyCollected: 0,
    monthlyInvested: 0,
    monthlyManualExpenses: 0,
  }

  safeOrders.forEach((order) => {
    if (order.isSample) return
    if (String(order?.status ?? '') === 'Cancelado') return
    const orderCreatedMonth = getMonthKeyFromValue(order?.createdAt)
    if (orderCreatedMonth === selectedMonth) {
      totals.monthlyInvoiced += toPositiveNumber(order?.total)
    }

    const payments = Array.isArray(order?.payments) ? order.payments : []
    payments.forEach((payment) => {
      const paymentDateKey = getDateKeyFromValue(payment?.date)
      if (!paymentDateKey) return

      const amount = toPositiveNumber(payment?.amount)
      if (paymentDateKey === safeToday) {
        totals.dailyCollected += amount
      }
      if (paymentDateKey.slice(0, 7) === selectedMonth) {
        totals.monthlyCollected += amount
      }
    })
  })

  safePurchases.forEach((purchase) => {
    const purchaseDateKey = getDateKeyFromValue(purchase?.createdAt)
    if (!purchaseDateKey) return

    const amount = toPositiveNumber(purchase?.totalAmount)
    if (purchaseDateKey === safeToday) {
      totals.dailyInvested += amount
    }
    if (purchaseDateKey.slice(0, 7) === selectedMonth) {
      totals.monthlyInvested += amount
    }
  })

  safeExpenses.forEach((expense) => {
    const expenseDateKey = getDateKeyFromValue(expense?.date)
    if (!expenseDateKey) return

    const amount = toPositiveNumber(expense?.amount)
    if (amount <= 0) return

    if (expenseDateKey === safeToday) {
      totals.dailyManualExpenses += amount
    }

    if (expenseDateKey.slice(0, 7) === selectedMonth) {
      totals.monthlyManualExpenses += amount
    }
  })

  const dailyOutflow = totals.dailyInvested + totals.dailyManualExpenses
  const monthlyOutflow = totals.monthlyInvested + totals.monthlyManualExpenses

  return {
    ...totals,
    dailyOutflow,
    monthlyOutflow,
    dailyNet: totals.dailyCollected - dailyOutflow,
    monthlyNet: totals.monthlyCollected - totals.monthlyInvested - totals.monthlyManualExpenses,
  }
}

export {
  calculateFinanceSummary,
  getCurrentMonthKey,
  getMonthlyFinanceMovements,
  getOrderFinancialSummary,
  getSampleMetrics,
}