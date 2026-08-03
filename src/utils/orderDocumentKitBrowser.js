import layout from '../assets/componentesgraficos/layout.json'
import contract from '../assets/componentesgraficos/components.json'
import tokens from '../assets/componentesgraficos/tokens.json'
import headerSvg from '../assets/componentesgraficos/Header.svg?raw'
import footerSvg from '../assets/componentesgraficos/Footer.svg?raw'
import documentInfoSvg from '../assets/componentesgraficos/components/document-info-card.svg?raw'
import clientCardSvg from '../assets/componentesgraficos/components/client-card.svg?raw'
import productsTableSvg from '../assets/componentesgraficos/components/products-table.svg?raw'
import productRowSvg from '../assets/componentesgraficos/components/product-row.svg?raw'
import totalsCardSvg from '../assets/componentesgraficos/components/totals-card.svg?raw'
import paymentCardSvg from '../assets/componentesgraficos/components/payment-card.svg?raw'
import { buildOrderDocumentViewModel, composeOrderDocumentKitPdf } from './orderDocumentKitEngine'
import { getSvgPlacementInBox } from './svgAspectPlacement.js'

const rasterCache = new Map()
const PX_PER_MM = 8

const assets = {
  'Header.svg': headerSvg,
  'Footer.svg': footerSvg,
  'components/document-info-card.svg': documentInfoSvg,
  'components/client-card.svg': clientCardSvg,
  'components/products-table.svg': productsTableSvg,
  'components/product-row.svg': productRowSvg,
  'components/totals-card.svg': totalsCardSvg,
  'components/payment-card.svg': paymentCardSvg,
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
      reject(new Error('Failed to rasterize document kit SVG'))
    }

    image.src = url
  })

  rasterCache.set(cacheKey, dataUrl)
  return dataUrl
}

const renderAsset = async (doc, svg, x, y, width, height) => {
  const placement = getSvgPlacementInBox(svg, x, y, width, height)
  const dataUrl = await rasterizeSvg(svg, placement.renderWidth, placement.renderHeight)
  doc.addImage(dataUrl, 'PNG', placement.x, placement.y, placement.renderWidth, placement.renderHeight)
}

export const renderOrderDocumentKitPdf = async (doc, order, constants) => {
  const viewModel = buildOrderDocumentViewModel(order, contract, constants)
  const debug = await composeOrderDocumentKitPdf(
    doc,
    viewModel,
    { layout, contract, tokens, assets },
    { renderAsset },
  )

  return {
    fileName: viewModel.fileName,
    debug,
  }
}