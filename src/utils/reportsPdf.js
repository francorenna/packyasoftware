import { jsPDF } from 'jspdf'
import { getBrandLogoDataUrl } from './brandLogo'
import { drawCorporateHeader, applyCorporateFooterToDocument } from './corporatePdfSystem'

const brandLogoDataUrl = await getBrandLogoDataUrl()
const DEFAULT_MARGIN = 14

const formatCurrency = (value) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0)

const formatDateTime = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sin fecha'

  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const toFileDate = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value)
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date
  const year = safeDate.getFullYear()
  const month = String(safeDate.getMonth() + 1).padStart(2, '0')
  const day = String(safeDate.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const formatDateOnly = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return 'Sin fecha'

  const formatted = date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  return formatted.replace(/\b([a-z])/u, (match) => match.toUpperCase())
}

const parseAccountRowDate = (row) => {
  const directCandidates = [row?.dateIso, row?.createdAt, row?.deliveryDate, row?.date]

  for (const candidate of directCandidates) {
    if (!candidate) continue
    const parsed = new Date(candidate)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }

  const label = String(row?.dateLabel ?? '').trim()
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(label)) {
    const [day, month, year] = label.split('/').map(Number)
    const parsed = new Date(year, month - 1, day)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }

  return null
}

const getMonthKeyFromDate = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return 'Sin mes'
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

const formatMonthKey = (monthKey) => {
  if (!/^\d{4}-\d{2}$/.test(String(monthKey ?? ''))) return 'Sin mes'
  const [year, month] = String(monthKey).split('-').map(Number)
  const parsed = new Date(year, month - 1, 1)
  if (Number.isNaN(parsed.getTime())) return 'Sin mes'

  return parsed.toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric',
  })
}

const drawHeader = (doc, title, subtitle) => {
  const pageWidth = doc.internal.pageSize.getWidth()
  const { contentStartY } = drawCorporateHeader(doc, {
    pageWidth,
    margin: DEFAULT_MARGIN,
    title,
    subtitle,
    logoDataUrl: brandLogoDataUrl,
  })

  return contentStartY + 4
}

const finalizeCorporatePdf = (doc, fileName, margin = DEFAULT_MARGIN) => {
  const pageWidth = doc.internal.pageSize.getWidth()
  applyCorporateFooterToDocument(doc, {
    pageWidth,
    margin,
    logoDataUrl: brandLogoDataUrl,
  })
  doc.save(fileName)
}

const drawTableHeader = (doc, cursorY, columns) => {
  const margin = 14
  const lineHeight = 3.4

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.3)
  const labelsByColumn = columns.map((column) => {
    const safeLabel = String(column.label ?? '')
    const maxWidth = Math.max(column.width - 2, 12)
    const lines = doc.splitTextToSize(safeLabel, maxWidth)
    return Array.isArray(lines) && lines.length > 0 ? lines : ['']
  })

  const maxLines = Math.max(1, ...labelsByColumn.map((lines) => lines.length))
  const headerHeight = 4 + maxLines * lineHeight

  doc.setFillColor(248, 250, 252)
  doc.rect(margin, cursorY - 4, doc.internal.pageSize.getWidth() - margin * 2, headerHeight, 'F')

  let x = margin
  doc.setTextColor(51, 65, 85)

  columns.forEach((column, index) => {
    const textX = column.align === 'right' ? x + column.width - 1 : x + 1
    const lines = labelsByColumn[index]
    lines.forEach((line, lineIndex) => {
      doc.text(String(line ?? ''), textX, cursorY + lineIndex * lineHeight, {
        align: column.align === 'right' ? 'right' : 'left',
      })
    })
    x += column.width
  })

  return cursorY + headerHeight + 1
}

const drawRow = (doc, cursorY, columns, values) => {
  const margin = 14
  const lineHeight = 3.5
  const topPad = 0.8
  const bottomPad = 1.4

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)

  const linesByColumn = columns.map((column) => {
    const text = String(values[column.key] ?? '')
    const maxWidth = Math.max(column.width - 2, 10)
    const lines = doc.splitTextToSize(text, maxWidth)
    return Array.isArray(lines) && lines.length > 0 ? lines : ['']
  })

  const maxLines = Math.max(1, ...linesByColumn.map((lines) => lines.length))
  const rowHeight = topPad + maxLines * lineHeight + bottomPad
  let x = margin

  doc.setTextColor(15, 23, 42)

  columns.forEach((column, index) => {
    const textX = column.align === 'right' ? x + column.width - 1 : x + 1
    const lines = linesByColumn[index]
    lines.forEach((line, lineIndex) => {
      doc.text(String(line ?? ''), textX, cursorY + topPad + lineHeight * lineIndex, {
        align: column.align === 'right' ? 'right' : 'left',
      })
    })
    x += column.width
  })

  doc.setDrawColor(241, 245, 249)
  doc.line(margin, cursorY + rowHeight - 0.8, doc.internal.pageSize.getWidth() - margin, cursorY + rowHeight - 0.8)

  return cursorY + rowHeight + 0.3
}

const ensureSpace = (doc, cursorY, needed, columns) => {
  const pageHeight = doc.internal.pageSize.getHeight()
  const effectiveNeeded = Number(needed || 0) + 8
  if (cursorY + effectiveNeeded <= pageHeight - 16) return cursorY

  doc.addPage()
  const nextStart = drawHeader(doc, columns.pageTitle, columns.pageSubtitle)
  return drawTableHeader(doc, nextStart, columns.columns)
}

const ensurePageSpaceWithoutTable = (doc, cursorY, needed, pageTitle, pageSubtitle) => {
  const pageHeight = doc.internal.pageSize.getHeight()
  const effectiveNeeded = Number(needed || 0) + 4
  if (cursorY + effectiveNeeded <= pageHeight - 16) return cursorY

  doc.addPage()
  return drawHeader(doc, pageTitle, pageSubtitle)
}

export const generatePriceListPDF = async ({ rows }) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const margin = 16
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  const sortedRows = [...rows].sort((a, b) => {
    const categoryDiff = String(a.category).localeCompare(String(b.category), 'es', { sensitivity: 'base' })
    if (categoryDiff !== 0) return categoryDiff
    return String(a.name).localeCompare(String(b.name), 'es', { sensitivity: 'base' })
  })

  const groups = sortedRows.reduce((acc, row) => {
    const key = String(row?.category ?? 'OTROS').trim().toUpperCase() || 'OTROS'
    if (!acc[key]) acc[key] = []
    acc[key].push(row)
    return acc
  }, {})

  const orderedCategories = Object.keys(groups).sort((a, b) =>
    String(a).localeCompare(String(b), 'es', { sensitivity: 'base' }),
  )

  const drawCatalogHeader = () => {
    let y = 14

    if (brandLogoDataUrl) {
      const logoWidth = 26
      const logoHeight = 26
      doc.addImage(brandLogoDataUrl, 'PNG', pageWidth / 2 - logoWidth / 2, y, logoWidth, logoHeight)
      y += logoHeight + 6
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(23)
    doc.setTextColor(15, 23, 42)
    doc.text('LISTA DE PRECIOS', pageWidth / 2, y, { align: 'center' })
    y += 6

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(109, 116, 125)
    doc.text('Precios por unidad con impresión', pageWidth / 2, y, { align: 'center' })
    y += 5

    doc.setFontSize(9)
    doc.text(formatDateOnly(new Date()), pageWidth / 2, y, { align: 'center' })
    y += 6

    doc.setDrawColor(220, 224, 229)
    doc.line(margin, y, pageWidth - margin, y)

    return y + 10
  }

  const ensureCatalogSpace = (cursorY, neededHeight) => {
    if (cursorY + neededHeight <= pageHeight - 34) return cursorY
    doc.addPage()
    return drawCatalogHeader()
  }

  const drawCategoryHeader = (cursorY, category) => {
    const safeCategory = String(category ?? 'OTROS').toUpperCase()

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(71, 85, 105)
    const label = safeCategory
    const labelWidth = doc.getTextWidth(label)
    const centerX = pageWidth / 2
    const gap = 4
    const leftEnd = centerX - labelWidth / 2 - gap
    const rightStart = centerX + labelWidth / 2 + gap

    doc.setDrawColor(209, 213, 219)
    doc.line(margin, cursorY + 3.5, leftEnd, cursorY + 3.5)
    doc.line(rightStart, cursorY + 3.5, pageWidth - margin, cursorY + 3.5)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(51, 65, 85)
    doc.text(label, centerX, cursorY + 4.4, { align: 'center' })

    return cursorY + 12
  }

  const drawCatalogItem = (cursorY, row) => {
    const safeName = String(row?.name ?? 'Sin nombre')
    const safePrice = `${formatCurrency(row?.salePrice)} c/u`

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12.5)
    doc.setTextColor(15, 23, 42)
    doc.text(safeName, margin, cursorY)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14.5)
    doc.setTextColor(15, 23, 42)
    doc.text(safePrice, pageWidth - margin, cursorY, { align: 'right' })

    const dotsStart = margin + doc.getTextWidth(safeName) + 2
    const priceWidth = doc.getTextWidth(safePrice)
    const dotsEnd = pageWidth - margin - priceWidth - 2

    if (dotsEnd > dotsStart + 6) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(11)
      doc.setTextColor(148, 163, 184)
      const available = dotsEnd - dotsStart
      const dotWidth = doc.getTextWidth('.')
      const dotCount = Math.max(Math.floor(available / Math.max(dotWidth, 0.6)), 0)
      const dots = '.'.repeat(dotCount)
      doc.text(dots, dotsStart, cursorY)
    }

    doc.setDrawColor(232, 235, 239)
    doc.line(margin, cursorY + 2.5, pageWidth - margin, cursorY + 2.5)

    return cursorY + 7
  }

  const drawFooter = (cursorY) => {
    const nextY = ensureCatalogSpace(cursorY + 10, 28)

    doc.setDrawColor(220, 224, 229)
    doc.line(margin, nextY, pageWidth - margin, nextY)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(71, 85, 105)
    doc.text('Los precios incluyen impresión.', pageWidth / 2, nextY + 8, { align: 'center' })

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(15, 23, 42)
    doc.text('PACKYA', pageWidth / 2, nextY + 15, { align: 'center' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(100, 116, 139)
    doc.text('Packaging personalizado', pageWidth / 2, nextY + 20, { align: 'center' })
    doc.text('Cajas - Bolsas - Embalaje', pageWidth / 2, nextY + 24, { align: 'center' })
  }

  let cursorY = drawCatalogHeader()

  orderedCategories.forEach((category, categoryIndex) => {
    cursorY = ensureCatalogSpace(cursorY, 14)
    cursorY = drawCategoryHeader(cursorY, category)

    groups[category].forEach((row) => {
      cursorY = ensureCatalogSpace(cursorY, 10)
      cursorY = drawCatalogItem(cursorY, row)
    })

    if (categoryIndex < orderedCategories.length - 1) {
      cursorY += 14
    }
  })

  drawFooter(cursorY + 4)

  finalizeCorporatePdf(doc, `Packya-ListaPrecios-${toFileDate()}.pdf`, margin)
}

export const generateCostsPDF = ({ rows }) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const subtitle = `Reporte de costos | ${formatDateTime(new Date())}`
  const columns = [
    { key: 'name', label: 'Producto', width: 76, align: 'left' },
    { key: 'cost', label: 'Costo', width: 28, align: 'right' },
    { key: 'price', label: 'Precio', width: 28, align: 'right' },
    { key: 'margin', label: 'Margen', width: 28, align: 'right' },
    { key: 'marginPercent', label: 'Margen %', width: 26, align: 'right' },
  ]

  let cursorY = drawHeader(doc, 'Reporte de Costos', subtitle)
  cursorY = drawTableHeader(doc, cursorY, columns)

  const sortedRows = [...rows].sort((a, b) =>
    String(a.name).localeCompare(String(b.name), 'es', { sensitivity: 'base' }),
  )

  sortedRows.forEach((row) => {
    cursorY = ensureSpace(doc, cursorY, 10, {
      pageTitle: 'Reporte de Costos',
      pageSubtitle: subtitle,
      columns,
    })

    cursorY = drawRow(doc, cursorY, columns, {
      name: row.name,
      cost: formatCurrency(row.referenceCost),
      price: formatCurrency(row.salePrice),
      margin: formatCurrency(row.margin),
      marginPercent: `${Math.round(Number(row.marginPercent || 0))}%`,
    })
  })

  finalizeCorporatePdf(doc, `Packya-Costos-${toFileDate()}.pdf`)
}

