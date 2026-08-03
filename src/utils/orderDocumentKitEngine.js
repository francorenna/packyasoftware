import { getOrderFinancialSummary } from './finance.js'
import { getOrderStatusBadge } from './orderDocumentHelpers.js'

const DEFAULT_TOKENS = {
  colors: {
    primary: '#EC008C',
    secondary: '#00AEEF',
    accent: '#FFF200',
    black: '#0B0B0D',
    gray: '#6B7280',
    border: '#E5E7EB',
  },
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
  if (Number.isNaN(date.getTime())) return ''
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

const isMeaningfulValue = (value) => {
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'number') return !Number.isNaN(value)
  if (typeof value === 'boolean') return true
  return String(value ?? '').trim().length > 0
}

const getValueByPath = (context, path) => {
  if (!path) return null
  const normalizedPath = String(path).replace(/\[\]/g, '')
  const segments = normalizedPath.split('.').filter(Boolean)

  let current = context
  for (const segment of segments) {
    if (current == null || typeof current !== 'object') return null
    current = current[segment]
  }

  return current ?? null
}

const resolveFieldValue = (context, candidates) => {
  const safeCandidates = Array.isArray(candidates) ? candidates : [candidates]
  for (const candidate of safeCandidates) {
    const value = getValueByPath(context, candidate)
    if (isMeaningfulValue(value)) return value
  }

  return null
}

const resolveComponentContract = (context, definition = {}) => {
  const resolved = {}
  const fields = definition.fields && typeof definition.fields === 'object' ? definition.fields : {}

  Object.entries(fields).forEach(([fieldName, fieldSources]) => {
    resolved[fieldName] = fieldSources === null ? null : resolveFieldValue(context, fieldSources)
  })

  return resolved
}

const buildOrderItemRows = (items = []) => {
  const safeItems = Array.isArray(items) ? items : []

  return safeItems.map((item) => {
    const quantity = Number(item?.quantity || 0)
    const unitPrice = Number(item?.unitPrice || 0)

    return {
      productName: String(item?.productName ?? item?.product ?? '').trim(),
      description: '',
      size: '',
      quantity,
      unitPrice,
      total: quantity * unitPrice,
      isClientMaterial: Boolean(item?.isClientMaterial ?? false),
      itemCompleted: Boolean(item?.itemCompleted ?? false),
    }
  })
}

const hexToRgb = (hex, fallback = [11, 11, 13]) => {
  const safeHex = String(hex ?? '').trim().replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(safeHex)) return fallback

  return [
    Number.parseInt(safeHex.slice(0, 2), 16),
    Number.parseInt(safeHex.slice(2, 4), 16),
    Number.parseInt(safeHex.slice(4, 6), 16),
  ]
}

const setTextColor = (doc, rgb) => doc.setTextColor(rgb[0], rgb[1], rgb[2])

const drawText = (doc, text, x, y, options = {}) => {
  const {
    font = 'helvetica',
    style = 'normal',
    size = 9,
    color = [11, 11, 13],
    align = 'left',
    maxWidth,
  } = options

  doc.setFont(font, style)
  doc.setFontSize(size)
  setTextColor(doc, color)

  const safeText = text == null ? '' : String(text)
  const lines = maxWidth ? doc.splitTextToSize(safeText, maxWidth) : safeText
  doc.text(lines, x, y, { align })
}

const createDebugPage = (index) => ({
  pageNumber: index,
  blocks: [],
  rowCount: 0,
  repeatedProductsHeader: false,
  hasTotals: false,
  hasPayment: false,
  hasFooter: false,
})

const SINGLE_INSTANCE_PAGE_BLOCKS = new Set([
  'header',
  'document-info',
  'client',
  'totals',
  'payment',
  'footer',
])

