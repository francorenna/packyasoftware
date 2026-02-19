import { useMemo, useState } from 'react'
import { calculateStockSnapshot } from '../utils/stock'

const createInitialForm = () => ({
  id: '',
  name: '',
  stockMinimo: 0,
  referenceCost: 0,
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

function ProductsPage({ products, orders, onSaveProduct, onUpdateProductReferenceCost, onAdjustStock }) {
  const [form, setForm] = useState(createInitialForm())
  const [editingId, setEditingId] = useState(null)
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

  const handleInput = (field, value) => {
    setForm((prevForm) => ({
      ...prevForm,
      [field]: field === 'name' ? value : Math.max(Number(value) || 0, 0),
    }))
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!form.name.trim()) return

    onSaveProduct({
      id: editingId ?? undefined,
      name: form.name.trim(),
      stockMinimo: form.stockMinimo,
      referenceCost: form.referenceCost,
    })

    if (editingId) {
      onUpdateProductReferenceCost?.(editingId, form.referenceCost)
    }

    setForm(createInitialForm())
    setEditingId(null)
  }

  const handleEdit = (product) => {
    setEditingId(product.id)
    setForm({
      id: product.id,
      name: product.name,
      stockMinimo: product.stockMinimo,
      referenceCost: Number(product.referenceCost || 0),
    })
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    setForm(createInitialForm())
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
            <h3>{editingId ? 'Editar producto' : 'Nuevo producto'}</h3>
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

            <div className="product-actions">
              {editingId && (
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={handleCancelEdit}
                >
                  Cancelar
                </button>
              )}
              <button type="submit" className="primary-btn">
                {editingId ? 'Guardar cambios' : 'Agregar producto'}
              </button>
            </div>
          </form>
        </section>

        <section className="card-block">
          <div className="card-head">
            <h3>Listado de productos</h3>
          </div>

          <div className="table-wrap">
            <table className="products-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Stock total</th>
                  <th>Reservado</th>
                  <th>Disponible</th>
                  <th>Mínimo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {stockRows.map((product) => (
                  <tr key={product.id}>
                    <td>{product.name}</td>
                    <td>{product.stockTotal}</td>
                    <td>{product.stockReservado}</td>
                    <td>{product.stockDisponible}</td>
                    <td>{product.stockMinimo}</td>
                    <td>
                      <div className="product-row-actions">
                        <button
                          type="button"
                          className="quick-fill-btn"
                          onClick={() => handleEdit(product)}
                        >
                          Editar
                        </button>
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
                      </div>
                    </td>
                  </tr>
                ))}

                {stockRows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="empty-detail">
                      No hay productos registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
