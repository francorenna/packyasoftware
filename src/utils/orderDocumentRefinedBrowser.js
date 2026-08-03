import headerSvg from '../assets/componentesgraficos/Header.svg?raw'
import footerSvg from '../assets/componentesgraficos/Footer.svg?raw'
import watermarkSvg from '../assets/componentesgraficos/watermark.svg?raw'
import paymentCardSvg from '../assets/componentesgraficos/components/payment-card.svg?raw'
import fileDescriptionSvg from '../assets/icons/file-description.svg?raw'
import userSvg from '../assets/icons/user.svg?raw'
import phoneSvg from '../assets/icons/phone.svg?raw'
import mailSvg from '../assets/icons/mail.svg?raw'
import calendarEventSvg from '../assets/icons/calendar-event.svg?raw'
import truckDeliverySvg from '../assets/icons/truck-delivery.svg?raw'
import checkSvg from '../assets/icons/check.svg?raw'
import alertCircleSvg from '../assets/icons/alert-circle.svg?raw'
import boxSvg from '../assets/icons/box.svg?raw'
import fileDollarSvg from '../assets/icons/file-dollar.svg?raw'
import receiptSvg from '../assets/icons/receipt.svg?raw'
import notesSvg from '../assets/icons/notes.svg?raw'
import settingsSvg from '../assets/icons/settings.svg?raw'
import montserratRegularUrl from '../assets/componentesgraficos/Font/Montserrat-Regular.ttf'
import montserratSemiBoldUrl from '../assets/componentesgraficos/Font/Montserrat-SemiBold.ttf'
import montserratBoldUrl from '../assets/componentesgraficos/Font/Montserrat-Bold.ttf'
import interRegularUrl from '../assets/componentesgraficos/Font/Inter-Regular.ttf'
import { getSvgPlacementInBox } from './svgAspectPlacement.js'
import { renderRefinedOrderPdf } from './orderDocumentRefinedShared.js'

const rasterCache = new Map()
const fontState = { ready: false }
const PX_PER_MM = 8

const toBase64 = (arrayBuffer) => {
  let binary = ''
  const bytes = new Uint8Array(arrayBuffer)
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

const ensureFonts = async (doc) => {
  if (fontState.ready) return

  const [regular, semiBold, bold, interRegular] = await Promise.all([
    fetch(montserratRegularUrl).then((response) => response.arrayBuffer()),
    fetch(montserratSemiBoldUrl).then((response) => response.arrayBuffer()),
    fetch(montserratBoldUrl).then((response) => response.arrayBuffer()),
    fetch(interRegularUrl).then((response) => response.arrayBuffer()),
  ])

  doc.addFileToVFS('Montserrat-Regular.ttf', toBase64(regular))
  doc.addFileToVFS('Montserrat-SemiBold.ttf', toBase64(semiBold))
  doc.addFileToVFS('Montserrat-Bold.ttf', toBase64(bold))
  doc.addFileToVFS('Inter-Regular.ttf', toBase64(interRegular))
  doc.addFont('Montserrat-Regular.ttf', 'Montserrat', 'normal')
  doc.addFont('Montserrat-SemiBold.ttf', 'Montserrat', 'semiBold')
  doc.addFont('Montserrat-Bold.ttf', 'Montserrat', 'bold')
  doc.addFont('Inter-Regular.ttf', 'Inter', 'normal')

  fontState.ready = true
}

const rasterizeSvg = async (svg, widthMm, heightMm) => {
  const cacheKey = `${widthMm}:${heightMm}:${svg.length}`
  if (rasterCache.has(cacheKey)) return rasterCache.get(cacheKey)

  const widthPx = Math.max(1, Math.round(widthMm * PX_PER_MM))
  const heightPx = Math.max(1, Math.round(heightMm * PX_PER_MM))

  const dataUrl = await new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const image = new Image()

    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = widthPx
      canvas.height = heightPx
      const context = canvas.getContext('2d')
      if (!context) {
        URL.revokeObjectURL(url)
        reject(new Error('No canvas context available for SVG rasterization'))
        return
      }

      context.clearRect(0, 0, widthPx, heightPx)
      context.drawImage(image, 0, 0, widthPx, heightPx)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/png'))
    }

    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to rasterize document SVG'))
    }

    image.src = url
  })

  rasterCache.set(cacheKey, dataUrl)
  return dataUrl
}

const renderSvg = async (doc, svg, x, y, width, height) => {
  const placement = getSvgPlacementInBox(svg, x, y, width, height)
  const dataUrl = await rasterizeSvg(svg, placement.renderWidth, placement.renderHeight)
  doc.addImage(dataUrl, 'PNG', placement.x, placement.y, placement.renderWidth, placement.renderHeight)
}

export const renderRefinedOrderDocumentPdf = async (doc, order, constants) =>
  renderRefinedOrderPdf(doc, order, {
    renderSvg,
    ensureFonts,
    assets: {
      header: headerSvg,
      footer: footerSvg,
      watermark: watermarkSvg,
      paymentCard: paymentCardSvg,
      icons: {
        documentOrder: fileDescriptionSvg,
        customer: userSvg,
        contactPhone: phoneSvg,
        contactMail: mailSvg,
        contactDate: calendarEventSvg,
        operationDelivery: truckDeliverySvg,
        statusOk: checkSvg,
        statusAlert: alertCircleSvg,
        supportProduct: boxSvg,
        operationPrice: fileDollarSvg,
        operationPayment: receiptSvg,
        supportNotes: notesSvg,
        actionConfig: settingsSvg,
      },
    },
    constants,
  })