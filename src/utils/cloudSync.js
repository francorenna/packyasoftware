import { getSupabaseClient, isSupabaseConfigured } from '../integrations/supabaseClient'

const CLOUD_SYNC_QUEUE_KEY = 'packya_cloud_sync_queue'
const CLOUD_SYNC_HASH_BY_ENTITY_KEY = 'packya_cloud_sync_hash_by_entity'
const CLOUD_SYNC_HEALTH_KEY = 'packya_cloud_sync_health'
const CLOUD_SNAPSHOT_TABLE = 'cloud_snapshots'
export const CLOUD_SYNC_STATUS_EVENT = 'packya:cloud-sync-status'
export const ENTITY_STORAGE_KEY_MAP = {
  orders: 'packya_orders',
  products: 'packya_products',
  clients: 'packya_clients',
  purchases: 'packya_purchases',
  suppliers: 'packya_suppliers',
  manual_purchase_lists: 'packya_manual_purchase_lists',
  expenses: 'packya_expenses',
  quotes: 'packya_quotes',
  daily_panel_entries: 'packya_daily_panel_entries_v1',
}
export const CLOUD_WRITE_ALLOWLIST = ['orders', 'clients', 'quotes', 'purchases', 'manual_purchase_lists', 'products', 'suppliers', 'expenses', 'daily_panel_entries']

const KNOWN_ENTITIES = Object.keys(ENTITY_STORAGE_KEY_MAP)
const CLOUD_WRITE_ALLOWLIST_SET = new Set(CLOUD_WRITE_ALLOWLIST)

let listenersAttached = false
let isProcessingQueue = false

const MAX_SYNC_ERROR_LENGTH = 280
const MAX_CLOUD_PAYLOAD_BYTES = 1024 * 1024

const getTodayKey = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const isBrowser = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'

const safeReadJson = (key, fallbackValue) => {
  if (!isBrowser()) return fallbackValue

  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallbackValue

    const parsed = JSON.parse(raw)
    return parsed ?? fallbackValue
  } catch {
    return fallbackValue
  }
}

const safeWriteJson = (key, value) => {
  if (!isBrowser()) return

  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    void 0
  }
}

const loadQueue = () => {
  const parsed = safeReadJson(CLOUD_SYNC_QUEUE_KEY, [])
  return Array.isArray(parsed) ? parsed : []
}

const saveQueue = (queue) => {
  safeWriteJson(CLOUD_SYNC_QUEUE_KEY, Array.isArray(queue) ? queue : [])
}

const emitStatusChange = () => {
  if (!isBrowser()) return

  try {
    window.dispatchEvent(new CustomEvent(CLOUD_SYNC_STATUS_EVENT, {
      detail: getCloudSyncStatus(),
    }))
  } catch {
    void 0
  }
}

const loadHashByEntity = () => {
  const parsed = safeReadJson(CLOUD_SYNC_HASH_BY_ENTITY_KEY, {})
  return parsed && typeof parsed === 'object' ? parsed : {}
}

const saveHashByEntity = (hashByEntity) => {
  safeWriteJson(CLOUD_SYNC_HASH_BY_ENTITY_KEY, hashByEntity && typeof hashByEntity === 'object' ? hashByEntity : {})
}

const loadHealth = () => {
  const parsed = safeReadJson(CLOUD_SYNC_HEALTH_KEY, null)
  const todayKey = getTodayKey()

  if (!parsed || typeof parsed !== 'object') {
    return {
      dayKey: todayKey,
      queuePeakToday: 0,
      lastAttemptAt: '',
      lastSuccessAt: '',
    }
  }

  const safeDayKey = String(parsed.dayKey ?? '')
  const persistedPeak = Number(parsed.queuePeakToday ?? 0)

  if (safeDayKey !== todayKey) {
    return {
      dayKey: todayKey,
      queuePeakToday: 0,
      lastAttemptAt: String(parsed.lastAttemptAt ?? ''),
      lastSuccessAt: String(parsed.lastSuccessAt ?? ''),
    }
  }

  return {
    dayKey: safeDayKey || todayKey,
    queuePeakToday: Number.isFinite(persistedPeak) && persistedPeak > 0 ? persistedPeak : 0,
    lastAttemptAt: String(parsed.lastAttemptAt ?? ''),
    lastSuccessAt: String(parsed.lastSuccessAt ?? ''),
  }
}

