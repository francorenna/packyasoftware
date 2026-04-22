import { useEffect, useMemo, useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import AppLayout from './layout/AppLayout'
import ArchivedOrdersPage from './pages/ArchivedOrdersPage'
import ClientsPage from './pages/ClientsPage'
import DashboardPage from './pages/DashboardPage'
import DatabaseStatusPage from './pages/DatabaseStatusPage'
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
import { getOrderFinancialSummary } from './utils/finance'
import { calculateStockSnapshot } from './utils/stock'
import {
  applyCloudPayloadToLocal,
  buildCloudLocalDiffReport,
  forceUpsertCloudSnapshot,
} from './utils/cloudSync'
import { isSupabaseConfigured } from './integrations/supabaseClient'

const HIGH_DEBT_THRESHOLD = 250000

const ENTITY_LABEL_MAP = {
  orders: 'Pedidos',
  products: 'Productos',
  clients: 'Clientes',
  purchases: 'Compras',
  suppliers: 'Proveedores',
  manual_purchase_lists: 'Listas de compra',
  expenses: 'Gastos',
  quotes: 'Presupuestos',
}

const formatSyncDate = (value) => {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Sin fecha'
  return parsed.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

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
    duplicateOrder,
    registerPayment,
    registerClientPayment,
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
    reopenArchivedOrderAsNew,
    deleteArchivedOrder,
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

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!isSupabaseConfigured) return
    if (window.navigator.onLine === false) return

    const sessionGuardKey = 'packya_cloud_review_done_v1'
    if (window.sessionStorage.getItem(sessionGuardKey) === '1') return

    let cancelled = false

    const reviewCloudVsLocal = async () => {
      try {
        const report = await buildCloudLocalDiffReport()
        if (cancelled) return

        if (!report.hasDifferences) {
          window.sessionStorage.setItem(sessionGuardKey, '1')
          return
        }

        const summaryLines = report.differences.slice(0, 8).map((diff) => {
          const label = ENTITY_LABEL_MAP[String(diff.entity)] ?? String(diff.entity)
          const reason = String(diff.reason ?? 'Diferencia detectada')
          const cloudDate = formatSyncDate(diff.cloudUpdatedAt)
          const localDate = formatSyncDate(diff.localLatestAt)
          return `- ${label}: ${reason}. Local(${diff.localCount}) vs Nube(${diff.cloudCount}). Local: ${localDate}. Nube: ${cloudDate}`
        })

        const truncated = report.differences.length > 8
          ? `\n... y ${report.differences.length - 8} diferencia(s) más.`
          : ''

        const message =
          `Se detectaron diferencias entre Local y Nube:\n\n` +
          `${summaryLines.join('\n')}${truncated}\n\n` +
          `Aceptar = aplicar NUBE sobre LOCAL ahora.\n` +
          `Cancelar = mantener LOCAL (luego podés elegir subir LOCAL a Nube).`

        const applyCloudToLocal = window.confirm(message)
        if (cancelled) return

        if (applyCloudToLocal) {
          report.differences.forEach((diff) => {
            applyCloudPayloadToLocal(diff.entity, diff.cloudPayload)
          })

          window.sessionStorage.setItem(sessionGuardKey, '1')
          window.alert('Se aplicaron los cambios de Nube sobre Local. La app se recargará para actualizar todo.')
          window.location.reload()
          return
        }

        const keepLocalAndUpload = window.confirm(
          '¿Querés mantener la base LOCAL y subirla ahora a la NUBE para sincronizar ambas?',
        )
        if (cancelled) return

        if (keepLocalAndUpload) {
          for (const diff of report.differences) {
            await forceUpsertCloudSnapshot(diff.entity, diff.localPayload ?? [])
          }

          window.alert('Sincronización completada: se mantuvo Local y se actualizó Nube con esos datos.')
        }

        window.sessionStorage.setItem(sessionGuardKey, '1')
      } catch (error) {
        console.warn('[cloud-review] No se pudo completar la revisión de diferencias:', error)
      }
    }

    void reviewCloudVsLocal()

    return () => {
      cancelled = true
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

  const globalAlerts = useMemo(() => {
    const safeOrders = Array.isArray(orders) ? orders : []
    const safeProducts = Array.isArray(products) ? products : []

    const todayKey = (() => {
      const d = new Date()
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    })()

    const delayedOrdersCount = safeOrders.filter((order) => {
      if (order?.isArchived === true) return false
      const status = String(order?.status ?? '')
      if (status === 'Entregado' || status === 'Cancelado') return false
      const deliveryDate = String(order?.deliveryDate ?? '')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) return false
      return deliveryDate < todayKey
    }).length

    const debtByClient = safeOrders.reduce((acc, order) => {
      if (!order || typeof order !== 'object') return acc
      if (order.isSample) return acc

      const clientId = String(order.clientId ?? '').trim() || `name:${String(order.clientName ?? order.client ?? 'sin-cliente').trim().toLowerCase()}`
      const summary = getOrderFinancialSummary(order)
      acc[clientId] = (acc[clientId] ?? 0) + Number(summary.remainingDebt || 0)
      return acc
    }, {})

    const highDebtClientsCount = Object.values(debtByClient).filter((amount) => Number(amount || 0) > HIGH_DEBT_THRESHOLD).length

    const stockRows = calculateStockSnapshot(safeProducts, safeOrders)
    const stockCriticalCount = stockRows.filter((row) => {
      const available = Number(row?.stockDisponible || 0)
      const minimum = Number(row?.stockMinimo || 0)
      return available <= minimum
    }).length

    const alerts = [
      {
        id: 'delayed-orders',
        severity: delayedOrdersCount > 0 ? 'critical' : 'ok',
        icon: delayedOrdersCount > 0 ? '🔴' : '🟢',
        label: delayedOrdersCount > 0
          ? `${delayedOrdersCount} pedidos retrasados`
          : 'Pedidos en fecha',
        targetHash: '/pedidos',
      },
      {
        id: 'high-debt-clients',
        severity: highDebtClientsCount > 0 ? 'medium' : 'ok',
        icon: highDebtClientsCount > 0 ? '🟠' : '🟢',
        label: highDebtClientsCount > 0
          ? `${highDebtClientsCount} clientes con deuda alta`
          : 'Deuda de clientes controlada',
        targetHash: '/clientes',
      },
      {
        id: 'stock-critical',
        severity: stockCriticalCount > 0 ? 'critical' : 'ok',
        icon: stockCriticalCount > 0 ? '🔴' : '🟢',
        label: stockCriticalCount > 0
          ? `${stockCriticalCount} productos en stock crítico`
          : 'Stock en niveles correctos',
        targetHash: '/stock',
      },
    ]

    const severityRank = {
      critical: 3,
      medium: 2,
      ok: 1,
    }

    return alerts.sort((a, b) => {
      const rankDiff = (severityRank[String(b.severity)] ?? 0) - (severityRank[String(a.severity)] ?? 0)
      if (rankDiff !== 0) return rankDiff
      return String(a.label ?? '').localeCompare(String(b.label ?? ''), 'es', { sensitivity: 'base' })
    })
  }, [orders, products])

  const handleOpenGlobalAlert = (alert) => {
    const targetHash = String(alert?.targetHash ?? '').trim()
    if (!targetHash) return
    window.location.hash = `#${targetHash}`
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
              globalAlerts={globalAlerts}
              onOpenAlert={handleOpenGlobalAlert}
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
                onRegisterClientPayment={registerClientPayment}
                onUpdateOrderStatus={handleUpdateOrderStatus}
                onUpdateOrderDelivery={updateOrderDelivery}
                onUpdateOrderClient={updateOrderClient}
                onUpdateOrderItems={updateOrderItems}
                onUpdateOrderItemCompletion={updateOrderItemCompletion}
                onUpdateOrderUrgency={updateOrderUrgency}
                onDeleteCancelledOrder={deleteCancelledOrder}
                onCreateClient={handleCreateClient}
                onSaveClient={upsertClient}
                onMarkProductAsUsed={markProductAsUsed}
                onCreateManualPurchaseList={handleCreateList}
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
                onReopenOrderAsNew={reopenArchivedOrderAsNew}
                onCreateClient={upsertClient}
                onConvertSampleToRealOrder={convertSampleToRealOrder}
                onDuplicateOrder={duplicateOrder}
                onDeleteArchivedOrder={deleteArchivedOrder}
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
          <Route path="/base-datos" element={<DatabaseStatusPage />} />
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
