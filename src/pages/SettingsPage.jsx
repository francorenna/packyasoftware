import { useRef, useState } from 'react'
import {
  exportBackup,
  getCurrentBackupCounts,
  importBackup,
  readBackupPreview,
} from '../utils/backup'

const formatDate = (value) => {
  if (!value) return 'Sin fecha'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Sin fecha'
  return parsed.toLocaleString('es-AR')
}

const formatDelta = (next, current) => {
  const delta = Number(next || 0) - Number(current || 0)
  if (delta > 0) return `+${delta}`
  return String(delta)
}

const getDeltaClassName = (next, current) => {
  const delta = Number(next || 0) - Number(current || 0)
  if (delta > 0) return 'finance-result-positive'
  if (delta < 0) return 'finance-result-negative'
  return 'muted-label'
}

function SettingsPage() {
  const fileInputRef = useRef(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [backupPreview, setBackupPreview] = useState(null)
  const currentCounts = getCurrentBackupCounts()

  const handleExport = () => {
    const fileName = exportBackup()
    window.alert(`Respaldo exportado correctamente: ${fileName}`)
  }

  const handleClickImport = () => {
    fileInputRef.current?.click()
  }

  const handleImport = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const preview = await readBackupPreview(file)
      setSelectedFile(file)
      setBackupPreview(preview)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo importar el respaldo.'
      window.alert(message)
      setSelectedFile(null)
      setBackupPreview(null)
    }
  }

  const handleConfirmRestore = async () => {
    if (!selectedFile) return

    try {
      await importBackup(selectedFile)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo importar el respaldo.'
      window.alert(message)
    }
  }

  const handleCancelRestore = () => {
    setSelectedFile(null)
    setBackupPreview(null)
  }

  // --- System reset UI state & handlers ---
  const [resetModalOpen, setResetModalOpen] = useState(false)
  const [resetTargetKey, setResetTargetKey] = useState('')
  const [resetInput, setResetInput] = useState('')
  const [fullResetOpen, setFullResetOpen] = useState(false)
  const [fullResetInput, setFullResetInput] = useState('')

  const KNOWN_KEYS = {
    orders: 'packya_orders',
    purchases: 'packya_purchases',
    products: 'packya_products',
    clients: 'packya_clients',
    suppliers: 'packya_suppliers',
    quotes: 'packya_quotes',
  }

  const openResetModal = (keyName) => {
    setResetTargetKey(keyName)
    setResetInput('')
    setResetModalOpen(true)
  }

  const confirmResetKey = () => {
    // requires exact OK in uppercase
    if (resetInput !== 'OK') return
    const storageKey = KNOWN_KEYS[resetTargetKey]
    if (!storageKey) return

    try {
      localStorage.setItem(storageKey, JSON.stringify([]))
      window.location.reload()
      return
    } catch {
      window.alert('No se pudo eliminar la clave. Revisá permisos del navegador.')
    }

    setResetModalOpen(false)
    setResetTargetKey('')
    setResetInput('')
  }

  const confirmFullReset = () => {
    if (fullResetInput !== 'BORRAR TODO') return

    const keysToReset = Object.values(KNOWN_KEYS)
    try {
      keysToReset.forEach((k) => localStorage.setItem(k, JSON.stringify([])))
      // intentionally do NOT remove packya_storage_version or any other keys
      window.location.reload()
      return
    } catch {
      window.alert('Error al aplicar reinicio completo.')
    }

    setFullResetOpen(false)
    setFullResetInput('')
  }

  return (
    <section className="page-section">
      <header className="page-header">
        <h2>Configuración y Respaldo</h2>
        <p>Exportá e importá un respaldo completo del sistema en formato JSON.</p>
      </header>

      <section className="card-block">
        <div className="card-head">
          <h3>Respaldo de datos</h3>
        </div>

        <div className="product-actions">
          <button type="button" className="secondary-btn" onClick={handleExport}>
            💾 Exportar respaldo
          </button>
          <button type="button" className="primary-btn" onClick={handleClickImport}>
            📥 Importar respaldo
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImport}
            style={{ display: 'none' }}
          />
        </div>

        {backupPreview && (
          <div className="dashboard-recent">
            <div className="card-head">
              <h3>Previsualización del respaldo</h3>
            </div>

            <div className="order-summary">
              <p>
                <span>Versión</span>
                <strong>{backupPreview.version}</strong>
              </p>
              <p>
                <span>Fecha de exportación</span>
                <strong>{formatDate(backupPreview.exportDate)}</strong>
              </p>
              <p>
                <span>Pedidos (actual → respaldo)</span>
                <strong>
                  {currentCounts.orders} → {backupPreview.counts.orders} (
                  <span className={getDeltaClassName(backupPreview.counts.orders, currentCounts.orders)}>
                    {formatDelta(backupPreview.counts.orders, currentCounts.orders)}
                  </span>
                  )
                </strong>
              </p>
              <p>
                <span>Productos (actual → respaldo)</span>
                <strong>
                  {currentCounts.products} → {backupPreview.counts.products} (
                  <span className={getDeltaClassName(backupPreview.counts.products, currentCounts.products)}>
                    {formatDelta(backupPreview.counts.products, currentCounts.products)}
                  </span>
                  )
                </strong>
              </p>
              <p>
                <span>Clientes (actual → respaldo)</span>
                <strong>
                  {currentCounts.clients} → {backupPreview.counts.clients} (
                  <span className={getDeltaClassName(backupPreview.counts.clients, currentCounts.clients)}>
                    {formatDelta(backupPreview.counts.clients, currentCounts.clients)}
                  </span>
                  )
                </strong>
              </p>
              <p>
                <span>Proveedores (actual → respaldo)</span>
                <strong>
                  {currentCounts.suppliers} → {backupPreview.counts.suppliers} (
                  <span className={getDeltaClassName(backupPreview.counts.suppliers, currentCounts.suppliers)}>
                    {formatDelta(backupPreview.counts.suppliers, currentCounts.suppliers)}
                  </span>
                  )
                </strong>
              </p>
              <p>
                <span>Compras (actual → respaldo)</span>
                <strong>
                  {currentCounts.purchases} → {backupPreview.counts.purchases} (
                  <span className={getDeltaClassName(backupPreview.counts.purchases, currentCounts.purchases)}>
                    {formatDelta(backupPreview.counts.purchases, currentCounts.purchases)}
                  </span>
                  )
                </strong>
              </p>
              <p>
                <span>Presupuestos (actual → respaldo)</span>
                <strong>
                  {currentCounts.quotes} → {backupPreview.counts.quotes} (
                  <span className={getDeltaClassName(backupPreview.counts.quotes, currentCounts.quotes)}>
                    {formatDelta(backupPreview.counts.quotes, currentCounts.quotes)}
                  </span>
                  )
                </strong>
              </p>
            </div>

            <div className="product-actions">
              <button type="button" className="secondary-btn" onClick={handleCancelRestore}>
                Cancelar
              </button>
              <button type="button" className="primary-btn" onClick={handleConfirmRestore}>
                Restaurar respaldo
              </button>
            </div>
          </div>
        )}

        <section className="card-block">
          <div className="card-head">
            <h3>Reinicio del Sistema</h3>
          </div>

          <p className="payment-helper">Se recomienda exportar un backup antes de continuar.</p>

          <div className="product-actions">
            <button type="button" className="secondary-btn" onClick={() => openResetModal('orders')}>
              Reiniciar Pedidos
            </button>
            <button type="button" className="secondary-btn" onClick={() => openResetModal('purchases')}>
              Reiniciar Compras
            </button>
            <button type="button" className="secondary-btn" onClick={() => openResetModal('products')}>
              Reiniciar Productos
            </button>
            <button type="button" className="secondary-btn" onClick={() => openResetModal('clients')}>
              Reiniciar Clientes
            </button>
            <button type="button" className="secondary-btn" onClick={() => openResetModal('suppliers')}>
              Reiniciar Proveedores
            </button>
            <button type="button" className="secondary-btn" onClick={() => openResetModal('quotes')}>
              Reiniciar Presupuestos
            </button>
          </div>

          <div style={{ marginTop: 12 }}>
            <button type="button" className="danger-ghost-btn" onClick={() => { setFullResetOpen(true); setFullResetInput('') }}>
              Reinicio Completo del Sistema
            </button>
          </div>

          {/* Reset modal (single-key) */}
          {resetModalOpen && (
            <div className="modal-overlay">
              <div className="modal-card">
                <h4>Confirmar reinicio</h4>
                <p className="payment-error">Se recomienda exportar un backup antes de continuar.</p>
                <p>Escribe exactamente <strong>OK</strong> para confirmar la eliminación de la clave.</p>
                <input type="text" value={resetInput} onChange={(e) => setResetInput(e.target.value)} />
                <div style={{ marginTop: 10 }}>
                  <button className="secondary-btn" onClick={() => setResetModalOpen(false)}>Cancelar</button>
                  <button className="danger-ghost-btn" onClick={confirmResetKey} disabled={resetInput !== 'OK'}>Confirmar</button>
                </div>
              </div>
            </div>
          )}

          {/* Full reset modal */}
          {fullResetOpen && (
            <div className="modal-overlay">
              <div className="modal-card">
                <h4 style={{ color: '#b91c1c' }}>REINICIO COMPLETO — ADVERTENCIA</h4>
                <p className="payment-error">Esto eliminará las claves principales del sistema. No se podrán recuperar a menos que tengas un respaldo.</p>
                <p>Escribe exactamente <strong>BORRAR TODO</strong> para confirmar.</p>
                <input type="text" value={fullResetInput} onChange={(e) => setFullResetInput(e.target.value)} />
                <div style={{ marginTop: 10 }}>
                  <button className="secondary-btn" onClick={() => setFullResetOpen(false)}>Cancelar</button>
                  <button className="danger-ghost-btn" onClick={confirmFullReset} disabled={fullResetInput !== 'BORRAR TODO'}>BORRAR TODO</button>
                </div>
              </div>
            </div>
          )}

        </section>
      </section>
    </section>
  )
}

export default SettingsPage