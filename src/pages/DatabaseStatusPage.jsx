import { useCallback, useEffect, useMemo, useState } from 'react'
import useAppDialog from '../hooks/useAppDialog'
import {
  applyCloudPayloadToLocal,
  buildCloudLocalTraceReport,
  CLOUD_WRITE_ALLOWLIST,
  CLOUD_SYNC_STATUS_EVENT,
  forceUpsertCloudSnapshot,
  getCloudSyncStatus,
  isCloudEntityWriteAllowed,
  probeCloudConnection,
  processCloudSyncQueue,
} from '../utils/cloudSync'

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

const formatDateTime = (value) => {
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

const formatRelativeTime = (value) => {
  const parsed = new Date(value)
  const ts = parsed.getTime()
  if (Number.isNaN(ts)) return 'Sin registro'

  const diffSeconds = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (diffSeconds < 60) return `hace ${diffSeconds}s`

  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) return `hace ${diffMinutes}m`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `hace ${diffHours}h`

  const diffDays = Math.floor(diffHours / 24)
  return `hace ${diffDays}d`
}

const stableNormalize = (value) => {
  if (Array.isArray(value)) {
    const normalized = value.map((entry) => stableNormalize(entry))
    return [...normalized].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  }

  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort((a, b) => a.localeCompare(b))
      .reduce((acc, key) => {
        acc[key] = stableNormalize(value[key])
        return acc
      }, {})
  }

  return value
}

const toStableJson = (value) => {
  try {
    return JSON.stringify(stableNormalize(value))
  } catch {
    return ''
  }
}

const toShortHash = (value) => {
  const input = toStableJson(value)
  if (!input) return 'n/a'

  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(16).padStart(8, '0').slice(0, 8)
}

const findFirstDifferencePath = (leftValue, rightValue, path = 'root') => {
  if (Object.is(leftValue, rightValue)) return ''

  const leftIsArray = Array.isArray(leftValue)
  const rightIsArray = Array.isArray(rightValue)
  if (leftIsArray || rightIsArray) {
    if (!leftIsArray || !rightIsArray) return path
    if (leftValue.length !== rightValue.length) return `${path}.length`

    for (let index = 0; index < leftValue.length; index += 1) {
      const nextPath = findFirstDifferencePath(leftValue[index], rightValue[index], `${path}[${index}]`)
      if (nextPath) return nextPath
    }

    return ''
  }

  const leftIsObject = Boolean(leftValue && typeof leftValue === 'object')
  const rightIsObject = Boolean(rightValue && typeof rightValue === 'object')
  if (leftIsObject || rightIsObject) {
    if (!leftIsObject || !rightIsObject) return path

    const keys = [...new Set([...Object.keys(leftValue), ...Object.keys(rightValue)])].sort((a, b) => a.localeCompare(b))
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(leftValue, key)) return `${path}.${key}`
      if (!Object.prototype.hasOwnProperty.call(rightValue, key)) return `${path}.${key}`

      const nextPath = findFirstDifferencePath(leftValue[key], rightValue[key], `${path}.${key}`)
      if (nextPath) return nextPath
    }

    return ''
  }

  return path
}

