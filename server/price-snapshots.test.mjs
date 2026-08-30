import test from 'node:test'
import assert from 'node:assert/strict'

import {
  amountToMinorUnits,
  mergePriceSnapshots,
  normalizePriceObservation,
  priceObservationSignature,
} from '../shared/price-snapshots.mjs'

const observed = (overrides = {}) => normalizePriceObservation({
  vendor: 'OpenAI',
  product: 'ChatGPT',
  plan: 'Plus',
  region: 'US',
  currency: 'USD',
  amountMinor: 2_000,
  billingPeriod: 'month',
  unit: 'user',
  taxMode: 'unknown',
  observedAt: '2026-08-30T10:00:00.000Z',
  lastVerifiedAt: '2026-08-30T10:00:00.000Z',
  sourceUrl: 'https://help.openai.com/en/articles/6950777-what-is-chatgpt-plus',
  sourceKey: 'openai-chatgpt-plus-usd',
  publisherId: 'openai',
  trustTier: 'primary',
  ...overrides,
})

test('converts USD decimals and KRW integers to minor units without FX conversion', () => {
  assert.equal(amountToMinorUnits('20.99', 'USD'), 2_099)
  assert.equal(amountToMinorUnits('29,000', 'KRW'), 29_000)
  assert.throws(() => amountToMinorUnits('29000.50', 'KRW'), /whole amount/i)

  const usdOnly = mergePriceSnapshots([], [observed({ region: 'KR', currency: 'USD' })])
  assert.deepEqual(usdOnly.map((item) => item.currency), ['USD'])
})

test('builds a stable key from comparison dimensions, not price or casing', () => {
  const first = observed()
  const changed = observed({ vendor: ' openai ', product: 'CHATGPT', plan: ' plus ', amountMinor: 2_500 })

  assert.equal(first.key, changed.key)
  assert.notEqual(first.contentHash, changed.contentHash)
  assert.match(first.key, /^openai:chatgpt:plus:us:usd:month:user$/)
})

test('same value updates lastVerifiedAt without creating a fake change', () => {
  const first = observed()
  const verified = observed({ observedAt: '2026-08-31T12:00:00.000Z', lastVerifiedAt: '2026-08-31T12:00:00.000Z' })
  const merged = mergePriceSnapshots([first], [verified])

  assert.equal(merged.length, 1)
  assert.equal(merged[0].observedAt, '2026-08-30T10:00:00.000Z')
  assert.equal(merged[0].lastVerifiedAt, '2026-08-31T12:00:00.000Z')
})

test('retains only the two newest distinct values for a key', () => {
  const first = observed()
  const second = observed({ amountMinor: 2_500, observedAt: '2026-08-31T10:00:00.000Z', lastVerifiedAt: '2026-08-31T10:00:00.000Z' })
  const third = observed({ amountMinor: 3_000, observedAt: '2026-09-01T10:00:00.000Z', lastVerifiedAt: '2026-09-01T10:00:00.000Z' })
  const merged = mergePriceSnapshots(mergePriceSnapshots([first], [second]), [third])

  assert.deepEqual(merged.map((item) => item.amountMinor), [3_000, 2_500])
})

test('never compares different region, currency, period, or unit dimensions', () => {
  const snapshots = mergePriceSnapshots([], [
    observed(),
    observed({ region: 'KR', currency: 'KRW', amountMinor: 29_000 }),
    observed({ billingPeriod: 'year', amountMinor: 20_000 }),
    observed({ unit: 'workspace', amountMinor: 2_000 }),
  ])

  assert.equal(snapshots.length, 4)
  assert.equal(new Set(snapshots.map((item) => item.key)).size, 4)
})

test('promotion changes create distinct observations even when the price is unchanged', () => {
  const first = observed()
  const promotion = observed({
    observedAt: '2026-08-31T10:00:00.000Z',
    lastVerifiedAt: '2026-08-31T10:00:00.000Z',
    promotion: { kind: 'introductory', label: 'First month', originalAmountMinor: 3_000, endsAt: '2026-09-30T23:59:59.000Z' },
  })
  const changedLabel = observed({ promotion: { kind: 'introductory', label: 'New customers', originalAmountMinor: 3_000 } })

  assert.notEqual(priceObservationSignature(first), priceObservationSignature(promotion))
  assert.notEqual(priceObservationSignature(promotion), priceObservationSignature(changedLabel))
  assert.equal(mergePriceSnapshots([first], [promotion]).length, 2)
})
