export const formatOrderId = (id) => {
  const normalizedId = String(id ?? '').trim()
  if (!normalizedId) return 'PED-SIN-ID'

  return `PED-${normalizedId.slice(-6).toUpperCase()}`
}