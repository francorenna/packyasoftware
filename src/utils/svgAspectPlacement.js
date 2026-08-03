const VIEWBOX_PATTERN = /viewBox\s*=\s*['"]([^'"]+)['"]/i
const WIDTH_PATTERN = /\bwidth\s*=\s*['"]([^'"]+)['"]/i
const HEIGHT_PATTERN = /\bheight\s*=\s*['"]([^'"]+)['"]/i
const PRESERVE_ASPECT_RATIO_PATTERN = /preserveAspectRatio\s*=\s*['"]([^'"]+)['"]/i

const parseNumber = (value) => {
  const match = String(value ?? '').match(/-?\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : NaN
}

const parseAlign = (value = 'xMidYMid') => {
  const normalized = String(value || 'xMidYMid').trim()
  const xMatch = normalized.match(/x(Min|Mid|Max)/i)
  const yMatch = normalized.match(/Y(Min|Mid|Max)/i)

  return {
    x: xMatch ? xMatch[1].toLowerCase() : 'mid',
    y: yMatch ? yMatch[1].toLowerCase() : 'mid',
  }
}

export const getSvgIntrinsicMetrics = (svg) => {
  const safeSvg = String(svg ?? '')
  const viewBoxMatch = safeSvg.match(VIEWBOX_PATTERN)
  const widthMatch = safeSvg.match(WIDTH_PATTERN)
  const heightMatch = safeSvg.match(HEIGHT_PATTERN)
  const preserveAspectRatioMatch = safeSvg.match(PRESERVE_ASPECT_RATIO_PATTERN)

  let intrinsicWidth = NaN
  let intrinsicHeight = NaN

  if (viewBoxMatch) {
    const numbers = viewBoxMatch[1]
      .trim()
      .split(/[\s,]+/)
      .map(Number)
      .filter((value) => !Number.isNaN(value))

    if (numbers.length === 4) {
      intrinsicWidth = numbers[2]
      intrinsicHeight = numbers[3]
    }
  }

  if (!Number.isFinite(intrinsicWidth) || intrinsicWidth <= 0) {
    intrinsicWidth = parseNumber(widthMatch?.[1])
  }

  if (!Number.isFinite(intrinsicHeight) || intrinsicHeight <= 0) {
    intrinsicHeight = parseNumber(heightMatch?.[1])
  }

  if (!Number.isFinite(intrinsicWidth) || intrinsicWidth <= 0) intrinsicWidth = 1
  if (!Number.isFinite(intrinsicHeight) || intrinsicHeight <= 0) intrinsicHeight = 1

  return {
    intrinsicWidth,
    intrinsicHeight,
    preserveAspectRatio: preserveAspectRatioMatch?.[1]?.trim() || 'xMidYMid meet',
  }
}

export const getSvgPlacementInBox = (svg, x, y, width, height) => {
  const { intrinsicWidth, intrinsicHeight, preserveAspectRatio } = getSvgIntrinsicMetrics(svg)
  const ratio = intrinsicWidth / intrinsicHeight
  const containerRatio = width / height

  if (!Number.isFinite(ratio) || ratio <= 0 || !Number.isFinite(containerRatio) || containerRatio <= 0) {
    return { x, y, width, height, renderWidth: width, renderHeight: height }
  }

  const normalizedPar = String(preserveAspectRatio || 'xMidYMid meet').trim()
  if (/^none$/i.test(normalizedPar)) {
    return { x, y, width, height, renderWidth: width, renderHeight: height }
  }

  const isSlice = /slice$/i.test(normalizedPar)
  const scale = isSlice
    ? Math.max(width / intrinsicWidth, height / intrinsicHeight)
    : Math.min(width / intrinsicWidth, height / intrinsicHeight)

  const renderWidth = intrinsicWidth * scale
  const renderHeight = intrinsicHeight * scale
  const align = parseAlign(normalizedPar)

  let offsetX = 0
  let offsetY = 0

  if (align.x === 'mid') offsetX = (width - renderWidth) / 2
  if (align.x === 'max') offsetX = width - renderWidth
  if (align.y === 'mid') offsetY = (height - renderHeight) / 2
  if (align.y === 'max') offsetY = height - renderHeight

  return {
    x: x + offsetX,
    y: y + offsetY,
    width,
    height,
    renderWidth,
    renderHeight,
  }
}