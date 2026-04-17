import { useEffect, useState } from 'react'

const CLIENTS_STORAGE_KEY = 'packya_clients'
const STORAGE_VERSION_KEY = 'packya_storage_version'

const CRITICAL_OBSERVATION_REGEX = /(⚠|siempre|revisar|urgente|especial|no olvidar|problema)/i

const normalizePhone = (value) => String(value ?? '').replace(/[^\d]/g, '').trim()

const normalizeObservationEntry = (entry, index = 0) => {
  const rawText = typeof entry === 'string' ? entry : entry?.text
  const text = String(rawText ?? '').trim()
  if (!text) return null

  const createdAt = String(entry?.createdAt ?? new Date().toISOString())
  const isCritical =
    typeof entry?.isCritical === 'boolean'
      ? entry.isCritical
      : CRITICAL_OBSERVATION_REGEX.test(text)

  return {
    id: String(entry?.id ?? `OBS-${Date.now()}-${index}`),
    text,
    createdAt,
    isCritical,
  }
}

const normalizeClientObservations = (value) => {
  if (Array.isArray(value)) {
    return value
      .map((entry, index) => normalizeObservationEntry(entry, index))
      .filter(Boolean)
  }

  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return []
    const normalized = normalizeObservationEntry(text, 0)
    return normalized ? [normalized] : []
  }

  return []
}

const initialClients = [
  {
    id: 'CLI-001',
    name: 'Cartonera Norte SRL',
    phone: '11-5555-1001',
    address: 'Av. Industrial 123, CABA',
    notes: 'Cliente mayorista',
    createdAt: '2026-02-10T10:00:00.000Z',
  },
  {
    id: 'CLI-002',
    name: 'Distribuidora M&G',
    phone: '11-5555-2002',
    address: 'Ruta 8 km 42, Pilar',
    notes: '',
    createdAt: '2026-02-11T11:20:00.000Z',
  },
]

const normalizeClient = (client, index) => {
  if (!client || typeof client !== 'object') return null

  return {
    id: String(client.id ?? `CLI-${String(index + 1).padStart(3, '0')}`),
    name: String(client.name ?? '').trim(),
    phone: normalizePhone(client.phone),
    email: String(client.email ?? '').trim(),
    address: String(client.address ?? '').trim(),
    notes: String(client.notes ?? '').trim(),
    observations: normalizeClientObservations(client.observations),
    createdAt: String(client.createdAt ?? new Date().toISOString()),
  }
}

const loadClientsFromStorage = () => {
  const stored = localStorage.getItem(CLIENTS_STORAGE_KEY)

  if (stored === null) {
    const alreadySeeded = localStorage.getItem(STORAGE_VERSION_KEY)
    if (!alreadySeeded) {
      try {
        localStorage.setItem(CLIENTS_STORAGE_KEY, JSON.stringify(initialClients))
      } catch (error) {
        void error
      }
      return initialClients
    }

    try {
      localStorage.setItem(CLIENTS_STORAGE_KEY, JSON.stringify([]))
    } catch (error) {
      void error
    }
    return []
  }

  try {
    const parsed = JSON.parse(stored)
    if (!Array.isArray(parsed)) return []

    const normalized = parsed
      .map((client, index) => normalizeClient(client, index))
      .filter((client) => client && client.name)

    return normalized
  } catch {
    return []
  }
}

function useClientsState() {
  const [clients, setClients] = useState(() => loadClientsFromStorage())

  useEffect(() => {
    try {
      localStorage.setItem(CLIENTS_STORAGE_KEY, JSON.stringify(clients))
    } catch (error) {
      void error
    }
  }, [clients])

  const upsertClient = (clientData) => {
    const safeClientData = clientData ?? {}
    const incomingId = String(safeClientData.id ?? '').trim()
    let savedClient = null

    setClients((prevClients) => {
      const existing = prevClients.find((client) => String(client.id) === incomingId)
      const resolvedName = String(safeClientData.name ?? existing?.name ?? '').trim()
      if (!resolvedName) return prevClients

      const resolvedId = incomingId || `CLI-${Date.now()}`
      const hasPhone = Object.prototype.hasOwnProperty.call(safeClientData, 'phone')
      const hasEmail = Object.prototype.hasOwnProperty.call(safeClientData, 'email')
      const hasAddress = Object.prototype.hasOwnProperty.call(safeClientData, 'address')
      const hasNotes = Object.prototype.hasOwnProperty.call(safeClientData, 'notes')
      const hasObservations = Object.prototype.hasOwnProperty.call(safeClientData, 'observations')

      const nextClient = {
        id: resolvedId,
        name: resolvedName,
        phone: hasPhone
          ? normalizePhone(safeClientData.phone)
          : String(existing?.phone ?? ''),
        email: hasEmail
          ? String(safeClientData.email ?? '').trim()
          : String(existing?.email ?? ''),
        address: hasAddress
          ? String(safeClientData.address ?? '').trim()
          : String(existing?.address ?? ''),
        notes: hasNotes
          ? String(safeClientData.notes ?? '').trim()
          : String(existing?.notes ?? ''),
        observations: hasObservations
          ? normalizeClientObservations(safeClientData.observations)
          : normalizeClientObservations(existing?.observations),
        createdAt: String(existing?.createdAt ?? new Date().toISOString()),
      }

      savedClient = nextClient

      if (!existing) return [nextClient, ...prevClients]

      return prevClients.map((client) =>
        client.id === nextClient.id ? nextClient : client,
      )
    })

    return savedClient
  }

  const deleteClient = (clientId) => {
    setClients((prevClients) =>
      prevClients.filter((client) => client.id !== clientId),
    )
  }

  return {
    clients,
    upsertClient,
    deleteClient,
  }
}

export default useClientsState
