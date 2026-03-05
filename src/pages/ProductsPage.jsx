import { useMemo, useState } from 'react'
import { PRODUCT_CATEGORIES } from '../state/useProductsState'
import { calculateStockSnapshot } from '../utils/stock'

const createInitialForm = () => ({
  name: '',
  category: 'OTRO',
  stockMinimo: 0,
  referenceCost: 0,
  salePrice: 0,
})

const createInitialAdjustment = () => ({
  amount: '',
  reason: '',
})

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

const normalizeCategory = (value) => {
  const normalized = String(value ?? '').trim().toUpperCase()
  return PRODUCT_CATEGORIES.includes(normalized) ? normalized : ''
}

const inferCategoryByName = (value) => {
  const normalizedName = String(value ?? '').trim().toLowerCase()
  if (normalizedName.includes('embalaje')) return 'EMBALAJE'
  if (normalizedName.includes('caja')) return 'CAJA'
  if (normalizedName.includes('bolsa')) return 'BOLSA'
  if (normalizedName.includes('separador')) return 'OTRO'
  return 'OTRO'
}

const getCategoryFromProduct = (product) =>
  normalizeCategory(product?.category) || inferCategoryByName(product?.name)

const getProductMeasure = (name) => {
  const safeName = String(name ?? '')
  const match = safeName.match(/\d+\s*x\s*\d+(?:\s*x\s*\d+)?/i)
  return match ? match[0].replace(/\s+/g, '') : '-'
}

const categoryTitles = {
  CAJA: 'CAJAS',
  BOLSA: 'BOLSAS',
  EMBALAJE: 'EMBALAJE',
  OTRO: 'OTROS',
}