function DatabaseStatusPage() {
  const [rows, setRows] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [busyAction, setBusyAction] = useState('')
  const [lastCheckedAt, setLastCheckedAt] = useState('')
  const [runtimeStatus, setRuntimeStatus] = useState(() => getCloudSyncStatus())

  const { dialogNode, appAlert, appConfirm } = useAppDialog()

  const rowsByEntity = useMemo(
    () => rows.reduce((acc, row) => {
      acc[String(row.entity)] = row
      return acc
    }, {}),
    [rows],
  )

  const diagnosticByEntity = useMemo(() => {
    return rows.reduce((acc, row) => {
      const localNormalized = stableNormalize(row.localPayload)
      const cloudNormalized = stableNormalize(row.cloudPayload)
      const firstDiffPath = row.isInSync
        ? ''
        : findFirstDifferencePath(localNormalized, cloudNormalized)

      acc[String(row.entity)] = {
        localHash: toShortHash(localNormalized),
        cloudHash: toShortHash(cloudNormalized),
        firstDiffPath,
      }

      return acc
    }, {})
  }, [rows])

  const handleCopyDiagnostic = async (row) => {
    const label = ENTITY_LABEL_MAP[row.entity] ?? row.entity
    const diagnostic = diagnosticByEntity[String(row.entity)] ?? {
      localHash: 'n/a',
      cloudHash: 'n/a',
      firstDiffPath: '',
    }

    const payload = [
      `Modulo: ${label}`,
      `Estado: ${row.isInSync ? 'OK' : 'Diferente'}`,
      `Registros local/nube: ${row.localCount}/${row.cloudCount}`,
      `Hash local: ${diagnostic.localHash}`,
      `Hash nube: ${diagnostic.cloudHash}`,
      `Primer campo distinto: ${diagnostic.firstDiffPath || 'n/a'}`,
      `Motivo: ${row.reason}`,
      `Fecha local: ${formatDateTime(row.localLatestAt)}`,
      `Fecha nube: ${formatDateTime(row.cloudUpdatedAt)}`,
    ].join('\n')

    try {
      await navigator.clipboard.writeText(payload)
      await appAlert('Diagnóstico copiado al portapapeles.')
    } catch {
      await appAlert('No se pudo copiar al portapapeles.')
    }
  }

  const refreshTrace = useCallback(async () => {
    setIsLoading(true)
    try {
      const trace = await buildCloudLocalTraceReport()
      const sortedRows = [...(Array.isArray(trace.rows) ? trace.rows : [])].sort((a, b) => {
        if (a.isInSync !== b.isInSync) return a.isInSync ? 1 : -1
        return String(ENTITY_LABEL_MAP[a.entity] ?? a.entity).localeCompare(String(ENTITY_LABEL_MAP[b.entity] ?? b.entity), 'es')
      })
      setRows(sortedRows)
      setLastCheckedAt(new Date().toISOString())
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await appAlert(`No se pudo revisar trazabilidad de base de datos: ${message}`)
    } finally {
      setRuntimeStatus(getCloudSyncStatus())
      setIsLoading(false)
    }
  }, [appAlert])

  useEffect(() => {
    void refreshTrace()
  }, [refreshTrace])

  useEffect(() => {
    const refreshRuntimeStatus = () => {
      setRuntimeStatus(getCloudSyncStatus())
    }

    window.addEventListener('online', refreshRuntimeStatus)
    window.addEventListener('offline', refreshRuntimeStatus)
    window.addEventListener('focus', refreshRuntimeStatus)
    window.addEventListener(CLOUD_SYNC_STATUS_EVENT, refreshRuntimeStatus)

    return () => {
      window.removeEventListener('online', refreshRuntimeStatus)
      window.removeEventListener('offline', refreshRuntimeStatus)
      window.removeEventListener('focus', refreshRuntimeStatus)
      window.removeEventListener(CLOUD_SYNC_STATUS_EVENT, refreshRuntimeStatus)
    }
  }, [])

  const handleRetryQueue = async () => {
    setBusyAction('retry-queue')
    try {
      const result = await processCloudSyncQueue()
      await refreshTrace()

      if (result?.hasError) {
        await appAlert(
          'Se intentó reintentar la cola, pero quedó al menos un error pendiente. ' +
          'Revisá el detalle en Sync Health.',
        )
      } else {
        await appAlert(`Se procesó la cola. Registros enviados: ${Number(result?.processedCount || 0)}.`)
      }
    } finally {
      setBusyAction('')
    }
  }

  const handleProbeCloud = async () => {
    setBusyAction('probe-cloud')
    try {
      const result = await probeCloudConnection()
      if (result.ok) {
        await appAlert('Conexión a nube OK. El cliente puede leer la tabla cloud_snapshots.')
      } else {
        await appAlert(
          `No se pudo validar conexión a nube.\nMotivo: ${result.reason}\nDetalle: ${result.message}`,
        )
      }
      setRuntimeStatus(getCloudSyncStatus())
    } finally {
      setBusyAction('')
    }
  }

  const handlePushLocalEntity = async (entity) => {
    const row = rowsByEntity[String(entity)]
    if (!row) return

    const confirmed = await appConfirm(
      `Vas a subir LOCAL a NUBE para ${ENTITY_LABEL_MAP[row.entity] ?? row.entity}.\n` +
      `Local: ${row.localCount} registro(s) | Nube: ${row.cloudCount} registro(s).\n` +
      `¿Confirmás sincronizar en esta dirección?`,
      'Subir local',
      'Cancelar',
    )

    if (!confirmed) return

    setBusyAction(`push-${row.entity}`)
    try {
      await forceUpsertCloudSnapshot(row.entity, row.localPayload ?? [])
      await refreshTrace()
      await appAlert('Nube actualizada correctamente con datos locales.')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await appAlert(`No se pudo subir ${ENTITY_LABEL_MAP[row.entity] ?? row.entity}: ${message}`)
    } finally {
      setBusyAction('')
    }
  }

  const handlePullCloudEntity = async (entity) => {
    const row = rowsByEntity[String(entity)]
    if (!row) return

    const confirmed = await appConfirm(
      `Vas a aplicar NUBE sobre LOCAL para ${ENTITY_LABEL_MAP[row.entity] ?? row.entity}.\n` +
      `Esto puede reemplazar datos locales actuales.\n` +
      `¿Deseás continuar?`,
      'Aplicar nube',
      'Cancelar',
    )

    if (!confirmed) return

    setBusyAction(`pull-${row.entity}`)
    try {
      const applied = applyCloudPayloadToLocal(row.entity, row.cloudPayload ?? [])
      if (!applied) {
        await appAlert('No se pudo escribir en almacenamiento local.')
        return
      }

      const shouldReload = await appConfirm(
        'Cambios de nube aplicados en local. ¿Querés recargar la app ahora para reflejar todo?',
        'Recargar ahora',
        'Recargar después',
      )

      if (shouldReload) {
        window.location.reload()
        return
      }

      await refreshTrace()
    } finally {
      setBusyAction('')
    }
  }

  const diffRows = rows.filter((row) => !row.isInSync)
  const cloudWritableDiffRows = diffRows.filter((row) => isCloudEntityWriteAllowed(row.entity))

  const handlePushAllDifferences = async () => {
    if (cloudWritableDiffRows.length === 0) {
      await appAlert('No hay diferencias pendientes para sincronizar.')
      return
    }

    const confirmed = await appConfirm(
      `Se subirán ${cloudWritableDiffRows.length} módulo(s) permitidos (${CLOUD_WRITE_ALLOWLIST.join(', ')}) desde LOCAL hacia NUBE. ¿Deseás continuar?`,
      'Sincronizar todo',
      'Cancelar',
    )
    if (!confirmed) return

    setBusyAction('push-all')
    try {
      for (const row of cloudWritableDiffRows) {
        await forceUpsertCloudSnapshot(row.entity, row.localPayload ?? [])
      }
      await refreshTrace()
      await appAlert('Sincronización completa: la nube fue actualizada desde local para entidades permitidas.')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await appAlert(`Error al sincronizar todo: ${message}`)
    } finally {
      setBusyAction('')
    }
  }

  const handleReconcileOrders = async () => {
    const ordersRow = rowsByEntity.orders
    if (!ordersRow) {
      await appAlert('No se encontró la entidad Pedidos en el reporte actual.')
      return
    }

    if (ordersRow.isInSync) {
      await appAlert('Pedidos ya está sincronizado entre Local y Nube.')
      return
    }

    const localTs = new Date(ordersRow.localLatestAt).getTime()
    const cloudTs = new Date(ordersRow.cloudUpdatedAt).getTime()
    const hasLocalTs = Number.isFinite(localTs) && localTs > 0
    const hasCloudTs = Number.isFinite(cloudTs) && cloudTs > 0

    // Regla automática segura:
    // - Si nube es más nueva o empata: aplicar nube sobre local.
    // - Si local es más nueva: subir local a nube.
    // - Si no hay fechas válidas: priorizar nube por consistencia operativa acordada.
    const shouldApplyCloudToLocal =
      !hasLocalTs || !hasCloudTs
        ? true
        : cloudTs >= localTs

    const strategyLabel = shouldApplyCloudToLocal
      ? 'Nube a Local'
      : 'Local a Nube'

    const confirmed = await appConfirm(
      `Se detectó diferencia en Pedidos.\n` +
      `Estrategia sugerida: ${strategyLabel}.\n` +
      `Local: ${ordersRow.localCount} | Nube: ${ordersRow.cloudCount}.\n` +
      `¿Querés ejecutar reconciliación automática ahora?`,
      'Reconciliar ahora',
      'Cancelar',
    )
    if (!confirmed) return

    setBusyAction('reconcile-orders')
    try {
      if (shouldApplyCloudToLocal) {
        const applied = applyCloudPayloadToLocal('orders', ordersRow.cloudPayload ?? [])
        if (!applied) {
          await appAlert('No se pudo aplicar Nube sobre Local para Pedidos.')
          return
        }

        await appAlert(
          'Pedidos reconciliado aplicando Nube sobre Local. La app se recargará para reflejar cambios.',
        )
        window.location.reload()
        return
      }

      await forceUpsertCloudSnapshot('orders', ordersRow.localPayload ?? [])
      await refreshTrace()
      await appAlert('Pedidos reconciliado subiendo Local hacia Nube correctamente.')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await appAlert(`No se pudo reconciliar Pedidos: ${message}`)
    } finally {
      setBusyAction('')
    }
  }

  const connectionPillClass = !runtimeStatus.configured
    ? 'db-connection-pill db-connection-pill-neutral'
    : !runtimeStatus.online
      ? 'db-connection-pill db-connection-pill-bad'
      : runtimeStatus.pendingCount > 0 || runtimeStatus.processing
        ? 'db-connection-pill db-connection-pill-warn'
        : 'db-connection-pill db-connection-pill-good'

  const connectionLabel = !runtimeStatus.configured
    ? 'Nube no configurada'
    : !runtimeStatus.online
      ? 'Sin internet'
      : runtimeStatus.pendingCount > 0 || runtimeStatus.processing
        ? `Sincronizando (${runtimeStatus.pendingCount} pendiente/s)`
        : 'Conectado y sincronizado'

  const syncStateLabel = !runtimeStatus.configured
    ? 'OK (Local)'
    : !runtimeStatus.online
      ? 'Pendiente'
      : runtimeStatus.processing && runtimeStatus.failedAttempts > 0
        ? 'Reintentando...'
        : runtimeStatus.processing
          ? 'Sincronizando...'
          : runtimeStatus.pendingCount > 0
            ? 'Pendiente'
            : runtimeStatus.lastError
              ? 'Error requiere atencion'
              : 'OK'

  return (
    <section className="page-section">
      <header className="page-header db-page-header">
        <div>
          <h2>Base de Datos y Trazabilidad</h2>
          <p>
            Vista de control entre Local y Nube para validar estabilidad, diferencias y dirección de sincronización.
          </p>
        </div>
        <span className={connectionPillClass}>{connectionLabel}</span>
      </header>

      <section className="card-block db-actions-row">
        <button
          type="button"
          className="secondary-btn"
          onClick={() => { void refreshTrace() }}
          disabled={isLoading || busyAction !== ''}
        >
          {isLoading ? 'Actualizando...' : 'Actualizar estado'}
        </button>
        <button
          type="button"
          className="secondary-btn"
          onClick={() => { void handleRetryQueue() }}
          disabled={busyAction !== ''}
        >
          Reintentar cola
        </button>
        <button
          type="button"
          className="secondary-btn"
          onClick={() => { void handleProbeCloud() }}
          disabled={busyAction !== ''}
        >
          {busyAction === 'probe-cloud' ? 'Probando...' : 'Probar conexión nube'}
        </button>
        <button
          type="button"
          className="primary-btn"
          onClick={() => { void handlePushAllDifferences() }}
          disabled={busyAction !== '' || cloudWritableDiffRows.length === 0}
        >
          Sincronizar diferencias (Local a Nube)
        </button>
        <button
          type="button"
          className="primary-btn"
          onClick={() => { void handleReconcileOrders() }}
          disabled={busyAction !== '' || !rowsByEntity.orders || rowsByEntity.orders.isInSync}
        >
          {busyAction === 'reconcile-orders' ? 'Reconciliando Pedidos...' : 'Reconciliar Pedidos'}
        </button>
        <span className="db-last-check">
          Última revisión: {lastCheckedAt ? formatDateTime(lastCheckedAt) : 'Sin revisar'}
        </span>
      </section>

      <section className="card-block db-health-grid" aria-live="polite">
        <article className="db-health-item">
          <small>Estado Sync</small>
          <strong>{syncStateLabel}</strong>
        </article>
        <article className="db-health-item">
          <small>Pendientes</small>
          <strong>{runtimeStatus.pendingCount}</strong>
        </article>
        <article className="db-health-item">
          <small>Pico hoy</small>
          <strong>{runtimeStatus.queuePeakToday}</strong>
        </article>
        <article className="db-health-item">
          <small>Ultimo intento</small>
          <strong>{formatRelativeTime(runtimeStatus.lastAttemptAt)}</strong>
        </article>
        <article className="db-health-item">
          <small>Ultimo OK</small>
          <strong>{formatRelativeTime(runtimeStatus.lastSuccessAt)}</strong>
        </article>
      </section>

      {runtimeStatus.lastError && (
        <section className="card-block db-runtime-alert" role="alert">
          <strong>Último error de sincronización:</strong>
          <p>{runtimeStatus.lastError}</p>
          <small>
            Entidad: {runtimeStatus.failedEntity || 'N/D'} | Intentos: {runtimeStatus.failedAttempts} | En cola desde: {formatDateTime(runtimeStatus.queuedAt)}
          </small>
        </section>
      )}

      <section className="card-block db-table-wrap">
        <table className="db-trace-table">
          <thead>
            <tr>
              <th>Módulo</th>
              <th>Estado</th>
              <th>Local</th>
              <th>Nube</th>
              <th>Fechas</th>
              <th>Motivo</th>
              <th>Diagnóstico</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const diagnostic = diagnosticByEntity[String(row.entity)] ?? {
                localHash: 'n/a',
                cloudHash: 'n/a',
                firstDiffPath: '',
              }

              const canPushToCloud = isCloudEntityWriteAllowed(row.entity)
              const statusClass = row.isInSync
                ? 'db-sync-pill db-sync-pill-good'
                : row.cloudCount === 0 || row.localCount === 0
                  ? 'db-sync-pill db-sync-pill-warn'
                  : 'db-sync-pill db-sync-pill-bad'

              const statusLabel = row.isInSync
                ? 'OK'
                : row.cloudCount === 0 || row.localCount === 0
                  ? 'Parcial'
                  : 'Diferente'

              return (
                <tr key={row.entity}>
                  <td>{ENTITY_LABEL_MAP[row.entity] ?? row.entity}</td>
                  <td><span className={statusClass}>{statusLabel}</span></td>
                  <td>{row.localCount}</td>
                  <td>{row.cloudCount}</td>
                  <td>
                    <div className="db-dates-cell">
                      <small>Local: {formatDateTime(row.localLatestAt)}</small>
                      <small>Nube: {formatDateTime(row.cloudUpdatedAt)}</small>
                    </div>
                  </td>
                  <td>{row.reason}</td>
                  <td>
                    <div className="db-diagnostic-cell">
                      <small>Hash L/N: {diagnostic.localHash} / {diagnostic.cloudHash}</small>
                      <small>Primer diff: {diagnostic.firstDiffPath || 'n/a'}</small>
                      <button
                        type="button"
                        className="db-copy-btn"
                        onClick={() => { void handleCopyDiagnostic(row) }}
                        disabled={busyAction !== ''}
                      >
                        Copiar diag
                      </button>
                    </div>
                  </td>
                  <td>
                    <div className="db-row-actions">
                      <button
                        type="button"
                        className="secondary-btn"
                        disabled={busyAction !== '' || row.isInSync || !canPushToCloud}
                        onClick={() => { void handlePushLocalEntity(row.entity) }}
                        title={canPushToCloud ? '' : `No permitido en etapa 1. Permitidas: ${CLOUD_WRITE_ALLOWLIST.join(', ')}`}
                      >
                        {busyAction === `push-${row.entity}` ? 'Subiendo...' : 'Local a Nube'}
                      </button>
                      <button
                        type="button"
                        className="secondary-btn"
                        disabled={busyAction !== '' || row.isInSync}
                        onClick={() => { void handlePullCloudEntity(row.entity) }}
                      >
                        {busyAction === `pull-${row.entity}` ? 'Aplicando...' : 'Nube a Local'}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="db-empty-row">No hay datos para mostrar todavía.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {dialogNode}
    </section>
  )
}

export default DatabaseStatusPage
