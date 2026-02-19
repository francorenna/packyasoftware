import { useEffect, useState } from 'react'

const PRODUCTS_STORAGE_KEY = 'packya_products'
const STORAGE_VERSION_KEY = 'packya_storage_version'
const STORAGE_VERSION = 2
const allowedMovementTypes = ['Ajuste', 'Compra', 'Devolución', 'Venta', 'Muestra']

const initialProducts = [
  {
    id: 'PRD-001',
    name: 'Caja 30x20',
    stockTotal: 120,
    stockMinimo: 40,
    stockMovements: [],
  },
  {
    id: 'PRD-002',
    name: 'Caja 40x30',
    stockTotal: 80,
    stockMinimo: 30,
    stockMovements: [],
  },
  {
    id: 'PRD-003',
    name: 'Caja reforzada 50x40',
    stockTotal: 90,
    stockMinimo: 25,
    stockMovements: [],
  },
  {
    id: 'PRD-004',
    name: 'Separadores internos',
    stockTotal: 50,
    stockMinimo: 20,
    stockMovements: [],
  },
]

const toPositiveInteger = (value) => {
  const parsed = Number(value)
  if (Number.isNaN(parsed) || parsed < 0) return 0
  return Math.floor(parsed)
}

const toInteger = (value) => {
  const parsed = Number(value)
  if (Number.isNaN(parsed)) return 0
  return Math.trunc(parsed)
}

const toPositiveNumber = (value) => {
  const parsed = Number(value)
  return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed
}

const calculateStockTotalFromMovements = (movements) =>
  (Array.isArray(movements) ? movements : []).reduce(
    (acc, movement) => acc + toInteger(movement?.amount),
    0,
  )

const normalizeMovement = (movement, productId, index) => {
  if (!movement || typeof movement !== 'object') return null

  const type = allowedMovementTypes.includes(movement.type)
    ? movement.type
    : 'Ajuste'

  return {
    id: String(movement.id ?? `MOV-${productId}-${index + 1}`),
    type,
    amount: toInteger(movement.amount),
    reason: String(movement.reason ?? '').trim(),
    date: String(movement.date ?? new Date().toISOString()),
  }
}

const normalizeProduct = (product, index) => {
  if (!product || typeof product !== 'object') return null

  const productId = String(product.id ?? `PRD-${String(index + 1).padStart(3, '0')}`)
  const normalizedMovements = Array.isArray(product.stockMovements)
    ? product.stockMovements
        .map((movement, movementIndex) =>
          normalizeMovement(movement, productId, movementIndex),
        )
        .filter(Boolean)
    : []

  const legacyStockTotal = toInteger(product.stockTotal)
  const stockMovements =
    normalizedMovements.length === 0 && legacyStockTotal !== 0
      ? [
          {
            id: `MOV-${productId}-initial`,
            type: 'Ajuste',
            amount: legacyStockTotal,
            reason: 'Ajuste inicial',
            date: String(product.createdAt ?? new Date().toISOString()),
          },
        ]
      : normalizedMovements

  const stockTotal = calculateStockTotalFromMovements(stockMovements)

  return {
    id: productId,
    name: String(product.name ?? '').trim(),
    stockTotal,
    stockMinimo: toPositiveInteger(product.stockMinimo),
    referenceCost: toPositiveNumber(product.referenceCost ?? product.lastUnitCost),
    stockMovements,
  }
}

const loadProductsFromStorage = () => {
  const storedProducts = localStorage.getItem(PRODUCTS_STORAGE_KEY)

  if (storedProducts === null) {
    const alreadySeeded = localStorage.getItem(STORAGE_VERSION_KEY)
    if (!alreadySeeded) {
      const normalizedInitialProducts = initialProducts
        .map((product, index) => normalizeProduct(product, index))
        .filter(Boolean)

      try {
        localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(normalizedInitialProducts))
      } catch (error) {
        void error
      }
      return normalizedInitialProducts
    }

    try {
      localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify([]))
    } catch (error) {
      void error
    }
    return []
  }

  try {
    const parsedProducts = JSON.parse(storedProducts)
    if (!Array.isArray(parsedProducts)) return []

    const normalizedProducts = parsedProducts
      .map((product, index) => normalizeProduct(product, index))
      .filter((product) => product && product.name)

    return normalizedProducts
  } catch {
    return []
  }
}

