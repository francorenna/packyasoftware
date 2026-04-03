import { Fragment, useMemo, useRef, useState } from 'react'
import { getQuoteEffectiveStatus } from '../state/useQuotesState'
import { generateQuotePDF } from '../utils/pdf'

const quoteStatuses = ['Pendiente', 'Aceptado', 'Rechazado', 'Vencido']
const deliveryTypes = ['Retiro en fábrica', 'Envío']
const PRODUCT_FILTER_OPTIONS = ['TODOS', 'CAJA', 'BOLSA', 'EMBALAJE', 'OTRO']

const createDraftItem = () => ({
  sourceMode: 'existing',
  productId: '',
  description: '',
  quantity: 1,
  unitPrice: 0,
})

const toPositiveNumber = (value) => {
  const parsed = Number(value)
  return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed
}

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

const formatCurrency = (value) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))

const formatDateTime = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sin fecha'

  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const getDefaultValidUntil = () => {
  const today = new Date()
  const nextDate = new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000)
  return `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`
}

const normalizeQuoteItemDraft = (item = {}) => ({
  sourceMode: String(item.sourceMode ?? (item.productId ? 'existing' : 'manual')),
  productId: String(item.productId ?? ''),
  description: String(item.description ?? ''),
  quantity: Math.max(Math.floor(Number(item.quantity || 0)), 1),
  unitPrice: toPositiveNumber(item.unitPrice),
})

