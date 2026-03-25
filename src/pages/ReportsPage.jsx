import { useMemo, useState } from 'react'
import { getOrderFinancialSummary } from '../utils/finance'
import {
  generateClientAccountPDF,
  generateCostsPDF,
  generateDebtPDF,
  generateExpensesReportPDF,
  generatePriceListPDF,
  generateProductionReportPDF,
  generateStockStatusPDF,
} from '../utils/reportsPdf'
import { getStockMapByProductId } from '../utils/stock'

const CATEGORY_OPTIONS = [
  { key: 'CAJA', label: 'CAJAS' },
  { key: 'BOLSA', label: 'BOLSAS' },
  { key: 'EMBALAJE', label: 'EMBALAJE' },
  { key: 'OTRO', label: 'OTROS' },
]

const toPositiveNumber = (value) => {
  const parsed = Number(value)
  return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed
}

const formatCurrency = (value) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0)

const getCategoryLabel = (value) => {
  const normalized = String(value ?? '').trim().toUpperCase()
  const option = CATEGORY_OPTIONS.find((item) => item.key === normalized)
  return option?.label ?? 'OTROS'
}

const getClientKey = (order) => {
  const clientId = String(order?.clientId ?? '').trim()
  if (clientId) return `id:${clientId}`

  const clientName = String(order?.clientName ?? order?.client ?? '').trim().toLowerCase()
  if (!clientName) return ''
  return `name:${clientName}`
}

const getClientDisplayName = (order) => String(order?.clientName ?? order?.client ?? 'Sin cliente').trim() || 'Sin cliente'

const getMonthKeyFromOrder = (order) => {
  const deliveryDate = String(order?.deliveryDate ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) return deliveryDate.slice(0, 7)

  const createdAt = new Date(order?.createdAt)
  if (Number.isNaN(createdAt.getTime())) return 'Sin mes'
  return `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, '0')}`
}

const getMonthLabel = (monthKey) => {
  if (!/^\d{4}-\d{2}$/.test(String(monthKey ?? ''))) return 'Sin mes'
  const [year, month] = String(monthKey).split('-').map(Number)
  const date = new Date(year, month - 1, 1)

  return date.toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric',
  })
}

const formatDate = (value) => {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Sin fecha'
  return parsed.toLocaleDateString('es-AR')
}

const formatDateDDMMYYYY = (value) => {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Sin fecha'

  const day = String(parsed.getDate()).padStart(2, '0')
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const year = parsed.getFullYear()
  return `${day}/${month}/${year}`
}

const formatTime = (value) => {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Sin hora'

  return parsed.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

const getDaysBetween = (value, now) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 0
  const diffMs = now.getTime() - date.getTime()
  return Math.max(Math.floor(diffMs / (1000 * 60 * 60 * 24)), 0)
}