const saveHealth = (health) => {
  safeWriteJson(CLOUD_SYNC_HEALTH_KEY, {
    dayKey: String(health?.dayKey ?? getTodayKey()),
    queuePeakToday: Number(health?.queuePeakToday ?? 0),
    lastAttemptAt: String(health?.lastAttemptAt ?? ''),
    lastSuccessAt: String(health?.lastSuccessAt ?? ''),
  })
}

const updateHealth = (updater) => {
  const current = loadHealth()
  const next = typeof updater === 'function' ? updater(current) : current
  const safeNext = next && typeof next === 'object' ? next : current
  saveHealth(safeNext)
  return safeNext
}

const registerQueuePeak = (queueLength) => {
  const length = Number(queueLength || 0)
  if (!Number.isFinite(length) || length <= 0) return

  updateHealth((current) => {
    const todayKey = getTodayKey()
    const resetPeak = current.dayKey === todayKey ? current.queuePeakToday : 0

    return {
      ...current,
      dayKey: todayKey,
      queuePeakToday: Math.max(resetPeak, length),
    }
  })
}

const registerAttemptAt = () => {
  updateHealth((current) => ({
    ...current,
    dayKey: getTodayKey(),
    lastAttemptAt: new Date().toISOString(),
  }))
}

const registerSuccessAt = () => {
  updateHealth((current) => ({
    ...current,
    dayKey: getTodayKey(),
    lastSuccessAt: new Date().toISOString(),
  }))
}

const isOnline = () => {
  if (!isBrowser()) return false
  return window.navigator.onLine !== false
}

export const isCloudEntityWriteAllowed = (entity) => {
  const key = String(entity ?? '').trim()
  if (!key) return false
  return CLOUD_WRITE_ALLOWLIST_SET.has(key)
}

const buildCloudErrorInfo = (error) => {
  if (error instanceof Error) {
    return {
      message: String(error.message || 'Error desconocido'),
      code: '',
      details: '',
      hint: '',
    }
  }

  if (error && typeof error === 'object') {
    return {
      message: String(error.message ?? error.error_description ?? error.error ?? 'Error desconocido'),
      code: String(error.code ?? ''),
      details: String(error.details ?? ''),
      hint: String(error.hint ?? ''),
    }
  }

  return {
    message: String(error ?? 'Error desconocido'),
    code: '',
    details: '',
    hint: '',
  }
}

const toCloudErrorText = (error) => {
  const info = buildCloudErrorInfo(error)
  const chunks = [info.message]
  if (info.code) chunks.push(`code=${info.code}`)
  if (info.hint) chunks.push(`hint=${info.hint}`)
  if (info.details) chunks.push(`details=${info.details}`)

  return chunks
    .filter(Boolean)
    .join(' | ')
    .slice(0, MAX_SYNC_ERROR_LENGTH)
}

const reportCloudError = (message, error) => {
  if (!isBrowser()) return

  const details = toCloudErrorText(error)
  try {
    window?.packyaLogger?.log?.('error', message, details)
  } catch {
    void 0
  }
}

const reportCloudInfo = (message, details = '') => {
  if (!isBrowser()) return
  try {
    window?.packyaLogger?.log?.('info', message, details)
  } catch {
    void 0
  }
}

const reportCloudWarn = (message, details = '') => {
  if (!isBrowser()) return
  try {
    window?.packyaLogger?.log?.('warn', message, details)
  } catch {
    void 0
  }
}

