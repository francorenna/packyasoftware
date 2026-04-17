import { useCallback, useMemo, useState } from 'react'
import { generateManualPurchaseListPDF } from '../utils/pdf'

const formatCurrency = (value) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0)

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

const createEmptyItem = () => ({
  productId: '',
  productName: '',
  quantity: 1,
  referenceCost: 0,
  lineTotal: 0,
})

const createSupplierForm = () => ({
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

function ManualPurchaseListsPage({
  products,
  suppliers,
  manualPurchaseLists,
  onCreateList,
  onUpdateList,
  onDeleteList,
  onDuplicateList,
  onConvertToPurchase,
  onSaveSupplier,
}) {
  const [isFormModalOpen, setIsFormModalOpen] = useState(false)
  const [editingListId, setEditingListId] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [supplierName, setSupplierName] = useState('')
  const [items, setItems] = useState([createEmptyItem()])
  const [itemSearchByIndex, setItemSearchByIndex] = useState({})
  const [formError, setFormError] = useState('')
  const [isQuickSupplierOpen, setIsQuickSupplierOpen] = useState(false)
  const [supplierForm, setSupplierForm] = useState(createSupplierForm())

  const safeProducts = useMemo(() => (Array.isArray(products) ? products : []), [products])
  const safeSuppliers = useMemo(() => (Array.isArray(suppliers) ? suppliers : []), [suppliers])
  const sortedProducts = useMemo(
    () =>
      (Array.isArray(products) ? products : []).toSorted((a, b) =>
        String(a?.name ?? '').localeCompare(String(b?.name ?? ''), 'es', { sensitivity: 'base' }),
      ),
    [products],
  )
  const sortedSuppliers = useMemo(
    () =>
      (Array.isArray(suppliers) ? suppliers : []).toSorted((a, b) =>
        String(a?.name ?? '').localeCompare(String(b?.name ?? ''), 'es', { sensitivity: 'base' }),
      ),
    [suppliers],
  )
  const safeLists = useMemo(
    () => (Array.isArray(manualPurchaseLists) ? manualPurchaseLists : []),
    [manualPurchaseLists],
  )

  const productsById = useMemo(
    () =>
      safeProducts.reduce((acc, product) => {
        if (!product?.id) return acc
        acc[String(product.id)] = product
        return acc
      }, {}),
    [safeProducts],
  )

  const supplierById = useMemo(
    () =>
      safeSuppliers.reduce((acc, supplier) => {
        if (!supplier?.id) return acc
        acc[String(supplier.id)] = supplier
        return acc
      }, {}),
    [safeSuppliers],
  )

  const estimatedTotal = useMemo(
    () => items.reduce((acc, item) => acc + Number(item.lineTotal || 0), 0),
    [items],
  )

  const resetForm = () => {
    setEditingListId('')
    setSupplierId('')
    setSupplierName('')
    setItems([createEmptyItem()])
    setItemSearchByIndex({})
    setFormError('')
    setIsQuickSupplierOpen(false)
    setSupplierForm(createSupplierForm())
  }

  const openCreateModal = () => {
    resetForm()
    setIsFormModalOpen(true)
  }

  const closeFormModal = () => {
    resetForm()
    setIsFormModalOpen(false)
  }

  const syncItemLineTotal = (nextItem) => {
    const quantity = Math.max(Number(nextItem.quantity || 0), 0)
    const referenceCost = Math.max(Number(nextItem.referenceCost || 0), 0)
    return {
      ...nextItem,
      quantity,
      referenceCost,
      lineTotal: Math.max(quantity * referenceCost, 0),
    }
  }

  const handleItemChange = (index, field, value) => {
    setItems((prevItems) =>
      prevItems.map((item, itemIndex) => {
        if (itemIndex !== index) return item

        if (field === 'productId') {
          const selectedProduct = productsById[String(value)]
          const nextReferenceCost = Math.max(Number(selectedProduct?.referenceCost || 0), 0)
          if (selectedProduct) {
            setItemSearchByIndex((prev) => ({
              ...prev,
              [index]: String(selectedProduct?.name ?? ''),
            }))
          }
          return syncItemLineTotal({
            ...item,
            productId: String(value),
            productName: selectedProduct ? String(selectedProduct.name ?? '').trim() : item.productName,
            referenceCost: selectedProduct ? nextReferenceCost : item.referenceCost,
          })
        }

        return syncItemLineTotal({
          ...item,
          [field]: field === 'productName' ? String(value) : value,
        })
      }),
    )
  }

  const getFilteredProductsForItem = useCallback((index) => {
    const query = String(itemSearchByIndex[index] ?? '').trim()
    if (!query) return sortedProducts

    return sortedProducts
      .map((product) => ({
        product,
        score: getSearchScore(String(product?.name ?? ''), query),
      }))
      .filter((row) => row.score >= 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        return String(a.product?.name ?? '').localeCompare(String(b.product?.name ?? ''), 'es', {
          sensitivity: 'base',
        })
      })
      .map((row) => row.product)
  }, [itemSearchByIndex, sortedProducts])

  const addItem = () => setItems((prevItems) => [...prevItems, createEmptyItem()])

  const removeItem = (index) => {
    setItems((prevItems) => {
      if (prevItems.length === 1) return prevItems
      return prevItems.filter((_, itemIndex) => itemIndex !== index)
    })

    setItemSearchByIndex((prev) => {
      const next = {}
      Object.entries(prev).forEach(([key, value]) => {
        const numericKey = Number(key)
        if (!Number.isInteger(numericKey)) return
        if (numericKey === index) return
        if (numericKey > index) {
          next[numericKey - 1] = value
          return
        }
        next[numericKey] = value
      })
      return next
    })
  }

  const buildPayload = () => {
    const normalizedSupplierName = String(
      supplierById[supplierId]?.name ?? supplierName ?? '',
    ).trim()

    const normalizedItems = items
      .map((item) => {
        const quantity = Math.max(Number(item.quantity || 0), 0)
        const productName = String(item.productName ?? '').trim()
        const productId = String(item.productId ?? '').trim()
        const referenceCost = Math.max(Number(item.referenceCost || 0), 0)
        const lineTotal = Math.max(quantity * referenceCost, 0)

        if (quantity <= 0) return null
        if (!productId && !productName) return null

        return {
          productId,
          productName,
          quantity,
          referenceCost,
          lineTotal,
        }
      })
      .filter(Boolean)

    if (!normalizedSupplierName) {
      return { error: 'Seleccioná o cargá un proveedor para guardar la lista.' }
    }

    if (normalizedItems.length === 0) {
      return { error: 'Agregá al menos un ítem válido en la lista.' }
    }

    return {
      payload: {
        supplierId: String(supplierId ?? '').trim(),
        supplierName: normalizedSupplierName,
        status: 'Pendiente',
        items: normalizedItems,
        estimatedTotal: normalizedItems.reduce((acc, item) => acc + Number(item.lineTotal || 0), 0),
      },
    }
  }

  const handleSaveList = () => {
    const { payload, error } = buildPayload()
    if (error) {
      setFormError(error)
      return
    }

    if (!payload) return

    if (editingListId) {
      onUpdateList?.(editingListId, payload)
    } else {
      onCreateList?.(payload)
    }

    resetForm()
    setIsFormModalOpen(false)
  }

  const handleEditList = (list) => {
    const nextItems = (Array.isArray(list.items) ? list.items : []).map((item) =>
      syncItemLineTotal({
        productId: String(item.productId ?? '').trim(),
        productName: String(item.productName ?? '').trim(),
        quantity: Number(item.quantity || 0),
        referenceCost: Number(item.referenceCost || 0),
      }),
    )

    const nextSearchState = nextItems.reduce((acc, item, index) => {
      const nameFromCatalog = String(productsById[String(item.productId)]?.name ?? '').trim()
      acc[index] = nameFromCatalog || String(item.productName ?? '').trim()
      return acc
    }, {})

    setIsFormModalOpen(true)
    setEditingListId(String(list.id))
    setSupplierId(String(list.supplierId ?? ''))
    setSupplierName(String(list.supplierName ?? '').trim())
    setItems(nextItems)
    setItemSearchByIndex(nextSearchState)
    setFormError('')
  }

  const handleConvertList = (listId) => {
    const result = onConvertToPurchase?.(listId)
    if (!result?.success) {
      setFormError(String(result?.error ?? 'No se pudo convertir la lista.'))
      return
    }
    setFormError('')
  }

  const handleSaveQuickSupplier = () => {
    const saved = onSaveSupplier?.({
      name: String(supplierForm.name ?? '').trim(),
      phone: String(supplierForm.phone ?? '').trim(),
      notes: String(supplierForm.notes ?? '').trim(),
    })

    if (!saved?.id) {
      setFormError('No se pudo crear el proveedor.')
      return
    }

    setSupplierId(String(saved.id))
    setSupplierName(String(saved.name ?? '').trim())
    setSupplierForm(createSupplierForm())
    setIsQuickSupplierOpen(false)
    setFormError('')
  }

  return (
    <section className="page-section">
      <header className="page-header">
        <div className="page-header-row">
          <div>
            <h2>🛒 Listas de Compra</h2>
            <p>Generá listas internas y convertí a compra real cuando corresponda.</p>
          </div>
          <button type="button" className="primary-btn" onClick={openCreateModal}>
            + Nueva lista
          </button>
        </div>
      </header>

      <div className="products-grid manual-purchase-grid manual-purchase-grid-single">
        <section className="card-block">
          <div className="card-head">
            <h3>Listas registradas</h3>
          </div>

          <div className="table-wrap">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Proveedor</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Ítems</th>
                  <th>Total estimado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {safeLists.map((list) => (
                  <tr key={list.id}>
                    <td>{list.id}</td>
                    <td>{list.supplierName}</td>
                    <td>{formatDateTime(list.createdAt)}</td>
                    <td>
                      <span className={`status-badge status-${String(list.status).toLowerCase().replace(/\s+/g, '-')}`}>
                        {list.status}
                      </span>
                    </td>
                    <td>{Array.isArray(list.items) ? list.items.length : 0}</td>
                    <td>{formatCurrency(list.estimatedTotal)}</td>
                    <td>
                      <div className="product-actions" style={{ justifyContent: 'flex-start' }}>
                        <button
                          type="button"
                          className="secondary-btn"
                          onClick={() => handleEditList(list)}
                          disabled={list.status === 'Convertida'}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="secondary-btn"
                          onClick={() => onDuplicateList?.(list.id)}
                        >
                          Duplicar
                        </button>
                        <button
                          type="button"
                          className="secondary-btn"
                          onClick={() => generateManualPurchaseListPDF(list)}
                        >
                          PDF
                        </button>
                        <button
                          type="button"
                          className="primary-btn"
                          onClick={() => handleConvertList(list.id)}
                          disabled={list.status !== 'Pendiente'}
                        >
                          Convertir en Compra
                        </button>
                        <button
                          type="button"
                          className="danger-ghost-btn"
                          onClick={() => onDeleteList?.(list.id)}
                          disabled={list.status === 'Convertida'}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {safeLists.length === 0 && (
                  <tr>
                    <td colSpan={7} className="empty-detail">
                      No hay listas manuales registradas.
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
          aria-label={editingListId ? 'Editar lista de compra' : 'Nueva lista de compra'}
          onKeyDown={(event) => { if (event.key === 'Escape') closeFormModal() }}
        >
          <div className="order-form-modal entity-form-modal">
            <div className="order-form-modal-header">
              <h3>{editingListId ? 'Editar lista' : 'Nueva lista'}</h3>
              <button type="button" className="secondary-btn" onClick={closeFormModal}>Cerrar</button>
            </div>
            <div className="order-form-modal-body">
              <div className="order-form">
                <label>
                  Proveedor
                  <div className="inline-field-row manual-supplier-row">
                    <select
                      value={supplierId}
                      onChange={(event) => {
                        const nextSupplierId = event.target.value
                        setSupplierId(nextSupplierId)
                        setSupplierName(String(supplierById[nextSupplierId]?.name ?? '').trim())
                      }}
                    >
                      <option value="">Seleccionar proveedor</option>
                      {sortedSuppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={() => setIsQuickSupplierOpen((prev) => !prev)}
                    >
                      {isQuickSupplierOpen ? 'Cerrar' : '+ Nuevo proveedor'}
                    </button>
                  </div>
                </label>

                {isQuickSupplierOpen && (
                  <>
                    <label>
                      Nombre proveedor
                      <input
                        type="text"
                        value={supplierForm.name}
                        onChange={(event) =>
                          setSupplierForm((prev) => ({ ...prev, name: event.target.value }))
                        }
                        placeholder="Nombre"
                      />
                    </label>
                    <label>
                      Teléfono
                      <input
                        type="text"
                        value={supplierForm.phone}
                        onChange={(event) =>
                          setSupplierForm((prev) => ({ ...prev, phone: event.target.value }))
                        }
                        placeholder="Teléfono"
                      />
                    </label>
                    <label>
                      Notas
                      <input
                        type="text"
                        value={supplierForm.notes}
                        onChange={(event) =>
                          setSupplierForm((prev) => ({ ...prev, notes: event.target.value }))
                        }
                        placeholder="Notas"
                      />
                    </label>
                    <button type="button" className="secondary-btn" onClick={handleSaveQuickSupplier}>
                      Guardar proveedor
                    </button>
                  </>
                )}

                <div className="items-head">
                  <h4>Ítems de lista</h4>
                  <button type="button" className="secondary-btn" onClick={addItem}>
                    + Agregar ítem
                  </button>
                </div>

                <div className="items-stack manual-list-items-stack">
                  {items.map((item, index) => (
                    <div key={`manual-list-item-${index}`} className="manual-list-item-row">
                      <label className="manual-list-item-field">
                        <span className="manual-list-item-label">Buscar producto</span>
                        <input
                          type="text"
                          value={String(itemSearchByIndex[index] ?? '')}
                          onChange={(event) =>
                            setItemSearchByIndex((prev) => ({
                              ...prev,
                              [index]: event.target.value,
                            }))
                          }
                          placeholder="Buscar por nombre o medida"
                        />
                      </label>

                      <label className="manual-list-item-field">
                        <span className="manual-list-item-label">Producto</span>
                        <select
                          value={item.productId}
                          onChange={(event) => handleItemChange(index, 'productId', event.target.value)}
                        >
                          <option value="">Producto manual</option>
                          {getFilteredProductsForItem(index).map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="manual-list-item-field">
                        <span className="manual-list-item-label">Nombre</span>
                        <input
                          type="text"
                          value={item.productName}
                          onChange={(event) => handleItemChange(index, 'productName', event.target.value)}
                          placeholder="Nombre del producto"
                        />
                      </label>

                      <label className="manual-list-item-field">
                        <span className="manual-list-item-label">Cantidad</span>
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(event) => handleItemChange(index, 'quantity', event.target.value)}
                          placeholder="Cantidad"
                        />
                      </label>

                      <label className="manual-list-item-field">
                        <span className="manual-list-item-label">Costo ref.</span>
                        <input
                          type="number"
                          min="0"
                          value={item.referenceCost}
                          onChange={(event) => handleItemChange(index, 'referenceCost', event.target.value)}
                          placeholder="Costo ref."
                        />
                      </label>

                      <div className="manual-list-item-total">
                        <span className="manual-list-item-label">Subtotal</span>
                        <strong>{formatCurrency(item.lineTotal)}</strong>
                      </div>

                      <div className="manual-list-item-action">
                        <button
                          type="button"
                          className="danger-ghost-btn"
                          onClick={() => removeItem(index)}
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="totals-box">
                  <p className="total-line">
                    <span>Total estimado interno</span>
                    <strong>{formatCurrency(estimatedTotal)}</strong>
                  </p>
                </div>

                {formError && <p className="payment-error">{formError}</p>}

                <div className="order-form-actions">
                  <button type="button" className="secondary-btn" onClick={closeFormModal}>
                    Cancelar
                  </button>
                  <button type="button" className="primary-btn" onClick={handleSaveList}>
                    Guardar como Pendiente
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

export default ManualPurchaseListsPage