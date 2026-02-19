function ClosingOverlay({ visible, message }) {
  if (!visible) return null

  return (
    <div className="closing-overlay" role="status" aria-live="polite">
      <div className="closing-overlay-card">
        <p>{message || '🔄 Guardando datos...'}</p>
      </div>
    </div>
  )
}

export default ClosingOverlay
