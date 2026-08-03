import { useEffect, useMemo, useRef, useState } from 'react'
import useCloudSnapshotSync from '../hooks/useCloudSnapshotSync'

const DAILY_PANEL_STORAGE_KEY = 'packya_daily_panel_entries_v1'
export const DAILY_PANEL_FUND_KEYS = ['cash', 'mercadoPagoFranco', 'mercadoPagoDamian']

const toDateKey = (value) => {
  const raw = String(value ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return ''

  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const toSafeNumber = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const toSafeText = (value) => String(value ?? '')

const makeMovementId = (prefix = 'MOV') =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const normalizeMovement = (movement, index = 0, type = 'income') => {
  if (!movement || typeof movement !== 'object') return null

  const amount = Math.max(toSafeNumber(movement.amount), 0)
  return {
    id: String(movement.id ?? makeMovementId(type === 'income' ? 'INC' : 'EXP') ?? `${type}-${index + 1}`),
    concept: toSafeText(movement.concept),
    amount,
    category: String(movement.category ?? '').trim(),
    origin: toSafeText(movement.origin),
    fundId: String(
      movement.fundId ??
        movement.accountId ??
        (type === 'income' ? 'cash' : 'cash'),
    ).trim() || 'cash',
    actor: String(movement.actor ?? movement.owner ?? '').trim(),
    linkedOrderId: String(movement.linkedOrderId ?? '').trim(),
    linkedOrderPaymentId: String(movement.linkedOrderPaymentId ?? '').trim(),
    sourceType: String(movement.sourceType ?? '').trim(),
    unlinkReason: toSafeText(movement.unlinkReason),
    supplierName: toSafeText(
      movement.supplierName ?? movement.supplier ?? movement.providerName ?? movement.provider,
    ),
    note: toSafeText(movement.note),
    isAdvancePayment: Boolean(movement.isAdvancePayment),
    isCompact: Boolean(movement.isCompact),
  }
}

const normalizeBalances = (value) => {
  const safe = value && typeof value === 'object' ? value : {}
  const legacyCash = Math.max(toSafeNumber(safe.cash), 0)
  const legacyBank = Math.max(toSafeNumber(safe.bank), 0)
  const legacyMercadoPago = Math.max(toSafeNumber(safe.mercadoPago), 0)
  const legacyOther = Math.max(toSafeNumber(safe.other), 0)

  return {
    cash: legacyCash + legacyBank + legacyOther,
    mercadoPagoFranco: Math.max(toSafeNumber(safe.mercadoPagoFranco), 0) || legacyMercadoPago,
    mercadoPagoDamian: Math.max(toSafeNumber(safe.mercadoPagoDamian), 0),
  }
}

const normalizeOperational = (value) => {
  const safe = value && typeof value === 'object' ? value : {}
  return {
    ordersTaken: Math.max(Math.trunc(toSafeNumber(safe.ordersTaken)), 0),
    ordersDelivered: Math.max(Math.trunc(toSafeNumber(safe.ordersDelivered)), 0),
    paymentsRegistered: Math.max(Math.trunc(toSafeNumber(safe.paymentsRegistered)), 0),
    productionActivity: Math.max(Math.trunc(toSafeNumber(safe.productionActivity)), 0),
    printedBoxes: Math.max(Math.trunc(toSafeNumber(safe.printedBoxes)), 0),
  }
}

const normalizeDayEntry = (entry) => {
  if (!entry || typeof entry !== 'object') return null

  const dateKey = toDateKey(entry.dateKey)
  if (!dateKey) return null

  const incomeMovements = (Array.isArray(entry.incomeMovements) ? entry.incomeMovements : [])
    .map((movement, index) => normalizeMovement(movement, index, 'income'))
    .filter(Boolean)

  const expenseMovements = (Array.isArray(entry.expenseMovements) ? entry.expenseMovements : [])
    .map((movement, index) => normalizeMovement(movement, index, 'expense'))
    .filter(Boolean)

  const nowIso = new Date().toISOString()

  return {
    dateKey,
    openingBalances: normalizeBalances(entry.openingBalances),
    closingBalances: normalizeBalances(entry.closingBalances),
    incomeMovements,
    expenseMovements,
    operational: normalizeOperational(entry.operational),
    notes: toSafeText(entry.notes),
    openingNote: toSafeText(entry.openingNote),
    closingNote: toSafeText(entry.closingNote),
    isClosed: Boolean(entry.isClosed),
    closedAt: entry.closedAt ? String(entry.closedAt) : '',
    openedAt: entry.openedAt ? String(entry.openedAt) : '',
    createdAt: String(entry.createdAt ?? nowIso),
    updatedAt: String(entry.updatedAt ?? nowIso),
  }
}

const loadDailyPanelEntries = () => {
  try {
    const raw = window.localStorage.getItem(DAILY_PANEL_STORAGE_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed
      .map((entry) => normalizeDayEntry(entry))
      .filter(Boolean)
      .sort((a, b) => String(b.dateKey).localeCompare(String(a.dateKey)))
  } catch {
    return []
  }
}

function useDailyPanelState() {
  const [dailyPanelEntries, setDailyPanelEntries] = useState(() => loadDailyPanelEntries())
  const dailyPanelEntriesRef = useRef(dailyPanelEntries)
  useCloudSnapshotSync('daily_panel_entries', dailyPanelEntries)

  useEffect(() => {
    dailyPanelEntriesRef.current = dailyPanelEntries
  }, [dailyPanelEntries])

  useEffect(() => {
    try {
      window.localStorage.setItem(DAILY_PANEL_STORAGE_KEY, JSON.stringify(dailyPanelEntries))
    } catch {
      void 0
    }
  }, [dailyPanelEntries])

  const entriesByDate = useMemo(
    () => dailyPanelEntries.reduce((acc, entry) => {
      acc[String(entry.dateKey)] = entry
      return acc
    }, {}),
    [dailyPanelEntries],
  )

  const upsertDailyPanelEntry = (dateKeyInput, updater) => {
    const dateKey = toDateKey(dateKeyInput)
    if (!dateKey) return null

    const currentEntries = Array.isArray(dailyPanelEntriesRef.current) ? dailyPanelEntriesRef.current : []
    const index = currentEntries.findIndex((entry) => String(entry?.dateKey ?? '') === dateKey)
    const currentEntry = index >= 0 ? currentEntries[index] : null

    const nextEntryDraft = typeof updater === 'function' ? updater(currentEntry) : updater
    const normalizedNextEntry = normalizeDayEntry({
      ...(currentEntry ?? {}),
      ...(nextEntryDraft && typeof nextEntryDraft === 'object' ? nextEntryDraft : {}),
      dateKey,
      updatedAt: new Date().toISOString(),
      createdAt: String(currentEntry?.createdAt ?? new Date().toISOString()),
    })

    if (!normalizedNextEntry) return null

    const nextEntries = [...currentEntries]
    if (index >= 0) {
      nextEntries[index] = normalizedNextEntry
    } else {
      nextEntries.push(normalizedNextEntry)
    }

    nextEntries.sort((a, b) => String(b.dateKey).localeCompare(String(a.dateKey)))

    dailyPanelEntriesRef.current = nextEntries
    setDailyPanelEntries(nextEntries)

    return normalizedNextEntry
  }

  const getDailyPanelEntry = (dateKeyInput) => {
    const dateKey = toDateKey(dateKeyInput)
    if (!dateKey) return null
    return entriesByDate[dateKey] ?? null
  }

  return {
    dailyPanelEntries,
    getDailyPanelEntry,
    upsertDailyPanelEntry,
  }
}

export default useDailyPanelState