function ProductsPage({
  products,
  orders,
  onSaveProduct,
  onDeleteProduct,
  onUpdateProductReferenceCost,
  onAdjustStock,
}) {
  const [form, setForm] = useState(createInitialForm())
  const [quickEditingId, setQuickEditingId] = useState(null)
  const [quickDrafts, setQuickDrafts] = useState({})
  const [adjustingProductId, setAdjustingProductId] = useState(null)
  const [historyProductId, setHistoryProductId] = useState(null)
  const [adjustment, setAdjustment] = useState(createInitialAdjustment())

  const stockRows = useMemo(
    () => calculateStockSnapshot(products, orders),
    [products, orders],
  )

  const adjustingProduct = useMemo(
    () => stockRows.find((row) => row.id === adjustingProductId) ?? null,
    [adjustingProductId, stockRows],
  )

  const historyProduct = useMemo(
    () => stockRows.find((row) => row.id === historyProductId) ?? null,
    [historyProductId, stockRows],
  )

  const adjustmentAmount = Number(adjustment.amount)
  const isAdjustmentAmountValid = !Number.isNaN(adjustmentAmount) && adjustmentAmount !== 0
  const hasReason = adjustment.reason.trim().length > 0
  const projectedStock = (adjustingProduct?.stockTotal ?? 0) + (isAdjustmentAmountValid ? adjustmentAmount : 0)
  const adjustmentWouldBeNegative = adjustingProduct && projectedStock < 0

  const groupedProducts = useMemo(() => {
    const safeRows = Array.isArray(stockRows) ? stockRows : []

    return PRODUCT_CATEGORIES.map((category) => {
      const items = safeRows
        .filter((row) => getCategoryFromProduct(row) === category)
        .sort((a, b) => String(a?.name ?? '').localeCompare(String(b?.name ?? ''), 'es', { sensitivity: 'base' }))

      return {
        key: category,
        title: categoryTitles[category] ?? category,
        items,
      }
    })
  }, [stockRows])

  const handleInput = (field, value) => {
    setForm((prevForm) => ({
      ...prevForm,
      [field]: field === 'name'
        ? value
        : field === 'category'
          ? normalizeCategory(value) || 'OTRO'
          : Math.max(Number(value) || 0, 0),
    }))
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!form.name.trim()) return

    onSaveProduct({
      name: form.name.trim(),
      category: normalizeCategory(form.category) || inferCategoryByName(form.name),
      stockMinimo: form.stockMinimo,
      referenceCost: form.referenceCost,
      salePrice: form.salePrice,
    })

    setForm(createInitialForm())
  }

  const createQuickDraft = (product) => ({
    name: String(product?.name ?? ''),
    category: getCategoryFromProduct(product),
    stockMinimo: Math.max(Number(product?.stockMinimo || 0), 0),
    referenceCost: Math.max(Number(product?.referenceCost || 0), 0),
    salePrice: Math.max(Number(product?.salePrice || 0), 0),
  })

  const openQuickEdit = (product) => {
    if (!product?.id) return

    setQuickEditingId(product.id)
    setQuickDrafts((prev) => ({
      ...prev,
      [product.id]: createQuickDraft(product),
    }))
  }

  const closeQuickEdit = (productId) => {
    setQuickEditingId((currentId) => (currentId === productId ? null : currentId))
    setQuickDrafts((prev) => {
      const next = { ...prev }
      delete next[productId]
      return next
    })
  }

  const updateQuickDraft = (productId, field, value) => {
    setQuickDrafts((prev) => {
      const currentDraft = prev[productId] ?? {
        name: '',
        category: 'OTRO',
        stockMinimo: 0,
        referenceCost: 0,
        salePrice: 0,
      }

      const normalizedValue = field === 'name'
        ? value
        : field === 'category'
          ? normalizeCategory(value) || 'OTRO'
          : Math.max(Number(value) || 0, 0)

      return {
        ...prev,
        [productId]: {
          ...currentDraft,
          [field]: normalizedValue,
        },
      }
    })
  }

  const handleSaveQuickEdit = (product) => {
    const productId = String(product?.id ?? '')
    if (!productId) return

    const draft = quickDrafts[productId] ?? createQuickDraft(product)
    const normalizedName = String(draft.name ?? '').trim()
    if (!normalizedName) return

    onSaveProduct({
      id: product.id,
      name: normalizedName,
      category: normalizeCategory(draft.category) || inferCategoryByName(normalizedName),
      stockMinimo: Math.max(Number(draft.stockMinimo || 0), 0),
      referenceCost: Math.max(Number(draft.referenceCost || 0), 0),
      salePrice: Math.max(Number(draft.salePrice || 0), 0),
    })

    onUpdateProductReferenceCost?.(product.id, Math.max(Number(draft.referenceCost || 0), 0))

    closeQuickEdit(productId)
  }

  const handleDeleteProduct = (product) => {
    const productId = String(product?.id ?? '')
    if (!productId) return

    const confirmed = window.confirm(`¿Eliminar el producto ${product.name}? Esta acción no se puede deshacer.`)
    if (!confirmed) return

    onDeleteProduct?.(productId)
    closeQuickEdit(productId)
    setHistoryProductId((currentId) => (currentId === productId ? null : currentId))
    setAdjustingProductId((currentId) => (currentId === productId ? null : currentId))
  }

  const openAdjustPanel = (product) => {
    setAdjustingProductId(product.id)
    setAdjustment(createInitialAdjustment())
  }

  const closeAdjustPanel = () => {
    setAdjustingProductId(null)
    setAdjustment(createInitialAdjustment())
  }

  const handleApplyAdjustment = () => {
    if (!adjustingProduct || !isAdjustmentAmountValid || !hasReason) return

    const direction = adjustmentAmount > 0 ? '+' : ''
    const confirmed = window.confirm(
      `¿Aplicar ajuste ${direction}${adjustmentAmount} al producto ${adjustingProduct.name}?`,
    )
    if (!confirmed) return

    if (projectedStock < 0) {
      const secondConfirmation = window.confirm(
        'Este ajuste dejará el stock total en negativo. ¿Confirmás continuar?',
      )
      if (!secondConfirmation) return
    }

    onAdjustStock(adjustingProduct.id, adjustmentAmount, adjustment.reason.trim(), 'Ajuste')
    closeAdjustPanel()
  }

  const toggleHistory = (productId) => {
    setHistoryProductId((currentId) => (currentId === productId ? null : productId))
  }

  return (
    <section className="page-section">
      <header className="page-header">
        <h2>Productos</h2>
        <p>Gestioná catálogo y stock base para reservas dinámicas en pedidos.</p>
      </header>

      <div className="products-grid">
        <section className="card-block">
          <div className="card-head">
            <h3>Nuevo producto</h3>
          </div>

          <form className="order-form" onSubmit={handleSubmit}>
            <label>
              Nombre
              <input
                type="text"
                value={form.name}
                onChange={(event) => handleInput('name', event.target.value)}
                placeholder="Nombre del producto"
                required
              />
            </label>

            <label>
              Categoría
              <select
                value={form.category}
                onChange={(event) => handleInput('category', event.target.value)}
              >
                {PRODUCT_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Stock mínimo
              <input
                type="number"
                min="0"
                value={form.stockMinimo}
                onChange={(event) => handleInput('stockMinimo', event.target.value)}
              />
            </label>

            <label>
              Costo de referencia por unidad
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.referenceCost}
                onChange={(event) => handleInput('referenceCost', event.target.value)}
              />
              <p className="payment-helper">
                Este costo se usa para estimaciones si no hay compras registradas.
              </p>
            </label>

            <label>
              Precio de venta sugerido
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.salePrice}
                onChange={(event) => handleInput('salePrice', event.target.value)}
              />
            </label>

            <div className="product-actions">
              <button type="submit" className="primary-btn">
                Agregar producto
              </button>
            </div>
          </form>
        </section>

        <section className="card-block">
          <div className="card-head">
            <h3>Panel de productos por categoría</h3>
          </div>

          {groupedProducts.map((group) => (
            <div key={group.key}>
              <h4>{group.title}</h4>
              <div className="table-wrap">
                <table className="products-table">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Medida</th>
                      <th>Costo</th>
                      <th>Precio</th>
                      <th>Stock</th>
                      <th>Mínimo</th>
                      <th>Categoría</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map((product) => {
                      const isEditing = quickEditingId === product.id
                      const draft = quickDrafts[product.id] ?? createQuickDraft(product)

                      return (
                        <tr key={product.id}>
                          <td>
                            {isEditing ? (
                              <input
                                type="text"
                                value={draft.name}
                                onChange={(event) => updateQuickDraft(product.id, 'name', event.target.value)}
                              />
                            ) : (
                              product.name
                            )}
                          </td>
                          <td>{getProductMeasure(isEditing ? draft.name : product.name)}</td>
                          <td>
                            {isEditing ? (
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={draft.referenceCost}
                                onChange={(event) => updateQuickDraft(product.id, 'referenceCost', event.target.value)}
                              />
                            ) : (
                              Number(product.referenceCost || 0)
                            )}
                          </td>
                          <td>
                            {isEditing ? (
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={draft.salePrice}
                                onChange={(event) => updateQuickDraft(product.id, 'salePrice', event.target.value)}
                              />
                            ) : (
                              Number(product.salePrice || 0)
                            )}
                          </td>
                          <td>{product.stockDisponible}</td>
                          <td>
                            {isEditing ? (
                              <input
                                type="number"
                                min="0"
                                value={draft.stockMinimo}
                                onChange={(event) => updateQuickDraft(product.id, 'stockMinimo', event.target.value)}
                              />
                            ) : (
                              product.stockMinimo
                            )}
                          </td>
                          <td>
                            {isEditing ? (
                              <select
                                value={draft.category}
                                onChange={(event) => updateQuickDraft(product.id, 'category', event.target.value)}
                              >
                                {PRODUCT_CATEGORIES.map((category) => (
                                  <option key={category} value={category}>
                                    {category}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              getCategoryFromProduct(product)
                            )}
                          </td>
                          <td>
                            <div className="product-row-actions">
                              {!isEditing ? (
                                <button
                                  type="button"
                                  className="quick-fill-btn"
                                  onClick={() => openQuickEdit(product)}
                                >
                                  Editar
                                </button>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="quick-fill-btn"
                                    onClick={() => handleSaveQuickEdit(product)}
                                  >
                                    Guardar
                                  </button>
                                  <button
                                    type="button"
                                    className="quick-fill-btn"
                                    onClick={() => closeQuickEdit(product.id)}
                                  >
                                    Cancelar
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                className="quick-fill-btn"
                                onClick={() => openAdjustPanel(product)}
                              >
                                Ajustar stock
                              </button>
                              <button
                                type="button"
                                className="quick-fill-btn"
                                onClick={() => toggleHistory(product.id)}
                              >
                                Ver historial
                              </button>
                              <button
                                type="button"
                                className="danger-ghost-btn"
                                onClick={() => handleDeleteProduct(product)}
                              >
                                Eliminar
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}

                    {group.items.length === 0 && (
                      <tr>
                        <td colSpan={8} className="empty-detail">
                          Sin productos en esta categoría.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </section>
      </div>

      {adjustingProduct && (
        <section className="dashboard-recent">
          <div className="card-head">
            <h3>Ajuste manual de stock</h3>
          </div>

          <div className="adjustment-grid">
            <p className="payment-helper">
              Producto: <strong>{adjustingProduct.name}</strong> · Stock actual: {adjustingProduct.stockTotal}
            </p>

            <label>
              Ajuste (+ ingreso / - merma)
              <input
                type="number"
                value={adjustment.amount}
                onChange={(event) =>
                  setAdjustment((prev) => ({ ...prev, amount: event.target.value }))
                }
                placeholder="Ej: 10 o -5"
              />
            </label>

            <label>
              Motivo
              <input
                type="text"
                value={adjustment.reason}
                onChange={(event) =>
                  setAdjustment((prev) => ({ ...prev, reason: event.target.value }))
                }
                placeholder="Motivo del ajuste"
                required
              />
            </label>

            {adjustmentWouldBeNegative && (
              <p className="payment-error">
                Advertencia: el ajuste proyecta stock total negativo ({projectedStock}).
                Se pedirá confirmación extra.
              </p>
            )}

            <div className="product-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={closeAdjustPanel}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="primary-btn"
                onClick={handleApplyAdjustment}
                disabled={!isAdjustmentAmountValid || !hasReason}
              >
                Aplicar ajuste
              </button>
            </div>
          </div>
        </section>
      )}

      {historyProduct && (
        <section className="dashboard-recent">
          <div className="card-head">
            <h3>Historial de movimientos · {historyProduct.name}</h3>
          </div>

          <div className="table-wrap">
            <table className="products-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Cantidad</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {(historyProduct.stockMovements ?? [])
                  .slice()
                  .sort(
                    (a, b) =>
                      new Date(b.date || 0).getTime() -
                      new Date(a.date || 0).getTime(),
                  )
                  .map((movement) => (
                    <tr key={movement.id}>
                      <td>{formatDateTime(movement.date)}</td>
                      <td>{movement.type}</td>
                      <td>{movement.amount > 0 ? `+${movement.amount}` : movement.amount}</td>
                      <td>{movement.reason || '-'}</td>
                    </tr>
                  ))}

                {(historyProduct.stockMovements ?? []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="empty-detail">
                      Sin movimientos registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  )
}

export default ProductsPage
