const CORPORATE_DOCUMENT_CONFIG = {
  brandName: 'PACKYA',
  slogan: 'Packaging que potencia marcas.',
  claim: 'No vendemos cajas. Potenciamos marcas.',
  whatsapp: '+54 9 261 629-8349',
  instagram: '@packya.ok',
  website: 'www.packya.com.ar',
}

const CORPORATE_COLORS = {
  textMain: [15, 23, 42],
  textMuted: [100, 116, 139],
  lineSoft: [226, 232, 240],
  bgSoft: [248, 250, 252],
  accent: [211, 38, 128],
  cyan: [0, 174, 239],
  magenta: [236, 0, 140],
  yellow: [255, 242, 0],
  green: [0, 166, 81],
  success: [22, 163, 74],
  warning: [161, 98, 7],
  danger: [220, 38, 38],
}

const setTextColor = (doc, rgb) => doc.setTextColor(rgb[0], rgb[1], rgb[2])

export const getCorporateColors = () => CORPORATE_COLORS

export const drawCorporateHeader = (doc, options = {}) => {
  const {
    pageWidth,
    margin,
    title = 'Documento PACKYA',
    subtitle = 'Packaging que potencia marcas.',
    logoDataUrl,
    metaLabel = '',
    metaValue = '',
  } = options

  doc.setFillColor(255, 255, 255)
  doc.rect(0, 0, pageWidth, 50, 'F')

  const isLogoRendered = Boolean(logoDataUrl)
  const headerLogoWidth = 74
  const headerLogoHeight = 20
  const headerLogoX = margin
  const headerLogoY = 7

  if (isLogoRendered) {
    doc.addImage(logoDataUrl, 'PNG', headerLogoX, headerLogoY, headerLogoWidth, headerLogoHeight)
  }

  setTextColor(doc, CORPORATE_COLORS.textMain)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(title, pageWidth - margin, 16, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.2)
  setTextColor(doc, CORPORATE_COLORS.textMuted)
  doc.text(subtitle, pageWidth - margin, 22, { align: 'right' })

  const decorativeLineY = 42.2
  const lineSegments = [
    { x1: margin, x2: pageWidth * 0.28, color: CORPORATE_COLORS.cyan },
    { x1: pageWidth * 0.28, x2: pageWidth * 0.52, color: CORPORATE_COLORS.magenta },
    { x1: pageWidth * 0.52, x2: pageWidth * 0.72, color: CORPORATE_COLORS.yellow },
    { x1: pageWidth * 0.72, x2: pageWidth - margin, color: CORPORATE_COLORS.green },
  ]

  lineSegments.forEach((segment) => {
    doc.setDrawColor(segment.color[0], segment.color[1], segment.color[2])
    doc.setLineWidth(0.8)
    doc.line(segment.x1, decorativeLineY, segment.x2, decorativeLineY)
  })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.2)
  setTextColor(doc, CORPORATE_COLORS.textMuted)
  doc.text(CORPORATE_DOCUMENT_CONFIG.slogan, margin, 46.2)

  if (metaLabel && metaValue) {
    doc.text(`${metaLabel} ${metaValue}`, pageWidth - margin, 46.2, { align: 'right' })
  }

  if (!isLogoRendered) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    setTextColor(doc, CORPORATE_COLORS.textMain)
    doc.text(CORPORATE_DOCUMENT_CONFIG.brandName, pageWidth / 2, headerLogoY + 14, { align: 'center' })
  }

  return { contentStartY: 52 }
}

export const drawCorporateFooter = (doc, options = {}) => {
  const {
    pageWidth,
    margin,
    pageNumber = 1,
    totalPages = 1,
    logoDataUrl,
  } = options

  const pageHeight = doc.internal.pageSize.getHeight()
  const footerY = pageHeight - 16

  doc.setDrawColor(CORPORATE_COLORS.lineSoft[0], CORPORATE_COLORS.lineSoft[1], CORPORATE_COLORS.lineSoft[2])
  doc.setLineWidth(0.5)
  doc.line(margin, footerY, pageWidth - margin, footerY)

  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', margin, footerY + 1.2, 16, 4.3)
  }

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.2)
  setTextColor(doc, CORPORATE_COLORS.textMuted)
  const pageLabel = totalPages > 1 ? `Página ${pageNumber} de ${totalPages}` : `Página ${pageNumber}`
  doc.text(
    `${CORPORATE_DOCUMENT_CONFIG.whatsapp} · ${CORPORATE_DOCUMENT_CONFIG.instagram} · ${CORPORATE_DOCUMENT_CONFIG.website}`,
    pageWidth / 2,
    footerY + 5,
    { align: 'center' },
  )
  doc.text(pageLabel, pageWidth - margin, footerY + 5, { align: 'right' })
}

export const applyCorporateFooterToDocument = (doc, options = {}) => {
  const totalPages = doc.internal.getNumberOfPages()
  for (let index = 1; index <= totalPages; index += 1) {
    doc.setPage(index)
    drawCorporateFooter(doc, { ...options, pageNumber: index, totalPages })
  }
}

export const CORPORATE_DOCUMENT_DEFAULTS = CORPORATE_DOCUMENT_CONFIG
