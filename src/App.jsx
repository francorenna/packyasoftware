import { useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './layout/AppLayout'
import ArchivedOrdersPage from './pages/ArchivedOrdersPage'
import ClientsPage from './pages/ClientsPage'
import DashboardPage from './pages/DashboardPage'
import FinancePage from './pages/FinancePage'
import ManualPurchaseListsPage from './pages/ManualPurchaseListsPage'
import OrdersPage from './pages/OrdersPage'
import ProductsPage from './pages/ProductsPage'
import PurchasesPage from './pages/PurchasesPage'
import ReportsPage from './pages/ReportsPage'
import QuotesPage from './pages/QuotesPage'
import SettingsPage from './pages/SettingsPage'
import StockPage from './pages/StockPage'
import useClientsState from './state/useClientsState'
import useExpensesState from './state/useExpensesState'
import useManualPurchaseListsState from './state/useManualPurchaseListsState'
import useOrdersState from './state/useOrdersState'
import useProductsState from './state/useProductsState'
import usePurchasesState from './state/usePurchasesState'
import useQuotesState from './state/useQuotesState'
import useSuppliersState from './state/useSuppliersState'

function App() {
  const [isClosing, setIsClosing] = useState(false)
  const [closeMessage, setCloseMessage] = useState('🔄 Guardando datos...')
  const [saveStatus, setSaveStatus] = useState('saved')
  const [lastSavedAt, setLastSavedAt] = useState(() => new Date())
  const [saveToastVisible, setSaveToastVisible] = useState(false)
  const [saveToastToken, setSaveToastToken] = useState(0)

  const { suppliers, upsertSupplier, deleteSupplier } = useSuppliersState()
  const { clients, upsertClient, deleteClient } = useClientsState()
  const { expenses, addExpense, deleteExpense, getMonthlyExpenses } = useExpensesState()
  const { quotes, createQuote, updateQuoteStatus, updateQuote } = useQuotesState()
  const {
    orders,
    createOrder,
    registerPayment,
    updateOrderStatus,
    updateOrderDelivery,
    registerOrderFinancialAdjustment,
    appendOrderFinancialObservation,
    reopenOrder,
    updateOrderClient,
    updateOrderItems,
    updateOrderItemCompletion,
    updateOrderUrgency,
    convertSampleToRealOrder,
    deleteCancelledOrder,
  } = useOrdersState()
  const {
    products,
    upsertProduct,
    deleteProduct,
    adjustProductStock,
    registerOrderReturn,
    updateStock,
    updateProductReferenceCost,
    markProductAsUsed,
  } = useProductsState()
  const { purchases, createPurchase } = usePurchasesState(
    (productId, quantity, reason, date) => {
      updateStock(productId, quantity, 'compra', reason, date)
    },
  )
  const {
    manualPurchaseLists,
    createList,
    updateList,
    deleteList,
    duplicateList,
    convertToPurchase,
  } = useManualPurchaseListsState(handleCreatePurchase)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.localStorage) return undefined

    const storageProto = Object.getPrototypeOf(window.localStorage)
    if (!storageProto || typeof storageProto.setItem !== 'function') return undefined

    const originalSetItem = storageProto.setItem
    let isDisposed = false
    let savedTimeoutId = null

    storageProto.setItem = function patchedSetItem(key, value) {
      const isPackyaKey = typeof key === 'string' && key.startsWith('packya_')

      if (isPackyaKey) {
        setSaveStatus('saving')
      }

      try {
        const result = originalSetItem.call(this, key, value)

        if (isPackyaKey) {
          if (savedTimeoutId) {
            window.clearTimeout(savedTimeoutId)
          }

          savedTimeoutId = window.setTimeout(() => {
            if (isDisposed) return
            setSaveStatus('saved')
            setLastSavedAt(new Date())
          }, 380)
        }

        return result
      } catch (error) {
        if (isPackyaKey) {
          setSaveStatus('error')
        }

        throw error
      }
    }

    return () => {
      isDisposed = true
      if (savedTimeoutId) {
        window.clearTimeout(savedTimeoutId)
      }
      storageProto.setItem = originalSetItem
    }
  }, [])

  useEffect(() => {
    const desktopBridge = window?.packyaDesktop
    let unsubscribeCloseStatus = null

    if (desktopBridge?.onCloseStatus) {
      unsubscribeCloseStatus = desktopBridge.onCloseStatus((payload) => {
        setIsClosing(Boolean(payload?.isClosing))
        setCloseMessage(String(payload?.message ?? '🔄 Guardando datos...'))
      })
    }

    const handleBeforeUnload = () => {
      if (!desktopBridge?.platform) {
        setCloseMessage('🔄 Guardando datos...')
        setIsClosing(true)
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      if (typeof unsubscribeCloseStatus === 'function') unsubscribeCloseStatus()
    }
  }, [])

  useEffect(() => {
    if (!isClosing) return undefined

    const safetyTimeout = setTimeout(() => {
      setIsClosing(false)
    }, 3000)

    return () => clearTimeout(safetyTimeout)
  }, [isClosing])

  useEffect(() => {
    if (typeof document === 'undefined') return undefined

    const debugLog = (message) => {
      try {
        window?.packyaLogger?.log?.('debug', message)
      } catch {
        void 0
      }
    }

    const describeElement = (element) => {
      if (!(element instanceof HTMLElement)) return 'unknown'

      const tag = String(element.tagName ?? '').toLowerCase()
      const id = element.id ? `#${element.id}` : ''
      const className = String(element.className ?? '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .join('.')
      const classes = className ? `.${className}` : ''

      return `${tag}${id}${classes}`
    }

    const logIfDynamicBlockedField = (element, trigger) => {
      if (!(element instanceof HTMLElement)) return

      const isInputLike =
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement ||
        element instanceof HTMLSelectElement

      if (!isInputLike) return

      const isDisabled = Boolean(element.disabled)
      const isReadOnly =
        element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
          ? Boolean(element.readOnly)
          : false

      if (!isDisabled && !isReadOnly) return

      debugLog(
        `[focus-monitor] ${trigger}: campo potencialmente bloqueado ${describeElement(element)} ` +
          `(disabled=${isDisabled}, readOnly=${isReadOnly})`,
      )
    }

    const logIfActiveBody = (trigger, target) => {
      if (document.activeElement !== document.body) return
      debugLog(
        `[focus-monitor] ${trigger}: activeElement=body (target=${describeElement(target)})`,
      )
    }

    const handleFocusIn = (event) => {
      const target = event.target instanceof HTMLElement ? event.target : null
      logIfDynamicBlockedField(target, 'focusin')
      logIfActiveBody('focusin', target)
    }

    const handleFocusOut = (event) => {
      const target = event.target instanceof HTMLElement ? event.target : null
      logIfDynamicBlockedField(target, 'focusout')

      window.setTimeout(() => {
        logIfActiveBody('focusout', target)
      }, 0)
    }

    document.addEventListener('focusin', handleFocusIn)
    document.addEventListener('focusout', handleFocusOut)

    return () => {
      document.removeEventListener('focusin', handleFocusIn)
      document.removeEventListener('focusout', handleFocusOut)
    }
  }, [])

  const handleUpdateOrderStatus = (orderId, nextStatus) => {
    const targetOrder = orders.find((order) => order.id === orderId)
    if (!targetOrder) return

    const previousStatus = targetOrder.status
    updateOrderStatus(orderId, nextStatus)

    if (previousStatus !== 'Cancelado' && nextStatus === 'Cancelado') {
      registerOrderReturn(targetOrder)
    }
  }

  const showSaveToast = () => {
    setSaveToastToken((prev) => prev + 1)
    setSaveToastVisible(true)
  }

  function handleCreatePurchase(purchaseData) {
    const registeredPurchase = createPurchase(purchaseData)
    if (!registeredPurchase) return null

    const aggregatedByProduct = (Array.isArray(registeredPurchase.items) ? registeredPurchase.items : []).reduce(
      (acc, item) => {
        const productId = String(item?.productId ?? '')
        const quantity = Number(item?.quantity || 0)
        if (!productId || quantity <= 0) return acc

        const lineTotal = Number(item?.lineTotal)
        const fallbackLineTotal = quantity * Math.max(Number(item?.unitCost || 0), 0)
        const effectiveLineTotal = Number.isFinite(lineTotal) ? Math.max(lineTotal, 0) : fallbackLineTotal

        const row = acc[productId] ?? { totalAmount: 0, totalUnits: 0 }
        row.totalAmount += effectiveLineTotal
        row.totalUnits += quantity
        acc[productId] = row
        return acc
      },
      {},
    )

    Object.entries(aggregatedByProduct).forEach(([productId, totals]) => {
      const totalUnits = Number(totals?.totalUnits || 0)
      const totalAmount = Number(totals?.totalAmount || 0)
      if (totalUnits <= 0) return
      const unitCost = totalAmount / totalUnits
      updateProductReferenceCost(productId, unitCost)
    })

    showSaveToast()
    return registeredPurchase
  }

  const handleCreateOrder = (orderData) => {
    // create order in orders state
    createOrder(orderData)
    showSaveToast()

    if (orderData?.skipStockImpact) return

    // update stock: ventas o muestras
    const movementType = orderData.isSample ? 'muestra' : 'venta'
    const reasonBase = orderData.isSample ? `Muestra ${orderData.id}` : `Pedido ${orderData.id}`

    ;(Array.isArray(orderData.items) ? orderData.items : []).forEach((item) => {
      const qty = Number(item.quantity) || 0
      if (qty <= 0 || !item.productId) return
      if (item.isClientMaterial) return
      updateStock(item.productId, qty, movementType, `${reasonBase}`, orderData.createdAt)
    })
  }

  const handleAddExpense = (expenseData) => {
    const savedExpense = addExpense(expenseData)
    if (savedExpense) {
      showSaveToast()
    }
    return savedExpense
  }

  const handleCreateList = (listData) => {
    const createdList = createList(listData)
    if (createdList) {
      showSaveToast()
    }
    return createdList
  }

  const handleUpdateList = (listId, updates) => {
    const updatedList = updateList(listId, updates)
    if (updatedList) {
      showSaveToast()
    }
    return updatedList
  }

  const handleCreateQuote = (quoteData) => {
    const createdQuote = createQuote(quoteData)
    if (createdQuote) {
      showSaveToast()
    }
    return createdQuote
  }

  const handleUpdateQuote = (quoteId, quoteData) => {
    updateQuote(quoteId, quoteData)
    showSaveToast()
  }

  const handleCreateClient = (clientData) => upsertClient(clientData)

  const handleConvertQuoteToOrder = ({ quote, manualClientData } = {}) => {
    const safeQuote = quote && typeof quote === 'object' ? quote : null
    if (!safeQuote?.id) return null

    const sourceQuoteId = String(safeQuote.id)
    const existingOrder = orders.find((order) => String(order?.sourceQuoteId ?? '') === sourceQuoteId)
    if (existingOrder?.id) {
      updateQuoteStatus(sourceQuoteId, 'Aceptado')
      return { orderId: String(existingOrder.id), alreadyConverted: true }
    }

    let resolvedClientId = String(safeQuote.clientId ?? '').trim()
    let resolvedClientName = String(safeQuote.clientName ?? 'Sin cliente').trim() || 'Sin cliente'

    if (!resolvedClientId) {
      const safeManualClient = manualClientData && typeof manualClientData === 'object' ? manualClientData : {}
      const createdClient = upsertClient({
        name: String(safeManualClient.name ?? '').trim(),
        phone: String(safeManualClient.phone ?? '').trim(),
        address: String(safeManualClient.address ?? '').trim(),
      })

      if (!createdClient?.id) return null

      resolvedClientId = String(createdClient.id)
      resolvedClientName = String(createdClient.name ?? resolvedClientName).trim() || resolvedClientName
    }

    const safeItems = (Array.isArray(safeQuote.items) ? safeQuote.items : []).map((item) => ({
      productId: String(item?.productId ?? '').trim(),
      productName: String(item?.description ?? item?.productName ?? 'Sin descripción').trim() || 'Sin descripción',
      quantity: Math.max(Number(item?.quantity || 0), 0),
      unitPrice: Math.max(Number(item?.unitPrice || 0), 0),
      isClientMaterial: false,
    }))

    if (safeItems.length === 0) return null

    const orderId = `PED-${Date.now()}`
    handleCreateOrder({
      id: orderId,
      sourceQuoteId,
      clientId: resolvedClientId,
      clientName: resolvedClientName,
      client: resolvedClientName,
      status: 'Pendiente',
      createdAt: new Date().toISOString(),
      productionTime: String(safeQuote.productionLeadTime ?? '').trim(),
      deliveryType: String(safeQuote.deliveryType ?? 'Retiro en fábrica'),
      shippingCost: Number(safeQuote.shippingCost || 0),
      discount: 0,
      items: safeItems,
      total: Math.max(Number(safeQuote.total || 0), 0),
      isSample: false,
      skipStockImpact: true,
    })

    updateQuoteStatus(sourceQuoteId, 'Aceptado')
    return { orderId }
  }

  return (
    <HashRouter>
      <Routes>
        <Route
          element={
            <AppLayout
              isClosing={isClosing}
              closeMessage={closeMessage}
              saveStatus={saveStatus}
              lastSavedAt={lastSavedAt}
              saveToastVisible={saveToastVisible}
              saveToastToken={saveToastToken}
              onCloseSaveToast={() => setSaveToastVisible(false)}
            />
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/dashboard"
            element={
              <DashboardPage
                orders={orders}
                products={products}
                clients={clients}
                purchases={purchases}
                expenses={expenses}
              />
            }
          />
          <Route
            path="/finanzas"
            element={
              <FinancePage
                orders={orders}
                purchases={purchases}
                products={products}
                expenses={expenses}
                onAddExpense={handleAddExpense}
                onDeleteExpense={deleteExpense}
                getMonthlyExpenses={getMonthlyExpenses}
              />
            }
          />
          <Route
            path="/pedidos"
            element={
              <OrdersPage
                orders={orders}
                products={products}
                purchases={purchases}
                clients={clients}
                onCreateOrder={handleCreateOrder}
                onRegisterPayment={registerPayment}
                onUpdateOrderStatus={handleUpdateOrderStatus}
                onUpdateOrderDelivery={updateOrderDelivery}
                onUpdateOrderClient={updateOrderClient}
                onUpdateOrderItems={updateOrderItems}
                onUpdateOrderItemCompletion={updateOrderItemCompletion}
                onUpdateOrderUrgency={updateOrderUrgency}
                onDeleteCancelledOrder={deleteCancelledOrder}
                onCreateClient={handleCreateClient}
                onMarkProductAsUsed={markProductAsUsed}
              />
            }
          />
          <Route
            path="/presupuestos"
            element={
              <QuotesPage
                clients={clients}
                products={products}
                quotes={quotes}
                onCreateQuote={handleCreateQuote}
                onUpdateQuoteStatus={updateQuoteStatus}
                onUpdateQuote={handleUpdateQuote}
                onConvertQuoteToOrder={handleConvertQuoteToOrder}
              />
            }
          />
          <Route
            path="/archivados"
            element={
              <ArchivedOrdersPage
                orders={orders}
                onReopenOrder={reopenOrder}
                onCreateClient={upsertClient}
                onConvertSampleToRealOrder={convertSampleToRealOrder}
              />
            }
          />
          <Route
            path="/clientes"
            element={
              <ClientsPage
                clients={clients}
                orders={orders}
                onSaveClient={upsertClient}
                onDeleteClient={deleteClient}
                onRegisterPayment={registerPayment}
                onRegisterOrderAdjustment={registerOrderFinancialAdjustment}
                onAddOrderObservation={appendOrderFinancialObservation}
              />
            }
          />
          <Route
            path="/productos"
            element={
              <ProductsPage
                products={products}
                orders={orders}
                onSaveProduct={upsertProduct}
                onDeleteProduct={deleteProduct}
                onUpdateProductReferenceCost={updateProductReferenceCost}
                onAdjustStock={adjustProductStock}
              />
            }
          />
          <Route
            path="/compras"
            element={
              <PurchasesPage
                products={products}
                purchases={purchases}
                suppliers={suppliers}
                onCreatePurchase={handleCreatePurchase}
                onSaveSupplier={upsertSupplier}
                onDeleteSupplier={deleteSupplier}
              />
            }
          />
          <Route
            path="/listas-compra"
            element={
              <ManualPurchaseListsPage
                products={products}
                suppliers={suppliers}
                manualPurchaseLists={manualPurchaseLists}
                onCreateList={handleCreateList}
                onUpdateList={handleUpdateList}
                onDeleteList={deleteList}
                onDuplicateList={duplicateList}
                onConvertToPurchase={convertToPurchase}
                onSaveSupplier={upsertSupplier}
              />
            }
          />
          <Route
            path="/reportes"
            element={
              <ReportsPage
                products={products}
                orders={orders}
                clients={clients}
                expenses={expenses}
                onSaveProduct={upsertProduct}
              />
            }
          />
          <Route path="/configuracion" element={<SettingsPage />} />
          <Route
            path="/stock"
            element={
              <StockPage
                products={products}
                orders={orders}
                purchases={purchases}
                onUpdateProductReferenceCost={updateProductReferenceCost}
                onAdjustStock={(productId, amount, reason, date) =>
                  updateStock(productId, amount, 'ajuste', reason, date)
                }
              />
            }
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}

export default App
