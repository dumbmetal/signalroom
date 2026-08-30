import test from 'node:test'
import assert from 'node:assert/strict'
// @ts-expect-error Node's built-in TypeScript test runner requires the explicit extension.
import { BRIEFING_CACHE_KEY, groupBriefingTopics, normalizeLiveReport, priceChangeView, readCachedReport, sourceHealthSummary, topicDisclosureIds, writeCachedReport } from './briefing-view.ts'
// @ts-expect-error Node's built-in TypeScript test runner requires the explicit extension.
import { loadLiveReport } from './api.ts'

function topic(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ai-topic',
    rank: 1,
    section: 'ai',
    title: 'A useful AI update',
    summary: 'Two independent sources describe the same change.',
    signal: '2 posts across 2 independent sources',
    sources: ['source-a', 'source-b'],
    confidence: 'Mixed signal',
    evidence: [
      {
        source: 'Reddit',
        label: 'source-a',
        author: 'alice',
        excerpt: 'The first source describes the change.',
        time: '1h ago',
        url: 'https://example.test/evidence-a',
        publisherId: 'publisher-a',
      },
      {
        source: 'Threads',
        label: 'source-b',
        author: 'bob',
        excerpt: 'The second source confirms the change.',
        time: '2h ago',
        url: 'https://example.test/evidence-b',
        publisherId: 'publisher-b',
      },
    ],
    ...overrides,
  }
}

function report(overrides: Record<string, unknown> = {}) {
  return {
    date: '2026-08-31',
    generatedAt: '2026-08-31T00:30:00.000Z',
    topics: [topic()],
    sourceRuns: [],
    ...overrides,
  }
}

function price(overrides: Record<string, unknown> = {}) {
  return {
    key: 'openai:chatgpt:plus:US:USD:month:seat',
    vendor: 'OpenAI',
    product: 'ChatGPT',
    plan: 'Plus',
    region: 'US',
    currency: 'USD',
    amountMinor: 2000,
    billingPeriod: 'month',
    unit: 'seat',
    taxMode: 'unknown',
    observedAt: '2026-08-31T00:00:00.000Z',
    lastVerifiedAt: '2026-08-31T00:05:00.000Z',
    sourceUrl: 'https://openai.com/chatgpt/pricing/',
    sourceKey: 'openai-pricing-us',
    publisherId: 'openai',
    trustTier: 'primary',
    contentHash: 'sha256-current',
    ...overrides,
  }
}