export const buildOrderDocumentViewModel = (order, contract, constants = {}) => {
  const safeOrder = order && typeof order === 'object' ? order : {}
  const financialSummary = getOrderFinancialSummary(safeOrder)
  const statusBadge = getOrderStatusBadge(safeOrder.status)
  const client = {
    name: String(safeOrder.clientName ?? safeOrder.client ?? '').trim(),
    phone: String(safeOrder.phone ?? safeOrder.clientPhone ?? '').trim(),
    email: String(safeOrder.email ?? safeOrder.clientEmail ?? '').trim(),
    address: String(safeOrder.address ?? safeOrder.clientAddress ?? '').trim(),
  }
  const context = {
    order: safeOrder,
    client,
  }

  return {
    order: safeOrder,
    client,
    statusBadge,
    documentInfo: resolveComponentContract(context, contract['document-info-card']),
    clientCard: resolveComponentContract(context, contract['client-card']),
    items: buildOrderItemRows(financialSummary.items),
    totals: {
      subtotal: financialSummary.effectiveSubtotal,
      discount: financialSummary.discount,
      shipping: Number(safeOrder.shippingCost || 0),
      total: financialSummary.finalTotal,
    },
    payment: {
      payments: financialSummary.payments,
      totalPaid: financialSummary.totalPaid,
      remainingDebt: financialSummary.remainingDebt,
      financialStatus: financialSummary.financialStatus,
      accounts: constants.transferAccounts ?? [],
      contactPhone: constants.contactPhone ?? '',
      website: constants.website ?? '',
    },
    fileName: `Orden_Trabajo_${sanitizeFilePart(safeOrder.clientName ?? safeOrder.client ?? 'SinCliente')}_${toFileDate(new Date())}.pdf`,
    issuedAt: formatDate(safeOrder.createdAt ?? new Date().toISOString()),
    note: String(safeOrder.financialNote ?? '').trim(),
  }
}

