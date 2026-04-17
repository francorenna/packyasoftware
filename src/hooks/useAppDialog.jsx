import { useCallback, useState } from 'react'
import AppDialog from '../components/AppDialog'

/**
 * useAppDialog — reemplaza window.alert y window.confirm nativos.
 *
 * Uso:
 *   const { dialogNode, appAlert, appConfirm } = useAppDialog()
 *   // Montá {dialogNode} en el JSX del componente.
 *   await appAlert('Mensaje')
 *   const ok = await appConfirm('¿Estás seguro?')
 */
function useAppDialog() {
  const [dialog, setDialog] = useState(null)

  const closeDialog = useCallback(() => setDialog(null), [])

  const appAlert = useCallback((message, confirmLabel = 'Aceptar') => {
    return new Promise((resolve) => {
      setDialog({
        type: 'alert',
        message,
        confirmLabel,
        onConfirm: () => { closeDialog(); resolve() },
        onCancel: null,
      })
    })
  }, [closeDialog])

  const appConfirm = useCallback((message, confirmLabel = 'Aceptar', cancelLabel = 'Cancelar') => {
    return new Promise((resolve) => {
      setDialog({
        type: 'confirm',
        message,
        confirmLabel,
        cancelLabel,
        onConfirm: () => { closeDialog(); resolve(true) },
        onCancel:  () => { closeDialog(); resolve(false) },
      })
    })
  }, [closeDialog])

  const dialogNode = dialog ? (
    <AppDialog
      type={dialog.type}
      message={dialog.message}
      confirmLabel={dialog.confirmLabel}
      cancelLabel={dialog.cancelLabel}
      onConfirm={dialog.onConfirm}
      onCancel={dialog.onCancel}
    />
  ) : null

  return { dialogNode, appAlert, appConfirm }
}

export default useAppDialog