const safeSerializePayload = (payload) => {
  try {
    return JSON.stringify(payload ?? null)
  } catch {
    return ''
  }
}

const toPayloadByteSize = (serializedPayload) => {
  if (typeof serializedPayload !== 'string') return 0
  try {
    return new Blob([serializedPayload]).size
  } catch {
    return serializedPayload.length
  }
}

const validateCloudWritePayload = (entity, payload) => {
  const entityKey = String(entity ?? '').trim()

  if (!entityKey) {
    return {
      isValid: false,
      reason: 'Entidad vacia',
      serializedPayload: '',
      payloadBytes: 0,
    }
  }

  if (!isCloudEntityWriteAllowed(entityKey)) {
    return {
      isValid: false,
      reason: `Entidad no permitida en etapa 1: ${entityKey}`,
      serializedPayload: '',
      payloadBytes: 0,
    }
  }

  const serializedPayload = safeSerializePayload(payload)
  if (!serializedPayload) {
    return {
      isValid: false,
      reason: `Payload no serializable para ${entityKey}`,
      serializedPayload: '',
      payloadBytes: 0,
    }
  }

  const payloadBytes = toPayloadByteSize(serializedPayload)
  if (payloadBytes > MAX_CLOUD_PAYLOAD_BYTES) {
    return {
      isValid: false,
      reason: `Payload excede limite (${payloadBytes} bytes > ${MAX_CLOUD_PAYLOAD_BYTES}) para ${entityKey}`,
      serializedPayload,
      payloadBytes,
    }
  }

  return {
    isValid: true,
    reason: '',
    serializedPayload,
    payloadBytes,
  }
}

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/

const toTrimmedString = (value) => String(value ?? '').trim()

const toSafeNumber = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const toIsoOrEmpty = (value) => {
  if (value === null || value === undefined || value === '') return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString()
}

const toIsoOrNull = (value) => {
  const iso = toIsoOrEmpty(value)
  return iso || null
}

const toDateOnlyOrEmpty = (value) => {
  const raw = toTrimmedString(value)
  if (!raw) return ''
  if (DATE_ONLY_REGEX.test(raw)) return raw

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return ''

  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const normalizeOrderItem = (item) => ({
  productId: toTrimmedString(item?.productId),
  productName: toTrimmedString(item?.productName ?? item?.product),
  quantity: toSafeNumber(item?.quantity),
  unitPrice: toSafeNumber(item?.unitPrice),
  isClientMaterial: Boolean(item?.isClientMaterial),
  itemCompleted: Boolean(item?.itemCompleted),
})

const normalizeOrderPayment = (payment) => ({
  id: toTrimmedString(payment?.id),
  amount: toSafeNumber(payment?.amount),
  method: toTrimmedString(payment?.method),
  date: toIsoOrEmpty(payment?.date),
  note: toTrimmedString(payment?.note),
})

const normalizeOrderAdjustment = (adjustment) => ({
  id: toTrimmedString(adjustment?.id),
  amount: toSafeNumber(adjustment?.amount),
  note: toTrimmedString(adjustment?.note ?? adjustment?.reason),
  date: toIsoOrEmpty(adjustment?.date),
})

const normalizeOrderForHash = (order) => {
  const clientName = toTrimmedString(order?.clientName ?? order?.client)

  const items = (Array.isArray(order?.items) ? order.items : [])
    .map((item) => normalizeOrderItem(item))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))

  const payments = (Array.isArray(order?.payments) ? order.payments : [])
    .map((payment) => normalizeOrderPayment(payment))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))

  const financialAdjustments = (Array.isArray(order?.financialAdjustments) ? order.financialAdjustments : [])
    .map((adjustment) => normalizeOrderAdjustment(adjustment))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))

  return {
    id: toTrimmedString(order?.id),
    clientId: toTrimmedString(order?.clientId),
    clientName,
    status: toTrimmedString(order?.status),
    createdAt: toIsoOrEmpty(order?.createdAt),
    productionDate: toIsoOrEmpty(order?.productionDate),
    readyAt: toIsoOrEmpty(order?.readyAt),
    deliveryDate: toDateOnlyOrEmpty(order?.deliveryDate),
    deliveredVia: toTrimmedString(order?.deliveredVia),
    deliveryType: toTrimmedString(order?.deliveryType),
    deliveredBy: toTrimmedString(order?.deliveredBy),
    trackingNumber: toTrimmedString(order?.trackingNumber),
    deliveryNote: toTrimmedString(order?.deliveryNote ?? order?.deliveryDetails),
    deliveryDetails: toTrimmedString(order?.deliveryDetails),
    productionTime: toTrimmedString(order?.productionTime),
    sourceQuoteId: toTrimmedString(order?.sourceQuoteId),
    shippingCost: toSafeNumber(order?.shippingCost),
    financialNote: toTrimmedString(order?.financialNote),
    discount: toSafeNumber(order?.discount),
    urgent: Boolean(order?.urgent),
    isSample: Boolean(order?.isSample),
    isArchived: Boolean(order?.isArchived),
    archivedAt: toIsoOrNull(order?.archivedAt),
    total: toSafeNumber(order?.total),
    items,
    payments,
    financialAdjustments,
  }
}