export const generateDebtPDF = ({ rows }) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const subtitle = `Reporte de deudas | ${formatDateTime(new Date())}`
  const columns = [
    { key: 'client', label: 'Cliente', width: 80, align: 'left' },
    { key: 'debt', label: 'Deuda', width: 34, align: 'right' },
    { key: 'orders', label: 'Pedidos', width: 24, align: 'right' },
    { key: 'days', label: 'Días deuda', width: 36, align: 'right' },
  ]

  let cursorY = drawHeader(doc, 'Reporte de Deudas', subtitle)
  cursorY = drawTableHeader(doc, cursorY, columns)

  const sortedRows = [...rows].sort((a, b) => b.totalDebt - a.totalDebt)
  const totalGeneralDebt = sortedRows.reduce((acc, row) => acc + (Number(row?.totalDebt) || 0), 0)

  sortedRows.forEach((row) => {
    cursorY = ensureSpace(doc, cursorY, 10, {
      pageTitle: 'Reporte de Deudas',
      pageSubtitle: subtitle,
      columns,
    })

    cursorY = drawRow(doc, cursorY, columns, {
      client: row.clientName,
      debt: formatCurrency(row.totalDebt),
      orders: String(row.ordersCount),
      days: String(row.maxDebtDays),
    })
  })

  cursorY = ensurePageSpaceWithoutTable(doc, cursorY + 6, 12, 'Reporte de Deudas', subtitle)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(15, 23, 42)
  doc.text(`TOTAL GENERAL DEUDA: ${formatCurrency(totalGeneralDebt)}`, 14, cursorY)

  finalizeCorporatePdf(doc, `Packya-Deudas-${toFileDate()}.pdf`)
}

export const generateClientAccountPDF = async ({ rows, scopeLabel }) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const subtitle = `Estado de cuenta (${scopeLabel}) | ${formatDateTime(new Date())}`
  let cursorY = drawHeader(doc, 'Estado de Cuenta Cliente', subtitle)

  const groupedRows = rows.reduce((acc, row) => {
    const key = String(row?.clientKey ?? row?.clientName ?? 'Sin cliente')
    if (!acc[key]) {
      acc[key] = {
        clientName: String(row?.clientName ?? 'Sin cliente'),
        items: [],
      }
    }

    acc[key].items.push(row)
    return acc
  }, {})

  const sortedGroups = Object.values(groupedRows).sort((a, b) =>
    String(a.clientName).localeCompare(String(b.clientName), 'es', { sensitivity: 'base' }),
  )

  let totalAdeudado = 0

  const monthlyColumns = [
    { key: 'month', label: 'Mes', width: 58, align: 'left' },
    { key: 'orders', label: 'Pedidos', width: 22, align: 'right' },
    { key: 'billed', label: 'Facturado', width: 36, align: 'right' },
    { key: 'paid', label: 'Pagado', width: 34, align: 'right' },
    { key: 'balance', label: 'Saldo mes', width: 32, align: 'right' },
  ]

  sortedGroups.forEach((group, groupIndex) => {
    const clientRows = Array.isArray(group.items) ? group.items : []

    const monthlyMap = clientRows.reduce((acc, row) => {
      const total = Math.max(Number(row?.total) || 0, 0)
      const paid = Math.max(Number(row?.paid) || 0, 0)
      const balance = Math.max(total - paid, 0)

      const rowDate = parseAccountRowDate(row)
      const monthKey = getMonthKeyFromDate(rowDate)

      const monthBucket = acc[monthKey] ?? {
        month: formatMonthKey(monthKey),
        monthSortKey: monthKey,
        orders: 0,
        billed: 0,
        paid: 0,
        balance: 0,
      }

      monthBucket.orders += 1
      monthBucket.billed += total
      monthBucket.paid += paid
      monthBucket.balance += balance
      acc[monthKey] = monthBucket
      return acc
    }, {})

    const monthlyRows = Object.values(monthlyMap).sort((a, b) =>
      String(b.monthSortKey).localeCompare(String(a.monthSortKey)),
    )

    const clientTotals = monthlyRows.reduce(
      (acc, row) => ({
        orders: acc.orders + row.orders,
        billed: acc.billed + row.billed,
        paid: acc.paid + row.paid,
        balance: acc.balance + row.balance,
      }),
      { orders: 0, billed: 0, paid: 0, balance: 0 },
    )

    totalAdeudado += clientTotals.balance

    cursorY = ensurePageSpaceWithoutTable(doc, cursorY, 30, 'Estado de Cuenta Cliente', subtitle)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(15, 23, 42)
    doc.text(`Cliente: ${group.clientName}`, 14, cursorY)
    cursorY += 6

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(51, 65, 85)
    doc.text(`Pedidos registrados: ${clientTotals.orders}`, 14, cursorY)
    doc.text(`Saldo actual: ${formatCurrency(clientTotals.balance)}`, 196, cursorY, { align: 'right' })
    cursorY += 8

    cursorY = ensureSpace(doc, cursorY, 10, {
      pageTitle: 'Estado de Cuenta Cliente',
      pageSubtitle: subtitle,
      columns: monthlyColumns,
    })
    cursorY = drawTableHeader(doc, cursorY, monthlyColumns)

    monthlyRows.forEach((row) => {
      cursorY = ensureSpace(doc, cursorY, 10, {
        pageTitle: 'Estado de Cuenta Cliente',
        pageSubtitle: subtitle,
        columns: monthlyColumns,
      })

      cursorY = drawRow(doc, cursorY, monthlyColumns, {
        month: row.month,
        orders: String(row.orders),
        billed: formatCurrency(row.billed),
        paid: formatCurrency(row.paid),
        balance: formatCurrency(row.balance),
      })
    })

    cursorY = ensurePageSpaceWithoutTable(doc, cursorY + 2, 12, 'Estado de Cuenta Cliente', subtitle)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.setTextColor(15, 23, 42)
    doc.text(
      `Resumen cliente  Facturado: ${formatCurrency(clientTotals.billed)}   Pagado: ${formatCurrency(clientTotals.paid)}   Saldo: ${formatCurrency(clientTotals.balance)}`,
      14,
      cursorY,
    )
    cursorY += 7

    if (groupIndex < sortedGroups.length - 1) {
      doc.setDrawColor(226, 232, 240)
      doc.line(14, cursorY, 196, cursorY)
      cursorY += 6
    }
  })

  cursorY = ensurePageSpaceWithoutTable(doc, cursorY + 2, 14, 'Estado de Cuenta Cliente', subtitle)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(15, 23, 42)
  doc.text(`TOTAL ADEUDADO: ${formatCurrency(totalAdeudado)}`, 14, cursorY)

  finalizeCorporatePdf(doc, `Packya-EstadoCuenta-${toFileDate()}.pdf`)
}

