import { jsPDF } from 'jspdf'
import { getOrderFinancialSummary } from './finance'
import logoPackya from '../assets/logo.png'

const PACKYA_PAYMENT_LINK = 'https://link.mercadopago.com.ar/packya'

const formatCurrency = (value) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0)

const formatDate = (value) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number)
    return new Date(year, month - 1, day).toLocaleDateString('es-AR')
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sin fecha'
  return date.toLocaleDateString('es-AR')
}

const formatDateTime = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sin fecha'
  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// logoPackya is imported as a bundled asset URL by Vite

const getPaymentQrDataUrl = async () => {
  try {
    const qrModule = await import('qrcode')
    const toDataURL = qrModule?.toDataURL ?? qrModule?.default?.toDataURL
    if (typeof toDataURL !== 'function') return null

    return await toDataURL(PACKYA_PAYMENT_LINK, {
      margin: 1,
      width: 420,
      errorCorrectionLevel: 'M',
    })
  } catch {
    return null
  }
}

export async function generateOrderPDF(order) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 18
  const contentWidth = pageWidth - margin * 2
  let cursorY = 12

  const safeOrder = order && typeof order === 'object' ? order : {}
  const orderId = String(safeOrder.id ?? 'PED-SIN-ID')
  const clientName = String(safeOrder.clientName ?? safeOrder.client ?? 'Sin cliente')
  const clientPhone = String(safeOrder.phone ?? safeOrder.clientPhone ?? '').trim()
  const orderStatus = String(safeOrder.status ?? 'Pendiente')
  const { items, payments, effectiveSubtotal, discount, finalTotal, totalPaid, remainingDebt, financialStatus } =
    getOrderFinancialSummary(safeOrder)
  const issuedAt = formatDate(new Date().toISOString())

  const colors = {
    textMain: [15, 23, 42],
    textMuted: [100, 116, 139],
    lineSoft: [226, 232, 240],
    bgSoft: [248, 250, 252],
    accent: [211, 38, 128],
    success: [22, 163, 74],
    warning: [161, 98, 7],
    danger: [220, 38, 38],
  }

  const setText = (rgb) => doc.setTextColor(rgb[0], rgb[1], rgb[2])

  const ensureSpace = (heightNeeded) => {
    if (cursorY + heightNeeded <= pageHeight - margin) return
    doc.addPage()
    cursorY = margin
  }

  const drawSeparator = (spacingBottom = 7) => {
    doc.setDrawColor(colors.lineSoft[0], colors.lineSoft[1], colors.lineSoft[2])
    doc.line(margin, cursorY, pageWidth - margin, cursorY)
    cursorY += spacingBottom
  }

  const drawRow = (leftLabel, rightValue, options = {}) => {
    const valueColor = options.valueColor ?? colors.textMain
    const valueFont = options.valueFont ?? 'normal'
    const valueSize = options.valueSize ?? 10

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    setText([71, 85, 105])
    doc.text(leftLabel, margin, cursorY)
    doc.setFont('helvetica', valueFont)
    doc.setFontSize(valueSize)
    setText(valueColor)
    doc.text(String(rightValue), pageWidth - margin, cursorY, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    cursorY += 6
  }

  const drawSectionTitle = (title) => {
    ensureSpace(12)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    setText(colors.textMain)
    doc.text(title, margin, cursorY)
    cursorY += 3
    drawSeparator(6)
  }

  const drawBadge = ({ label, color, x, y }) => {
    const padX = 2.5
    const badgeHeight = 6
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    const textWidth = doc.getTextWidth(label)
    const badgeWidth = textWidth + padX * 2

    doc.setFillColor(245, 245, 245)
    doc.roundedRect(x, y, badgeWidth, badgeHeight, 1.6, 1.6, 'F')
    setText(color)
    doc.text(label, x + padX, y + 4.2)
    setText(colors.textMain)

    return badgeWidth
  }

  const getFinancialColor = () => {
    if (financialStatus === 'Pagado') return colors.success
    if (financialStatus === 'Pendiente') return colors.danger
    return colors.warning
  }

  doc.setFillColor(colors.accent[0], colors.accent[1], colors.accent[2])
  doc.rect(0, 0, pageWidth, 9, 'F')
  cursorY += 4

  const isLogoRendered = Boolean(logoPackya)

  // Use bundled asset URL imported as logoPackya
  if (isLogoRendered) {
    const logoWidth = 28
    const logoHeight = 28
    doc.addImage(logoPackya, 'PNG', pageWidth / 2 - logoWidth / 2, cursorY, logoWidth, logoHeight)
    cursorY += logoHeight + 4
  }

  if (!isLogoRendered) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    setText(colors.textMain)
    doc.text('PACKYA', pageWidth / 2, cursorY, { align: 'center' })
    cursorY += 6
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  setText(colors.textMain)
  doc.text('Orden de Pedido', pageWidth / 2, cursorY, { align: 'center' })
  cursorY += 7

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  setText(colors.textMuted)
  doc.text(`N° ${orderId} · Emitida ${issuedAt}`, pageWidth / 2, cursorY, { align: 'center' })
  cursorY += 8
  drawSeparator(7)

  if (safeOrder.isSample) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    setText(colors.danger)
    doc.text('MUESTRA – NO FACTURABLE', pageWidth / 2, cursorY, { align: 'center' })
    cursorY += 10
    drawSeparator(6)
  }

  drawSectionTitle('Datos del pedido')

  ensureSpace(34)
  doc.setFillColor(colors.bgSoft[0], colors.bgSoft[1], colors.bgSoft[2])
  doc.roundedRect(margin, cursorY, contentWidth, 31, 2.2, 2.2, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  setText(colors.textMain)
  doc.text('Cliente', margin + 4, cursorY + 6)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(clientName, margin + 4, cursorY + 12)

  if (clientPhone) {
    doc.setFontSize(9.5)
    setText(colors.textMuted)
    doc.text(`Tel: ${clientPhone}`, margin + 4, cursorY + 17.2)
  }

  doc.setFontSize(9.5)
  setText(colors.textMuted)
  doc.text(`Fecha de entrega: ${formatDate(safeOrder.deliveryDate)}`, margin + 4, cursorY + 22.8)

  const badgeY = cursorY + 5
  const badgeStartX = pageWidth - margin - 62
  const orderBadgeColor =
    orderStatus === 'Entregado'
      ? colors.success
      : orderStatus === 'Cancelado'
        ? colors.danger
        : colors.warning

  const firstBadgeWidth = drawBadge({
    label: `Pedido: ${orderStatus}`,
    color: orderBadgeColor,
    x: badgeStartX,
    y: badgeY,
  })
  drawBadge({
    label: `Finanzas: ${financialStatus}`,
    color: getFinancialColor(),
    x: badgeStartX,
    y: badgeY + 8,
  })

  if (firstBadgeWidth > 62) {
    drawBadge({
      label: `Finanzas: ${financialStatus}`,
      color: getFinancialColor(),
      x: pageWidth - margin - firstBadgeWidth,
      y: badgeY + 8,
    })
  }

  cursorY += 38
  drawSectionTitle('Detalle de productos')

  const columns = [
    { key: 'product', label: 'Producto', width: contentWidth * 0.44, align: 'left' },
    { key: 'quantity', label: 'Cantidad', width: contentWidth * 0.14, align: 'right' },
    { key: 'unit', label: 'Precio unitario', width: contentWidth * 0.2, align: 'right' },
    { key: 'subtotal', label: 'Subtotal', width: contentWidth * 0.22, align: 'right' },
  ]

  const drawTableHeader = () => {
    let x = margin
    doc.setFillColor(colors.bgSoft[0], colors.bgSoft[1], colors.bgSoft[2])
    doc.rect(margin, cursorY - 4, contentWidth, 7, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    setText([51, 65, 85])

    columns.forEach((column) => {
      const textX = column.align === 'right' ? x + column.width - 1 : x + 1
      doc.text(column.label, textX, cursorY, {
        align: column.align === 'right' ? 'right' : 'left',
      })
      x += column.width
    })

    cursorY += 8
    doc.setDrawColor(colors.lineSoft[0], colors.lineSoft[1], colors.lineSoft[2])
    doc.line(margin, cursorY - 4, margin + contentWidth, cursorY - 4)
  }

  const drawItemRow = (item) => {
    if (cursorY > pageHeight - 42) {
      doc.addPage()
      cursorY = margin
      drawTableHeader()
    }

    const product = String(item?.productName ?? item?.product ?? 'Sin producto')
    const quantity = Number(item?.quantity || 0)
    const unitPrice = Number(item?.unitPrice || 0)
    const subtotal = quantity * unitPrice

    const values = {
      product,
      quantity: String(quantity),
      unit: formatCurrency(unitPrice),
      subtotal: formatCurrency(subtotal),
    }

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    setText(colors.textMain)

    let x = margin
    columns.forEach((column) => {
      const textX = column.align === 'right' ? x + column.width - 1 : x + 1
      const text = column.key === 'product'
        ? doc.splitTextToSize(values[column.key], column.width - 2)
        : values[column.key]

      doc.text(text, textX, cursorY, {
        align: column.align === 'right' ? 'right' : 'left',
      })
      x += column.width
    })

    cursorY += 6
    doc.setDrawColor(241, 245, 249)
    doc.line(margin, cursorY - 2, margin + contentWidth, cursorY - 2)
  }

  drawTableHeader()

  if (items.length > 0) {
    items.forEach((item) => drawItemRow(item))
  } else {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    setText(colors.textMuted)
    doc.text('Este pedido no tiene detalle de productos cargado.', margin, cursorY + 1)
    cursorY += 8
  }

  cursorY += 3
  drawRow('Subtotal', formatCurrency(effectiveSubtotal))
  drawRow('Descuento', `- ${formatCurrency(discount)}`)
  drawRow('Total final', formatCurrency(finalTotal), {
    valueFont: 'bold',
    valueSize: 12,
  })

  drawSectionTitle('Resumen financiero')

  drawRow('Total abonado', formatCurrency(totalPaid))
  drawRow('Estado financiero', financialStatus, {
    valueFont: 'bold',
    valueColor: getFinancialColor(),
  })

  ensureSpace(20)
  doc.setFillColor(255, 245, 247)
  doc.roundedRect(margin, cursorY, contentWidth, 15, 2.4, 2.4, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.6)
  setText(colors.textMuted)
  doc.text('Total pendiente', margin + 4, cursorY + 5.8)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14.5)
  setText(remainingDebt > 0 ? colors.danger : colors.success)
  doc.text(formatCurrency(remainingDebt), pageWidth - margin - 4, cursorY + 10.8, { align: 'right' })
  cursorY += 18

  if (remainingDebt > 0 && !safeOrder.isSample) {
    const paymentQrDataUrl = await getPaymentQrDataUrl()

    if (paymentQrDataUrl) {
      ensureSpace(47)
      drawSectionTitle('Pagar ahora')

      const blockHeight = 34
      doc.setFillColor(colors.bgSoft[0], colors.bgSoft[1], colors.bgSoft[2])
      doc.roundedRect(margin, cursorY, contentWidth, blockHeight, 2.4, 2.4, 'F')

      const qrSize = 18
      const qrX = pageWidth / 2 - qrSize / 2
      const qrY = cursorY + 3.4
      doc.addImage(paymentQrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.8)
      setText(colors.textMuted)
      doc.text('Escaneá y cargá el monto indicado en el saldo.', pageWidth / 2, cursorY + 25.8, {
        align: 'center',
      })

      cursorY += blockHeight + 4
    }
  }

  drawSectionTitle('Formas de pago')

  const paymentMethods = [...new Set(payments.map((payment) => String(payment?.method ?? '').trim()).filter(Boolean))]
  const paymentMethodsText = paymentMethods.length > 0
    ? paymentMethods.join(' · ')
    : 'Efectivo · Transferencia · MercadoPago'

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.2)
  setText(colors.textMuted)
  doc.text('Métodos utilizados / disponibles:', margin, cursorY)
  cursorY += 4.2
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.3)
  setText(colors.textMain)
  const methodsLines = doc.splitTextToSize(paymentMethodsText, contentWidth)
  doc.text(methodsLines, margin, cursorY)
  cursorY += methodsLines.length * 4 + 1.6

  if (payments.length > 0) {
    ensureSpace(12)
    const lastPayment = payments[payments.length - 1]

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.9)
    setText(colors.textMuted)
    doc.text(`Pagos registrados: ${payments.length}`, margin, cursorY)
    doc.setFont('helvetica', 'bold')
    setText(colors.textMain)
    doc.text(formatCurrency(totalPaid), pageWidth - margin, cursorY, { align: 'right' })
    cursorY += 4.6

    if (lastPayment) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      setText(colors.textMuted)
      doc.text(
        `Último pago: ${formatDate(lastPayment.date)} – ${String(lastPayment.method ?? 'Sin método')}`,
        margin,
        cursorY,
      )
      cursorY += 4.2
    }
  }

  ensureSpace(16)
  drawSeparator(7)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  setText(colors.textMuted)
  doc.text('Gracias por confiar en PACKYA. Seguimos trabajando para acompañar tu operación.', pageWidth / 2, cursorY, { align: 'center' })
  cursorY += 5
  doc.text('Documento generado automáticamente por PACKYA – Sistema de Gestión', pageWidth / 2, cursorY, { align: 'center' })

  doc.save(`${orderId}-orden-pedido.pdf`)
}

