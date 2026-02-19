import { useEffect, useState } from 'react'

const PURCHASES_STORAGE_KEY = 'packya_purchases'
const STORAGE_VERSION_KEY = 'packya_storage_version'
const initialPurchases = []
const paymentMethods = ['Transferencia']

const toPositiveNumber = (value) => {
  const parsed = Number(value)
  if (Number.isNaN(parsed) || parsed < 0) return 0
  return parsed
}

const normalizeItem = (item) => {
  if (!item || typeof item !== 'object') return null

  // Backwards compatibility: if older structure used packages
  let quantity = Math.floor(toPositiveNumber(item.quantity))
  if (!quantity) {
    const packages = Number((item.packages || item.pack) ?? 0)
    const packSize = Number(item.packSize || item.packageSize || 0)
    if (packages > 0 && packSize > 0) {
      quantity = Math.floor(packages * packSize)
    }
  }

  const discountFixed = toPositiveNumber((item.discountFixed ?? item.discount) || 0)
  const discountPercent = toPositiveNumber(item.discountPercent ?? 0)
  const unitCost = toPositiveNumber(item.unitCost)

  // Determine applied discount: fixed preferred
  const appliedDiscount = discountFixed > 0 ? discountFixed : Math.round((discountPercent / 100) * quantity * unitCost)

  return {
    productId: String(item.productId ?? ''),
    productName: String(item.productName ?? '').trim(),
    quantity: Math.max(Math.floor(quantity), 0),
    unitCost: unitCost,
    discountFixed,
    discountPercent,
    appliedDiscount,
    lineTotal: Math.max(Math.round(quantity * unitCost - appliedDiscount), 0),
  }
}

const normalizePurchase = (purchase, index) => {
  if (!purchase || typeof purchase !== 'object') return null

  const normalizedItems = Array.isArray(purchase.items)
    ? purchase.items.map(normalizeItem).filter((item) => item && item.productId)
    : []

  const derivedTotalAmount = normalizedItems.reduce((acc, item) => acc + (Number(item.lineTotal) || 0), 0)

  const safePaymentMethod = paymentMethods.includes(purchase.paymentMethod)
    ? purchase.paymentMethod
    : paymentMethods[0]

  return {
    id: String(purchase.id ?? `COM-${String(index + 1).padStart(3, '0')}`),
    supplierId: String(purchase.supplierId ?? ''),
    supplierName: String(purchase.supplierName ?? '').trim(),
    items: normalizedItems,
    totalAmount: toPositiveNumber(purchase.totalAmount || derivedTotalAmount),
    paymentMethod: safePaymentMethod,
    supplier: String(purchase.supplier ?? '').trim(),
    createdAt: String(purchase.createdAt ?? purchase.date ?? new Date().toISOString()),
  }
}

const loadPurchases = () => {
  const stored = localStorage.getItem(PURCHASES_STORAGE_KEY)

  if (stored === null) {
    const alreadySeeded = localStorage.getItem(STORAGE_VERSION_KEY)
    if (!alreadySeeded) {
      try {
        localStorage.setItem(PURCHASES_STORAGE_KEY, JSON.stringify(initialPurchases))
      } catch (error) {
        void error
      }
      return initialPurchases
    }

    try {
      localStorage.setItem(PURCHASES_STORAGE_KEY, JSON.stringify([]))
    } catch (error) {
      void error
    }
    return []
  }

  try {
    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []

    return parsed
      .map((purchase, index) => normalizePurchase(purchase, index))
      .filter(
        (purchase) =>
          purchase &&
          purchase.supplierId &&
          purchase.supplierName &&
          purchase.items.length > 0,
      )
  } catch {
    return []
  }
}

function usePurchasesState(onPurchaseStockEntry) {
  const [purchases, setPurchases] = useState(() => loadPurchases())

  useEffect(() => {
    try {
      localStorage.setItem(PURCHASES_STORAGE_KEY, JSON.stringify(purchases))
    } catch (error) {
      void error
    }
  }, [purchases])

  const createPurchase = (purchaseData) => {
    const items = Array.isArray(purchaseData.items)
      ? purchaseData.items.map(normalizeItem).filter((item) => item && item.productId)
      : []

    const totalAmount = items.reduce((acc, item) => acc + (Number(item.lineTotal) || 0), 0)

    const normalized = normalizePurchase(
      {
        ...purchaseData,
        items,
        totalAmount,
        paymentMethod: paymentMethods[0],
        id: `COM-${Date.now()}`,
        createdAt: String(purchaseData.createdAt ?? new Date().toISOString()),
      },
      purchases.length,
    )

    if (!normalized || !normalized.supplierId || !normalized.supplierName || normalized.items.length === 0) {
      return null
    }

    const stockEntryHandler =
      typeof onPurchaseStockEntry === 'function' ? onPurchaseStockEntry : null

    if (stockEntryHandler) {
      normalized.items.forEach((item) => {
        stockEntryHandler(
          item.productId,
          item.quantity,
          `Compra proveedor ${normalized.supplierName}`,
          normalized.createdAt,
        )
      })
    }

    setPurchases((prev) => [normalized, ...prev])
    return normalized
  }

  return {
    purchases,
    createPurchase,
  }
}

export default usePurchasesState
