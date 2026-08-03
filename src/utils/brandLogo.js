import brandLogoUrl from '../assets/componentesgraficos/isotipo nuevo.png?url'

let brandLogoDataUrlPromise = null

const rasterizeLogoUrlToDataUrl = async (logoUrl) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null

  const image = new Image()
  image.decoding = 'async'

  const loadPromise = new Promise((resolve, reject) => {
    image.onload = () => resolve(image)
    image.onerror = reject
  })

  image.src = logoUrl

  const loadedImage = await loadPromise
  const width = 900
  const aspectRatio = loadedImage.naturalWidth > 0
    ? loadedImage.naturalHeight / loadedImage.naturalWidth
    : 850.39 / 2834.65
  const height = Math.max(1, Math.round(width * aspectRatio))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) return null

  context.drawImage(loadedImage, 0, 0, width, height)
  return canvas.toDataURL('image/png')
}

export const getBrandLogoDataUrl = async () => {
  if (!brandLogoDataUrlPromise) {
    brandLogoDataUrlPromise = rasterizeLogoUrlToDataUrl(brandLogoUrl).catch(() => null)
  }

  return brandLogoDataUrlPromise
}

export { brandLogoUrl }