const canonicalizePayloadForEntity = (entity, payload) => {
  const entityKey = String(entity ?? '').trim()
  if (entityKey !== 'orders') return payload
  if (!Array.isArray(payload)) return payload

  return payload
    .map((order) => normalizeOrderForHash(order))
    .sort((a, b) => {
      const idDiff = String(a.id).localeCompare(String(b.id))
      if (idDiff !== 0) return idDiff
      return String(a.createdAt).localeCompare(String(b.createdAt))
    })
}

const normalizeForHash = (value) => {
  if (Array.isArray(value)) {
    const normalizedEntries = value.map((entry) => normalizeForHash(entry))

    // Compare sets by content (not insertion order). This prevents false
    // diffs when local/cloud keep the same data but arrays come in different
    // order after JSONB roundtrips or state normalization.
    return [...normalizedEntries].sort((a, b) => {
      const aKey = JSON.stringify(a)
      const bKey = JSON.stringify(b)
      return aKey.localeCompare(bKey)
    })
  }

  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort((a, b) => a.localeCompare(b))
      .reduce((acc, key) => {
        acc[key] = normalizeForHash(value[key])
        return acc
      }, {})
  }

  return value
}

const toStableHash = (value, entity = '') => {
  try {
    const canonical = canonicalizePayloadForEntity(entity, value)
    return JSON.stringify(normalizeForHash(canonical))
  } catch {
    return ''
  }
}

const toEntityRowCount = (payload) => {
  if (Array.isArray(payload)) return payload.length
  if (payload && typeof payload === 'object') return Object.keys(payload).length
  return 0
}

const toLatestIsoInPayload = (payload) => {
  const stack = [payload]
  let latestTs = 0
  let visited = 0

  while (stack.length > 0 && visited < 4000) {
    const current = stack.pop()
    visited += 1

    if (!current || typeof current !== 'object') continue

    if (Array.isArray(current)) {
      current.forEach((entry) => stack.push(entry))
      continue
    }

    const dateCandidates = [
      current.updatedAt,
      current.updated_at,
      current.createdAt,
      current.created_at,
      current.archivedAt,
      current.date,
    ]

    dateCandidates.forEach((value) => {
      if (!value) return
      const parsed = new Date(value)
      const ts = parsed.getTime()
      if (!Number.isNaN(ts) && ts > latestTs) latestTs = ts
    })

    Object.values(current).forEach((value) => {
      if (value && typeof value === 'object') stack.push(value)
    })
  }

  return latestTs > 0 ? new Date(latestTs).toISOString() : null
}

