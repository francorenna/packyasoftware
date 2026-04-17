import { useMemo, useState } from 'react'
import { PRODUCT_CATEGORIES } from '../state/useProductsState'
import { calculateStockSnapshot } from '../utils/stock'
import useAppDialog from '../hooks/useAppDialog'
import SearchInput from '../components/SearchInput'

const createInitialForm = () => ({
  name: '',
  category: 'OTRO',
  stockMinimo: 0,
  referenceCost: 0,
  salePrice: 0,
  image: '',
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

const categoryIcons = {
  CAJA: '📦',
  BOLSA: '🛍',
  EMBALAJE: '🚚',
  OTRO: '⚙️',
}

const categoryClassNames = {
  CAJA: 'category-caja',
  BOLSA: 'category-bolsa',
  EMBALAJE: 'category-embalaje',
  OTRO: 'category-otro',
}

const IMAGE_MAX_BYTES = 200 * 1024

const readFileAsDataURL = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'))
    reader.readAsDataURL(file)
  })

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('No se pudo cargar la imagen.'))
    image.src = src
  })

const canvasToDataUrl = (canvas, type, quality) =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('No se pudo procesar la imagen.'))
          return
        }

        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result ?? ''))
        reader.onerror = () => reject(new Error('No se pudo procesar la imagen.'))
        reader.readAsDataURL(blob)
      },
      type,
      quality,
    )
  })

