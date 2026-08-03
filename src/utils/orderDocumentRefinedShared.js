import { getOrderFinancialSummary } from './finance.js'
import { buildOrderItemTableRows, getOrderStatusBadge, getWorkTypeSelections } from './orderDocumentHelpers.js'
import { getSvgIntrinsicMetrics } from './svgAspectPlacement.js'

const PAGE = {
  width: 210,
  height: 297,
  marginX: 16,
  contentGap: 8,
  sectionGap: 6,
}

const COLORS = {
  black: [11, 11, 13],
  gray: [107, 114, 128],
  lightGray: [248, 248, 249],
  border: [234, 234, 234],
  cardFill: [255, 255, 255],
  magenta: [236, 0, 140],
  cyan: [0, 174, 239],
  yellow: [255, 242, 0],
  success: [22, 163, 74],
  danger: [220, 38, 38],
}

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

const toFileDate = (value = new Date()) => {
  const parsed = new Date(value)
  const safeDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed
  const year = safeDate.getFullYear()
  const month = String(safeDate.getMonth() + 1).padStart(2, '0')
  const day = String(safeDate.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const sanitizeFilePart = (value) => {
  const normalized = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-_]/g, '')
    .trim()

  return normalized || 'SinCliente'
}

const applyText = (doc, options = {}) => {
  const {
    family = 'Inter',
    style = 'normal',
    size = 9,
    color = COLORS.black,
  } = options

  doc.setFont(family, style)
  doc.setFontSize(size)
  doc.setTextColor(color[0], color[1], color[2])
}

const drawText = (doc, text, x, y, options = {}) => {
  const { align = 'left', maxWidth } = options
  applyText(doc, options)
  const safeText = text == null ? '' : String(text)
  const lines = maxWidth ? doc.splitTextToSize(safeText, maxWidth) : safeText
  doc.text(lines, x, y, { align })
  return Array.isArray(lines) ? lines.length : 1
}

const clampTextLines = (doc, text, maxWidth, maxLines, textOptions = {}) => {
  const safeText = text == null ? '' : String(text)
  if (!safeText) return ['']

  applyText(doc, textOptions)
  const lines = doc.splitTextToSize(safeText, maxWidth)
  if (lines.length <= maxLines) return lines

  const clipped = lines.slice(0, maxLines)
  const ellipsis = '...'
  let tail = String(clipped[maxLines - 1] ?? '')

  while (tail.length > 0 && doc.getTextWidth(`${tail}${ellipsis}`) > maxWidth) {
    tail = tail.slice(0, -1).trimEnd()
  }

  clipped[maxLines - 1] = `${tail}${ellipsis}`
  return clipped
}

const withSvgOpacity = (svg, opacity = 0.03) => {
  const safeSvg = String(svg ?? '')
  if (!safeSvg) return ''

  const alpha = Math.max(0, Math.min(1, Number(opacity) || 0))
  if (!/<svg\b/i.test(safeSvg)) return safeSvg
  if (/opacity\s*=\s*"[^"]*"/i.test(safeSvg)) {
    return safeSvg.replace(/opacity\s*=\s*"[^"]*"/i, `opacity="${alpha}"`)
  }

  return safeSvg.replace(/<svg\b([^>]*)>/i, `<svg$1 opacity="${alpha}">`)
}

const drawRoundedCard = (
  doc,
  x,
  y,
  width,
  height,
  {
    fillColor = COLORS.cardFill,
    borderColor = COLORS.border,
    radius = 4.6,
    lineWidth = 0.24,
  } = {},
) => {
  doc.setFillColor(fillColor[0], fillColor[1], fillColor[2])
  doc.setDrawColor(borderColor[0], borderColor[1], borderColor[2])
  doc.setLineWidth(lineWidth)
  doc.roundedRect(x, y, width, height, radius, radius, 'FD')
}

const drawHairline = (doc, x1, y1, x2, y2, color = COLORS.border) => {
  doc.setDrawColor(color[0], color[1], color[2])
  doc.setLineWidth(0.2)
  doc.line(x1, y1, x2, y2)
}

