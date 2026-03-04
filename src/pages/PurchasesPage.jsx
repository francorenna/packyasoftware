import { Fragment, useMemo, useState } from 'react'

const formatCurrency = (value) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value)

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

const createPurchaseItem = () => ({
  productId: '',
  quantity: 50,
  unitCost: 0,
})

const createSupplierForm = () => ({
  id: '',
  name: '',
  phone: '',
  notes: '',
})

const purchaseFormContainerStyle = {
  display: 'flex',
  flexDirection: 'column',
  overflowY: 'auto',
  maxHeight: 'calc(100vh - 220px)',
}

const purchaseItemsStackStyle = {
  maxHeight: '60vh',
  overflowY: 'auto',
  paddingRight: '0.25rem',
}

const purchaseActionAreaStyle = {
  position: 'sticky',
  bottom: 0,
  background: '#ffffff',
  paddingTop: '0.65rem',
}

function PurchasesPage({
  products,
  purchases,
  suppliers,
  onCreatePurchase,
  onSaveSupplier,
  onDeleteSupplier,
}) {
  const [supplierId, setSupplierId] = useState('')
    const [items, setItems] = useState([createPurchaseItem()])
    const [createdAt] = useState(() => {
      const d = new Date()
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    })
  const [supplierForm, setSupplierForm] = useState(createSupplierForm())
  const [editingSupplierId, setEditingSupplierId] = useState(null)
  const [expandedPurchaseId, setExpandedPurchaseId] = useState(null)

  const safeProducts = Array.isArray(products) ? products : []
  const safePurchases = Array.isArray(purchases) ? purchases : []
  const safeSuppliers = Array.isArray(suppliers) ? suppliers : []

  const productById = useMemo(
    () =>
      safeProducts.reduce((acc, product) => {
        acc[product.id] = product
        return acc
      }, {}),
    [safeProducts],
  )

  const supplierById = useMemo(
    () =>
      safeSuppliers.reduce((acc, supplier) => {
        acc[supplier.id] = supplier
        return acc
      }, {}),
    [safeSuppliers],
  )

  const purchaseTotal = useMemo(
    () =>
      items.reduce((acc, item) => {
        const quantity = Number(item.quantity) || 0
        const unit = Number(item.unitCost) || 0
        const fixed = Number(item.discountFixed) || 0
        const percent = Number(item.discountPercent) || 0
        const applied = fixed > 0 ? fixed : Math.round((percent / 100) * quantity * unit)
        const line = Math.max(quantity * unit - applied, 0)
        return acc + line
      }, 0),
    [items],
  )

  const normalizedItems = useMemo(
    () =>
      items
        .filter((item) => item.productId)
        .map((item) => ({
          productId: item.productId,
          productName: String(productById[item.productId]?.name ?? ''),
            quantity: Math.max(Math.floor(Number(item.quantity) || 0), 0),
            unitCost: Math.max(Number(item.unitCost) || 0, 0),
            discountPercent: Math.max(Number(item.discountPercent) || 0, 0),
            discountFixed: Math.max(Number(item.discountFixed) || 0, 0),
        }))
        .filter((item) => item.quantity > 0),
    [items, productById],
  )

  const handleItemChange = (index, field, value) => {
    setItems((prevItems) =>
      prevItems.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
                [field]: field === 'productId' ? value : value,
            }
          : item,
      ),
    )
  }

  const addItem = () => {
    setItems((prevItems) => [...prevItems, createPurchaseItem()])
  }

  const removeItem = (index) => {
    setItems((prevItems) => {
      if (prevItems.length === 1) return prevItems
      return prevItems.filter((_, itemIndex) => itemIndex !== index)
    })
  }

  const handleSupplierInput = (field, value) => {
    setSupplierForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = (event) => {
    event.preventDefault()

    const selectedSupplier = supplierById[supplierId]
    if (!selectedSupplier || normalizedItems.length === 0) return

      onCreatePurchase({
        supplierId: selectedSupplier.id,
        supplierName: selectedSupplier.name,
        items: normalizedItems,
        totalAmount: purchaseTotal,
        paymentMethod: 'Transferencia',
        createdAt: new Date(`${createdAt}T00:00:00`).toISOString(),
      })

    setSupplierId('')
    setItems([createPurchaseItem()])
  }

  const handleSaveSupplier = (event) => {
    event.preventDefault()
    if (!supplierForm.name.trim()) return

    const saved = onSaveSupplier({
      id: editingSupplierId ?? undefined,
      name: supplierForm.name,
      phone: supplierForm.phone,
      notes: supplierForm.notes,
    })

    if (saved?.id) {
      setSupplierId(saved.id)
    }

    setSupplierForm(createSupplierForm())
    setEditingSupplierId(null)
  }

  const handleEditSupplier = (supplier) => {
    setEditingSupplierId(supplier.id)
    setSupplierForm({
      id: supplier.id,
      name: supplier.name,
      phone: supplier.phone,
      notes: supplier.notes,
    })
  }

  const handleDeleteSupplier = (supplier) => {
    const confirmed = window.confirm(`¿Eliminar proveedor ${supplier.name}?`)
    if (!confirmed) return

    onDeleteSupplier(supplier.id)
    if (supplierId === supplier.id) setSupplierId('')
    if (editingSupplierId === supplier.id) {
      setEditingSupplierId(null)
      setSupplierForm(createSupplierForm())
    }
  }

  return (
    <section className="page-section">
      <header className="page-header">
        <h2>Compras</h2>
        <p>Registrá compras con proveedor obligatorio y reposición automática de stock.</p>
      </header>

      <div className="products-grid">
        <section className="card-block" style={purchaseFormContainerStyle}>
          <div className="card-head">
            <h3>Nueva compra</h3>
          </div>

          <form className="order-form" onSubmit={handleSubmit}>
            <label>
              Proveedor
              <select
                value={supplierId}
                onChange={(event) => setSupplierId(event.target.value)}
                required
              >
                <option value="">Seleccionar proveedor</option>
                {safeSuppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="items-head">
              <h4>Items de compra</h4>
              <button type="button" className="secondary-btn" onClick={addItem}>
                + Agregar ítem
              </button>
            </div>

            <div className="items-stack" style={purchaseItemsStackStyle}>
              {items.map((item, index) => (
                <div key={`purchase-item-${index}`} className="purchase-item-row">
                  <select
                    value={item.productId}
                    onChange={(event) =>
                      handleItemChange(index, 'productId', event.target.value)
                    }
                    required
                  >
                    <option value="">Seleccionar producto</option>
                    {safeProducts.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(event) =>
                      handleItemChange(index, 'quantity', event.target.value)
                    }
                    placeholder="Cantidad"
                  />

                  <input
                    type="number"
                    min="0"
                    value={item.unitCost}
                    onChange={(event) =>
                      handleItemChange(index, 'unitCost', event.target.value)
                    }
                    placeholder="Costo unitario"
                  />

                  <button
                    type="button"
                    className="danger-ghost-btn"
                    onClick={() => removeItem(index)}
                  >
                    Quitar
                  </button>

                  <p className="payment-helper">
                    Sugerencia operativa: usar cantidades en paquetes de 50/100.
                  </p>
                </div>
              ))}
            </div>

            <label>
              Método de pago
              <select value="Transferencia" disabled>
                <option value="Transferencia">Transferencia</option>
              </select>
            </label>

            <div style={purchaseActionAreaStyle}>
              <div className="totals-box">
                <p>
                  <span>Total compra</span>
                  <strong>{formatCurrency(purchaseTotal)}</strong>
                </p>
              </div>

              <button type="submit" className="primary-btn">
                Registrar compra
              </button>
            </div>
          </form>
        </section>

        <section className="card-block">
          <div className="card-head">
            <h3>Proveedores</h3>
          </div>

          <form className="order-form" onSubmit={handleSaveSupplier}>
            <label>
              Nombre
              <input
                type="text"
                value={supplierForm.name}
                onChange={(event) => handleSupplierInput('name', event.target.value)}
                required
              />
            </label>
            <label>
              Teléfono
              <input
                type="text"
                value={supplierForm.phone}
                onChange={(event) => handleSupplierInput('phone', event.target.value)}
              />
            </label>
            <label>
              Notas
              <input
                type="text"
                value={supplierForm.notes}
                onChange={(event) => handleSupplierInput('notes', event.target.value)}
              />
            </label>

            <div className="product-actions">
              {editingSupplierId && (
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => {
                    setEditingSupplierId(null)
                    setSupplierForm(createSupplierForm())
                  }}
                >
                  Cancelar
                </button>
              )}
              <button type="submit" className="primary-btn">
                {editingSupplierId ? 'Guardar proveedor' : 'Agregar proveedor'}
              </button>
            </div>
          </form>

          <div className="table-wrap">
            <table className="products-table">
              <thead>
                <tr>
                  <th>Proveedor</th>
                  <th>Teléfono</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {safeSuppliers.map((supplier) => (
                  <tr key={supplier.id}>
                    <td>{supplier.name}</td>
                    <td>{supplier.phone || '-'}</td>
                    <td>
                      <div className="product-row-actions">
                        <button
                          type="button"
                          className="quick-fill-btn"
                          onClick={() => handleEditSupplier(supplier)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="quick-fill-btn"
                          onClick={() => handleDeleteSupplier(supplier)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {safeSuppliers.length === 0 && (
                  <tr>
                    <td colSpan={3} className="empty-detail">
                      No hay proveedores cargados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="dashboard-recent">
        <div className="card-head">
          <h3>Historial de compras</h3>
        </div>

          <div className="table-wrap">
            <table className="products-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Producto</th>
                  <th>Proveedor</th>
                  <th>Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {safePurchases.map((purchase) => (
                  <Fragment key={purchase.id}>
                    <tr>
                      <td>{formatDateTime(purchase.createdAt)}</td>
                      <td>{purchase.items[0]?.productName || '-'}</td>
                      <td>{purchase.supplierName}</td>
                      <td>{formatCurrency(purchase.totalAmount)}</td>
                      <td>
                        <button
                          type="button"
                          className="quick-fill-btn"
                          onClick={() =>
                            setExpandedPurchaseId((currentId) =>
                              currentId === purchase.id ? null : purchase.id,
                            )
                          }
                        >
                          Ver detalle
                        </button>
                      </td>
                    </tr>

                    {expandedPurchaseId === purchase.id && (
                      <tr key={`${purchase.id}-detail`}>
                        <td colSpan={5} className="purchase-detail-cell">
                          <table className="order-items-table">
                            <thead>
                              <tr>
                                <th>Producto</th>
                                <th>Cantidad</th>
                                <th>Costo unitario</th>
                                <th>Subtotal</th>
                              </tr>
                            </thead>
                            <tbody>
                              {purchase.items.map((item, index) => (
                                <tr key={`${purchase.id}-item-${index}`}>
                                  <td>{item.productName}</td>
                                  <td>{item.quantity}</td>
                                  <td>{formatCurrency(item.unitCost)}</td>
                                  <td>
                                    {(() => {
                                      const computed = (item.lineTotal ?? (item.quantity * item.unitCost)) || 0
                                      return formatCurrency(Number(computed))
                                    })()}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}

                {safePurchases.length === 0 && (
                  <tr>
                    <td colSpan={5} className="empty-detail">
                      No hay compras registradas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
      </section>
    </section>
  )
}

export default PurchasesPage