function QuotesPage({
  clients,
  products,
  quotes,
  onCreateQuote,
  onUpdateQuoteStatus,
  onUpdateQuote,
  onConvertQuoteToOrder,
}) {
  const safeClients = useMemo(() => (Array.isArray(clients) ? clients : []), [clients])
  const safeProducts = useMemo(() => (Array.isArray(products) ? products : []), [products])
  const safeQuotes = useMemo(() => (Array.isArray(quotes) ? quotes : []), [quotes])
  const sortedClients = useMemo(
    () =>
      (Array.isArray(clients) ? clients : []).toSorted((a, b) =>
        String(a?.name ?? '').localeCompare(String(b?.name ?? ''), 'es', { sensitivity: 'base' }),
      ),
    [clients],
  )
  const sortedProducts = useMemo(
    () =>
      (Array.isArray(products) ? products : []).toSorted((a, b) =>
        String(a?.name ?? '').localeCompare(String(b?.name ?? ''), 'es', { sensitivity: 'base' }),
      ),
    [products],
  )

  const productById = useMemo(
    () =>
      safeProducts.reduce((acc, product) => {
        acc[String(product.id)] = product
        return acc
      }, {}),
    [safeProducts],
  )

  const [selectedClientId, setSelectedClientId] = useState('')
  const [useManualClient, setUseManualClient] = useState(false)
  const [manualClientName, setManualClientName] = useState('')
  const [items, setItems] = useState([createDraftItem()])
  const [productionLeadTime, setProductionLeadTime] = useState('')
  const [deliveryType, setDeliveryType] = useState(deliveryTypes[0])
  const [shippingCost, setShippingCost] = useState(0)
  const [validUntil, setValidUntil] = useState(() => getDefaultValidUntil())
  const [submitMode, setSubmitMode] = useState('save')
  const [isFormModalOpen, setIsFormModalOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('TODOS')
  const [productSearch, setProductSearch] = useState('')
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState(0)
  const [activeItemIndex, setActiveItemIndex] = useState(0)
  const [confirmedItems, setConfirmedItems] = useState({})
  const [listFilter, setListFilter] = useState('active')
  const productSearchInputRef = useRef(null)

  const [expandedQuoteId, setExpandedQuoteId] = useState(null)
  const [quoteDrafts, setQuoteDrafts] = useState({})
  const [convertModalQuote, setConvertModalQuote] = useState(null)
  const [convertClientName, setConvertClientName] = useState('')
  const [convertClientPhone, setConvertClientPhone] = useState('')
  const [convertClientAddress, setConvertClientAddress] = useState('')

  const subtotal = useMemo(
    () =>
      items.reduce(
        (acc, item) => acc + toPositiveNumber(item.quantity) * toPositiveNumber(item.unitPrice),
        0,
      ),
    [items],
  )

  const normalizedShippingCost = deliveryType === 'Envío' ? toPositiveNumber(shippingCost) : 0
  const total = subtotal + normalizedShippingCost

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

  const quotesWithDerivedStatus = useMemo(
    () =>
      safeQuotes.map((quote) => ({
        ...quote,
        effectiveStatus: getQuoteEffectiveStatus(quote),
      })),
    [safeQuotes],
  )

  const visibleQuotes = useMemo(
    () =>
      quotesWithDerivedStatus.filter((quote) =>
        listFilter === 'expired'
          ? quote.effectiveStatus === 'Vencido'
          : quote.effectiveStatus !== 'Vencido',
      ),
    [quotesWithDerivedStatus, listFilter],
  )

  const handleDraftItemChange = (index, field, value) => {
    setConfirmedItems((prev) => {
      if (!prev[index]) return prev
      return {
        ...prev,
        [index]: false,
      }
    })

    setItems((prevItems) =>
      prevItems.map((item, itemIndex) => {
        if (itemIndex !== index) return item

        if (field === 'sourceMode') {
          return {
            ...item,
            sourceMode: value,
            productId: value === 'existing' ? item.productId : '',
            description: value === 'manual' ? item.description : '',
          }
        }

        if (field === 'productId') {
          const nextProductId = String(value ?? '')
          const defaultDescription = String(productById[nextProductId]?.name ?? '').trim()
          const suggestedUnitPrice = toPositiveNumber(productById[nextProductId]?.salePrice)
          return {
            ...item,
            productId: nextProductId,
            description: defaultDescription,
            unitPrice: suggestedUnitPrice > 0 ? suggestedUnitPrice : item.unitPrice,
          }
        }

        if (field === 'quantity' || field === 'unitPrice') {
          return {
            ...item,
            [field]: toPositiveNumber(value),
          }
        }

        return {
          ...item,
          [field]: value,
        }
      }),
    )
  }

  const addDraftItem = () => {
    setItems((prevItems) => {
      const existingEmptyIndex = prevItems.findIndex((item, index) => {
        const isConfirmed = Boolean(confirmedItems[index])
        if (isConfirmed) return false

        const isExistingMode = String(item?.sourceMode ?? 'existing') === 'existing'
        if (isExistingMode) {
          return !String(item?.productId ?? '').trim()
        }

        return !String(item?.description ?? '').trim()
      })

      if (existingEmptyIndex >= 0) {
        setActiveItemIndex(existingEmptyIndex)
        return prevItems
      }

      const nextItems = [...prevItems, createDraftItem()]
      setActiveItemIndex(nextItems.length - 1)
      return nextItems
    })
  }

  const removeDraftItem = (index) => {
    setItems((prevItems) => {
      if (prevItems.length === 1) return prevItems

      setConfirmedItems((prev) => {
        const next = {}
        Object.keys(prev).forEach((key) => {
          const numericKey = Number(key)
          if (!Number.isInteger(numericKey)) return
          if (numericKey === index) return
          if (numericKey > index) {
            next[numericKey - 1] = prev[key]
            return
          }
          next[numericKey] = prev[key]
        })
        return next
      })

      setActiveItemIndex((current) => {
        if (current > index) return current - 1
        if (current === index) return Math.max(index - 1, 0)
        return current
      })
      return prevItems.filter((_, itemIndex) => itemIndex !== index)
    })
  }

  const isDraftItemConfirmed = (index) => Boolean(confirmedItems[index])

  const canConfirmDraftItem = (item) => {
    if (!item) return false

    const sourceMode = String(item.sourceMode ?? 'existing')
    if (sourceMode === 'existing') {
      return String(item.productId ?? '').trim().length > 0
    }

    return String(item.description ?? '').trim().length > 0
  }

  const confirmDraftItem = (index) => {
    const targetItem = items[index]
    if (!canConfirmDraftItem(targetItem)) return

    setConfirmedItems((prev) => ({
      ...prev,
      [index]: true,
    }))

    const nextIndex = index + 1
    if (nextIndex < items.length) {
      setActiveItemIndex(nextIndex)
      return
    }

    setItems((prevItems) => {
      const nextItems = [...prevItems, createDraftItem()]
      setActiveItemIndex(nextItems.length - 1)
      return nextItems
    })
  }

  const unlockDraftItem = (index) => {
    setConfirmedItems((prev) => ({
      ...prev,
      [index]: false,
    }))
    setActiveItemIndex(index)
  }

  const quickSelectProduct = (productId) => {
    const safeProductId = String(productId ?? '').trim()
    if (!safeProductId) return

    let selectedIndex = -1

    setItems((prevItems) => {
      const safeItems = Array.isArray(prevItems) ? prevItems : [createDraftItem()]
      const activeIndexIsValid = activeItemIndex >= 0 && activeItemIndex < safeItems.length
      const activeIndexEditable = activeIndexIsValid && confirmedItems[activeItemIndex] !== true

      const firstEmpty = safeItems.findIndex(
        (item, index) =>
          confirmedItems[index] !== true &&
          String(item?.sourceMode ?? 'existing') === 'existing' &&
          !String(item?.productId ?? '').trim(),
      )

      const firstEditable = safeItems.findIndex((_, index) => confirmedItems[index] !== true)

      const indexToUse = activeIndexEditable
        ? activeItemIndex
        : firstEmpty >= 0
          ? firstEmpty
          : firstEditable >= 0
            ? firstEditable
            : Math.max(safeItems.length - 1, 0)
      selectedIndex = indexToUse

      const selectedProduct = productById[safeProductId]
      const suggestedUnitPrice = toPositiveNumber(selectedProduct?.salePrice)
      const nextItems = safeItems.map((item, index) =>
        index === indexToUse
          ? {
              ...item,
              sourceMode: 'existing',
              productId: safeProductId,
              description: String(selectedProduct?.name ?? item.description ?? '').trim(),
              unitPrice: suggestedUnitPrice > 0 ? suggestedUnitPrice : item.unitPrice,
            }
          : item,
      )

      return nextItems
    })

    if (selectedIndex >= 0) {
      setActiveItemIndex(selectedIndex)
    }

    setProductSearch('')
    setHighlightedSuggestionIndex(0)
  }

  const normalizeQuoteItemsFromDraft = (draftItems) =>
    (Array.isArray(draftItems) ? draftItems : [])
      .map((item) => {
        const sourceMode = String(item.sourceMode ?? 'existing')
        const productId = String(item.productId ?? '')
        const description = sourceMode === 'existing'
          ? String(productById[productId]?.name ?? '').trim()
          : String(item.description ?? '').trim()

        return {
          sourceMode,
          productId: sourceMode === 'existing' ? productId : '',
          description,
          quantity: Math.max(Math.floor(Number(item.quantity || 0)), 0),
          unitPrice: toPositiveNumber(item.unitPrice),
        }
      })
      .filter((item) => item.description && item.quantity > 0)

  const handleCreateQuote = (event) => {
    event.preventDefault()

    const normalizedItems = normalizeQuoteItemsFromDraft(items)
    if (normalizedItems.length === 0) return

    const selectedClient = safeClients.find((client) => String(client.id) === String(selectedClientId))
    const resolvedClientName = useManualClient
      ? String(manualClientName ?? '').trim()
      : String(selectedClient?.name ?? '').trim()

    const created = onCreateQuote?.({
      clientId: useManualClient ? '' : String(selectedClient?.id ?? ''),
      clientName: resolvedClientName || 'Sin cliente',
      clientSource: useManualClient ? 'manual' : selectedClient?.id ? 'existing' : 'none',
      items: normalizedItems,
      productionLeadTime,
      deliveryType,
      shippingCost: normalizedShippingCost,
      validUntil,
      createdAt: new Date().toISOString(),
    })

    if (!created?.id) return

    setSelectedClientId('')
    setUseManualClient(false)
    setManualClientName('')
    setItems([createDraftItem()])
    setProductionLeadTime('')
    setDeliveryType(deliveryTypes[0])
    setShippingCost(0)
    setValidUntil(getDefaultValidUntil())
    setSelectedCategory('TODOS')
    setProductSearch('')
    setHighlightedSuggestionIndex(0)
    setActiveItemIndex(0)
    setConfirmedItems({})
    setIsFormModalOpen(false)

    if (submitMode === 'pdf') {
      generateQuotePDF(created).catch(() => {
        window.alert('No se pudo generar el PDF del presupuesto.')
      })
    }
  }

  const executeConvertQuote = (quote, manualClientData = null) => {
    const result = onConvertQuoteToOrder?.({
      quote,
      manualClientData,
    })

    if (!result?.orderId) {
      window.alert('No se pudo convertir el presupuesto a pedido.')
      return
    }

    window.alert(`Presupuesto convertido correctamente a pedido ${result.orderId}.`)
  }

  const handleRequestConvertQuote = (quote) => {
    const effectiveStatus = getQuoteEffectiveStatus(quote)
    if (effectiveStatus === 'Vencido') {
      window.alert('No se puede convertir un presupuesto vencido.')
      return
    }

    if (String(quote.status ?? '') === 'Aceptado') {
      window.alert('Este presupuesto ya fue aceptado/conversión realizada.')
      return
    }

    const hasClientId = String(quote.clientId ?? '').trim().length > 0
    if (hasClientId) {
      executeConvertQuote(quote)
      return
    }

    setConvertModalQuote(quote)
    setConvertClientName(String(quote.clientName ?? '').trim() === 'Sin cliente' ? '' : String(quote.clientName ?? '').trim())
    setConvertClientPhone('')
    setConvertClientAddress('')
  }

  const handleConfirmConvertManualClient = (event) => {
    event.preventDefault()

    if (!convertModalQuote) return

    const name = String(convertClientName ?? '').trim()
    const phone = String(convertClientPhone ?? '').trim()
    const address = String(convertClientAddress ?? '').trim()

    if (!name || !phone) {
      window.alert('Nombre y teléfono son obligatorios para convertir el presupuesto.')
      return
    }

    executeConvertQuote(convertModalQuote, {
      name,
      phone,
      address,
    })

    setConvertModalQuote(null)
    setConvertClientName('')
    setConvertClientPhone('')
    setConvertClientAddress('')
  }

  const getQuoteDraft = (quote) => {
    const quoteId = String(quote?.id ?? '')
    const existing = quoteDrafts[quoteId]
    if (existing) return existing

    return {
      clientName: String(quote?.clientName ?? ''),
      productionLeadTime: String(quote?.productionLeadTime ?? ''),
      deliveryType: String(quote?.deliveryType ?? deliveryTypes[0]),
      shippingCost: String(Number(quote?.shippingCost || 0)),
      validUntil: String(quote?.validUntil ?? ''),
      items: (Array.isArray(quote?.items) ? quote.items : []).map((item) => normalizeQuoteItemDraft(item)),
    }
  }

  const updateQuoteDraft = (quoteId, field, value) => {
    setQuoteDrafts((prev) => {
      const current = prev[quoteId] ?? {
        clientName: '',
        productionLeadTime: '',
        deliveryType: deliveryTypes[0],
        shippingCost: '0',
        validUntil: '',
        items: [createDraftItem()],
      }

      return {
        ...prev,
        [quoteId]: {
          ...current,
          [field]: value,
        },
      }
    })
  }

  const updateQuoteDraftItem = (quoteId, index, field, value) => {
    setQuoteDrafts((prev) => {
      const current = prev[quoteId] ?? getQuoteDraft({ id: quoteId })
      const nextItems = (Array.isArray(current.items) ? current.items : []).map((item, itemIndex) => {
        if (itemIndex !== index) return item

        if (field === 'sourceMode') {
          return {
            ...item,
            sourceMode: value,
            productId: value === 'existing' ? item.productId : '',
            description: value === 'manual' ? item.description : '',
          }
        }

        if (field === 'productId') {
          const nextProductId = String(value ?? '')
          return {
            ...item,
            productId: nextProductId,
            description: String(productById[nextProductId]?.name ?? '').trim(),
          }
        }

        if (field === 'quantity' || field === 'unitPrice') {
          return {
            ...item,
            [field]: toPositiveNumber(value),
          }
        }

        return {
          ...item,
          [field]: value,
        }
      })

      return {
        ...prev,
        [quoteId]: {
          ...current,
          items: nextItems,
        },
      }
    })
  }

  const addQuoteDraftItem = (quoteId) => {
    setQuoteDrafts((prev) => {
      const current = prev[quoteId] ?? getQuoteDraft({ id: quoteId })
      return {
        ...prev,
        [quoteId]: {
          ...current,
          items: [...(Array.isArray(current.items) ? current.items : []), createDraftItem()],
        },
      }
    })
  }

  const removeQuoteDraftItem = (quoteId, index) => {
    setQuoteDrafts((prev) => {
      const current = prev[quoteId] ?? getQuoteDraft({ id: quoteId })
      const currentItems = Array.isArray(current.items) ? current.items : []
      if (currentItems.length <= 1) return prev

      return {
        ...prev,
        [quoteId]: {
          ...current,
          items: currentItems.filter((_, itemIndex) => itemIndex !== index),
        },
      }
    })
  }

  const handleSaveQuoteChanges = (quoteId) => {
    const draft = quoteDrafts[quoteId]
    if (!draft) return

    const normalizedItems = normalizeQuoteItemsFromDraft(draft.items)
    if (normalizedItems.length === 0) {
      window.alert('Completá al menos un ítem válido para guardar el presupuesto.')
      return
    }

    onUpdateQuote?.(quoteId, {
      clientName: String(draft.clientName ?? '').trim() || 'Sin cliente',
      productionLeadTime: String(draft.productionLeadTime ?? '').trim(),
      deliveryType: String(draft.deliveryType ?? deliveryTypes[0]),
      shippingCost: String(draft.shippingCost ?? '0'),
      validUntil: String(draft.validUntil ?? ''),
      items: normalizedItems,
    })

    setQuoteDrafts((prev) => {
      const next = { ...prev }
      delete next[quoteId]
      return next
    })
  }

  const toggleQuoteDetail = (quoteId) => {
    setExpandedQuoteId((current) => (current === quoteId ? null : quoteId))
  }

  const closeFormModal = () => {
    setIsFormModalOpen(false)
    setSelectedClientId('')
    setUseManualClient(false)
    setManualClientName('')
    setItems([createDraftItem()])
    setProductionLeadTime('')
    setDeliveryType(deliveryTypes[0])
    setShippingCost(0)
    setValidUntil(getDefaultValidUntil())
    setSelectedCategory('TODOS')
    setProductSearch('')
    setHighlightedSuggestionIndex(0)
    setActiveItemIndex(0)
    setConfirmedItems({})
  }

  return (
    <section className="page-section">
      <header className="page-header">
        <div className="page-header-row">
          <div>
            <h2>Presupuestos</h2>
            <p>Creá y gestioná presupuestos sin impactar pedidos, stock ni finanzas.</p>
          </div>
          <button type="button" className="primary-btn" onClick={() => setIsFormModalOpen(true)}>
            + Nuevo presupuesto
          </button>
        </div>
      </header>

      <div className="products-grid products-grid-single">
        <section className="card-block">
          <div className="card-head">
            <h3>Listado de presupuestos</h3>
          </div>

          <div className="product-actions" style={{ marginBottom: 10 }}>
            <label>
              Vista
              <select value={listFilter} onChange={(event) => setListFilter(event.target.value)}>
                <option value="active">Principal (activos)</option>
                <option value="expired">Vencidos</option>
              </select>
            </label>
          </div>

          <div className="table-wrap">
            <table className="products-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Cliente</th>
                  <th>Total</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {visibleQuotes.map((quote) => {
                  const quoteId = String(quote.id)
                  const resolvedStatus = String(quote.effectiveStatus ?? quote.status ?? 'Pendiente')
                  const isExpanded = expandedQuoteId === quoteId
                  const draft = getQuoteDraft(quote)
                  const draftItems = Array.isArray(draft.items) ? draft.items : []

                  return (
                    <Fragment key={quoteId}>
                      <tr>
                        <td>{quote.id}</td>
                        <td>{quote.clientName || 'Sin cliente'}</td>
                        <td>{formatCurrency(quote.total)}</td>
                        <td>
                          <select
                            value={resolvedStatus}
                            onChange={(event) => onUpdateQuoteStatus?.(quote.id, event.target.value)}
                            disabled={resolvedStatus === 'Vencido'}
                          >
                            {quoteStatuses.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>{formatDateTime(quote.createdAt)}</td>
                        <td>
                          <div className="product-row-actions">
                            <button
                              type="button"
                              className="quick-fill-btn"
                              onClick={() => toggleQuoteDetail(quoteId)}
                            >
                              {isExpanded ? 'Ocultar' : 'Ver detalle'}
                            </button>
                            <button
                              type="button"
                              className="quick-fill-btn"
                              onClick={() => {
                                generateQuotePDF(quote).catch(() => {
                                  window.alert('No se pudo generar el PDF del presupuesto.')
                                })
                              }}
                            >
                              Generar PDF
                            </button>
                            <button
                              type="button"
                              className="primary-btn"
                              onClick={() => handleRequestConvertQuote(quote)}
                              disabled={resolvedStatus === 'Vencido' || String(quote.status ?? '') === 'Aceptado'}
                            >
                              Convertir en Pedido
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr>
                          <td colSpan={6} className="purchase-detail-cell">
                            <div className="order-detail-content">
                              <div className="adjustment-grid">
                                <label>
                                  Cliente
                                  <input
                                    type="text"
                                    value={draft.clientName}
                                    onChange={(event) => updateQuoteDraft(quoteId, 'clientName', event.target.value)}
                                  />
                                </label>
                                <label>
                                  Tiempo estimado de producción
                                  <input
                                    type="text"
                                    value={draft.productionLeadTime}
                                    onChange={(event) => updateQuoteDraft(quoteId, 'productionLeadTime', event.target.value)}
                                  />
                                </label>
                                <label>
                                  Tipo de entrega
                                  <select
                                    value={draft.deliveryType}
                                    onChange={(event) => updateQuoteDraft(quoteId, 'deliveryType', event.target.value)}
                                  >
                                    {deliveryTypes.map((type) => (
                                      <option key={type} value={type}>
                                        {type}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  Costo de envío
                                  <input
                                    type="number"
                                    min="0"
                                    value={draft.shippingCost}
                                    onChange={(event) => updateQuoteDraft(quoteId, 'shippingCost', event.target.value)}
                                    disabled={draft.deliveryType !== 'Envío'}
                                  />
                                </label>
                                <label>
                                  Fecha de validez
                                  <input
                                    type="date"
                                    value={draft.validUntil}
                                    onChange={(event) => updateQuoteDraft(quoteId, 'validUntil', event.target.value)}
                                  />
                                </label>
                              </div>

                              <div className="items-head">
                                <h4>Ítems</h4>
                                <button
                                  type="button"
                                  className="secondary-btn"
                                  onClick={() => addQuoteDraftItem(quoteId)}
                                >
                                  + Agregar ítem
                                </button>
                              </div>

                              <div className="items-stack">
                                {draftItems.map((item, index) => (
                                  <div key={`${quoteId}-item-${index}`} className="quote-item-row">
                                    <select
                                      value={item.sourceMode}
                                      onChange={(event) =>
                                        updateQuoteDraftItem(quoteId, index, 'sourceMode', event.target.value)
                                      }
                                    >
                                      <option value="existing">Producto existente</option>
                                      <option value="manual">Producto manual</option>
                                    </select>

                                    {item.sourceMode === 'existing' ? (
                                      <select
                                        value={item.productId}
                                        onChange={(event) =>
                                          updateQuoteDraftItem(quoteId, index, 'productId', event.target.value)
                                        }
                                      >
                                        <option value="">Seleccionar producto</option>
                                        {sortedProducts.map((product) => (
                                          <option key={product.id} value={product.id}>
                                            {product.name}
                                          </option>
                                        ))}
                                      </select>
                                    ) : (
                                      <input
                                        type="text"
                                        value={item.description}
                                        onChange={(event) =>
                                          updateQuoteDraftItem(quoteId, index, 'description', event.target.value)
                                        }
                                        placeholder="Descripción manual"
                                      />
                                    )}

                                    <input
                                      type="number"
                                      min="1"
                                      value={item.quantity}
                                      onChange={(event) =>
                                        updateQuoteDraftItem(quoteId, index, 'quantity', event.target.value)
                                      }
                                      placeholder="Cantidad"
                                    />
                                    <input
                                      type="number"
                                      min="0"
                                      value={item.unitPrice}
                                      onChange={(event) =>
                                        updateQuoteDraftItem(quoteId, index, 'unitPrice', event.target.value)
                                      }
                                      placeholder="Precio unitario"
                                    />
                                    <button
                                      type="button"
                                      className="danger-ghost-btn"
                                      onClick={() => removeQuoteDraftItem(quoteId, index)}
                                    >
                                      Quitar
                                    </button>
                                  </div>
                                ))}
                              </div>

                              <div className="product-actions">
                                <button
                                  type="button"
                                  className="primary-btn"
                                  onClick={() => handleSaveQuoteChanges(quoteId)}
                                >
                                  Guardar cambios
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}

                {visibleQuotes.length === 0 && (
                  <tr>
                    <td colSpan={6} className="empty-detail">
                      No hay presupuestos cargados.
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
          aria-label="Nuevo presupuesto"
          onKeyDown={(event) => { if (event.key === 'Escape') closeFormModal() }}
        >
          <div className="order-form-modal entity-form-modal">
            <div className="order-form-modal-header">
              <h3>Nuevo presupuesto</h3>
              <button type="button" className="secondary-btn" onClick={closeFormModal}>Cerrar</button>
            </div>
            <div className="order-form-modal-body">
              <form className="order-form" onSubmit={handleCreateQuote}>
                <label>
                  Cliente existente (opcional)
                  <select
                    value={selectedClientId}
                    onChange={(event) => setSelectedClientId(event.target.value)}
                    disabled={useManualClient}
                  >
                    <option value="">Sin cliente seleccionado</option>
                    {sortedClients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <input
                    type="checkbox"
                    checked={useManualClient}
                    onChange={(event) => {
                      const checked = event.target.checked
                      setUseManualClient(checked)
                      if (checked) setSelectedClientId('')
                    }}
                  />{' '}
                  Cargar cliente manual
                </label>

                {useManualClient && (
                  <label>
                    Cliente manual
                    <input
                      type="text"
                      value={manualClientName}
                      onChange={(event) => setManualClientName(event.target.value)}
                      placeholder="Nombre del cliente"
                    />
                  </label>
                )}

                <div className="items-head">
                  <h4>Ítems del presupuesto</h4>
                  <button type="button" className="secondary-btn" onClick={addDraftItem}>
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
                      <div className="orders-autocomplete-list" role="listbox" aria-label="Sugerencias de productos para presupuesto">
                        {autocompleteProducts.map((product, index) => (
                          <button
                            key={`quote-suggestion-${product.id}`}
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

                <div className="items-stack">
                  {items.map((item, index) => (
                    <div key={`quote-item-${index}`} className="quote-item-row">
                      {(() => {
                        const itemIsConfirmed = isDraftItemConfirmed(index)

                        return (
                          <>
                      <select
                        value={item.sourceMode}
                        onChange={(event) => handleDraftItemChange(index, 'sourceMode', event.target.value)}
                        onFocus={() => setActiveItemIndex(index)}
                        disabled={itemIsConfirmed}
                      >
                        <option value="existing">Producto existente</option>
                        <option value="manual">Producto manual</option>
                      </select>

                      {item.sourceMode === 'existing' ? (
                        <select
                          value={item.productId}
                          onChange={(event) => handleDraftItemChange(index, 'productId', event.target.value)}
                          onFocus={() => setActiveItemIndex(index)}
                          disabled={itemIsConfirmed}
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
                      ) : (
                        <input
                          type="text"
                          value={item.description}
                          onChange={(event) => handleDraftItemChange(index, 'description', event.target.value)}
                          onFocus={() => setActiveItemIndex(index)}
                          disabled={itemIsConfirmed}
                          placeholder="Descripción manual"
                        />
                      )}

                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(event) => handleDraftItemChange(index, 'quantity', event.target.value)}
                        onFocus={() => setActiveItemIndex(index)}
                        disabled={itemIsConfirmed}
                        placeholder="Cantidad"
                      />
                      <input
                        type="number"
                        min="0"
                        value={item.unitPrice}
                        onChange={(event) => handleDraftItemChange(index, 'unitPrice', event.target.value)}
                        onFocus={() => setActiveItemIndex(index)}
                        disabled={itemIsConfirmed}
                        placeholder="Precio unitario"
                      />
                      <button
                        type="button"
                        className="danger-ghost-btn"
                        onClick={() => removeDraftItem(index)}
                      >
                        Quitar
                      </button>
                      {!itemIsConfirmed ? (
                        <button
                          type="button"
                          className="secondary-btn"
                          onClick={() => confirmDraftItem(index)}
                          disabled={!canConfirmDraftItem(item)}
                        >
                          Confirmar
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="quick-fill-btn"
                          onClick={() => unlockDraftItem(index)}
                        >
                          Editar
                        </button>
                      )}
                      {item.sourceMode === 'existing' && item.productId && (
                        <p className="payment-helper">
                          Precio sugerido: <strong>{formatCurrency(productById[item.productId]?.salePrice || 0)}</strong>
                        </p>
                      )}
                          </>
                        )
                      })()}
                    </div>
                  ))}
                </div>

                <label>
                  Tiempo estimado de producción
                  <input
                    type="text"
                    value={productionLeadTime}
                    onChange={(event) => setProductionLeadTime(event.target.value)}
                    placeholder="Ej: 7 a 10 días hábiles"
                  />
                </label>

                <label>
                  Tipo de entrega
                  <select value={deliveryType} onChange={(event) => setDeliveryType(event.target.value)}>
                    {deliveryTypes.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </label>

                {deliveryType === 'Envío' && (
                  <label>
                    Costo de envío
                    <input
                      type="number"
                      min="0"
                      value={shippingCost}
                      onChange={(event) => setShippingCost(event.target.value)}
                    />
                  </label>
                )}

                <label>
                  Fecha de validez
                  <input
                    type="date"
                    value={validUntil}
                    onChange={(event) => setValidUntil(event.target.value)}
                  />
                </label>

                <div className="totals-box">
                  <p>
                    <span>Subtotal</span>
                    <strong>{formatCurrency(subtotal)}</strong>
                  </p>
                  <p>
                    <span>Total</span>
                    <strong>{formatCurrency(total)}</strong>
                  </p>
                </div>

                <div className="order-form-actions">
                  <button type="button" className="secondary-btn" onClick={closeFormModal}>
                    Cancelar
                  </button>
                  <button type="submit" className="primary-btn" onClick={() => setSubmitMode('save')}>
                    Guardar presupuesto
                  </button>
                  <button type="submit" className="secondary-btn" onClick={() => setSubmitMode('pdf')}>
                    Guardar y generar PDF
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {convertModalQuote && (
        <div className="modal-overlay">
          <div className="modal-card">
            <h4>Convertir presupuesto a pedido</h4>
            <p>Completá el cliente para generar el pedido.</p>
            <form onSubmit={handleConfirmConvertManualClient} className="order-form">
              <label>
                Nombre (obligatorio)
                <input
                  type="text"
                  value={convertClientName}
                  onChange={(event) => setConvertClientName(event.target.value)}
                  required
                />
              </label>
              <label>
                Teléfono (obligatorio)
                <input
                  type="text"
                  value={convertClientPhone}
                  onChange={(event) => setConvertClientPhone(event.target.value)}
                  required
                />
              </label>
              <label>
                Dirección (opcional)
                <input
                  type="text"
                  value={convertClientAddress}
                  onChange={(event) => setConvertClientAddress(event.target.value)}
                />
              </label>

              <div className="product-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => {
                    setConvertModalQuote(null)
                    setConvertClientName('')
                    setConvertClientPhone('')
                    setConvertClientAddress('')
                  }}
                >
                  Cancelar
                </button>
                <button type="submit" className="primary-btn">
                  Convertir en Pedido
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}

export default QuotesPage