class MemoryStorage {
  values = new Map<string, string>()

  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

test('rejects malformed reports instead of casting unknown data', () => {
  assert.equal(normalizeLiveReport(null), null)
  assert.equal(normalizeLiveReport({ date: '2026-08-31', generatedAt: 'not-a-date', topics: [] }), null)
  assert.equal(normalizeLiveReport(report({ topics: [{ id: 'missing-required-topic-fields' }] })), null)
})

test('normalizes a valid report and preserves optional briefing metadata', () => {
  const normalized = normalizeLiveReport(report({
    topics: [topic({
      contentType: 'community_opinion',
      status: 'reported',
      freshness: 'aging',
      lastVerifiedAt: '2026-08-31T00:10:00.000Z',
      recurrence: {
        authorCount: 4,
        publisherCount: 2,
        mentionCount: 9,
        firstSeenAt: '2026-08-25T00:00:00.000Z',
        lastSeenAt: '2026-08-31T00:00:00.000Z',
        windowHours: 168,
      },
    })],
  }))

  assert.ok(normalized)
  assert.equal(normalized.topics[0].contentType, 'community_opinion')
  assert.equal(normalized.topics[0].recurrence?.authorCount, 4)
  assert.equal(normalized.topics[0].independentSourceCount, 2)
})

test('maps five content types into four editorial lanes in a fixed order', () => {
  const normalized = normalizeLiveReport(report({ topics: [
    topic({ id: 'community', contentType: 'community_opinion' }),
    topic({ id: 'discount', contentType: 'discount_offer' }),
    topic({ id: 'setup', contentType: 'setup_tip' }),
    topic({ id: 'price', contentType: 'price_change' }),
    topic({ id: 'product', contentType: 'product_update' }),
  ] }))
  assert.ok(normalized)

  const groups = groupBriefingTopics(normalized.topics)
  assert.deepEqual(groups.map((group) => group.id), ['product-updates', 'pricing-offers', 'setup-tips', 'community-patterns'])
  assert.deepEqual(groups[1].topics.map((item) => item.id), ['discount', 'price'])
})

test('keeps topics without contentType in a final legacy lane without guessing', () => {
  const normalized = normalizeLiveReport(report({ topics: [
    topic({ id: 'legacy', contentType: undefined }),
    topic({ id: 'product', contentType: 'product_update' }),
  ] }))
  assert.ok(normalized)

  const groups = groupBriefingTopics(normalized.topics)
  assert.deepEqual(groups.map((group) => group.id), ['product-updates', 'legacy-signals'])
  assert.equal(groups[groups.length - 1]?.topics[0].id, 'legacy')
  assert.equal(groups[groups.length - 1]?.topics[0].contentType, undefined)
})

test('normalizes source and sourceId runs with ok, partial, and error states', () => {
  const normalized = normalizeLiveReport(report({ sourceRuns: [
    { source: 'openai-release-feed', ok: true, count: 3, checkedAt: '2026-08-31T00:01:00.000Z' },
    { sourceId: 'openai-pricing-kr', status: 'partial', kind: 'OfficialPricing', count: 1, warnings: ['KRW price was unavailable'], checkedAt: '2026-08-31T00:03:00.000Z' },
    { sourceId: 'community-reddit', status: 'error', count: 0, error: '<html>Bearer secret-token response body</html>', checkedAt: '2026-08-31T00:02:00.000Z' },
  ] }))
  assert.ok(normalized?.sourceRuns)

  assert.deepEqual(normalized.sourceRuns.map((run) => [run.source, run.status]), [
    ['openai-release-feed', 'ok'],
    ['openai-pricing-kr', 'partial'],
    ['community-reddit', 'error'],
  ])
  assert.equal(normalized.sourceRuns[1].warnings[0], 'KRW price was unavailable')
  assert.equal(normalized.sourceRuns[2].error, 'Source check failed.')
})

test('does not interpret missing sourceRuns as zero live sources', () => {
  const input: Record<string, unknown> = report()
  delete input.sourceRuns
  const normalized = normalizeLiveReport(input)
  assert.ok(normalized)
  assert.equal(normalized.sourceRuns, null)
  assert.deepEqual(sourceHealthSummary(normalized.sourceRuns), {
    available: false,
    total: 0,
    ok: 0,
    partial: 0,
    error: 0,
    checkedAt: null,
  })
})

test('aggregates partial and error source health and keeps the latest checked time', () => {
  const normalized = normalizeLiveReport(report({ sourceRuns: [
    { source: 'one', status: 'ok', count: 2, checkedAt: '2026-08-31T00:01:00.000Z' },
    { source: 'two', status: 'partial', count: 1, checkedAt: '2026-08-31T00:04:00.000Z' },
    { source: 'three', status: 'error', count: 0, checkedAt: '2026-08-31T00:03:00.000Z' },
  ] }))
  assert.ok(normalized)

  assert.deepEqual(sourceHealthSummary(normalized.sourceRuns), {
    available: true,
    total: 3,
    ok: 1,
    partial: 1,
    error: 1,
    checkedAt: '2026-08-31T00:04:00.000Z',
  })
  assert.equal(normalized.topics.length, 1, 'source failures do not discard report topics')
})

test('selects a compatible before and now price pair', () => {
  const normalized = normalizeLiveReport(report({
    topics: [topic({ contentType: 'price_change', priceKeys: ['openai:chatgpt:plus:US:USD:month:seat'] })],
    priceSnapshots: [
      price(),
      price({ amountMinor: 1800, observedAt: '2026-08-20T00:00:00.000Z', lastVerifiedAt: '2026-08-20T00:05:00.000Z', contentHash: 'sha256-previous' }),
    ],
  }))
  assert.ok(normalized)

  const [change] = priceChangeView(normalized.topics[0], normalized.priceSnapshots)
  assert.equal(change.current.amountMinor, 2000)
  assert.equal(change.previous?.amountMinor, 1800)
  assert.equal(change.kind, 'change')
  assert.equal(change.percentChange, 11.1)
})

test('never compares incompatible price dimensions', () => {
  const normalized = normalizeLiveReport(report({
    topics: [topic({ contentType: 'price_change', priceKeys: ['openai:chatgpt:plus:US:USD:month:seat'] })],
    priceSnapshots: [
      price(),
      price({ currency: 'KRW', amountMinor: 29000, observedAt: '2026-08-20T00:00:00.000Z', contentHash: 'sha256-krw' }),
    ],
  }))
  assert.ok(normalized)

  const [change] = priceChangeView(normalized.topics[0], normalized.priceSnapshots)
  assert.equal(change.kind, 'first-observed')
  assert.equal(change.previous, undefined)
  assert.equal(change.percentChange, undefined)
})

test('deduplicates repeated same-value observations before finding the prior price', () => {
  const normalized = normalizeLiveReport(report({
    topics: [topic({ contentType: 'price_change', priceKeys: ['openai:chatgpt:plus:US:USD:month:seat'] })],
    priceSnapshots: [
      price(),
      price({ observedAt: '2026-08-30T00:00:00.000Z', lastVerifiedAt: '2026-08-30T12:00:00.000Z', contentHash: 'sha256-repeat' }),
      price({ amountMinor: 1800, observedAt: '2026-08-20T00:00:00.000Z', contentHash: 'sha256-old' }),
    ],
  }))
  assert.ok(normalized)

  const [change] = priceChangeView(normalized.topics[0], normalized.priceSnapshots)
  assert.equal(change.current.observedAt, '2026-08-31T00:00:00.000Z')
  assert.equal(change.previous?.amountMinor, 1800)
})

test('labels a single valid observation as first observed', () => {
  const normalized = normalizeLiveReport(report({
    topics: [topic({ contentType: 'discount_offer', priceKeys: ['openai:chatgpt:plus:US:USD:month:seat'] })],
    priceSnapshots: [price()],
  }))
  assert.ok(normalized)
  assert.equal(priceChangeView(normalized.topics[0], normalized.priceSnapshots)[0].kind, 'first-observed')
})

test('writes and reads only valid reports in the versioned cache', () => {
  const storage = new MemoryStorage()
  assert.equal(writeCachedReport(storage, report()), true)
  assert.equal(readCachedReport(storage)?.topics[0].id, 'ai-topic')
  assert.match(storage.getItem(BRIEFING_CACHE_KEY) ?? '', /"version":1/)

  const before = storage.getItem(BRIEFING_CACHE_KEY)
  assert.equal(writeCachedReport(storage, { generatedAt: 'broken' }), false)
  assert.equal(storage.getItem(BRIEFING_CACHE_KEY), before)
})

test('rejects malformed or unknown-version cached reports', () => {
  const storage = new MemoryStorage()
  storage.setItem(BRIEFING_CACHE_KEY, '{malformed json')
  assert.equal(readCachedReport(storage), null)

  storage.setItem(BRIEFING_CACHE_KEY, JSON.stringify({ version: 999, report: report() }))
  assert.equal(readCachedReport(storage), null)

  storage.setItem(BRIEFING_CACHE_KEY, JSON.stringify({ version: 1, report: { topics: 'not-an-array' } }))
  assert.equal(readCachedReport(storage), null)
})

test('creates stable, distinct, HTML-safe disclosure IDs', () => {
  const first = topicDisclosureIds('Claude 4.2 / pricing?')
  assert.deepEqual(topicDisclosureIds('Claude 4.2 / pricing?'), first)
  assert.notDeepEqual(topicDisclosureIds('Claude 4.2 pricing'), first)
  assert.match(first.buttonId, /^[a-z][a-z0-9-]+$/)
  assert.match(first.panelId, /^[a-z][a-z0-9-]+$/)
  assert.notEqual(first.buttonId, first.panelId)
})

test('loadLiveReport rejects malformed JSON shapes from a successful HTTP response', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ date: '2026-08-31', topics: 'not-an-array' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
  try {
    await assert.rejects(loadLiveReport(), /Invalid live report/)
  } finally {
    globalThis.fetch = originalFetch
  }
})