export const generateStockStatusPDF = ({ rows }) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const subtitle = `Estado de stock | ${formatDateTime(new Date())}`
  const columns = [
    { key: 'product', label: 'Producto', width: 132, align: 'left' },
    { key: 'stock', label: 'Stock actual', width: 44, align: 'right' },
  ]

  let cursorY = drawHeader(doc, 'Estado de Stock', subtitle)
  cursorY = drawTableHeader(doc, cursorY, columns)

  rows.forEach((row) => {
    cursorY = ensureSpace(doc, cursorY, 10, {
      pageTitle: 'Estado de Stock',
      pageSubtitle: subtitle,
      columns,
    })

    cursorY = drawRow(doc, cursorY, columns, {
      product: String(row.name ?? 'Sin nombre'),
      stock: String(row.stockCurrent ?? 0),
    })
  })

  cursorY = ensurePageSpaceWithoutTable(doc, cursorY + 6, 12, 'Estado de Stock', subtitle)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(15, 23, 42)
  doc.text(`TOTAL PRODUCTOS: ${String(rows.length)}`, 14, cursorY)

  finalizeCorporatePdf(doc, `Packya-Stock-${toFileDate()}.pdf`)
}

export const generateExpensesReportPDF = ({ rows, summaryByPartner = [], summaryByCategory = [] }) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const subtitle = `Reporte de egresos | ${formatDateTime(new Date())}`
  const columns = [
    { key: 'date', label: 'Fecha', width: 22, align: 'left' },
    { key: 'type', label: 'Tipo', width: 18, align: 'left' },
    { key: 'person', label: 'Socio', width: 22, align: 'left' },
    { key: 'category', label: 'Categoria', width: 30, align: 'left' },
    { key: 'reason', label: 'Motivo', width: 58, align: 'left' },
    { key: 'amount', label: 'Monto', width: 26, align: 'right' },
  ]

  let cursorY = drawHeader(doc, 'Reporte de Egresos', subtitle)
  cursorY = drawTableHeader(doc, cursorY, columns)
  const totalExpenses = rows.reduce((acc, row) => acc + (Number(row?.amount) || 0), 0)

  rows.forEach((row) => {
    cursorY = ensureSpace(doc, cursorY, 10, {
      pageTitle: 'Reporte de Egresos',
      pageSubtitle: subtitle,
      columns,
    })

    cursorY = drawRow(doc, cursorY, columns, {
      date: String(row.dateLabel ?? 'Sin fecha'),
      type: row.type === 'socio' ? 'Socio' : 'Empresa',
      person: String(row.person ?? '—'),
      category: String(row.category ?? 'Sin categoria'),
      reason: String(row.reason ?? row.description ?? ''),
      amount: formatCurrency(row.amount),
    })
  })

  cursorY += 4
  const summaryColumns = [
    { key: 'label', label: 'Resumen', width: 120, align: 'left' },
    { key: 'amount', label: 'Monto', width: 56, align: 'right' },
  ]

  if (summaryByPartner.length > 0) {
    cursorY = ensureSpace(doc, cursorY, 20, {
      pageTitle: 'Reporte de Egresos',
      pageSubtitle: subtitle,
      columns: summaryColumns,
    })

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(51, 65, 85)
    doc.text('Resumen por socio', 14, cursorY)
    cursorY += 5
    cursorY = drawTableHeader(doc, cursorY, summaryColumns)

    summaryByPartner.forEach((row) => {
      cursorY = ensureSpace(doc, cursorY, 10, {
        pageTitle: 'Reporte de Egresos',
        pageSubtitle: subtitle,
        columns: summaryColumns,
      })

      cursorY = drawRow(doc, cursorY, summaryColumns, {
        label: String(row.partner ?? 'Sin socio'),
        amount: formatCurrency(row.amount),
      })
    })
  }

  if (summaryByCategory.length > 0) {
    cursorY += 4
    cursorY = ensureSpace(doc, cursorY, 20, {
      pageTitle: 'Reporte de Egresos',
      pageSubtitle: subtitle,
      columns: summaryColumns,
    })

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(51, 65, 85)
    doc.text('Resumen por categoria', 14, cursorY)
    cursorY += 5
    cursorY = drawTableHeader(doc, cursorY, summaryColumns)

    summaryByCategory.forEach((row) => {
      cursorY = ensureSpace(doc, cursorY, 10, {
        pageTitle: 'Reporte de Egresos',
        pageSubtitle: subtitle,
        columns: summaryColumns,
      })

      cursorY = drawRow(doc, cursorY, summaryColumns, {
        label: String(row.category ?? 'Sin categoria'),
        amount: formatCurrency(row.amount),
      })
    })
  }

  cursorY = ensurePageSpaceWithoutTable(doc, cursorY + 6, 12, 'Reporte de Egresos', subtitle)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(15, 23, 42)
  doc.text(`TOTAL EGRESOS: ${formatCurrency(totalExpenses)}`, 14, cursorY)

  finalizeCorporatePdf(doc, `Packya-Egresos-${toFileDate()}.pdf`)
}

export const generateProductionReportPDF = ({ monthRows, categoryRows, totalProduced }) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const subtitle = `Reporte de produccion | ${formatDateTime(new Date())}`

  let cursorY = drawHeader(doc, 'Reporte de Produccion', subtitle)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(15, 23, 42)
  doc.text(`Cantidad total producida: ${String(totalProduced ?? 0)}`, 14, cursorY)
  cursorY += 8

  const monthColumns = [
    { key: 'month', label: 'Mes', width: 90, align: 'left' },
    { key: 'quantity', label: 'Cantidad', width: 30, align: 'right' },
    { key: 'orders', label: 'Pedidos', width: 30, align: 'right' },
    { key: 'categories', label: 'Categorias', width: 26, align: 'right' },
  ]

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(51, 65, 85)
  doc.text('Produccion por mes', 14, cursorY)
  cursorY += 5
  cursorY = drawTableHeader(doc, cursorY, monthColumns)

  monthRows.forEach((row) => {
    cursorY = ensureSpace(doc, cursorY, 10, {
      pageTitle: 'Reporte de Produccion',
      pageSubtitle: subtitle,
      columns: monthColumns,
    })

    cursorY = drawRow(doc, cursorY, monthColumns, {
      month: String(row.monthLabel ?? row.monthKey ?? ''),
      quantity: String(row.totalQuantity ?? 0),
      orders: String(row.ordersCount ?? 0),
      categories: String(row.categoriesCount ?? 0),
    })
  })

  cursorY += 6
  cursorY = ensureSpace(doc, cursorY, 18, {
    pageTitle: 'Reporte de Produccion',
    pageSubtitle: subtitle,
    columns: monthColumns,
  })

  const categoryColumns = [
    { key: 'category', label: 'Categoria', width: 120, align: 'left' },
    { key: 'quantity', label: 'Cantidad', width: 56, align: 'right' },
  ]

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(51, 65, 85)
  doc.text('Produccion por categoria', 14, cursorY)
  cursorY += 5
  cursorY = drawTableHeader(doc, cursorY, categoryColumns)

  categoryRows.forEach((row) => {
    cursorY = ensureSpace(doc, cursorY, 10, {
      pageTitle: 'Reporte de Produccion',
      pageSubtitle: subtitle,
      columns: categoryColumns,
    })

    cursorY = drawRow(doc, cursorY, categoryColumns, {
      category: String(row.category ?? 'Sin categoria'),
      quantity: String(row.totalQuantity ?? 0),
    })
  })

  cursorY = ensurePageSpaceWithoutTable(doc, cursorY + 6, 12, 'Reporte de Produccion', subtitle)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(15, 23, 42)
  doc.text(`TOTAL PRODUCCION: ${String(totalProduced ?? 0)} unidades`, 14, cursorY)

  finalizeCorporatePdf(doc, `Packya-Produccion-${toFileDate()}.pdf`)
}

const formatShortDate = (dateKey) => {
  const [year, month, day] = String(dateKey ?? '').split('-').map(Number)
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return 'Sin fecha'
  return new Date(year, month - 1, day).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

const drawKpiCards = (doc, cursorY, cards) => {
  const margin = 14
  const pageWidth = doc.internal.pageSize.getWidth()
  const contentWidth = pageWidth - margin * 2
  const gap = 4
  const cardWidth = (contentWidth - gap * 2) / 3
  const cardHeight = 22

  cards.forEach((card, index) => {
    const x = margin + (index % 3) * (cardWidth + gap)
    const y = cursorY + Math.floor(index / 3) * (cardHeight + 4)

    doc.setFillColor(248, 250, 252)
    doc.roundedRect(x, y, cardWidth, cardHeight, 2.2, 2.2, 'F')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.setTextColor(71, 85, 105)
    doc.text(String(card.label ?? ''), x + 3, y + 5.4)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(15, 23, 42)
    doc.text(String(card.value ?? ''), x + 3, y + 12.4)

    if (card.note) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(100, 116, 139)
      doc.text(String(card.note), x + 3, y + 18)
    }
  })

  return cursorY + Math.ceil(cards.length / 3) * (cardHeight + 4)
}

const drawSectionTitle = (doc, cursorY, text) => {
  const margin = 14
  const maxWidth = doc.internal.pageSize.getWidth() - margin * 2
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(15, 23, 42)
  const lines = doc.splitTextToSize(String(text ?? ''), maxWidth)
  doc.text(lines, margin, cursorY)
  return cursorY + (Array.isArray(lines) ? lines.length : 1) * 4.6
}

