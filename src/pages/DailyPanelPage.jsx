import { useMemo, useState } from 'react'
import useAppDialog from '../hooks/useAppDialog'
import { DAILY_PANEL_FUND_KEYS } from '../state/useDailyPanelState'
import { formatOrderId } from '../utils/orders'
import { getOrderFinancialSummary } from '../utils/finance'
import { generateDailyPanelMonthlyReportPDF } from '../utils/reportsPdf'

const FUND_META = {
  cash: {
    label: 'Efectivo',
    shortLabel: 'EF',
    description: 'Caja física del día',
    accentClassName: 'daily-panel-fund-cash',
  },
  mercadoPagoFranco: {
    label: 'MercadoPago Franco',
    shortLabel: 'MP F',
    description: 'Cuenta operada por Franco',
    accentClassName: 'daily-panel-fund-franco',
  },
  mercadoPagoDamian: {
    label: 'MercadoPago Damian',
    shortLabel: 'MP D',
    description: 'Cuenta operada por Damian',
    accentClassName: 'daily-panel-fund-damian',
  },
}

const FUND_OPTIONS = DAILY_PANEL_FUND_KEYS.map((fundId) => ({
  id: fundId,
  ...FUND_META[fundId],
}))

const TEAM_OPTIONS = [
  { value: 'FRANCO', label: 'Franco' },
  { value: 'DAMIAN', label: 'Damian' },
]

const INCOME_CATEGORIES = ['Cobro pedido', 'Cobro libre', 'Aporte', 'Venta directa', 'Otro ingreso']
const EXPENSE_CATEGORIES = ['Gasto operativo', 'Compra', 'Retiro Franco', 'Retiro Damian', 'Otro egreso']

const toDateKey = (value) => {
  const raw = String(value ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return ''

  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getTodayDateKey = () => toDateKey(new Date())

const getMonthKeyFromDateKey = (dateKey) => String(dateKey ?? '').slice(0, 7)

const toSafeNumber = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const toPositiveNumber = (value) => Math.max(toSafeNumber(value), 0)

const normalizeActor = (value) => {
  const normalizedValue = String(value ?? '').trim().toUpperCase()
  return TEAM_OPTIONS.some((option) => option.value === normalizedValue) ? normalizedValue : 'FRANCO'
}

const normalizeSearchText = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

const getFundLabel = (fundId) => {
  const normalizedFundId = normalizeFundId(fundId)
  return FUND_OPTIONS.find((option) => option.id === normalizedFundId)?.label ?? 'Efectivo'
}

const getActorLabel = (actor) => {
  const normalizedActor = normalizeActor(actor)
  return TEAM_OPTIONS.find((option) => option.value === normalizedActor)?.label ?? 'Franco'
}

const formatCurrency = (value) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0))

const formatPercent = (value) => `${Number(value || 0).toFixed(1)}%`

const formatMonthLabel = (monthKey) => {
  const [year, month] = String(monthKey ?? '').split('-').map(Number)
  if (!Number.isInteger(year) || !Number.isInteger(month)) return 'Mes'

  const date = new Date(year, month - 1, 1)
  return date.toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric',
  })
}

