import test from 'node:test'
import assert from 'node:assert/strict'
import { localMidnightUtc } from './report-service.mjs'

test('London report windows follow GMT and BST at local midnight', () => {
  assert.equal(localMidnightUtc('2026-01-15', 'Europe/London'), '2026-01-15T00:00:00.000Z')
  assert.equal(localMidnightUtc('2026-07-15', 'Europe/London'), '2026-07-14T23:00:00.000Z')
})