function useProductsState() {
  const [products, setProducts] = useState(() => loadProductsFromStorage())

  const withRecalculatedStock = (product) => ({
    ...product,
    stockTotal: calculateStockTotalFromMovements(product?.stockMovements),
  })

  const appendMovement = (product, movementData) => {
    const type = allowedMovementTypes.includes(movementData.type)
      ? movementData.type
      : 'Ajuste'

    const newMovement = {
      id: `MOV-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      amount: toInteger(movementData.amount),
      reason: String(movementData.reason ?? '').trim(),
      date: String(movementData.date ?? new Date().toISOString()),
    }

    return {
      ...product,
      stockMovements: [...(Array.isArray(product.stockMovements) ? product.stockMovements : []), newMovement],
    }
  }

  useEffect(() => {
    try {
      localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(products))
      try {
        localStorage.setItem('packya_storage_version', String(STORAGE_VERSION))
      } catch (error) {
        void error
      }
    } catch (error) {
      void error
    }
  }, [products])

  const upsertProduct = (productData) => {
    const normalizedName = String(productData.name ?? '').trim()
    if (!normalizedName) return

    const incomingId = String(productData.id ?? '')
    const normalizedProductBase = {
      id: incomingId || `PRD-${Date.now()}`,
      name: normalizedName,
      stockMinimo: toPositiveInteger(productData.stockMinimo),
      referenceCost: toPositiveNumber(productData.referenceCost),
    }

    setProducts((prevProducts) => {
      const existingProduct = prevProducts.find(
        (product) => product.id === normalizedProductBase.id,
      )

      const normalizedProduct = {
        ...normalizedProductBase,
        stockTotal: existingProduct?.stockTotal ?? 0,
        referenceCost: existingProduct?.referenceCost ?? normalizedProductBase.referenceCost ?? 0,
        stockMovements: existingProduct?.stockMovements ?? [],
      }

      const withComputedStock = withRecalculatedStock(normalizedProduct)

      if (!existingProduct) return [withComputedStock, ...prevProducts]

      return prevProducts.map((product) =>
        product.id === withComputedStock.id ? withComputedStock : product,
      )
    })
  }

  const adjustProductStock = (productId, amount, reason, type = 'Ajuste', date = undefined) => {
    const normalizedAmount = toInteger(amount)
    const normalizedReason = String(reason ?? '').trim()
    if (!productId || normalizedAmount === 0 || !normalizedReason) return

    setProducts((prevProducts) =>
      prevProducts.map((product) => {
        if (product.id !== productId) return product

        const nextProduct = appendMovement({
          ...product,
        }, {
          type,
          amount: normalizedAmount,
          reason: normalizedReason,
          date,
        })

        return withRecalculatedStock(nextProduct)
      }),
    )
  }

  const updateStock = (productId, quantity, movementType, reason = '', date = undefined) => {
    if (!productId) return
    const typeKey = String(movementType ?? '').toLowerCase()

    // Map incoming type to internal movement type and signed amount
    let type = 'Ajuste'
    let amount = Number(quantity) || 0

    switch (typeKey) {
      case 'compra':
        type = 'Compra'
        amount = Math.abs(amount)
        break
      case 'venta':
        type = 'Venta'
        amount = -Math.abs(amount)
        break
      case 'muestra':
        type = 'Muestra'
        amount = -Math.abs(amount)
        break
      case 'ajuste':
        type = 'Ajuste'
        // amount may be positive or negative
        break
      default:
        type = String(movementType ?? 'Ajuste')
    }

    const reasonText = reason || `Movimiento ${type}`
    adjustProductStock(productId, amount, reasonText, type, date)
  }

  const registerOrderReturn = (order) => {
    const safeItems = Array.isArray(order?.items) ? order.items : []

    setProducts((prevProducts) => {
      const productNameIndex = prevProducts.reduce((acc, row) => {
        acc[String(row.name).trim().toLowerCase()] = row.id
        return acc
      }, {})

      return prevProducts.map((product) => {

        const returnedQuantity = safeItems.reduce((acc, item) => {
          if (!item) return acc
          if (item.isClientMaterial) return acc

          const fallbackId = productNameIndex[
            String(item.productName ?? item.product ?? '').trim().toLowerCase()
          ]
          const itemProductId = item.productId || fallbackId
          if (itemProductId !== product.id) return acc

          return acc + toPositiveInteger(item.quantity)
        }, 0)

        if (returnedQuantity <= 0) return product

        const withStock = appendMovement({
          ...product,
        }, {
          type: 'Devolución',
          amount: returnedQuantity,
          reason: `Cancelación de pedido entregado ${order.id}`,
        })

        return withRecalculatedStock(withStock)
      })
    })
  }

  const updateProductReferenceCost = (productId, cost) => {
    const safeProductId = String(productId ?? '')
    if (!safeProductId) return

    const normalizedCost = toPositiveNumber(cost)

    setProducts((prevProducts) =>
      prevProducts.map((product) =>
        product.id === safeProductId
          ? {
              ...product,
              referenceCost: normalizedCost,
            }
          : product,
      ),
    )
  }

  return {
    products,
    upsertProduct,
    adjustProductStock,
    registerOrderReturn,
    updateStock,
    updateProductReferenceCost,
  }
}

export default useProductsState
