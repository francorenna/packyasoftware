import { splitItemsForPages } from './corporatePdfLayout.js'

const normalizeText = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

export const ORDER_ITEMS_PER_PAGE = 10

const ORDER_STATUS_DEFINITIONS = [
  {
    match: /entregad/i,
    label: 'Entregado',
    tone: 'success',
    icon: '🚚',
  },
  {
    match: /listo|ready/i,
    label: 'Listo para Entrega',
    tone: 'success',
    icon: '📦',
  },
  {
    match: /produccion|proceso/i,
    label: 'En Producción',
    tone: 'accent',
    icon: '⚙',
  },
  {
    match: /aprob|approved|acept/i,
    label: 'Aprobado',
    tone: 'info',
    icon: '✓',
  },
  {
    match: /diseno|design|pendient/i,
    label: 'En Diseño',
    tone: 'warning',
    icon: '✎',
  },
]

const ORDER_STATUS_FALLBACK = {
  label: 'En Diseño',
  tone: 'warning',
  icon: '✎',
}

export const WORK_TYPE_OPTIONS = [
  {
    key: 'cajas',
    label: 'Cajas',
    matcher: (value) => /\bcaja\b|\bbox\b/i.test(value),
  },
  {
    key: 'bolsas-kraft',
    label: 'Bolsas Kraft',
    matcher: (value) => /bolsa.*kraft|kraft/i.test(value),
  },
  {
    key: 'bolsas-friselina',
    label: 'Bolsas Friselina',
    matcher: (value) => /friselina|fiselina/i.test(value),
  },
  {
    key: 'papel-parafinado',
    label: 'Papel Parafinado',
    matcher: (value) => /paraf|parafinado/i.test(value),
  },
]

export const getWorkTypeSelections = (items = []) => {
  const combinedText = (Array.isArray(items) ? items : [])
    .map((item) => [item?.productName, item?.product, item?.description, item?.notes, item?.design].join(' '))
    .join(' ')

  return WORK_TYPE_OPTIONS.map((option) => ({
    ...option,
    checked: option.matcher(combinedText),
  }))
}

export const getOrderStatusBadge = (status = '') => {
  const normalized = normalizeText(status)
  const matchedStatus = ORDER_STATUS_DEFINITIONS.find((definition) => definition.match.test(normalized))
  if (!matchedStatus) return ORDER_STATUS_FALLBACK

  const { match, ...badge } = matchedStatus
  return badge
}

export const buildOrderItemTableRows = (items = []) => {
  const safeItems = Array.isArray(items) ? items : []

  return safeItems.map((item) => {
    const product = String(item?.productName ?? item?.product ?? 'Sin producto').trim() || 'Sin producto'
    const description = String(item?.description ?? item?.notes ?? item?.details ?? '').trim()
    const measure = String(item?.measure ?? item?.size ?? item?.medida ?? item?.dimension ?? '').trim()
    const design = String(item?.design ?? item?.printing ?? item?.finish ?? '').trim()
    const quantity = Number(item?.quantity || 0)
    const unitPrice = Number(item?.unitPrice || 0)
    const total = quantity * unitPrice

    return {
      product,
      description: description || 'Sin descripción',
      quantity,
      measure: measure || '-',
      design: design || '-',
      unitPrice,
      total,
    }
  })
}

export const paginateOrderItemRows = (items = [], itemsPerPage = ORDER_ITEMS_PER_PAGE) => {
  const rows = buildOrderItemTableRows(items)
  const pages = splitItemsForPages(rows, itemsPerPage)

  return {
    rows,
    pages,
    itemsPerPage,
    pageCount: rows.length > 0 ? pages.length : 0,
  }
}