const drawWeeklyNetChart = (doc, cursorY, weeklyNetRows, subtitle) => {
  const margin = 14
  const chartWidth = doc.internal.pageSize.getWidth() - margin * 2
  const chartHeight = 44
  const baselineY = cursorY + 24

  doc.setFillColor(248, 250, 252)
  doc.roundedRect(margin, cursorY, chartWidth, chartHeight, 2.4, 2.4, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(51, 65, 85)
  doc.text('Curva semanal de caja neta', margin + 3, cursorY + 6)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(100, 116, 139)
  doc.text(String(subtitle ?? ''), margin + 3, cursorY + 10)

  doc.setDrawColor(203, 213, 225)
  doc.line(margin + 2, baselineY, margin + chartWidth - 2, baselineY)

  const safeRows = Array.isArray(weeklyNetRows) ? weeklyNetRows : []
  const maxAbs = Math.max(
    1,
    ...safeRows.map((row) => Math.abs(Number(row?.net || 0))),
  )

  const slotWidth = safeRows.length > 0 ? (chartWidth - 10) / safeRows.length : chartWidth - 10

  safeRows.forEach((row, index) => {
    const net = Number(row?.net || 0)
    const scaled = (Math.abs(net) / maxAbs) * 15
    const x = margin + 5 + index * slotWidth + slotWidth * 0.16
    const width = slotWidth * 0.68

    if (net >= 0) {
      doc.setFillColor(16, 185, 129)
      doc.rect(x, baselineY - scaled, width, scaled, 'F')
    } else {
      doc.setFillColor(239, 68, 68)
      doc.rect(x, baselineY, width, scaled, 'F')
    }

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.2)
    doc.setTextColor(71, 85, 105)
    doc.text(String(row?.label ?? ''), x + width / 2, cursorY + chartHeight - 4, { align: 'center' })
  })

  return cursorY + chartHeight + 4
}

const drawExpenseCompositionChart = (doc, cursorY, rows) => {
  const margin = 14
  const boxWidth = doc.internal.pageSize.getWidth() - margin * 2
  const boxHeight = 48

  doc.setFillColor(248, 250, 252)
  doc.roundedRect(margin, cursorY, boxWidth, boxHeight, 2.4, 2.4, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(51, 65, 85)
  doc.text('Composición de egresos', margin + 3, cursorY + 6)

  const safeRows = (Array.isArray(rows) ? rows : []).filter((row) => Number(row?.amount || 0) > 0)
  const total = safeRows.reduce((acc, row) => acc + Number(row?.amount || 0), 0)
  const chartX = margin + 3
  const chartY = cursorY + 11
  const chartWidth = boxWidth - 6
  const chartHeight = 10

  const colorByKey = {
    stock: [59, 130, 246],
    operating: [16, 185, 129],
    withdrawals: [245, 158, 11],
    taxes: [239, 68, 68],
    investment: [99, 102, 241],
  }

  let currentX = chartX
  safeRows.forEach((row, index) => {
    const amount = Number(row?.amount || 0)
    const width = total > 0 ? (amount / total) * chartWidth : chartWidth / Math.max(1, safeRows.length)
    const color = colorByKey[String(row?.key || '')] || [71 + index * 11, 85 + index * 8, 105]
    doc.setFillColor(color[0], color[1], color[2])
    doc.rect(currentX, chartY, width, chartHeight, 'F')
    currentX += width
  })

  let legendY = chartY + 16
  safeRows.slice(0, 5).forEach((row, index) => {
    const color = colorByKey[String(row?.key || '')] || [71 + index * 11, 85 + index * 8, 105]
    doc.setFillColor(color[0], color[1], color[2])
    doc.rect(margin + 4, legendY - 2.8, 2.8, 2.8, 'F')

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.2)
    doc.setTextColor(30, 41, 59)
    const pct = Number(row?.percentOfExpense || 0)
    doc.text(`${String(row?.label || 'Categoría')}: ${pct.toFixed(1)}% (${formatCurrency(row?.amount)})`, margin + 8, legendY)
    legendY += 5.2
  })

  return cursorY + boxHeight + 4
}

