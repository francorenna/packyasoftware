import { useEffect, useState } from 'react'

const CLIENTS_STORAGE_KEY = 'packya_clients'
const STORAGE_VERSION_KEY = 'packya_storage_version'

const normalizePhone = (value) => String(value ?? '').replace(/[^\d]/g, '').trim()

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
    address: String(client.address ?? '').trim(),
    notes: String(client.notes ?? '').trim(),
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
    const name = String(safeClientData.name ?? '').trim()
    if (!name) return null

    const incomingId = String(safeClientData.id ?? '')
    const existingClient = clients.find((client) => client.id === incomingId)

    const normalizedClientBase = {
      id: incomingId || `CLI-${Date.now()}`,
      name,
      phone: normalizePhone(safeClientData.phone),
      address: String(safeClientData.address ?? '').trim(),
      notes: String(safeClientData.notes ?? '').trim(),
    }

    const normalizedClient = {
      ...normalizedClientBase,
      createdAt: existingClient?.createdAt ?? new Date().toISOString(),
    }

    setClients((prevClients) => {
      const existing = prevClients.find((client) => client.id === normalizedClient.id)

      if (!existing) return [normalizedClient, ...prevClients]

      return prevClients.map((client) =>
        client.id === normalizedClient.id ? normalizedClient : client,
      )
    })

    return normalizedClient
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
