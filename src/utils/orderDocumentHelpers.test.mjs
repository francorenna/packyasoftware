import test from 'node:test'
import assert from 'node:assert/strict'
import { getOrderStatusBadge, paginateOrderItemRows } from './orderDocumentHelpers.js'

const buildItems = (count) =>
  Array.from({ length: count }, (_, index) => ({
    productName: `Producto ${index + 1}`,
    quantity: 1,
    unitPrice: 100,
  }))

test('paginates order rows for 1, 10 and 20+ items', () => {
  const oneItem = paginateOrderItemRows(buildItems(1))
  const tenItems = paginateOrderItemRows(buildItems(10))
  const twentyOneItems = paginateOrderItemRows(buildItems(21))

  assert.equal(oneItem.pageCount, 1)
  assert.equal(oneItem.pages.length, 1)
  assert.equal(oneItem.pages[0].length, 1)

  assert.equal(tenItems.pageCount, 1)
  assert.equal(tenItems.pages.length, 1)
  assert.equal(tenItems.pages[0].length, 10)

  assert.equal(twentyOneItems.pageCount, 3)
  assert.equal(twentyOneItems.pages.length, 3)
  assert.equal(twentyOneItems.pages[0].length, 10)
  assert.equal(twentyOneItems.pages[1].length, 10)
  assert.equal(twentyOneItems.pages[2].length, 1)
})

test('normalizes order status badges to the official workflow', () => {
  assert.deepEqual(getOrderStatusBadge('Pendiente'), {
    label: 'En Diseño',
    tone: 'warning',
    icon: '✎',
  })

  assert.deepEqual(getOrderStatusBadge('En Proceso'), {
    label: 'En Producción',
    tone: 'accent',
    icon: '⚙',
  })

  assert.deepEqual(getOrderStatusBadge('Listo'), {
    label: 'Listo para Entrega',
    tone: 'success',
    icon: '📦',
  })

  assert.deepEqual(getOrderStatusBadge('Entregado'), {
    label: 'Entregado',
    tone: 'success',
    icon: '🚚',
  })
})