const drawFilledRoundedRect = (doc, x, y, width, height, radius, fillColor) => {
  doc.setFillColor(fillColor[0], fillColor[1], fillColor[2])
  doc.roundedRect(x, y, width, height, radius, radius, 'F')
}

const getStatusColor = (badge) => {
  if (badge.tone === 'success') return COLORS.success
  if (badge.tone === 'accent') return COLORS.magenta
  if (badge.tone === 'info') return COLORS.cyan
  return [161, 98, 7]
}

const buildViewModel = (order, constants) => {
  const safeOrder = order && typeof order === 'object' ? order : {}
  const financial = getOrderFinancialSummary(safeOrder)
  const rows = buildOrderItemTableRows(financial.items)
  const workTypes = getWorkTypeSelections(financial.items)
  const statusBadge = getOrderStatusBadge(safeOrder.status)

  return {
    order: safeOrder,
    statusBadge,
    clientName: String(safeOrder.clientName ?? safeOrder.client ?? 'Sin cliente'),
    clientCompany: String(safeOrder.clientCompany ?? safeOrder.company ?? safeOrder.empresa ?? safeOrder.businessName ?? '').trim(),
    clientTaxId: String(safeOrder.clientCuit ?? safeOrder.clientTaxId ?? safeOrder.cuit ?? safeOrder.taxId ?? '').trim(),
    clientResponsible: String(safeOrder.clientResponsible ?? safeOrder.responsible ?? safeOrder.responsable ?? safeOrder.contactName ?? '').trim(),
    clientPhone: String(safeOrder.phone ?? safeOrder.clientPhone ?? '').trim(),
    clientEmail: String(safeOrder.email ?? safeOrder.clientEmail ?? '').trim(),
    issuedAt: formatDate(safeOrder.createdAt ?? new Date().toISOString()),
    deliveryDate: formatDate(safeOrder.deliveryDate ?? ''),
    rows,
    workTypes,
    totals: {
      subtotal: financial.effectiveSubtotal,
      discount: financial.discount,
      total: financial.finalTotal,
      paid: financial.totalPaid,
      debt: financial.remainingDebt,
      financialStatus: financial.financialStatus,
    },
    payments: financial.payments,
    note: String(safeOrder.financialNote ?? '').trim(),
    transferAccounts: constants.transferAccounts ?? [],
    contactPhone: constants.contactPhone ?? '',
    website: constants.website ?? '',
    fileName: `Orden_Trabajo_${sanitizeFilePart(safeOrder.clientName ?? safeOrder.client ?? 'SinCliente')}_${toFileDate(new Date())}.pdf`,
  }
}

const getNaturalHeightForPageWidth = (svg) => {
  const metrics = getSvgIntrinsicMetrics(svg)
  return PAGE.width * (metrics.intrinsicHeight / metrics.intrinsicWidth)
}