export const composeOrderDocumentKitPdf = async (doc, viewModel, kit, options = {}) => {
  const layout = kit?.layout ?? {}
  const contract = kit?.contract ?? {}
  const tokens = kit?.tokens ?? DEFAULT_TOKENS
  const assets = kit?.assets ?? {}
  const renderAsset = options.renderAsset

  if (typeof renderAsset !== 'function') {
    throw new Error('renderAsset is required for composeOrderDocumentKitPdf')
  }

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const docLayout = layout.document ?? {}
  const margins = docLayout.margins ?? { top: 14, bottom: 14, left: 16, right: 16 }
  const gap = Number(docLayout.gapBetweenComponents ?? 8)
  const footerReserve = Number(docLayout.minSpaceForFooter ?? 35)
  const components = Array.isArray(layout.components) ? layout.components : []
  const componentsById = Object.fromEntries(components.map((component) => [component.id, component]))
  const contentX = margins.left
  const contentWidth = pageWidth - margins.left - margins.right
  const header = componentsById.header
  const documentInfo = componentsById['document-info']
  const client = componentsById.client
  const productsHeader = componentsById['products-header']
  const productRow = componentsById['product-row']
  const totals = componentsById.totals
  const payment = componentsById.payment
  const footer = componentsById.footer
  const headerHeight = Number(header?.height ?? 0)
  const documentInfoHeight = Number(documentInfo?.height ?? 0)
  const clientHeight = Number(client?.height ?? 0)
  const productsHeaderHeight = Number(productsHeader?.height ?? 0)
  const productRowHeight = Number(productRow?.height ?? 0)
  const totalsHeight = Number(totals?.height ?? 0)
  const paymentHeight = Number(payment?.height ?? 0)
  const footerHeight = Number(footer?.height ?? 0)
  const footerY = pageHeight - margins.bottom - footerHeight
  const contentBottomY = footerY - footerReserve
  const primary = hexToRgb(tokens.colors?.primary, [236, 0, 140])
  const secondary = hexToRgb(tokens.colors?.secondary, [0, 174, 239])
  const textMain = hexToRgb(tokens.colors?.black, [11, 11, 13])
  const textMuted = hexToRgb(tokens.colors?.gray, [107, 114, 128])
  const border = hexToRgb(tokens.colors?.border, [229, 231, 235])
  const success = [22, 163, 74]
  const danger = [220, 38, 38]
  const warning = [161, 98, 7]
  const debug = {
    margins,
    pageCount: 0,
    contentBottomY,
    pages: [],
    counts: {
      header: 0,
      footer: 0,
      productsHeader: 0,
      productRows: 0,
      totals: 0,
      payment: 0,
    },
    flow: {},
  }

  let cursorY = 0
  let currentPage = null

  const drawComponentAsset = async (componentId, x, y, width, height) => {
    const component = componentsById[componentId]
    if (!component) return
    const svg = assets[component.file]
    if (!svg) return
    await renderAsset(doc, svg, x, y, width, height)
    const alreadyRegistered = currentPage.blocks.includes(componentId)
    if (!alreadyRegistered || !SINGLE_INSTANCE_PAGE_BLOCKS.has(componentId)) {
      currentPage.blocks.push(componentId)
    }
    if (componentId === 'products-header') {
      currentPage.repeatedProductsHeader = true
      debug.counts.productsHeader += 1
    }
    if (componentId === 'header' && !alreadyRegistered) debug.counts.header += 1
    if (componentId === 'totals') {
      currentPage.hasTotals = true
      if (!alreadyRegistered) debug.counts.totals += 1
    }
    if (componentId === 'payment') {
      currentPage.hasPayment = true
      if (!alreadyRegistered) debug.counts.payment += 1
    }
  }

  const startPage = async (repeatProducts = false) => {
    if (debug.pageCount > 0) doc.addPage()
    debug.pageCount += 1
    currentPage = createDebugPage(debug.pageCount)
    debug.pages.push(currentPage)

    currentPage.layoutHeights = {
      headerHeight,
      documentInfoHeight,
      clientHeight,
      productsHeaderHeight,
      productRowHeight,
      totalsHeight,
      paymentHeight,
      footerHeight,
      gap,
      footerReserve,
    }

    await drawComponentAsset('header', contentX, margins.top, contentWidth, headerHeight)

    drawText(doc, 'ORDEN DE TRABAJO', contentX + contentWidth / 2, margins.top + 9, {
      style: 'bold',
      size: 12,
      align: 'center',
      color: textMain,
    })
    drawText(doc, `Pedido ${viewModel.documentInfo.orderNumber || viewModel.order.id || ''}`, contentX + 4, margins.top + 31, {
      style: 'bold',
      size: 8,
      color: textMuted,
    })
    drawText(doc, `Emitida ${viewModel.issuedAt || ''}`, contentX + contentWidth - 4, margins.top + 31, {
      style: 'bold',
      size: 8,
      align: 'right',
      color: textMuted,
    })

    const badgeColor = viewModel.statusBadge.tone === 'success'
      ? success
      : viewModel.statusBadge.tone === 'accent'
        ? primary
        : viewModel.statusBadge.tone === 'info'
          ? secondary
          : warning
    doc.setFillColor(250, 250, 250)
    doc.roundedRect(contentX + contentWidth - 58, margins.top + 6, 54, 8, 2, 2, 'F')
    drawText(doc, viewModel.statusBadge.label, contentX + contentWidth - 31, margins.top + 11.5, {
      style: 'bold',
      size: 8,
      align: 'center',
      color: badgeColor,
    })

    cursorY = margins.top + headerHeight + gap

    if (repeatProducts) {
      await drawProductsHeaderBlock()
    }
  }

  const ensureSpace = async (heightNeeded, repeatProducts = false) => {
    if (cursorY + heightNeeded <= contentBottomY) return
    await startPage(repeatProducts)
  }

  const drawDocumentInfoBlock = async () => {
    await drawComponentAsset('document-info', contentX, cursorY, contentWidth, documentInfoHeight)
    const columns = [
      { label: 'Pedido', value: viewModel.documentInfo.orderNumber || '' },
      { label: 'Emision', value: formatDate(viewModel.documentInfo.issueDate) || viewModel.issuedAt || '' },
      { label: 'Entrega', value: formatDate(viewModel.documentInfo.deliveryDate) || '' },
      { label: 'Produccion', value: formatDate(viewModel.documentInfo.productionDate) || '' },
      { label: 'Estado', value: viewModel.documentInfo.status || '' },
    ]
    const columnWidth = contentWidth / columns.length

    columns.forEach((column, index) => {
      const x = contentX + index * columnWidth + 4
      drawText(doc, column.label, x, cursorY + 9.5, {
        style: 'bold',
        size: 7.4,
        color: textMuted,
      })
      drawText(doc, column.value, x, cursorY + 19, {
        style: 'bold',
        size: 8.6,
        color: textMain,
      })
    })

    cursorY += documentInfoHeight + gap
    debug.flow.afterDocumentInfo = cursorY
  }

  const drawClientBlock = async () => {
    await drawComponentAsset('client', contentX, cursorY, contentWidth, clientHeight)

    drawText(doc, viewModel.clientCard.name || '', contentX + 16, cursorY + 21.5, {
      style: 'bold',
      size: 10,
      color: textMain,
      maxWidth: contentWidth * 0.34,
    })
    drawText(doc, viewModel.clientCard.phone || '', contentX + contentWidth * 0.39, cursorY + 21.5, {
      size: 9,
      color: textMain,
      maxWidth: contentWidth * 0.16,
    })
    drawText(doc, viewModel.clientCard.email || '', contentX + contentWidth * 0.59, cursorY + 21.5, {
      size: 9,
      color: textMain,
      maxWidth: contentWidth * 0.23,
    })

    if (viewModel.clientCard.address) {
      drawText(doc, viewModel.clientCard.address, contentX + 16, cursorY + 32.5, {
        size: 8.5,
        color: textMuted,
        maxWidth: contentWidth - 24,
      })
    }

    cursorY += clientHeight + gap
    debug.flow.afterClient = cursorY
  }

  const drawProductsHeaderBlock = async () => {
    await drawComponentAsset('products-header', contentX, cursorY, contentWidth, productsHeaderHeight)
    cursorY += productsHeaderHeight + 2
    debug.flow.afterProductsHeader = cursorY
  }

  const rowColumns = [
    { key: 'productName', start: 0.04, width: 0.48, align: 'left' },
    { key: 'quantity', start: 0.63, width: 0.07, align: 'right' },
    { key: 'unitPrice', start: 0.74, width: 0.11, align: 'right' },
    { key: 'total', start: 0.88, width: 0.09, align: 'right' },
  ]

  const drawProductRowBlock = async (row) => {
    await ensureSpace(productRowHeight, true)
    await drawComponentAsset('product-row', contentX, cursorY, contentWidth, productRowHeight)

    rowColumns.forEach((column) => {
      const x = contentX + contentWidth * column.start
      const width = contentWidth * column.width
      let value = ''

      if (column.key === 'productName') value = row.productName || ''
      if (column.key === 'quantity') value = String(row.quantity || '')
      if (column.key === 'unitPrice') value = formatCurrency(row.unitPrice)
      if (column.key === 'total') value = formatCurrency(row.total)

      drawText(doc, value, column.align === 'right' ? x + width : x, cursorY + 6.5, {
        size: column.key === 'productName' ? 8.6 : 8.4,
        style: column.key === 'productName' ? 'bold' : 'normal',
        color: textMain,
        align: column.align,
        maxWidth: column.key === 'productName' ? width : undefined,
      })
    })

    if (row.isClientMaterial) {
      drawText(doc, 'Material del cliente', contentX + 8, cursorY + 12.5, {
        size: 7.2,
        color: textMuted,
      })
    }

    cursorY += productRowHeight + 1.5
    debug.flow.afterLastRow = cursorY
    currentPage.rowCount += 1
    debug.counts.productRows += 1
  }

  const drawTotalsBlock = async () => {
    debug.flow.beforeTotals = cursorY
    debug.flow.requiredForTotalsAndPayment = totalsHeight + gap + paymentHeight
    await ensureSpace(totalsHeight + gap + paymentHeight, false)
    debug.flow.totalsPage = currentPage.pageNumber
    await drawComponentAsset('totals', contentX, cursorY, contentWidth, totalsHeight)

    const totalsRows = [
      { label: 'Subtotal', value: formatCurrency(viewModel.totals.subtotal) },
      ...(viewModel.totals.discount > 0 ? [{ label: 'Descuento', value: `- ${formatCurrency(viewModel.totals.discount)}` }] : []),
      ...(viewModel.totals.shipping > 0 ? [{ label: 'Envio', value: formatCurrency(viewModel.totals.shipping) }] : []),
      { label: 'Total', value: formatCurrency(viewModel.totals.total), bold: true },
    ]

    totalsRows.forEach((row, index) => {
      const y = cursorY + 13 + index * 9
      drawText(doc, row.label, contentX + 8, y, {
        style: row.bold ? 'bold' : 'normal',
        size: row.bold ? 10 : 8.8,
        color: textMuted,
      })
      drawText(doc, row.value, contentX + contentWidth - 8, y, {
        style: 'bold',
        size: row.bold ? 11 : 9,
        align: 'right',
        color: textMain,
      })
    })

    cursorY += totalsHeight + gap
    debug.flow.afterTotals = cursorY
  }

  const drawPaymentBlock = async () => {
    debug.flow.beforePayment = cursorY
    debug.flow.paymentPage = currentPage.pageNumber
    await drawComponentAsset('payment', contentX, cursorY, contentWidth, paymentHeight)

    drawText(doc, 'Pagado', contentX + 8, cursorY + 14, {
      style: 'bold',
      size: 7.8,
      color: textMuted,
    })
    drawText(doc, formatCurrency(viewModel.payment.totalPaid), contentX + 44, cursorY + 14, {
      style: 'bold',
      size: 9.6,
      color: textMain,
      align: 'right',
    })

    drawText(doc, 'Pendiente', contentX + 60, cursorY + 14, {
      style: 'bold',
      size: 7.8,
      color: textMuted,
    })
    drawText(doc, formatCurrency(viewModel.payment.remainingDebt), contentX + 102, cursorY + 14, {
      style: 'bold',
      size: 9.6,
      color: viewModel.payment.remainingDebt > 0 ? danger : success,
      align: 'right',
    })

    drawText(doc, viewModel.payment.financialStatus, contentX + contentWidth - 8, cursorY + 14, {
      style: 'bold',
      size: 8.8,
      align: 'right',
      color: viewModel.payment.remainingDebt > 0 ? warning : success,
    })

    const accounts = Array.isArray(viewModel.payment.accounts) ? viewModel.payment.accounts.slice(0, 2) : []
    const accountWidth = (contentWidth - 26) / 2
    accounts.forEach((account, index) => {
      const baseX = contentX + 8 + index * (accountWidth + 10)
      drawText(doc, account.title || '', baseX, cursorY + 28, {
        style: 'bold',
        size: 8.8,
        color: textMain,
      })
      drawText(doc, `Alias: ${account.alias || ''}`, baseX, cursorY + 35, {
        size: 7.7,
        color: textMuted,
      })
      drawText(doc, `Titular: ${account.holder || ''}`, baseX, cursorY + 41.5, {
        size: 7.7,
        color: textMuted,
      })
      drawText(doc, `CUIL: ${account.cuil || ''}`, baseX, cursorY + 48, {
        size: 7.7,
        color: textMuted,
      })
    })

    drawText(doc, viewModel.payment.contactPhone || '', contentX + 8, cursorY + paymentHeight - 5, {
      size: 7.5,
      color: textMuted,
    })
    drawText(doc, viewModel.payment.website || '', contentX + contentWidth - 8, cursorY + paymentHeight - 5, {
      size: 7.5,
      align: 'right',
      color: textMuted,
    })

    cursorY += paymentHeight + gap
    debug.flow.afterPayment = cursorY
  }

  const drawFooterPass = async () => {
    const totalPages = doc.getNumberOfPages()

    for (let pageIndex = 1; pageIndex <= totalPages; pageIndex += 1) {
      doc.setPage(pageIndex)
      const pageDebug = debug.pages[pageIndex - 1]
      const svg = assets[footer.file]
      if (svg) {
        await renderAsset(doc, svg, contentX, footerY, contentWidth, footerHeight)
      }
      if (!pageDebug.blocks.includes('footer')) {
        pageDebug.blocks.push('footer')
      }
      pageDebug.hasFooter = true
      if (debug.counts.footer < pageIndex) debug.counts.footer += 1

      drawText(doc, `Pagina ${pageIndex} de ${totalPages}`, contentX + contentWidth - 4, footerY + footerHeight - 3.5, {
        style: 'bold',
        size: 7.2,
        align: 'right',
        color: textMuted,
      })
    }
  }

  await startPage(false)
  await drawDocumentInfoBlock()
  await drawClientBlock()
  await drawProductsHeaderBlock()

  for (const row of viewModel.items) {
    await drawProductRowBlock(row)
  }

  await drawTotalsBlock()
  await drawPaymentBlock()
  await drawFooterPass()

  debug.contractVersion = contract.contractVersion ?? 'unknown'
  debug.usedAssets = Object.keys(assets)

  return debug
}