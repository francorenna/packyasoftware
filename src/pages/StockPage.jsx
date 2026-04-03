import { useEffect, useMemo, useState } from 'react'
import { downloadPurchasePlanPDF, openPurchasePlanPDF } from '../utils/pdf'

const PURCHASE_PLANS_STORAGE_KEY = 'packya_purchase_plans'
const ACTIVE_ORDER_STATUSES = new Set([
  'pendiente',
  'confirmado',
  'en producción',
  'en produccion',
  'en proceso',
  'listo',
])
const SHORTAGE_ACTIVE_STATUSES = new Set(['pendiente', 'en proceso', 'listo'])

const formatDateTime = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sin registro'

  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const formatCurrency = (value) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))

const loadPurchasePlans = () => {
  try {
    const raw = localStorage.getItem(PURCHASE_PLANS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const createManualPlanRow = () => ({
  mode: 'existing',
  productId: '',
  customName: '',
  quantity: '100',
  unitCost: '',
})

const stockAlertBadgeStyle = {
  display: 'inline-flex',
  justifyContent: 'center',
  minWidth: '110px',
}

const centeredAlertCellStyle = {
  textAlign: 'center',
}

const modalContainerStyle = {
  maxHeight: '90vh',
  display: 'flex',
  flexDirection: 'column',
}

const modalBodyStyle = {
  overflowY: 'auto',
  flex: 1,
  minHeight: 0,
}

function StockPage({ products, orders, purchases, onAdjustStock, onUpdateProductReferenceCost }) {
  const safeProducts = useMemo(() => (Array.isArray(products) ? products : []), [products])
  const safeOrders = useMemo(() => (Array.isArray(orders) ? orders : []), [orders])
  const safePurchases = useMemo(() => (Array.isArray(purchases) ? purchases : []), [purchases])
  const [open, setOpen] = useState(false)
  const [productId, setProductId] = useState('')
  const [mode, setMode] = useState('sum') // 'sum' or 'sub'
  const [quantity, setQuantity] = useState('')
  const [countedStock, setCountedStock] = useState('')
  const [wasPurchase, setWasPurchase] = useState(false)
  const [purchaseSpent, setPurchaseSpent] = useState('')
  const [reason, setReason] = useState('')
  const [plans, setPlans] = useState(() => loadPurchasePlans())
  const [costModalOpen, setCostModalOpen] = useState(false)
  const [planBuilderOpen, setPlanBuilderOpen] = useState(false)
  const [recommendedPlanRows, setRecommendedPlanRows] = useState([])
  const [recommendedSelectionById, setRecommendedSelectionById] = useState({})
  const [manualPlanRows, setManualPlanRows] = useState([createManualPlanRow()])
  const [pendingPlanRows, setPendingPlanRows] = useState([])
  const [missingCostDrafts, setMissingCostDrafts] = useState({})
  const [deletePlanModalOpen, setDeletePlanModalOpen] = useState(false)
  const [deletePlanTarget, setDeletePlanTarget] = useState(null)
  const [deletePlanInput, setDeletePlanInput] = useState('')
  const [date, setDate] = useState(() => {
    const d = new Date()
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  })

  const movementRows = useMemo(() => {
    return safeProducts
      .flatMap((product) => {
        const productMovements = Array.isArray(product?.stockMovements)
          ? product.stockMovements
          : []

        return productMovements.map((movement, index) => ({
          id: String(movement?.id ?? `${product.id}-mov-${index}`),
          productId: String(product.id),
          productName: String(product.name ?? 'Sin producto'),
          date: String(movement?.date ?? ''),
          type: String(movement?.type ?? 'Ajuste'),
          amount: Number(movement?.amount ?? 0),
          reason: String(movement?.reason ?? '').trim(),
        }))
      })
      .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime())
  }, [safeProducts])

  const productById = useMemo(
    () =>
      safeProducts.reduce((acc, product) => {
        acc[String(product.id)] = product
        return acc
      }, {}),
    [safeProducts],
  )

  const productIdByName = useMemo(
    () =>
      safeProducts.reduce((acc, product) => {
        const key = String(product?.name ?? '').trim().toLowerCase()
        if (!key) return acc
        acc[key] = String(product.id)
        return acc
      }, {}),
    [safeProducts],
  )

  const averageUnitCostByProductId = useMemo(() => {
    const totals = {}

    safePurchases.forEach((purchase) => {
      const items = Array.isArray(purchase?.items) ? purchase.items : []
      items.forEach((item) => {
        const id = String(item?.productId ?? '')
        if (!id) return

        const qty = Number(item?.quantity || 0)
        const unitCost = Number(item?.unitCost || 0)
        if (qty <= 0 || unitCost <= 0) return

        const row = totals[id] ?? { units: 0, cost: 0 }
        row.units += qty
        row.cost += qty * unitCost
        totals[id] = row
      })
    })

    return Object.keys(totals).reduce((acc, id) => {
      const row = totals[id]
      acc[id] = row.units > 0 ? row.cost / row.units : 0
      return acc
    }, {})
  }, [safePurchases])

  const productStockSummary = useMemo(() => {
    return safeProducts.map((product) => {
      const movements = Array.isArray(product?.stockMovements) ? product.stockMovements : []

      const stockActual = movements.reduce(
        (acc, movement) => acc + Number(movement?.amount || 0),
        0,
      )
      const totalComprado = movements.reduce(
        (acc, movement) =>
          String(movement?.type ?? '') === 'Compra'
            ? acc + Math.max(Number(movement?.amount || 0), 0)
            : acc,
        0,
      )
      const totalVendido = movements.reduce(
        (acc, movement) =>
          String(movement?.type ?? '') === 'Venta'
            ? acc + Math.abs(Number(movement?.amount || 0))
            : acc,
        0,
      )
      const totalMuestras = movements.reduce(
        (acc, movement) =>
          String(movement?.type ?? '') === 'Muestra'
            ? acc + Math.abs(Number(movement?.amount || 0))
            : acc,
        0,
      )
      const lastMovement = movements
        .slice()
        .sort((a, b) => new Date(b?.date || 0).getTime() - new Date(a?.date || 0).getTime())[0]

      return {
        id: String(product?.id ?? ''),
        name: String(product?.name ?? 'Sin producto'),
        referenceCost: Number(product?.referenceCost || 0),
        stockActual,
        totalComprado,
        totalVendido,
        totalMuestras,
        lastMovementDate: lastMovement?.date,
      }
    })
  }, [safeProducts])

  const stockByProductId = useMemo(
    () =>
      productStockSummary.reduce((acc, row) => {
        acc[String(row.id)] = Number(row.stockActual || 0)
        return acc
      }, {}),
    [productStockSummary],
  )

  const shortageCalculatorRows = useMemo(() => {
    const requiredByProductId = {}

    safeOrders.forEach((order) => {
      if (order?.isArchived === true) return

      const status = String(order?.status ?? '').trim().toLowerCase()
      if (!SHORTAGE_ACTIVE_STATUSES.has(status)) return

      const orderItems = Array.isArray(order?.items) ? order.items : []
      orderItems.forEach((item) => {
        if (item?.isClientMaterial) return

        const resolvedId =
          String(item?.productId ?? '') ||
          productIdByName[String(item?.productName ?? item?.product ?? '').trim().toLowerCase()] ||
          ''
        if (!resolvedId) return

        const qty = Math.max(Number(item?.quantity || 0), 0)
        if (qty <= 0) return

        requiredByProductId[resolvedId] = (requiredByProductId[resolvedId] ?? 0) + qty
      })
    })

    return safeProducts
      .map((product) => {
        const productId = String(product?.id ?? '')
        const required = Number(requiredByProductId[productId] || 0)
        const stock = Number(stockByProductId[productId] || 0)
        const missing = Math.max(required - stock, 0)

        return {
          productId,
          productName: String(product?.name ?? 'Sin producto'),
          required,
          stock,
          missing,
        }
      })
      .sort((a, b) => {
        if (b.missing !== a.missing) return b.missing - a.missing
        return a.productName.localeCompare(b.productName, 'es', { sensitivity: 'base' })
      })
  }, [safeOrders, safeProducts, stockByProductId, productIdByName])

  const selectedProductStock = Number(stockByProductId[String(productId ?? '')] || 0)

  const countedStockNumber = Number(countedStock)
  const previewSetDifference =
    mode === 'set' && !Number.isNaN(countedStockNumber)
      ? countedStockNumber - selectedProductStock
      : null

  useEffect(() => {
    try {
      localStorage.setItem(PURCHASE_PLANS_STORAGE_KEY, JSON.stringify(plans))
    } catch (error) {
      void error
    }
  }, [plans])

  const buildPlanRows = () => {
    const demandByProductId = {}

    safeOrders.forEach((order) => {
      if (order?.isArchived === true) return

      const status = String(order?.status ?? '').trim().toLowerCase()
      if (!ACTIVE_ORDER_STATUSES.has(status)) return

      const orderItems = Array.isArray(order?.items) ? order.items : []
      orderItems.forEach((item) => {
        const resolvedId =
          String(item?.productId ?? '') ||
          productIdByName[String(item?.productName ?? item?.product ?? '').trim().toLowerCase()] ||
          ''
        if (!resolvedId) return
        const qty = Math.max(Number(item?.quantity || 0), 0)
        if (qty <= 0) return

        demandByProductId[resolvedId] = (demandByProductId[resolvedId] ?? 0) + qty
      })
    })

    return Object.keys(demandByProductId)
      .map((id) => {
        const product = productById[id]
        if (!product) return null

        const demandTotal = demandByProductId[id] ?? 0
        const stockActual = (Array.isArray(product?.stockMovements) ? product.stockMovements : []).reduce(
          (acc, movement) => acc + Number(movement?.amount || 0),
          0,
        )
        const faltante = Math.max(0, demandTotal - stockActual)
        if (faltante <= 0) return null

        const paquetes = Math.ceil(faltante / 100)
        const sugeridoComprar = paquetes * 100
        const avgCost = Number(averageUnitCostByProductId[id] || 0)
        const referenceCost = Number(product?.referenceCost || 0)
        const unitCost = avgCost > 0 ? avgCost : referenceCost > 0 ? referenceCost : null

        return {
          productId: id,
          productName: String(product?.name ?? 'Sin producto'),
          demandTotal,
          stockActual,
          faltante,
          sugeridoComprar,
          unitCost,
          costoEstimado: unitCost ? sugeridoComprar * unitCost : 0,
        }
      })
      .filter(Boolean)
  }

  const commitPlan = (rows) => {
    const safeRows = Array.isArray(rows) ? rows : []
    const totalEstimado = safeRows.reduce(
      (acc, row) => acc + Number(row?.costoEstimado || 0),
      0,
    )

    const nextPlan = {
      id: `PLAN-${Date.now()}`,
      createdAt: new Date().toISOString(),
      products: safeRows,
      totalEstimado,
    }

    setPlans((prev) => [nextPlan, ...prev])
    downloadPurchasePlanPDF(nextPlan)
  }

  const handleGeneratePurchasePlan = () => {
    const rows = buildPlanRows()
    const initialSelection = rows.reduce((acc, row) => {
      acc[row.productId] = true
      return acc
    }, {})

    setRecommendedPlanRows(rows)
    setRecommendedSelectionById(initialSelection)
    setManualPlanRows([createManualPlanRow()])
    setPlanBuilderOpen(true)
  }

  const parseDraftNumber = (value) => {
    const normalized = String(value ?? '').trim().replace(',', '.')
    if (!normalized) return 0
    const parsed = Number(normalized)
    return Number.isNaN(parsed) ? 0 : parsed
  }

  const getDefaultUnitCostForProduct = (selectedProductId) => {
    const id = String(selectedProductId ?? '').trim()
    if (!id) return ''

    const product = productById[id]
    if (!product) return ''

    const referenceCost = Number(product?.referenceCost || 0)
    if (referenceCost > 0) return String(referenceCost)

    const averageCost = Number(averageUnitCostByProductId[id] || 0)
    if (averageCost > 0) return String(averageCost)

    return ''
  }

  const handleManualPlanRowChange = (index, field, value) => {
    setManualPlanRows((prevRows) =>
      prevRows.map((row, rowIndex) =>
        rowIndex === index
          ? (() => {
              const nextRow = {
                ...row,
                [field]: value,
              }

              if (field === 'mode' && value === 'existing') {
                nextRow.customName = ''
                if (nextRow.productId && !String(nextRow.unitCost ?? '').trim()) {
                  nextRow.unitCost = getDefaultUnitCostForProduct(nextRow.productId)
                }
              }

              if (field === 'mode' && value === 'new') {
                nextRow.productId = ''
              }

              if (field === 'productId') {
                nextRow.unitCost = getDefaultUnitCostForProduct(value)
              }

              return nextRow
            })()
          : row,
      ),
    )
  }

  const handleAddManualPlanRow = () => {
    setManualPlanRows((prevRows) => [...prevRows, createManualPlanRow()])
  }

  const handleRemoveManualPlanRow = (index) => {
    setManualPlanRows((prevRows) => {
      if (prevRows.length === 1) return prevRows
      return prevRows.filter((_, rowIndex) => rowIndex !== index)
    })
  }

  const closePlanBuilder = () => {
    setPlanBuilderOpen(false)
    setRecommendedPlanRows([])
    setRecommendedSelectionById({})
    setManualPlanRows([createManualPlanRow()])
  }

  const handlePreparePlanFromBuilder = () => {
    const selectedRecommendations = recommendedPlanRows.filter(
      (row) => recommendedSelectionById[row.productId] !== false,
    )

    const manualRows = manualPlanRows
      .map((row, index) => {
        const mode = String(row?.mode ?? 'existing')
        const quantity = Math.max(parseDraftNumber(row?.quantity), 0)
        if (quantity <= 0) return null

        if (mode === 'existing') {
          const id = String(row?.productId ?? '').trim()
          if (!id) return null

          const product = productById[id]
          if (!product) return null

          const stockActual = (Array.isArray(product?.stockMovements) ? product.stockMovements : []).reduce(
            (acc, movement) => acc + Number(movement?.amount || 0),
            0,
          )
          const avgCost = Number(averageUnitCostByProductId[id] || 0)
          const referenceCost = Number(product?.referenceCost || 0)
          const draftUnitCost = parseDraftNumber(row?.unitCost)
          const unitCost = Number.isNaN(draftUnitCost) || draftUnitCost <= 0
            ? (avgCost > 0 ? avgCost : referenceCost > 0 ? referenceCost : null)
            : draftUnitCost

          return {
            productId: id,
            productName: String(product?.name ?? 'Sin producto'),
            demandTotal: 0,
            stockActual,
            faltante: quantity,
            sugeridoComprar: quantity,
            unitCost,
            costoEstimado: unitCost ? quantity * unitCost : 0,
          }
        }

        const customName = String(row?.customName ?? '').trim()
        if (!customName) return null

        const draftUnitCost = parseDraftNumber(row?.unitCost)
        const unitCost = Number.isNaN(draftUnitCost) || draftUnitCost <= 0 ? null : draftUnitCost

        return {
          productId: `MANUAL-${Date.now()}-${index}`,
          productName: customName,
          demandTotal: 0,
          stockActual: 0,
          faltante: quantity,
          sugeridoComprar: quantity,
          unitCost,
          costoEstimado: unitCost ? quantity * unitCost : 0,
        }
      })
      .filter(Boolean)

    const combinedRows = [...selectedRecommendations, ...manualRows]
    if (combinedRows.length === 0) {
      window.alert('Seleccioná al menos una recomendación o agregá un producto manual al plan.')
      return
    }

    const missingCostRows = combinedRows.filter((row) => !(Number(row.unitCost || 0) > 0))
    if (missingCostRows.length > 0) {
      const initialDrafts = missingCostRows.reduce((acc, row) => {
        acc[row.productId] = ''
        return acc
      }, {})

      setPendingPlanRows(combinedRows)
      setMissingCostDrafts(initialDrafts)
      setPlanBuilderOpen(false)
      setCostModalOpen(true)
      return
    }

    setPlanBuilderOpen(false)
    commitPlan(combinedRows)
  }

  const handleConfirmMissingCosts = () => {
    const withCosts = pendingPlanRows.map((row) => {
      if (Number(row.unitCost || 0) > 0) return row
      const draftCost = Number(missingCostDrafts[row.productId])
      const normalizedCost = Number.isNaN(draftCost) || draftCost <= 0 ? 0 : draftCost
      return {
        ...row,
        unitCost: normalizedCost,
        costoEstimado: normalizedCost > 0 ? row.sugeridoComprar * normalizedCost : 0,
      }
    })

    const invalidRow = withCosts.find((row) => !(Number(row.unitCost || 0) > 0))
    if (invalidRow) {
      window.alert('Completá un costo válido para todos los productos faltantes.')
      return
    }

    withCosts.forEach((row) => {
      if (!productById[row.productId]) return
      onUpdateProductReferenceCost?.(row.productId, row.unitCost)
    })

    setCostModalOpen(false)
    setPendingPlanRows([])
    setMissingCostDrafts({})
    commitPlan(withCosts)
  }

  const handleRequestDeletePlan = (plan) => {
    setDeletePlanTarget(plan)
    setDeletePlanInput('')
    setDeletePlanModalOpen(true)
  }

  const handleConfirmDeletePlan = () => {
    if (deletePlanInput !== 'ELIMINAR PLAN') return
    const targetId = String(deletePlanTarget?.id ?? '')
    if (!targetId) return

    setPlans((prev) => prev.filter((plan) => String(plan?.id ?? '') !== targetId))
    setDeletePlanModalOpen(false)
    setDeletePlanTarget(null)
    setDeletePlanInput('')
  }

  const reset = () => {
    setProductId('')
    setMode('sum')
    setQuantity('')
    setCountedStock('')
    setWasPurchase(false)
    setPurchaseSpent('')
    setReason('')
    const d = new Date()
    setDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2,'0')}`)
  }

  const handleApply = () => {
    if (!productId || !reason.trim()) return

    let signed = 0

    if (mode === 'set') {
      const targetStock = Number(countedStock)
      if (Number.isNaN(targetStock) || targetStock < 0) return

      signed = Math.trunc(targetStock - selectedProductStock)
      if (signed === 0) return
    } else {
      const qty = Number(quantity)
      if (Number.isNaN(qty) || qty <= 0) return
      signed = mode === 'sum' ? Math.abs(qty) : -Math.abs(qty)
    }

    if (wasPurchase) {
      const spent = Number(purchaseSpent)
      if (signed <= 0 || Number.isNaN(spent) || spent <= 0) return
      const derivedUnitCost = spent / signed
      if (Number.isFinite(derivedUnitCost) && derivedUnitCost > 0) {
        onUpdateProductReferenceCost?.(productId, derivedUnitCost)
      }
    }

    const reasonWithSpend = (() => {
      if (!wasPurchase) return reason.trim()
      const spent = Number(purchaseSpent)
      if (Number.isNaN(spent) || spent <= 0) return reason.trim()
      return `${reason.trim()} | Gasto reposición: ${formatCurrency(spent)}`
    })()

    const isoDate = new Date(`${date}T00:00:00`).toISOString()
    onAdjustStock(productId, signed, reasonWithSpend, isoDate)
    reset()
    setOpen(false)
  }

  const openQuickStockCorrection = (targetProductId) => {
    const safeProductId = String(targetProductId ?? '').trim()
    if (!safeProductId) return

    const currentStock = Number(stockByProductId[safeProductId] || 0)
    setOpen(true)
    setProductId(safeProductId)
    setMode('set')
    setCountedStock(String(Math.max(currentStock, 0)))
    setQuantity('')
    setWasPurchase(false)
    setPurchaseSpent('')
    setReason('Regularización por conteo físico')
  }

  return (
    <section className="page-section">
      <header className="page-header">
        <h2 className="section-title">Stock</h2>
        <p>Control de inventario y movimientos.</p>
      </header>

      <div className="card-block">
        <div className="card-head">
          <h3>Movimientos de stock</h3>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="primary-btn" onClick={() => setOpen((v) => !v)}>➕ Ajustar stock</button>
          <button className="secondary-btn" onClick={handleGeneratePurchasePlan}>Generar Plan de Compra</button>
          <p className="muted-label">Crear movimientos manuales sin impactar finanzas.</p>
        </div>

        {open && (
          <div className="adjustment-grid" style={{ marginTop: 12 }}>
            <label>
              Producto
              <select value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">Seleccionar producto</option>
                {safeProducts.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>

            <label>
              Tipo
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="sum">Sumar</option>
                <option value="sub">Restar</option>
                <option value="set">Establecer stock real</option>
              </select>
            </label>

            {mode === 'set' ? (
              <>
                <label>
                  Stock real contado
                  <input type="number" min="0" value={countedStock} onChange={(e) => setCountedStock(e.target.value)} />
                </label>
                <p className="payment-helper" style={{ marginTop: -4 }}>
                  Stock actual: <strong>{selectedProductStock}</strong>
                  {previewSetDifference !== null && (
                    <>
                      {' '}· Ajuste a aplicar:{' '}
                      <strong className={previewSetDifference < 0 ? 'finance-result-negative' : ''}>
                        {previewSetDifference >= 0 ? `+${previewSetDifference}` : previewSetDifference}
                      </strong>
                    </>
                  )}
                </p>
              </>
            ) : (
              <label>
                Cantidad
                <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </label>
            )}

            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={wasPurchase}
                onChange={(event) => setWasPurchase(event.target.checked)}
                disabled={mode === 'sub'}
              />
              Fue reposición por compra
            </label>

            {wasPurchase && (
              <label>
                Gasto total de esta reposición
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={purchaseSpent}
                  onChange={(event) => setPurchaseSpent(event.target.value)}
                  placeholder="Monto gastado"
                />
              </label>
            )}

            <label>
              Motivo
              <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} />
            </label>

            <label>
              Fecha
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>

            <div className="product-actions">
              <button type="button" className="secondary-btn" onClick={() => { reset(); setOpen(false) }}>Cancelar</button>
              <button type="button" className="primary-btn" onClick={handleApply}>Aplicar ajuste</button>
            </div>
          </div>
        )}

        <div style={{ marginTop: 18 }}>
          <h4>Productos</h4>
          <table className="products-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Costo referencia</th>
                <th>Stock actual</th>
                <th style={centeredAlertCellStyle}>Alerta</th>
                <th>Total comprado</th>
                <th>Total vendido</th>
                <th>Total muestras</th>
                <th>Último movimiento</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {productStockSummary.map((product) => (
                <tr key={product.id}>
                  <td>{product.name}</td>
                  <td>{formatCurrency(product.referenceCost)}</td>
                  <td>
                    <span className={Number(product.stockActual) <= 0 ? 'finance-result-negative' : ''}>
                      {product.stockActual}
                    </span>
                  </td>
                  <td style={centeredAlertCellStyle}>
                    {Number(product.stockActual) <= 0 ? (
                      <span className="status-badge status-cancelado" style={stockAlertBadgeStyle}>🔴 Sin stock</span>
                    ) : Number(product.stockActual) <= 10 ? (
                      <span className="status-badge status-pendiente" style={stockAlertBadgeStyle}>🟡 Bajo stock</span>
                    ) : (
                      <span style={stockAlertBadgeStyle}>-</span>
                    )}
                  </td>
                  <td>{product.totalComprado}</td>
                  <td>{product.totalVendido}</td>
                  <td>{product.totalMuestras}</td>
                  <td>{formatDateTime(product.lastMovementDate)}</td>
                  <td>
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() => openQuickStockCorrection(product.id)}
                    >
                      Corregir stock
                    </button>
                  </td>
                </tr>
              ))}

              {productStockSummary.length === 0 && (
                <tr>
                  <td colSpan={9} className="empty-detail">
                    No hay productos registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 18 }}>
          <h4>Calculadora de Faltantes</h4>
          <table className="products-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cantidad requerida</th>
                <th>Stock actual</th>
                <th>Faltante estimado</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {shortageCalculatorRows.map((row) => (
                <tr key={`shortage-${row.productId}`}>
                  <td>{row.productName}</td>
                  <td>{row.required}</td>
                  <td>{row.stock}</td>
                  <td className={row.missing > 0 ? 'finance-result-negative' : ''}>{row.missing}</td>
                  <td>
                    {row.missing > 0 ? (
                      <span className="status-badge status-pendiente" style={stockAlertBadgeStyle}>⚠ Stock insuficiente</span>
                    ) : (
                      <span style={stockAlertBadgeStyle}>-</span>
                    )}
                  </td>
                </tr>
              ))}

              {shortageCalculatorRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-detail">
                    No hay productos para calcular faltantes.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 18 }}>
          <h4>Historial completo de movimientos</h4>
          <table className="products-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Cantidad</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {movementRows.map((movement) => {
                const signedAmount = Number(movement.amount)
                const amountLabel = `${signedAmount >= 0 ? '+' : ''}${signedAmount}`
                return (
                  <tr key={`${movement.productId}-${movement.id}`}>
                    <td>{movement.productName}</td>
                    <td>{formatDateTime(movement.date)}</td>
                    <td>{movement.type}</td>
                    <td className={signedAmount < 0 ? 'finance-result-negative' : ''}>{amountLabel}</td>
                    <td>{movement.reason || 'Sin motivo'}</td>
                  </tr>
                )
              })}

              {movementRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-detail">
                    No hay movimientos registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 18 }}>
          <h4>Historial de Planes de Compra</h4>
          <table className="products-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Fecha</th>
                <th>Productos</th>
                <th>Total estimado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => (
                <tr key={plan.id}>
                  <td>{plan.id}</td>
                  <td>{formatDateTime(plan.createdAt)}</td>
                  <td>{Array.isArray(plan.products) ? plan.products.length : 0}</td>
                  <td>{formatCurrency(plan.totalEstimado)}</td>
                  <td>
                    <div className="product-row-actions">
                      <button type="button" className="quick-fill-btn" onClick={() => openPurchasePlanPDF(plan)}>
                        Ver PDF
                      </button>
                      <button type="button" className="quick-fill-btn" onClick={() => downloadPurchasePlanPDF(plan)}>
                        Descargar
                      </button>
                      <button type="button" className="quick-fill-btn" onClick={() => handleRequestDeletePlan(plan)}>
                        Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {plans.length === 0 && (
                <tr>
                  <td colSpan={5} className="empty-detail">
                    No hay planes de compra generados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {planBuilderOpen && (
        <div className="modal-overlay">
          <div className="modal-card plan-builder-modal" style={modalContainerStyle}>
            <div>
              <h4>Armar plan de compra</h4>
              <p className="payment-helper">
                Las recomendaciones del sistema se muestran siempre y podés aceptarlas o no.
              </p>
            </div>

            <div style={modalBodyStyle}>
              <div style={{ marginTop: 10 }}>
                <h4 style={{ marginBottom: 8 }}>Recomendaciones del programa</h4>
                <div className="table-wrap">
                  <table className="products-table">
                    <thead>
                      <tr>
                        <th>Incluir</th>
                        <th>Producto</th>
                        <th>Faltante</th>
                        <th>Sugerido</th>
                        <th>Costo estimado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recommendedPlanRows.map((row) => (
                        <tr key={`recommended-${row.productId}`}>
                          <td>
                            <input
                              type="checkbox"
                              checked={recommendedSelectionById[row.productId] !== false}
                              onChange={(event) =>
                                setRecommendedSelectionById((prev) => ({
                                  ...prev,
                                  [row.productId]: event.target.checked,
                                }))
                              }
                            />
                          </td>
                          <td>{row.productName}</td>
                          <td>{row.faltante}</td>
                          <td>{row.sugeridoComprar}</td>
                          <td>{formatCurrency(row.costoEstimado)}</td>
                        </tr>
                      ))}
                      {recommendedPlanRows.length === 0 && (
                        <tr>
                          <td colSpan={5} className="empty-detail">
                            No hay recomendaciones automáticas disponibles.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <h4 style={{ marginBottom: 8 }}>Listado armado por cliente</h4>
                <div className="adjustment-grid">
                  {manualPlanRows.map((row, index) => (
                    <div key={`manual-plan-${index}`} className="plan-builder-manual-row">
                      <select
                        value={row.mode}
                        onChange={(event) => handleManualPlanRowChange(index, 'mode', event.target.value)}
                      >
                        <option value="existing">Producto existente</option>
                        <option value="new">Producto nuevo</option>
                      </select>

                      {row.mode === 'existing' ? (
                        <select
                          value={row.productId}
                          onChange={(event) => handleManualPlanRowChange(index, 'productId', event.target.value)}
                        >
                          <option value="">Seleccionar producto</option>
                          {safeProducts.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={row.customName}
                          onChange={(event) => handleManualPlanRowChange(index, 'customName', event.target.value)}
                          placeholder="Nombre del producto nuevo"
                        />
                      )}

                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={row.quantity}
                        onChange={(event) => handleManualPlanRowChange(index, 'quantity', event.target.value)}
                        placeholder="Cantidad"
                      />

                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.unitCost}
                        onChange={(event) => handleManualPlanRowChange(index, 'unitCost', event.target.value)}
                        placeholder="Costo unit. (opcional)"
                      />

                      <button
                        type="button"
                        className="danger-ghost-btn"
                        onClick={() => handleRemoveManualPlanRow(index)}
                      >
                        Quitar
                      </button>
                    </div>
                  ))}
                </div>

                <div className="product-actions" style={{ marginTop: 10 }}>
                  <button type="button" className="secondary-btn" onClick={handleAddManualPlanRow}>
                    + Agregar producto manual
                  </button>
                </div>
              </div>
            </div>

            <div className="product-actions" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="secondary-btn"
                onClick={closePlanBuilder}
              >
                Cancelar
              </button>
              <button type="button" className="primary-btn" onClick={handlePreparePlanFromBuilder}>
                Continuar con plan
              </button>
            </div>
          </div>
        </div>
      )}

      {costModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card" style={modalContainerStyle}>
            <div>
              <h4>Completar costos faltantes</h4>
              <p className="payment-helper">
                Se necesita costo unitario para generar el plan de compra acumulado.
              </p>
            </div>

            <div className="adjustment-grid" style={{ ...modalBodyStyle, marginTop: 10 }}>
              {pendingPlanRows
                .filter((row) => !(Number(row.unitCost || 0) > 0))
                .map((row) => (
                  <label key={row.productId}>
                    {row.productName}
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={missingCostDrafts[row.productId] ?? ''}
                      onChange={(event) =>
                        setMissingCostDrafts((prev) => ({
                          ...prev,
                          [row.productId]: event.target.value,
                        }))
                      }
                      placeholder="Costo unitario"
                    />
                  </label>
                ))}
            </div>

            <div className="product-actions" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => {
                  setCostModalOpen(false)
                  setPendingPlanRows([])
                  setMissingCostDrafts({})
                }}
              >
                Cancelar
              </button>
              <button type="button" className="primary-btn" onClick={handleConfirmMissingCosts}>
                Generar plan
              </button>
            </div>
          </div>
        </div>
      )}

      {deletePlanModalOpen && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h4>Eliminar plan de compra</h4>
            <p className="payment-helper">ID: <strong>{String(deletePlanTarget?.id ?? '-')}</strong></p>
            <p className="payment-helper">Fecha: <strong>{formatDateTime(deletePlanTarget?.createdAt)}</strong></p>
            <p className="payment-helper">Total estimado: <strong>{formatCurrency(deletePlanTarget?.totalEstimado)}</strong></p>
            <p className="payment-error" style={{ marginTop: 8 }}>
              Escribí exactamente <strong>ELIMINAR PLAN</strong> para confirmar.
            </p>

            <input
              type="text"
              value={deletePlanInput}
              onChange={(event) => setDeletePlanInput(event.target.value)}
              placeholder="ELIMINAR PLAN"
            />

            <div className="product-actions" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => {
                  setDeletePlanModalOpen(false)
                  setDeletePlanTarget(null)
                  setDeletePlanInput('')
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="danger-ghost-btn"
                onClick={handleConfirmDeletePlan}
                disabled={deletePlanInput !== 'ELIMINAR PLAN'}
              >
                Eliminar plan
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default StockPage
