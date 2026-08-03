import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { jsPDF } from 'jspdf'
import { Resvg } from '@resvg/resvg-js'
import { renderRefinedOrderPdf } from '../src/utils/orderDocumentRefinedShared.js'
import { getSvgPlacementInBox, getSvgIntrinsicMetrics } from '../src/utils/svgAspectPlacement.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')
const outputDir = path.join(projectRoot, 'release', 'qa-order-docs-layoutfix-35')
const fontDir = path.join(projectRoot, 'src', 'assets', 'componentesgraficos', 'Font')

const loadKit = async () => {
  const base = path.join(projectRoot, 'src', 'assets', 'componentesgraficos')
  const iconsBase = path.join(projectRoot, 'src', 'assets', 'icons')
  const [header, footer] = await Promise.all([
    fs.readFile(path.join(base, 'Header.svg'), 'utf8'),
    fs.readFile(path.join(base, 'Footer.svg'), 'utf8'),
  ])
  const paymentCard = await fs.readFile(path.join(base, 'components', 'payment-card.svg'), 'utf8')
  const [
    documentOrder,
    customer,
    contactPhone,
    contactMail,
    contactDate,
    operationDelivery,
    statusOk,
    statusAlert,
    supportProduct,
    operationPrice,
    operationPayment,
    supportNotes,
    actionConfig,
  ] = await Promise.all([
    fs.readFile(path.join(iconsBase, 'file-description.svg'), 'utf8'),
    fs.readFile(path.join(iconsBase, 'user.svg'), 'utf8'),
    fs.readFile(path.join(iconsBase, 'phone.svg'), 'utf8'),
    fs.readFile(path.join(iconsBase, 'mail.svg'), 'utf8'),
    fs.readFile(path.join(iconsBase, 'calendar-event.svg'), 'utf8'),
    fs.readFile(path.join(iconsBase, 'truck-delivery.svg'), 'utf8'),
    fs.readFile(path.join(iconsBase, 'check.svg'), 'utf8'),
    fs.readFile(path.join(iconsBase, 'alert-circle.svg'), 'utf8'),
    fs.readFile(path.join(iconsBase, 'box.svg'), 'utf8'),
    fs.readFile(path.join(iconsBase, 'file-dollar.svg'), 'utf8'),
    fs.readFile(path.join(iconsBase, 'receipt.svg'), 'utf8'),
    fs.readFile(path.join(iconsBase, 'notes.svg'), 'utf8'),
    fs.readFile(path.join(iconsBase, 'settings.svg'), 'utf8'),
  ])
  return {
    assets: {
      header,
      footer,
      paymentCard,
      icons: {
        documentOrder,
        customer,
        contactPhone,
        contactMail,
        contactDate,
        operationDelivery,
        statusOk,
        statusAlert,
        supportProduct,
        operationPrice,
        operationPayment,
        supportNotes,
        actionConfig,
      },
    },
  }
}

const ensureFonts = async (doc) => {
  const [regular, semiBold, bold, interRegular] = await Promise.all([
    fs.readFile(path.join(fontDir, 'Montserrat-Regular.ttf')),
    fs.readFile(path.join(fontDir, 'Montserrat-SemiBold.ttf')),
    fs.readFile(path.join(fontDir, 'Montserrat-Bold.ttf')),
    fs.readFile(path.join(fontDir, 'Inter-Regular.ttf')),
  ])
  doc.addFileToVFS('Montserrat-Regular.ttf', regular.toString('base64'))
  doc.addFileToVFS('Montserrat-SemiBold.ttf', semiBold.toString('base64'))
  doc.addFileToVFS('Montserrat-Bold.ttf', bold.toString('base64'))
  doc.addFileToVFS('Inter-Regular.ttf', interRegular.toString('base64'))
  doc.addFont('Montserrat-Regular.ttf', 'Montserrat', 'normal')
  doc.addFont('Montserrat-SemiBold.ttf', 'Montserrat', 'semiBold')
  doc.addFont('Montserrat-Bold.ttf', 'Montserrat', 'bold')
  doc.addFont('Inter-Regular.ttf', 'Inter', 'normal')
}

const renderAsset = async (doc, svg, x, y, width, height) => {
  const placement = getSvgPlacementInBox(svg, x, y, width, height)
  const metrics = getSvgIntrinsicMetrics(svg)
  const renderWidthPx = Math.max(1, Math.round(placement.renderWidth * 10))
  const renderHeightPx = Math.max(1, Math.round(placement.renderHeight * 10))
  const intrinsicRatio = metrics.intrinsicWidth / metrics.intrinsicHeight
  const resvg = new Resvg(svg, {
    fitTo: intrinsicRatio >= 1
      ? { mode: 'width', value: renderWidthPx }
      : { mode: 'height', value: renderHeightPx },
    background: 'rgba(255,255,255,0)',
  })
  const png = resvg.render().asPng()
  const dataUrl = `data:image/png;base64,${Buffer.from(png).toString('base64')}`
  doc.addImage(dataUrl, 'PNG', placement.x, placement.y, placement.renderWidth, placement.renderHeight)
}