export const renderRefinedOrderPdf = async (doc, order, options) => {
  const { renderSvg, ensureFonts, assets, constants } = options
  if (typeof renderSvg !== 'function') throw new Error('renderSvg is required')
  if (typeof ensureFonts === 'function') await ensureFonts(doc)

  const vm = buildViewModel(order, constants)
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const headerSvg = assets.header
  const footerSvg = assets.footer
  const watermarkSvg = assets.watermark
  const icons = assets.icons ?? {}
  const headerHeight = getNaturalHeightForPageWidth(headerSvg)
  const footerHeight = getNaturalHeightForPageWidth(footerSvg)
  const contentX = PAGE.marginX
  const contentWidth = pageWidth - PAGE.marginX * 2
  const contentTop = headerHeight + PAGE.contentGap
  const contentBottom = pageHeight - footerHeight - PAGE.contentGap
  const debug = {
    pageCount: 0,
    counts: { header: 0, footer: 0, productsHeader: 0, productRows: 0, totals: 0, payment: 0 },
    pages: [],
  }

  let cursorY = 0
  let pageIndex = 0

  const registerPage = () => {
    pageIndex += 1
    debug.pageCount = pageIndex
    debug.pages.push({ pageNumber: pageIndex, blocks: [], rowCount: 0, hasTotals: false, hasPayment: false, hasFooter: false, repeatedProductsHeader: false })
  }

  const currentPage = () => debug.pages[debug.pages.length - 1]

  const drawWatermark = async () => {
    if (!watermarkSvg) return
    const metrics = getSvgIntrinsicMetrics(watermarkSvg)
    const watermarkWidth = pageWidth * 0.84
    const watermarkHeight = watermarkWidth * (metrics.intrinsicHeight / metrics.intrinsicWidth)
    const wmX = (pageWidth - watermarkWidth) / 2
    const wmY = (pageHeight - watermarkHeight) / 2
    await renderSvg(doc, watermarkSvg, wmX, wmY, watermarkWidth, watermarkHeight)
  }

  const drawIcon = async (svg, x, y, size) => {
    if (!svg) return
    await renderSvg(doc, svg, x, y, size, size)
  }

  const drawSectionTitle = async ({ icon, label, x = contentX, y = cursorY, color = COLORS.black }) => {
    await drawIcon(icon, x, y - 3.1, 3.8)
    drawText(doc, label, x + 6.2, y, {
      family: 'Montserrat',
      style: 'bold',
      size: 9.8,
      color,
    })
  }

  const getStatusBadgeFill = (badge) => {
    if (badge.tone === 'success') return [20, 83, 45]
    if (badge.tone === 'accent') return [37, 99, 235]
    if (badge.tone === 'info') return [8, 145, 178]
    return [234, 179, 8]
  }

  const getStatusBadgeTextColor = (badge) => {
    if (badge.tone === 'warning') return COLORS.black
    return [255, 255, 255]
  }

  const getStatusBadgeIcon = (badge) => {
    if (badge.tone === 'success') return icons.statusOk
    return icons.statusAlert
  }

  const drawHeader = async () => {
    await renderSvg(doc, headerSvg, 0, 0, pageWidth, headerHeight)
    debug.counts.header += 1
    currentPage().blocks.push('header')
  }

  const drawFooter = async (pageNumber, totalPages) => {
    doc.setPage(pageNumber)
    await renderSvg(doc, footerSvg, 0, pageHeight - footerHeight, pageWidth, footerHeight)
    const page = debug.pages[pageNumber - 1]
    page.blocks.push('footer')
    page.hasFooter = true
    debug.counts.footer += 1
    drawText(doc, `Pagina ${pageNumber} de ${totalPages}`, pageWidth - PAGE.marginX, pageHeight - 6.5, {
      family: 'Montserrat',
      style: 'normal',
      size: 7.2,
      align: 'right',
      color: COLORS.gray,
    })
  }

  const startPage = async ({ repeatTableHeader = false } = {}) => {
    if (pageIndex > 0) doc.addPage()
    registerPage()
    await drawHeader()
    await drawWatermark()
    cursorY = contentTop
    if (repeatTableHeader) await drawProductsHeaderRow(true)
  }

  const ensureSpace = async (heightNeeded, repeatHeader = false) => {
    if (cursorY + heightNeeded <= contentBottom) return
    await startPage({ repeatTableHeader: repeatHeader })
  }

  const drawTitle = async () => {
    const badgeFill = getStatusBadgeFill(vm.statusBadge)
    const badgeTextColor = getStatusBadgeTextColor(vm.statusBadge)
    const badgeText = vm.statusBadge.label
    applyText(doc, { family: 'Montserrat', style: 'bold', size: 10.2, color: [255, 255, 255] })
    const badgeHeight = 11
    const badgeIconSize = 5.4
    const badgeWidth = Math.max(52, doc.getTextWidth(badgeText) + 26)
    const badgeX = pageWidth - PAGE.marginX - badgeWidth
    const badgeY = contentTop + 11.8

    drawText(doc, 'ORDEN DE TRABAJO', contentX, contentTop + 3.5, {
      family: 'Montserrat',
      style: 'bold',
      size: 28,
      align: 'left',
      color: COLORS.black,
    })
    drawText(doc, 'Documento interno de producción', contentX, contentTop + 8, {
      family: 'Montserrat',
      style: 'normal',
      size: 7.2,
      align: 'left',
      color: COLORS.gray,
    })

    drawFilledRoundedRect(doc, badgeX, badgeY, badgeWidth, badgeHeight, 4.8, badgeFill)
    drawText(doc, badgeText, badgeX + badgeWidth / 2, badgeY + 7.2, {
      family: 'Montserrat',
      style: 'bold',
      size: 10.2,
      align: 'center',
      color: badgeTextColor,
    })

    drawHairline(doc, contentX, contentTop + 24.5, contentX + contentWidth, contentTop + 24.5, [233, 233, 235])

    cursorY += 24
  }

  const drawOverview = async () => {
    const cardHeight = 35
    const cardGap = 6
    const clientCardWidth = 112
    const orderCardWidth = contentWidth - clientCardWidth - cardGap
    const clientCardX = contentX
    const orderCardX = clientCardX + clientCardWidth + cardGap
    const priorityLabel = vm.order.urgent ? 'Alta' : 'Normal'
    const priorityColor = vm.order.urgent ? COLORS.magenta : COLORS.gray

    const clientDetails = [
      vm.clientCompany ? `Empresa: ${vm.clientCompany}` : '',
      vm.clientTaxId ? `CUIT: ${vm.clientTaxId}` : '',
      vm.clientResponsible ? `Responsable: ${vm.clientResponsible}` : '',
    ].filter(Boolean)

    drawRoundedCard(doc, clientCardX, cursorY, clientCardWidth, cardHeight, {
      fillColor: [255, 255, 255],
      borderColor: [231, 231, 233],
      radius: 4.6,
      lineWidth: 0.24,
    })
    drawRoundedCard(doc, orderCardX, cursorY, orderCardWidth, cardHeight, {
      fillColor: [255, 255, 255],
      borderColor: [231, 231, 233],
      radius: 4.6,
      lineWidth: 0.24,
    })

    await drawSectionTitle({ icon: icons.customer, label: 'Cliente', x: clientCardX + 5, y: cursorY + 7.8 })

    const clientNameLines = clampTextLines(doc, vm.clientName, clientCardWidth - 10, 2, {
      family: 'Montserrat',
      style: 'bold',
      size: 11.4,
      color: COLORS.black,
    })
    applyText(doc, {
      family: 'Montserrat',
      style: 'bold',
      size: 11.4,
      color: COLORS.black,
    })
    doc.text(clientNameLines, clientCardX + 5, cursorY + 15.6)
    const hasWrappedClientName = clientNameLines.length > 1

    if (clientDetails.length > 0) {
      drawText(doc, clientDetails.join('  •  '), clientCardX + 5, cursorY + (hasWrappedClientName ? 23.1 : 20.7), {
        family: 'Inter',
        size: 6.4,
        color: COLORS.gray,
        maxWidth: clientCardWidth - 10,
      })
    }

    if (vm.clientPhone) {
      await drawIcon(icons.contactPhone, clientCardX + 5, cursorY + (hasWrappedClientName ? 22.4 : 20), 3.6)
      drawText(doc, vm.clientPhone, clientCardX + 10.2, cursorY + (hasWrappedClientName ? 27 : 24.6), {
        family: 'Inter',
        size: 7.8,
        color: COLORS.gray,
      })
    }

    if (vm.clientEmail) {
      await drawIcon(icons.contactMail, clientCardX + 5, cursorY + (hasWrappedClientName ? 27.4 : 25), 3.6)
      drawText(doc, vm.clientEmail, clientCardX + 10.2, cursorY + (hasWrappedClientName ? 31.4 : 29), {
        family: 'Inter',
        size: 7.3,
        color: COLORS.gray,
        maxWidth: clientCardWidth - 16,
      })
    }

    await drawSectionTitle({ icon: icons.documentOrder, label: 'Pedido', x: orderCardX + 5, y: cursorY + 7.8 })

    const metaX = orderCardX + 5
    const metaWidth = orderCardWidth - 10
    const metaRows = [
      ['Pedido', String(vm.order.id ?? 'SIN-ID')],
      ['Emisión', vm.issuedAt],
      ['Entrega', vm.deliveryDate || 'Sin fecha'],
      ['Prioridad', priorityLabel],
    ]
    const metaIcons = [icons.documentOrder, icons.contactDate, icons.operationDelivery, icons.statusAlert]

    metaRows.forEach(([label, value], index) => {
      const y = cursorY + 14.4 + index * 5.3
      drawText(doc, value, metaX + metaWidth, y, {
        family: 'Montserrat',
        style: 'bold',
        size: 7.8,
        align: 'right',
        color: label === 'Prioridad' ? priorityColor : COLORS.black,
      })
    })

    for (let index = 0; index < metaRows.length; index += 1) {
      const y = cursorY + 10.7 + index * 5.3
      await drawIcon(metaIcons[index], metaX, y, 3.4)
      drawText(doc, metaRows[index][0], metaX + 5, y + 3.1, {
        family: 'Inter',
        size: 6.9,
        color: COLORS.gray,
      })
    }

    drawHairline(doc, contentX, cursorY + cardHeight + 1.8, contentX + contentWidth, cursorY + cardHeight + 1.8)

    currentPage().blocks.push('overview')
    cursorY += cardHeight + 5
  }

  const drawSectionLabel = async (label, icon) => {
    await drawSectionTitle({ icon, label, x: contentX, y: cursorY + 2.5 })
    cursorY += 4.8
  }

  const columns = [
    { key: 'product', label: 'Producto', x: 0, width: 72, align: 'left' },
    { key: 'measure', label: 'Medida', x: 84, width: 18, align: 'left' },
    { key: 'quantity', label: 'Cant.', x: 108, width: 12, align: 'right' },
    { key: 'unitPrice', label: 'P.Unit', x: 128, width: 24, align: 'right' },
    { key: 'total', label: 'Total', x: 157, width: 17, align: 'right' },
  ]

  const drawProductsHeaderRow = async (isRepeated = false) => {
    currentPage().repeatedProductsHeader = true
    debug.counts.productsHeader += 1
    currentPage().blocks.push('products-header')

    await drawSectionLabel('Productos', icons.supportProduct)

    doc.setFillColor(11, 11, 13)
    doc.roundedRect(contentX, cursorY, contentWidth, 8.6, 2.8, 2.8, 'F')
    cursorY += 5.8
    columns.forEach((column) => {
      const labelX = contentX + column.x + (column.align === 'right' ? column.width : 0) + (column.key === 'product' ? 2 : 0)
      drawText(doc, column.label, labelX, cursorY, {
        family: 'Montserrat',
        style: 'bold',
        size: 6.9,
        color: [255, 255, 255],
        align: column.align,
      })
    })
    cursorY += 4.3
  }

  const getRowHeight = (row) => {
    const descriptionText = [row.description !== 'Sin descripción' ? row.description : '', row.design !== '-' ? row.design : '']
      .filter(Boolean)
      .join(' · ')
    const descLines = descriptionText ? doc.splitTextToSize(descriptionText, 70).length : 0
    return 9.4 + descLines * 3.9 + (row.isClientMaterial ? 4 : 0)
  }

  const drawRow = (row) => {
    const rowHeight = getRowHeight(row)
    const topY = cursorY

    drawText(doc, row.product, contentX + columns[0].x, topY + 4.4, {
      family: 'Montserrat',
      style: 'semiBold',
      size: 8.6,
      color: COLORS.black,
      maxWidth: 72,
    })

    const descriptionText = [row.description !== 'Sin descripción' ? row.description : '', row.design !== '-' ? row.design : '']
      .filter(Boolean)
      .join(' · ')
    if (descriptionText) {
      drawText(doc, descriptionText, contentX + columns[0].x, topY + 8.9, {
        family: 'Inter',
        size: 7.2,
        color: COLORS.gray,
        maxWidth: 72,
      })
    }

    if (row.isClientMaterial) {
      drawText(doc, 'Material del cliente', contentX + columns[0].x, topY + rowHeight - 2, {
        family: 'Inter',
        size: 6.9,
        color: COLORS.magenta,
      })
    }

    drawText(doc, row.measure === '-' ? '' : row.measure, contentX + columns[1].x, topY + 4.4, {
      family: 'Inter',
      size: 7.7,
      color: COLORS.black,
    })
    drawText(doc, row.quantity, contentX + columns[2].x + columns[2].width, topY + 4.4, {
      family: 'Montserrat',
      style: 'semiBold',
      size: 8,
      color: COLORS.black,
      align: 'right',
    })
    drawText(doc, formatCurrency(row.unitPrice), contentX + columns[3].x + columns[3].width, topY + 4.4, {
      family: 'Inter',
      size: 7.7,
      color: COLORS.black,
      align: 'right',
    })
    drawText(doc, formatCurrency(row.total), contentX + columns[4].x + columns[4].width, topY + 4.4, {
      family: 'Montserrat',
      style: 'semiBold',
      size: 8.2,
      color: COLORS.black,
      align: 'right',
    })

    cursorY += rowHeight + 2.4
    currentPage().rowCount += 1
    debug.counts.productRows += 1
    currentPage().blocks.push('product-row')
  }

  const drawWorkTypes = () => {
    const active = vm.workTypes.filter((item) => item.checked)
    if (active.length === 0) return 0

    const chipHeight = 7
    let x = contentX
    let y = cursorY
    active.forEach((item, index) => {
      const label = item.label
      applyText(doc, { family: 'Montserrat', style: 'semiBold', size: 7.2, color: COLORS.black })
      const width = doc.getTextWidth(label) + 10
      if (x + width > contentX + contentWidth) {
        x = contentX
        y += chipHeight + 3
      }
      doc.setFillColor(245, 246, 248)
      doc.roundedRect(x, y, width, chipHeight, 2, 2, 'F')
      drawText(doc, label, x + width / 2, y + 4.7, {
        family: 'Montserrat',
        style: 'semiBold',
        size: 7,
        align: 'center',
        color: COLORS.gray,
      })
      x += width + 3
      if (index === active.length - 1) cursorY = y + chipHeight
    })
    currentPage().blocks.push('work-types')
    return 1
  }

  const getSummaryBlockHeight = () => 28 + 5.5 + 5.2

  const getPaymentBlockHeight = () => {
    const count = Math.max(1, Math.min(2, vm.transferAccounts.length || 2))
    return 11.5 + 5.2 + count * 16 + Math.max(0, count - 1) * 3 + 5
  }

  const getObservationsBlockHeight = () => {
    const noteHeight = vm.note
      ? Math.max(16, 10 + doc.splitTextToSize(vm.note, contentWidth - 12).length * 4)
      : 14
    return 5.2 + noteHeight + 5
  }

  const getBottomBlocksHeight = () => {
    const workTypeHeight = vm.workTypes.some((item) => item.checked) ? 12 : 0
    return workTypeHeight + getSummaryBlockHeight() + getPaymentBlockHeight() + getObservationsBlockHeight()
  }

  const drawBottomBlocks = async () => {
    if (pageIndex >= 3 && currentPage().rowCount > 0) {
      await startPage()
    }

    const noteHeight = vm.note
      ? Math.max(18, 10 + doc.splitTextToSize(vm.note, contentWidth - 12).length * 4.2)
      : 18
    const activeWorkTypes = vm.workTypes.filter((item) => item.checked)
    if (activeWorkTypes.length > 0) {
      await ensureSpace(18, false)
      await drawSectionLabel('Tipo de trabajo', icons.actionConfig)
      drawWorkTypes()
      cursorY += 4.5
    }

    const summaryHeight = 28
    const paymentCardHeight = 16
    const paymentGap = 3
    const observationsHeight = noteHeight

    const summaryLeadIn = 2.4
    await ensureSpace(summaryLeadIn + getSummaryBlockHeight(), false)
    cursorY += summaryLeadIn
    await drawSectionLabel('Resumen económico', icons.operationPrice)
    drawRoundedCard(doc, contentX, cursorY, contentWidth, summaryHeight, {
      fillColor: [255, 255, 255],
      borderColor: [231, 231, 233],
      radius: 4.8,
      lineWidth: 0.24,
    })

    const summaryRows = [
      ['Subtotal', formatCurrency(vm.totals.subtotal)],
      ['Descuento', vm.totals.discount > 0 ? `- ${formatCurrency(vm.totals.discount)}` : '$ 0'],
      ['Total abonado', formatCurrency(vm.totals.paid)],
      ['Saldo pendiente', formatCurrency(vm.totals.debt)],
    ]

    summaryRows.forEach(([label, value], index) => {
      const rowY = cursorY + 7.3 + index * 4.2
      drawText(doc, label, contentX + 6, rowY, {
        family: 'Inter',
        size: 6.6,
        color: COLORS.gray,
      })
      drawText(doc, value, contentX + 46, rowY, {
        family: 'Montserrat',
        style: 'semiBold',
        size: 7.1,
        color: label === 'Saldo pendiente' && vm.totals.debt > 0 ? COLORS.danger : COLORS.black,
      })
    })

    drawText(doc, 'TOTAL A PAGAR', contentX + 111, cursorY + 9.1, {
      family: 'Montserrat',
      style: 'semiBold',
      size: 7.6,
      color: COLORS.gray,
    })
    drawText(doc, formatCurrency(vm.totals.total), contentX + contentWidth - 8, cursorY + 18.3, {
      family: 'Montserrat',
      style: 'bold',
      size: 18,
      align: 'right',
      color: COLORS.magenta,
    })
    drawText(doc, vm.totals.financialStatus, contentX + contentWidth - 8, cursorY + 23.2, {
      family: 'Montserrat',
      style: 'semiBold',
      size: 6.8,
      align: 'right',
      color: COLORS.gray,
    })

    cursorY += summaryHeight + 5.5

    await ensureSpace(getPaymentBlockHeight(), false)
    drawRoundedCard(doc, contentX, cursorY, contentWidth, 8.2, {
      fillColor: [248, 248, 249],
      borderColor: [231, 231, 233],
      radius: 4,
      lineWidth: 0.22,
    })
    drawFilledRoundedRect(doc, contentX + 4, cursorY + 1.8, 2, 4.8, 1, COLORS.black)
    drawText(doc, 'RECOMENDACION OPERATIVA', contentX + 9, cursorY + 3.8, {
      family: 'Montserrat',
      style: 'semiBold',
      size: 5.2,
      color: COLORS.gray,
    })
    drawText(doc, 'La produccion inicia una vez acreditada la seña correspondiente.', contentX + 9, cursorY + 6.4, {
      family: 'Montserrat',
      style: 'semiBold',
      size: 6.2,
      color: COLORS.black,
      maxWidth: contentWidth - 14,
    })

    cursorY += 10.5

    await drawSectionLabel('Información de Pago', icons.operationPayment)
    vm.transferAccounts.slice(0, 2).forEach((account, index) => {
      const cardY = cursorY + index * (paymentCardHeight + paymentGap)
      const accent = index === 0 ? COLORS.magenta : COLORS.cyan
      const isPrimary = index === 0
      drawRoundedCard(doc, contentX, cardY, contentWidth, paymentCardHeight, {
        fillColor: isPrimary ? [252, 250, 252] : [251, 253, 255],
        borderColor: isPrimary ? [236, 0, 140] : [0, 174, 239],
        radius: 4.8,
        lineWidth: isPrimary ? 0.3 : 0.28,
      })
      drawFilledRoundedRect(doc, contentX + 4, cardY + 3.6, isPrimary ? 2.6 : 2.2, paymentCardHeight - 7.2, 1.1, accent)
      drawText(doc, index === 0 ? 'CUENTA PRINCIPAL' : 'CUENTA ALTERNATIVA', contentX + 10, cardY + 5.3, {
        family: 'Montserrat',
        style: 'semiBold',
        size: isPrimary ? 6.8 : 6.4,
        color: isPrimary ? COLORS.black : COLORS.gray,
      })

      if (isPrimary) {
        drawFilledRoundedRect(doc, contentX + contentWidth - 45, cardY + 3.1, 39, 4.6, 2.1, [252, 241, 248])
        drawText(doc, 'Cuenta recomendada', contentX + contentWidth - 25.5, cardY + 6.3, {
          family: 'Montserrat',
          style: 'semiBold',
          size: 4.8,
          align: 'center',
          color: COLORS.magenta,
        })
      }

      const aliasX = contentX + 10
      const detailX = contentX + 95

      drawText(doc, 'ALIAS', aliasX, cardY + 8.4, {
        family: 'Montserrat',
        style: 'semiBold',
        size: 5.9,
        color: COLORS.gray,
      })
      drawText(doc, account.alias || '-', aliasX, cardY + 13.9, {
        family: 'Montserrat',
        style: 'bold',
        size: isPrimary ? 11.2 : 10,
        color: isPrimary ? COLORS.magenta : COLORS.black,
        maxWidth: 78,
      })

      drawText(doc, 'Titular', detailX, cardY + 5.9, {
        family: 'Inter',
        size: 6.4,
        color: COLORS.gray,
      })
      drawText(doc, account.holder || '-', detailX, cardY + 8.7, {
        family: 'Montserrat',
        style: 'semiBold',
        size: 7,
        color: COLORS.black,
        maxWidth: 46,
      })

      drawText(doc, 'CUIT', detailX, cardY + 10.8, {
        family: 'Inter',
        size: 6.1,
        color: COLORS.gray,
      })
      drawText(doc, account.cuil || '-', detailX, cardY + 13.2, {
        family: 'Montserrat',
        style: 'semiBold',
        size: 6.4,
        color: COLORS.black,
        maxWidth: 46,
      })
    })

    cursorY += paymentCardHeight * Math.min(2, vm.transferAccounts.length || 2) + paymentGap * Math.max(0, Math.min(2, vm.transferAccounts.length || 2) - 1) + 5

    const observationBlockHeight = getObservationsBlockHeight()
    const hasObservationNote = Boolean(vm.note)
    const canRenderEmptyObservationsInCurrentPage = cursorY + observationBlockHeight <= contentBottom

    if (hasObservationNote || canRenderEmptyObservationsInCurrentPage) {
      await ensureSpace(observationBlockHeight, false)
      await drawSectionLabel('Observaciones y notas', icons.supportNotes)
      drawRoundedCard(doc, contentX, cursorY, contentWidth, observationsHeight, {
        fillColor: [255, 255, 255],
        borderColor: [231, 231, 233],
        radius: 4.8,
        lineWidth: 0.24,
      })
      if (vm.note) {
        drawText(doc, vm.note, contentX + 6, cursorY + 8, {
          family: 'Inter',
          size: 7,
          color: COLORS.gray,
          maxWidth: contentWidth - 12,
        })
      }

      const lineStartX = contentX + 6
      const lineEndX = contentX + contentWidth - 6
      const baseLineY = vm.note ? cursorY + observationsHeight - 10.5 : cursorY + 5.4
      const lineGap = 3.9
      for (let index = 0; index < 3; index += 1) {
        const lineY = baseLineY + index * lineGap
        if (lineY < cursorY + observationsHeight - 1.2) {
          drawHairline(doc, lineStartX, lineY, lineEndX, lineY, [236, 236, 238])
        }
      }

      cursorY += observationsHeight + 5
    }

    currentPage().blocks.push('totals')
    currentPage().hasTotals = true
    currentPage().blocks.push('payment')
    currentPage().hasPayment = true
    debug.counts.totals += 1
    debug.counts.payment += 1

  }

  await startPage()
  await drawTitle()
  await drawOverview()
  await drawProductsHeaderRow()

  for (const row of vm.rows) {
    const height = getRowHeight(row) + 2.5
    await ensureSpace(height, true)
    drawRow(row)
  }

  await drawBottomBlocks()

  const totalPages = doc.getNumberOfPages()
  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    await drawFooter(pageNumber, totalPages)
  }

  return {
    fileName: vm.fileName,
    debug,
  }
}