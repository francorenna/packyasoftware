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

  doc.save(`Packya-Deudas-${toFileDate()}.pdf`)
}
