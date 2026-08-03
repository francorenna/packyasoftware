export const splitItemsForPages = (items, itemsPerPage = 10) => {
  const safeItems = Array.isArray(items) ? items : []
  const pages = []
  for (let index = 0; index < safeItems.length; index += itemsPerPage) {
    pages.push(safeItems.slice(index, index + itemsPerPage))
  }
  return pages
}
