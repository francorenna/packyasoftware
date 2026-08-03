import test from 'node:test'
import assert from 'node:assert/strict'
import { splitItemsForPages } from './corporatePdfLayout.js'

test('splits order items across pages when they exceed the page limit', () => {
  const items = Array.from({ length: 12 }, (_, index) => ({
    productName: `Producto ${index + 1}`,
    quantity: 1,
    unitPrice: 100,
  }))

  const pages = splitItemsForPages(items, 10)

  assert.equal(pages.length, 2)
  assert.equal(pages[0].length, 10)
  assert.equal(pages[1].length, 2)
  assert.equal(pages[0][0].productName, 'Producto 1')
  assert.equal(pages[1][1].productName, 'Producto 12')
})
