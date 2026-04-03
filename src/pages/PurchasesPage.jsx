import { Fragment, useEffect, useMemo, useRef, useState } from 'react'

const PRODUCT_FILTER_OPTIONS = ['TODOS', 'CAJA', 'BOLSA', 'EMBALAJE', 'OTRO']

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

const normalizeSearchText = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

const getSearchScore = (productName, query) => {
  const normalizedName = normalizeSearchText(productName)
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return 0

  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean)
  if (queryTokens.length === 0) return 0

  const hasAllTokens = queryTokens.every((token) => normalizedName.includes(token))
  if (!hasAllTokens) return -1

  let score = 0
  if (normalizedName === normalizedQuery) score += 1000
  if (normalizedName.startsWith(normalizedQuery)) score += 500
  if (normalizedName.includes(normalizedQuery)) score += 250

  queryTokens.forEach((token) => {
    if (normalizedName.includes(token)) score += 60
    if (/^\d+$/.test(token) && normalizedName.includes(token)) score += 180
  })

  return score
}

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
  const [isFormModalOpen, setIsFormModalOpen] = useState(false)
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
  const [selectedCategory, setSelectedCategory] = useState('TODOS')
  const [productSearch, setProductSearch] = useState('')
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState(0)
  const [activeItemIndex, setActiveItemIndex] = useState(0)
  const productSearchInputRef = useRef(null)

  const safeProducts = useMemo(() => (Array.isArray(products) ? products : []), [products])
  const safePurchases = useMemo(() => (Array.isArray(purchases) ? purchases : []), [purchases])
  const safeSuppliers = useMemo(() => (Array.isArray(suppliers) ? suppliers : []), [suppliers])
  const sortedSuppliers = useMemo(
    () =>
      (Array.isArray(suppliers) ? suppliers : []).toSorted((a, b) =>
        String(a?.name ?? '').localeCompare(String(b?.name ?? ''), 'es', { sensitivity: 'base' }),
      ),
    [suppliers],
  )
  const sortedProducts = useMemo(
    () =>
      (Array.isArray(products) ? products : []).toSorted((a, b) =>
        String(a?.name ?? '').localeCompare(String(b?.name ?? ''), 'es', { sensitivity: 'base' }),
      ),
    [products],
  )

  const normalizedSelectedCategory = useMemo(() => {
    const value = String(selectedCategory ?? '').trim().toUpperCase()
    if (!value || !PRODUCT_FILTER_OPTIONS.includes(value)) return 'TODOS'
    return value
  }, [selectedCategory])

  const filteredProducts = useMemo(() => {
    const query = String(productSearch ?? '').trim()

    const byCategory = sortedProducts.filter((product) => {
      const category = String(product?.category ?? '').trim().toUpperCase()
      return normalizedSelectedCategory === 'TODOS' || category === normalizedSelectedCategory
    })

    if (!query) return byCategory

    return byCategory
      .map((product) => ({
        product,
        score: getSearchScore(String(product?.name ?? ''), query),
      }))
      .filter((row) => row.score >= 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score

        const usageDiff = (Number(b.product?.usageCount) || 0) - (Number(a.product?.usageCount) || 0)
        if (usageDiff !== 0) return usageDiff

        return String(a.product?.name ?? '').localeCompare(String(b.product?.name ?? ''), 'es', { sensitivity: 'base' })
      })
      .map((row) => row.product)
  }, [normalizedSelectedCategory, productSearch, sortedProducts])

  const suggestedProduct = useMemo(() => {
    const query = String(productSearch ?? '').trim()
    if (!query) return null
    return filteredProducts[0] ?? null
  }, [filteredProducts, productSearch])

  const autocompleteProducts = useMemo(() => {
    const query = String(productSearch ?? '').trim()
    if (!query) return []
    return filteredProducts.slice(0, 8)
  }, [filteredProducts, productSearch])

  const topUsedProducts = useMemo(
    () =>
      [...safeProducts]
        .sort((a, b) => {
          const usageDiff = (Number(b?.usageCount) || 0) - (Number(a?.usageCount) || 0)
          if (usageDiff !== 0) return usageDiff

          const aLast = new Date(a?.lastUsedAt ?? 0).getTime()
          const bLast = new Date(b?.lastUsedAt ?? 0).getTime()
          return (Number.isNaN(bLast) ? 0 : bLast) - (Number.isNaN(aLast) ? 0 : aLast)
        })
        .slice(0, 5),
    [safeProducts],
  )

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

  useEffect(() => {
    if (!productSearchInputRef.current) return
    productSearchInputRef.current.focus()
  }, [normalizedSelectedCategory])

  const handleItemChange = (index, field, value) => {
    setItems((prevItems) =>
      prevItems.map((item, itemIndex) =>
        itemIndex === index
          ? (() => {
              if (field === 'productId') {
                const nextProductId = String(value ?? '')
                const selectedProduct = productById[nextProductId]
                const nextUnitCost = Math.max(
                  Number(selectedProduct?.referenceCost ?? selectedProduct?.unitCost ?? item.unitCost) || 0,
                  0,
                )

                return {
                  ...item,
                  productId: nextProductId,
                  unitCost: nextUnitCost,
                }
              }

              return {
                ...item,
                [field]: value,
              }
            })()
          : item,
      ),
    )
    setActiveItemIndex(index)
  }

  const quickSelectProduct = (productId) => {
    const safeProductId = String(productId ?? '').trim()
    if (!safeProductId) return

    setItems((prevItems) => {
      const safeItems = Array.isArray(prevItems) ? prevItems : [createPurchaseItem()]
      const indexToUse =
        activeItemIndex >= 0 && activeItemIndex < safeItems.length
          ? activeItemIndex
          : safeItems.findIndex((item) => !String(item?.productId ?? '').trim())

      const safeIndex = indexToUse >= 0 ? indexToUse : 0
      const selectedProduct = productById[safeProductId]
      const nextUnitCost = Math.max(Number(selectedProduct?.referenceCost ?? selectedProduct?.unitCost ?? 0) || 0, 0)

      return safeItems.map((item, idx) =>
        idx === safeIndex
          ? {
              ...item,
              productId: safeProductId,
              unitCost: nextUnitCost,
            }
          : item,
      )
    })

    setProductSearch('')
    setHighlightedSuggestionIndex(0)
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

  const resetPurchaseForm = () => {
    setSupplierId('')
    setItems([createPurchaseItem()])
    setSelectedCategory('TODOS')
    setProductSearch('')
    setHighlightedSuggestionIndex(0)
    setActiveItemIndex(0)
  }

  const closePurchaseModal = () => {
    setIsFormModalOpen(false)
    resetPurchaseForm()
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

    resetPurchaseForm()
    setIsFormModalOpen(false)
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
        <div className="page-header-row">
          <div>
            <h2 className="section-title">Compras</h2>
            <p>Registrá compras con proveedor obligatorio y reposición automática de stock.</p>
          </div>
          <button type="button" className="primary-btn" onClick={() => setIsFormModalOpen(true)}>
            + Nueva compra
          </button>
        </div>
      </header>

      <div className="products-grid products-grid-single">
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

      {isFormModalOpen && (
        <div
          className="modal-overlay order-form-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Nueva compra"
          onKeyDown={(event) => { if (event.key === 'Escape') closePurchaseModal() }}
        >
          <div className="order-form-modal entity-form-modal">
            <div className="order-form-modal-header">
              <h3>Nueva compra</h3>
              <button type="button" className="secondary-btn" onClick={closePurchaseModal}>Cerrar</button>
            </div>
            <div className="order-form-modal-body" style={purchaseFormContainerStyle}>
              <form className="order-form" onSubmit={handleSubmit}>
                <label>
                  Proveedor
                  <select
                    value={supplierId}
                    onChange={(event) => setSupplierId(event.target.value)}
                    required
                  >
                    <option value="">Seleccionar proveedor</option>
                    {sortedSuppliers.map((supplier) => (
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

                <div className="orders-product-filters">
                  <label>
                    Categoría
                    <select
                      value={normalizedSelectedCategory}
                      onChange={(event) => {
                        setSelectedCategory(event.target.value || 'TODOS')
                        setHighlightedSuggestionIndex(0)
                      }}
                    >
                      {PRODUCT_FILTER_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    Buscar producto
                    <input
                      ref={productSearchInputRef}
                      type="text"
                      value={productSearch}
                      onChange={(event) => {
                        setProductSearch(event.target.value)
                        setHighlightedSuggestionIndex(0)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowDown') {
                          if (autocompleteProducts.length === 0) return
                          event.preventDefault()
                          setHighlightedSuggestionIndex((prev) => Math.min(prev + 1, autocompleteProducts.length - 1))
                          return
                        }

                        if (event.key === 'ArrowUp') {
                          if (autocompleteProducts.length === 0) return
                          event.preventDefault()
                          setHighlightedSuggestionIndex((prev) => Math.max(prev - 1, 0))
                          return
                        }

                        if (event.key !== 'Enter') return

                        const activeSuggestion = autocompleteProducts[highlightedSuggestionIndex] ?? suggestedProduct
                        if (!activeSuggestion?.id) return

                        event.preventDefault()
                        quickSelectProduct(activeSuggestion.id)
                      }}
                      placeholder="Buscar producto..."
                    />
                    {suggestedProduct && (
                      <p className="payment-helper">
                        Sugerido: <strong>{suggestedProduct.name}</strong> (Enter para autocompletar)
                      </p>
                    )}
                    {autocompleteProducts.length > 0 && (
                      <div className="orders-autocomplete-list" role="listbox" aria-label="Sugerencias de productos para compras">
                        {autocompleteProducts.map((product, index) => (
                          <button
                            key={`purchase-suggestion-${product.id}`}
                            type="button"
                            className={`orders-autocomplete-item ${index === highlightedSuggestionIndex ? 'orders-autocomplete-item-active' : ''}`}
                            onMouseEnter={() => setHighlightedSuggestionIndex(index)}
                            onClick={() => quickSelectProduct(product.id)}
                          >
                            {product.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </label>

                  <div className="orders-most-used-wrap">
                    <p className="orders-most-used-title">⭐ Más usados</p>
                    <div className="orders-most-used-list">
                      {topUsedProducts.length > 0 ? (
                        topUsedProducts.map((product) => (
                          <button
                            key={product.id}
                            type="button"
                            className="quick-fill-btn"
                            onClick={() => quickSelectProduct(product.id)}
                          >
                            {product.name} ({Number(product?.usageCount) || 0})
                          </button>
                        ))
                      ) : (
                        <span className="muted-label">Sin historial aún.</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="items-stack" style={purchaseItemsStackStyle}>
                  {items.map((item, index) => (
                    <div key={`purchase-item-${index}`} className="purchase-item-row">
                      <select
                        value={item.productId}
                        onChange={(event) =>
                          handleItemChange(index, 'productId', event.target.value)
                        }
                        onFocus={() => setActiveItemIndex(index)}
                        required
                      >
                        <option value="">Seleccionar producto</option>
                        {(item.productId && productById[item.productId]
                          ? [productById[item.productId], ...filteredProducts.filter((product) => product.id !== item.productId)]
                          : filteredProducts).map((product) => (
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
                        onFocus={() => setActiveItemIndex(index)}
                        placeholder="Cantidad"
                      />

                      <input
                        type="number"
                        min="0"
                        value={item.unitCost}
                        onChange={(event) =>
                          handleItemChange(index, 'unitCost', event.target.value)
                        }
                        onFocus={() => setActiveItemIndex(index)}
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

                  <div className="order-form-actions">
                    <button type="button" className="secondary-btn" onClick={closePurchaseModal}>
                      Cancelar
                    </button>
                    <button type="submit" className="primary-btn">
                      Registrar compra
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

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
