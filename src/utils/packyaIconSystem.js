import fileDescriptionSvg from '../assets/icons/file-description.svg?raw'
import clipboardListSvg from '../assets/icons/clipboard-list.svg?raw'
import packageSvg from '../assets/icons/package.svg?raw'
import truckDeliverySvg from '../assets/icons/truck-delivery.svg?raw'
import printerSvg from '../assets/icons/printer.svg?raw'
import receiptSvg from '../assets/icons/receipt.svg?raw'
import fileInvoiceSvg from '../assets/icons/file-invoice.svg?raw'
import fileDollarSvg from '../assets/icons/file-dollar.svg?raw'
import tagSvg from '../assets/icons/tag.svg?raw'
import qrcodeSvg from '../assets/icons/qrcode.svg?raw'
import barcodeSvg from '../assets/icons/barcode.svg?raw'
import userSvg from '../assets/icons/user.svg?raw'
import phoneSvg from '../assets/icons/phone.svg?raw'
import mailSvg from '../assets/icons/mail.svg?raw'
import calendarEventSvg from '../assets/icons/calendar-event.svg?raw'
import worldWwwSvg from '../assets/icons/world-www.svg?raw'
import brandWhatsappSvg from '../assets/icons/brand-whatsapp.svg?raw'
import brandInstagramSvg from '../assets/icons/brand-instagram.svg?raw'
import checkSvg from '../assets/icons/check.svg?raw'
import alertCircleSvg from '../assets/icons/alert-circle.svg?raw'
import pencilSvg from '../assets/icons/pencil.svg?raw'
import settingsSvg from '../assets/icons/settings.svg?raw'
import chartBarSvg from '../assets/icons/chart-bar.svg?raw'
import dashboardSvg from '../assets/icons/dashboard.svg?raw'
import notesSvg from '../assets/icons/notes.svg?raw'
import reportSvg from '../assets/icons/report.svg?raw'
import rulerMeasureSvg from '../assets/icons/ruler-measure.svg?raw'
import paletteSvg from '../assets/icons/palette.svg?raw'
import buildingStoreSvg from '../assets/icons/building-store.svg?raw'
import boxSvg from '../assets/icons/box.svg?raw'

const PACKYA_ICONS = {
  documentOrder: fileDescriptionSvg,
  documentBudget: clipboardListSvg,
  documentRemit: packageSvg,
  documentInvoice: fileInvoiceSvg,
  documentLabel: tagSvg,
  operationDelivery: truckDeliverySvg,
  operationPrint: printerSvg,
  operationPayment: receiptSvg,
  operationPrice: fileDollarSvg,
  operationQr: qrcodeSvg,
  operationBarcode: barcodeSvg,
  customer: userSvg,
  contactPhone: phoneSvg,
  contactMail: mailSvg,
  contactDate: calendarEventSvg,
  contactWeb: worldWwwSvg,
  contactWhatsapp: brandWhatsappSvg,
  contactInstagram: brandInstagramSvg,
  statusOk: checkSvg,
  statusAlert: alertCircleSvg,
  actionEdit: pencilSvg,
  actionConfig: settingsSvg,
  dashboard: dashboardSvg,
  dashboardAnalytics: chartBarSvg,
  supportNotes: notesSvg,
  supportReport: reportSvg,
  supportMeasure: rulerMeasureSvg,
  supportDesign: paletteSvg,
  supportStore: buildingStoreSvg,
  supportProduct: boxSvg,
}

export const PACKYA_ICON_NAMES = Object.freeze(Object.keys(PACKYA_ICONS))

const encodeSvg = (svg) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`

const tintSvgStroke = (svg, color) => {
  if (!color) return svg
  return svg.replaceAll('stroke="currentColor"', `stroke="${color}"`)
}

export const getPackyaIconSvg = (name) => PACKYA_ICONS[name] ?? null

export const getPackyaIconDataUrl = (name, options = {}) => {
  const iconSvg = getPackyaIconSvg(name)
  if (!iconSvg) return null
  const tinted = tintSvgStroke(iconSvg, options.strokeColor)
  return encodeSvg(tinted)
}

export const getPackyaIconMarkup = (name, options = {}) => {
  const iconSvg = getPackyaIconSvg(name)
  if (!iconSvg) return ''

  const strokeColor = options.strokeColor ?? null
  const tinted = tintSvgStroke(iconSvg, strokeColor)
  return tinted
}

export const drawPackyaIconOnPdf = async (doc, name, options = {}) => {
  const {
    x = 0,
    y = 0,
    size = 6,
    strokeColor = '#0B0B0D',
  } = options

  const iconSvg = getPackyaIconSvg(name)
  if (!iconSvg) return false
  if (typeof doc?.svg !== 'function') return false
  if (typeof DOMParser === 'undefined') return false

  const tinted = tintSvgStroke(iconSvg, strokeColor)
  const parsed = new DOMParser().parseFromString(tinted, 'image/svg+xml')
  const svgElement = parsed.documentElement

  await doc.svg(svgElement, {
    x,
    y,
    width: size,
    height: size,
  })

  return true
}

export const PACKYA_ICON_REGISTRY = Object.freeze(PACKYA_ICONS)