export async function generateClientStatementPDF(client, orders) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 18
  const contentWidth = pageWidth - margin * 2
  let cursorY = 18

  const safeClient = client && typeof client === 'object' ? client : {}
  const clientName = String(safeClient.name ?? 'Cliente sin nombre')
  const safeOrders = Array.isArray(orders) ? orders : []

  const colors = {
    textMain: [15, 23, 42],
    textMuted: [100, 116, 139],
    lineSoft: [226, 232, 240],
    bgSoft: [248, 250, 252],
    accent: [211, 38, 128],
    success: [22, 163, 74],
    warning: [161, 98, 7],
    danger: [220, 38, 38],
  }

  const setText = (rgb) => doc.setTextColor(rgb[0], rgb[1], rgb[2])

  const ensureSpace = (heightNeeded) => {
    if (cursorY + heightNeeded <= pageHeight - margin) return
    doc.addPage()
    cursorY = margin
  }

  const drawSeparator = (spacingTop = 0, spacingBottom = 7) => {
    cursorY += spacingTop
    doc.setDrawColor(colors.lineSoft[0], colors.lineSoft[1], colors.lineSoft[2])
    doc.line(margin, cursorY, pageWidth - margin, cursorY)
    cursorY += spacingBottom
  }

  const statementRows = safeOrders
    .map((order) => {
      const summary = getOrderFinancialSummary(order)
      return {
        id: String(order?.id ?? 'SIN-ID'),
        createdAt: String(order?.createdAt ?? ''),
        deliveryDate: String(order?.deliveryDate ?? ''),
        status: String(order?.status ?? 'Pendiente'),
        total: summary.finalTotal,
        paid: summary.totalPaid,
        debt: summary.remainingDebt,
      }
    })
    .sort(
      (a, b) => new Date(b.deliveryDate || b.createdAt || 0).getTime() - new Date(a.deliveryDate || a.createdAt || 0).getTime(),
    )

  const debtRows = statementRows.filter((row) => row.debt > 0)
  const displayRows = debtRows

  const totals = statementRows.reduce(
    (acc, row) => {
      acc.totalFacturado += Number(row.total || 0)
      acc.totalPagado += Number(row.paid || 0)
      acc.totalPendiente += Number(row.debt || 0)
      return acc
    },
    {
      totalFacturado: 0,
      totalPagado: 0,
      totalPendiente: 0,
    },
  )

  if (logoPackya) {
    const logoWidth = 30
    const logoHeight = 30
    doc.addImage(logoPackya, 'PNG', pageWidth / 2 - logoWidth / 2, cursorY, logoWidth, logoHeight)
    cursorY += logoHeight + 4
  }

  doc.setDrawColor(colors.accent[0], colors.accent[1], colors.accent[2])
  doc.setLineWidth(0.9)
  doc.line(margin + 12, cursorY, pageWidth - margin - 12, cursorY)
  cursorY += 9

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(19)
  setText(colors.textMain)
  doc.text('ESTADO DE CUENTA', pageWidth / 2, cursorY, { align: 'center' })
  cursorY += 6.5

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  setText(colors.textMain)
  doc.text(clientName, pageWidth / 2, cursorY, { align: 'center' })
  cursorY += 5.5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  setText(colors.textMuted)
  doc.text(`Fecha de emisión: ${formatDate(new Date().toISOString())}`, pageWidth / 2, cursorY, {
    align: 'center',
  })
  cursorY += 9

  ensureSpace(31)
  doc.setFillColor(colors.bgSoft[0], colors.bgSoft[1], colors.bgSoft[2])
  doc.roundedRect(margin, cursorY, contentWidth, 28, 2.2, 2.2, 'F')

  const drawSummaryLine = (label, value, y, color = colors.textMain, isBold = false) => {
    doc.setFont('helvetica', isBold ? 'bold' : 'normal')
    doc.setFontSize(10)
    setText(colors.textMuted)
    doc.text(label, margin + 4, y)
    setText(color)
    doc.text(formatCurrency(value), pageWidth - margin - 4, y, { align: 'right' })
  }

  drawSummaryLine('Total facturado histórico', totals.totalFacturado, cursorY + 7)
  drawSummaryLine('Total pagado', totals.totalPagado, cursorY + 14)
  drawSummaryLine(
    'Total pendiente',
    totals.totalPendiente,
    cursorY + 21,
    totals.totalPendiente > 0 ? colors.danger : colors.success,
    true,
  )

  cursorY += 34
  drawSeparator(0, 6)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  setText(colors.textMain)
  doc.text('Detalle de pedidos con saldo pendiente', margin, cursorY)
  cursorY += 6

  const columns = [
    { key: 'id', label: 'ID', width: contentWidth * 0.14, align: 'left' },
    { key: 'date', label: 'Fecha', width: contentWidth * 0.14, align: 'left' },
    { key: 'delivery', label: 'Entrega', width: contentWidth * 0.14, align: 'left' },
    { key: 'status', label: 'Estado', width: contentWidth * 0.14, align: 'left' },
    { key: 'total', label: 'Total', width: contentWidth * 0.15, align: 'right' },
    { key: 'paid', label: 'Pagado', width: contentWidth * 0.14, align: 'right' },
    { key: 'debt', label: 'Saldo', width: contentWidth * 0.15, align: 'right' },
  ]

  const drawTableHeader = () => {
    let x = margin
    doc.setFillColor(colors.bgSoft[0], colors.bgSoft[1], colors.bgSoft[2])
    doc.rect(margin, cursorY - 4, contentWidth, 7, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.8)
    setText([51, 65, 85])

    columns.forEach((column) => {
      const textX = column.align === 'right' ? x + column.width - 1 : x + 1
      doc.text(column.label, textX, cursorY, {
        align: column.align === 'right' ? 'right' : 'left',
      })
      x += column.width
    })

    cursorY += 8
    doc.setDrawColor(colors.lineSoft[0], colors.lineSoft[1], colors.lineSoft[2])
    doc.line(margin, cursorY - 4, margin + contentWidth, cursorY - 4)
  }

  const drawOrderRow = (row) => {
    ensureSpace(7)

    const values = {
      id: row.id,
      date: formatDate(row.createdAt),
      delivery: formatDate(row.deliveryDate),
      status: row.status,
      total: formatCurrency(row.total),
      paid: formatCurrency(row.paid),
      debt: formatCurrency(row.debt),
    }

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.8)

    let x = margin
    columns.forEach((column) => {
      const textX = column.align === 'right' ? x + column.width - 1 : x + 1
      const textColor =
        column.key === 'debt' && row.debt > 0
          ? colors.danger
          : colors.textMain

      setText(textColor)
      doc.text(values[column.key], textX, cursorY, {
        align: column.align === 'right' ? 'right' : 'left',
      })
      x += column.width
    })

    cursorY += 5.8
    doc.setDrawColor(241, 245, 249)
    doc.line(margin, cursorY - 2.1, margin + contentWidth, cursorY - 2.1)
  }

  if (displayRows.length > 0) {
    drawTableHeader()
    displayRows.forEach((row) => drawOrderRow(row))
  } else {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10.5)
    setText(colors.success)
    doc.text('Este cliente no posee deuda pendiente.', margin, cursorY + 2)
    cursorY += 10
  }

  ensureSpace(20)
  drawSeparator(4, 7)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  setText(colors.textMuted)
  doc.text('Documento generado automáticamente por PACKYA – Sistema de Gestión', pageWidth / 2, cursorY, { align: 'center' })
  cursorY += 5
  doc.text(`Generado: ${formatDate(new Date().toISOString())}`, pageWidth / 2, cursorY, { align: 'center' })

  const safeFileName = clientName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'cliente'
  doc.save(`${safeFileName}-estado-cuenta.pdf`)
}