const compressImageToBase64 = async (file) => {
  const isSupportedType = ['image/jpeg', 'image/png'].includes(file?.type)
  if (!isSupportedType) {
    throw new Error('Solo se permiten imágenes JPG o PNG.')
  }

  const sourceDataUrl = await readFileAsDataURL(file)
  const sourceImage = await loadImage(sourceDataUrl)

  const maxSide = 1200
  const scale = Math.min(1, maxSide / Math.max(sourceImage.width, sourceImage.height))
  const width = Math.max(Math.round(sourceImage.width * scale), 1)
  const height = Math.max(Math.round(sourceImage.height * scale), 1)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('No se pudo preparar el compresor de imagen.')
  }

  context.drawImage(sourceImage, 0, 0, width, height)

  let bestDataUrl = await canvasToDataUrl(canvas, 'image/jpeg', 0.85)
  if (bestDataUrl.length <= IMAGE_MAX_BYTES * 1.37) {
    return bestDataUrl
  }

  const qualitySteps = [0.75, 0.65, 0.55, 0.45]
  for (const quality of qualitySteps) {
    const candidate = await canvasToDataUrl(canvas, 'image/jpeg', quality)
    bestDataUrl = candidate
    if (candidate.length <= IMAGE_MAX_BYTES * 1.37) return candidate
  }

  return bestDataUrl
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
  const [isFormModalOpen, setIsFormModalOpen] = useState(false)
  const [productSearchInput, setProductSearchInput] = useState('')
  const [productSearchQuery, setProductSearchQuery] = useState('')
  const [expandedProductId, setExpandedProductId] = useState(null)
  const [quickDrafts, setQuickDrafts] = useState({})
  const [adjustingProductId, setAdjustingProductId] = useState(null)
  const [historyProductId, setHistoryProductId] = useState(null)
  const [adjustment, setAdjustment] = useState(createInitialAdjustment())
  const [imageUploadError, setImageUploadError] = useState('')
  const [previewImage, setPreviewImage] = useState({ isOpen: false, src: '', name: '' })

  const { dialogNode, appConfirm } = useAppDialog()

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

  const filteredGroupedProducts = useMemo(() => {
    const query = String(productSearchQuery ?? '').trim().toLowerCase()
    if (!query) return groupedProducts

    return groupedProducts
      .map((group) => ({
        ...group,
        items: group.items.filter((product) => {
          const name = String(product?.name ?? '').toLowerCase()
          const category = String(getCategoryFromProduct(product) ?? '').toLowerCase()
          const measure = String(getProductMeasure(product?.name) ?? '').toLowerCase()
          return name.includes(query) || category.includes(query) || measure.includes(query)
        }),
      }))
      .filter((group) => group.items.length > 0)
  }, [groupedProducts, productSearchQuery])

  const formatCurrency = (value) =>
    new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    }).format(Number(value || 0))

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
      image: form.image,
    })

    setForm(createInitialForm())
    setImageUploadError('')
    setIsFormModalOpen(false)
  }

  const closeFormModal = () => {
    setIsFormModalOpen(false)
    setForm(createInitialForm())
    setImageUploadError('')
  }

  const createQuickDraft = (product) => ({
    name: String(product?.name ?? ''),
    category: getCategoryFromProduct(product),
    stockMinimo: Math.max(Number(product?.stockMinimo || 0), 0),
    referenceCost: Math.max(Number(product?.referenceCost || 0), 0),
    salePrice: Math.max(Number(product?.salePrice || 0), 0),
    image: String(product?.image ?? ''),
  })

  const handleFormImageUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const image = await compressImageToBase64(file)
      setForm((prev) => ({
        ...prev,
        image,
      }))
      setImageUploadError('')
    } catch (error) {
      setImageUploadError(String(error?.message ?? 'No se pudo cargar la imagen.'))
    } finally {
      event.target.value = ''
    }
  }

  const handleQuickImageUpload = async (productId, event) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const image = await compressImageToBase64(file)
      const product = stockRows.find((row) => String(row?.id ?? '') === String(productId))
      if (product) {
        const nextName = String(quickDrafts[productId]?.name ?? product.name ?? '').trim()
        onSaveProduct({
          id: product.id,
          name: nextName || String(product.name ?? ''),
          category: normalizeCategory(quickDrafts[productId]?.category) || getCategoryFromProduct(product),
          stockMinimo: Math.max(Number(quickDrafts[productId]?.stockMinimo ?? product.stockMinimo ?? 0), 0),
          referenceCost: Math.max(Number(quickDrafts[productId]?.referenceCost ?? product.referenceCost ?? 0), 0),
          salePrice: Math.max(Number(quickDrafts[productId]?.salePrice ?? product.salePrice ?? 0), 0),
          image,
        })
      }
      updateQuickDraft(productId, 'image', image)
      setImageUploadError('')
    } catch (error) {
      setImageUploadError(String(error?.message ?? 'No se pudo cargar la imagen.'))
    } finally {
      event.target.value = ''
    }
  }

  const handleRemoveQuickImage = (productId) => {
    const product = stockRows.find((row) => String(row?.id ?? '') === String(productId))
    if (!product) return

    const nextName = String(quickDrafts[productId]?.name ?? product.name ?? '').trim()
    onSaveProduct({
      id: product.id,
      name: nextName || String(product.name ?? ''),
      category: normalizeCategory(quickDrafts[productId]?.category) || getCategoryFromProduct(product),
      stockMinimo: Math.max(Number(quickDrafts[productId]?.stockMinimo ?? product.stockMinimo ?? 0), 0),
      referenceCost: Math.max(Number(quickDrafts[productId]?.referenceCost ?? product.referenceCost ?? 0), 0),
      salePrice: Math.max(Number(quickDrafts[productId]?.salePrice ?? product.salePrice ?? 0), 0),
      image: '',
    })
    updateQuickDraft(productId, 'image', '')
  }

  const openQuickEdit = (product) => {
    if (!product?.id) return

    setExpandedProductId(product.id)
    setQuickDrafts((prev) => ({
      ...prev,
      [product.id]: createQuickDraft(product),
    }))
  }

  const closeQuickEdit = (productId) => {
    setExpandedProductId((currentId) => (currentId === productId ? null : currentId))
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
        image: '',
      }

      const normalizedValue = field === 'name'
        ? value
        : field === 'image'
          ? String(value ?? '')
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
      image: String(draft.image ?? ''),
    })

    onUpdateProductReferenceCost?.(product.id, Math.max(Number(draft.referenceCost || 0), 0))

    closeQuickEdit(productId)
  }

  const handleDeleteProduct = (product) => {
    const productId = String(product?.id ?? '')
    if (!productId) return

    void appConfirm(`¿Eliminar el producto ${product.name}? Esta acción no se puede deshacer.`).then((confirmed) => {
      if (!confirmed) return
      onDeleteProduct?.(productId)
      closeQuickEdit(productId)
      setHistoryProductId((currentId) => (currentId === productId ? null : currentId))
      setAdjustingProductId((currentId) => (currentId === productId ? null : currentId))
    })
  }

  const toggleExpandedProduct = (product) => {
    const productId = String(product?.id ?? '')
    if (!productId) return

    if (expandedProductId === productId) {
      closeQuickEdit(productId)
      return
    }

    openQuickEdit(product)
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
    void appConfirm(`¿Aplicar ajuste ${direction}${adjustmentAmount} al producto ${adjustingProduct.name}?`).then((confirmed) => {
      if (!confirmed) return

      const applyAdjustment = () => {
        onAdjustStock(adjustingProduct.id, adjustmentAmount, adjustment.reason.trim(), 'Ajuste')
        closeAdjustPanel()
      }

      if (projectedStock < 0) {
        void appConfirm('Este ajuste dejará el stock total en negativo. ¿Confirmás continuar?').then((secondConfirmation) => {
          if (!secondConfirmation) return
          applyAdjustment()
        })
        return
      }

      applyAdjustment()
    })
  }

  const toggleHistory = (productId) => {
    setHistoryProductId((currentId) => (currentId === productId ? null : productId))
  }

  return (
    <section className="page-section">
      <header className="page-header">
        <div className="page-header-row">
          <div>
            <h2 className="section-title">Productos</h2>
            <p>Gestioná catálogo y stock base para reservas dinámicas en pedidos.</p>
          </div>
          <button type="button" className="primary-btn" onClick={() => setIsFormModalOpen(true)}>
            + Nuevo producto
          </button>
        </div>
      </header>

      <div className="products-grid products-grid-single">
        <section className="card-block">
          <div className="card-head">
            <h3>Panel de productos por categoría</h3>
          </div>

          <div className="products-panel-toolbar">
            <SearchInput
              value={productSearchInput}
              onValueChange={setProductSearchInput}
              onDebouncedChange={setProductSearchQuery}
              placeholder="Buscar producto por nombre, categoría o medida..."
              delay={220}
            />
            <span className="muted-label">
              {filteredGroupedProducts.reduce((acc, group) => acc + group.items.length, 0)} resultados
            </span>
          </div>

          {filteredGroupedProducts.map((group) => (
            <div key={group.key} className="products-accordion-group">
              <h4>{group.title}</h4>
              <div className="product-accordion-list">
                {group.items.map((product) => {
                  const productId = String(product.id ?? '')
                  const isExpanded = expandedProductId === productId
                  const draft = quickDrafts[productId] ?? createQuickDraft(product)
                  const productCategory = getCategoryFromProduct(product)

                  return (
                    <article
                      key={productId}
                      className={`product-accordion-item ${isExpanded ? 'product-accordion-item-expanded' : ''}`}
                    >
                      <button
                        type="button"
                        className="product-accordion-header"
                        onClick={() => toggleExpandedProduct(product)}
                        aria-expanded={isExpanded}
                      >
                        <div className="product-accordion-header-main">
                          <div className="product-accordion-title-row">
                            <span className="product-accordion-icon">{categoryIcons[productCategory] ?? '⚙️'}</span>
                            <span className="product-accordion-name">{product.name}</span>
                            <span className={`category-badge ${categoryClassNames[productCategory] ?? 'category-otro'}`}>
                              {productCategory}
                            </span>
                            <span className={`image-status-badge product-image-indicator ${product.image ? 'image-status-ok' : 'image-status-empty'}`}>
                              {product.image ? '📷 Tiene imagen' : '⚠ Sin imagen'}
                              {product.image ? (
                                <span className="product-image-hover-card" aria-hidden="true">
                                  <img
                                    src={String(product.image ?? '')}
                                    alt={String(product.name ?? 'Producto')}
                                    className="product-image-hover-preview"
                                  />
                                </span>
                              ) : null}
                            </span>
                          </div>
                          <div className="product-accordion-summary">
                            <span><strong>Medida:</strong> {getProductMeasure(product.name)}</span>
                            <span><strong>Stock:</strong> {product.stockDisponible}</span>
                            <span><strong>Costo:</strong> {formatCurrency(product.referenceCost)}</span>
                            <span><strong>Precio:</strong> {formatCurrency(product.salePrice)}</span>
                          </div>
                        </div>
                        <span className="product-accordion-chevron" aria-hidden="true">
                          {isExpanded ? '−' : '+'}
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="product-accordion-panel">
                          <div className="product-accordion-stats">
                            <div className="product-accordion-stat">
                              <span>Costo actual</span>
                              <strong>{formatCurrency(draft.referenceCost)}</strong>
                            </div>
                            <div className="product-accordion-stat">
                              <span>Precio actual</span>
                              <strong>{formatCurrency(draft.salePrice)}</strong>
                            </div>
                            <div className="product-accordion-stat">
                              <span>Stock disponible</span>
                              <strong>{product.stockDisponible}</strong>
                            </div>
                            <div className="product-accordion-stat">
                              <span>Stock mínimo</span>
                              <strong>{draft.stockMinimo}</strong>
                            </div>
                          </div>

                          <div className="product-accordion-edit-grid">
                            <label>
                              Nombre
                              <input
                                type="text"
                                value={draft.name}
                                onChange={(event) => updateQuickDraft(productId, 'name', event.target.value)}
                              />
                            </label>

                            <label>
                              Categoría
                              <select
                                value={draft.category}
                                onChange={(event) => updateQuickDraft(productId, 'category', event.target.value)}
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
                                value={draft.stockMinimo}
                                onChange={(event) => updateQuickDraft(productId, 'stockMinimo', event.target.value)}
                              />
                            </label>

                            <label>
                              Costo
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={draft.referenceCost}
                                onChange={(event) => updateQuickDraft(productId, 'referenceCost', event.target.value)}
                              />
                            </label>

                            <label>
                              Precio
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={draft.salePrice}
                                onChange={(event) => updateQuickDraft(productId, 'salePrice', event.target.value)}
                              />
                            </label>
                          </div>

                          <div className="product-accordion-media-row">
                            <div className="product-accordion-image-card">
                              <p className="product-accordion-image-title">Imagen del producto</p>
                              {draft.image ? (
                                <button
                                  type="button"
                                  className="product-image-preview-btn"
                                  onClick={() =>
                                    setPreviewImage({
                                      isOpen: true,
                                      src: String(draft.image ?? ''),
                                      name: String(draft.name ?? product.name ?? 'Producto'),
                                    })
                                  }
                                >
                                  <img src={draft.image} alt={draft.name || product.name} className="product-thumbnail" />
                                </button>
                              ) : (
                                <div className="product-thumbnail product-thumbnail-placeholder">Sin imagen</div>
                              )}
                              <label className="quick-fill-btn upload-btn" htmlFor={`quick-image-${productId}`}>
                                Subir imagen
                              </label>
                              <input
                                id={`quick-image-${productId}`}
                                type="file"
                                accept="image/png,image/jpeg"
                                onChange={(event) => handleQuickImageUpload(productId, event)}
                                className="image-file-input"
                              />
                              {draft.image ? (
                                <button
                                  type="button"
                                  className="quick-fill-btn"
                                  onClick={() => handleRemoveQuickImage(productId)}
                                >
                                  Quitar imagen
                                </button>
                              ) : null}
                            </div>
                          </div>

                          {imageUploadError ? <p className="payment-error">{imageUploadError}</p> : null}

                          <div className="product-row-actions">
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
                              onClick={() => openAdjustPanel(product)}
                            >
                              Ajustar stock
                            </button>
                            <button
                              type="button"
                              className="quick-fill-btn"
                              onClick={() => toggleHistory(productId)}
                            >
                              Ver historial
                            </button>
                            <button
                              type="button"
                              className="quick-fill-btn"
                              onClick={() => closeQuickEdit(productId)}
                            >
                              Cerrar
                            </button>
                            <button
                              type="button"
                              className="danger-ghost-btn"
                              onClick={() => handleDeleteProduct(product)}
                            >
                              Eliminar
                            </button>
                          </div>
                        </div>
                      )}
                    </article>
                  )
                })}

                {group.items.length === 0 && (
                  <div className="empty-detail product-accordion-empty">
                    Sin productos en esta categoría.
                  </div>
                )}
              </div>
            </div>
          ))}

          {filteredGroupedProducts.length === 0 && (
            <div className="empty-detail product-accordion-empty">
              No se encontraron productos con ese criterio.
            </div>
          )}
        </section>
      </div>

      {isFormModalOpen && (
        <div
          className="modal-overlay order-form-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Nuevo producto"
          onKeyDown={(event) => { if (event.key === 'Escape') closeFormModal() }}
        >
          <div className="order-form-modal entity-form-modal entity-form-modal-compact">
            <div className="order-form-modal-header">
              <h3>Nuevo producto</h3>
              <button type="button" className="secondary-btn" onClick={closeFormModal}>Cerrar</button>
            </div>
            <div className="order-form-modal-body">
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

                <div className="product-image-upload-row">
                  <label className="secondary-btn upload-btn" htmlFor="new-product-image-input">
                    Subir imagen
                  </label>
                  <input
                    id="new-product-image-input"
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={handleFormImageUpload}
                    className="image-file-input"
                  />
                  <p className="payment-helper">Formatos: JPG/PNG. Tamaño recomendado: hasta 200kb.</p>
                  <span className={`image-status-badge ${form.image ? 'image-status-ok' : 'image-status-empty'}`}>
                    {form.image ? 'Imagen cargada' : 'Sin imagen'}
                  </span>
                  {form.image ? (
                    <img src={form.image} alt="Vista previa" className="product-thumbnail" />
                  ) : null}
                  {imageUploadError ? <p className="payment-error">{imageUploadError}</p> : null}
                </div>

                <div className="order-form-actions">
                  <button type="button" className="secondary-btn" onClick={closeFormModal}>
                    Cancelar
                  </button>
                  <button type="submit" className="primary-btn">
                    Agregar producto
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

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

      {previewImage.isOpen && (
        <section className="dashboard-recent">
          <div className="card-head">
            <h3>Preview de imagen · {previewImage.name}</h3>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => setPreviewImage({ isOpen: false, src: '', name: '' })}
            >
              Cerrar
            </button>
          </div>

          <div className="product-image-preview-wrap">
            <img src={previewImage.src} alt={previewImage.name} className="product-image-preview-large" />
          </div>
        </section>
      )}
      {dialogNode}
    </section>
  )
}

export default ProductsPage
