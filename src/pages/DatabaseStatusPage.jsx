import { useCallback, useEffect, useMemo, useState } from 'react'
import useAppDialog from '../hooks/useAppDialog'
import {
  applyCloudPayloadToLocal,
  buildCloudLocalTraceReport,
  CLOUD_SYNC_STATUS_EVENT,
  forceUpsertCloudSnapshot,
  getCloudSyncStatus,
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
      await processCloudSyncQueue()
      await refreshTrace()
      await appAlert('Se procesó la cola de sincronización.')
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

  const handlePushAllDifferences = async () => {
    if (diffRows.length === 0) {
      await appAlert('No hay diferencias pendientes para sincronizar.')
      return
    }

    const confirmed = await appConfirm(
      `Se subirán ${diffRows.length} módulo(s) desde LOCAL hacia NUBE. ¿Deseás continuar?`,
      'Sincronizar todo',
      'Cancelar',
    )
    if (!confirmed) return

    setBusyAction('push-all')
    try {
      for (const row of diffRows) {
        await forceUpsertCloudSnapshot(row.entity, row.localPayload ?? [])
      }
      await refreshTrace()
      await appAlert('Sincronización completa: la nube fue actualizada desde local.')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await appAlert(`Error al sincronizar todo: ${message}`)
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
          disabled={busyAction !== '' || diffRows.length === 0}
        >
          Sincronizar diferencias (Local a Nube)
        </button>
        <span className="db-last-check">
          Última revisión: {lastCheckedAt ? formatDateTime(lastCheckedAt) : 'Sin revisar'}
        </span>
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
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
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
                    <div className="db-row-actions">
                      <button
                        type="button"
                        className="secondary-btn"
                        disabled={busyAction !== '' || row.isInSync}
                        onClick={() => { void handlePushLocalEntity(row.entity) }}
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
                <td colSpan={7} className="db-empty-row">No hay datos para mostrar todavía.</td>
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
