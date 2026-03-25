import { jsPDF } from 'jspdf'
import logoPackya from '../assets/logo.png'

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
  const margin = 14

  doc.setFillColor(17, 24, 39)
  doc.rect(0, 0, pageWidth, 14, 'F')

  if (logoPackya) {
    doc.addImage(logoPackya, 'PNG', margin, 18, 18, 18)
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(15, 23, 42)
  doc.text(title, margin + 22, 24)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(100, 116, 139)
  doc.text(subtitle, margin + 22, 30)

  doc.setDrawColor(226, 232, 240)
  doc.line(margin, 38, pageWidth - margin, 38)

  return 46
}

const drawTableHeader = (doc, cursorY, columns) => {
  const margin = 14
  doc.setFillColor(248, 250, 252)
  doc.rect(margin, cursorY - 5, doc.internal.pageSize.getWidth() - margin * 2, 7, 'F')

  let x = margin
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(51, 65, 85)

  columns.forEach((column) => {
    const textX = column.align === 'right' ? x + column.width - 1 : x + 1
    doc.text(column.label, textX, cursorY, {
      align: column.align === 'right' ? 'right' : 'left',
    })
    x += column.width
  })

  return cursorY + 8
}

const drawRow = (doc, cursorY, columns, values) => {
  const margin = 14
  let x = margin

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(15, 23, 42)

  columns.forEach((column) => {
    const textX = column.align === 'right' ? x + column.width - 1 : x + 1
    const text = String(values[column.key] ?? '')
    doc.text(text, textX, cursorY, {
      align: column.align === 'right' ? 'right' : 'left',
      maxWidth: Math.max(column.width - 2, 8),
    })
    x += column.width
  })

  doc.setDrawColor(241, 245, 249)
  doc.line(margin, cursorY + 2, doc.internal.pageSize.getWidth() - margin, cursorY + 2)

  return cursorY + 6
}

const ensureSpace = (doc, cursorY, needed, columns) => {
  const pageHeight = doc.internal.pageSize.getHeight()
  if (cursorY + needed <= pageHeight - 16) return cursorY

  doc.addPage()
  const nextStart = drawHeader(doc, columns.pageTitle, columns.pageSubtitle)
  return drawTableHeader(doc, nextStart, columns.columns)
}

const ensurePageSpaceWithoutTable = (doc, cursorY, needed, pageTitle, pageSubtitle) => {
  const pageHeight = doc.internal.pageSize.getHeight()
  if (cursorY + needed <= pageHeight - 16) return cursorY

  doc.addPage()
  return drawHeader(doc, pageTitle, pageSubtitle)
}

export const generatePriceListPDF = ({ rows }) => {
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

    if (logoPackya) {
      const logoWidth = 26
      const logoHeight = 26
      doc.addImage(logoPackya, 'PNG', pageWidth / 2 - logoWidth / 2, y, logoWidth, logoHeight)
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

  doc.save(`Packya-ListaPrecios-${toFileDate()}.pdf`)
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

  doc.save(`Packya-Costos-${toFileDate()}.pdf`)
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

  doc.save(`Packya-Deudas-${toFileDate()}.pdf`)
}

export const generateClientAccountPDF = ({ rows, scopeLabel }) => {
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

    cursorY = ensureSpace(doc, cursorY, 12, {
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

  doc.save(`Packya-EstadoCuenta-${toFileDate()}.pdf`)
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

  doc.save(`Packya-Stock-${toFileDate()}.pdf`)
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

  doc.save(`Packya-Egresos-${toFileDate()}.pdf`)
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

  doc.save(`Packya-Produccion-${toFileDate()}.pdf`)
}
