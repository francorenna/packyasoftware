import { useEffect, useState } from 'react'

const SUPPLIERS_STORAGE_KEY = 'packya_suppliers'
const STORAGE_VERSION_KEY = 'packya_storage_version'

const initialSuppliers = [
  {
    id: 'SUP-001',
    name: 'Papelera Central',
    phone: '11-4444-1000',
    notes: 'Proveedor principal de cartón',
    createdAt: '2026-02-10T10:00:00.000Z',
  },
]

const normalizeSupplier = (supplier, index) => {
  if (!supplier || typeof supplier !== 'object') return null

  return {
    id: String(supplier.id ?? `SUP-${String(index + 1).padStart(3, '0')}`),
    name: String(supplier.name ?? '').trim(),
    phone: String(supplier.phone ?? '').trim(),
    notes: String(supplier.notes ?? '').trim(),
    createdAt: String(supplier.createdAt ?? new Date().toISOString()),
  }
}

const loadSuppliersFromStorage = () => {
  const storedSuppliers = localStorage.getItem(SUPPLIERS_STORAGE_KEY)

  if (storedSuppliers === null) {
    const alreadySeeded = localStorage.getItem(STORAGE_VERSION_KEY)
    if (!alreadySeeded) {
      try {
        localStorage.setItem(SUPPLIERS_STORAGE_KEY, JSON.stringify(initialSuppliers))
      } catch (error) {
        void error
      }
      return initialSuppliers
    }

    try {
      localStorage.setItem(SUPPLIERS_STORAGE_KEY, JSON.stringify([]))
    } catch (error) {
      void error
    }
    return []
  }

  try {
    const parsedSuppliers = JSON.parse(storedSuppliers)
    if (!Array.isArray(parsedSuppliers)) return []

    const normalizedSuppliers = parsedSuppliers
      .map((supplier, index) => normalizeSupplier(supplier, index))
      .filter((supplier) => supplier && supplier.name)

    return normalizedSuppliers
  } catch {
    return []
  }
}

function useSuppliersState() {
  const [suppliers, setSuppliers] = useState(() => loadSuppliersFromStorage())

  useEffect(() => {
    try {
      localStorage.setItem(SUPPLIERS_STORAGE_KEY, JSON.stringify(suppliers))
    } catch (error) {
      void error
    }
  }, [suppliers])

  const upsertSupplier = (supplierData) => {
    const normalizedName = String(supplierData.name ?? '').trim()
    if (!normalizedName) return null

    const incomingId = String(supplierData.id ?? '')
    const normalizedBase = {
      id: incomingId || `SUP-${Date.now()}`,
      name: normalizedName,
      phone: String(supplierData.phone ?? '').trim(),
      notes: String(supplierData.notes ?? '').trim(),
    }

    let savedSupplier = null

    setSuppliers((prevSuppliers) => {
      const existing = prevSuppliers.find((supplier) => supplier.id === normalizedBase.id)
      const normalizedSupplier = {
        ...normalizedBase,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      }

      savedSupplier = normalizedSupplier

      if (!existing) return [normalizedSupplier, ...prevSuppliers]

      return prevSuppliers.map((supplier) =>
        supplier.id === normalizedSupplier.id ? normalizedSupplier : supplier,
      )
    })

    return savedSupplier
  }

  const deleteSupplier = (supplierId) => {
    setSuppliers((prevSuppliers) =>
      prevSuppliers.filter((supplier) => supplier.id !== supplierId),
    )
  }

  return {
    suppliers,
    upsertSupplier,
    deleteSupplier,
  }
}

export default useSuppliersState