const formatLongDate = (dateKey) => {
  const [year, month, day] = String(dateKey ?? '').split('-').map(Number)
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return 'Sin fecha'

  return new Date(year, month - 1, day).toLocaleDateString('es-AR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

const formatShortDate = (dateKey) => {
  const [year, month, day] = String(dateKey ?? '').split('-').map(Number)
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return 'Sin fecha'
  return new Date(year, month - 1, day).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

const getPreviousDateKey = (dateKey) => {
  const [year, month, day] = String(dateKey ?? '').split('-').map(Number)
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return ''

  const prev = new Date(year, month - 1, day)
  prev.setDate(prev.getDate() - 1)
  return toDateKey(prev)
}

const shiftMonthKey = (monthKey, delta) => {
  const [year, month] = String(monthKey ?? '').split('-').map(Number)
  if (!Number.isInteger(year) || !Number.isInteger(month)) return getMonthKeyFromDateKey(getTodayDateKey())

  const next = new Date(year, month - 1 + Number(delta || 0), 1)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
}

const getPreviousMonthKey = (monthKey) => shiftMonthKey(monthKey, -1)

const isDateKeyInMonth = (dateKey, monthKey) => String(dateKey ?? '').startsWith(`${String(monthKey ?? '')}-`)

const toMonthComparable = (monthKey) => {
  const [year, month] = String(monthKey ?? '').split('-').map(Number)
  if (!Number.isInteger(year) || !Number.isInteger(month)) return Number.NaN
  return year * 100 + month
}

const normalizeClientKey = (value) =>
  normalizeSearchText(String(value ?? '').replace(/\s+/g, ' '))

const normalizeSupplierName = (value) => String(value ?? '').trim()

const buildPrioritizedOrderResults = (catalog, queryText, movementAmount) => {
  const safeCatalog = Array.isArray(catalog) ? catalog : []
  const normalizedQuery = normalizeSearchText(queryText)

  const filtered = normalizedQuery
    ? safeCatalog.filter((option) => String(option?.searchText ?? '').includes(normalizedQuery))
    : safeCatalog

  const amount = Number(movementAmount || 0)
  if (amount <= 0) return filtered.slice(0, 8)

  const withHigherOrEqualDebt = filtered
    .filter((option) => Number(option?.remainingDebt || 0) >= amount)
    .sort((a, b) => {
      const diffA = Number(a?.remainingDebt || 0) - amount
      const diffB = Number(b?.remainingDebt || 0) - amount
      return diffA - diffB
    })

  const withLowerDebt = filtered
    .filter((option) => Number(option?.remainingDebt || 0) < amount)
    .sort((a, b) => {
      const diffA = Math.abs(Number(a?.remainingDebt || 0) - amount)
      const diffB = Math.abs(Number(b?.remainingDebt || 0) - amount)
      return diffA - diffB
    })

  return [...withHigherOrEqualDebt, ...withLowerDebt].slice(0, 8)
}

const percentageChange = (currentValue, previousValue) => {
  const current = Number(currentValue || 0)
  const previous = Number(previousValue || 0)
  if (previous <= 0) {
    if (current <= 0) return { direction: 'flat', value: 0 }
    return { direction: 'up', value: 100 }
  }

  const pct = ((current - previous) / previous) * 100
  if (Math.abs(pct) < 0.05) return { direction: 'flat', value: 0 }
  return {
    direction: pct > 0 ? 'up' : 'down',
    value: Math.abs(pct),
  }
}

const EXPENSE_CLASSIFICATION_LABELS = {
  operating: 'Gastos operativos',
  stock: 'Compra de stock',
  investment: 'Inversiones',
  withdrawals: 'Retiros de socios',
  taxes: 'Impuestos',
}

const STOCK_HINTS = ['navidad', 'moya', 'andres cartonera', 'ferrer', 'tintas', 'carton', 'caja', 'insumo']

const classifyExpenseMovement = (movement) => {
  const category = normalizeSearchText(movement?.category)
  const concept = normalizeSearchText(movement?.concept)
  const origin = normalizeSearchText(movement?.origin)
  const merged = `${category} ${concept} ${origin}`

  if (/retiro/.test(merged)) return 'withdrawals'
  if (/impuesto|iva|afip|ingresos brutos|retencion/.test(merged)) return 'taxes'
  if (/inversion|equipo|maquina|activos|herramienta/.test(merged)) return 'investment'
  if (/compra|materia prima|insumo|proveedor/.test(merged)) return 'stock'
  if (STOCK_HINTS.some((hint) => merged.includes(hint))) return 'stock'

  return 'operating'
}

const extractSupplierNameFromExpense = (movement) => {
  const explicit = String(
    movement?.supplierName ??
    movement?.supplier ??
    movement?.providerName ??
    movement?.provider ??
    '',
  ).trim()
  if (explicit) return explicit

  const concept = String(movement?.concept ?? '').trim()
  const origin = normalizeSearchText(movement?.origin)
  const isPurchaseLike = /sistema\/compras|compra/.test(origin) || /^compra\s+/i.test(concept)
  if (!isPurchaseLike) return ''

  const stripped = concept.replace(/^compra\s+/i, '').trim()
  if (!stripped) return ''
  return stripped
}

const isPurchaseExpenseMovement = (movement) => {
  const category = normalizeSearchText(movement?.category)
  const concept = normalizeSearchText(movement?.concept)
  const origin = normalizeSearchText(movement?.origin)

  if (classifyExpenseMovement(movement) === 'stock') return true
  if (/compra|proveedor/.test(category)) return true
  if (/sistema\/compras|proveedor/.test(origin)) return true
  if (/^compra\s+/.test(concept)) return true

  return false
}

const makeMovementId = (prefix = 'MOV') =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const createEmptyFundTotals = () =>
  DAILY_PANEL_FUND_KEYS.reduce((acc, fundId) => {
    acc[fundId] = 0
    return acc
  }, {})

const normalizeFundId = (value) => {
  const safeValue = String(value ?? '').trim()
  return DAILY_PANEL_FUND_KEYS.includes(safeValue) ? safeValue : 'cash'
}

const sumFundTotals = (balances) =>
  DAILY_PANEL_FUND_KEYS.reduce((acc, fundId) => acc + toPositiveNumber(balances?.[fundId]), 0)

const buildMovementTotalsByFund = (movements) =>
  (Array.isArray(movements) ? movements : []).reduce((acc, movement) => {
    const fundId = normalizeFundId(movement?.fundId)
    acc[fundId] += toPositiveNumber(movement?.amount)
    return acc
  }, createEmptyFundTotals())

const buildDaySummary = (entry) => {
  if (!entry || typeof entry !== 'object') {
    return {
      openingByFund: createEmptyFundTotals(),
      closingByFund: createEmptyFundTotals(),
      incomeByFund: createEmptyFundTotals(),
      expenseByFund: createEmptyFundTotals(),
      expectedByFund: createEmptyFundTotals(),
      openingTotal: 0,
      incomeTotal: 0,
      expenseTotal: 0,
      expectedFinal: 0,
      realFinal: 0,
      difference: 0,
      absDifference: 0,
    }
  }

  const openingByFund = DAILY_PANEL_FUND_KEYS.reduce((acc, fundId) => {
    acc[fundId] = toPositiveNumber(entry?.openingBalances?.[fundId])
    return acc
  }, createEmptyFundTotals())

  const closingByFund = DAILY_PANEL_FUND_KEYS.reduce((acc, fundId) => {
    acc[fundId] = toPositiveNumber(entry?.closingBalances?.[fundId])
    return acc
  }, createEmptyFundTotals())

  const incomeByFund = buildMovementTotalsByFund(entry?.incomeMovements)
  const expenseByFund = buildMovementTotalsByFund(entry?.expenseMovements)

  const expectedByFund = DAILY_PANEL_FUND_KEYS.reduce((acc, fundId) => {
    acc[fundId] = openingByFund[fundId] + incomeByFund[fundId] - expenseByFund[fundId]
    return acc
  }, createEmptyFundTotals())

  const openingTotal = sumFundTotals(openingByFund)
  const incomeTotal = sumFundTotals(incomeByFund)
  const expenseTotal = sumFundTotals(expenseByFund)
  const expectedFinal = sumFundTotals(expectedByFund)
  const realFinal = sumFundTotals(closingByFund)
  const difference = realFinal - expectedFinal

  return {
    openingByFund,
    closingByFund,
    incomeByFund,
    expenseByFund,
    expectedByFund,
    openingTotal,
    incomeTotal,
    expenseTotal,
    expectedFinal,
    realFinal,
    difference,
    absDifference: Math.abs(difference),
  }
}

const hasStartedDay = (entry) => {
  if (!entry || typeof entry !== 'object') return false

  const summary = buildDaySummary(entry)
  if (summary.openingTotal > 0) return true
  if (summary.incomeTotal > 0) return true
  if (summary.expenseTotal > 0) return true
  if (summary.realFinal > 0) return true
  if (String(entry.notes ?? '').trim()) return true
  if (String(entry.openingNote ?? '').trim()) return true
  if (String(entry.closingNote ?? '').trim()) return true

  const operation = entry.operational && typeof entry.operational === 'object' ? entry.operational : {}
  const operationTotal =
    toPositiveNumber(operation.ordersTaken) +
    toPositiveNumber(operation.ordersDelivered) +
    toPositiveNumber(operation.paymentsRegistered) +
    toPositiveNumber(operation.productionActivity) +
    toPositiveNumber(operation.printedBoxes)

  return operationTotal > 0
}

const getDayVisualStatus = (entry) => {
  if (!entry) return 'empty'
  if (!hasStartedDay(entry)) return 'empty'
  if (!entry.isClosed) return 'in-progress'

  const summary = buildDaySummary(entry)
  return summary.absDifference <= 1 ? 'closed-ok' : 'closed-diff'
}

const getStatusPresentation = (status) => {
  if (status === 'in-progress') {
    return { icon: '🟡', label: 'Abierto', className: 'daily-panel-status-progress' }
  }
  if (status === 'closed-ok') {
    return { icon: '🟢', label: 'Cerrado correcto', className: 'daily-panel-status-ok' }
  }
  if (status === 'closed-diff') {
    return { icon: '🔴', label: 'Cerrado con diferencia', className: 'daily-panel-status-diff' }
  }

  return { icon: '⚪', label: 'Sin iniciar', className: 'daily-panel-status-empty' }
}

const buildMonthGrid = (monthKey) => {
  const [year, month] = String(monthKey ?? '').split('-').map(Number)
  if (!Number.isInteger(year) || !Number.isInteger(month)) return []

  const firstDate = new Date(year, month - 1, 1)
  const daysInMonth = new Date(year, month, 0).getDate()
  const firstWeekDay = (firstDate.getDay() + 6) % 7

  const cells = []

  for (let index = 0; index < firstWeekDay; index += 1) {
    cells.push({ dateKey: '', dayNumber: 0, inCurrentMonth: false })
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    cells.push({
      dateKey,
      dayNumber: day,
      inCurrentMonth: true,
    })
  }

  while (cells.length % 7 !== 0) {
    cells.push({ dateKey: '', dayNumber: 0, inCurrentMonth: false })
  }

  return cells
}

const getOrderPrintedBoxes = (order) => {
  const items = Array.isArray(order?.items) ? order.items : []
  return items.reduce((itemAcc, item) => {
    if (item?.isClientMaterial) return itemAcc
    return itemAcc + Math.max(Math.trunc(toSafeNumber(item?.quantity)), 0)
  }, 0)
}

const buildReadyPrintMetrics = (dateKey, orders) => {
  const safeOrders = Array.isArray(orders) ? orders : []

  return safeOrders.reduce((acc, order) => {
    if (!order || typeof order !== 'object') return acc
    if (order?.isSample) return acc

    const status = String(order?.status ?? '')
    if (status !== 'Listo' && status !== 'Entregado') return acc

    const readyDateKey =
      toDateKey(order?.readyAt) ||
      toDateKey(order?.productionDate)

    if (readyDateKey !== dateKey) return acc

    acc.readyOrders += 1
    acc.printedBoxes += getOrderPrintedBoxes(order)
    return acc
  }, {
    readyOrders: 0,
    printedBoxes: 0,
  })
}

const buildSystemSuggestions = (dateKey, orders, purchases, expenses) => {
  const safeOrders = Array.isArray(orders) ? orders : []
  const safePurchases = Array.isArray(purchases) ? purchases : []
  const safeExpenses = Array.isArray(expenses) ? expenses : []

  const incomeMovements = []
  const expenseMovements = []

  let paymentsRegistered = 0

  safeOrders.forEach((order) => {
    const payments = Array.isArray(order?.payments) ? order.payments : []

    payments.forEach((payment, paymentIndex) => {
      const paymentDateKey = toDateKey(payment?.date)
      const amount = toPositiveNumber(payment?.amount)
      if (paymentDateKey !== dateKey || amount <= 0) return

      paymentsRegistered += 1

      incomeMovements.push({
        id: String(payment?.id ?? makeMovementId('INC')),
        concept: `Cobro pedido ${formatOrderId(order?.id ?? `PED-${paymentIndex + 1}`)}`,
        amount,
        category: 'Cobro pedido',
        origin: 'Sistema/Pedidos',
        fundId: 'cash',
        actor: 'FRANCO',
        linkedOrderId: String(order?.id ?? ''),
        unlinkReason: '',
        supplierName: '',
        note: 'Sugerencia automática. Reasigná el fondo si el cobro entró por otra vía.',
      })
    })
  })

  safePurchases.forEach((purchase, index) => {
    const purchaseDateKey = toDateKey(purchase?.createdAt)
    const amount = toPositiveNumber(purchase?.totalAmount)
    if (purchaseDateKey !== dateKey || amount <= 0) return

    expenseMovements.push({
      id: String(purchase?.id ?? makeMovementId('EXP')),
      concept: `Compra ${String(purchase?.supplierName ?? purchase?.supplier ?? `Proveedor ${index + 1}`).trim()}`,
      amount,
      category: 'Compra',
      origin: 'Sistema/Compras',
      fundId: 'cash',
      actor: 'FRANCO',
      supplierName: String(purchase?.supplierName ?? purchase?.supplier ?? '').trim(),
      note: 'Sugerencia automática. Ajustá el fondo real usado.',
    })
  })

  safeExpenses.forEach((expense, index) => {
    const expenseDateKey = toDateKey(expense?.date)
    const amount = toPositiveNumber(expense?.amount)
    if (expenseDateKey !== dateKey || amount <= 0) return

    const concept = String(expense?.reason ?? expense?.description ?? '').trim() || `Egreso ${index + 1}`
    const partner = String(expense?.person ?? '').trim().toUpperCase()

    expenseMovements.push({
      id: String(expense?.id ?? makeMovementId('EXP')),
      concept,
      amount,
      category: String(expense?.category ?? 'Gasto operativo').trim() || 'Gasto operativo',
      origin: 'Sistema/Gastos',
      fundId: 'cash',
      actor: TEAM_OPTIONS.some((option) => option.value === partner) ? partner : 'FRANCO',
      supplierName: '',
      note: 'Sugerencia automática desde gastos registrados.',
    })
  })

  const ordersTaken = safeOrders.filter((order) => {
    if (order?.isSample) return false
    return toDateKey(order?.createdAt) === dateKey
  }).length

  const ordersDelivered = safeOrders.filter((order) => {
    if (order?.isSample) return false
    if (String(order?.status ?? '') !== 'Entregado') return false
    return toDateKey(order?.deliveryDate) === dateKey
  }).length

  const productionActivity = safeOrders.filter((order) => {
    if (order?.isSample) return false
    return toDateKey(order?.productionDate) === dateKey
  }).length

  const readyPrintMetrics = buildReadyPrintMetrics(dateKey, safeOrders)

  return {
    incomeMovements,
    expenseMovements,
    operational: {
      ordersTaken,
      ordersDelivered,
      paymentsRegistered,
      productionActivity,
      printedBoxes: readyPrintMetrics.printedBoxes,
    },
  }
}

const getDefaultMovement = (type = 'income') => {
  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
  return {
    id: makeMovementId(type === 'income' ? 'INC' : 'EXP'),
    concept: '',
    amount: 0,
    category: categories[0],
    origin: 'Manual',
    fundId: 'cash',
    actor: 'FRANCO',
    linkedOrderId: '',
    unlinkReason: '',
    supplierName: '',
    note: '',
    isCompact: false,
  }
}

const buildMonthMetrics = (entries, monthKey) => {
  const monthEntries = (Array.isArray(entries) ? entries : [])
    .filter((entry) => String(entry?.dateKey ?? '').startsWith(`${monthKey}-`))
    .sort((a, b) => String(a.dateKey).localeCompare(String(b.dateKey)))

  const initial = {
    monthEntries,
    totalIncome: 0,
    totalExpense: 0,
    totalDifference: 0,
    openDays: 0,
    closedDays: 0,
    closedWithDifferenceDays: 0,
    activeDays: 0,
    firstOpeningTotal: 0,
    lastRealTotal: 0,
  }

  if (monthEntries.length === 0) return initial

  const aggregated = monthEntries.reduce((acc, entry, index) => {
    const summary = buildDaySummary(entry)
    const visualStatus = getDayVisualStatus(entry)
    const isActive = hasStartedDay(entry)

    if (isActive) {
      acc.activeDays += 1
    }

    if (entry?.isClosed) {
      acc.closedDays += 1
    } else if (isActive) {
      acc.openDays += 1
    }

    if (visualStatus === 'closed-diff') {
      acc.closedWithDifferenceDays += 1
    }

    acc.totalIncome += summary.incomeTotal
    acc.totalExpense += summary.expenseTotal
    acc.totalDifference += summary.difference

    if (index === 0) {
      acc.firstOpeningTotal = summary.openingTotal
    }
    acc.lastRealTotal = summary.realFinal

    return acc
  }, initial)

  return aggregated
}

const validateMovementsForClose = (entry, options = {}) => {
  if (!entry || typeof entry !== 'object') return []

  const issues = []
  const validOrderIds = options?.validOrderIds instanceof Set ? options.validOrderIds : null

  const validateCollection = (movements, typeLabel) => {
    const safeMovements = Array.isArray(movements) ? movements : []
    safeMovements.forEach((movement, index) => {
      const rowLabel = `${typeLabel} #${index + 1}`
      const concept = String(movement?.concept ?? '').trim()
      const actor = normalizeActor(movement?.actor)
      const amount = toPositiveNumber(movement?.amount)
      const linkedOrderId = String(movement?.linkedOrderId ?? '').trim()
      const unlinkReason = String(movement?.unlinkReason ?? '').trim()
      const supplierName = normalizeSupplierName(movement?.supplierName)
      const purchaseLikeExpense = typeLabel === 'Egreso' && isPurchaseExpenseMovement(movement)

      if (!concept) issues.push(`${rowLabel}: falta concepto.`)
      if (amount <= 0) issues.push(`${rowLabel}: el monto debe ser mayor a 0.`)
      if (!TEAM_OPTIONS.some((option) => option.value === actor)) {
        issues.push(`${rowLabel}: falta responsable (Franco o Damian).`)
      }

      if (typeLabel === 'Ingreso' && !linkedOrderId && !unlinkReason) {
        issues.push(`${rowLabel}: si no está vinculado a pedido, cargá "Motivo sin vincular".`)
      }

      if (typeLabel === 'Ingreso' && linkedOrderId && validOrderIds && !validOrderIds.has(linkedOrderId)) {
        issues.push(`${rowLabel}: el pedido vinculado no existe. Elegí un pedido válido o cargá motivo sin vincular.`)
      }

      if (purchaseLikeExpense && !supplierName) {
        issues.push(`${rowLabel}: en egresos de compra/proveedor, completar proveedor.`)
      }
    })
  }

  validateCollection(entry.incomeMovements, 'Ingreso')
  validateCollection(entry.expenseMovements, 'Egreso')

  return issues
}

function DailyPanelPage({
  dailyPanelEntries,
  getDailyPanelEntry,
  upsertDailyPanelEntry,
  orders,
  purchases,
  expenses,
  suppliers,
  onSaveSupplier,
  onApplyLinkedIncomeToOrder,
}) {
  const todayKey = getTodayDateKey()
  const [selectedMonthKey, setSelectedMonthKey] = useState(() => getMonthKeyFromDateKey(todayKey))
  const [selectedDateKey, setSelectedDateKey] = useState(() => todayKey)
  const [orderSearchByMovementId, setOrderSearchByMovementId] = useState({})
  const [pendingLinkByMovementId, setPendingLinkByMovementId] = useState({})

  const { dialogNode, appAlert, appConfirm } = useAppDialog()

  const safeEntries = useMemo(
    () => (Array.isArray(dailyPanelEntries) ? dailyPanelEntries : []),
    [dailyPanelEntries],
  )

  const entriesByDate = useMemo(
    () => safeEntries.reduce((acc, entry) => {
      acc[String(entry.dateKey)] = entry
      return acc
    }, {}),
    [safeEntries],
  )

  const calendarCells = useMemo(() => buildMonthGrid(selectedMonthKey), [selectedMonthKey])

  const selectedEntry = useMemo(() => {
    if (typeof getDailyPanelEntry === 'function') {
      return getDailyPanelEntry(selectedDateKey)
    }
    return entriesByDate[selectedDateKey] ?? null
  }, [entriesByDate, getDailyPanelEntry, selectedDateKey])

  const selectedSummary = useMemo(() => buildDaySummary(selectedEntry), [selectedEntry])
  const selectedVisualStatus = getDayVisualStatus(selectedEntry)
  const selectedStatusUi = getStatusPresentation(selectedVisualStatus)

  const systemSuggestions = useMemo(
    () => buildSystemSuggestions(selectedDateKey, orders, purchases, expenses),
    [selectedDateKey, orders, purchases, expenses],
  )

  const selectedReadyPrintMetrics = useMemo(
    () => buildReadyPrintMetrics(selectedDateKey, orders),
    [selectedDateKey, orders],
  )

  const monthMetrics = useMemo(
    () => buildMonthMetrics(safeEntries, selectedMonthKey),
    [safeEntries, selectedMonthKey],
  )

  const monthDailyRows = useMemo(
    () => monthMetrics.monthEntries.map((entry) => ({
      entry,
      summary: buildDaySummary(entry),
      status: getStatusPresentation(getDayVisualStatus(entry)),
      readyPrintMetrics: buildReadyPrintMetrics(entry?.dateKey, orders),
    })),
    [monthMetrics.monthEntries, orders],
  )

  const monthReportAnalytics = useMemo(() => {
    const safeRows = Array.isArray(monthDailyRows) ? monthDailyRows : []
    const prevMonthKey = getPreviousMonthKey(selectedMonthKey)
    const monthComparable = toMonthComparable(selectedMonthKey)

    const orderLookupById = (Array.isArray(orders) ? orders : []).reduce((acc, order) => {
      const orderId = String(order?.id ?? '').trim()
      if (!orderId) return acc
      acc[orderId] = {
        clientName: String(order?.clientName ?? order?.client ?? '').trim() || 'Sin cliente',
      }
      return acc
    }, {})

    const incomes = []
    const expensesRows = []

    safeRows.forEach(({ entry }) => {
      const dateKey = String(entry?.dateKey ?? '')
      const safeIncome = Array.isArray(entry?.incomeMovements) ? entry.incomeMovements : []
      const safeExpense = Array.isArray(entry?.expenseMovements) ? entry.expenseMovements : []

      safeIncome.forEach((movement) => incomes.push({ ...movement, dateKey }))
      safeExpense.forEach((movement) => expensesRows.push({ ...movement, dateKey }))
    })

    const prevRows = safeEntries
      .filter((entry) => isDateKeyInMonth(entry?.dateKey, prevMonthKey))
      .map((entry) => ({
        entry,
        summary: buildDaySummary(entry),
        readyPrintMetrics: buildReadyPrintMetrics(entry?.dateKey, orders),
      }))

    const prevIncomeTotal = prevRows.reduce((acc, row) => acc + Number(row?.summary?.incomeTotal || 0), 0)
    const prevExpenseTotal = prevRows.reduce((acc, row) => acc + Number(row?.summary?.expenseTotal || 0), 0)
    const prevNetTotal = prevIncomeTotal - prevExpenseTotal
    const prevProductionBoxes = prevRows.reduce((acc, row) => acc + Number(row?.readyPrintMetrics?.printedBoxes || 0), 0)

    const incomeByFundMap = incomes.reduce((acc, movement) => {
      const fundId = normalizeFundId(movement?.fundId)
      acc[fundId] = (acc[fundId] ?? 0) + toPositiveNumber(movement?.amount)
      return acc
    }, {})

    const expenseByFundMap = expensesRows.reduce((acc, movement) => {
      const fundId = normalizeFundId(movement?.fundId)
      acc[fundId] = (acc[fundId] ?? 0) + toPositiveNumber(movement?.amount)
      return acc
    }, {})

    const incomeByFund = FUND_OPTIONS.map((fund) => ({
      fundId: fund.id,
      fundLabel: fund.label,
      amount: Number(incomeByFundMap[fund.id] || 0),
    })).sort((a, b) => b.amount - a.amount)

    const expenseByFund = FUND_OPTIONS.map((fund) => ({
      fundId: fund.id,
      fundLabel: fund.label,
      amount: Number(expenseByFundMap[fund.id] || 0),
    })).sort((a, b) => b.amount - a.amount)

    const topClientsMap = incomes.reduce((acc, movement) => {
      const amount = toPositiveNumber(movement?.amount)
      if (amount <= 0) return acc

      const linkedOrderId = String(movement?.linkedOrderId ?? '').trim()
      const linkedOrder = orderLookupById[linkedOrderId]
      const clientName = String(linkedOrder?.clientName ?? '').trim() || 'Cobro sin cliente vinculado'
      const key = normalizeClientKey(clientName)

      const row = acc[key] ?? { clientName, amount: 0, movements: 0 }
      row.amount += amount
      row.movements += 1
      acc[key] = row
      return acc
    }, {})

    const topClients = Object.values(topClientsMap)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8)

    const incomeTraceability = incomes.reduce((acc, movement) => {
      const amount = toPositiveNumber(movement?.amount)
      if (amount <= 0) return acc

      const linkedOrderId = String(movement?.linkedOrderId ?? '').trim()
      const hasLinkedClient = Boolean(linkedOrderId && orderLookupById[linkedOrderId])

      if (hasLinkedClient) {
        acc.linkedCount += 1
        acc.linkedAmount += amount
      } else {
        acc.unlinkedCount += 1
        acc.unlinkedAmount += amount
        const concept = String(movement?.concept ?? 'Ingreso sin concepto').trim() || 'Ingreso sin concepto'
        const key = normalizeSearchText(concept)
        const row = acc.unlinkedConceptMap[key] ?? { concept, amount: 0, count: 0 }
        row.amount += amount
        row.count += 1
        acc.unlinkedConceptMap[key] = row
      }

      return acc
    }, {
      linkedCount: 0,
      linkedAmount: 0,
      unlinkedCount: 0,
      unlinkedAmount: 0,
      unlinkedConceptMap: {},
    })

    const unlinkedIncomeConcepts = Object.values(incomeTraceability.unlinkedConceptMap)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6)

    const expenseTraceabilityRaw = expensesRows.reduce((acc, movement) => {
      const amount = toPositiveNumber(movement?.amount)
      if (amount <= 0) return acc

      const supplierName = extractSupplierNameFromExpense(movement)
      if (supplierName) {
        acc.withSupplierCount += 1
        acc.withSupplierAmount += amount

        const key = normalizeClientKey(supplierName)
        const row = acc.suppliersMap[key] ?? { supplierName, amount: 0, movements: 0 }
        row.amount += amount
        row.movements += 1
        acc.suppliersMap[key] = row
      } else {
        acc.withoutSupplierCount += 1
        acc.withoutSupplierAmount += amount

        const concept = String(movement?.concept ?? 'Egreso sin concepto').trim() || 'Egreso sin concepto'
        const key = normalizeSearchText(concept)
        const row = acc.withoutSupplierConceptMap[key] ?? { concept, amount: 0, count: 0 }
        row.amount += amount
        row.count += 1
        acc.withoutSupplierConceptMap[key] = row
      }

      return acc
    }, {
      withSupplierCount: 0,
      withSupplierAmount: 0,
      withoutSupplierCount: 0,
      withoutSupplierAmount: 0,
      suppliersMap: {},
      withoutSupplierConceptMap: {},
    })

    const topSuppliers = Object.values(expenseTraceabilityRaw.suppliersMap)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10)

    const unlinkedExpenseConcepts = Object.values(expenseTraceabilityRaw.withoutSupplierConceptMap)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6)

    const actorExpenseMap = expensesRows.reduce((acc, movement) => {
      const actor = getActorLabel(movement?.actor)
      const amount = toPositiveNumber(movement?.amount)
      acc[actor] = (acc[actor] ?? 0) + amount
      return acc
    }, {})

    const actorExpenses = Object.entries(actorExpenseMap)
      .map(([actor, amount]) => ({ actor, amount: Number(amount || 0) }))
      .sort((a, b) => b.amount - a.amount)

    const categoryExpenseMap = expensesRows.reduce((acc, movement) => {
      const category = String(movement?.category ?? '').trim() || 'Sin categoría'
      const amount = toPositiveNumber(movement?.amount)
      acc[category] = (acc[category] ?? 0) + amount
      return acc
    }, {})

    const categoryExpenses = Object.entries(categoryExpenseMap)
      .map(([category, amount]) => ({ category, amount: Number(amount || 0) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10)

    const biggestExpenses = [...expensesRows]
      .map((movement) => ({
        dateKey: String(movement?.dateKey ?? ''),
        concept: String(movement?.concept ?? '').trim() || 'Sin concepto',
        category: String(movement?.category ?? '').trim() || 'Sin categoría',
        actor: getActorLabel(movement?.actor),
        fundLabel: getFundLabel(movement?.fundId),
        amount: toPositiveNumber(movement?.amount),
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 12)

    const expenseBreakdownMap = expensesRows.reduce((acc, movement) => {
      const bucket = classifyExpenseMovement(movement)
      acc[bucket] = (acc[bucket] ?? 0) + toPositiveNumber(movement?.amount)
      return acc
    }, { operating: 0, stock: 0, investment: 0, withdrawals: 0, taxes: 0 })

    const expenseBreakdownRaw = Object.keys(EXPENSE_CLASSIFICATION_LABELS).map((key) => ({
      key,
      label: EXPENSE_CLASSIFICATION_LABELS[key],
      amount: Number(expenseBreakdownMap[key] || 0),
    }))

    const stockHistoryMap = safeEntries.reduce((acc, entry) => {
      const monthKey = getMonthKeyFromDateKey(entry?.dateKey)
      if (!monthKey) return acc
      const expenseMovements = Array.isArray(entry?.expenseMovements) ? entry.expenseMovements : []
      const monthStock = expenseMovements.reduce((sum, movement) => {
        if (classifyExpenseMovement(movement) !== 'stock') return sum
        return sum + toPositiveNumber(movement?.amount)
      }, 0)
      acc[monthKey] = (acc[monthKey] ?? 0) + monthStock
      return acc
    }, {})

    const currentStockPurchase = Number(expenseBreakdownMap.stock || 0)
    const avgPreviousStockBase = Object.entries(stockHistoryMap)
      .filter(([monthKey]) => toMonthComparable(monthKey) < monthComparable)
      .sort((a, b) => String(b[0]).localeCompare(String(a[0])))
      .slice(0, 3)
      .map(([, amount]) => Number(amount || 0))

    const avgPreviousStock = avgPreviousStockBase.length > 0
      ? avgPreviousStockBase.reduce((acc, value) => acc + value, 0) / avgPreviousStockBase.length
      : 0
    const stockCoverageAvailable = currentStockPurchase > 0 && avgPreviousStockBase.length >= 3 && avgPreviousStock > 0
    const stockCoverageMonths = stockCoverageAvailable ? currentStockPurchase / avgPreviousStock : null

    const busiestDays = safeRows
      .map(({ entry, readyPrintMetrics, summary }) => {
        const operational = entry?.operational && typeof entry.operational === 'object' ? entry.operational : {}
        const score =
          toPositiveNumber(operational.ordersTaken) +
          toPositiveNumber(operational.ordersDelivered) +
          toPositiveNumber(operational.paymentsRegistered) +
          toPositiveNumber(operational.productionActivity) +
          toPositiveNumber(readyPrintMetrics?.readyOrders) +
          toPositiveNumber(readyPrintMetrics?.printedBoxes) * 0.25

        return {
          dateKey: String(entry?.dateKey ?? ''),
          score,
          ordersTaken: toPositiveNumber(operational.ordersTaken),
          ordersDelivered: toPositiveNumber(operational.ordersDelivered),
          paymentsRegistered: toPositiveNumber(operational.paymentsRegistered),
          productionActivity: toPositiveNumber(operational.productionActivity),
          readyOrders: toPositiveNumber(readyPrintMetrics?.readyOrders),
          printedBoxes: toPositiveNumber(readyPrintMetrics?.printedBoxes),
          net: Number(summary?.incomeTotal || 0) - Number(summary?.expenseTotal || 0),
        }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 7)

    const weeklyNet = safeRows.reduce((acc, { entry, summary }) => {
      const day = Number(String(entry?.dateKey ?? '').slice(-2))
      const weekIndex = Number.isFinite(day) && day > 0 ? Math.ceil(day / 7) : 1
      const key = `Semana ${Math.min(Math.max(weekIndex, 1), 5)}`
      acc[key] = (acc[key] ?? 0) + (Number(summary?.incomeTotal || 0) - Number(summary?.expenseTotal || 0))
      return acc
    }, {})

    const weeklyNetRows = ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4', 'Semana 5']
      .map((label) => ({ label, net: Number(weeklyNet[label] || 0) }))

    const weeklyProduction = safeRows.reduce((acc, { entry, readyPrintMetrics }) => {
      const day = Number(String(entry?.dateKey ?? '').slice(-2))
      const weekIndex = Number.isFinite(day) && day > 0 ? Math.ceil(day / 7) : 1
      const key = `Semana ${Math.min(Math.max(weekIndex, 1), 5)}`
      acc[key] = (acc[key] ?? 0) + Number(readyPrintMetrics?.printedBoxes || 0)
      return acc
    }, {})

    const weeklyProductionRows = ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4', 'Semana 5']
      .map((label) => ({ label, production: Number(weeklyProduction[label] || 0) }))

    const totalIncome = Number(monthMetrics.totalIncome || 0)
    const totalExpense = Number(monthMetrics.totalExpense || 0)
    const totalNet = totalIncome - totalExpense
    const productionTotal = safeRows.reduce((acc, row) => acc + Number(row?.readyPrintMetrics?.printedBoxes || 0), 0)
    const activeDays = Number(monthMetrics.activeDays || 0)

    const safeOrders = Array.isArray(orders) ? orders : []
    const monthOrders = safeOrders.filter((order) => !order?.isSample && isDateKeyInMonth(toDateKey(order?.createdAt), selectedMonthKey))
    const prevMonthOrders = safeOrders.filter((order) => !order?.isSample && isDateKeyInMonth(toDateKey(order?.createdAt), prevMonthKey))
    const orderCount = monthOrders.length
    const prevOrderCount = prevMonthOrders.length

    const avgTicket = orderCount > 0 ? totalIncome / orderCount : 0
    const billingPerWorkedDay = activeDays > 0 ? totalIncome / activeDays : 0
    const productionPerWorkedDay = activeDays > 0 ? productionTotal / activeDays : 0
    const marginNetPercent = totalIncome > 0 ? (totalNet / totalIncome) * 100 : 0
    const liquidityDelta = Number(monthMetrics.lastRealTotal || 0) - Number(monthMetrics.firstOpeningTotal || 0)

    const expenseBreakdown = expenseBreakdownRaw.map((row) => ({
      ...row,
      percentOfExpense: totalExpense > 0 ? (Number(row.amount || 0) / totalExpense) * 100 : 0,
      percentOfIncome: totalIncome > 0 ? (Number(row.amount || 0) / totalIncome) * 100 : 0,
    }))

    const productionDayRows = safeRows
      .map((row) => ({
        dateKey: String(row?.entry?.dateKey ?? ''),
        printedBoxes: Number(row?.readyPrintMetrics?.printedBoxes || 0),
      }))
      .sort((a, b) => b.printedBoxes - a.printedBoxes)

    const peakProductionDay = productionDayRows[0] ?? { dateKey: '', printedBoxes: 0 }
    const lowProductionDay = [...productionDayRows]
      .filter((row) => row.printedBoxes > 0)
      .sort((a, b) => a.printedBoxes - b.printedBoxes)[0] ?? { dateKey: '', printedBoxes: 0 }

    const productionHoursTotal = safeRows.reduce((acc, row) => {
      const operational = row?.entry?.operational && typeof row.entry.operational === 'object' ? row.entry.operational : {}
      return acc + toPositiveNumber(operational.productionHours)
    }, 0)

    const productionPerHour = productionHoursTotal > 0 ? productionTotal / productionHoursTotal : 0
    const capacityInstalledBoxes = (() => {
      const raw = Number(import.meta.env.VITE_MACHINE_CAPACITY_BOXES || 0)
      return Number.isFinite(raw) && raw > 0 ? raw : 0
    })()
    const capacityUsagePercent = capacityInstalledBoxes > 0 ? (productionTotal / capacityInstalledBoxes) * 100 : 0

    const ordersByClientCurrent = monthOrders.reduce((acc, order) => {
      const key = normalizeClientKey(order?.clientName ?? order?.client)
      if (!key) return acc
      const amount = Number(getOrderFinancialSummary(order)?.finalTotal || order?.total || 0)
      const row = acc[key] ?? {
        clientKey: key,
        clientName: String(order?.clientName ?? order?.client ?? 'Sin cliente').trim() || 'Sin cliente',
        billed: 0,
        orders: 0,
      }
      row.billed += Math.max(amount, 0)
      row.orders += 1
      acc[key] = row
      return acc
    }, {})

    const ordersByClientPrev = prevMonthOrders.reduce((acc, order) => {
      const key = normalizeClientKey(order?.clientName ?? order?.client)
      if (!key) return acc
      const amount = Number(getOrderFinancialSummary(order)?.finalTotal || order?.total || 0)
      const row = acc[key] ?? {
        clientName: String(order?.clientName ?? order?.client ?? 'Sin cliente').trim() || 'Sin cliente',
        billed: 0,
        orders: 0,
      }
      row.billed += Math.max(amount, 0)
      row.orders += 1
      acc[key] = row
      return acc
    }, {})

    const top10Clients = Object.values(ordersByClientCurrent)
      .sort((a, b) => b.billed - a.billed)
      .slice(0, 10)
    const top5Billing = top10Clients.slice(0, 5).reduce((acc, row) => acc + Number(row?.billed || 0), 0)
    const top5SharePercent = totalIncome > 0 ? (top5Billing / totalIncome) * 100 : 0

    const historicalClients = safeOrders.reduce((acc, order) => {
      if (order?.isSample) return acc
      const clientKey = normalizeClientKey(order?.clientName ?? order?.client)
      if (!clientKey) return acc
      const monthKey = getMonthKeyFromDateKey(toDateKey(order?.createdAt))
      const row = acc[clientKey] ?? {
        clientName: String(order?.clientName ?? order?.client ?? 'Sin cliente').trim() || 'Sin cliente',
        months: new Set(),
      }
      if (monthKey) row.months.add(monthKey)
      acc[clientKey] = row
      return acc
    }, {})

    const currentClientKeys = new Set(Object.keys(ordersByClientCurrent))
    const previousClientKeys = new Set(Object.keys(ordersByClientPrev))
    const uniqueClientsCount = currentClientKeys.size
    const newClientsCount = [...currentClientKeys].filter((key) => {
      const row = historicalClients[key]
      if (!row) return false
      return ![...row.months].some((month) => toMonthComparable(month) < monthComparable)
    }).length
    const recurrentClientsCount = [...currentClientKeys].filter((key) => {
      const row = historicalClients[key]
      if (!row) return false
      return [...row.months].some((month) => toMonthComparable(month) < monthComparable)
    }).length

    const increasedClients = [...currentClientKeys]
      .filter((key) => Number(ordersByClientCurrent[key]?.billed || 0) > Number(ordersByClientPrev[key]?.billed || 0) * 1.1)
      .map((key) => ordersByClientCurrent[key]?.clientName)
      .filter(Boolean)
      .slice(0, 8)

    const churnedClients = [...previousClientKeys]
      .filter((key) => !currentClientKeys.has(key))
      .map((key) => ordersByClientPrev[key]?.clientName || historicalClients[key]?.clientName)
      .filter(Boolean)
      .slice(0, 8)

    const inactiveClients = Object.entries(historicalClients)
      .filter(([key, row]) => {
        if (currentClientKeys.has(key)) return false
        const lastMonth = [...row.months].sort((a, b) => String(b).localeCompare(String(a)))[0]
        if (!lastMonth) return false
        return toMonthComparable(lastMonth) < monthComparable
      })
      .map(([, row]) => row.clientName)
      .slice(0, 10)

    const cashSeries = safeRows
      .map(({ entry, summary }) => ({
        dateKey: String(entry?.dateKey ?? ''),
        income: Number(summary?.incomeTotal || 0),
        expense: Number(summary?.expenseTotal || 0),
        closing: Number(summary?.realFinal || 0),
      }))
      .sort((a, b) => String(a.dateKey).localeCompare(String(b.dateKey)))

    const cashFlowRows = cashSeries.reduce((acc, row) => {
      const previousAccumulated = acc.length > 0
        ? Number(acc[acc.length - 1]?.accumulated || 0)
        : Number(monthMetrics.firstOpeningTotal || 0)
      const accumulated = previousAccumulated + row.income - row.expense
      acc.push({ ...row, accumulated })
      return acc
    }, [])

    const closingValues = safeRows.map(({ summary }) => Number(summary?.realFinal || 0)).filter((v) => Number.isFinite(v))
    const maxCash = closingValues.length > 0 ? Math.max(...closingValues) : 0
    const minCash = closingValues.length > 0 ? Math.min(...closingValues) : 0
    const avgCash = closingValues.length > 0
      ? closingValues.reduce((acc, value) => acc + value, 0) / closingValues.length
      : 0

    const minRecommendedCash = Number(import.meta.env.VITE_MIN_RECOMMENDED_CASH || 500000)
    const daysBelowMinCash = cashSeries.filter((row) => Number(row?.closing || 0) < minRecommendedCash).length

    const unknownIncomeCount = Number(incomeTraceability.unlinkedCount || 0)
    const diffDays = safeRows.filter(({ summary }) => Math.abs(Number(summary?.difference || 0)) > 1).length
    const highDiffDays = safeRows.filter(({ summary }) => Math.abs(Number(summary?.difference || 0)) > 5000).length
    const topClientShare = totalIncome > 0 && topClients.length > 0
      ? (Number(topClients[0]?.amount || 0) / totalIncome) * 100
      : 0
    const partnerDominance = totalExpense > 0 && actorExpenses.length > 0
      ? (Number(actorExpenses[0]?.amount || 0) / totalExpense) * 100
      : 0

    const riskSignals = []
    if (highDiffDays > 0) riskSignals.push(`Hay ${highDiffDays} día(s) con diferencia de caja mayor a ${formatCurrency(5000)}.`)
    if (unknownIncomeCount > 0) riskSignals.push(`Hay ${unknownIncomeCount} ingreso(s) sin pedido/cliente vinculado.`)
    if (topClientShare > 35) riskSignals.push(`Alta concentración de cobros: ${topClients[0]?.clientName} representa ${topClientShare.toFixed(1)}% de ingresos del mes.`)
    if (partnerDominance > 70) riskSignals.push(`Egresos concentrados en una sola responsabilidad (${actorExpenses[0]?.actor} con ${partnerDominance.toFixed(1)}%).`)
    if (top5SharePercent > 30) riskSignals.push(`Los cinco principales clientes concentran ${top5SharePercent.toFixed(1)}% de la facturación del mes.`)

    if (Number(expenseBreakdownMap.withdrawals || 0) > 0 && totalExpense > 0) {
      const withdrawalsPct = (Number(expenseBreakdownMap.withdrawals || 0) / totalExpense) * 100
      if (withdrawalsPct >= 10) {
        riskSignals.push(`Los retiros representan ${withdrawalsPct.toFixed(1)}% de los egresos.`)
      }
    }

    if (daysBelowMinCash > 0) riskSignals.push(`La caja estuvo por debajo del mínimo recomendado en ${daysBelowMinCash} día(s).`)
    if (weeklyNetRows[weeklyNetRows.length - 1]?.net < 0) riskSignals.push('La caja neta cayó durante la última semana del mes.')
    if (diffDays === 0) riskSignals.push('Control de caja estable: no hubo diferencias relevantes entre esperado y real.')

    const comparison = {
      billing: { current: totalIncome, previous: prevIncomeTotal, ...percentageChange(totalIncome, prevIncomeTotal) },
      expenses: { current: totalExpense, previous: prevExpenseTotal, ...percentageChange(totalExpense, prevExpenseTotal) },
      result: { current: totalNet, previous: prevNetTotal, ...percentageChange(totalNet, prevNetTotal) },
      production: { current: productionTotal, previous: prevProductionBoxes, ...percentageChange(productionTotal, prevProductionBoxes) },
      orders: { current: orderCount, previous: prevOrderCount, ...percentageChange(orderCount, prevOrderCount) },
    }

    const fixedCosts = Number(import.meta.env.VITE_FIXED_COSTS_MONTHLY || 0)
    const contributionMarginRatio = Number(import.meta.env.VITE_CONTRIBUTION_MARGIN_RATIO || 0)
    const variableCostRatio = Number(import.meta.env.VITE_VARIABLE_COST_RATIO || 0)
    const hasBreakEvenData = fixedCosts > 0 && contributionMarginRatio > 0 && contributionMarginRatio < 1

    const breakEven = hasBreakEvenData
      ? {
        available: true,
        point: fixedCosts / contributionMarginRatio,
        billing: totalIncome,
        diff: totalIncome - (fixedCosts / contributionMarginRatio),
        pctOver: (totalIncome / (fixedCosts / contributionMarginRatio) - 1) * 100,
        fixedCosts,
        contributionMarginRatio,
        variableCostRatio: variableCostRatio > 0 ? variableCostRatio : null,
      }
      : {
        available: false,
        reason: 'Sin datos suficientes de costos fijos y margen de contribución.',
      }

    const withdrawalsAmount = Number(expenseBreakdownMap.withdrawals || 0)
    const operatingAmount = Number(expenseBreakdownMap.operating || 0)
    const stockAmount = Number(expenseBreakdownMap.stock || 0)
    const taxAmount = Number(expenseBreakdownMap.taxes || 0)
    const investmentAmount = Number(expenseBreakdownMap.investment || 0)
    const otherCashOut = Math.max(totalExpense - operatingAmount - stockAmount - withdrawalsAmount - taxAmount - investmentAmount, 0)
    const cashPotential = Number(monthMetrics.lastRealTotal || 0) + withdrawalsAmount
    const reinvestedPercent = totalIncome > 0 ? (stockAmount / totalIncome) * 100 : 0

    const cashImpact = {
      opening: Number(monthMetrics.firstOpeningTotal || 0),
      income: totalIncome,
      operatingOut: operatingAmount,
      stockOut: stockAmount,
      withdrawalsOut: withdrawalsAmount,
      taxOut: taxAmount,
      investmentOut: investmentAmount,
      otherOut: otherCashOut,
      final: Number(monthMetrics.lastRealTotal || 0),
      potentialFinal: cashPotential,
      liquidityDelta,
      realOutflow: {
        businessOperation: operatingAmount + taxAmount,
        growth: stockAmount + investmentAmount,
        personal: withdrawalsAmount,
      },
      reinvestedPercent,
    }

    const withdrawalsImpact = {
      amount: withdrawalsAmount,
      pctOfExpense: totalExpense > 0 ? (withdrawalsAmount / totalExpense) * 100 : 0,
      pctOfIncome: totalIncome > 0 ? (withdrawalsAmount / totalIncome) * 100 : 0,
      liquidityImpactText: withdrawalsAmount > 0
        ? `Los retiros redujeron la liquidez operativa en ${formatCurrency(withdrawalsAmount)} durante el mes.`
        : '',
    }

    const profitabilityVsLiquidity = {
      profitabilityLabel: totalNet >= 0 ? 'Rentable' : 'No rentable en el período',
      liquidityLabel: liquidityDelta >= 0 ? 'Liquidez en mejora' : 'Liquidez en descenso',
      explanation: (() => {
        if (totalNet >= 0 && liquidityDelta < 0) {
          return 'La empresa fue rentable, pero la liquidez cayó por salidas de caja vinculadas a stock, inversiones o retiros.'
        }
        if (totalNet < 0 && liquidityDelta >= 0) {
          return 'El resultado mensual fue negativo, pero la liquidez se sostuvo por nivel de cobros y control de egresos en caja.'
        }
        if (totalNet >= 0 && liquidityDelta >= 0) {
          return 'Rentabilidad y liquidez evolucionaron positivamente durante el período.'
        }
        return 'Rentabilidad y liquidez estuvieron bajo presión; conviene priorizar recuperación de margen y caja operativa.'
      })(),
    }

    const recommendations = []
    if (unknownIncomeCount > 0) recommendations.push('Conviene asociar todos los cobros a clientes/pedidos para mejorar trazabilidad y calidad de análisis.')
    if (currentStockPurchase > totalExpense * 0.25) recommendations.push('Se observó inversión fuerte en stock; el resultado del mes puede verse presionado, pero parte del desembolso sostiene producción futura.')
    if (top5SharePercent > 35) recommendations.push('Existe concentración comercial en pocos clientes; conviene diversificar cartera para bajar riesgo de dependencia.')
    if (daysBelowMinCash > 0) recommendations.push('Se recomienda fijar un mínimo operativo de caja y planificar egresos para evitar tensión financiera en días críticos.')
    if (marginNetPercent < 5) recommendations.push('El margen neto es ajustado; revisar estructura de egresos y política de precios para mejorar rentabilidad.')
    if (productionTotal > 0 && capacityInstalledBoxes > 0 && capacityUsagePercent < 60) recommendations.push('Hay capacidad productiva ociosa; existe margen para crecer en volumen sin subir costos fijos en la misma proporción.')
    if (recommendations.length < 5) {
      recommendations.push('Mantener seguimiento semanal de caja neta ayuda a anticipar desvíos antes del cierre mensual.')
      recommendations.push('Comparar ticket promedio por cliente permite detectar oportunidades de upselling y cross-selling.')
    }

    const scoreBreakdown = [
      {
        label: 'Crecimiento de ventas',
        points: comparison.billing.direction === 'up'
          ? Math.min(20, comparison.billing.value / 2)
          : Math.max(-8, -comparison.billing.value / 4),
      },
      {
        label: 'Producción',
        points: comparison.production.direction === 'up'
          ? Math.min(15, comparison.production.value / 2.6)
          : Math.max(-6, -comparison.production.value / 5),
      },
      {
        label: 'Clientes recurrentes',
        points: uniqueClientsCount > 0 ? Math.min(12, (recurrentClientsCount / uniqueClientsCount) * 12) : 0,
      },
      {
        label: 'Cobranza vinculada',
        points: totalIncome > 0
          ? Math.max(-8, 12 - (unknownIncomeCount / Math.max(incomes.length, 1)) * 22)
          : 0,
      },
      {
        label: 'Rentabilidad',
        points: Math.max(-10, Math.min(16, marginNetPercent * 1.4)),
      },
      {
        label: 'Liquidez de caja',
        points: Math.max(-10, 12 - daysBelowMinCash * 2 - highDiffDays * 2),
      },
      {
        label: 'Concentración comercial',
        points: top5SharePercent > 30 ? -Math.min(8, (top5SharePercent - 30) / 1.5) : 4,
      },
    ].map((item) => ({
      ...item,
      points: Number(item.points.toFixed(1)),
    }))

    const scoreRaw = 55 + scoreBreakdown.reduce((acc, row) => acc + Number(row.points || 0), 0)

    const scoreValue = Math.max(0, Math.min(100, Math.round(scoreRaw)))
    const scoreLabel = scoreValue >= 85 ? 'Excelente' : scoreValue >= 65 ? 'Bueno' : 'Requiere atención'
    const scoreColor = scoreValue >= 85 ? 'green' : scoreValue >= 65 ? 'yellow' : 'red'

    const historicalByMonthMap = safeEntries.reduce((acc, entry) => {
      const monthKey = getMonthKeyFromDateKey(entry?.dateKey)
      if (!monthKey) return acc

      const summary = buildDaySummary(entry)
      const boxes = Number(buildReadyPrintMetrics(entry?.dateKey, orders)?.printedBoxes || 0)
      const row = acc[monthKey] ?? { monthKey, billing: 0, profit: 0, production: 0, lastDateKey: '', finalCash: 0 }
      row.billing += Number(summary?.incomeTotal || 0)
      row.profit += Number(summary?.incomeTotal || 0) - Number(summary?.expenseTotal || 0)
      row.production += boxes
      if (String(entry?.dateKey ?? '').localeCompare(String(row.lastDateKey ?? '')) > 0) {
        row.lastDateKey = String(entry?.dateKey ?? '')
        row.finalCash = Number(summary?.realFinal || 0)
      }
      acc[monthKey] = row
      return acc
    }, {})

    const historical12Months = Object.values(historicalByMonthMap)
      .sort((a, b) => String(a.monthKey).localeCompare(String(b.monthKey)))
      .slice(-12)

    const smartInsights = (() => {
      if (totalNet < 0 && stockAmount > totalExpense * 0.3) {
        return [
          `Junio mostró una inversión fuerte en materia prima (${formatCurrency(stockAmount)}), que representó ${((stockAmount / Math.max(totalExpense, 1)) * 100).toFixed(1)}% de los egresos.`,
          'Aunque el resultado mensual fue negativo, una parte relevante de la salida de dinero corresponde a abastecimiento para producción futura.',
        ]
      }

      if (withdrawalsAmount > 0 && liquidityDelta < 0) {
        return [
          `La actividad comercial se mantuvo, pero la liquidez bajó por retiros de socios (${formatCurrency(withdrawalsAmount)}) y egresos del período.`,
          'Este comportamiento no implica una crítica: muestra el efecto financiero de decisiones de retiro sobre la caja disponible.',
        ]
      }

      if (totalNet >= 0 && liquidityDelta >= 0) {
        return [
          'El mes combinó rentabilidad y mejora de liquidez, lo que fortalece la capacidad de operación y crecimiento.',
          'La recomendación es sostener disciplina de cobro y priorizar reinversión con criterios de retorno.',
        ]
      }

      return [
        'El resultado mensual y la caja mostraron señales mixtas; conviene priorizar decisiones que mejoren margen y velocidad de cobro.',
        'Separar egresos operativos de inversión permite tomar decisiones más precisas para el próximo mes.',
      ]
    })()

    const datoDelMes = (() => {
      if (totalNet < 0 && currentStockPurchase > totalExpense * 0.25) {
        return `Aunque el resultado contable del mes fue ${formatCurrency(totalNet)}, hubo compras relevantes de stock e insumos (${formatCurrency(currentStockPurchase)}), lo que puede fortalecer la operación de los próximos meses.`
      }
      if (top5SharePercent > 35) {
        return `El dato del mes es la concentración comercial: los 5 principales clientes explican ${top5SharePercent.toFixed(1)}% de la facturación.`
      }
      if (marginNetPercent >= 10) {
        return `El dato del mes es la rentabilidad: margen neto de ${marginNetPercent.toFixed(1)}%, con resultado positivo de ${formatCurrency(totalNet)}.`
      }
      return `El dato del mes: facturación ${formatCurrency(totalIncome)} con resultado neto ${formatCurrency(totalNet)} y ${orderCount} pedidos registrados.`
    })()

    const dailyRows = safeRows.map(({ entry, summary, status, readyPrintMetrics }) => ({
      dateKey: String(entry?.dateKey ?? ''),
      status: String(status?.label ?? ''),
      readyOrders: Number(readyPrintMetrics?.readyOrders || 0),
      printedBoxes: Number(readyPrintMetrics?.printedBoxes || 0),
      openingTotal: Number(summary?.openingTotal || 0),
      incomeTotal: Number(summary?.incomeTotal || 0),
      expenseTotal: Number(summary?.expenseTotal || 0),
      expectedFinal: Number(summary?.expectedFinal || 0),
      realFinal: Number(summary?.realFinal || 0),
      difference: Number(summary?.difference || 0),
    }))

    return {
      totalIncome,
      totalExpense,
      totalNet,
      diffDays,
      highDiffDays,
      unknownIncomeCount,
      comparison,
      ticketAverage: avgTicket,
      ordersCount: orderCount,
      billingPerWorkedDay,
      productionTotal,
      productionPerWorkedDay,
      marginNetPercent,
      productionHoursTotal,
      productionPerHour,
      capacityInstalledBoxes,
      capacityUsagePercent,
      peakProductionDay,
      lowProductionDay,
      weeklyProductionRows,
      uniqueClientsCount,
      newClientsCount,
      recurrentClientsCount,
      top10Clients,
      top5SharePercent,
      increasedClients,
      churnedClients,
      inactiveClients,
      incomeTraceability: {
        linkedCount: incomeTraceability.linkedCount,
        linkedAmount: incomeTraceability.linkedAmount,
        unlinkedCount: incomeTraceability.unlinkedCount,
        unlinkedAmount: incomeTraceability.unlinkedAmount,
        unlinkedConcepts: unlinkedIncomeConcepts,
      },
      expenseTraceability: {
        withSupplierCount: expenseTraceabilityRaw.withSupplierCount,
        withSupplierAmount: expenseTraceabilityRaw.withSupplierAmount,
        withoutSupplierCount: expenseTraceabilityRaw.withoutSupplierCount,
        withoutSupplierAmount: expenseTraceabilityRaw.withoutSupplierAmount,
        topSuppliers,
        withoutSupplierConcepts: unlinkedExpenseConcepts,
      },
      topClients,
      incomeByFund,
      expenseByFund,
      expenseBreakdown,
      stockPurchaseAmount: currentStockPurchase,
      stockCoverageMonths,
      actorExpenses,
      categoryExpenses,
      biggestExpenses,
      busiestDays,
      weeklyNetRows,
      cashFlowRows,
      cashIndicators: {
        maxCash,
        minCash,
        avgCash,
        minRecommendedCash,
        daysBelowMinCash,
      },
      breakEven,
      riskSignals,
      recommendations: recommendations.slice(0, 10),
      smartInsights,
      packyaScore: {
        value: scoreValue,
        label: scoreLabel,
        color: scoreColor,
        breakdown: scoreBreakdown,
      },
      profitabilityVsLiquidity,
      cashImpact,
      withdrawalsImpact,
      reinvestmentKpi: {
        billing: totalIncome,
        stockPurchase: stockAmount,
        reinvestedPercent,
      },
      historical12Months,
      datoDelMes,
      dailyRows,
    }
  }, [monthDailyRows, monthMetrics.activeDays, monthMetrics.firstOpeningTotal, monthMetrics.lastRealTotal, monthMetrics.totalExpense, monthMetrics.totalIncome, orders, safeEntries, selectedMonthKey])

  const selectedDayFundRows = useMemo(
    () => FUND_OPTIONS.map((fund) => ({
      ...fund,
      opening: selectedSummary.openingByFund[fund.id],
      income: selectedSummary.incomeByFund[fund.id],
      expense: selectedSummary.expenseByFund[fund.id],
      expected: selectedSummary.expectedByFund[fund.id],
      closing: selectedSummary.closingByFund[fund.id],
    })),
    [selectedSummary],
  )

  const orderCatalog = useMemo(
    () => (Array.isArray(orders) ? orders : [])
      .filter((order) => !order?.isSample)
      .sort((a, b) => String(b?.createdAt ?? '').localeCompare(String(a?.createdAt ?? '')))
      .map((order) => {
        const orderId = String(order?.id ?? '').trim()
        const clientName = String(order?.clientName ?? order?.client ?? '').trim() || 'Sin cliente'
        const dateLabel = formatShortDate(toDateKey(order?.createdAt))
        const remainingDebt = Number(getOrderFinancialSummary(order)?.remainingDebt || 0)
        const displayOrderId = formatOrderId(orderId || 'PED')

        const searchText = normalizeSearchText([
          orderId,
          displayOrderId,
          clientName,
          dateLabel,
        ].join(' '))

        return {
          value: orderId,
          label: `${clientName} · ${displayOrderId} · ${dateLabel}`,
          clientName,
          remainingDebt,
          searchText,
        }
      }),
    [orders],
  )

  const orderById = useMemo(
    () => orderCatalog.reduce((acc, option) => {
      acc[String(option.value)] = option
      return acc
    }, {}),
    [orderCatalog],
  )

  const pendingLinkedIncomeMovements = useMemo(() => {
    const incomeMovements = Array.isArray(selectedEntry?.incomeMovements) ? selectedEntry.incomeMovements : []

    return incomeMovements
      .filter((movement) => {
        const linkedOrderId = String(movement?.linkedOrderId ?? '').trim()
        const amount = toPositiveNumber(movement?.amount)
        const linkedOrderPaymentId = String(movement?.linkedOrderPaymentId ?? '').trim()
        return Boolean(linkedOrderId && amount > 0 && !linkedOrderPaymentId)
      })
      .map((movement) => {
        const linkedOrderId = String(movement?.linkedOrderId ?? '').trim()
        const orderSummary = orderById[linkedOrderId]
        return {
          movement,
          linkedOrderId,
          clientName: String(orderSummary?.clientName ?? '').trim() || 'Sin cliente',
          remainingDebt: Number(orderSummary?.remainingDebt || 0),
        }
      })
  }, [orderById, selectedEntry])

  const syncPendingLinkedIncomesToOrders = async ({ silentIfEmpty = false } = {}) => {
    if (typeof onApplyLinkedIncomeToOrder !== 'function') {
      return { appliedCount: 0, warnings: ['No hay sincronizador de cobros configurado.'] }
    }

    if (pendingLinkedIncomeMovements.length === 0) {
      if (!silentIfEmpty) {
        await appAlert('No hay cobros pendientes para aplicar a pedidos en este día.')
      }
      return { appliedCount: 0, warnings: [] }
    }

    const appliedByMovementId = {}
    const warnings = []

    pendingLinkedIncomeMovements.forEach((row) => {
      const result = onApplyLinkedIncomeToOrder({
        dateKey: selectedDateKey,
        movement: row.movement,
      })

      if (result?.ok) {
        appliedByMovementId[String(row.movement.id)] = {
          paymentId: String(result.paymentId ?? '').trim(),
          wasCapped: Boolean(result.wasCapped),
          cappedAmount: Number(result.cappedAmount || 0),
          appliedAmount: Number(result.appliedAmount || 0),
          orderId: String(result.orderId ?? row.linkedOrderId),
        }
      } else {
        const fallbackOrder = row.linkedOrderId ? formatOrderId(row.linkedOrderId) : 'pedido sin identificar'
        warnings.push(String(result?.message ?? `No se pudo aplicar el cobro de ${fallbackOrder}.`))
      }
    })

    const appliedIds = Object.keys(appliedByMovementId)
    if (appliedIds.length > 0) {
      updateEntry((current) => ({
        ...current,
        incomeMovements: (Array.isArray(current?.incomeMovements) ? current.incomeMovements : []).map((movement) => {
          const syncRow = appliedByMovementId[String(movement?.id ?? '')]
          if (!syncRow) return movement

          const currentNote = String(movement?.note ?? '').trim()
          const cappedSuffix = syncRow.wasCapped
            ? ` · Ajustado por deuda restante (${formatCurrency(syncRow.appliedAmount)} aplicado, ${formatCurrency(syncRow.cappedAmount)} no imputado).`
            : ''

          return {
            ...movement,
            linkedOrderPaymentId: syncRow.paymentId,
            sourceType: 'daily-panel',
            note: `${currentNote}${cappedSuffix}`.trim(),
          }
        }),
      }))
    }

    const cappedRows = Object.values(appliedByMovementId).filter((row) => row.wasCapped)
    if (cappedRows.length > 0) {
      warnings.push(
        `${cappedRows.length} cobro(s) se ajustaron al saldo pendiente del pedido para evitar sobreimputaciones.`,
      )
    }

    if (!silentIfEmpty) {
      const summaryLines = [
        `Cobros aplicados: ${appliedIds.length}`,
        ...(warnings.length > 0 ? ['', 'Observaciones:', ...warnings.map((item) => `- ${item}`)] : []),
      ]
      await appAlert(summaryLines.join('\n'))
    }

    return { appliedCount: appliedIds.length, warnings }
  }

  const supplierCatalog = useMemo(
    () => (Array.isArray(suppliers) ? suppliers : [])
      .map((supplier) => ({
        id: String(supplier?.id ?? ''),
        name: normalizeSupplierName(supplier?.name),
      }))
      .filter((supplier) => supplier.name)
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })),
    [suppliers],
  )

  const supplierNameMap = useMemo(
    () => supplierCatalog.reduce((acc, supplier) => {
      acc[normalizeSearchText(supplier.name)] = supplier.name
      return acc
    }, {}),
    [supplierCatalog],
  )

  const handleSelectDate = (dateKey) => {
    if (!dateKey) return
    setSelectedDateKey(dateKey)
    setSelectedMonthKey(getMonthKeyFromDateKey(dateKey))
  }

  const buildInitialEntry = (dateKey) => {
    const previousDateKey = getPreviousDateKey(dateKey)
    const previousEntry = typeof getDailyPanelEntry === 'function'
      ? getDailyPanelEntry(previousDateKey)
      : entriesByDate[previousDateKey]

    const previousClosing = previousEntry?.closingBalances ?? {}
    const openingBalances = DAILY_PANEL_FUND_KEYS.reduce((acc, fundId) => {
      acc[fundId] = toPositiveNumber(previousClosing[fundId])
      return acc
    }, {})

    const suggestions = buildSystemSuggestions(dateKey, orders, purchases, expenses)

    return {
      dateKey,
      openingBalances,
      closingBalances: { ...openingBalances },
      incomeMovements: suggestions.incomeMovements,
      expenseMovements: suggestions.expenseMovements,
      operational: suggestions.operational,
      notes: '',
      openingNote: previousEntry?.isClosed
        ? `Apertura sugerida desde cierre del ${formatShortDate(previousDateKey)}.`
        : 'Apertura manual del día.',
      closingNote: '',
      isClosed: false,
      openedAt: new Date().toISOString(),
      closedAt: '',
    }
  }

  const updateEntry = (updater) => {
    if (!selectedDateKey) return null

    return upsertDailyPanelEntry(selectedDateKey, (current) => {
      if (!current) return buildInitialEntry(selectedDateKey)
      return typeof updater === 'function' ? updater(current) : current
    })
  }

  const updateBalanceField = (group, field, value) => {
    const safeValue = toPositiveNumber(value)

    updateEntry((current) => ({
      ...current,
      [group]: {
        ...(current?.[group] ?? {}),
        [field]: safeValue,
      },
      isClosed: false,
      closedAt: '',
    }))
  }

  const updateTextField = (field, value) => {
    updateEntry((current) => ({
      ...current,
      [field]: String(value ?? ''),
      isClosed: false,
      closedAt: '',
    }))
  }

  const updateOperationalField = (field, value) => {
    const safeValue = Math.max(Math.trunc(toSafeNumber(value)), 0)

    updateEntry((current) => ({
      ...current,
      operational: {
        ...(current?.operational ?? {}),
        [field]: safeValue,
      },
      isClosed: false,
      closedAt: '',
    }))
  }

  const updateMovementField = (type, movementId, field, value) => {
    const listKey = type === 'income' ? 'incomeMovements' : 'expenseMovements'

    updateEntry((current) => ({
      ...current,
      [listKey]: (Array.isArray(current?.[listKey]) ? current[listKey] : []).map((movement) => {
        if (String(movement?.id) !== String(movementId)) return movement

        if (field === 'amount') {
          return {
            ...movement,
            amount: toPositiveNumber(value),
          }
        }

        if (field === 'fundId') {
          return {
            ...movement,
            fundId: normalizeFundId(value),
          }
        }

        if (field === 'actor') {
          return {
            ...movement,
            actor: normalizeActor(value),
          }
        }

        if (field === 'linkedOrderId') {
          const nextLinkedOrderId = String(value ?? '').trim()
          return {
            ...movement,
            linkedOrderId: nextLinkedOrderId,
            unlinkReason: nextLinkedOrderId ? '' : String(movement?.unlinkReason ?? ''),
          }
        }

        return {
          ...movement,
          [field]: String(value ?? ''),
        }
      }),
      isClosed: false,
      closedAt: '',
    }))
  }

  const addMovement = (type) => {
    const listKey = type === 'income' ? 'incomeMovements' : 'expenseMovements'

    updateEntry((current) => {
      const currentMovements = Array.isArray(current?.[listKey]) ? current[listKey] : []
      return {
        ...current,
        [listKey]: [
          ...currentMovements.map((movement) => ({
            ...movement,
            isCompact: true,
          })),
          getDefaultMovement(type),
        ],
        isClosed: false,
        closedAt: '',
      }
    })
  }

  const removeMovement = (type, movementId) => {
    const listKey = type === 'income' ? 'incomeMovements' : 'expenseMovements'

    updateEntry((current) => ({
      ...current,
      [listKey]: (Array.isArray(current?.[listKey]) ? current[listKey] : []).filter(
        (movement) => String(movement?.id) !== String(movementId),
      ),
      isClosed: false,
      closedAt: '',
    }))

    setOrderSearchByMovementId((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, movementId)) return prev
      const next = { ...prev }
      delete next[movementId]
      return next
    })

    setPendingLinkByMovementId((prev) => {
      if (!Object.prototype.hasOwnProperty.call(prev, movementId)) return prev
      const next = { ...prev }
      delete next[movementId]
      return next
    })
  }

  const handleSaveSupplierFromMovement = async (movementId, rawName) => {
    const supplierName = normalizeSupplierName(rawName)
    if (!supplierName) {
      await appAlert('Escribí el nombre del proveedor antes de guardarlo.')
      return
    }

    const normalizedKey = normalizeSearchText(supplierName)
    const existingName = supplierNameMap[normalizedKey]
    if (existingName) {
      updateMovementField('expense', movementId, 'supplierName', existingName)
      return
    }

    let finalName = supplierName
    if (typeof onSaveSupplier === 'function') {
      const saved = onSaveSupplier({ name: supplierName })
      finalName = normalizeSupplierName(saved?.name) || supplierName
    }

    updateMovementField('expense', movementId, 'supplierName', finalName)
    await appAlert(`Proveedor guardado: ${finalName}`)
  }

  const toggleMovementCompact = (type, movementId, compactValue) => {
    const listKey = type === 'income' ? 'incomeMovements' : 'expenseMovements'

    updateEntry((current) => ({
      ...current,
      [listKey]: (Array.isArray(current?.[listKey]) ? current[listKey] : []).map((movement) => {
        if (String(movement?.id) !== String(movementId)) return movement
        return {
          ...movement,
          isCompact: Boolean(compactValue),
        }
      }),
      isClosed: false,
      closedAt: '',
    }))
  }

  const toggleAllMovementsCompact = (type, compactValue) => {
    const listKey = type === 'income' ? 'incomeMovements' : 'expenseMovements'

    updateEntry((current) => ({
      ...current,
      [listKey]: (Array.isArray(current?.[listKey]) ? current[listKey] : []).map((movement) => ({
        ...movement,
        isCompact: Boolean(compactValue),
      })),
      isClosed: false,
      closedAt: '',
    }))
  }

  const handleStartDay = async () => {
    if (selectedEntry) return

    const confirmed = await appConfirm(
      `¿Querés iniciar ${formatLongDate(selectedDateKey)} con apertura sugerida y movimientos detectados del sistema?`,
      'Iniciar día',
      'Cancelar',
    )
    if (!confirmed) return

    upsertDailyPanelEntry(selectedDateKey, buildInitialEntry(selectedDateKey))
  }

  const handleRefreshSuggestions = async () => {
    const confirmed = await appConfirm(
      'Se sumarán movimientos sugeridos desde pedidos, compras y gastos sin borrar lo que ya anotaste manualmente. ¿Continuar?',
      'Actualizar sugerencias',
      'Cancelar',
    )

    if (!confirmed) return

    const suggestions = buildSystemSuggestions(selectedDateKey, orders, purchases, expenses)

    updateEntry((current) => {
      const currentIncome = Array.isArray(current?.incomeMovements) ? current.incomeMovements : []
      const currentExpense = Array.isArray(current?.expenseMovements) ? current.expenseMovements : []

      const incomeFingerprints = new Set(
        currentIncome.map(
          (movement) => `${movement.concept}|${movement.amount}|${movement.category}|${movement.origin}`,
        ),
      )
      const expenseFingerprints = new Set(
        currentExpense.map(
          (movement) => `${movement.concept}|${movement.amount}|${movement.category}|${movement.origin}`,
        ),
      )

      return {
        ...current,
        incomeMovements: [
          ...currentIncome,
          ...suggestions.incomeMovements
            .filter(
              (movement) =>
                !incomeFingerprints.has(
                  `${movement.concept}|${movement.amount}|${movement.category}|${movement.origin}`,
                ),
            )
            .map((movement) => ({ ...movement, id: makeMovementId('INC') })),
        ],
        expenseMovements: [
          ...currentExpense,
          ...suggestions.expenseMovements
            .filter(
              (movement) =>
                !expenseFingerprints.has(
                  `${movement.concept}|${movement.amount}|${movement.category}|${movement.origin}`,
                ),
            )
            .map((movement) => ({ ...movement, id: makeMovementId('EXP') })),
        ],
        operational: {
          ...suggestions.operational,
        },
        isClosed: false,
        closedAt: '',
      }
    })

    await appAlert('Sugerencias aplicadas. Todo sigue siendo editable manualmente.')
  }

  const applyExpectedClosing = async () => {
    if (!selectedEntry) return

    const confirmed = await appConfirm(
      'Se copiará el cierre esperado calculado a los saldos finales del día. Después podés ajustar cualquier fondo manualmente.',
      'Copiar esperado al cierre',
      'Cancelar',
    )
    if (!confirmed) return

    updateEntry((current) => {
      const summary = buildDaySummary(current)
      return {
        ...current,
        closingBalances: { ...summary.expectedByFund },
        isClosed: false,
        closedAt: '',
      }
    })
  }

  const handleToggleCloseDay = async () => {
    if (!selectedEntry) return

    if (selectedEntry.isClosed) {
      updateEntry((current) => ({
        ...current,
        isClosed: false,
        closedAt: '',
      }))
      return
    }

    const closeIssues = validateMovementsForClose(selectedEntry, {
      validOrderIds: new Set(orderCatalog.map((option) => String(option?.value ?? ''))),
    })
    if (closeIssues.length > 0) {
      await appAlert(`No se puede cerrar el día todavía:\n\n- ${closeIssues.slice(0, 8).join('\n- ')}`)
      return
    }

    if (pendingLinkedIncomeMovements.length > 0 && typeof onApplyLinkedIncomeToOrder === 'function') {
      const shouldSyncBeforeClose = await appConfirm(
        `Hay ${pendingLinkedIncomeMovements.length} cobro(s) vinculados a pedidos todavía no aplicados en la deuda. ¿Querés aplicarlos ahora antes del cierre?`,
        'Aplicar y cerrar',
        'Cerrar sin aplicar',
      )

      if (shouldSyncBeforeClose) {
        await syncPendingLinkedIncomesToOrders({ silentIfEmpty: true })
      }
    }

    let shouldPrefillClosing = false
    if (selectedSummary.realFinal <= 0 && selectedSummary.expectedFinal > 0) {
      shouldPrefillClosing = await appConfirm(
        'Todavía no cargaste saldos finales. ¿Querés copiar primero el cierre esperado como base?',
        'Copiar y cerrar',
        'Cerrar igual',
      )
    }

    updateEntry((current) => {
      const summary = buildDaySummary(current)
      return {
        ...current,
        closingBalances: shouldPrefillClosing ? { ...summary.expectedByFund } : current.closingBalances,
        isClosed: true,
        closedAt: new Date().toISOString(),
      }
    })
  }

  const handlePrintMonth = async () => {
    if (monthDailyRows.length === 0) {
      await appAlert(`No hay días iniciados en ${formatMonthLabel(selectedMonthKey)} para generar el informe.`)
      return
    }

    try {
      generateDailyPanelMonthlyReportPDF({
        monthKey: selectedMonthKey,
        monthLabel: formatMonthLabel(selectedMonthKey),
        generatedAt: new Date().toISOString(),
        openingFirst: Number(monthMetrics.firstOpeningTotal || 0),
        closingLast: Number(monthMetrics.lastRealTotal || 0),
        closedDays: Number(monthMetrics.closedDays || 0),
        openDays: Number(monthMetrics.openDays || 0),
        closedWithDifferenceDays: Number(monthMetrics.closedWithDifferenceDays || 0),
        ...monthReportAnalytics,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await appAlert(`No se pudo generar el informe mensual en PDF: ${message}`)
    }
  }

  const renderMovementBlock = (type, title, movements) => {
    const safeMovements = Array.isArray(movements) ? movements : []
    const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
    const isIncome = type === 'income'
    const compactCount = safeMovements.filter((movement) => movement?.isCompact).length
    const openCount = Math.max(safeMovements.length - compactCount, 0)

    return (
      <article className="card-block daily-panel-block">
        <div className="card-head daily-panel-card-head-with-action">
          <div>
            <h3>{title}</h3>
            <p className="daily-panel-card-subtitle">Todo lo que entra o sale del día, aunque después exista en otro módulo.</p>
            <p className="daily-panel-movement-counters">
              {String(safeMovements.length)} registros · {String(openCount)} abiertos · {String(compactCount)} compactos
            </p>
          </div>
          <div className="daily-panel-card-head-actions">
            {openCount > 0 && (
              <button
                type="button"
                className="secondary-btn daily-panel-print-hide"
                onClick={() => toggleAllMovementsCompact(type, true)}
              >
                Aceptar todos
              </button>
            )}
            {compactCount > 0 && (
              <button
                type="button"
                className="secondary-btn daily-panel-print-hide"
                onClick={() => toggleAllMovementsCompact(type, false)}
              >
                Abrir todos
              </button>
            )}
            <button type="button" className="secondary-btn daily-panel-print-hide" onClick={() => addMovement(type)}>
              + Agregar
            </button>
          </div>
        </div>

        {safeMovements.length === 0 && (
          <div className="daily-panel-inline-empty">
            <p>No hay movimientos cargados todavía.</p>
          </div>
        )}

        <div className="daily-panel-movements-list">
          {safeMovements.map((movement, index) => (
            <div key={movement.id} className="daily-panel-movement-row">
              {(() => {
                const linkedOrderId = String(movement?.linkedOrderId ?? '').trim()
                const linkedOrder = isIncome ? orderById[linkedOrderId] : null
                const linkedClientName = String(linkedOrder?.clientName ?? '').trim()
                const linkedDebt = Number(linkedOrder?.remainingDebt || 0)
                const supplierName = normalizeSupplierName(movement?.supplierName)
                const isPurchaseExpense = !isIncome && isPurchaseExpenseMovement(movement)

                const searchValue = String(orderSearchByMovementId[movement.id] ?? '')
                const hasLinkedOrder = Boolean(linkedOrderId)
                const wantsLinkedOrder = hasLinkedOrder || Boolean(pendingLinkByMovementId[movement.id])
                const movementAmount = toPositiveNumber(movement?.amount)

                const searchResults = buildPrioritizedOrderResults(orderCatalog, searchValue, movementAmount)

                const supplierResults = (() => {
                  const normalizedQuery = normalizeSearchText(supplierName)
                  if (!normalizedQuery) return supplierCatalog.slice(0, 8)
                  return supplierCatalog
                    .filter((option) => normalizeSearchText(option.name).includes(normalizedQuery))
                    .slice(0, 8)
                })()

                const movementTitle = (() => {
                  const concept = String(movement?.concept ?? '').trim()
                  if (isIncome) {
                    if (hasLinkedOrder && linkedClientName) {
                      return `Cliente: ${linkedClientName}`
                    }
                    return concept || `Ingreso ${index + 1}`
                  }

                  const category = String(movement?.category ?? '').trim()
                  return concept || category || `Egreso ${index + 1}`
                })()

                return (
                  <>
              <div className="daily-panel-movement-row-head">
                <div>
                  <strong>{isIncome ? `Ingreso ${index + 1}` : `Egreso ${index + 1}`}</strong>
                  <p className="daily-panel-movement-title-line">
                    Título:{' '}
                    <span className={isIncome ? 'daily-panel-movement-client-title' : 'daily-panel-movement-expense-title'}>
                      {movementTitle}
                    </span>
                  </p>
                  {isIncome && hasLinkedOrder && linkedOrder && (
                    <p className="daily-panel-movement-order-subtitle">
                      Pedido: {formatOrderId(linkedOrder.value)}
                    </p>
                  )}
                </div>
                <div className="daily-panel-movement-row-head-actions">
                  <span className="daily-panel-movement-amount-highlight">{formatCurrency(toPositiveNumber(movement.amount))}</span>
                  {movement.isCompact ? (
                    <button
                      type="button"
                      className="secondary-btn daily-panel-print-hide"
                      onClick={() => toggleMovementCompact(type, movement.id, false)}
                    >
                      Abrir
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="secondary-btn daily-panel-print-hide"
                      onClick={() => toggleMovementCompact(type, movement.id, true)}
                    >
                      Aceptar
                    </button>
                  )}
                </div>
              </div>

              {movement.isCompact ? (
                <div className="daily-panel-movement-summary">
                  <p><strong>Título:</strong> {movementTitle}</p>
                  <p><strong>Concepto:</strong> {String(movement.concept ?? '').trim() || 'Sin concepto'}</p>
                  <p><strong>Fondo:</strong> {getFundLabel(movement.fundId)} · <strong>Responsable:</strong> {getActorLabel(movement.actor)}</p>
                  <p><strong>Categoría:</strong> {String(movement.category ?? '').trim() || 'Sin categoría'}</p>
                  <p><strong>Origen/Destino:</strong> {String(movement.origin ?? '').trim() || 'No especificado'}</p>
                  {isIncome && hasLinkedOrder && (
                    <>
                      <p><strong>Cliente:</strong> {linkedClientName || 'Sin cliente'}</p>
                      <p><strong>Pedido:</strong> {formatOrderId(linkedOrderId)}</p>
                      <p><strong>Deuda actual del cliente:</strong> {formatCurrency(linkedDebt)}</p>
                    </>
                  )}
                  {isIncome && !hasLinkedOrder && String(movement?.unlinkReason ?? '').trim() && (
                    <p><strong>Motivo sin vincular:</strong> {String(movement.unlinkReason)}</p>
                  )}
                  {!isIncome && isPurchaseExpense && (
                    <p><strong>Proveedor:</strong> {supplierName || 'No informado'}</p>
                  )}
                  {String(movement.note ?? '').trim() && (
                    <p><strong>Detalle:</strong> {String(movement.note)}</p>
                  )}
                </div>
              ) : (
                <div className="daily-panel-movement-grid">
                  <label className="daily-panel-movement-field-wide">
                    Concepto
                    <input
                      type="text"
                      value={String(movement.concept ?? '')}
                      onChange={(event) => updateMovementField(type, movement.id, 'concept', event.target.value)}
                      placeholder={isIncome ? 'Ej. cobro libre, aporte, seña' : 'Ej. retiro, gasto, compra'}
                    />
                  </label>
                  <label>
                    Monto
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={toPositiveNumber(movement.amount)}
                      onChange={(event) => updateMovementField(type, movement.id, 'amount', event.target.value)}
                    />
                  </label>
                  <label>
                    Fondo
                    <select
                      value={normalizeFundId(movement.fundId)}
                      onChange={(event) => updateMovementField(type, movement.id, 'fundId', event.target.value)}
                    >
                      {FUND_OPTIONS.map((fund) => (
                        <option key={fund.id} value={fund.id}>{fund.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Responsable
                    <select
                      value={normalizeActor(movement.actor)}
                      onChange={(event) => updateMovementField(type, movement.id, 'actor', event.target.value)}
                    >
                      {TEAM_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Categoría
                    <select
                      value={String(movement.category ?? categories[0])}
                      onChange={(event) => updateMovementField(type, movement.id, 'category', event.target.value)}
                    >
                      {categories.map((category) => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  </label>
                  {isIncome && (
                    <>
                      <label>
                        Vinculación
                        <select
                          value={wantsLinkedOrder ? 'linked' : 'none'}
                          onChange={(event) => {
                            const nextValue = String(event.target.value)
                            if (nextValue === 'none') {
                              updateMovementField(type, movement.id, 'linkedOrderId', '')
                              updateMovementField(type, movement.id, 'unlinkReason', String(movement?.unlinkReason ?? ''))
                              setOrderSearchByMovementId((prev) => ({
                                ...prev,
                                [movement.id]: '',
                              }))
                              setPendingLinkByMovementId((prev) => ({
                                ...prev,
                                [movement.id]: false,
                              }))
                              return
                            }

                            setPendingLinkByMovementId((prev) => ({
                              ...prev,
                              [movement.id]: true,
                            }))
                            updateMovementField(type, movement.id, 'unlinkReason', '')
                          }}
                        >
                          <option value="none">Sin vincular</option>
                          <option value="linked">Vinculado a pedido</option>
                        </select>
                      </label>

                      {wantsLinkedOrder && (
                        <>
                          <label className="daily-panel-movement-field-wide">
                            Buscar cliente / pedido
                            <input
                              type="text"
                              value={searchValue}
                              onChange={(event) =>
                                setOrderSearchByMovementId((prev) => ({
                                  ...prev,
                                  [movement.id]: event.target.value,
                                }))
                              }
                              placeholder="Buscar por cliente, nro de pedido o fecha"
                            />
                          </label>

                          {searchResults.length === 0 && (
                            <p className="daily-panel-inline-hint">No hay pedidos que coincidan con la búsqueda.</p>
                          )}

                          <div className="daily-panel-order-search-results" role="listbox" aria-label="Resultados de pedidos">
                            {searchResults.map((orderOption) => (
                              <button
                                key={`${movement.id}-${orderOption.value}`}
                                type="button"
                                className={`daily-panel-order-result-btn ${String(orderOption.value) === linkedOrderId ? 'daily-panel-order-search-selected' : ''}`}
                                onClick={() => {
                                  updateMovementField(type, movement.id, 'linkedOrderId', orderOption.value)
                                  updateMovementField(type, movement.id, 'category', 'Cobro pedido')
                                  updateMovementField(type, movement.id, 'unlinkReason', '')
                                  setPendingLinkByMovementId((prev) => ({
                                    ...prev,
                                    [movement.id]: false,
                                  }))

                                  if (!String(movement?.concept ?? '').trim()) {
                                    updateMovementField(type, movement.id, 'concept', `Cobro ${orderOption.clientName}`)
                                  }

                                  setOrderSearchByMovementId((prev) => ({
                                    ...prev,
                                    [movement.id]: `${orderOption.clientName} · ${formatOrderId(orderOption.value)}`,
                                  }))
                                }}
                              >
                                <span className="daily-panel-order-result-main">
                                  {orderOption.clientName} · {formatOrderId(orderOption.value)}
                                </span>
                                <span className="daily-panel-order-result-meta">
                                  Deuda {formatCurrency(orderOption.remainingDebt)}
                                  {movementAmount > 0 && Number(orderOption.remainingDebt || 0) >= movementAmount
                                    ? ' · útil para seña o cobro parcial'
                                    : ''}
                                </span>
                              </button>
                            ))}
                          </div>

                          {hasLinkedOrder && (
                            <button
                              type="button"
                              className="secondary-btn daily-panel-print-hide"
                              onClick={() => {
                                const linkedName = linkedClientName || 'pedido'
                                updateMovementField(type, movement.id, 'category', 'Cobro pedido')
                                updateMovementField(type, movement.id, 'concept', `Seña ${linkedName}`)
                                const currentNote = String(movement?.note ?? '')
                                if (!/seña/i.test(currentNote)) {
                                  const nextNote = [currentNote, 'Pago parcial (seña)'].filter(Boolean).join(' · ')
                                  updateMovementField(type, movement.id, 'note', nextNote)
                                }
                              }}
                            >
                              Marcar como seña
                            </button>
                          )}
                        </>
                      )}

                      {!wantsLinkedOrder && (
                        <label className="daily-panel-movement-field-wide">
                          Motivo sin vincular
                          <input
                            type="text"
                            value={String(movement.unlinkReason ?? '')}
                            onChange={(event) => updateMovementField(type, movement.id, 'unlinkReason', event.target.value)}
                            placeholder="Ej. cobro mostrador, anticipo general, cliente no identificado"
                          />
                        </label>
                      )}
                    </>
                  )}

                  {!isIncome && (
                    <>
                      <label className="daily-panel-movement-field-wide">
                        Proveedor
                        <input
                          type="text"
                          value={supplierName}
                          onChange={(event) => updateMovementField(type, movement.id, 'supplierName', event.target.value)}
                          placeholder={isPurchaseExpense ? 'Obligatorio para compras/proveedor' : 'Opcional'}
                        />
                      </label>

                      {supplierResults.length > 0 && (
                        <div className="daily-panel-supplier-search-results" role="listbox" aria-label="Sugerencias de proveedores">
                          {supplierResults.map((supplierOption) => (
                            <button
                              key={`${movement.id}-${supplierOption.id || supplierOption.name}`}
                              type="button"
                              className={`daily-panel-supplier-result-btn ${normalizeSearchText(supplierOption.name) === normalizeSearchText(supplierName) ? 'daily-panel-order-search-selected' : ''}`}
                              onClick={() => updateMovementField(type, movement.id, 'supplierName', supplierOption.name)}
                            >
                              {supplierOption.name}
                            </button>
                          ))}
                        </div>
                      )}

                      {isPurchaseExpense && (
                        <button
                          type="button"
                          className="secondary-btn daily-panel-print-hide"
                          onClick={() => { void handleSaveSupplierFromMovement(movement.id, supplierName) }}
                        >
                          Guardar proveedor en base
                        </button>
                      )}
                    </>
                  )}
                  <label>
                    Origen / destino
                    <input
                      type="text"
                      value={String(movement.origin ?? '')}
                      onChange={(event) => updateMovementField(type, movement.id, 'origin', event.target.value)}
                      placeholder={isIncome ? 'Ej. cobro en local, transferencia, venta mostrador' : 'Ej. pago proveedor, retiro, gasto operativo'}
                    />
                  </label>
                  <label className="daily-panel-movement-field-wide">
                    Detalle
                    <input
                      type="text"
                      value={String(movement.note ?? '')}
                      onChange={(event) => updateMovementField(type, movement.id, 'note', event.target.value)}
                      placeholder="Observación breve"
                    />
                  </label>
                </div>
              )}

              <button
                type="button"
                className="icon-btn danger-btn daily-panel-print-hide daily-panel-movement-delete"
                onClick={() => removeMovement(type, movement.id)}
                aria-label={`Eliminar movimiento ${String(movement.concept ?? '')}`}
              >
                ×
              </button>
                  </>
                )
              })()}
            </div>
          ))}
        </div>
      </article>
    )
  }

  return (
    <section className="page-section daily-panel-page">
      <header className="page-header daily-panel-header">
        <div>
          <p className="daily-panel-eyebrow">Control diario de caja</p>
          <h2 className="section-title">Panel Diario</h2>
          <p>
            Un tablero de apertura y cierre para que no se escape nada: con qué plata arrancó el día,
            qué movimientos hubo, en qué fondo quedaron y con qué plata cerró realmente.
          </p>
        </div>

        <div className="daily-panel-hero-stats daily-panel-print-hide">
          <article className="daily-panel-hero-card">
            <small>Hoy</small>
            <strong>{formatLongDate(todayKey)}</strong>
            <span>{todayKey === selectedDateKey ? 'día seleccionado' : 'tocá para ir al día actual'}</span>
            <button type="button" className="secondary-btn" onClick={() => handleSelectDate(todayKey)}>Ir a hoy</button>
          </article>
          <article className="daily-panel-hero-card">
            <small>Días cerrados del mes</small>
            <strong>{String(monthMetrics.closedDays)}</strong>
            <span>{monthMetrics.closedWithDifferenceDays > 0 ? `${monthMetrics.closedWithDifferenceDays} con diferencia` : 'sin desvíos fuertes'}</span>
          </article>
          <article className="daily-panel-hero-card">
            <small>Movimiento del mes</small>
            <strong>{formatCurrency(monthMetrics.totalIncome - monthMetrics.totalExpense)}</strong>
            <span>{formatCurrency(monthMetrics.totalIncome)} entró · {formatCurrency(monthMetrics.totalExpense)} salió</span>
          </article>
        </div>
      </header>

      <section className="daily-panel-top-grid">
        <section className="dashboard-recent daily-panel-calendar-shell">
          <div className="daily-panel-calendar-head">
            <div>
              <h3>Calendario diario</h3>
              <p>Verde: cerrado correcto. Rojo: quedó diferencia. Amarillo: abierto. Blanco: sin iniciar.</p>
            </div>
            <div className="daily-panel-month-nav" role="group" aria-label="Navegación del mes">
              <button type="button" onClick={() => setSelectedMonthKey((prev) => shiftMonthKey(prev, -1))}>◀</button>
              <strong>{formatMonthLabel(selectedMonthKey)}</strong>
              <button type="button" onClick={() => setSelectedMonthKey((prev) => shiftMonthKey(prev, 1))}>▶</button>
            </div>
          </div>

          <div className="daily-panel-weekdays">
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>

          <div className="daily-panel-calendar-grid">
            {calendarCells.map((cell, index) => {
              if (!cell.inCurrentMonth || !cell.dateKey) {
                return <div key={`empty-${index}`} className="daily-panel-day-empty" aria-hidden="true" />
              }

              const entry = entriesByDate[cell.dateKey] ?? null
              const status = getDayVisualStatus(entry)
              const statusUi = getStatusPresentation(status)
              const summary = buildDaySummary(entry)
              const isSelected = cell.dateKey === selectedDateKey
              const isToday = cell.dateKey === todayKey

              return (
                <button
                  key={cell.dateKey}
                  type="button"
                  className={`daily-panel-day-tile ${statusUi.className} ${isSelected ? 'daily-panel-day-selected' : ''} ${isToday ? 'daily-panel-day-today' : ''}`}
                  onClick={() => handleSelectDate(cell.dateKey)}
                  title={`${statusUi.label} · Apertura ${formatCurrency(summary.openingTotal)} · Ingresos ${formatCurrency(summary.incomeTotal)} · Egresos ${formatCurrency(summary.expenseTotal)} · Cierre ${formatCurrency(summary.realFinal)}`}
                >
                  <div className="daily-panel-day-top">
                    <strong>{String(cell.dayNumber)}</strong>
                    <span>{statusUi.icon}</span>
                  </div>
                  <div className="daily-panel-day-preview">
                    <small>Ini {formatCurrency(summary.openingTotal)}</small>
                    <small>Mov {formatCurrency(summary.incomeTotal - summary.expenseTotal)}</small>
                    <small>Fin {formatCurrency(summary.realFinal)}</small>
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        <aside className="dashboard-recent daily-panel-focus-card">
          <div className="daily-panel-focus-top">
            <div>
              <p className="daily-panel-focus-label">Día activo</p>
              <h3>{formatLongDate(selectedDateKey)}</h3>
              <p>
                Estado: <span className={`daily-panel-status-pill ${selectedStatusUi.className}`}>{selectedStatusUi.icon} {selectedStatusUi.label}</span>
              </p>
            </div>
            <div className="daily-panel-day-actions daily-panel-print-hide">
              {!selectedEntry && (
                <button type="button" className="primary-btn" onClick={() => { void handleStartDay() }}>
                  Iniciar día
                </button>
              )}
              {selectedEntry && (
                <>
                  <button type="button" className="secondary-btn" onClick={() => { void handleRefreshSuggestions() }}>
                    Traer sugerencias
                  </button>
                  {pendingLinkedIncomeMovements.length > 0 && typeof onApplyLinkedIncomeToOrder === 'function' && (
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() => { void syncPendingLinkedIncomesToOrders() }}
                    >
                      Aplicar cobros ({pendingLinkedIncomeMovements.length})
                    </button>
                  )}
                  <button type="button" className="secondary-btn" onClick={() => { void applyExpectedClosing() }}>
                    Pasar esperado a cierre
                  </button>
                  <button
                    type="button"
                    className={selectedEntry.isClosed ? 'secondary-btn' : 'primary-btn'}
                    onClick={() => { void handleToggleCloseDay() }}
                  >
                    {selectedEntry.isClosed ? 'Reabrir día' : 'Cerrar día'}
                  </button>
                </>
              )}
            </div>
          </div>

          {selectedEntry && pendingLinkedIncomeMovements.length > 0 && typeof onApplyLinkedIncomeToOrder === 'function' && (
            <div className="daily-panel-pending-sync-note">
              Tenés {pendingLinkedIncomeMovements.length} cobro(s) vinculados a pedido pendientes de aplicar en la deuda.
            </div>
          )}

          <div className="daily-panel-focus-metrics">
            <article>
              <small>Inicio del día</small>
              <strong>{formatCurrency(selectedSummary.openingTotal)}</strong>
            </article>
            <article>
              <small>Movimiento neto</small>
              <strong>{formatCurrency(selectedSummary.incomeTotal - selectedSummary.expenseTotal)}</strong>
            </article>
            <article>
              <small>Cierre esperado</small>
              <strong>{formatCurrency(selectedSummary.expectedFinal)}</strong>
            </article>
            <article>
              <small>Cierre real</small>
              <strong>{formatCurrency(selectedSummary.realFinal)}</strong>
            </article>
          </div>

          <div className={`daily-panel-closing-result ${selectedSummary.absDifference <= 1 ? 'daily-panel-closing-result-ok' : 'daily-panel-closing-result-alert'}`}>
            {selectedSummary.absDifference <= 1
              ? 'El cierre del día está alineado con lo esperado.'
              : `Diferencia del día: ${formatCurrency(selectedSummary.difference)}. Este panel está hecho justamente para detectar eso.`}
          </div>
        </aside>
      </section>

      {!selectedEntry && (
        <article className="card-block daily-panel-empty-state">
          <h4>Este día todavía no fue iniciado</h4>
          <p>
            Al iniciar el día, Packya trae apertura sugerida y movimientos detectados, pero el panel sigue siendo tu control manual de gerencia.
          </p>
          <div className="daily-panel-suggestion-kpis">
            <div>
              <small>Sugerencia de ingresos</small>
              <strong>{formatCurrency(systemSuggestions.incomeMovements.reduce((acc, movement) => acc + toPositiveNumber(movement.amount), 0))}</strong>
            </div>
            <div>
              <small>Sugerencia de egresos</small>
              <strong>{formatCurrency(systemSuggestions.expenseMovements.reduce((acc, movement) => acc + toPositiveNumber(movement.amount), 0))}</strong>
            </div>
            <div>
              <small>Pedidos cobrados detectados</small>
              <strong>{String(systemSuggestions.operational.paymentsRegistered)}</strong>
            </div>
            <div>
              <small>Cajas impresas sugeridas</small>
              <strong>{String(systemSuggestions.operational.printedBoxes)}</strong>
            </div>
          </div>
        </article>
      )}

      {selectedEntry && (
        <>
          <section className="dashboard-day-summary-grid daily-panel-summary-grid">
            <article className="dashboard-card daily-panel-summary-card">
              <p>Apertura total</p>
              <strong>{formatCurrency(selectedSummary.openingTotal)}</strong>
            </article>
            <article className="dashboard-card daily-panel-summary-card">
              <p>Ingresos del día</p>
              <strong>{formatCurrency(selectedSummary.incomeTotal)}</strong>
            </article>
            <article className="dashboard-card daily-panel-summary-card">
              <p>Egresos del día</p>
              <strong>{formatCurrency(selectedSummary.expenseTotal)}</strong>
            </article>
            <article className="dashboard-card daily-panel-summary-card">
              <p>Esperado al cierre</p>
              <strong>{formatCurrency(selectedSummary.expectedFinal)}</strong>
            </article>
            <article className="dashboard-card daily-panel-summary-card">
              <p>Real al cierre</p>
              <strong>{formatCurrency(selectedSummary.realFinal)}</strong>
            </article>
            <article className={`dashboard-card daily-panel-summary-card ${selectedSummary.absDifference <= 1 ? 'daily-panel-diff-ok' : 'daily-panel-diff-alert'}`}>
              <p>Diferencia</p>
              <strong>{formatCurrency(selectedSummary.difference)}</strong>
            </article>
          </section>

          <section className="daily-panel-balance-columns">
            <article className="card-block daily-panel-block">
              <div className="card-head">
                <div>
                  <h3>Apertura del día</h3>
                  <p className="daily-panel-card-subtitle">Definí con qué plata empezó el día cada fondo.</p>
                </div>
              </div>
              <div className="daily-panel-funds-grid">
                {FUND_OPTIONS.map((fund) => (
                  <label key={`open-${fund.id}`} className={`daily-panel-fund-card ${fund.accentClassName}`}>
                    <span>{fund.label}</span>
                    <small>{fund.description}</small>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={selectedEntry.openingBalances[fund.id]}
                      onChange={(event) => updateBalanceField('openingBalances', fund.id, event.target.value)}
                    />
                  </label>
                ))}
              </div>
              <label className="daily-panel-full-width-field">
                Nota de apertura
                <textarea
                  className="daily-panel-notes"
                  value={String(selectedEntry.openingNote ?? '')}
                  onChange={(event) => updateTextField('openingNote', event.target.value)}
                  placeholder="Ej. se arrancó con retiro del cierre anterior, faltante pendiente, recuento inicial, etc."
                />
              </label>
            </article>

            <article className="card-block daily-panel-block daily-panel-closing-block">
              <div className="card-head">
                <div>
                  <h3>Cierre real del día</h3>
                  <p className="daily-panel-card-subtitle">Lo que efectivamente quedó al terminar el día.</p>
                </div>
              </div>
              <div className="daily-panel-funds-grid">
                {FUND_OPTIONS.map((fund) => (
                  <label key={`close-${fund.id}`} className={`daily-panel-fund-card ${fund.accentClassName}`}>
                    <span>{fund.label}</span>
                    <small>Esperado {formatCurrency(selectedSummary.expectedByFund[fund.id])}</small>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={selectedEntry.closingBalances[fund.id]}
                      onChange={(event) => updateBalanceField('closingBalances', fund.id, event.target.value)}
                    />
                  </label>
                ))}
              </div>
              <label className="daily-panel-full-width-field">
                Nota de cierre
                <textarea
                  className="daily-panel-notes"
                  value={String(selectedEntry.closingNote ?? '')}
                  onChange={(event) => updateTextField('closingNote', event.target.value)}
                  placeholder="Ej. se dejó efectivo para mañana, quedó pendiente un cobro, hubo diferencia de arqueo, etc."
                />
              </label>
            </article>
          </section>

          <article className="card-block daily-panel-block">
            <div className="card-head">
              <div>
                <h3>Radar por fondo</h3>
                <p className="daily-panel-card-subtitle">Cómo se movió cada caja/cuenta dentro del día.</p>
              </div>
            </div>
            <div className="daily-panel-fund-radar-grid">
              {selectedDayFundRows.map((fund) => (
                <article key={`radar-${fund.id}`} className={`daily-panel-fund-radar-card ${fund.accentClassName}`}>
                  <div className="daily-panel-fund-radar-head">
                    <span>{fund.shortLabel}</span>
                    <strong>{fund.label}</strong>
                  </div>
                  <small>Inicio {formatCurrency(fund.opening)}</small>
                  <small>Entró {formatCurrency(fund.income)}</small>
                  <small>Salió {formatCurrency(fund.expense)}</small>
                  <small>Esperado {formatCurrency(fund.expected)}</small>
                  <small>Real {formatCurrency(fund.closing)}</small>
                </article>
              ))}
            </div>
          </article>

          <section className="daily-panel-movements-grid">
            {renderMovementBlock('income', 'Ingresos y cobros', selectedEntry.incomeMovements)}
            {renderMovementBlock('expense', 'Egresos y salidas', selectedEntry.expenseMovements)}
          </section>

          <section className="daily-panel-secondary-grid">
            <article className="card-block daily-panel-block">
              <div className="card-head">
                <div>
                  <h3>Señales operativas del día</h3>
                  <p className="daily-panel-card-subtitle">Datos de ritmo diario para leer junto con la caja.</p>
                </div>
              </div>
              <div className="daily-panel-operational-grid">
                <label>
                  Pedidos listos (auto)
                  <input
                    type="number"
                    min="0"
                    value={selectedReadyPrintMetrics.readyOrders}
                    readOnly
                  />
                </label>
                <label>
                  Pedidos tomados
                  <input
                    type="number"
                    min="0"
                    value={selectedEntry.operational.ordersTaken}
                    onChange={(event) => updateOperationalField('ordersTaken', event.target.value)}
                  />
                </label>
                <label>
                  Pedidos entregados
                  <input
                    type="number"
                    min="0"
                    value={selectedEntry.operational.ordersDelivered}
                    onChange={(event) => updateOperationalField('ordersDelivered', event.target.value)}
                  />
                </label>
                <label>
                  Cobros registrados
                  <input
                    type="number"
                    min="0"
                    value={selectedEntry.operational.paymentsRegistered}
                    onChange={(event) => updateOperationalField('paymentsRegistered', event.target.value)}
                  />
                </label>
                <label>
                  Actividad productiva
                  <input
                    type="number"
                    min="0"
                    value={selectedEntry.operational.productionActivity}
                    onChange={(event) => updateOperationalField('productionActivity', event.target.value)}
                  />
                </label>
                <label>
                  Cajas impresas por pedidos listos (auto)
                  <input
                    type="number"
                    min="0"
                    value={selectedReadyPrintMetrics.printedBoxes}
                    readOnly
                  />
                </label>
                <label>
                  Cajas impresas (manual)
                  <input
                    type="number"
                    min="0"
                    value={selectedEntry.operational.printedBoxes}
                    onChange={(event) => updateOperationalField('printedBoxes', event.target.value)}
                  />
                </label>
              </div>
            </article>

            <article className="card-block daily-panel-block">
              <div className="card-head">
                <div>
                  <h3>Observaciones gerenciales</h3>
                  <p className="daily-panel-card-subtitle">Anotá fugas, pendientes, desvíos o aclaraciones del día.</p>
                </div>
              </div>
              <textarea
                className="daily-panel-notes"
                value={String(selectedEntry.notes ?? '')}
                onChange={(event) => updateTextField('notes', event.target.value)}
                placeholder="Ej. sobró menos efectivo del esperado, un cobro quedó sin identificar, faltó pasar un gasto, etc."
              />
            </article>
          </section>
        </>
      )}

      <section className="dashboard-recent daily-panel-month-report">
        <div className="daily-panel-calendar-head">
          <div>
            <h3>Informe mensual diario</h3>
            <p>Resumen imprimible día por día para dirección o control interno.</p>
          </div>
          <button type="button" className="secondary-btn daily-panel-print-hide" onClick={handlePrintMonth}>
            Imprimir informe mensual
          </button>
        </div>

        <div className="daily-panel-month-kpis">
          <article>
            <small>Apertura primera registrada</small>
            <strong>{formatCurrency(monthMetrics.firstOpeningTotal)}</strong>
          </article>
          <article>
            <small>Ingresó en el mes</small>
            <strong>{formatCurrency(monthMetrics.totalIncome)}</strong>
          </article>
          <article>
            <small>Salió en el mes</small>
            <strong>{formatCurrency(monthMetrics.totalExpense)}</strong>
          </article>
          <article>
            <small>Cierre final registrado</small>
            <strong>{formatCurrency(monthMetrics.lastRealTotal)}</strong>
          </article>
        </div>

        <article className="daily-panel-distribution-card">
          <div className="daily-panel-distribution-head">
            <h4>Distribución mensual por fondo</h4>
            <p>Te muestra rápido dónde entró y salió la mayor parte del dinero.</p>
          </div>
          <div className="daily-panel-distribution-grid">
            <div>
              <h5>Ingresos</h5>
              {(Array.isArray(monthReportAnalytics.incomeByFund) ? monthReportAnalytics.incomeByFund : []).map((row) => {
                const base = Math.max(Number(monthReportAnalytics.totalIncome || 0), 1)
                const percent = (Number(row?.amount || 0) / base) * 100

                return (
                  <div key={`income-fund-${row.fundId}`} className="daily-panel-distribution-row">
                    <div className="daily-panel-distribution-row-head">
                      <span>{row.fundLabel}</span>
                      <strong>{formatCurrency(row.amount)} · {formatPercent(percent)}</strong>
                    </div>
                    <div className="daily-panel-distribution-track" aria-hidden="true">
                      <span className="daily-panel-distribution-fill daily-panel-distribution-fill-income" style={{ width: `${Math.max(4, Math.min(percent, 100))}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>

            <div>
              <h5>Egresos</h5>
              {(Array.isArray(monthReportAnalytics.expenseByFund) ? monthReportAnalytics.expenseByFund : []).map((row) => {
                const base = Math.max(Number(monthReportAnalytics.totalExpense || 0), 1)
                const percent = (Number(row?.amount || 0) / base) * 100

                return (
                  <div key={`expense-fund-${row.fundId}`} className="daily-panel-distribution-row">
                    <div className="daily-panel-distribution-row-head">
                      <span>{row.fundLabel}</span>
                      <strong>{formatCurrency(row.amount)} · {formatPercent(percent)}</strong>
                    </div>
                    <div className="daily-panel-distribution-track" aria-hidden="true">
                      <span className="daily-panel-distribution-fill daily-panel-distribution-fill-expense" style={{ width: `${Math.max(4, Math.min(percent, 100))}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </article>

        {monthDailyRows.length === 0 && (
          <div className="daily-panel-inline-empty">
            <p>No hay días iniciados todavía en {formatMonthLabel(selectedMonthKey)}.</p>
          </div>
        )}

        {monthDailyRows.length > 0 && (
          <div className="daily-panel-report-table-wrap">
            <table className="daily-panel-report-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Pedidos listos</th>
                  <th>Cajas impresas (listo)</th>
                  <th>Apertura</th>
                  <th>Ingresos</th>
                  <th>Egresos</th>
                  <th>Esperado</th>
                  <th>Real</th>
                  <th>Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {monthDailyRows.map(({ entry, summary, status, readyPrintMetrics }) => (
                  <tr key={`report-${entry.dateKey}`}>
                    <td>{formatShortDate(entry.dateKey)}</td>
                    <td>{status.label}</td>
                    <td>{String(readyPrintMetrics.readyOrders)}</td>
                    <td>{String(readyPrintMetrics.printedBoxes)}</td>
                    <td>{formatCurrency(summary.openingTotal)}</td>
                    <td>{formatCurrency(summary.incomeTotal)}</td>
                    <td>{formatCurrency(summary.expenseTotal)}</td>
                    <td>{formatCurrency(summary.expectedFinal)}</td>
                    <td>{formatCurrency(summary.realFinal)}</td>
                    <td>{formatCurrency(summary.difference)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {dialogNode}
    </section>
  )
}

export default DailyPanelPage