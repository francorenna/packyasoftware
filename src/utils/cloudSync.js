import { getSupabaseClient, isSupabaseConfigured } from '../integrations/supabaseClient'

const CLOUD_SYNC_QUEUE_KEY = 'packya_cloud_sync_queue'
const CLOUD_SYNC_HASH_BY_ENTITY_KEY = 'packya_cloud_sync_hash_by_entity'
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
}

const KNOWN_ENTITIES = Object.keys(ENTITY_STORAGE_KEY_MAP)

let listenersAttached = false
let isProcessingQueue = false

const MAX_SYNC_ERROR_LENGTH = 280

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

const isOnline = () => {
  if (!isBrowser()) return false
  return window.navigator.onLine !== false
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

const normalizeForHash = (value) => {
  if (Array.isArray(value)) {
    const normalizedEntries = value.map((entry) => normalizeForHash(entry))

    const canSortById = normalizedEntries.every(
      (entry) => entry && typeof entry === 'object' && !Array.isArray(entry) && Object.prototype.hasOwnProperty.call(entry, 'id'),
    )

    if (canSortById) {
      return [...normalizedEntries].sort((a, b) => String(a.id).localeCompare(String(b.id)))
    }

    return normalizedEntries
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

const toStableHash = (value) => {
  try {
    return JSON.stringify(normalizeForHash(value))
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
  const localHash = toStableHash(localPayload)
  const cloudHash = toStableHash(cloudPayload)
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

  const payloadHash = toStableHash(payload)
  const hashByEntity = loadHashByEntity()

  if (payloadHash && hashByEntity[entityKey] === payloadHash) {
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
  emitStatusChange()
  return true
}

export const getCloudSyncStatus = () => {
  const pendingQueue = loadQueue()
  const headJob = pendingQueue[0] ?? null

  return {
    configured: isSupabaseConfigured,
    online: isOnline(),
    pendingCount: pendingQueue.length,
    processing: isProcessingQueue,
    failedEntity: headJob ? String(headJob.entity ?? '') : '',
    failedAttempts: Number(headJob?.attempts || 0),
    lastError: String(headJob?.lastError ?? ''),
    queuedAt: String(headJob?.queuedAt ?? ''),
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
  await pushSnapshotJob({ entity: entityKey, payload })
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
    return
  }
  if (isProcessingQueue) return

  isProcessingQueue = true
  emitStatusChange()

  try {
    let queue = loadQueue()
    while (queue.length > 0) {
      const current = queue[0]

      try {
        await pushSnapshotJob(current)
        queue.shift()
        saveQueue(queue)
      } catch (error) {
        const message = toCloudErrorText(error)
        queue[0] = {
          ...current,
          attempts: Number(current?.attempts || 0) + 1,
          lastError: message,
        }
        saveQueue(queue)
        reportCloudError(`[cloud-sync] Error subiendo entidad ${String(current?.entity ?? 'unknown')}`, error)
        emitStatusChange()
        break
      }
    }
  } finally {
    isProcessingQueue = false
    emitStatusChange()
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
