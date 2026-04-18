import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatOrderId } from '../../utils/orders'
import { createDebouncedStorageWriter } from '../../utils/storageDebounce'
import useAppDialog from '../../hooks/useAppDialog'

const orderStatuses = ['Pendiente', 'En Proceso', 'Listo', 'Entregado', 'Cancelado']
const sampleOrderStatuses = ['Pendiente', 'Lista']
const ORDER_DRAFT_STORAGE_KEY = 'packya_order_draft'
const LEGACY_ORDER_DRAFT_STORAGE_KEY = 'packya_draft_order'
const PRODUCT_FILTER_OPTIONS = ['TODOS', 'CAJA', 'BOLSA', 'EMBALAJE', 'OTRO']

const createEmptyItem = () => ({
  productId: '',
  quantity: 1,
  unitPrice: 0,
  isClientMaterial: false,
})

const createInitialQuickClientForm = () => ({
  name: '',
  phone: '',
  address: '',
  notes: '',
})

const getTodayDateInput = () => {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const isDateInputValue = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

const normalizeDraftItem = (item) => ({
  productId: String(item?.productId ?? ''),
  quantity: Math.max(parsePositiveNumber(item?.quantity), 1),
  unitPrice: parsePositiveNumber(item?.unitPrice),
  isClientMaterial: Boolean(item?.isClientMaterial ?? false),
})

const hasMeaningfulDraftData = (draft) => {
  if (!draft || typeof draft !== 'object') return false

  const hasClient = String(draft?.clientId ?? '').trim().length > 0
  const hasSampleClient = String(draft?.sampleClientName ?? '').trim().length > 0
  const hasDeliveryDate = String(draft?.deliveryDate ?? '').trim().length > 0
  const hasFinancialNote = String(draft?.financialNote ?? '').trim().length > 0
  const hasDiscount = parsePositiveNumber(draft?.discount) > 0
  const hasItems = (Array.isArray(draft?.items) ? draft.items : []).some(
    (item) => String(item?.productId ?? '').trim().length > 0,
  )
  const hasQuickClientData =
    Boolean(draft?.isQuickCreateClientOpen) ||
    String(draft?.quickClientForm?.name ?? '').trim().length > 0 ||
    String(draft?.quickClientForm?.phone ?? '').trim().length > 0 ||
    String(draft?.quickClientForm?.address ?? '').trim().length > 0 ||
    String(draft?.quickClientForm?.notes ?? '').trim().length > 0

  return (
    hasClient ||
    hasSampleClient ||
    hasDeliveryDate ||
    hasFinancialNote ||
    hasDiscount ||
    hasItems ||
    hasQuickClientData
  )
}

const readOrderDraftFromSessionStorage = () => {
  if (typeof window === 'undefined' || !window.sessionStorage) return null

  try {
    const raw =
      window.sessionStorage.getItem(ORDER_DRAFT_STORAGE_KEY) ||
      window.sessionStorage.getItem(LEGACY_ORDER_DRAFT_STORAGE_KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    return hasMeaningfulDraftData(parsed) ? parsed : null
  } catch {
    return null
  }
}

const clearOrderDraftFromSessionStorage = () => {
  if (typeof window === 'undefined' || !window.sessionStorage) return

  try {
    window.sessionStorage.removeItem(ORDER_DRAFT_STORAGE_KEY)
    window.sessionStorage.removeItem(LEGACY_ORDER_DRAFT_STORAGE_KEY)
  } catch {
    void 0
  }
}

const parsePositiveNumber = (value) => {
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

const getClientSearchScore = (client, query) => {
  const queryText = normalizeSearchText(query)
  if (!queryText) return 0

  const nameScore = getSearchScore(String(client?.name ?? ''), queryText)
  const phone = normalizeSearchText(client?.phone)
  const address = normalizeSearchText(client?.address)

  const phoneBoost = phone.includes(queryText) ? 180 : -1
  const addressBoost = address.includes(queryText) ? 90 : -1

  return Math.max(nameScore, phoneBoost, addressBoost)
}

const formatCurrency = (value) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value)

const normalizeClientKey = ({ clientId, clientName }) => {
  const safeClientId = String(clientId ?? '').trim()
  if (safeClientId) return `id:${safeClientId}`

  const safeClientName = normalizeSearchText(clientName)
  if (safeClientName) return `name:${safeClientName}`
  return ''
}

function OrdersForm({
  orderId,
  products,
  orders,
  clients,
  stockByProductId,
  onCreate,
  onCreateClient,
  onProductUsed,
  onSuccess,
  onCancel,
  isModal,
  formId,
}) {
  const safeProducts = useMemo(() => (Array.isArray(products) ? products : []), [products])
  const safeOrders = useMemo(() => (Array.isArray(orders) ? orders : []), [orders])
  const safeClients = useMemo(() => (Array.isArray(clients) ? clients : []), [clients])
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
  const safeStockByProductId = stockByProductId ?? {}
  const initialDraft = useMemo(() => readOrderDraftFromSessionStorage(), [])
  const hasPromptedDraftRestoreRef = useRef(false)
  const shouldSkipDraftPersistRef = useRef(false)
  const productSearchInputRef = useRef(null)
  const clientSearchInputRef = useRef(null)
  const clientSelectRef = useRef(null)
  const sampleClientNameInputRef = useRef(null)
  const itemProductRefs = useRef({})

  const { dialogNode, appConfirm } = useAppDialog()
  const draftStorageWriter = useMemo(
    () => createDebouncedStorageWriter({
      key: ORDER_DRAFT_STORAGE_KEY,
      storageGetter: () => (typeof window !== 'undefined' ? window.sessionStorage : null),
      label: 'order-draft',
    }),
    [],
  )

  const clearOrderDraftNow = useCallback(() => {
    draftStorageWriter.cancel()
    clearOrderDraftFromSessionStorage()
  }, [draftStorageWriter])

  const productById = useMemo(
    () =>
      safeProducts.reduce((acc, product) => {
        acc[product.id] = product
        return acc
      }, {}),
    [safeProducts],
  )

  const [clientId, setClientId] = useState(() => String(initialDraft?.clientId ?? ''))
  const [status, setStatus] = useState(() => {
    const draftIsSample = Boolean(initialDraft?.isSample)
    const allowedStatuses = draftIsSample ? sampleOrderStatuses : orderStatuses
    const draftStatus = String(initialDraft?.status ?? allowedStatuses[0])
    return allowedStatuses.includes(draftStatus) ? draftStatus : allowedStatuses[0]
  })
  const [deliveryDate, setDeliveryDate] = useState(() =>
    isDateInputValue(initialDraft?.deliveryDate) ? initialDraft.deliveryDate : '',
  )
  const [financialNote, setFinancialNote] = useState(() => String(initialDraft?.financialNote ?? ''))
  const [discount, setDiscount] = useState(() => parsePositiveNumber(initialDraft?.discount))
  const [items, setItems] = useState(() => {
    const draftItems = Array.isArray(initialDraft?.items)
      ? initialDraft.items.map((item) => normalizeDraftItem(item))
      : []

    return draftItems.length > 0 ? draftItems : [createEmptyItem()]
  })
  const [createdAt, setCreatedAt] = useState(() => {
    return isDateInputValue(initialDraft?.createdAt) ? initialDraft.createdAt : getTodayDateInput()
  })
  const [productionDate, setProductionDate] = useState(() => {
    return isDateInputValue(initialDraft?.productionDate)
      ? initialDraft.productionDate
      : getTodayDateInput()
  })
  const [isSample, setIsSample] = useState(() => Boolean(initialDraft?.isSample))
  const [sampleClientName, setSampleClientName] = useState(() => String(initialDraft?.sampleClientName ?? ''))
  const [sampleClientPhone, setSampleClientPhone] = useState(() => String(initialDraft?.sampleClientPhone ?? ''))
  const [isQuickCreateClientOpen, setIsQuickCreateClientOpen] = useState(
    () => Boolean(initialDraft?.isQuickCreateClientOpen),
  )
  const [quickClientForm, setQuickClientForm] = useState(() => ({
    ...createInitialQuickClientForm(),
    ...(initialDraft?.quickClientForm && typeof initialDraft.quickClientForm === 'object'
      ? {
          name: String(initialDraft.quickClientForm?.name ?? ''),
          phone: String(initialDraft.quickClientForm?.phone ?? ''),
          address: String(initialDraft.quickClientForm?.address ?? ''),
          notes: String(initialDraft.quickClientForm?.notes ?? ''),
        }
      : {}),
  }))
  const [quickClientError, setQuickClientError] = useState('')
  const [clientSearch, setClientSearch] = useState('')
  const [highlightedClientSuggestionIndex, setHighlightedClientSuggestionIndex] = useState(0)
  const [isClientSearchFocused, setIsClientSearchFocused] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('TODOS')
  const [productSearch, setProductSearch] = useState('')
  const [highlightedSuggestionIndex, setHighlightedSuggestionIndex] = useState(0)
  const [activeItemIndex, setActiveItemIndex] = useState(0)
  const [confirmedItems, setConfirmedItems] = useState({})
  const [, setInputFallbackTick] = useState(0)
  const [saving, setSaving] = useState(false)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [saveError, setSaveError] = useState('')
  const itemsSectionRef = useRef(null)

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

  const clientsById = useMemo(
    () =>
      safeClients.reduce((acc, client) => {
        const key = String(client?.id ?? '').trim()
        if (!key) return acc
        acc[key] = client
        return acc
      }, {}),
    [safeClients],
  )

  const productIdByName = useMemo(
    () =>
      safeProducts.reduce((acc, product) => {
        const key = normalizeSearchText(product?.name)
        if (!key) return acc
        acc[key] = String(product?.id ?? '').trim()
        return acc
      }, {}),
    [safeProducts],
  )

  const filteredClients = useMemo(() => {
    const query = String(clientSearch ?? '').trim()
    if (!query) return []

    return sortedClients
      .map((client) => ({
        client,
        score: getClientSearchScore(client, query),
      }))
      .filter((row) => row.score >= 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        return String(a.client?.name ?? '').localeCompare(String(b.client?.name ?? ''), 'es', { sensitivity: 'base' })
      })
      .map((row) => row.client)
  }, [clientSearch, sortedClients])

  const autocompleteClients = useMemo(() => filteredClients.slice(0, 8), [filteredClients])

  const shouldShowClientSuggestions = useMemo(() => {
    const query = normalizeSearchText(clientSearch)
    if (!isClientSearchFocused) return false
    if (!query) return false
    if (autocompleteClients.length === 0) return false

    if (autocompleteClients.length === 1) {
      const onlyName = normalizeSearchText(autocompleteClients[0]?.name)
      if (onlyName === query) return false
    }

    const selectedClientName = normalizeSearchText(clientsById[clientId]?.name)
    if (selectedClientName && selectedClientName === query) return false

    return true
  }, [autocompleteClients, clientId, clientSearch, clientsById, isClientSearchFocused])

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

  const suggestedProductsForClient = useMemo(() => {
    if (isSample) return []

    const selectedClient = clientsById[String(clientId ?? '').trim()]
    const clientKey = normalizeClientKey({
      clientId: selectedClient?.id ?? clientId,
      clientName: selectedClient?.name,
    })

    if (!clientKey) return []

    const usageByProductId = {}

    safeOrders.forEach((order) => {
      if (!order || typeof order !== 'object') return
      if (order.isSample) return
      if (String(order?.status ?? '') === 'Cancelado') return
      if (String(order?.id ?? '') === String(orderId ?? '')) return

      const orderKey = normalizeClientKey({
        clientId: order?.clientId,
        clientName: order?.clientName ?? order?.client,
      })

      if (!orderKey || orderKey !== clientKey) return

      ;(Array.isArray(order?.items) ? order.items : []).forEach((item) => {
        const productId = String(item?.productId ?? '').trim() || productIdByName[normalizeSearchText(item?.productName ?? item?.product)] || ''
        if (!productId || !productById[productId]) return

        const row = usageByProductId[productId] ?? { count: 0, orders: 0 }
        row.count += Math.max(Number(item?.quantity || 0), 1)
        row.orders += 1
        usageByProductId[productId] = row
      })
    })

    return Object.entries(usageByProductId)
      .map(([productId, usage]) => ({
        ...productById[productId],
        suggestedCount: Number(usage?.count || 0),
        suggestedOrders: Number(usage?.orders || 0),
      }))
      .filter((product) => product?.id)
      .sort((a, b) => {
        const countDiff = Number(b?.suggestedCount || 0) - Number(a?.suggestedCount || 0)
        if (countDiff !== 0) return countDiff

        const usageDiff = (Number(b?.usageCount) || 0) - (Number(a?.usageCount) || 0)
        if (usageDiff !== 0) return usageDiff

        return String(a?.name ?? '').localeCompare(String(b?.name ?? ''), 'es', { sensitivity: 'base' })
      })
      .slice(0, 6)
  }, [clientId, clientsById, isSample, orderId, productById, productIdByName, safeOrders])

  useEffect(() => {
    if (shouldSkipDraftPersistRef.current) {
      shouldSkipDraftPersistRef.current = false
      return
    }

    const draftPayload = {
      clientId,
      status,
      deliveryDate,
      financialNote: String(financialNote ?? ''),
      discount: parsePositiveNumber(discount),
      items: (Array.isArray(items) ? items : []).map((item) => normalizeDraftItem(item)),
      createdAt,
      productionDate,
      isSample,
      sampleClientName,
      sampleClientPhone,
      isQuickCreateClientOpen,
      quickClientForm: {
        name: String(quickClientForm?.name ?? ''),
        phone: String(quickClientForm?.phone ?? ''),
        address: String(quickClientForm?.address ?? ''),
        notes: String(quickClientForm?.notes ?? ''),
      },
    }

    if (!hasMeaningfulDraftData(draftPayload)) {
      draftStorageWriter.cancel()
      clearOrderDraftFromSessionStorage()
      return
    }

    draftStorageWriter.schedule(draftPayload)
  }, [
    clientId,
    status,
    deliveryDate,
    financialNote,
    discount,
    items,
    createdAt,
    productionDate,
    isSample,
    sampleClientName,
    sampleClientPhone,
    isQuickCreateClientOpen,
    quickClientForm,
    draftStorageWriter,
  ])

  useEffect(() => {
    const handleBeforeUnload = () => {
      draftStorageWriter.flush()
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', handleBeforeUnload)
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('beforeunload', handleBeforeUnload)
      }
      draftStorageWriter.flush()
      draftStorageWriter.cancel()
    }
  }, [draftStorageWriter])

  useEffect(() => {
    if (!productSearchInputRef.current) return
    productSearchInputRef.current.focus()
  }, [normalizedSelectedCategory])

  useEffect(() => {
    const element = itemProductRefs.current[activeItemIndex]
    if (!element) return
    element.focus()
  }, [activeItemIndex, items.length])

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined
    if (typeof document === 'undefined') return undefined

    const handleFocusIn = (event) => {
      const target = event.target
      const isInputLike =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement

      if (!isInputLike) return

      const isBlocked =
        Boolean(target.disabled) ||
        (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
          ? Boolean(target.readOnly)
          : false)

      if (!isBlocked) return

      // Fallback: forzar un rerender controlado cuando detectamos un campo bloqueado.
      setInputFallbackTick((prev) => prev + 1)
    }

    document.addEventListener('focusin', handleFocusIn)
    return () => document.removeEventListener('focusin', handleFocusIn)
  }, [])

  useEffect(() => {
    if (!isModal) return
    const timer = setTimeout(() => {
      clientSelectRef.current?.focus()
    }, 100)
    return () => clearTimeout(timer)
  }, [isModal])

  const resetForm = () => {
    const today = getTodayDateInput()
    setClientId('')
    setStatus(orderStatuses[0])
    setDeliveryDate('')
    setFinancialNote('')
    setDiscount(0)
    setItems([createEmptyItem()])
    setCreatedAt(today)
    setProductionDate(today)
    setIsSample(false)
    setSampleClientName('')
    setSampleClientPhone('')
    setConfirmedItems({})
    setActiveItemIndex(0)
    setIsQuickCreateClientOpen(false)
    setQuickClientForm(createInitialQuickClientForm())
    setQuickClientError('')
    setClientSearch('')
    setHighlightedClientSuggestionIndex(0)
    setProductSearch('')
    setHighlightedSuggestionIndex(0)
  }

  useEffect(() => {
    if (hasPromptedDraftRestoreRef.current) return
    hasPromptedDraftRestoreRef.current = true
    if (!isModal || !initialDraft) return

    void appConfirm('Se encontró un borrador de pedido. ¿Querés restaurarlo?').then((shouldRestore) => {
      if (shouldRestore) return

      shouldSkipDraftPersistRef.current = true
      clearOrderDraftNow()
      setTimeout(() => {
        resetForm()
      }, 0)
    })
  }, [initialDraft, isModal, clearOrderDraftNow, appConfirm])

  const availableStatuses = isSample ? sampleOrderStatuses : orderStatuses

  const isDirty = useMemo(
    () =>
      (isSample ? String(sampleClientName ?? '').trim().length > 0 : Boolean(clientId)) ||
      Boolean(deliveryDate) ||
      items.some((item) => Boolean(item.productId)),
    [isSample, sampleClientName, clientId, deliveryDate, items],
  )

  const subtotal = useMemo(
    () =>
      items.reduce(
        (acc, item) => acc + item.quantity * item.unitPrice,
        0,
      ),
    [items],
  )

  const normalizedDiscount = Math.min(parsePositiveNumber(discount), subtotal)
  const total = subtotal - normalizedDiscount

  const draftReservedByProductId = useMemo(
    () =>
      items.reduce((acc, item) => {
        if (!item.productId) return acc
        if (item.isClientMaterial) return acc
        acc[item.productId] = (acc[item.productId] ?? 0) + parsePositiveNumber(item.quantity)
        return acc
      }, {}),
    [items],
  )

  const handleItemChange = (index, field, value) => {
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

        if (field === 'productId') {
          const selectedProduct = productById[value]
          const nextUnitPrice = parsePositiveNumber(selectedProduct?.salePrice)

          if (value && value !== item.productId) {
            onProductUsed?.(value)
          }

          return {
            ...item,
            productId: value,
            unitPrice: nextUnitPrice,
          }
        }

        if (field === 'quantity' || field === 'unitPrice') {
          return { ...item, [field]: parsePositiveNumber(value) }
        }

        return { ...item, [field]: value }
      }),
    )
  }

  const addItem = () => {
    setItems((prevItems) => {
      const existingEmptyIndex = prevItems.findIndex(
        (item, index) =>
          !confirmedItems[index] &&
          !String(item?.productId ?? '').trim(),
      )

      if (existingEmptyIndex >= 0) {
        setActiveItemIndex(existingEmptyIndex)
        return prevItems
      }

      const nextItems = [...prevItems, createEmptyItem()]
      setActiveItemIndex(nextItems.length - 1)
      return nextItems
    })
  }

  const removeItem = (index) => {
    setItems((prevItems) => {
      if (prevItems.length === 1) return prevItems

      const nextItems = prevItems.filter((_, itemIndex) => itemIndex !== index)

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

      return nextItems
    })
  }

  const isItemConfirmed = (index) => Boolean(confirmedItems[index])

  const confirmItem = (index) => {
    const targetItem = items[index]
    if (!targetItem?.productId) return

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
      const nextItems = [...prevItems, createEmptyItem()]
      setActiveItemIndex(nextItems.length - 1)
      return nextItems
    })
  }

  const unlockItem = (index) => {
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
      const safeItems = Array.isArray(prevItems) ? prevItems : [createEmptyItem()]
      const activeIndexIsValid =
        activeItemIndex >= 0 &&
        activeItemIndex < safeItems.length &&
        confirmedItems[activeItemIndex] !== true

      const firstEmptyUnconfirmed = safeItems.findIndex(
        (item, index) => !confirmedItems[index] && !String(item?.productId ?? '').trim(),
      )
      const firstEditable = safeItems.findIndex((_, index) => !confirmedItems[index])

      const indexToUse = activeIndexIsValid
        ? activeItemIndex
        : firstEmptyUnconfirmed >= 0
          ? firstEmptyUnconfirmed
          : firstEditable >= 0
            ? firstEditable
            : Math.max(safeItems.length - 1, 0)
      selectedIndex = indexToUse

      const selectedProduct = productById[safeProductId]
      const nextUnitPrice = parsePositiveNumber(selectedProduct?.salePrice)

      const nextItems = safeItems.map((item, index) =>
        index === indexToUse
          ? {
              ...item,
              productId: safeProductId,
              unitPrice: nextUnitPrice,
            }
          : item,
      )

      return nextItems
    })

    if (selectedIndex >= 0) {
      setActiveItemIndex(selectedIndex)
    }

    onProductUsed?.(safeProductId)
    setProductSearch('')
    setHighlightedSuggestionIndex(0)
  }

  const handleQuickClientInput = (field, value) => {
    setQuickClientForm((prev) => ({ ...prev, [field]: value }))
    if (quickClientError) setQuickClientError('')
  }

  const selectClientFromSearch = (selectedClientId) => {
    const safeClientId = String(selectedClientId ?? '').trim()
    const selectedClient = clientsById[safeClientId]

    setClientId(safeClientId)
    setClientSearch(String(selectedClient?.name ?? ''))
    setHighlightedClientSuggestionIndex(0)
    setIsClientSearchFocused(false)
  }

  const handleQuickCreateClient = async () => {
    const normalizedName = String(quickClientForm.name ?? '').trim()
    if (!normalizedName) {
      setQuickClientError('Ingresá un nombre para crear el cliente.')
      return
    }

    try {
      const created = await Promise.resolve(
        onCreateClient?.({
          name: normalizedName,
          phone: String(quickClientForm.phone ?? '').trim(),
          address: String(quickClientForm.address ?? '').trim(),
          notes: String(quickClientForm.notes ?? '').trim(),
        }),
      )

      if (created?.id) {
        setClientId(created.id)
        setQuickClientForm(createInitialQuickClientForm())
        setQuickClientError('')
        setIsQuickCreateClientOpen(false)
        return
      }

      setQuickClientError('No se pudo crear el cliente. Intentá nuevamente.')
    } catch {
      setQuickClientError('Ocurrió un error al crear el cliente.')
    }
  }

  const handleCancelClick = () => {
    if (isDirty) {
      setShowCancelConfirm(true)
    } else {
      onCancel?.()
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (saving) return

    setSubmitAttempted(true)
    setSaveError('')

    const sanitizedItems = items
      .filter((item) => item.productId)
      .map((item) => ({
        productId: item.productId,
        productName: String(productById[item.productId]?.name ?? ''),
        quantity: parsePositiveNumber(item.quantity),
        unitPrice: parsePositiveNumber(item.unitPrice),
        isClientMaterial: Boolean(item.isClientMaterial),
      }))

    const selectedClient = safeClients.find((client) => client.id === clientId) || null
    const normalizedSampleClientName = String(sampleClientName ?? '').trim()
    const normalizedSampleClientPhone = String(sampleClientPhone ?? '').trim()

    const hasClientError = !isSample && !selectedClient
    const hasSampleNameError = isSample && !normalizedSampleClientName
    const hasItemsError = sanitizedItems.length === 0

    if (hasClientError || hasSampleNameError || !deliveryDate || hasItemsError) {
      if (hasClientError || hasSampleNameError) {
        const errorInput = hasSampleNameError
          ? sampleClientNameInputRef.current
          : clientSelectRef.current
        errorInput?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        errorInput?.focus()
      } else if (hasItemsError) {
        itemsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        itemProductRefs.current[0]?.focus()
      }
      return
    }

    const payload = {
      id: orderId,
      clientId: isSample ? '' : selectedClient?.id ?? '',
      clientName: isSample ? normalizedSampleClientName : selectedClient?.name ?? '',
      status,
      productionDate: new Date(`${productionDate}T00:00:00`).toISOString(),
      deliveredVia: '',
      deliveredBy: '',
      trackingNumber: '',
      deliveryDetails: isSample && normalizedSampleClientPhone
        ? `Contacto muestra: ${normalizedSampleClientPhone}`
        : '',
      shippingCost: 0,
      isArchived: false,
      archivedAt: null,
      deliveryDate,
      financialNote: String(financialNote ?? '').trim(),
      total: isSample ? 0 : total,
      discount: normalizedDiscount,
      items: sanitizedItems,
      isSample,
      createdAt: new Date(`${createdAt}T00:00:00`).toISOString(),
    }

    try {
      setSaving(true)
      await Promise.resolve(onCreate?.(payload))

      shouldSkipDraftPersistRef.current = true
      clearOrderDraftNow()
      resetForm()
      onSuccess?.('Pedido guardado correctamente')
      onCancel?.()
      setSubmitAttempted(false)
      setShowCancelConfirm(false)
    } catch (error) {
      console.error(error)
      setSaveError('No se pudo guardar el pedido. Reintentá en unos segundos.')
    } finally {
      setSaving(false)
    }
  }

  const clientError = submitAttempted && !isSample && !clientId
  const sampleNameError = submitAttempted && isSample && !String(sampleClientName ?? '').trim()
  const itemsError = submitAttempted && items.filter((item) => item.productId).length === 0

  return (
    <section className={isModal ? undefined : 'card-block'}>
      {!isModal && (
        <div className="card-head">
          <h3>Nuevo pedido</h3>
          <span className="muted-label">{formatOrderId(orderId)}</span>
        </div>
      )}

      <form id={formId} className="order-form" onSubmit={handleSubmit}>
        <label>
          <input
            type="checkbox"
            checked={isSample}
            onChange={(e) => {
              const nextIsSample = e.target.checked
              setIsSample(nextIsSample)
              setStatus(nextIsSample ? sampleOrderStatuses[0] : orderStatuses[0])
            }}
          />{' '}
          Es muestra (no facturable)
        </label>

        {isSample ? (
          <>
            <label>
              Nombre (muestra)
              <input
                ref={sampleClientNameInputRef}
                type="text"
                value={sampleClientName}
                onChange={(event) => setSampleClientName(event.target.value)}
                placeholder="Nombre libre"
                required
                style={sampleNameError ? { border: '1px solid #c62828' } : undefined}
              />
            </label>

            <label>
              Teléfono (opcional)
              <input
                type="text"
                value={sampleClientPhone}
                onChange={(event) => setSampleClientPhone(event.target.value)}
                placeholder="Teléfono"
              />
            </label>
          </>
        ) : (
          <label>
            Cliente
            <input
              ref={clientSearchInputRef}
              type="text"
              value={clientSearch}
              onChange={(event) => {
                setClientSearch(event.target.value)
                setHighlightedClientSuggestionIndex(0)
              }}
              onFocus={() => setIsClientSearchFocused(true)}
              onBlur={() => {
                window.setTimeout(() => setIsClientSearchFocused(false), 120)
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  if (autocompleteClients.length === 0) return
                  event.preventDefault()
                  setHighlightedClientSuggestionIndex((prev) => Math.min(prev + 1, autocompleteClients.length - 1))
                  return
                }

                if (event.key === 'ArrowUp') {
                  if (autocompleteClients.length === 0) return
                  event.preventDefault()
                  setHighlightedClientSuggestionIndex((prev) => Math.max(prev - 1, 0))
                  return
                }

                if (event.key !== 'Enter') return

                const activeClient = autocompleteClients[highlightedClientSuggestionIndex] ?? autocompleteClients[0]
                if (!activeClient?.id) return
                event.preventDefault()
                selectClientFromSearch(activeClient.id)
              }}
              placeholder="Buscar cliente por nombre, teléfono o dirección"
            />
            {shouldShowClientSuggestions && (
              <div className="orders-autocomplete-list" role="listbox" aria-label="Sugerencias de clientes">
                {autocompleteClients.map((client, index) => (
                  <button
                    key={`client-suggestion-${client.id}`}
                    type="button"
                    className={`orders-autocomplete-item ${index === highlightedClientSuggestionIndex ? 'orders-autocomplete-item-active' : ''}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setHighlightedClientSuggestionIndex(index)}
                    onClick={() => selectClientFromSearch(client.id)}
                  >
                    {client.name}
                  </button>
                ))}
              </div>
            )}
            <div className="inline-field-row">
              <select
                ref={clientSelectRef}
                value={clientId}
                onChange={(event) => selectClientFromSearch(event.target.value)}
                required
                style={clientError ? { border: '1px solid #c62828' } : undefined}
              >
                <option value="">Seleccionar cliente</option>
                {sortedClients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => {
                  setClientId('')
                  setClientSearch('')
                  setHighlightedClientSuggestionIndex(0)
                  clientSearchInputRef.current?.focus()
                }}
              >
                Limpiar
              </button>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => {
                  setIsQuickCreateClientOpen((prev) => !prev)
                  setQuickClientError('')
                  if (isQuickCreateClientOpen) {
                    setQuickClientForm(createInitialQuickClientForm())
                  }
                }}
              >
                {isQuickCreateClientOpen ? 'Cerrar' : '+ Nuevo cliente'}
              </button>
            </div>
            {isQuickCreateClientOpen && (
              <>
                <input
                  type="text"
                  value={quickClientForm.name}
                  onChange={(event) => handleQuickClientInput('name', event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return
                    event.preventDefault()
                    void handleQuickCreateClient()
                  }}
                  placeholder="Nombre del nuevo cliente"
                />
                <input
                  type="text"
                  value={quickClientForm.phone}
                  onChange={(event) => handleQuickClientInput('phone', event.target.value)}
                  placeholder="Teléfono"
                />
                <input
                  type="text"
                  value={quickClientForm.address}
                  onChange={(event) => handleQuickClientInput('address', event.target.value)}
                  placeholder="Dirección"
                />
                <input
                  type="text"
                  value={quickClientForm.notes}
                  onChange={(event) => handleQuickClientInput('notes', event.target.value)}
                  placeholder="Notas"
                />
                <button type="button" className="primary-btn" onClick={handleQuickCreateClient}>
                  Crear cliente
                </button>
              </>
            )}
            {quickClientError && <p className="payment-error">{quickClientError}</p>}
            {safeClients.length > 0 && String(clientSearch ?? '').trim() && filteredClients.length === 0 && (
              <p className="payment-helper">Sin resultados para esa búsqueda.</p>
            )}
            {safeClients.length === 0 && (
              <p className="payment-error">No hay clientes cargados. Creá uno para continuar.</p>
            )}
          </label>
        )}

        <label>
          Estado
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            {availableStatuses.map((orderStatus) => (
              <option key={orderStatus} value={orderStatus}>
                {orderStatus}
              </option>
            ))}
          </select>
        </label>

        <label>
          Fecha (creación)
          <input
            type="date"
            value={createdAt}
            onChange={(event) => setCreatedAt(event.target.value)}
          />
        </label>

        <label>
          Fecha producción
          <input
            type="date"
            value={productionDate}
            onChange={(event) => setProductionDate(event.target.value)}
          />
        </label>

        <label>
          Fecha de entrega
          <input
            type="date"
            value={deliveryDate}
            onChange={(event) => setDeliveryDate(event.target.value)}
            required
          />
        </label>

        <div
          ref={itemsSectionRef}
          className="items-head"
          style={itemsError ? { border: '1px solid #c62828', borderRadius: '8px', padding: '0.45rem' } : undefined}
        >
          <h4>Productos del pedido</h4>
          <button type="button" className="secondary-btn" onClick={addItem}>
            + Agregar ítem
          </button>
        </div>
        {itemsError && (
          <p className="payment-error">Agregá al menos un producto para continuar.</p>
        )}

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
              <div className="orders-autocomplete-list" role="listbox" aria-label="Sugerencias de productos">
                {autocompleteProducts.map((product, index) => (
                  <button
                    key={`suggestion-${product.id}`}
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

          {!isSample && clientId && (
            <div className="orders-most-used-wrap">
              <p className="orders-most-used-title">Sugerencias para este cliente</p>
              <div className="orders-most-used-list">
                {suggestedProductsForClient.length > 0 ? (
                  suggestedProductsForClient.map((product) => (
                    <button
                      key={`client-suggestion-${product.id}`}
                      type="button"
                      className="quick-fill-btn"
                      onClick={() => quickSelectProduct(product.id)}
                    >
                      {product.name} ({Number(product?.suggestedCount) || 0})
                    </button>
                  ))
                ) : (
                  <span className="muted-label">Sin historial suficiente para sugerencias.</span>
                )}
              </div>
            </div>
          )}

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
            <div
              key={`item-${index}`}
              className={`item-row ${
                !isItemConfirmed(index) &&
                !String(item?.productId ?? '').trim() &&
                index === items.length - 1 &&
                items.some((candidate, candidateIndex) =>
                  candidateIndex !== index && String(candidate?.productId ?? '').trim(),
                )
                  ? 'item-row-optional'
                  : ''
              }`}
            >
              {(() => {
                const itemIsConfirmed = isItemConfirmed(index)
                const selectedProduct = productById[item.productId]
                const itemOptions = item.productId && selectedProduct
                  ? [selectedProduct, ...filteredProducts.filter((product) => product.id !== item.productId)]
                  : filteredProducts
                const isOptionalEmptyRow =
                  !itemIsConfirmed &&
                  !String(item?.productId ?? '').trim() &&
                  index === items.length - 1 &&
                  items.some((candidate, candidateIndex) =>
                    candidateIndex !== index && String(candidate?.productId ?? '').trim(),
                  )

                return (
                  <>
              <select
                ref={(element) => {
                  itemProductRefs.current[index] = element
                }}
                value={item.productId}
                onChange={(event) =>
                  handleItemChange(index, 'productId', event.target.value)
                }
                onFocus={() => setActiveItemIndex(index)}
                disabled={itemIsConfirmed}
              >
                <option value="">Seleccionar producto</option>
                {itemOptions.map((product) => (
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
                disabled={itemIsConfirmed}
              />
              <input
                type="number"
                min="0"
                value={item.unitPrice}
                onChange={(event) =>
                  handleItemChange(index, 'unitPrice', event.target.value)
                }
                onFocus={() => setActiveItemIndex(index)}
                placeholder="Precio unitario"
                disabled={itemIsConfirmed}
              />
              <button
                type="button"
                className="danger-ghost-btn"
                onClick={() => removeItem(index)}
              >
                Quitar
              </button>

              {!itemIsConfirmed ? (
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => confirmItem(index)}
                  disabled={!item.productId}
                >
                  Confirmar
                </button>
              ) : (
                <button
                  type="button"
                  className="quick-fill-btn"
                  onClick={() => unlockItem(index)}
                >
                  Editar
                </button>
              )}

              {itemIsConfirmed && <span className="order-item-confirmed-badge">Confirmado</span>}

              <label className="item-material-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(item.isClientMaterial)}
                  onChange={(event) =>
                    handleItemChange(index, 'isClientMaterial', event.target.checked)
                  }
                  disabled={itemIsConfirmed}
                />
                Material provisto por el cliente
              </label>

              {item.productId && (() => {
                if (item.isClientMaterial) return null

                const stockData = safeStockByProductId[item.productId]
                const currentAvailable = Number(stockData?.stockDisponible ?? 0)
                const lineQuantity = parsePositiveNumber(item.quantity)
                const reservedInDraft = draftReservedByProductId[item.productId] ?? 0
                const availableForLine = currentAvailable + lineQuantity - reservedInDraft
                const exceedsStock = lineQuantity > availableForLine

                if (!exceedsStock) return null

                const safeAvailable = Math.max(availableForLine, 0)
                const shortageUnits = Math.max(lineQuantity - safeAvailable, 0)

                return (
                  <p className="payment-error">
                    No hay stock suficiente para este pedido.<br />
                    Stock disponible: {safeAvailable}<br />
                    Pedido solicitado: {lineQuantity}<br />
                    Faltante estimado: {shortageUnits}
                  </p>
                )
              })()}

              {!item.productId && filteredProducts.length === 0 && (
                <p className="payment-helper">No hay productos para ese filtro. Probá con categoría TODOS.</p>
              )}

              {isOptionalEmptyRow && (
                <p className="item-row-optional-note">Fila opcional para seguir cargando más productos.</p>
              )}
                  </>
                )
              })()}
            </div>
          ))}
        </div>

        <label>
          Descuento total del pedido
          <input
            type="number"
            min="0"
            value={discount}
            onChange={(event) => setDiscount(event.target.value)}
            placeholder="Descuento"
          />
        </label>

        <label>
          Observación financiera
          <textarea
            value={financialNote}
            onChange={(event) => setFinancialNote(event.target.value)}
            placeholder="Observación financiera (opcional)"
          />
        </label>

        <div className="totals-box">
          <p>
            <span>Subtotal</span>
            <strong>{formatCurrency(subtotal)}</strong>
          </p>
          <p>
            <span>Descuento</span>
            <strong>- {formatCurrency(normalizedDiscount)}</strong>
          </p>
          <p className="total-line">
            <span>Total pedido</span>
            <strong>{formatCurrency(total)}</strong>
          </p>
        </div>

        {showCancelConfirm && (
          <div className="order-form-cancel-confirm">
            <p>Tenés cambios sin guardar. ¿Querés salir igual?</p>
            <div className="order-form-cancel-confirm-actions">
              <button
                type="button"
                className="danger-ghost-btn"
                onClick={() => { clearOrderDraftNow(); onCancel?.() }}
              >
                ✔ Salir
              </button>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setShowCancelConfirm(false)}
              >
                ✖ Volver
              </button>
            </div>
          </div>
        )}

        {saveError && <p className="payment-error">{saveError}</p>}

        <div className="order-form-actions">
          {onCancel && (
            <button type="button" className="secondary-btn" onClick={handleCancelClick}>
              ✖ Cancelar
            </button>
          )}
          <button type="submit" className="primary-btn" disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar pedido'}
          </button>
        </div>
      </form>
      {dialogNode}
    </section>
  )
}

export default OrdersForm
