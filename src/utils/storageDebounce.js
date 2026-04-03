const DEFAULT_DELAY_MS = 300

const canUsePerformanceNow = () => typeof performance !== 'undefined' && typeof performance.now === 'function'

const shouldLogPerformance = () => {
  if (!import.meta.env.DEV || typeof window === 'undefined') return false

  try {
    return window.localStorage.getItem('packya_perf_log') === '1'
  } catch {
    return false
  }
}

export const createDebouncedStorageWriter = ({ key, storageGetter, label = '', delayMs = DEFAULT_DELAY_MS }) => {
  let timeoutId = null
  let pendingValue = null
  let hasPendingWrite = false

  const getStorage = () => {
    try {
      return storageGetter?.() ?? null
    } catch {
      return null
    }
  }

  const writeNow = (value) => {
    const storage = getStorage()
    if (!storage || typeof storage.setItem !== 'function') return

    const startedAt = canUsePerformanceNow() ? performance.now() : 0
    const serialized = JSON.stringify(value)
    const finishedAt = canUsePerformanceNow() ? performance.now() : 0

    storage.setItem(key, serialized)

    if (shouldLogPerformance()) {
      const elapsedMs = Math.max(finishedAt - startedAt, 0)
      const payloadKb = (serialized.length / 1024).toFixed(1)
      console.info(
        `[packya:perf] ${label || key} stringify=${elapsedMs.toFixed(2)}ms payload=${payloadKb}KB`,
      )
    }
  }

  const schedule = (value) => {
    pendingValue = value
    hasPendingWrite = true

    if (timeoutId !== null) {
      window.clearTimeout(timeoutId)
    }

    timeoutId = window.setTimeout(() => {
      timeoutId = null
      if (!hasPendingWrite) return

      const valueToPersist = pendingValue
      pendingValue = null
      hasPendingWrite = false
      writeNow(valueToPersist)
    }, delayMs)
  }

  const flush = () => {
    if (!hasPendingWrite) return

    if (timeoutId !== null) {
      window.clearTimeout(timeoutId)
      timeoutId = null
    }

    const valueToPersist = pendingValue
    pendingValue = null
    hasPendingWrite = false
    writeNow(valueToPersist)
  }

  const cancel = () => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId)
      timeoutId = null
    }

    pendingValue = null
    hasPendingWrite = false
  }

  return {
    schedule,
    flush,
    cancel,
  }
}
