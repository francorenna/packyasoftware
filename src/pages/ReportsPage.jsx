import { useMemo, useState } from 'react'
import { getOrderFinancialSummary } from '../utils/finance'
import { generateCostsPDF, generateDebtPDF, generatePriceListPDF } from '../utils/reportsPdf'

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

const getDaysBetween = (value, now) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 0
  const diffMs = now.getTime() - date.getTime()
  return Math.max(Math.floor(diffMs / (1000 * 60 * 60 * 24)), 0)
}

function ReportsPage({ products, orders, clients }) {
  const safeProducts = useMemo(() => (Array.isArray(products) ? products : []), [products])
  const safeOrders = useMemo(() => (Array.isArray(orders) ? orders : []), [orders])
  const safeClients = useMemo(() => (Array.isArray(clients) ? clients : []), [clients])

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
              onClick={() => generateCostsPDF({ rows: costRows })}
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
    </section>
  )
}

export default ReportsPage