const createPurchasePlanDoc = (plan) => {
  const safePlan = plan && typeof plan === 'object' ? plan : {}
  const safeRows = Array.isArray(safePlan.products) ? safePlan.products : []
  const createdAtLabel = formatDateTime(safePlan.createdAt)

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 14
  const contentWidth = pageWidth - margin * 2
  let cursorY = margin

  const ensureSpace = (neededHeight) => {
    if (cursorY + neededHeight <= pageHeight - margin) return
    doc.addPage()
    cursorY = margin
  }

  if (logoPackya) {
    doc.addImage(logoPackya, 'PNG', margin, cursorY - 2, 22, 22)
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('PLAN DE COMPRA ACUMULADO', margin + 26, cursorY + 5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(`Fecha: ${createdAtLabel}`, margin + 26, cursorY + 11)
  doc.text(`ID: ${String(safePlan.id ?? 'PLAN-SIN-ID')}`, margin + 26, cursorY + 16)
  cursorY += 28

  const columns = [
    { key: 'productName', label: 'Producto', width: contentWidth * 0.22, align: 'left' },
    { key: 'demandTotal', label: 'Demanda', width: contentWidth * 0.1, align: 'right' },
    { key: 'stockActual', label: 'Stock', width: contentWidth * 0.1, align: 'right' },
    { key: 'faltante', label: 'Faltante', width: contentWidth * 0.1, align: 'right' },
    { key: 'sugeridoComprar', label: 'Sugerido', width: contentWidth * 0.12, align: 'right' },
    { key: 'unitCost', label: 'Costo unit.', width: contentWidth * 0.16, align: 'right' },
    { key: 'costoEstimado', label: 'Costo total', width: contentWidth * 0.2, align: 'right' },
  ]

  const drawHeader = () => {
    let x = margin
    doc.setFillColor(248, 250, 252)
    doc.rect(margin, cursorY - 4, contentWidth, 7, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)

    columns.forEach((column) => {
      const textX = column.align === 'right' ? x + column.width - 1 : x + 1
      doc.text(column.label, textX, cursorY, {
        align: column.align === 'right' ? 'right' : 'left',
      })
      x += column.width
    })

    cursorY += 7.4
    doc.setDrawColor(226, 232, 240)
    doc.line(margin, cursorY - 3, margin + contentWidth, cursorY - 3)
  }

  const drawRow = (row) => {
    ensureSpace(7)
    let x = margin
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.3)

    const values = {
      productName: String(row.productName ?? 'Sin producto'),
      demandTotal: String(Number(row.demandTotal ?? 0)),
      stockActual: String(Number(row.stockActual ?? 0)),
      faltante: String(Number(row.faltante ?? 0)),
      sugeridoComprar: String(Number(row.sugeridoComprar ?? 0)),
      unitCost: formatCurrency(row.unitCost),
      costoEstimado: formatCurrency(row.costoEstimado),
    }

    columns.forEach((column) => {
      const textX = column.align === 'right' ? x + column.width - 1 : x + 1
      const textValue =
        column.key === 'productName'
          ? doc.splitTextToSize(values[column.key], column.width - 2)
          : values[column.key]
      doc.text(textValue, textX, cursorY, {
        align: column.align === 'right' ? 'right' : 'left',
      })
      x += column.width
    })

    cursorY += 5.6
    doc.setDrawColor(241, 245, 249)
    doc.line(margin, cursorY - 2.1, margin + contentWidth, cursorY - 2.1)
  }

  drawHeader()
  if (safeRows.length === 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text('No hay faltantes para este plan.', margin, cursorY + 2)
    cursorY += 8
  } else {
    safeRows.forEach((row) => drawRow(row))
  }

  ensureSpace(16)
  cursorY += 4
  doc.setFillColor(248, 250, 252)
  doc.roundedRect(margin, cursorY, contentWidth, 10, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Total estimado', margin + 3, cursorY + 6.7)
  doc.text(formatCurrency(safePlan.totalEstimado), margin + contentWidth - 3, cursorY + 6.7, {
    align: 'right',
  })

  return doc
}

export const downloadPurchasePlanPDF = (plan) => {
  const doc = createPurchasePlanDoc(plan)
  const fileName = `${String(plan?.id ?? 'plan-compra')}.pdf`
  doc.save(fileName)
}

export const openPurchasePlanPDF = (plan) => {
  const doc = createPurchasePlanDoc(plan)
  const blob = doc.output('blob')
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener,noreferrer')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export async function generateQuotePDF(quote) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 16
  const contentWidth = pageWidth - margin * 2
  let cursorY = 12

  const safeQuote = quote && typeof quote === 'object' ? quote : {}
  const quoteId = String(safeQuote.id ?? 'COT-SIN-ID')
  const clientName = String(safeQuote.clientName ?? 'Sin cliente')
  const deliveryType = String(safeQuote.deliveryType ?? 'Retiro en fábrica')
  const productionLeadTime = String(safeQuote.productionLeadTime ?? '').trim()
  const validUntil = String(safeQuote.validUntil ?? '')
  const createdAt = String(safeQuote.createdAt ?? new Date().toISOString())
  const baseStatus = String(safeQuote.status ?? 'Pendiente')
  const shippingCost = Number(safeQuote.shippingCost || 0)
  const items = Array.isArray(safeQuote.items) ? safeQuote.items : []

  const subtotal = items.reduce(
    (acc, item) => acc + Number(item?.quantity || 0) * Number(item?.unitPrice || 0),
    0,
  )
  const total = subtotal + Math.max(shippingCost, 0)
  const advanceRequired = total * 0.5
  const todayKey = (() => {
    const today = new Date()
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  })()
  const quoteStatus =
    baseStatus === 'Pendiente' && /^\d{4}-\d{2}-\d{2}$/.test(validUntil) && validUntil < todayKey
      ? 'Vencido'
      : baseStatus

  const colors = {
    textMain: [15, 23, 42],
    textMuted: [100, 116, 139],
    lineSoft: [226, 232, 240],
    bgSoft: [248, 250, 252],
    accent: [211, 38, 128],
    success: [22, 163, 74],
  }

  const setText = (rgb) => doc.setTextColor(rgb[0], rgb[1], rgb[2])

  const ensureSpace = (heightNeeded) => {
    if (cursorY + heightNeeded <= pageHeight - margin) return
    doc.addPage()
    cursorY = margin
  }

  const drawSeparator = (spacingBottom = 6) => {
    doc.setDrawColor(colors.lineSoft[0], colors.lineSoft[1], colors.lineSoft[2])
    doc.line(margin, cursorY, pageWidth - margin, cursorY)
    cursorY += spacingBottom
  }

  const drawStatusBadge = (label, color, x, y) => {
    const padX = 2.6
    const badgeHeight = 6.2
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.6)
    const textWidth = doc.getTextWidth(label)
    const badgeWidth = textWidth + padX * 2

    doc.setFillColor(245, 245, 245)
    doc.roundedRect(x, y, badgeWidth, badgeHeight, 1.5, 1.5, 'F')
    setText(color)
    doc.text(label, x + padX, y + 4.2)
    setText(colors.textMain)
  }

  doc.setFillColor(colors.accent[0], colors.accent[1], colors.accent[2])
  doc.rect(0, 0, pageWidth, 8, 'F')
  cursorY += 3

  if (logoPackya) {
    const logoWidth = 30
    const logoHeight = 30
    doc.addImage(logoPackya, 'PNG', pageWidth / 2 - logoWidth / 2, cursorY, logoWidth, logoHeight)
    cursorY += logoHeight + 3
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(24)
  setText(colors.textMain)
  doc.text('Presupuesto', pageWidth / 2, cursorY, { align: 'center' })
  cursorY += 7

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  setText(colors.textMuted)
  doc.text(`N° ${quoteId} · Emitido ${formatDate(new Date().toISOString())}`, pageWidth / 2, cursorY, { align: 'center' })
  cursorY += 5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.4)
  setText(colors.textMuted)
  doc.text('Soluciones de packaging a medida para impulsar tu marca.', pageWidth / 2, cursorY, { align: 'center' })
  cursorY += 6
  drawSeparator(7)

  const statusColor =
    quoteStatus === 'Aceptado'
      ? colors.success
      : quoteStatus === 'Rechazado' || quoteStatus === 'Vencido'
        ? [220, 38, 38]
        : [161, 98, 7]

  ensureSpace(29)
  const cardGap = 4
  const cardWidth = (contentWidth - cardGap * 2) / 3
  const cardHeight = 22

  const summaryCards = [
    { title: 'Cliente', value: clientName || 'Sin cliente' },
    { title: 'Validez', value: validUntil ? formatDate(validUntil) : 'Sin fecha' },
    { title: 'Total', value: formatCurrency(total), valueColor: colors.success, valueBold: true },
  ]

  summaryCards.forEach((card, index) => {
    const x = margin + index * (cardWidth + cardGap)
    doc.setFillColor(colors.bgSoft[0], colors.bgSoft[1], colors.bgSoft[2])
    doc.roundedRect(x, cursorY, cardWidth, cardHeight, 2.3, 2.3, 'F')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.8)
    setText(colors.textMuted)
    doc.text(card.title, x + 3, cursorY + 5.2)

    doc.setFont('helvetica', card.valueBold ? 'bold' : 'normal')
    doc.setFontSize(card.valueBold ? 11 : 9.7)
    setText(card.valueColor ?? colors.textMain)
    const valueLines = doc.splitTextToSize(String(card.value), cardWidth - 6)
    doc.text(valueLines, x + 3, cursorY + 11)
  })

  drawStatusBadge(`Estado: ${quoteStatus}`, statusColor, pageWidth - margin - 38, cursorY - 7)
  cursorY += cardHeight + 7

  ensureSpace(32)
  doc.setFillColor(colors.bgSoft[0], colors.bgSoft[1], colors.bgSoft[2])
  doc.roundedRect(margin, cursorY, contentWidth, 28, 2.4, 2.4, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  setText(colors.textMain)
  doc.text('Detalles de entrega', margin + 4, cursorY + 6)

  doc.setFontSize(9.5)
  setText(colors.textMuted)
  doc.text(`Entrega: ${deliveryType}`, margin + 4, cursorY + 12)
  doc.text(`Validez: ${validUntil ? formatDate(validUntil) : 'Sin fecha'}`, margin + 4, cursorY + 18)
  doc.text(`Producción estimada: ${productionLeadTime || 'A confirmar'}`, margin + 4, cursorY + 24)

  cursorY += 34

  const columns = [
    { key: 'description', label: 'Descripción', width: contentWidth * 0.5, align: 'left' },
    { key: 'quantity', label: 'Cantidad', width: contentWidth * 0.14, align: 'right' },
    { key: 'unitPrice', label: 'Precio unit.', width: contentWidth * 0.18, align: 'right' },
    { key: 'lineTotal', label: 'Subtotal', width: contentWidth * 0.18, align: 'right' },
  ]

  const drawTableHeader = () => {
    let x = margin
    doc.setFillColor(colors.bgSoft[0], colors.bgSoft[1], colors.bgSoft[2])
    doc.rect(margin, cursorY - 4, contentWidth, 7, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.2)
    setText([51, 65, 85])

    columns.forEach((column) => {
      const textX = column.align === 'right' ? x + column.width - 1 : x + 1
      doc.text(column.label, textX, cursorY, {
        align: column.align === 'right' ? 'right' : 'left',
      })
      x += column.width
    })

    cursorY += 7.6
    doc.setDrawColor(colors.lineSoft[0], colors.lineSoft[1], colors.lineSoft[2])
    doc.line(margin, cursorY - 3, margin + contentWidth, cursorY - 3)
  }

  const drawItemRow = (item) => {
    ensureSpace(7)
    let x = margin

    const quantity = Number(item?.quantity || 0)
    const unitPrice = Number(item?.unitPrice || 0)
    const lineTotal = quantity * unitPrice

    const values = {
      description: String(item?.description ?? 'Sin descripción'),
      quantity: String(quantity),
      unitPrice: formatCurrency(unitPrice),
      lineTotal: formatCurrency(lineTotal),
    }

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    setText(colors.textMain)

    columns.forEach((column) => {
      const textX = column.align === 'right' ? x + column.width - 1 : x + 1
      const textValue =
        column.key === 'description'
          ? doc.splitTextToSize(values[column.key], column.width - 2)
          : values[column.key]

      doc.text(textValue, textX, cursorY, {
        align: column.align === 'right' ? 'right' : 'left',
      })

      x += column.width
    })

    cursorY += 5.8
    doc.setDrawColor(241, 245, 249)
    doc.line(margin, cursorY - 2.1, margin + contentWidth, cursorY - 2.1)
  }

  drawTableHeader()

  if (items.length > 0) {
    items.forEach((item) => drawItemRow(item))
  } else {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    setText(colors.textMuted)
    doc.text('Sin detalle de ítems.', margin, cursorY + 2)
    cursorY += 8
  }

  cursorY += 3
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  setText(colors.textMain)
  doc.text('Subtotal', margin, cursorY)
  doc.text(formatCurrency(subtotal), pageWidth - margin, cursorY, { align: 'right' })
  cursorY += 6

  doc.text('Costo de envío', margin, cursorY)
  doc.text(formatCurrency(deliveryType === 'Envío' ? shippingCost : 0), pageWidth - margin, cursorY, { align: 'right' })
  cursorY += 6

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Total presupuesto', margin, cursorY)
  doc.text(formatCurrency(total), pageWidth - margin, cursorY, { align: 'right' })
  cursorY += 8

  ensureSpace(32)
  doc.setFillColor(255, 245, 247)
  doc.roundedRect(margin, cursorY, contentWidth, 24, 2.5, 2.5, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  setText(colors.textMain)
  doc.text('Condiciones del presupuesto', margin + 4, cursorY + 6)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  setText(colors.textMuted)
  doc.text('• Inicio de producción con anticipo del 50%.', margin + 4, cursorY + 11.4)
  doc.text('• Saldo contra entrega o según acuerdo comercial.', margin + 4, cursorY + 15.8)
  doc.text(`• Presupuesto emitido: ${formatDate(createdAt)}.`, margin + 4, cursorY + 20.2)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  setText(colors.success)
  doc.text(`Anticipo mínimo: ${formatCurrency(advanceRequired)}`, pageWidth - margin - 4, cursorY + 20.2, { align: 'right' })
  cursorY += 28

  const qrDataUrl = await getPaymentQrDataUrl()
  if (qrDataUrl) {
    ensureSpace(42)
    doc.setFillColor(colors.bgSoft[0], colors.bgSoft[1], colors.bgSoft[2])
    doc.roundedRect(margin, cursorY, contentWidth, 36, 2.6, 2.6, 'F')
    doc.addImage(qrDataUrl, 'PNG', margin + 4, cursorY + 4, 24, 24)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10.3)
    setText(colors.textMain)
    doc.text('Pago de anticipo por MercadoPago', margin + 32, cursorY + 9)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    setText(colors.textMuted)
    doc.text('Escaneá el QR para realizar el pago y enviar comprobante.', margin + 32, cursorY + 14.4)
    doc.text('Alias / Link: packya', margin + 32, cursorY + 19.8)
    doc.text('Luego coordinamos fecha exacta de producción y entrega.', margin + 32, cursorY + 25.2)
    cursorY += 40
  }

  ensureSpace(12)
  drawSeparator(4)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.8)
  setText(colors.textMuted)
  doc.text('Documento generado automáticamente por PACKYA – Presupuesto no fiscal.', pageWidth / 2, cursorY, { align: 'center' })

  doc.save(`${quoteId}.pdf`)
}