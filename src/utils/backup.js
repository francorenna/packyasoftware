const STORAGE_KEYS = {
  orders: 'packya_orders',
  products: 'packya_products',
  clients: 'packya_clients',
  suppliers: 'packya_suppliers',
  purchases: 'packya_purchases',
  purchasePlans: 'packya_purchase_plans',
  quotes: 'packya_quotes',
  storageVersion: 'packya_storage_version',
}

const BACKUP_VERSION = '1.0.0'

const parseStoredArray = (key) => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []

    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const parseStoredValue = (key) => {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return null

    try {
      return JSON.parse(raw)
    } catch {
      return raw
    }
  } catch {
    return null
  }
}

const ensureValidBackup = (backup) => {
  if (!backup || typeof backup !== 'object') {
    throw new Error('Archivo de respaldo inválido.')
  }

  if (!backup.version || typeof backup.version !== 'string') {
    throw new Error('El respaldo no tiene versión válida.')
  }

  if (!backup.data || typeof backup.data !== 'object') {
    throw new Error('El respaldo no contiene datos válidos.')
  }

  const requiredArrayDomains = ['orders', 'products', 'clients', 'suppliers', 'purchases']
  const hasAllDomains = requiredArrayDomains.every((domain) => Array.isArray(backup.data[domain]))
  if (!hasAllDomains) {
    throw new Error('El respaldo no tiene la estructura esperada.')
  }

  // Backward compatibility: old backups may not include new optional domains.
  if (
    backup.data.purchasePlans !== undefined &&
    !Array.isArray(backup.data.purchasePlans)
  ) {
    throw new Error('El respaldo tiene formato inválido en planes de compra.')
  }

  if (backup.data.quotes !== undefined && !Array.isArray(backup.data.quotes)) {
    throw new Error('El respaldo tiene formato inválido en presupuestos.')
  }
}

export function exportBackup() {
  const payload = {
    version: BACKUP_VERSION,
    exportDate: new Date().toISOString(),
    data: {
      orders: parseStoredArray(STORAGE_KEYS.orders),
      products: parseStoredArray(STORAGE_KEYS.products),
      clients: parseStoredArray(STORAGE_KEYS.clients),
      suppliers: parseStoredArray(STORAGE_KEYS.suppliers),
      purchases: parseStoredArray(STORAGE_KEYS.purchases),
      purchasePlans: parseStoredArray(STORAGE_KEYS.purchasePlans),
      quotes: parseStoredArray(STORAGE_KEYS.quotes),
      storageVersion: parseStoredValue(STORAGE_KEYS.storageVersion),
    },
  }

  const json = JSON.stringify(payload, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const fileDate = payload.exportDate.slice(0, 10)
  const fileName = `packya-backup-${fileDate}.json`

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)

  return fileName
}

export function getCurrentBackupCounts() {
  return {
    orders: parseStoredArray(STORAGE_KEYS.orders).length,
    products: parseStoredArray(STORAGE_KEYS.products).length,
    clients: parseStoredArray(STORAGE_KEYS.clients).length,
    suppliers: parseStoredArray(STORAGE_KEYS.suppliers).length,
    purchases: parseStoredArray(STORAGE_KEYS.purchases).length,
    quotes: parseStoredArray(STORAGE_KEYS.quotes).length,
  }
}

export async function readBackupPreview(file) {
  if (!(file instanceof File)) {
    throw new Error('Debes seleccionar un archivo válido.')
  }

  const raw = await file.text()

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('El archivo no es un JSON válido.')
  }

  ensureValidBackup(parsed)

  return {
    version: parsed.version,
    exportDate: String(parsed.exportDate ?? ''),
    counts: {
      orders: parsed.data.orders.length,
      products: parsed.data.products.length,
      clients: parsed.data.clients.length,
      suppliers: parsed.data.suppliers.length,
      purchases: parsed.data.purchases.length,
      purchasePlans: Array.isArray(parsed.data.purchasePlans) ? parsed.data.purchasePlans.length : 0,
      quotes: Array.isArray(parsed.data.quotes) ? parsed.data.quotes.length : 0,
    },
  }
}

export async function importBackup(file) {
  if (!(file instanceof File)) {
    throw new Error('Debes seleccionar un archivo válido.')
  }

  const raw = await file.text()

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('El archivo no es un JSON válido.')
  }

  ensureValidBackup(parsed)

  const shouldContinue = window.confirm(
    'Se reemplazarán todos los datos actuales por el respaldo seleccionado. ¿Deseas continuar?',
  )

  if (!shouldContinue) {
    return { cancelled: true }
  }

  localStorage.setItem(STORAGE_KEYS.orders, JSON.stringify(parsed.data.orders))
  localStorage.setItem(STORAGE_KEYS.products, JSON.stringify(parsed.data.products))
  localStorage.setItem(STORAGE_KEYS.clients, JSON.stringify(parsed.data.clients))
  localStorage.setItem(STORAGE_KEYS.suppliers, JSON.stringify(parsed.data.suppliers))
  localStorage.setItem(STORAGE_KEYS.purchases, JSON.stringify(parsed.data.purchases))
  localStorage.setItem(
    STORAGE_KEYS.purchasePlans,
    JSON.stringify(Array.isArray(parsed.data.purchasePlans) ? parsed.data.purchasePlans : []),
  )
  localStorage.setItem(
    STORAGE_KEYS.quotes,
    JSON.stringify(Array.isArray(parsed.data.quotes) ? parsed.data.quotes : []),
  )

  const storageVersion = parsed.data.storageVersion
  if (storageVersion !== null && storageVersion !== undefined) {
    localStorage.setItem(STORAGE_KEYS.storageVersion, String(storageVersion))
  }

  window.location.reload()
  return { cancelled: false }
}