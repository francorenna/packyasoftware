import { useState } from 'react'

const deliveryTypeOptions = ['Retira en fábrica', 'Entrega propia', 'Envío por encomienda']

function ConfirmDeliveryModal({
  initialDeliveryType,
  initialDeliveredBy,
  initialDeliveryNote,
  onConfirm,
  onCancel,
}) {
  const [deliveryType, setDeliveryType] = useState(String(initialDeliveryType ?? '').trim())
  const [deliveredBy, setDeliveredBy] = useState(String(initialDeliveredBy ?? '').trim())
  const [deliveryNote, setDeliveryNote] = useState(String(initialDeliveryNote ?? '').trim())
  const [errors, setErrors] = useState({})

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
      <h4>Confirmar entrega</h4>

      <label>
        Tipo de entrega
        <select
          value={deliveryType}
          onChange={(event) => setDeliveryType(event.target.value)}
          autoFocus
        >
          <option value="">Seleccionar tipo</option>
          {deliveryTypeOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      {errors.deliveryType && <p className="payment-error">{errors.deliveryType}</p>}

      <label>
        Entregado por
        <input
          type="text"
          value={deliveredBy}
          onChange={(event) => setDeliveredBy(event.target.value)}
          placeholder="Nombre de quien entrega"
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