export const generateDailyPanelMonthlyReportPDF = ({
  monthKey,
  monthLabel,
  generatedAt,
  openingFirst,
  closingLast,
  closedDays,
  openDays,
  closedWithDifferenceDays,
  totalIncome,
  totalExpense,
  totalNet,
  diffDays,
  highDiffDays,
  unknownIncomeCount,
  topClients = [],
  incomeByFund = [],
  expenseByFund = [],
  actorExpenses = [],
  categoryExpenses = [],
  biggestExpenses = [],
  busiestDays = [],
  weeklyNetRows = [],
  weeklyProductionRows = [],
  riskSignals = [],
  recommendations = [],
  smartInsights = [],
  comparison = {},
  ticketAverage,
  ordersCount,
  billingPerWorkedDay,
  productionTotal,
  productionPerWorkedDay,
  marginNetPercent,
  productionHoursTotal,
  productionPerHour,
  capacityInstalledBoxes,
  capacityUsagePercent,
  peakProductionDay,
  lowProductionDay,
  uniqueClientsCount,
  newClientsCount,
  recurrentClientsCount,
  top10Clients = [],
  top5SharePercent,
  increasedClients = [],
  churnedClients = [],
  inactiveClients = [],
  incomeTraceability = {},
  expenseTraceability = {},
  expenseBreakdown = [],
  stockPurchaseAmount,
  stockCoverageMonths,
  cashFlowRows = [],
  cashIndicators = {},
  breakEven = {},
  packyaScore = {},
  profitabilityVsLiquidity = {},
  cashImpact = {},
  withdrawalsImpact = {},
  reinvestmentKpi = {},
  historical12Months = [],
  datoDelMes,
  dailyRows = [],
}) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const monthText = String(monthLabel ?? monthKey ?? 'Mes')
  const subtitle = `Análisis ejecutivo mensual | ${monthText} | Generado ${formatDateTime(generatedAt ?? new Date())}`
  const scoreValue = Number(packyaScore?.value || 0)
  const scoreLabel = String(packyaScore?.label || 'Sin clasificar')
  const scoreBreakdown = Array.isArray(packyaScore?.breakdown) ? packyaScore.breakdown : []
  const withdrawalsAmount = Number(withdrawalsImpact?.amount || 0)
  const showWithdrawalsSection = withdrawalsAmount > 0
  const outflowBusiness = Number(cashImpact?.realOutflow?.businessOperation || 0)
  const outflowGrowth = Number(cashImpact?.realOutflow?.growth || 0)
  const outflowPersonal = Number(cashImpact?.realOutflow?.personal || 0)
  const totalOutflowBuckets = outflowBusiness + outflowGrowth + outflowPersonal

  const formatDirection = (item, isMoney = true) => {
    const direction = String(item?.direction || 'flat')
    const value = Number(item?.value || 0)
    if (direction === 'up') return `Sube ${value.toFixed(1)}%`
    if (direction === 'down') return `Baja ${value.toFixed(1)}%`
    return isMoney ? 'Sin cambio relevante' : 'Variación neutra'
  }

  const safeMoney = (value) => formatCurrency(Number(value || 0))
  const safePercent = (value) => `${Number(value || 0).toFixed(1)}%`
  const estimateKpiBlockHeight = (cardsCount) => Math.ceil(Math.max(Number(cardsCount || 0), 0) / 3) * 26 + 2

  const appendBullets = (items, fallbackText) => {
    const safeItems = Array.isArray(items) ? items.filter(Boolean) : []
    const rows = safeItems.length > 0 ? safeItems : [fallbackText]
    rows.forEach((text) => {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(30, 41, 59)

      const bulletText = `• ${String(text)}`
      const bulletLines = doc.splitTextToSize(bulletText, 176)
      const linesCount = Array.isArray(bulletLines) ? bulletLines.length : 1

      cursorY = ensurePageSpaceWithoutTable(doc, cursorY, 4 + linesCount * 4.2, 'Informe Mensual Ejecutivo', subtitle)
      doc.text(bulletLines, 16, cursorY)
      cursorY += linesCount * 4.2 + 0.8
    })
  }

  let cursorY = drawHeader(doc, `Informe Mensual Ejecutivo`, subtitle)

  const topKpiCards = [
    { label: 'Ingresos del mes', value: formatCurrency(totalIncome) },
    { label: 'Egresos del mes', value: formatCurrency(totalExpense) },
    { label: 'Resultado neto', value: formatCurrency(totalNet), note: totalNet >= 0 ? 'Resultado positivo' : 'Resultado negativo' },
    { label: 'Apertura inicial', value: formatCurrency(openingFirst) },
    { label: 'Cierre final', value: formatCurrency(closingLast) },
    { label: 'Días cerrados', value: `${Number(closedDays || 0)}`, note: `${Number(openDays || 0)} abiertos` },
    { label: 'Días con diferencia', value: `${Number(diffDays || 0)}`, note: `${Number(highDiffDays || 0)} altos` },
    { label: 'Cierres con desvío', value: `${Number(closedWithDifferenceDays || 0)}` },
    { label: 'Cobros sin vincular', value: `${Number(unknownIncomeCount || 0)}` },
    { label: 'Packya Score', value: `${scoreValue}/100`, note: scoreLabel },
  ]
  cursorY = ensurePageSpaceWithoutTable(doc, cursorY, estimateKpiBlockHeight(topKpiCards.length), 'Informe Mensual Ejecutivo', subtitle)
  cursorY = drawKpiCards(doc, cursorY, topKpiCards)

  cursorY += 2
  cursorY = ensurePageSpaceWithoutTable(doc, cursorY, 20, 'Informe Mensual Ejecutivo', subtitle)
  cursorY = drawSectionTitle(doc, cursorY, 'El dato del mes')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(30, 41, 59)
  const datoLines = doc.splitTextToSize(String(datoDelMes || 'No se detectó un dato destacado para este período.'), 180)
  doc.text(datoLines, 16, cursorY)
  cursorY += datoLines.length * 4.2 + 2

  cursorY = ensurePageSpaceWithoutTable(doc, cursorY, 24, 'Informe Mensual Ejecutivo', subtitle)
  cursorY = drawSectionTitle(doc, cursorY, 'Comparación contra mes anterior')
  const comparisonColumns = [
    { key: 'metric', label: 'Indicador', width: 58, align: 'left' },
    { key: 'current', label: 'Actual', width: 36, align: 'right' },
    { key: 'previous', label: 'Anterior', width: 36, align: 'right' },
    { key: 'delta', label: 'Evolución', width: 46, align: 'right' },
  ]
  cursorY = drawTableHeader(doc, cursorY, comparisonColumns)

  const comparisonRows = [
    { metric: 'Facturación', current: safeMoney(comparison?.billing?.current), previous: safeMoney(comparison?.billing?.previous), delta: formatDirection(comparison?.billing) },
    { metric: 'Egresos', current: safeMoney(comparison?.expenses?.current), previous: safeMoney(comparison?.expenses?.previous), delta: formatDirection(comparison?.expenses) },
    { metric: 'Resultado', current: safeMoney(comparison?.result?.current), previous: safeMoney(comparison?.result?.previous), delta: formatDirection(comparison?.result) },
    { metric: 'Producción (cajas)', current: String(Number(comparison?.production?.current || 0)), previous: String(Number(comparison?.production?.previous || 0)), delta: formatDirection(comparison?.production, false) },
    { metric: 'Pedidos', current: String(Number(comparison?.orders?.current || 0)), previous: String(Number(comparison?.orders?.previous || 0)), delta: formatDirection(comparison?.orders, false) },
  ]

  comparisonRows.forEach((row) => {
    cursorY = ensureSpace(doc, cursorY, 10, {
      pageTitle: 'Informe Mensual Ejecutivo',
      pageSubtitle: subtitle,
      columns: comparisonColumns,
    })
    cursorY = drawRow(doc, cursorY, comparisonColumns, row)
  })

  cursorY += 4
  const directionKpiCards = [
    { label: 'Ticket promedio', value: safeMoney(ticketAverage) },
    { label: 'Facturación por día', value: safeMoney(billingPerWorkedDay) },
    { label: 'Margen neto', value: safePercent(marginNetPercent) },
    { label: 'Pedidos del mes', value: String(Number(ordersCount || 0)) },
    { label: 'Producción total', value: `${Number(productionTotal || 0)} cajas` },
    { label: 'Producción por día', value: `${Number(productionPerWorkedDay || 0).toFixed(1)} cajas` },
    { label: 'Horas de producción', value: `${Number(productionHoursTotal || 0).toFixed(1)} h` },
    { label: 'Producción por hora', value: `${Number(productionPerHour || 0).toFixed(2)} cajas/h` },
    { label: 'Uso de capacidad', value: safePercent(capacityUsagePercent), note: capacityInstalledBoxes > 0 ? `${Number(capacityInstalledBoxes)} cajas instaladas` : 'Sin capacidad definida' },
  ]

  cursorY = ensurePageSpaceWithoutTable(
    doc,
    cursorY,
    8 + estimateKpiBlockHeight(directionKpiCards.length),
    'Informe Mensual Ejecutivo',
    subtitle,
  )
  cursorY = drawSectionTitle(doc, cursorY, 'KPIs de dirección')
  cursorY = drawKpiCards(doc, cursorY, directionKpiCards)

  cursorY += 2
  cursorY = ensurePageSpaceWithoutTable(doc, cursorY, 26, 'Informe Mensual Ejecutivo', subtitle)
  cursorY = drawSectionTitle(doc, cursorY, 'Impacto de la Caja')

  const cashFlowImpactColumns = [
    { key: 'label', label: 'Flujo del efectivo', width: 124, align: 'left' },
    { key: 'amount', label: 'Monto', width: 52, align: 'right' },
  ]

  cursorY = drawTableHeader(doc, cursorY, cashFlowImpactColumns)
  const cashImpactRows = [
    { label: 'Caja inicial', amount: safeMoney(cashImpact?.opening) },
    { label: '+ Ingresos del mes', amount: safeMoney(cashImpact?.income) },
    { label: '- Egresos operativos', amount: safeMoney(cashImpact?.operatingOut) },
    { label: '- Compra de stock', amount: `${safeMoney(cashImpact?.stockOut)} (${safePercent((Number(cashImpact?.stockOut || 0) / Math.max(totalExpense || 1, 1)) * 100)} de egresos)` },
    { label: '- Retiros de socios', amount: safeMoney(cashImpact?.withdrawalsOut) },
    { label: 'Caja final', amount: safeMoney(cashImpact?.final) },
    { label: 'Caja potencial sin retiros', amount: safeMoney(cashImpact?.potentialFinal) },
  ]

  cashImpactRows.forEach((row) => {
    cursorY = ensureSpace(doc, cursorY, 12, {
      pageTitle: 'Informe Mensual Ejecutivo',
      pageSubtitle: subtitle,
      columns: cashFlowImpactColumns,
    })
    cursorY = drawRow(doc, cursorY, cashFlowImpactColumns, row)
  })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.8)
  doc.setTextColor(51, 65, 85)
  const potentialText = `Si durante este mes no se hubieran realizado retiros de socios, la caja disponible habría sido ${safeMoney(cashImpact?.potentialFinal)}. Este indicador muestra impacto sobre liquidez y capacidad de reinversión.`
  const potentialLines = doc.splitTextToSize(potentialText, 176)
  cursorY = ensurePageSpaceWithoutTable(doc, cursorY, potentialLines.length * 4.2 + 6, 'Informe Mensual Ejecutivo', subtitle)
  doc.text(potentialLines, 16, cursorY)
  cursorY += potentialLines.length * 4.2 + 1.5

  if (showWithdrawalsSection) {
    cursorY = ensurePageSpaceWithoutTable(doc, cursorY, 22, 'Informe Mensual Ejecutivo', subtitle)
    cursorY = drawSectionTitle(doc, cursorY, 'Impacto de los retiros de socios')
    cursorY = drawTableHeader(doc, cursorY, cashFlowImpactColumns)

    const withdrawalRows = [
      { label: 'Monto retirado en el mes', amount: safeMoney(withdrawalsImpact?.amount) },
      { label: 'Peso sobre egresos', amount: safePercent(withdrawalsImpact?.pctOfExpense) },
      { label: 'Peso sobre facturación', amount: safePercent(withdrawalsImpact?.pctOfIncome) },
      { label: 'Impacto sobre liquidez', amount: String(withdrawalsImpact?.liquidityImpactText || 'Sin impacto relevante informado') },
    ]

    withdrawalRows.forEach((row) => {
      cursorY = ensureSpace(doc, cursorY, 12, {
        pageTitle: 'Informe Mensual Ejecutivo',
        pageSubtitle: subtitle,
        columns: cashFlowImpactColumns,
      })
      cursorY = drawRow(doc, cursorY, cashFlowImpactColumns, row)
    })
  }

  cursorY += 2
  cursorY = ensurePageSpaceWithoutTable(doc, cursorY, 18, 'Informe Mensual Ejecutivo', subtitle)
  cursorY = drawSectionTitle(doc, cursorY, 'Rentabilidad vs Liquidez')
  const rvlText = `${String(profitabilityVsLiquidity?.profitabilityLabel || 'Rentabilidad sin clasificar')} | ${String(profitabilityVsLiquidity?.liquidityLabel || 'Liquidez sin clasificar')}. ${String(profitabilityVsLiquidity?.explanation || '')}`
  const rvlLines = doc.splitTextToSize(rvlText, 176)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(30, 41, 59)
  doc.text(rvlLines, 16, cursorY)
  cursorY += rvlLines.length * 4.2 + 1.5

  cursorY = ensurePageSpaceWithoutTable(doc, cursorY, 56, 'Informe Mensual Ejecutivo', subtitle)
  cursorY = drawExpenseCompositionChart(doc, cursorY, expenseBreakdown)

  cursorY = ensurePageSpaceWithoutTable(doc, cursorY, 22, 'Informe Mensual Ejecutivo', subtitle)
  cursorY = drawSectionTitle(doc, cursorY, 'Dinero reinvertido y salida real de dinero')
  cursorY = drawTableHeader(doc, cursorY, cashFlowImpactColumns)

  const outflowRows = [
    { label: 'Facturación', amount: safeMoney(reinvestmentKpi?.billing) },
    { label: 'Compra de stock', amount: `${safeMoney(reinvestmentKpi?.stockPurchase)} (${safePercent(reinvestmentKpi?.reinvestedPercent)} de facturación)` },
    { label: 'Salida real: funcionamiento del negocio', amount: `${safeMoney(outflowBusiness)} (${safePercent(totalOutflowBuckets > 0 ? (outflowBusiness / totalOutflowBuckets) * 100 : 0)} de salidas)` },
    { label: 'Salida real: crecimiento (stock + inversión)', amount: `${safeMoney(outflowGrowth)} (${safePercent(totalOutflowBuckets > 0 ? (outflowGrowth / totalOutflowBuckets) * 100 : 0)} de salidas)` },
    { label: 'Salida real: retiros de socios', amount: `${safeMoney(outflowPersonal)} (${safePercent(totalOutflowBuckets > 0 ? (outflowPersonal / totalOutflowBuckets) * 100 : 0)} de salidas)` },
  ]

  outflowRows.forEach((row) => {
    cursorY = ensureSpace(doc, cursorY, 12, {
      pageTitle: 'Informe Mensual Ejecutivo',
      pageSubtitle: subtitle,
      columns: cashFlowImpactColumns,
    })
    cursorY = drawRow(doc, cursorY, cashFlowImpactColumns, row)
  })

  cursorY += 2
  cursorY = ensurePageSpaceWithoutTable(doc, cursorY, 28, 'Informe Mensual Ejecutivo', subtitle)
  cursorY = drawSectionTitle(doc, cursorY, 'Señales clave para dirección')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(30, 41, 59)

  appendBullets(riskSignals.slice(0, 8), 'Sin alertas críticas detectadas para este mes.')

  cursorY += 1
  cursorY = ensurePageSpaceWithoutTable(doc, cursorY, 28, 'Informe Mensual Ejecutivo', subtitle)
  cursorY = drawSectionTitle(doc, cursorY, 'Recomendaciones automáticas')
  appendBullets(recommendations.slice(0, 10), 'Sin recomendaciones críticas para este mes.')

  cursorY += 1
  cursorY = ensurePageSpaceWithoutTable(doc, cursorY, 24, 'Informe Mensual Ejecutivo', subtitle)
  cursorY = drawSectionTitle(doc, cursorY, 'Packya Score explicado')
  cursorY = drawTableHeader(doc, cursorY, [
    { key: 'factor', label: 'Factor', width: 124, align: 'left' },
    { key: 'points', label: 'Puntos', width: 52, align: 'right' },
  ])

  ;(Array.isArray(scoreBreakdown) ? scoreBreakdown : []).forEach((row) => {
    cursorY = ensureSpace(doc, cursorY, 10, {
      pageTitle: 'Informe Mensual Ejecutivo',
      pageSubtitle: subtitle,
      columns: [
        { key: 'factor', label: 'Factor', width: 124, align: 'left' },
        { key: 'points', label: 'Puntos', width: 52, align: 'right' },
      ],
    })
    cursorY = drawRow(doc, cursorY, [
      { key: 'factor', label: 'Factor', width: 124, align: 'left' },
      { key: 'points', label: 'Puntos', width: 52, align: 'right' },
    ], {
      factor: String(row?.label || 'Factor'),
      points: `${Number(row?.points || 0) >= 0 ? '+' : ''}${Number(row?.points || 0).toFixed(1)}`,
    })
  })

  cursorY = ensurePageSpaceWithoutTable(doc, cursorY, 8, 'Informe Mensual Ejecutivo', subtitle)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(15, 23, 42)
  doc.text(`Resultado Packya Score: ${scoreValue}/100 (${scoreLabel})`, 16, cursorY)
  cursorY += 5

  cursorY = ensurePageSpaceWithoutTable(doc, cursorY, 18, 'Informe Mensual Ejecutivo', subtitle)
  cursorY = drawSectionTitle(doc, cursorY, 'Análisis inteligente del período')
  appendBullets((Array.isArray(smartInsights) ? smartInsights : []).slice(0, 4), 'Sin insights destacados para este período.')

  cursorY += 1
  cursorY = ensurePageSpaceWithoutTable(doc, cursorY, 22, 'Informe Mensual Ejecutivo', subtitle)
  cursorY = drawSectionTitle(doc, cursorY, 'Trazabilidad de ingresos y egresos')

  const traceColumns = [
    { key: 'label', label: 'Indicador', width: 124, align: 'left' },
    { key: 'amount', label: 'Valor', width: 52, align: 'right' },
  ]

  cursorY = drawTableHeader(doc, cursorY, traceColumns)
  const traceRows = [
    { label: 'Ingresos vinculados a cliente/pedido', amount: `${Number(incomeTraceability?.linkedCount || 0)} mov. | ${safeMoney(incomeTraceability?.linkedAmount)}` },
    { label: 'Ingresos sin vincular', amount: `${Number(incomeTraceability?.unlinkedCount || 0)} mov. | ${safeMoney(incomeTraceability?.unlinkedAmount)}` },
    { label: 'Egresos con proveedor identificado', amount: `${Number(expenseTraceability?.withSupplierCount || 0)} mov. | ${safeMoney(expenseTraceability?.withSupplierAmount)}` },
    { label: 'Egresos sin proveedor identificado', amount: `${Number(expenseTraceability?.withoutSupplierCount || 0)} mov. | ${safeMoney(expenseTraceability?.withoutSupplierAmount)}` },
  ]

  traceRows.forEach((row) => {
    cursorY = ensureSpace(doc, cursorY, 12, {
      pageTitle: 'Informe Mensual Ejecutivo',
      pageSubtitle: subtitle,
      columns: traceColumns,
    })
    cursorY = drawRow(doc, cursorY, traceColumns, row)
  })

  cursorY += 2
  cursorY = ensurePageSpaceWithoutTable(doc, cursorY, 16, 'Informe Mensual Ejecutivo', subtitle)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(51, 65, 85)
  doc.text('Ingresos sin vínculo (principales conceptos)', 16, cursorY)
  cursorY += 4
  appendBullets(
    (Array.isArray(incomeTraceability?.unlinkedConcepts) ? incomeTraceability.unlinkedConcepts : [])
      .slice(0, 5)
      .map((row) => `${String(row?.concept || 'Sin concepto')} (${Number(row?.count || 0)} mov.) ${safeMoney(row?.amount)}`),
    'Sin ingresos sin vincular para destacar.',
  )

  cursorY += 1
  cursorY = ensurePageSpaceWithoutTable(doc, cursorY, 16, 'Informe Mensual Ejecutivo', subtitle)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(51, 65, 85)
  doc.text('Egresos por proveedor (top)', 16, cursorY)
  cursorY += 4
  appendBullets(
    (Array.isArray(expenseTraceability?.topSuppliers) ? expenseTraceability.topSuppliers : [])
      .slice(0, 6)
      .map((row) => `${String(row?.supplierName || 'Sin proveedor')} (${Number(row?.movements || 0)} mov.) ${safeMoney(row?.amount)}`),
    'No hay egresos con proveedor identificado en este período.',
  )

  cursorY += 1
  cursorY = ensurePageSpaceWithoutTable(doc, cursorY, 16, 'Informe Mensual Ejecutivo', subtitle)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(51, 65, 85)
  doc.text('Egresos sin proveedor (conceptos a completar)', 16, cursorY)
  cursorY += 4
  appendBullets(
    (Array.isArray(expenseTraceability?.withoutSupplierConcepts) ? expenseTraceability.withoutSupplierConcepts : [])
      .slice(0, 5)
      .map((row) => `${String(row?.concept || 'Sin concepto')} (${Number(row?.count || 0)} mov.) ${safeMoney(row?.amount)}`),
    'No hay egresos pendientes de proveedor.',
  )

  cursorY += 1
  cursorY = ensurePageSpaceWithoutTable(doc, cursorY, 52, 'Informe Mensual Ejecutivo', subtitle)
  cursorY = drawWeeklyNetChart(doc, cursorY, weeklyNetRows, 'Verde = neto positivo | Rojo = neto negativo')

  const twoColSummaryColumns = [
    { key: 'label', label: 'Concepto', width: 124, align: 'left' },
    { key: 'amount', label: 'Monto', width: 52, align: 'right' },
  ]

  cursorY = ensurePageSpaceWithoutTable(doc, cursorY, 16, 'Informe Mensual Ejecutivo', subtitle)
  cursorY = drawSectionTitle(doc, cursorY, 'Producción y capacidad')
  cursorY = drawTableHeader(doc, cursorY, twoColSummaryColumns)

  const productionSummaryRows = [
    { label: 'Dia de mayor producción', amount: `${formatShortDate(peakProductionDay?.dateKey)} (${Number(peakProductionDay?.printedBoxes || 0)} cajas)` },
    { label: 'Dia de menor producción (con actividad)', amount: `${formatShortDate(lowProductionDay?.dateKey)} (${Number(lowProductionDay?.printedBoxes || 0)} cajas)` },
    { label: 'Producción total del mes', amount: `${Number(productionTotal || 0)} cajas` },
    { label: 'Producción promedio por día trabajado', amount: `${Number(productionPerWorkedDay || 0).toFixed(2)} cajas` },
    { label: 'Utilización de capacidad', amount: safePercent(capacityUsagePercent) },
  ]

  productionSummaryRows.forEach((row) => {
    cursorY = ensureSpace(doc, cursorY, 10, {
      pageTitle: 'Informe Mensual Ejecutivo',
      pageSubtitle: subtitle,
      columns: twoColSummaryColumns,
    })
    cursorY = drawRow(doc, cursorY, twoColSummaryColumns, row)
  })

  cursorY += 2
  cursorY = ensurePageSpaceWithoutTable(doc, cursorY, 16, 'Informe Mensual Ejecutivo', subtitle)
  const weeklyProdColumns = [
    { key: 'week', label: 'Semana', width: 96, align: 'left' },
    { key: 'production', label: 'Cajas producidas', width: 80, align: 'right' },
  ]
  cursorY = drawTableHeader(doc, cursorY, weeklyProdColumns)
  ;(Array.isArray(weeklyProductionRows) ? weeklyProductionRows : []).forEach((row) => {
    cursorY = ensureSpace(doc, cursorY, 10, {
      pageTitle: 'Informe Mensual Ejecutivo',
      pageSubtitle: subtitle,
      columns: weeklyProdColumns,
    })
    cursorY = drawRow(doc, cursorY, weeklyProdColumns, {
      week: String(row?.label || 'Semana'),
      production: String(Number(row?.production || 0)),
    })
  })

  cursorY = ensurePageSpaceWithoutTable(doc, cursorY, 16, 'Informe Mensual Ejecutivo', subtitle)
  cursorY = drawSectionTitle(doc, cursorY, 'Clientes que más aportaron')
  cursorY = drawTableHeader(doc, cursorY, twoColSummaryColumns)

  ;(Array.isArray(topClients) ? topClients : []).slice(0, 8).forEach((row) => {
    cursorY = ensureSpace(doc, cursorY, 10, {
      pageTitle: 'Informe Mensual Ejecutivo',
      pageSubtitle: subtitle,
      columns: twoColSummaryColumns,
    })
    cursorY = drawRow(doc, cursorY, twoColSummaryColumns, {
      label: `${String(row?.clientName ?? 'Sin cliente')} (${String(row?.movements ?? 0)} cobro/s)`,
      amount: formatCurrency(row?.amount),
    })
  })

  cursorY += 2
  cursorY = ensurePageSpaceWithoutTable(doc, cursorY, 16, 'Informe Mensual Ejecutivo', subtitle)
  cursorY = drawTableHeader(doc, cursorY, twoColSummaryColumns)
  const clientOverviewRows = [
    { label: 'Clientes únicos del mes', amount: String(Number(uniqueClientsCount || 0)) },
    { label: 'Clientes nuevos', amount: String(Number(newClientsCount || 0)) },
    { label: 'Clientes recurrentes', amount: String(Number(recurrentClientsCount || 0)) },
    { label: 'Participación Top 5', amount: safePercent(top5SharePercent) },
  ]
  clientOverviewRows.forEach((row) => {
    cursorY = ensureSpace(doc, cursorY, 10, {
      pageTitle: 'Informe Mensual Ejecutivo',
      pageSubtitle: subtitle,
      columns: twoColSummaryColumns,
    })
    cursorY = drawRow(doc, cursorY, twoColSummaryColumns, row)
  })

  cursorY += 2
  cursorY = ensurePageSpaceWithoutTable(doc, cursorY, 16, 'Informe Mensual Ejecutivo', subtitle)
  cursorY = drawSectionTitle(doc, cursorY, 'Top 10 clientes por facturación')
  cursorY = drawTableHeader(doc, cursorY, twoColSummaryColumns)
  ;(Array.isArray(top10Clients) ? top10Clients : []).slice(0, 10).forEach((row) => {
    cursorY = ensureSpace(doc, cursorY, 10, {
      pageTitle: 'Informe Mensual Ejecutivo',
      pageSubtitle: subtitle,
      columns: twoColSummaryColumns,
    })
    cursorY = drawRow(doc, cursorY, twoColSummaryColumns, {
      label: `${String(row?.clientName || 'Sin cliente')} (${Number(row?.orders || 0)} pedido/s)`,
      amount: safeMoney(row?.billed),
    })
  })

  cursorY += 2
  cursorY = ensurePageSpaceWithoutTable(doc, cursorY, 20, 'Informe Mensual Ejecutivo', subtitle)
  cursorY = drawSectionTitle(doc, cursorY, 'Evolución de clientes (resumen)')
  appendBullets(
    [
      increasedClients.length > 0 ? `Clientes que aumentaron compra: ${increasedClients.slice(0, 5).join(', ')}` : '',
      churnedClients.length > 0 ? `Clientes que dejaron de comprar este mes: ${churnedClients.slice(0, 5).join(', ')}` : '',
      inactiveClients.length > 0 ? `Clientes inactivos detectados: ${inactiveClients.slice(0, 5).join(', ')}` : '',
    ].filter(Boolean),
    'Sin variaciones destacadas en la cartera de clientes.',
  )

  cursorY += 4
  cursorY = ensurePageSpaceWithoutTable(doc, cursorY, 18, 'Informe Mensual Ejecutivo', subtitle)
  cursorY = drawSectionTitle(doc, cursorY, 'Distribución por fondo (dónde se movió la plata)')

  const fundColumns = [
    { key: 'fund', label: 'Fondo / Cuenta', width: 90, align: 'left' },
    { key: 'income', label: 'Ingresó', width: 43, align: 'right' },
    { key: 'expense', label: 'Salió', width: 43, align: 'right' },
  ]

  cursorY = drawTableHeader(doc, cursorY, fundColumns)
  const expenseByFundMap = (Array.isArray(expenseByFund) ? expenseByFund : []).reduce((acc, row) => {
    acc[String(row?.fundId ?? '')] = Number(row?.amount || 0)
    return acc
  }, {})

  ;(Array.isArray(incomeByFund) ? incomeByFund : []).forEach((row) => {
    cursorY = ensureSpace(doc, cursorY, 10, {
      pageTitle: 'Informe Mensual Ejecutivo',
      pageSubtitle: subtitle,
      columns: fundColumns,
    })
    cursorY = drawRow(doc, cursorY, fundColumns, {
      fund: String(row?.fundLabel ?? 'Sin fondo'),
      income: formatCurrency(row?.amount),
      expense: formatCurrency(expenseByFundMap[String(row?.fundId ?? '')] || 0),
    })
  })

  cursorY += 4
  cursorY = ensurePageSpaceWithoutTable(doc, cursorY, 18, 'Informe Mensual Ejecutivo', subtitle)
  cursorY = drawSectionTitle(doc, cursorY, 'Responsables y destino de egresos')

  cursorY = drawTableHeader(doc, cursorY, twoColSummaryColumns)
  ;(Array.isArray(actorExpenses) ? actorExpenses : []).forEach((row) => {
    cursorY = ensureSpace(doc, cursorY, 10, {
      pageTitle: 'Informe Mensual Ejecutivo',
      pageSubtitle: subtitle,
      columns: twoColSummaryColumns,
    })
    cursorY = drawRow(doc, cursorY, twoColSummaryColumns, {
      label: `Responsable: ${String(row?.actor ?? 'Sin actor')}`,
      amount: formatCurrency(row?.amount),
    })
  })

  ;(Array.isArray(categoryExpenses) ? categoryExpenses : []).slice(0, 8).forEach((row) => {
    cursorY = ensureSpace(doc, cursorY, 10, {
      pageTitle: 'Informe Mensual Ejecutivo',
      pageSubtitle: subtitle,
      columns: twoColSummaryColumns,
    })
    cursorY = drawRow(doc, cursorY, twoColSummaryColumns, {
      label: `Categoría: ${String(row?.category ?? 'Sin categoría')}`,
      amount: formatCurrency(row?.amount),
    })
  })

  cursorY += 4
  cursorY = ensurePageSpaceWithoutTable(doc, cursorY, 18, 'Informe Mensual Ejecutivo', subtitle)
  cursorY = drawSectionTitle(doc, cursorY, 'Finanzas por tipo de egreso')
  cursorY = drawTableHeader(doc, cursorY, twoColSummaryColumns)
  ;(Array.isArray(expenseBreakdown) ? expenseBreakdown : []).forEach((row) => {
    cursorY = ensureSpace(doc, cursorY, 10, {
      pageTitle: 'Informe Mensual Ejecutivo',
      pageSubtitle: subtitle,
      columns: twoColSummaryColumns,
    })
    cursorY = drawRow(doc, cursorY, twoColSummaryColumns, {
      label: `${String(row?.label || 'Sin clasificación')} (${safePercent(row?.percentOfExpense)} de egresos)`,
      amount: `${safeMoney(row?.amount)} | ${safePercent(row?.percentOfIncome)} de facturación`,
    })
  })

  cursorY += 2
  cursorY = ensurePageSpaceWithoutTable(doc, cursorY, 18, 'Informe Mensual Ejecutivo', subtitle)
  cursorY = drawSectionTitle(doc, cursorY, 'Stock inteligente y punto de equilibrio')
  cursorY = drawTableHeader(doc, cursorY, twoColSummaryColumns)

  const hasStockCoverage = Number(stockCoverageMonths || 0) > 0
  const breakEvenAvailable = Boolean(breakEven?.available)
  const financeRows = [
    { label: 'Compra de stock del mes', amount: `${safeMoney(stockPurchaseAmount)} (${safePercent((Number(stockPurchaseAmount || 0) / Math.max(totalExpense || 1, 1)) * 100)} de egresos)` },
    { label: 'Cobertura de stock', amount: hasStockCoverage ? `${Number(stockCoverageMonths).toFixed(2)} meses` : 'Cobertura no disponible' },
    {
      label: 'Punto de equilibrio (break-even)',
      amount: breakEvenAvailable
        ? `${safeMoney(breakEven?.point)} (costos fijos ${safeMoney(breakEven?.fixedCosts)} / margen ${(Number(breakEven?.contributionMarginRatio || 0) * 100).toFixed(1)}%)`
        : 'No disponible por falta de costos fijos y margen de contribución',
    },
    {
      label: 'Facturación vs break-even',
      amount: breakEvenAvailable
        ? `${safeMoney(breakEven?.billing)} (${safePercent(breakEven?.pctOver)} sobre punto)`
        : 'Indicador oculto para evitar cálculo incorrecto',
    },
  ]

  financeRows.forEach((row) => {
    cursorY = ensureSpace(doc, cursorY, 10, {
      pageTitle: 'Informe Mensual Ejecutivo',
      pageSubtitle: subtitle,
      columns: twoColSummaryColumns,
    })
    cursorY = drawRow(doc, cursorY, twoColSummaryColumns, row)
  })

  cursorY += 4
  cursorY = ensurePageSpaceWithoutTable(doc, cursorY, 18, 'Informe Mensual Ejecutivo', subtitle)
  cursorY = drawSectionTitle(doc, cursorY, 'Días de mayor actividad operativa')

  const busyColumns = [
    { key: 'date', label: 'Fecha', width: 30, align: 'left' },
    { key: 'orders', label: 'Tom/Ent', width: 26, align: 'right' },
    { key: 'cobros', label: 'Cobros', width: 22, align: 'right' },
    { key: 'prod', label: 'Producc.', width: 22, align: 'right' },
    { key: 'ready', label: 'Listos', width: 18, align: 'right' },
    { key: 'boxes', label: 'Cajas', width: 18, align: 'right' },
    { key: 'net', label: 'Neto', width: 40, align: 'right' },
  ]

  cursorY = drawTableHeader(doc, cursorY, busyColumns)
  ;(Array.isArray(busiestDays) ? busiestDays : []).slice(0, 7).forEach((row) => {
    cursorY = ensureSpace(doc, cursorY, 10, {
      pageTitle: 'Informe Mensual Ejecutivo',
      pageSubtitle: subtitle,
      columns: busyColumns,
    })
    cursorY = drawRow(doc, cursorY, busyColumns, {
      date: formatShortDate(row?.dateKey),
      orders: `${Number(row?.ordersTaken || 0)}/${Number(row?.ordersDelivered || 0)}`,
      cobros: String(Number(row?.paymentsRegistered || 0)),
      prod: String(Number(row?.productionActivity || 0)),
      ready: String(Number(row?.readyOrders || 0)),
      boxes: String(Number(row?.printedBoxes || 0)),
      net: formatCurrency(row?.net),
    })
  })

  cursorY += 4
  cursorY = ensurePageSpaceWithoutTable(doc, cursorY, 18, 'Informe Mensual Ejecutivo', subtitle)
  cursorY = drawSectionTitle(doc, cursorY, 'Indicadores de caja y flujo acumulado')
  cursorY = drawTableHeader(doc, cursorY, twoColSummaryColumns)

  const cashRows = [
    { label: 'Caja máxima del mes', amount: safeMoney(cashIndicators?.maxCash) },
    { label: 'Caja mínima del mes', amount: safeMoney(cashIndicators?.minCash) },
    { label: 'Caja promedio', amount: safeMoney(cashIndicators?.avgCash) },
    { label: 'Días bajo mínimo recomendado', amount: `${Number(cashIndicators?.daysBelowMinCash || 0)} (min ${safeMoney(cashIndicators?.minRecommendedCash)})` },
  ]

  cashRows.forEach((row) => {
    cursorY = ensureSpace(doc, cursorY, 10, {
      pageTitle: 'Informe Mensual Ejecutivo',
      pageSubtitle: subtitle,
      columns: twoColSummaryColumns,
    })
    cursorY = drawRow(doc, cursorY, twoColSummaryColumns, row)
  })

  cursorY += 2
  cursorY = ensurePageSpaceWithoutTable(doc, cursorY, 18, 'Informe Mensual Ejecutivo', subtitle)
  const cashFlowColumns = [
    { key: 'date', label: 'Fecha', width: 32, align: 'left' },
    { key: 'in', label: 'Ingresos', width: 46, align: 'right' },
    { key: 'out', label: 'Egresos', width: 46, align: 'right' },
    { key: 'acc', label: 'Saldo acumulado', width: 52, align: 'right' },
  ]
  cursorY = drawTableHeader(doc, cursorY, cashFlowColumns)
  ;(Array.isArray(cashFlowRows) ? cashFlowRows : []).slice(-8).forEach((row) => {
    cursorY = ensureSpace(doc, cursorY, 10, {
      pageTitle: 'Informe Mensual Ejecutivo',
      pageSubtitle: subtitle,
      columns: cashFlowColumns,
    })
    cursorY = drawRow(doc, cursorY, cashFlowColumns, {
      date: formatShortDate(row?.dateKey),
      in: safeMoney(row?.income),
      out: safeMoney(row?.expense),
      acc: safeMoney(row?.accumulated),
    })
  })

  cursorY += 4
  cursorY = ensurePageSpaceWithoutTable(doc, cursorY, 20, 'Informe Mensual Ejecutivo', subtitle)
  cursorY = drawSectionTitle(doc, cursorY, 'Top egresos del mes (control de fuga)')

  const expenseColumns = [
    { key: 'date', label: 'Fecha', width: 24, align: 'left' },
    { key: 'responsable', label: 'Resp.', width: 22, align: 'left' },
    { key: 'category', label: 'Categoría', width: 30, align: 'left' },
    { key: 'concept', label: 'Concepto', width: 72, align: 'left' },
    { key: 'amount', label: 'Monto', width: 28, align: 'right' },
  ]

  cursorY = drawTableHeader(doc, cursorY, expenseColumns)
  ;(Array.isArray(biggestExpenses) ? biggestExpenses : []).slice(0, 12).forEach((row) => {
    cursorY = ensureSpace(doc, cursorY, 10, {
      pageTitle: 'Informe Mensual Ejecutivo',
      pageSubtitle: subtitle,
      columns: expenseColumns,
    })
    cursorY = drawRow(doc, cursorY, expenseColumns, {
      date: formatShortDate(row?.dateKey),
      responsable: String(row?.actor ?? 'N/A'),
      category: String(row?.category ?? 'Sin categoría'),
      concept: String(row?.concept ?? 'Sin concepto'),
      amount: formatCurrency(row?.amount),
    })
  })

  cursorY += 4
  cursorY = ensurePageSpaceWithoutTable(doc, cursorY, 20, 'Informe Mensual Ejecutivo', subtitle)
  cursorY = drawSectionTitle(doc, cursorY, 'Histórico 12 meses (facturación, resultado y producción)')

  const historyColumns = [
    { key: 'month', label: 'Mes', width: 28, align: 'left' },
    { key: 'billing', label: 'Facturación', width: 49, align: 'right' },
    { key: 'profit', label: 'Resultado', width: 41, align: 'right' },
    { key: 'prod', label: 'Cajas', width: 24, align: 'right' },
    { key: 'cash', label: 'Caja final', width: 34, align: 'right' },
  ]

  cursorY = drawTableHeader(doc, cursorY, historyColumns)
  ;(Array.isArray(historical12Months) ? historical12Months : []).forEach((row) => {
    cursorY = ensureSpace(doc, cursorY, 10, {
      pageTitle: 'Informe Mensual Ejecutivo',
      pageSubtitle: subtitle,
      columns: historyColumns,
    })
    cursorY = drawRow(doc, cursorY, historyColumns, {
      month: String(row?.monthKey || ''),
      billing: safeMoney(row?.billing),
      profit: safeMoney(row?.profit),
      prod: String(Number(row?.production || 0)),
      cash: safeMoney(row?.finalCash),
    })
  })

  cursorY += 4
  cursorY = ensurePageSpaceWithoutTable(doc, cursorY, 20, 'Informe Mensual Ejecutivo', subtitle)
  cursorY = drawSectionTitle(doc, cursorY, 'Detalle diario del mes')

  const dayColumns = [
    { key: 'date', label: 'Fecha', width: 18, align: 'left' },
    { key: 'state', label: 'Estado', width: 22, align: 'left' },
    { key: 'ready', label: 'Listos', width: 12, align: 'right' },
    { key: 'boxes', label: 'Cajas', width: 14, align: 'right' },
    { key: 'open', label: 'Apertura', width: 23, align: 'right' },
    { key: 'in', label: 'Ingresos', width: 21, align: 'right' },
    { key: 'out', label: 'Egresos', width: 21, align: 'right' },
    { key: 'real', label: 'Real', width: 21, align: 'right' },
    { key: 'diff', label: 'Dif.', width: 20, align: 'right' },
  ]

  cursorY = drawTableHeader(doc, cursorY, dayColumns)
  ;(Array.isArray(dailyRows) ? dailyRows : []).forEach((row) => {
    cursorY = ensureSpace(doc, cursorY, 10, {
      pageTitle: 'Informe Mensual Ejecutivo',
      pageSubtitle: subtitle,
      columns: dayColumns,
    })
    cursorY = drawRow(doc, cursorY, dayColumns, {
      date: formatShortDate(row?.dateKey),
      state: String(row?.status ?? ''),
      ready: String(Number(row?.readyOrders || 0)),
      boxes: String(Number(row?.printedBoxes || 0)),
      open: formatCurrency(row?.openingTotal),
      in: formatCurrency(row?.incomeTotal),
      out: formatCurrency(row?.expenseTotal),
      real: formatCurrency(row?.realFinal),
      diff: formatCurrency(row?.difference),
    })
  })

  doc.addPage()
  let sociosY = drawHeader(doc, 'Informe para los socios', subtitle)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(15, 23, 42)
  doc.text('Resumen del mes', 14, sociosY)
  sociosY += 7

  const sociosNarrative = [
    comparison?.billing?.direction === 'up'
      ? `La facturación creció ${Number(comparison?.billing?.value || 0).toFixed(1)}% respecto al mes anterior.`
      : `La facturación se redujo ${Number(comparison?.billing?.value || 0).toFixed(1)}% respecto al mes anterior.`,
    comparison?.production?.direction === 'up'
      ? `La producción mostró una mejora de ${Number(comparison?.production?.value || 0).toFixed(1)}%.`
      : `La producción no logró sostener el nivel del mes anterior (variación ${Number(comparison?.production?.value || 0).toFixed(1)}%).`,
    Number(cashImpact?.stockOut || 0) > 0
      ? `Durante el mes se destinaron ${safeMoney(cashImpact?.stockOut)} a compra de stock, equivalente al ${safePercent((Number(cashImpact?.stockOut || 0) / Math.max(totalExpense || 1, 1)) * 100)} de los egresos.`
      : 'No hubo compras relevantes de stock en el período.',
    Number(withdrawalsImpact?.amount || 0) > 0
      ? `Los retiros de socios fueron ${safeMoney(withdrawalsImpact?.amount)} (${safePercent(withdrawalsImpact?.pctOfExpense)} de egresos), impactando la liquidez disponible.`
      : 'No se registraron retiros de socios en el mes.',
    Number(cashImpact?.liquidityDelta || 0) >= 0
      ? `La caja cerró con mejora neta de liquidez (${safeMoney(cashImpact?.liquidityDelta)} sobre la apertura).`
      : `La caja cerró con menor liquidez (${safeMoney(cashImpact?.liquidityDelta)} respecto de la apertura).`,
    `Recomendación central: ${String((Array.isArray(recommendations) && recommendations[0]) || 'priorizar decisiones que mejoren caja y trazabilidad financiera.')}`,
  ]

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(30, 41, 59)
  sociosNarrative.forEach((paragraph) => {
    const lines = doc.splitTextToSize(String(paragraph), 176)
    sociosY = ensurePageSpaceWithoutTable(doc, sociosY, lines.length * 4.8 + 4, 'Informe para los socios', subtitle)
    doc.text(lines, 16, sociosY)
    sociosY += lines.length * 4.8 + 2
  })

  finalizeCorporatePdf(doc, `Packya-InformeMensual-${String(monthKey ?? toFileDate())}.pdf`)
}