function ReportsPage({ products, orders, clients, expenses, onSaveProduct }) {
  const safeProducts = useMemo(() => (Array.isArray(products) ? products : []), [products])
  const safeOrders = useMemo(() => (Array.isArray(orders) ? orders : []), [orders])
  const safeClients = useMemo(() => (Array.isArray(clients) ? clients : []), [clients])
  const safeExpenses = useMemo(() => (Array.isArray(expenses) ? expenses : []), [expenses])

  const [selectionMode, setSelectionMode] = useState('all')
  const [selectedCategories, setSelectedCategories] = useState(() =>
    CATEGORY_OPTIONS.reduce((acc, category) => {
      acc[category.key] = true
      return acc
    }, {}),
  )
  const [selectedProductIds, setSelectedProductIds] = useState({})
  const [missingPriceModal, setMissingPriceModal] = useState({
    isOpen: false,
    rows: [],
    readyRows: [],
  })
  const [missingCostsModal, setMissingCostsModal] = useState({
    isOpen: false,
    rows: [],
  })
  const [hasShownMissingCostsWarning, setHasShownMissingCostsWarning] = useState(false)
  const [accountScope, setAccountScope] = useState('all')
  const [selectedAccountClientKey, setSelectedAccountClientKey] = useState('')

  const productsSorted = useMemo(
    () =>
      [...safeProducts].sort((a, b) =>
        String(a?.name ?? '').localeCompare(String(b?.name ?? ''), 'es', { sensitivity: 'base' }),
      ),
    [safeProducts],
  )

  const selectedProducts = useMemo(() => {
    if (selectionMode === 'all') return productsSorted

    if (selectionMode === 'manual') {
      return productsSorted.filter((product) => selectedProductIds[String(product?.id ?? '')] === true)
    }

    return productsSorted.filter((product) => {
      const category = String(product?.category ?? '').trim().toUpperCase()
      return selectedCategories[category] === true
    })
  }, [productsSorted, selectedCategories, selectedProductIds, selectionMode])

  const productsById = useMemo(
    () =>
      productsSorted.reduce((acc, product) => {
        const productId = String(product?.id ?? '')
        if (!productId) return acc
        acc[productId] = product
        return acc
      }, {}),
    [productsSorted],
  )

  const debtRows = useMemo(() => {
    const now = new Date()
    const clientsById = safeClients.reduce((acc, client) => {
      if (!client?.id) return acc
      acc[String(client.id)] = client
      return acc
    }, {})

    const debtByClient = {}

    safeOrders.forEach((order) => {
      if (order?.isSample) return
      if (String(order?.status ?? '') === 'Cancelado') return

      const { remainingDebt } = getOrderFinancialSummary(order)
      if (remainingDebt <= 0) return

      const clientKey = getClientKey(order)
      if (!clientKey) return

      const deliveryRef =
        (typeof order?.deliveryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(order.deliveryDate))
          ? `${order.deliveryDate}T00:00:00`
          : order?.createdAt

      const debtDays = getDaysBetween(deliveryRef, now)
      const fallbackClientName = String(order?.clientName ?? order?.client ?? 'Sin cliente')
      const clientId = String(order?.clientId ?? '').trim()
      const resolvedClient = clientId ? clientsById[clientId] : null

      const row = debtByClient[clientKey] ?? {
        clientName: String(resolvedClient?.name ?? fallbackClientName),
        totalDebt: 0,
        ordersCount: 0,
        maxDebtDays: 0,
      }

      row.totalDebt += toPositiveNumber(remainingDebt)
      row.ordersCount += 1
      row.maxDebtDays = Math.max(row.maxDebtDays, debtDays)
      debtByClient[clientKey] = row
    })

    return Object.values(debtByClient)
      .filter((row) => row.totalDebt > 0)
      .sort((a, b) => b.totalDebt - a.totalDebt)
  }, [safeClients, safeOrders])

  const accountClientOptions = useMemo(() => {
    const uniqueByKey = {}

    safeOrders.forEach((order) => {
      if (order?.isSample) return
      if (String(order?.status ?? '') === 'Cancelado') return

      const clientKey = getClientKey(order)
      if (!clientKey) return

      const clientId = String(order?.clientId ?? '').trim()
      const knownClient = clientId ? safeClients.find((client) => String(client?.id ?? '') === clientId) : null

      uniqueByKey[clientKey] = {
        key: clientKey,
        label: String(knownClient?.name ?? getClientDisplayName(order)),
      }
    })

    return Object.values(uniqueByKey).sort((a, b) =>
      String(a.label).localeCompare(String(b.label), 'es', { sensitivity: 'base' }),
    )
  }, [safeClients, safeOrders])

  const accountRows = useMemo(() => {
    const now = new Date()
    const rows = []

    safeOrders.forEach((order, orderIndex) => {
      if (order?.isSample) return
      if (String(order?.status ?? '') === 'Cancelado') return

      const clientKey = getClientKey(order)
      if (!clientKey) return

      if (accountScope === 'single' && selectedAccountClientKey && clientKey !== selectedAccountClientKey) {
        return
      }

      const financialSummary = getOrderFinancialSummary(order)
      const total = toPositiveNumber(financialSummary?.finalTotal)
      const paid = toPositiveNumber(financialSummary?.totalPaid)
      const balance = Math.max(total - paid, 0)
      const dateRef = order?.createdAt ?? order?.deliveryDate
      const daysSinceOrder = getDaysBetween(dateRef, now)
      const orderItems = Array.isArray(order?.items) ? order.items : []
      const productsLabel = orderItems
        .map((item) => {
          const productId = String(item?.productId ?? '').trim()
          const knownProduct = productsById[productId]
          const itemName = String(
            knownProduct?.name ?? item?.productName ?? item?.product ?? 'Producto sin nombre',
          ).trim()
          const quantity = toPositiveNumber(item?.quantity)
          if (!itemName) return null
          return `${itemName} x${quantity}`
        })
        .filter(Boolean)
        .join(' | ')

      rows.push({
        clientKey,
        orderId: String(order?.id ?? `PED-${orderIndex + 1}`),
        clientName: getClientDisplayName(order),
        dateLabel: formatDateDDMMYYYY(dateRef),
        timeLabel: formatTime(dateRef),
        productsLabel,
        total,
        paid,
        balance,
        daysSinceOrder,
      })
    })

    return rows.sort((a, b) => {
      if (a.clientName !== b.clientName) {
        return String(a.clientName).localeCompare(String(b.clientName), 'es', { sensitivity: 'base' })
      }

      return b.daysSinceOrder - a.daysSinceOrder
    })
  }, [accountScope, productsById, safeOrders, selectedAccountClientKey])

  const stockRows = useMemo(() => {
    const stockMap = getStockMapByProductId(safeProducts, safeOrders)

    return safeProducts
      .map((product) => {
        const productId = String(product?.id ?? '')
        const stockCurrent = Number(stockMap?.[productId]?.stockDisponible ?? product?.stockTotal ?? 0)
        return {
          id: productId,
          name: String(product?.name ?? 'Sin nombre'),
          stockCurrent,
        }
      })
      .sort((a, b) => {
        if (a.stockCurrent !== b.stockCurrent) return a.stockCurrent - b.stockCurrent
        return String(a.name).localeCompare(String(b.name), 'es', { sensitivity: 'base' })
      })
  }, [safeOrders, safeProducts])

  const expensesRows = useMemo(
    () =>
      [...safeExpenses]
        .map((expense) => ({
          id: String(expense?.id ?? ''),
          dateLabel: formatDate(expense?.date),
          timestamp: new Date(expense?.date).getTime(),
          type: String(expense?.type ?? 'empresa').trim().toLowerCase() === 'socio' ? 'socio' : 'empresa',
          person: String(expense?.person ?? '').trim().toUpperCase() || null,
          category: String(expense?.category ?? 'Sin categoria').trim() || 'Sin categoria',
          reason: String(expense?.reason ?? expense?.description ?? '').trim(),
          description: String(expense?.description ?? expense?.reason ?? '').trim(),
          amount: toPositiveNumber(expense?.amount),
        }))
        .sort((a, b) => {
          const aTs = Number.isNaN(a.timestamp) ? 0 : a.timestamp
          const bTs = Number.isNaN(b.timestamp) ? 0 : b.timestamp
          return bTs - aTs
        }),
    [safeExpenses],
  )

  const expensesSummaryByPartner = useMemo(() => {
    const totals = {
      DAMIAN: 0,
      FRANCO: 0,
    }

    expensesRows.forEach((row) => {
      if (row.type !== 'socio') return
      const partner = String(row.person ?? '').trim().toUpperCase()
      if (!Object.hasOwn(totals, partner)) return
      totals[partner] += toPositiveNumber(row.amount)
    })

    return Object.keys(totals)
      .map((partner) => ({
        partner,
        amount: totals[partner],
      }))
      .filter((row) => row.amount > 0)
      .sort((a, b) => b.amount - a.amount)
  }, [expensesRows])

  const expensesSummaryByCategory = useMemo(() => {
    const totals = {}

    expensesRows.forEach((row) => {
      const category = String(row.category ?? '').trim() || 'Sin categoria'
      totals[category] = (totals[category] ?? 0) + toPositiveNumber(row.amount)
    })

    return Object.keys(totals)
      .map((category) => ({
        category,
        amount: totals[category],
      }))
      .sort((a, b) => {
        if (b.amount !== a.amount) return b.amount - a.amount
        return String(a.category).localeCompare(String(b.category), 'es', { sensitivity: 'base' })
      })
  }, [expensesRows])

  const productionRows = useMemo(() => {
    const productsById = safeProducts.reduce((acc, product) => {
      const productId = String(product?.id ?? '').trim()
      if (!productId) return acc
      acc[productId] = product
      return acc
    }, {})

    const totalsByCategory = {}
    const totalsByMonth = {}
    let totalProduced = 0

    safeOrders.forEach((order) => {
      if (String(order?.status ?? '') !== 'Entregado') return

      const items = Array.isArray(order?.items) ? order.items : []
      const monthKey = getMonthKeyFromOrder(order)
      const monthRow = totalsByMonth[monthKey] ?? {
        monthKey,
        monthLabel: getMonthLabel(monthKey),
        totalQuantity: 0,
        orders: new Set(),
        categories: new Set(),
      }

      items.forEach((item) => {
        const quantity = toPositiveNumber(item?.quantity)
        if (quantity <= 0) return

        const productId = String(item?.productId ?? '').trim()
        const product = productsById[productId]
        const category = getCategoryLabel(product?.category)

        totalProduced += quantity
        totalsByCategory[category] = (totalsByCategory[category] ?? 0) + quantity
        monthRow.totalQuantity += quantity
        monthRow.orders.add(String(order?.id ?? ''))
        monthRow.categories.add(category)
      })

      totalsByMonth[monthKey] = monthRow
    })

    const categoryRows = Object.keys(totalsByCategory)
      .map((category) => ({
        category,
        totalQuantity: totalsByCategory[category],
      }))
      .sort((a, b) => {
        if (b.totalQuantity !== a.totalQuantity) return b.totalQuantity - a.totalQuantity
        return String(a.category).localeCompare(String(b.category), 'es', { sensitivity: 'base' })
      })

    const monthRows = Object.values(totalsByMonth)
      .map((row) => ({
        monthKey: row.monthKey,
        monthLabel: row.monthLabel,
        totalQuantity: row.totalQuantity,
        ordersCount: row.orders.size,
        categoriesCount: row.categories.size,
      }))
      .sort((a, b) => String(a.monthKey).localeCompare(String(b.monthKey), 'es', { sensitivity: 'base' }))

    return {
      totalProduced,
      categoryRows,
      monthRows,
    }
  }, [safeOrders, safeProducts])

  const clientRankingRows = useMemo(() => {
    const fallbackNameById = safeClients.reduce((acc, client) => {
      const key = String(client?.id ?? '').trim()
      if (!key) return acc
      acc[key] = String(client?.name ?? 'Sin cliente').trim() || 'Sin cliente'
      return acc
    }, {})

    const rankingByClient = {}

    safeOrders.forEach((order) => {
      if (order?.isSample) return
      if (String(order?.status ?? '') === 'Cancelado') return

      const clientKey = getClientKey(order)
      if (!clientKey) return

      const summary = getOrderFinancialSummary(order)
      const totalFacturado = toPositiveNumber(summary?.finalTotal)
      const totalPagado = toPositiveNumber(summary?.totalPaid)
      const totalDeuda = Math.max(totalFacturado - totalPagado, 0)
      const fallbackName = String(order?.clientName ?? order?.client ?? 'Sin cliente').trim() || 'Sin cliente'
      const clientId = String(order?.clientId ?? '').trim()

      const row = rankingByClient[clientKey] ?? {
        clientKey,
        clientName: fallbackNameById[clientId] ?? fallbackName,
        totalFacturado: 0,
        totalPagado: 0,
        totalDeuda: 0,
        cantidadPedidos: 0,
      }

      row.totalFacturado += totalFacturado
      row.totalPagado += totalPagado
      row.totalDeuda += totalDeuda
      row.cantidadPedidos += 1
      rankingByClient[clientKey] = row
    })

    return Object.values(rankingByClient).map((row) => ({
      ...row,
      porcentajePago: row.totalFacturado > 0 ? row.totalPagado / row.totalFacturado : 0,
    }))
  }, [safeClients, safeOrders])

  const topBilledClients = useMemo(
    () => [...clientRankingRows].sort((a, b) => b.totalFacturado - a.totalFacturado).slice(0, 10),
    [clientRankingRows],
  )

  const topDebtClients = useMemo(
    () => [...clientRankingRows].sort((a, b) => b.totalDeuda - a.totalDeuda).slice(0, 10),
    [clientRankingRows],
  )

  const topComplianceClients = useMemo(
    () => [...clientRankingRows]
      .filter((row) => row.totalFacturado > 0)
      .sort((a, b) => b.porcentajePago - a.porcentajePago)
      .slice(0, 10),
    [clientRankingRows],
  )

  const costRows = useMemo(
    () =>
      productsSorted.map((product) => {
        const salePrice = toPositiveNumber(product?.salePrice)
        const referenceCost = toPositiveNumber(product?.referenceCost)

        return {
          id: String(product?.id ?? ''),
          name: String(product?.name ?? 'Sin nombre'),
          category: getCategoryLabel(product?.category),
          salePrice,
          referenceCost,
          margin: salePrice - referenceCost,
          marginPercent: salePrice > 0 ? ((salePrice - referenceCost) / salePrice) * 100 : 0,
          hasMissingValues: salePrice === 0 || referenceCost === 0,
        }
      }),
    [productsSorted],
  )

  const openMissingPriceModal = (rows, readyRows) => {
    setMissingPriceModal({
      isOpen: true,
      rows: rows.map((row) => ({
        ...row,
        overridePrice: '',
        exclude: false,
      })),
      readyRows,
    })
  }

  const closeMissingPriceModal = () => {
    setMissingPriceModal({
      isOpen: false,
      rows: [],
      readyRows: [],
    })
  }

  const handleGeneratePriceList = () => {
    if (selectedProducts.length === 0) {
      window.alert('No hay productos seleccionados para generar la lista de precios.')
      return
    }

    const baseRows = selectedProducts.map((product) => ({
      id: String(product?.id ?? ''),
      name: String(product?.name ?? 'Sin nombre'),
      category: getCategoryLabel(product?.category),
      salePrice: toPositiveNumber(product?.salePrice),
    }))

    const readyRows = baseRows.filter((row) => row.salePrice > 0)
    const missingRows = baseRows.filter((row) => row.salePrice <= 0)

    if (missingRows.length > 0) {
      openMissingPriceModal(missingRows, readyRows)
      return
    }

    const categoriesLabel =
      selectionMode === 'all'
        ? 'Todos'
        : selectionMode === 'manual'
          ? 'Selección manual'
          : CATEGORY_OPTIONS
              .filter((option) => selectedCategories[option.key])
              .map((option) => option.label)
              .join(', ') || 'Sin categoría'

    generatePriceListPDF({
      rows: readyRows,
      categoriesLabel,
    })
  }

  const handleConfirmMissingPrice = () => {
    const solvedRows = missingPriceModal.rows
      .map((row) => {
        if (row.exclude) return null

        const overridePrice = toPositiveNumber(row.overridePrice)
        if (overridePrice <= 0) return null

        return {
          id: row.id,
          name: row.name,
          category: row.category,
          salePrice: overridePrice,
        }
      })
      .filter(Boolean)

    const finalRows = [...missingPriceModal.readyRows, ...solvedRows]

    if (finalRows.length === 0) {
      window.alert('No hay productos con precio válido para generar el PDF.')
      return
    }

    const categoriesLabel =
      selectionMode === 'all'
        ? 'Todos'
        : selectionMode === 'manual'
          ? 'Selección manual'
          : CATEGORY_OPTIONS
              .filter((option) => selectedCategories[option.key])
              .map((option) => option.label)
              .join(', ') || 'Sin categoría'

    generatePriceListPDF({ rows: finalRows, categoriesLabel })
    closeMissingPriceModal()
  }

  const handleMissingPriceChange = (rowId, field, value) => {
    setMissingPriceModal((prev) => ({
      ...prev,
      rows: prev.rows.map((row) => {
        if (row.id !== rowId) return row

        if (field === 'exclude') {
          return {
            ...row,
            exclude: Boolean(value),
          }
        }

        return {
          ...row,
          [field]: value,
        }
      }),
    }))
  }

  const closeMissingCostsModal = () => {
    setMissingCostsModal({
      isOpen: false,
      rows: [],
    })
  }

  const handleMissingCostsChange = (rowId, field, value) => {
    let autoSavePayload = null

    setMissingCostsModal((prev) => ({
      ...prev,
      rows: prev.rows.map((row) => {
        if (row.id !== rowId) return row

        const nextRow = {
          ...row,
          [field]: value,
        }

        autoSavePayload = nextRow
        return nextRow
      }),
    }))

    if (!autoSavePayload) return

    const productId = String(autoSavePayload.id ?? '')
    const baseProduct = productsById[productId]
    if (!productId || !baseProduct || typeof onSaveProduct !== 'function') return

    onSaveProduct({
      id: String(baseProduct.id),
      name: String(baseProduct.name ?? ''),
      category: String(baseProduct.category ?? ''),
      stockMinimo: toPositiveNumber(baseProduct.stockMinimo),
      referenceCost: toPositiveNumber(autoSavePayload.referenceCost),
      salePrice: toPositiveNumber(autoSavePayload.salePrice),
      image: String(baseProduct.image ?? ''),
    })
  }

  const handleGenerateCostsReport = () => {
    const missingRows = costRows
      .filter((row) => row.hasMissingValues)
      .map((row) => ({
        id: row.id,
        name: row.name,
        referenceCost: String(row.referenceCost),
        salePrice: String(row.salePrice),
      }))

    if (missingRows.length > 0) {
      if (!hasShownMissingCostsWarning) {
        window.alert('⚠ Producto sin costo o precio cargado')
        setHasShownMissingCostsWarning(true)
      }

      setMissingCostsModal({
        isOpen: true,
        rows: missingRows,
      })
      return
    }

    generateCostsPDF({ rows: costRows })
  }

  const handleSaveCostsAndGenerate = () => {
    const updatedValuesById = {}

    missingCostsModal.rows.forEach((row) => {
      const productId = String(row?.id ?? '')
      const baseProduct = productsById[productId]
      if (!productId || !baseProduct) return

      const nextReferenceCost = toPositiveNumber(row.referenceCost)
      const nextSalePrice = toPositiveNumber(row.salePrice)

      updatedValuesById[productId] = {
        referenceCost: nextReferenceCost,
        salePrice: nextSalePrice,
      }

      if (typeof onSaveProduct === 'function') {
        onSaveProduct({
          id: String(baseProduct.id),
          name: String(baseProduct.name ?? ''),
          category: String(baseProduct.category ?? ''),
          stockMinimo: toPositiveNumber(baseProduct.stockMinimo),
          referenceCost: nextReferenceCost,
          salePrice: nextSalePrice,
          image: String(baseProduct.image ?? ''),
        })
      }
    })

    const rowsForPdf = costRows.map((row) => {
      const override = updatedValuesById[row.id]
      if (!override) return row

      const margin = override.salePrice - override.referenceCost
      return {
        ...row,
        referenceCost: override.referenceCost,
        salePrice: override.salePrice,
        margin,
        marginPercent: override.salePrice > 0 ? (margin / override.salePrice) * 100 : 0,
      }
    })

    closeMissingCostsModal()
    generateCostsPDF({ rows: rowsForPdf })
  }

  const toggleCategory = (categoryKey) => {
    setSelectedCategories((prev) => ({
      ...prev,
      [categoryKey]: !prev[categoryKey],
    }))
    setSelectionMode('categories')
  }

  const toggleProduct = (productId) => {
    const key = String(productId ?? '')
    if (!key) return

    setSelectedProductIds((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
    setSelectionMode('manual')
  }

  return (
    <section className="page-section">
      <header className="page-header">
        <h2 className="section-title">Reportes</h2>
        <p>Generá PDFs empresariales a partir de datos existentes del sistema.</p>
      </header>

      <div className="reports-grid">
        <section className="card-block">
          <div className="card-head">
            <h3>Lista de precios</h3>
          </div>

          <div className="reports-controls">
            <label>
              <input
                type="checkbox"
                checked={selectionMode === 'all'}
                onChange={() => setSelectionMode('all')}
              />{' '}
              Todos
            </label>
            <label>
              <input
                type="checkbox"
                checked={selectionMode === 'manual'}
                onChange={() => setSelectionMode('manual')}
              />{' '}
              Selección manual
            </label>
          </div>

          <div className="reports-controls reports-controls-categories">
            {CATEGORY_OPTIONS.map((option) => (
              <label key={option.key}>
                <input
                  type="checkbox"
                  checked={Boolean(selectedCategories[option.key])}
                  onChange={() => toggleCategory(option.key)}
                />{' '}
                {option.label}
              </label>
            ))}
          </div>

          {selectionMode === 'manual' && (
            <div className="reports-manual-list">
              {productsSorted.map((product) => {
                const productId = String(product?.id ?? '')
                return (
                  <label key={productId} className="reports-manual-item">
                    <input
                      type="checkbox"
                      checked={Boolean(selectedProductIds[productId])}
                      onChange={() => toggleProduct(productId)}
                    />
                    <span>{String(product?.name ?? 'Sin nombre')}</span>
                  </label>
                )
              })}
            </div>
          )}

          <div className="product-actions">
            <button type="button" className="primary-btn" onClick={handleGeneratePriceList}>
              Generar lista de precios
            </button>
          </div>
        </section>

        <section className="card-block">
          <div className="card-head">
            <h3>Costos</h3>
          </div>
          <p className="muted-label">Incluye costo de referencia, precio de venta y margen por producto.</p>
          <div className="product-actions">
            <button
              type="button"
              className="secondary-btn"
              onClick={handleGenerateCostsReport}
            >
              Reporte de costos
            </button>
          </div>
        </section>

        <section className="card-block">
          <div className="card-head">
            <h3>Deudas</h3>
          </div>
          <p className="muted-label">Consolidado por cliente con días de deuda y cantidad de pedidos.</p>
          <div className="product-actions">
            <button
              type="button"
              className="secondary-btn"
              onClick={() => generateDebtPDF({ rows: debtRows })}
              disabled={debtRows.length === 0}
            >
              Reporte de deudas
            </button>
          </div>
        </section>

        <section className="card-block">
          <div className="card-head">
            <h3>Ranking de clientes</h3>
          </div>

          <div className="ranking-grid">
            <div className="ranking-panel">
              <h4>Mejores clientes</h4>
              <div className="table-wrap">
                <table className="orders-table">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Facturado</th>
                      <th>Pedidos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topBilledClients.map((row) => (
                      <tr key={`billed-${row.clientKey}`}>
                        <td>{row.clientName}</td>
                        <td>{formatCurrency(row.totalFacturado)}</td>
                        <td>{row.cantidadPedidos}</td>
                      </tr>
                    ))}
                    {topBilledClients.length === 0 && (
                      <tr>
                        <td colSpan={3} className="empty-detail">Sin datos.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="ranking-panel">
              <h4>Clientes con mayor deuda</h4>
              <div className="table-wrap">
                <table className="orders-table">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Deuda total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topDebtClients.map((row) => (
                      <tr key={`debt-${row.clientKey}`}>
                        <td>{row.clientName}</td>
                        <td>{formatCurrency(row.totalDeuda)}</td>
                      </tr>
                    ))}
                    {topDebtClients.length === 0 && (
                      <tr>
                        <td colSpan={2} className="empty-detail">Sin datos.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="ranking-panel">
              <h4>Clientes más cumplidores</h4>
              <div className="table-wrap">
                <table className="orders-table">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>% pago</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topComplianceClients.map((row) => (
                      <tr key={`pay-${row.clientKey}`}>
                        <td>{row.clientName}</td>
                        <td>{Math.round(row.porcentajePago * 100)}%</td>
                      </tr>
                    ))}
                    {topComplianceClients.length === 0 && (
                      <tr>
                        <td colSpan={2} className="empty-detail">Sin datos.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <section className="card-block">
          <div className="card-head">
            <h3>Estado de cuenta cliente</h3>
          </div>
          <div className="reports-controls">
            <label>
              <input
                type="radio"
                name="account-scope"
                checked={accountScope === 'single'}
                onChange={() => setAccountScope('single')}
              />{' '}
              Seleccionar cliente
            </label>
            <label>
              <input
                type="radio"
                name="account-scope"
                checked={accountScope === 'all'}
                onChange={() => setAccountScope('all')}
              />{' '}
              Todos los clientes
            </label>
          </div>
          {accountScope === 'single' && (
            <div className="reports-controls">
              <label>
                Cliente{' '}
                <select
                  className="inline-select"
                  value={selectedAccountClientKey}
                  onChange={(event) => setSelectedAccountClientKey(event.target.value)}
                >
                  <option value="">Seleccionar cliente</option>
                  {accountClientOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <p className="muted-label">Pedidos: {accountRows.length}</p>
          <div className="product-actions">
            <button
              type="button"
              className="secondary-btn"
              onClick={() =>
                generateClientAccountPDF({
                  rows: accountRows,
                  scopeLabel: accountScope === 'all' ? 'Todos los clientes' : 'Cliente seleccionado',
                })
              }
              disabled={accountRows.length === 0 || (accountScope === 'single' && !selectedAccountClientKey)}
            >
              Generar estado de cuenta PDF
            </button>
          </div>
        </section>

        <section className="card-block">
          <div className="card-head">
            <h3>Estado de stock</h3>
          </div>
          <p className="muted-label">Productos ordenados por menor stock disponible.</p>
          <div className="product-actions">
            <button
              type="button"
              className="secondary-btn"
              onClick={() => generateStockStatusPDF({ rows: stockRows })}
              disabled={stockRows.length === 0}
            >
              Exportar estado de stock
            </button>
          </div>
        </section>

        <section className="card-block">
          <div className="card-head">
            <h3>Egresos</h3>
          </div>
          <p className="muted-label">Fuente: packya_expenses.</p>
          <p className="muted-label">Registros: {expensesRows.length}</p>
          <p className="muted-label">Resumen por socio: {expensesSummaryByPartner.length}</p>
          <p className="muted-label">Resumen por categoría: {expensesSummaryByCategory.length}</p>
          <div className="product-actions">
            <button
              type="button"
              className="secondary-btn"
              onClick={() =>
                generateExpensesReportPDF({
                  rows: expensesRows,
                  summaryByPartner: expensesSummaryByPartner,
                  summaryByCategory: expensesSummaryByCategory,
                })
              }
              disabled={expensesRows.length === 0}
            >
              Exportar egresos PDF
            </button>
          </div>
        </section>

        <section className="card-block">
          <div className="card-head">
            <h3>Producción</h3>
          </div>
          <p className="muted-label">Cálculo basado en pedidos entregados.</p>
          <p className="muted-label">Cantidad producida: {productionRows.totalProduced}</p>
          <p className="muted-label">Categorías: {productionRows.categoryRows.length}</p>
          <p className="muted-label">Meses: {productionRows.monthRows.length}</p>
          <div className="product-actions">
            <button
              type="button"
              className="secondary-btn"
              onClick={() =>
                generateProductionReportPDF({
                  monthRows: productionRows.monthRows,
                  categoryRows: productionRows.categoryRows,
                  totalProduced: productionRows.totalProduced,
                })
              }
              disabled={productionRows.totalProduced <= 0}
            >
              Exportar producción PDF
            </button>
          </div>
        </section>
      </div>

      {missingPriceModal.isOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Producto sin precio">
          <div className="modal-card reports-missing-price-modal">
            <h4>Producto sin precio</h4>
            <p className="muted-label">Ingresá precio para este reporte o excluí el producto.</p>

            <div className="reports-missing-table-wrap">
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Categoría</th>
                    <th>Precio</th>
                    <th>Excluir</th>
                  </tr>
                </thead>
                <tbody>
                  {missingPriceModal.rows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.name}</td>
                      <td>{row.category}</td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={row.overridePrice}
                          onChange={(event) =>
                            handleMissingPriceChange(row.id, 'overridePrice', event.target.value)
                          }
                          disabled={row.exclude}
                          placeholder="Ingresar precio"
                        />
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          checked={row.exclude}
                          onChange={(event) =>
                            handleMissingPriceChange(row.id, 'exclude', event.target.checked)
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="product-actions">
              <button type="button" className="secondary-btn" onClick={closeMissingPriceModal}>
                Cancelar
              </button>
              <button type="button" className="primary-btn" onClick={handleConfirmMissingPrice}>
                Generar PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {missingCostsModal.isOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Producto sin costo o precio cargado">
          <div className="modal-card reports-missing-price-modal">
            <h4>⚠ Producto sin costo o precio cargado</h4>
            <p className="muted-label">Completá costo y precio para continuar con el reporte de costos.</p>

            <div className="reports-missing-table-wrap">
              <table className="orders-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Costo producto</th>
                    <th>Precio producto</th>
                  </tr>
                </thead>
                <tbody>
                  {missingCostsModal.rows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.name}</td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={row.referenceCost}
                          onChange={(event) =>
                            handleMissingCostsChange(row.id, 'referenceCost', event.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={row.salePrice}
                          onChange={(event) =>
                            handleMissingCostsChange(row.id, 'salePrice', event.target.value)
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="product-actions">
              <button type="button" className="secondary-btn" onClick={closeMissingCostsModal}>
                Cancelar
              </button>
              <button type="button" className="primary-btn" onClick={handleSaveCostsAndGenerate}>
                Guardar y generar PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default ReportsPage
