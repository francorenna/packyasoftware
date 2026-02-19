import { useMemo, useState } from 'react'

const orderStatuses = ['Pendiente', 'En Proceso', 'Listo', 'Entregado', 'Cancelado']
const sampleOrderStatuses = ['Pendiente', 'Lista']

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

const parsePositiveNumber = (value) => {
  const parsed = Number(value)
  return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed
}

const formatCurrency = (value) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value)

function OrdersForm({
  orderId,
  products,
  purchases,
  clients,
  stockByProductId,
  onCreate,
  onCreateClient,
}) {
  const safeProducts = Array.isArray(products) ? products : []
  const safePurchases = Array.isArray(purchases) ? purchases : []
  const safeClients = Array.isArray(clients) ? clients : []
  const safeStockByProductId = stockByProductId ?? {}
  const productById = useMemo(
    () =>
      safeProducts.reduce((acc, product) => {
        acc[product.id] = product
        return acc
      }, {}),
    [safeProducts],
  )

  const [clientId, setClientId] = useState('')
  const [status, setStatus] = useState(orderStatuses[0])
  const [deliveryDate, setDeliveryDate] = useState('')
  const [discount, setDiscount] = useState(0)
  const [items, setItems] = useState([createEmptyItem()])
  const [createdAt, setCreatedAt] = useState(() => {
    const d = new Date()
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  })
  const [productionDate, setProductionDate] = useState(() => {
    const d = new Date()
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  })
  const [isSample, setIsSample] = useState(false)
  const [sampleClientName, setSampleClientName] = useState('')
  const [sampleClientPhone, setSampleClientPhone] = useState('')
  const [isQuickCreateClientOpen, setIsQuickCreateClientOpen] = useState(false)
  const [quickClientForm, setQuickClientForm] = useState(() => createInitialQuickClientForm())
  const [quickClientError, setQuickClientError] = useState('')

  const availableStatuses = isSample ? sampleOrderStatuses : orderStatuses

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

  const averageUnitCostByProductId = useMemo(() => {
    const totals = {}

    safePurchases.forEach((purchase) => {
      const purchaseItems = Array.isArray(purchase?.items) ? purchase.items : []
      purchaseItems.forEach((item) => {
        const productId = String(item?.productId ?? '')
        if (!productId) return

        const quantity = parsePositiveNumber(item?.quantity)
        const unitCost = parsePositiveNumber(item?.unitCost)
        if (quantity <= 0 || unitCost <= 0) return

        const row = totals[productId] ?? { totalCost: 0, totalUnits: 0 }
        row.totalCost += quantity * unitCost
        row.totalUnits += quantity
        totals[productId] = row
      })
    })

    return Object.keys(totals).reduce((acc, productId) => {
      const row = totals[productId]
      acc[productId] = row.totalUnits > 0 ? row.totalCost / row.totalUnits : 0
      return acc
    }, {})
  }, [safePurchases])

  const handleItemChange = (index, field, value) => {
    setItems((prevItems) =>
      prevItems.map((item, itemIndex) => {
        if (itemIndex !== index) return item

        if (field === 'quantity' || field === 'unitPrice') {
          return { ...item, [field]: parsePositiveNumber(value) }
        }

        return { ...item, [field]: value }
      }),
    )
  }

  const addItem = () => {
    setItems((prevItems) => [...prevItems, createEmptyItem()])
  }

  const removeItem = (index) => {
    setItems((prevItems) => {
      if (prevItems.length === 1) return prevItems
      return prevItems.filter((_, itemIndex) => itemIndex !== index)
    })
  }

  const handleQuickClientInput = (field, value) => {
    setQuickClientForm((prev) => ({ ...prev, [field]: value }))
    if (quickClientError) setQuickClientError('')
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

  const handleSubmit = (event) => {
    event.preventDefault()

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
    if (!isSample && !selectedClient) return
    if (isSample && !normalizedSampleClientName) return
    if (!deliveryDate || sanitizedItems.length === 0) return

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
      total: isSample ? 0 : total,
      discount: normalizedDiscount,
      items: sanitizedItems,
      isSample,
      createdAt: new Date(`${createdAt}T00:00:00`).toISOString(),
    }

    onCreate(payload)

    setClientId('')
    setStatus(orderStatuses[0])
    setDeliveryDate('')
    setDiscount(0)
    setItems([createEmptyItem()])
    setProductionDate(createdAt)
    setIsSample(false)
    setSampleClientName('')
    setSampleClientPhone('')
  }

  return (
    <section className="card-block">
      <div className="card-head">
        <h3>Nuevo pedido</h3>
        <span className="muted-label">{orderId}</span>
      </div>

      <form className="order-form" onSubmit={handleSubmit}>
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
                type="text"
                value={sampleClientName}
                onChange={(event) => setSampleClientName(event.target.value)}
                placeholder="Nombre libre"
                required
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
            <div className="inline-field-row">
              <select
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                required
              >
                <option value="">Seleccionar cliente</option>
                {safeClients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
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

        <div className="items-head">
          <h4>Productos del pedido</h4>
          <button type="button" className="secondary-btn" onClick={addItem}>
            + Agregar ítem
          </button>
        </div>

        <div className="items-stack">
          {items.map((item, index) => (
            <div key={`item-${index}`} className="item-row">
              <select
                value={item.productId}
                onChange={(event) =>
                  handleItemChange(index, 'productId', event.target.value)
                }
                required
              >
                <option value="">Seleccionar producto</option>
                {safeProducts.map((product) => (
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
                placeholder="Cantidad"
              />
              <input
                type="number"
                min="0"
                value={item.unitPrice}
                onChange={(event) =>
                  handleItemChange(index, 'unitPrice', event.target.value)
                }
                placeholder="Precio unitario"
              />
              <button
                type="button"
                className="danger-ghost-btn"
                onClick={() => removeItem(index)}
              >
                Quitar
              </button>

              <label className="item-material-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(item.isClientMaterial)}
                  onChange={(event) =>
                    handleItemChange(index, 'isClientMaterial', event.target.checked)
                  }
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

                const shortageUnits = Math.max(lineQuantity - availableForLine, 1)
                const suggestedUnits = Math.ceil(shortageUnits / 100) * 100
                const suggestedPackages = Math.ceil(suggestedUnits / 100)
                const averageUnitCost = Number(averageUnitCostByProductId[item.productId] ?? 0)
                const referenceCost = Number(productById[item.productId]?.referenceCost ?? 0)
                const estimatedUnitCost = averageUnitCost > 0 ? averageUnitCost : referenceCost
                const estimatedCost = suggestedUnits * estimatedUnitCost

                return (
                  <>
                    <p className="payment-error">
                      Faltan {shortageUnits} unidades de este producto.
                    </p>
                    <p className="payment-error">
                      Compra sugerida: {suggestedUnits} unidades ({suggestedPackages} paquetes de 100). Costo estimado: {formatCurrency(estimatedCost)}
                    </p>
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

        <button type="submit" className="primary-btn">
          Guardar pedido
        </button>
      </form>
    </section>
  )
}

export default OrdersForm
