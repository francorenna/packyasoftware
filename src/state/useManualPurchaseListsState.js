import { useEffect, useState } from 'react'

const MANUAL_PURCHASE_LISTS_STORAGE_KEY = 'packya_manual_purchase_lists'
const allowedStatuses = ['Pendiente', 'Convertida', 'Cancelada']

const toPositiveNumber = (value) => {
  const parsed = Number(value)
  if (Number.isNaN(parsed) || parsed < 0) return 0
  return parsed
}

const normalizeItem = (item) => {
  if (!item || typeof item !== 'object') return null

  const productName = String(item.productName ?? '').trim()
  const quantity = Math.max(Number(item.quantity || 0), 0)
  const referenceCost = toPositiveNumber(item.referenceCost)
  const lineTotal = Math.max(
    Number(item.lineTotal ?? quantity * referenceCost) || 0,
    0,
  )

  if (!productName && !String(item.productId ?? '').trim()) return null
  if (quantity <= 0) return null

  return {
    productId: String(item.productId ?? '').trim(),
    productName,
    quantity,
    referenceCost,
    lineTotal,
  }
}

const normalizeList = (list, index) => {
  if (!list || typeof list !== 'object') return null

  const items = Array.isArray(list.items) ? list.items.map(normalizeItem).filter(Boolean) : []
  if (items.length === 0) return null

  const status = allowedStatuses.includes(list.status) ? list.status : 'Pendiente'
  const estimatedTotal = items.reduce((acc, item) => acc + toPositiveNumber(item.lineTotal), 0)

  return {
    id: String(list.id ?? `MPL-${String(index + 1).padStart(3, '0')}`),
    supplierId: String(list.supplierId ?? '').trim(),
    supplierName: String(list.supplierName ?? '').trim() || 'Proveedor sin definir',
    createdAt: String(list.createdAt ?? new Date().toISOString()),
    status,
    items,
    estimatedTotal,
  }
}

const loadManualPurchaseLists = () => {
  const stored = localStorage.getItem(MANUAL_PURCHASE_LISTS_STORAGE_KEY)

  if (stored === null) {
    try {
      localStorage.setItem(MANUAL_PURCHASE_LISTS_STORAGE_KEY, JSON.stringify([]))
    } catch (error) {
      void error
    }
    return []
  }

  try {
    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []

    return parsed
      .map((list, index) => normalizeList(list, index))
      .filter(Boolean)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  } catch {
    return []
  }
}

function useManualPurchaseListsState(onCreatePurchaseFromList) {
  const [manualPurchaseLists, setManualPurchaseLists] = useState(() => loadManualPurchaseLists())

  useEffect(() => {
    try {
      localStorage.setItem(MANUAL_PURCHASE_LISTS_STORAGE_KEY, JSON.stringify(manualPurchaseLists))
    } catch (error) {
      void error
    }
  }, [manualPurchaseLists])

  const createList = (listData) => {
    const normalized = normalizeList(
      {
        ...listData,
        id: String(listData?.id ?? `MPL-${Date.now()}`),
        createdAt: String(listData?.createdAt ?? new Date().toISOString()),
        status: 'Pendiente',
      },
      manualPurchaseLists.length,
    )

    if (!normalized) return null

    setManualPurchaseLists((prevLists) => [normalized, ...prevLists])
    return normalized
  }

  const updateList = (listId, updates) => {
    const safeListId = String(listId ?? '').trim()
    if (!safeListId) return null

    let saved = null

    setManualPurchaseLists((prevLists) =>
      prevLists.map((list, index) => {
        if (String(list.id) !== safeListId) return list

        const normalized = normalizeList(
          {
            ...list,
            ...(updates && typeof updates === 'object' ? updates : {}),
            id: list.id,
            createdAt: list.createdAt,
          },
          index,
        )

        if (!normalized) return list
        saved = normalized
        return normalized
      }),
    )

    return saved
  }

  const deleteList = (listId) => {
    const safeListId = String(listId ?? '').trim()
    if (!safeListId) return

    setManualPurchaseLists((prevLists) => prevLists.filter((list) => String(list.id) !== safeListId))
  }

  const duplicateList = (listId) => {
    const source = manualPurchaseLists.find((list) => String(list.id) === String(listId))
    if (!source) return null

    const duplicated = normalizeList(
      {
        ...source,
        id: `MPL-${Date.now()}`,
        createdAt: new Date().toISOString(),
        status: 'Pendiente',
        items: source.items.map((item) => ({ ...item })),
      },
      manualPurchaseLists.length,
    )

    if (!duplicated) return null

    setManualPurchaseLists((prevLists) => [duplicated, ...prevLists])
    return duplicated
  }

  const convertToPurchase = (listId) => {
    const source = manualPurchaseLists.find((list) => String(list.id) === String(listId))
    if (!source || source.status !== 'Pendiente') {
      return { success: false, error: 'La lista no se puede convertir.' }
    }

    if (!source.supplierId || !source.supplierName) {
      return { success: false, error: 'Seleccioná un proveedor antes de convertir.' }
    }

    const purchaseItems = source.items
      .filter((item) => String(item.productId ?? '').trim() && Number(item.quantity || 0) > 0)
      .map((item) => ({
        productId: String(item.productId),
        productName: String(item.productName ?? '').trim(),
        quantity: Math.max(Number(item.quantity || 0), 0),
        unitCost: toPositiveNumber(item.referenceCost),
      }))

    if (purchaseItems.length === 0) {
      return {
        success: false,
        error: 'La lista debe tener al menos un ítem con producto seleccionado para convertir.',
      }
    }

    const createPurchaseHandler =
      typeof onCreatePurchaseFromList === 'function' ? onCreatePurchaseFromList : null

    if (!createPurchaseHandler) {
      return { success: false, error: 'No hay conversión de compra disponible.' }
    }

    const createdPurchase = createPurchaseHandler({
      supplierId: source.supplierId,
      supplierName: source.supplierName,
      items: purchaseItems,
      totalAmount: purchaseItems.reduce(
        (acc, item) => acc + Number(item.quantity || 0) * Number(item.unitCost || 0),
        0,
      ),
      paymentMethod: 'Transferencia',
      createdAt: new Date().toISOString(),
    })

    if (!createdPurchase) {
      return { success: false, error: 'No se pudo crear la compra real.' }
    }

    updateList(source.id, { status: 'Convertida' })
    return { success: true, purchase: createdPurchase }
  }

  return {
    manualPurchaseLists,
    createList,
    updateList,
    deleteList,
    duplicateList,
    convertToPurchase,
  }
}

export default useManualPurchaseListsState