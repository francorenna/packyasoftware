import { useEffect } from 'react'

function SaveToast({ visible, message = '✔ Guardado correctamente', duration = 1500, onClose }) {
  useEffect(() => {
    if (!visible) return undefined

    const timeoutId = window.setTimeout(() => {
      onClose?.()
    }, duration)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [visible, duration, onClose])

  if (!visible) return null

  return (
    <div className="save-toast" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  )
}

export default SaveToast
