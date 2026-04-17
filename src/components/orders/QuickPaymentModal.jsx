import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { formatOrderId } from '../../utils/orders'

const paymentMethods = ['Efectivo', 'Transferencia', 'MercadoPago']

const readModalDebugFlag = () => {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false

  try {
    return window.localStorage.getItem('packya_modal_debug') === '1'
  } catch {
    return false
  }
}

function QuickPaymentModal({
  isOpen,
  order,
  summary,
  onClose,
  onConfirm,
  onSendReminder,
  formatCurrency,
}) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState(paymentMethods[0])
  const amountInputRef = useRef(null)

  const orderId = String(order?.id ?? '')
  const totalPaid = Number(summary?.totalPaid || 0)
  const remainingDebt = Number(summary?.remainingDebt || 0)

  const enteredAmount = Number(amount)
  const hasAmount = amount !== ''
  const invalidAmount =
    Number.isNaN(enteredAmount) || enteredAmount <= 0 || enteredAmount > remainingDebt

  const shouldTrace = readModalDebugFlag()

  useEffect(() => {
    if (!isOpen) return

    let cancelled = false

    void (async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 30))
      if (cancelled) return

      let retryCount = 0
      const maxRetries = 8

      const tryFocus = () => {
        if (cancelled) return
        const input = amountInputRef.current
        if (!input) return

        input.focus({ preventScroll: true })

        if (document.activeElement === input) {
          input.select()
          return
        }

        retryCount += 1
        if (retryCount < maxRetries) {
          window.setTimeout(tryFocus, 40)
        }
      }

      tryFocus()
    })()

    return () => {
      cancelled = true
    }
  }, [isOpen, orderId])

  useEffect(() => {
    if (!shouldTrace || !isOpen) return
    console.log('[quick-payment-modal] render', {
      orderId,
      amount,
      method,
    })
  }, [amount, isOpen, method, orderId, shouldTrace])

  if (!isOpen || !order || !summary) return null

  const handleConfirm = () => {
    if (remainingDebt <= 0 || invalidAmount) return

    onConfirm?.({
      amount: enteredAmount,
      method,
    })
  }

  const modal = (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Cobrar saldo del pedido"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose?.()
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose?.()
        }
      }}
    >
      <div
        className="modal-card quick-payment-modal-shell"
        onClick={(event) => event.stopPropagation()}
      >
        <h4 className="confirm-delivery-modal-title">
          Cobrar saldo de {formatOrderId(orderId)}
        </h4>
        <div className="quick-payment-summary-grid">
          <p>
            <span>Cliente</span>
            <strong>{String(order.clientName ?? order.client ?? 'Sin cliente')}</strong>
          </p>
          <p>
            <span>Total pagado</span>
            <strong>{formatCurrency(totalPaid)}</strong>
          </p>
          <p>
            <span>Deuda restante</span>
            <strong>{formatCurrency(remainingDebt)}</strong>
          </p>
        </div>

        <div className="payment-form">
          <div className="payment-form-row">
            <input
              ref={amountInputRef}
              type="number"
              min="0"
              max={remainingDebt}
              step="1"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="Monto"
              autoFocus
            />
            <select
              value={method}
              onChange={(event) => setMethod(event.target.value)}
            >
              {paymentMethods.map((paymentMethod) => (
                <option key={paymentMethod} value={paymentMethod}>
                  {paymentMethod}
                </option>
              ))}
            </select>
          </div>
          <div className="payment-helper-row">
            <p className="payment-helper">Deuda restante: {formatCurrency(remainingDebt)}</p>
            <button
              type="button"
              className="quick-fill-btn"
              onClick={() => setAmount(String(remainingDebt))}
              disabled={remainingDebt <= 0}
            >
              Completar deuda
            </button>
          </div>
          {hasAmount && invalidAmount && (
            <p className="payment-error">El monto no puede superar la deuda restante.</p>
          )}
        </div>

        <div className="confirm-delivery-actions">
          <button
            type="button"
            className="secondary-btn"
            onClick={() => onSendReminder?.(order, remainingDebt)}
          >
            📩 Recordar cliente
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={handleConfirm}
            disabled={remainingDebt <= 0 || invalidAmount}
          >
            Agregar pago
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => onClose?.()}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return modal

  return createPortal(modal, document.body)
}

export default QuickPaymentModal
