function ClosingOverlay({ visible, message }) {
  return (
    <div
      className="closing-overlay"
      style={{ pointerEvents: visible ? 'auto' : 'none' }}
      role="status"
      aria-live="polite"
    >
      <div className="closing-overlay-card">
        <p>{message || '🔄 Guardando datos...'}</p>
      </div>
    </div>
  )
}

export default ClosingOverlay
