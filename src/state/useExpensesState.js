import { useEffect, useState } from 'react'
import useCloudSnapshotSync from '../hooks/useCloudSnapshotSync'

const EXPENSES_STORAGE_KEY = 'packya_expenses'
const EXPENSE_TYPES = ['empresa', 'socio']
const EXPENSE_PARTNERS = ['FRANCO', 'DAMIAN']

const toPositiveNumber = (value) => {
  const parsed = Number(value)
  if (Number.isNaN(parsed) || parsed < 0) return 0
  return parsed
}

const toDateKey = (value) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''

  const year = parsed.getFullYear()
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

const getMonthKey = (month, year) => {
  const normalizedMonth = Number(month)
  const normalizedYear = Number(year)
  if (!Number.isInteger(normalizedMonth) || !Number.isInteger(normalizedYear)) return ''
  if (normalizedMonth < 1 || normalizedMonth > 12) return ''
  if (normalizedYear < 1900) return ''

  return `${String(normalizedYear)}-${String(normalizedMonth).padStart(2, '0')}`
}

const normalizeExpense = (expense, index) => {
  if (!expense || typeof expense !== 'object') return null

  const amount = toPositiveNumber(expense.amount)
  const rawType = String(expense.type ?? '').trim().toLowerCase()
  const type = EXPENSE_TYPES.includes(rawType) ? rawType : 'empresa'
  const rawPerson = String(expense.person ?? '').trim().toUpperCase()
  const person = type === 'socio' && EXPENSE_PARTNERS.includes(rawPerson) ? rawPerson : null

  const reason = String(expense.reason ?? expense.description ?? '').trim()
  const description = reason
  const categoryFromData = String(expense.category ?? '').trim()
  const category = type === 'socio'
    ? 'Retiro socio'
    : categoryFromData
  const date = toDateKey(expense.date)

  if (amount <= 0 || !description || !date) return null
  if (type === 'empresa' && !category) return null

  return {
    id: String(expense.id ?? `EXP-${Date.now()}-${index + 1}`),
    type,
    person,
    amount,
    category,
    reason,
    description,
    date,
    note: String(expense.note ?? '').trim(),
    createdAt: String(expense.createdAt ?? new Date().toISOString()),
  }
}

const loadExpenses = () => {
  const rawStored = localStorage.getItem(EXPENSES_STORAGE_KEY)
  if (rawStored === null) {
    try {
      localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify([]))
    } catch (error) {
      void error
    }
    return []
  }

  try {
    const parsed = JSON.parse(rawStored)
    if (!Array.isArray(parsed)) return []

    return parsed
      .map((expense, index) => normalizeExpense(expense, index))
      .filter(Boolean)
      .sort((a, b) => {
        const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime()
        if (dateDiff !== 0) return dateDiff
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      })
  } catch {
    return []
  }
}

function useExpensesState() {
  const [expenses, setExpenses] = useState(() => loadExpenses())
  useCloudSnapshotSync('expenses', expenses)

  useEffect(() => {
    try {
      localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify(expenses))
    } catch (error) {
      void error
    }
  }, [expenses])

  const addExpense = (expenseData) => {
    const normalized = normalizeExpense(
      {
        ...expenseData,
        id: String(expenseData?.id ?? `EXP-${Date.now()}`),
        createdAt: String(expenseData?.createdAt ?? new Date().toISOString()),
      },
      expenses.length,
    )

    if (!normalized) return null

    setExpenses((prevExpenses) => [normalized, ...prevExpenses])
    return normalized
  }

  const deleteExpense = (id) => {
    const safeId = String(id ?? '').trim()
    if (!safeId) return

    setExpenses((prevExpenses) => prevExpenses.filter((expense) => String(expense.id) !== safeId))
  }

  const getExpenses = () => expenses

  const getMonthlyExpenses = (month, year) => {
    const monthKey = getMonthKey(month, year)
    if (!monthKey) return []

    return expenses.filter((expense) => String(expense.date ?? '').slice(0, 7) === monthKey)
  }

  return {
    expenses,
    addExpense,
    deleteExpense,
    getExpenses,
    getMonthlyExpenses,
  }
}

export default useExpensesState