const buildOrder = (itemCount) => {
  const items = Array.from({ length: itemCount }, (_, index) => ({
    productName: `Producto QA ${index + 1}`,
    quantity: index % 3 === 0 ? 2 : 1,
    unitPrice: 1250 + index * 35,
    isClientMaterial: index % 7 === 0,
    itemCompleted: index % 5 === 0,
  }))

  const total = items.reduce((acc, item) => acc + item.quantity * item.unitPrice, 0)

  return {
    id: `QA-${itemCount}`,
    clientName: itemCount === 35 ? 'Cliente de validacion con nombre deliberadamente muy largo para probar el ajuste del layout corporativo' : 'Cliente QA PACKYA',
    phone: '2615550000',
    email: 'qa@packya.com.ar',
    status: itemCount >= 20 ? 'En Producción' : itemCount >= 10 ? 'Listo para Entrega' : 'Pendiente',
    createdAt: '2026-08-01T10:30:00.000Z',
    deliveryDate: '2026-08-05',
    items,
    total,
    discount: itemCount >= 20 ? 1500 : 0,
    payments: [{ amount: Math.round(total * 0.35), date: '2026-08-01', method: 'Transferencia' }],
  }
}

const validateScenario = (itemCount, debug) => {
  const issues = []
  const pageCount = Number(debug.pageCount || 0)
  const productHeaderPages = debug.pages.filter((page) => page.repeatedProductsHeader).length
  const totalRows = debug.pages.reduce((sum, page) => sum + Number(page.rowCount || 0), 0)

  if (pageCount < 1) issues.push('No pages generated')
  if (debug.counts.header !== pageCount) issues.push(`Header count ${debug.counts.header} != page count ${pageCount}`)
  if (debug.counts.footer !== pageCount) issues.push(`Footer count ${debug.counts.footer} != page count ${pageCount}`)
  if (productHeaderPages < 1) issues.push('Products header was never rendered')
  if (debug.counts.totals !== 1) issues.push(`Totals count ${debug.counts.totals} != 1`)
  if (debug.counts.payment !== 1) issues.push(`Payment count ${debug.counts.payment} != 1`)
  if (totalRows !== itemCount) issues.push(`Rendered row count ${totalRows} != expected ${itemCount}`)
  if (!debug.pages[0]?.blocks.includes('overview')) issues.push('First page is missing overview block')
  if (!debug.pages.some((page) => page.hasTotals)) issues.push('No page contains totals block')
  if (!debug.pages.some((page) => page.hasPayment)) issues.push('No page contains payment block')

  return issues
}

const generatePdf = async (order, filePath, kit) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const { debug } = await renderRefinedOrderPdf(doc, order, {
    renderSvg: renderAsset,
    ensureFonts,
    assets: kit.assets,
    constants: {
      transferAccounts: [
        {
          title: 'Mercado Pago',
          alias: 'PACKYA',
          holder: 'Franco Renna',
          cuil: '20-33168112-2',
        },
        {
          title: 'Mercado Pago',
          alias: 'PACKYA2',
          holder: 'Damian Vanin',
          cuil: '20-27698476-5',
        },
      ],
      contactPhone: '+54 9 261 629-8349',
      website: 'www.packya.com.ar',
    },
  })

  const arrayBuffer = doc.output('arraybuffer')
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, Buffer.from(arrayBuffer))

  return debug
}

const main = async () => {
  await fs.mkdir(outputDir, { recursive: true })
  const kit = await loadKit()
  const reportPath = path.join(outputDir, 'qa-order-docs-report.json')

  const scenarios = [35]
  const scenarioResults = []

  for (const itemCount of scenarios) {
    const order = buildOrder(itemCount)
    const filePath = path.join(outputDir, `ORDER_QA_${String(itemCount).padStart(2, '0')}.pdf`)
    const debug = await generatePdf(order, filePath, kit)
    const issues = validateScenario(itemCount, debug)
    scenarioResults.push({ itemCount, filePath, pageCount: debug.pageCount, issues, pages: debug.pages })
    console.log(`generated ${filePath}`)
  }

  const failingScenarios = scenarioResults.filter((result) => result.issues.length > 0)
  await fs.writeFile(reportPath, JSON.stringify(scenarioResults, null, 2))
  if (failingScenarios.length > 0) {
    throw new Error(JSON.stringify(failingScenarios, null, 2))
  }

  console.log(`report ${reportPath}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