const readLocalEntityPayload = (entity) => {
  if (!isBrowser()) return null

  const key = ENTITY_STORAGE_KEY_MAP[String(entity ?? '').trim()]
  if (!key) return null

  const raw = window.localStorage.getItem(key)
  if (!raw) return null

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const buildTraceRow = (entity, cloudByEntity) => {
  const localPayload = readLocalEntityPayload(entity)
  const cloudPayload = cloudByEntity[entity]?.payload ?? null
  const localHash = toStableHash(localPayload, entity)
  const cloudHash = toStableHash(cloudPayload, entity)
  const hasLocal = localPayload !== null
  const hasCloud = cloudPayload !== null
  const isInSync = localHash === cloudHash

  const reason = (() => {
    if (isInSync) return 'Sin diferencias'
    if (hasLocal && !hasCloud) return 'Existe en local pero no en nube'
    if (!hasLocal && hasCloud) return 'Existe en nube pero no en local'
    return 'Contenido distinto entre local y nube'
  })()

  return {
    entity,
    reason,
    isInSync,
    localCount: toEntityRowCount(localPayload),
    cloudCount: toEntityRowCount(cloudPayload),
    localLatestAt: toLatestIsoInPayload(localPayload),
    cloudUpdatedAt: String(cloudByEntity[entity]?.updated_at ?? ''),
    localPayload,
    cloudPayload,
  }
}

export const enqueueCloudSnapshot = (entity, payload) => {
  const entityKey = String(entity ?? '').trim()
  if (!entityKey || !isBrowser()) return false

  const payloadValidation = validateCloudWritePayload(entityKey, payload)
  if (!payloadValidation.isValid) {
    reportCloudWarn('[cloud-sync] Snapshot descartado', payloadValidation.reason)
    return false
  }

  const payloadHash = toStableHash(payload, entityKey)
  const hashByEntity = loadHashByEntity()

  if (payloadHash && hashByEntity[entityKey] === payloadHash) {
    reportCloudInfo('[cloud-sync] Snapshot sin cambios', `entity=${entityKey}`)
    return false
  }

  hashByEntity[entityKey] = payloadHash
  saveHashByEntity(hashByEntity)

  const queue = loadQueue()
  const nextJob = {
    id: `sync-${entityKey}-${Date.now()}`,
    entity: entityKey,
    payload,
    queuedAt: new Date().toISOString(),
    attempts: 0,
    lastError: '',
  }

  const existingIndex = queue.findIndex((job) => String(job?.entity ?? '') === entityKey)
  if (existingIndex >= 0) {
    queue[existingIndex] = nextJob
  } else {
    queue.push(nextJob)
  }

  saveQueue(queue)
  registerQueuePeak(queue.length)
  reportCloudInfo(
    '[cloud-sync] Snapshot encolado',
    `entity=${entityKey} queue=${queue.length} bytes=${payloadValidation.payloadBytes}`,
  )
  emitStatusChange()
  return true
}

export const getCloudSyncStatus = () => {
  const pendingQueue = loadQueue()
  const headJob = pendingQueue[0] ?? null
  const health = loadHealth()

  return {
    configured: isSupabaseConfigured,
    online: isOnline(),
    pendingCount: pendingQueue.length,
    processing: isProcessingQueue,
    failedEntity: headJob ? String(headJob.entity ?? '') : '',
    failedAttempts: Number(headJob?.attempts || 0),
    lastError: String(headJob?.lastError ?? ''),
    queuedAt: String(headJob?.queuedAt ?? ''),
    queuePeakToday: Number(health.queuePeakToday || 0),
    lastAttemptAt: String(health.lastAttemptAt ?? ''),
    lastSuccessAt: String(health.lastSuccessAt ?? ''),
  }
}

export const probeCloudConnection = async () => {
  if (!isBrowser()) {
    return {
      ok: false,
      reason: 'not-browser',
      message: 'Entorno sin navegador (sin acceso a localStorage/red de app).',
      code: '',
    }
  }

  if (!isSupabaseConfigured) {
    return {
      ok: false,
      reason: 'not-configured',
      message: 'Supabase no está configurado en este build.',
      code: '',
    }
  }

  if (!isOnline()) {
    return {
      ok: false,
      reason: 'offline',
      message: 'Sin internet detectado por el dispositivo.',
      code: '',
    }
  }

  try {
    const supabase = getSupabaseClient()
    if (!supabase) {
      return {
        ok: false,
        reason: 'client-null',
        message: 'No se pudo inicializar el cliente de Supabase.',
        code: '',
      }
    }

    const { error } = await supabase
      .from(CLOUD_SNAPSHOT_TABLE)
      .select('entity', { head: true, count: 'exact' })

    if (error) {
      const info = buildCloudErrorInfo(error)
      return {
        ok: false,
        reason: 'supabase-query-failed',
        message: toCloudErrorText(error),
        code: info.code,
      }
    }

    return {
      ok: true,
      reason: 'ok',
      message: 'Conexión y permisos de lectura en nube: OK.',
      code: '',
    }
  } catch (error) {
    const info = buildCloudErrorInfo(error)
    return {
      ok: false,
      reason: 'exception',
      message: toCloudErrorText(error),
      code: info.code,
    }
  }
}

const pushSnapshotJob = async (job) => {
  const payloadValidation = validateCloudWritePayload(job?.entity, job?.payload)
  if (!payloadValidation.isValid) {
    throw new Error(payloadValidation.reason)
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    throw new Error('Supabase no configurado')
  }

  const payload = {
    entity: String(job.entity),
    payload: job.payload,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from(CLOUD_SNAPSHOT_TABLE)
    .upsert(payload, { onConflict: 'entity' })

  if (error) {
    throw error
  }
}

export const forceUpsertCloudSnapshot = async (entity, payload) => {
  const entityKey = String(entity ?? '').trim()
  if (!entityKey) return false
  const payloadValidation = validateCloudWritePayload(entityKey, payload)
  if (!payloadValidation.isValid) {
    throw new Error(payloadValidation.reason)
  }
  await pushSnapshotJob({ entity: entityKey, payload })

  // Save the hash so enqueueCloudSnapshot won't re-queue this entity immediately
  const payloadHash = toStableHash(payload, entityKey)
  const hashByEntity = loadHashByEntity()
  hashByEntity[entityKey] = payloadHash
  saveHashByEntity(hashByEntity)

  // Remove any pending queue entry for this entity — it's now in sync
  const queue = loadQueue()
  const filteredQueue = queue.filter((job) => String(job?.entity ?? '') !== entityKey)
  if (filteredQueue.length !== queue.length) {
    saveQueue(filteredQueue)
  }

  registerSuccessAt()
  reportCloudInfo(
    '[cloud-sync] Upsert forzado exitoso',
    `entity=${entityKey} bytes=${payloadValidation.payloadBytes}`,
  )
  emitStatusChange()
  return true
}

export const fetchCloudSnapshots = async () => {
  const supabase = getSupabaseClient()
  if (!supabase) return []

  const { data, error } = await supabase
    .from(CLOUD_SNAPSHOT_TABLE)
    .select('entity,payload,updated_at')

  if (error) {
    throw error
  }

  return Array.isArray(data) ? data : []
}

export const buildCloudLocalTraceReport = async () => {
  if (!isBrowser() || !isSupabaseConfigured) {
    return {
      hasDifferences: false,
      rows: KNOWN_ENTITIES.map((entity) => ({
        entity,
        reason: 'Nube no configurada',
        isInSync: true,
        localCount: toEntityRowCount(readLocalEntityPayload(entity)),
        cloudCount: 0,
        localLatestAt: toLatestIsoInPayload(readLocalEntityPayload(entity)),
        cloudUpdatedAt: '',
        localPayload: readLocalEntityPayload(entity),
        cloudPayload: null,
      })),
    }
  }

  const cloudRows = await fetchCloudSnapshots()
  const cloudByEntity = cloudRows.reduce((acc, row) => {
    const entity = String(row?.entity ?? '').trim()
    if (!entity) return acc
    acc[entity] = row
    return acc
  }, {})

  const rows = KNOWN_ENTITIES.map((entity) => buildTraceRow(entity, cloudByEntity))
  return {
    hasDifferences: rows.some((row) => !row.isInSync),
    rows,
  }
}

export const buildCloudLocalDiffReport = async () => {
  const trace = await buildCloudLocalTraceReport()
  const differences = trace.rows.filter((row) => !row.isInSync)

  return {
    hasDifferences: differences.length > 0,
    differences,
  }
}

export const applyCloudPayloadToLocal = (entity, payload) => {
  if (!isBrowser()) return false

  const key = ENTITY_STORAGE_KEY_MAP[String(entity ?? '').trim()]
  if (!key) return false

  try {
    window.localStorage.setItem(key, JSON.stringify(payload ?? []))
    return true
  } catch {
    return false
  }
}

export const processCloudSyncQueue = async () => {
  if (!isBrowser() || !isSupabaseConfigured || !isOnline()) {
    emitStatusChange()
    return {
      processedCount: 0,
      hasError: false,
    }
  }
  if (isProcessingQueue) {
    return {
      processedCount: 0,
      hasError: false,
      skippedBecauseProcessing: true,
    }
  }

  isProcessingQueue = true
  emitStatusChange()

  let processedCount = 0
  let hasError = false

  try {
    let queue = loadQueue()
    if (queue.length > 0) {
      const filteredQueue = queue.filter((job) => isCloudEntityWriteAllowed(job?.entity))
      if (filteredQueue.length !== queue.length) {
        reportCloudWarn(
          '[cloud-sync] Jobs removidos por allowlist',
          `removed=${queue.length - filteredQueue.length}`,
        )
        queue = filteredQueue
        saveQueue(queue)
      }
    }
    registerQueuePeak(queue.length)

    while (queue.length > 0) {
      const current = queue[0]

      if (!isCloudEntityWriteAllowed(current?.entity)) {
        reportCloudWarn('[cloud-sync] Job descartado por allowlist', `entity=${String(current?.entity ?? '')}`)
        queue.shift()
        saveQueue(queue)
        continue
      }

      try {
        registerAttemptAt()
        await pushSnapshotJob(current)
        queue.shift()
        saveQueue(queue)
        processedCount += 1
        registerSuccessAt()
        reportCloudInfo(
          '[cloud-sync] Job sincronizado',
          `entity=${String(current?.entity ?? '')} attempts=${Number(current?.attempts || 0)}`,
        )
      } catch (error) {
        const message = toCloudErrorText(error)
        queue[0] = {
          ...current,
          attempts: Number(current?.attempts || 0) + 1,
          lastError: message,
        }
        saveQueue(queue)
        reportCloudError(`[cloud-sync] Error subiendo entidad ${String(current?.entity ?? 'unknown')}`, error)
        reportCloudWarn(
          '[cloud-sync] Job reintentable',
          `entity=${String(current?.entity ?? '')} attempts=${Number(queue[0]?.attempts || 0)}`,
        )
        hasError = true
        emitStatusChange()
        break
      }
    }
  } finally {
    isProcessingQueue = false
    emitStatusChange()
  }

  return {
    processedCount,
    hasError,
  }
}

export const setupCloudSyncRuntime = () => {
  if (!isBrowser() || listenersAttached) return

  const onOnline = () => {
    void processCloudSyncQueue()
  }

  const onFocus = () => {
    void processCloudSyncQueue()
  }

  window.addEventListener('online', onOnline)
  window.addEventListener('focus', onFocus)
  listenersAttached = true

  void processCloudSyncQueue()
}
