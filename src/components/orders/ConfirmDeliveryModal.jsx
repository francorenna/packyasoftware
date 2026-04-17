import { useCallback, useEffect, useRef, useState } from 'react'

const deliveryTypeOptions = ['Retira en fábrica', 'Entrega propia', 'Envío por encomienda']

const shouldTraceModalDebug = () => {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false

  try {
    return window.localStorage.getItem('packya_modal_debug') === '1'
  } catch {
    return false
  }
}

function ConfirmDeliveryModal({
  initialDeliveryType,
  initialDeliveredBy,
  initialDeliveryNote,
  showTitle = true,
  onConfirm,
  onCancel,
}) {
  const [deliveryType, setDeliveryType] = useState(String(initialDeliveryType ?? '').trim())
  const [deliveredBy, setDeliveredBy] = useState(String(initialDeliveredBy ?? '').trim())
  const [deliveryNote, setDeliveryNote] = useState(String(initialDeliveryNote ?? '').trim())
  const [errors, setErrors] = useState({})
  const deliveredByInputRef = useRef(null)

  const focusDeliveredByInput = useCallback(async () => {
    // Retry DOM focus briefly in case the modal just mounted.
    await new Promise((resolve) => window.setTimeout(resolve, 30))

    let retries = 0
    const maxRetries = 8

    const tryFocus = () => {
      const input = deliveredByInputRef.current
      if (!input) return

      input.focus({ preventScroll: true })

      if (document.activeElement === input) {
        input.select()
        return
      }

      retries += 1
      if (retries < maxRetries) {
        window.setTimeout(tryFocus, 30)
      }
    }

    tryFocus()
  }, [])

  useEffect(() => {
    const focusTimeoutId = window.setTimeout(() => {
      void focusDeliveredByInput()
    }, 10)

    return () => {
      window.clearTimeout(focusTimeoutId)
    }
  }, [focusDeliveredByInput])

  useEffect(() => {
    if (!shouldTraceModalDebug()) return

    console.log('[confirm-delivery-modal] render', {
      deliveryType,
      deliveredBy,
      deliveryNoteLength: String(deliveryNote ?? '').length,
    })
  }, [deliveryNote, deliveredBy, deliveryType])

  const handleConfirm = () => {
    const nextErrors = {}

    if (!deliveryType) {
      nextErrors.deliveryType = 'Seleccioná un tipo de entrega.'
    }

    if (!String(deliveredBy ?? '').trim()) {
      nextErrors.deliveredBy = 'Completá quién entregó el pedido.'
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    onConfirm?.({
      deliveryType: String(deliveryType).trim(),
      deliveredBy: String(deliveredBy).trim(),
      deliveryNote: String(deliveryNote ?? '').trim(),
    })
  }

  return (
    <div className="confirm-delivery-modal" role="dialog" aria-label="Confirmar entrega">
      {showTitle && <h4>Confirmar entrega</h4>}

      <label>
        Tipo de entrega
        <div className="confirm-delivery-options" role="radiogroup" aria-label="Tipo de entrega">
          {deliveryTypeOptions.map((option) => {
            const isSelected = deliveryType === option

            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={`confirm-delivery-option-btn ${isSelected ? 'confirm-delivery-option-btn-active' : ''}`}
                onClick={() => {
                  setDeliveryType(option)
                  focusDeliveredByInput()
                }}
              >
                {option}
              </button>
            )
          })}
        </div>
      </label>
      {errors.deliveryType && <p className="payment-error">{errors.deliveryType}</p>}

      <label>
        Entregado por
        <input
          ref={deliveredByInputRef}
          type="text"
          value={deliveredBy}
          onChange={(event) => setDeliveredBy(event.target.value)}
          placeholder="Nombre de quien entrega"
          autoFocus
        />
      </label>
      {errors.deliveredBy && <p className="payment-error">{errors.deliveredBy}</p>}

      <label>
        Observaciones
        <textarea
          value={deliveryNote}
          onChange={(event) => setDeliveryNote(event.target.value)}
          placeholder="Observaciones de entrega (opcional)"
          rows={3}
        />
      </label>

      <div className="confirm-delivery-actions">
        <button type="button" className="primary-btn" onClick={handleConfirm}>
          Confirmar entrega
        </button>
        <button type="button" className="secondary-btn" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

export default ConfirmDeliveryModal