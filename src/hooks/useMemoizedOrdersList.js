export const createCustomCompare = () => {
  return (prevProps, nextProps) => {
    // Props that should trigger a re-render
    const dataProps = [
      'orders',
      'products',
      'purchases',
      'clients',
      'stockByProductId',
      'deliveryFilter',
      'searchQuery',
      'archivedCount',
      'initialExpandedOrderId',
    ]

    // Check if any critical data prop changed
    for (const prop of dataProps) {
      const prevVal = prevProps[prop]
      const nextVal = nextProps[prop]

      // For arrays, compare length and JSON
      if (Array.isArray(prevVal) && Array.isArray(nextVal)) {
        if (prevVal.length !== nextVal.length) return false
        // Shallow check if items reference is same
        if (prevVal !== nextVal) {
          // Different reference, consider it changed
          return false
        }
      } else if (typeof prevVal === 'object' && typeof nextVal === 'object') {
        if (JSON.stringify(prevVal) !== JSON.stringify(nextVal)) return false
      } else if (prevVal !== nextVal) {
        return false
      }
    }

    // If we reach here, data props are same, ignore callback changes
    return true
  }
}
