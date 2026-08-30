import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import worker, { applyModelSummaries, buildTopics, buildTopicsWithHistory, normalizeReport } from './worker.ts'
import { normalizePriceObservation } from '../shared/price-snapshots.mjs'

const post = (sourceId, text, hour, id, overrides = {}) => ({
  source: 'Telegram', sourceId, text, engagement: 100, publishedAt: `2026-08-27T${String(hour).padStart(2, '0')}:00:00.000Z`, url: `https://t.me/${sourceId}/${id}`,
  ...overrides,
})

test('production topic builder excludes single-channel chatter', () => {
  const topics = buildTopics([
    post('alpha', 'HYPE 신고점 돌파', 20, 1),
    post('beta', '$HYPE 신고점 경신', 19, 2),
    post('alpha', 'ONLYALPHA isolated launch discussion', 18, 3),
  ])
  assert.equal(topics.length, 1)
  assert.deepEqual(new Set(topics[0].sources), new Set(['alpha', 'beta']))
  assert.equal(topics[0].evidence.length, 2)
})

test('report normalization removes imported single-source topics and reranks', () => {
  const evidence = (label, id) => ({ source: 'Telegram', label, author: label, excerpt: `${label} evidence`, time: '1h ago', url: `https://t.me/${label}/${id}` })
  const report = normalizeReport({ topics: [
    { id: 'single', rank: 1, sources: ['alpha'], evidence: [evidence('alpha', 1)] },
    { id: 'shared', rank: 2, sources: ['alpha', 'beta'], evidence: [evidence('alpha', 2), evidence('beta', 3)] },
  ], sourceRuns: [] })
  assert.deepEqual(report.topics.map((topic) => topic.id), ['shared'])
  assert.equal(report.topics[0].rank, 1)
})

test('report normalization keeps URL-only legacy evidence from independent sources', () => {
  const report = normalizeReport({ topics: [{
    id: 'legacy-url-only',
    evidence: [
      { source: 'Reddit', label: 'alpha', url: 'https://reddit.com/r/alpha/1' },
      { source: 'Reddit', label: 'beta', url: 'https://reddit.com/r/beta/2' },
    ],
  }], sourceRuns: [] })
  assert.equal(report.topics.length, 1)
  assert.equal(report.topics[0].independentSourceCount, 2)
})

test('evidence always contains every corroborating channel before extra posts', () => {
  const manyAlpha = Array.from({ length: 7 }, (_, index) => post('alpha', `BTC ETF inflow update ${index}`, 20 - index, index + 1))
  const topics = buildTopics([...manyAlpha, post('beta', 'BTC ETF inflow update confirmed', 10, 99)])
  assert.equal(topics.length, 1)
  assert.deepEqual(new Set(topics[0].evidence.map((item) => item.label)), new Set(['alpha', 'beta']))
})

test('worker excludes matching posts from one independent publisher', () => {
  const topics = buildTopics([
    { ...post('channel-a', 'MODEL subscription price update', 20, 1), independenceKey: 'vendor-copy' },
    { ...post('channel-b', 'MODEL subscription price update', 19, 2), independenceKey: 'vendor-copy' },
  ])
  assert.equal(topics.length, 0)
})

test('worker excludes identical cross-posts from different source labels', () => {
  const topics = buildTopics([
    post('channel-a', 'FORWARDED model subscription price update', 20, 1),
    post('channel-b', 'FORWARDED model subscription price update', 19, 2),
  ])
  assert.equal(topics.length, 0)
})

test('worker evidence preserves every qualifying independent publisher before extra labels', () => {
  const publisherA = Array.from({ length: 6 }, (_, index) => ({ ...post(`channel-a-${index}`, `MODEL subscription price update ${index}`, 20 - index, index + 1), independenceKey: 'vendor-a' }))
  const publisherB = { ...post('channel-b', 'MODEL subscription price update confirmed', 10, 99), independenceKey: 'vendor-b' }
  const topics = buildTopics([...publisherA, publisherB])
  assert.equal(topics.length, 1)
  assert.deepEqual(new Set(topics[0].evidence.map((item) => item.independenceKey)), new Set(['vendor-a', 'vendor-b']))
})

test('worker near-deduplicates only within one publisher', () => {
  const shared = 'Model subscription pricing changed today for enterprise customers in Europe with annual billing'
  const topics = buildTopics([
    post('channel-a', shared, 20, 1, { independenceKey: 'publisher-a', author: 'alice' }),
    post('channel-a-copy', `${shared} details`, 19, 2, { independenceKey: 'publisher-a', author: 'alice' }),
    post('channel-b', `${shared} independently confirmed`, 18, 3, { independenceKey: 'publisher-b', author: 'bob' }),
  ], { now: new Date('2026-08-27T23:00:00.000Z'), reportDate: '2026-08-27' })
  assert.equal(topics.length, 1)
  assert.equal(topics[0].signal, '2 posts across 2 independent sources')
  assert.deepEqual(new Set(topics[0].evidence.map((item) => item.independenceKey)), new Set(['publisher-a', 'publisher-b']))
})

test('worker applies deterministic content, status, and freshness rules', () => {
  const now = new Date('2026-08-27T23:00:00.000Z')
  const release = buildTopics([
    post('vendor-release', 'Introducing Vendor Model v2 release notes', 20, 1, { source: 'OfficialFeed', independenceKey: 'vendor', publisherId: 'vendor', trustTier: 'maintainer', author: 'vendor' }),
  ], { now, reportDate: '2026-08-27' })[0]
  assert.equal(release.contentType, 'product_update')
  assert.equal(release.status, 'reported')
  assert.equal(release.freshness, 'fresh')

  const setup = buildTopics([
    post('reddit', 'How to configure Ollama context limits on macOS', 20, 2, { source: 'Reddit', independenceKey: 'reddit', author: 'alice' }),
    post('forum', 'Ollama context limit configuration guide for macOS', 19, 3, { source: 'Threads', independenceKey: 'forum', author: 'bob' }),
  ], { now, reportDate: '2026-08-27' })[0]
  assert.equal(setup.contentType, 'setup_tip')
  assert.equal(setup.status, 'confirmed')

  const priceSnapshots = [{ key: 'vendor-pro-usd-year', lastVerifiedAt: '2026-08-27T21:00:00.000Z', promotion: { kind: 'discount', label: 'Launch offer', endsAt: '2026-08-27T22:00:00.000Z' } }]
  const offer = buildTopics([
    post('vendor-pricing', 'Vendor Pro annual subscription discount offer now available', 20, 4, { source: 'OfficialPricing', independenceKey: 'vendor', publisherId: 'vendor', trustTier: 'primary', author: 'vendor', priceKeys: ['vendor-pro-usd-year'] }),
    post('independent-price', 'Vendor Pro subscription promotion offer confirmed independently', 19, 5, { source: 'Reddit', independenceKey: 'independent', author: 'carol', priceKeys: ['vendor-pro-usd-year'] }),
  ], { now, reportDate: '2026-08-27', priceSnapshots })[0]
  assert.equal(offer.contentType, 'discount_offer')
  assert.equal(offer.status, 'expired')
  assert.equal(offer.freshness, 'stale')
  assert.deepEqual(offer.priceKeys, ['vendor-pro-usd-year'])
})

test('worker carries compact history and promotes only a qualifying multi-day pattern', () => {
  const dayOne = buildTopicsWithHistory([{
    source: 'Reddit', sourceId: 'alpha', independenceKey: 'publisher-a', author: 'alice', text: 'Context inference local long memory pressure', engagement: 1, publishedAt: '2026-08-26T08:00:00.000Z', url: 'https://example.test/day-one',
  }], { now: new Date('2026-08-26T12:00:00.000Z'), reportDate: '2026-08-26' })
  assert.equal(dayOne.topics.length, 0)
  assert.equal(dayOne.topicHistory.length, 1)

  const dayTwo = buildTopicsWithHistory([
    { source: 'Reddit', sourceId: 'alpha', independenceKey: 'publisher-a', author: 'bob', text: 'Context inference local long memory pressure runtime', engagement: 1, publishedAt: '2026-08-27T08:00:00.000Z', url: 'https://example.test/day-two-a' },
    { source: 'Threads', sourceId: 'beta', independenceKey: 'publisher-b', author: 'carol', text: 'Context inference local long memory pressure benchmark', engagement: 1, publishedAt: '2026-08-27T09:00:00.000Z', url: 'https://example.test/day-two-b' },
  ], { now: new Date('2026-08-27T12:00:00.000Z'), reportDate: '2026-08-27', topicHistory: dayOne.topicHistory })
  assert.equal(dayTwo.topics.length, 1)
  assert.equal(dayTwo.topics[0].contentType, 'community_opinion')
  assert.equal(dayTwo.topics[0].status, 'confirmed')
  assert.deepEqual(dayTwo.topics[0].recurrence, {
    authorCount: 3,
    publisherCount: 2,
    mentionCount: 3,
    firstSeenAt: '2026-08-26T12:00:00.000Z',
    lastSeenAt: '2026-08-27T12:00:00.000Z',
    windowHours: 24,
  })
  assert.equal(dayTwo.topicHistory.length, 3)
})

test('report normalization preserves optional briefing quality fields and single official reports', () => {
  const recurrence = { authorCount: 3, publisherCount: 2, mentionCount: 4, firstSeenAt: '2026-08-25T12:00:00.000Z', lastSeenAt: '2026-08-27T12:00:00.000Z', windowHours: 48 }
  const topicHistory = [{ fingerprint: 'topic-fnv1a-12345678', reportDate: '2026-08-27', seenAt: '2026-08-27T12:00:00.000Z', authorKey: 'vendor', publisherId: 'vendor', contentHash: 'release-hash' }]
  const report = normalizeReport({
    date: '2026-08-27',
    generatedAt: '2026-08-27T12:00:00.000Z',
    topics: [{
      id: 'official-release',
      contentType: 'product_update',
      status: 'reported',
      freshness: 'aging',
      lastVerifiedAt: '2026-08-20T12:00:00.000Z',
      priceKeys: ['vendor-pro-usd-year'],
      recurrence,
      evidence: [{ source: 'OfficialFeed', label: 'Vendor releases', author: 'vendor', excerpt: 'Vendor v2 release notes', time: '2026-08-20T12:00:00.000Z', url: 'https://vendor.example/v2', independenceKey: 'vendor', publisherId: 'vendor', trustTier: 'maintainer', contentHash: 'release-hash' }],
    }],
    topicHistory,
    sourceRuns: [],
  })
  assert.equal(report.topics.length, 1)
  assert.equal(report.topics[0].contentType, 'product_update')
  assert.equal(report.topics[0].status, 'reported')
  assert.equal(report.topics[0].freshness, 'aging')
  assert.equal(report.topics[0].lastVerifiedAt, '2026-08-20T12:00:00.000Z')
  assert.deepEqual(report.topics[0].priceKeys, ['vendor-pro-usd-year'])
  assert.deepEqual(report.topics[0].recurrence, recurrence)
  assert.deepEqual(report.topicHistory, topicHistory)
})

test('worker model summaries cannot replace evidence or quality metadata', () => {
  const recurrence = { authorCount: 3, publisherCount: 2, mentionCount: 3, firstSeenAt: '2026-08-26T12:00:00.000Z', lastSeenAt: '2026-08-27T12:00:00.000Z', windowHours: 24 }
  const topic = {
    id: 'protected-topic',
    title: 'Deterministic title',
    summary: 'Deterministic summary',
    evidence: [{ url: 'https://evidence.test/1' }],
    contentType: 'community_opinion',
    status: 'confirmed',
    freshness: 'fresh',
    independentSourceCount: 2,
    recurrence,
    priceKeys: ['real-price'],
  }
  const updated = applyModelSummaries([topic], [{
    id: 'protected-topic',
    title: 'Editorial title',
    summary: 'Editorial summary',
    evidence: [],
    contentType: 'discount_offer',
    status: 'expired',
    freshness: 'stale',
    independentSourceCount: 99,
    recurrence: { authorCount: 99 },
    priceKeys: ['invented-price'],
  }])[0]
  assert.equal(updated.title, 'Editorial title')
  assert.equal(updated.summary, 'Editorial summary')
  assert.deepEqual(updated.evidence, topic.evidence)
  assert.equal(updated.contentType, topic.contentType)
  assert.equal(updated.status, topic.status)
  assert.equal(updated.freshness, topic.freshness)
  assert.equal(updated.independentSourceCount, topic.independentSourceCount)
  assert.deepEqual(updated.recurrence, recurrence)
  assert.deepEqual(updated.priceKeys, topic.priceKeys)
})

test('worker crawl propagates configured independence keys into corroborating evidence', async () => {
  const originalFetch = globalThis.fetch
  const now = Math.floor(Date.now() / 1000)
  const reports = new Map()
  globalThis.fetch = async (url) => {
    const alpha = String(url).includes('alpha')
    return new Response(JSON.stringify({ data: { children: [{ data: { name: alpha ? 'a' : 'b', title: alpha ? 'Model subscription billing changed for teams' : 'Model subscription billing changed for team plans', selftext: '', permalink: alpha ? '/r/alpha/a' : '/r/beta/b', created_utc: now, score: 1 } }] } }))
  }
  try {
    const response = await worker.fetch(new Request('https://signalroom.test/api/crawl?summary=off', { method: 'POST' }), {
      REPORTS: { get: async (key) => reports.get(key) || null, put: async (key, value) => reports.set(key, value) },
      AI_SOURCES: JSON.stringify([
        { id: 'source-a', kind: 'Reddit', name: 'alpha', config: { subreddit: 'alpha', independenceKey: ' Vendor-A ' } },
        { id: 'source-b', kind: 'Reddit', name: 'beta', config: { subreddit: 'beta', independenceKey: 'Vendor-B' } },
      ]),
    })
    const report = await response.json()
    assert.equal(report.topics.length, 1)
    assert.deepEqual(new Set(report.topics[0].evidence.map((item) => item.independenceKey)), new Set(['vendor-a', 'vendor-b']))
    assert.equal(report.topicHistory.length, 2)
  } finally {
    globalThis.fetch = originalFetch
  }
})

const previousPrice = () => normalizePriceObservation({
  vendor: 'OpenAI', product: 'ChatGPT', plan: 'Plus', region: 'US', currency: 'USD', amountMinor: 1_500,
  billingPeriod: 'month', unit: 'user', taxMode: 'unknown', observedAt: '2026-08-30T10:00:00.000Z', lastVerifiedAt: '2026-08-30T10:00:00.000Z',
  sourceUrl: 'https://help.openai.com/en/articles/6950777-what-is-chatgpt-plus', sourceKey: 'openai-chatgpt-plus-usd', publisherId: 'openai', trustTier: 'primary',
})

test('worker collects allowlisted official sources and merges prices with latest KV history', async () => {
  const pricing = await readFile(new URL('../server/fixtures/official/pricing-us.html', import.meta.url), 'utf8')
  let latest = { date: '2026-08-30', topics: [], sourceRuns: [], priceSnapshots: [previousPrice()] }
  const reports = {
    get: async () => latest,
    put: async (_key, value) => { latest = JSON.parse(value) },
  }
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    const requested = String(url)
    if (requested === 'https://openai.com/news/rss.xml') {
      const published = new Date(Date.now() - 60 * 60 * 1000).toUTCString()
      return new Response(`<?xml version="1.0"?><rss><channel><item><guid>official-now</guid><title>Official model update</title><description>New tools are available.</description><link>https://openai.com/index/official-model-update/</link><pubDate>${published}</pubDate></item></channel></rss>`)
    }
    if (requested.includes('6950777')) return new Response(pricing)
    return new Response('cookie=do-not-leak response body', { status: 503, statusText: 'TOKEN secret' })
  }
  try {
    const response = await worker.fetch(new Request('https://signalroom.test/api/crawl?summary=off', { method: 'POST' }), {
      REPORTS: reports,
      OFFICIAL_SOURCES: JSON.stringify(['openai-news', 'openai-chatgpt-plus-usd', 'ollama-releases']),
    })
    const report = await response.json()

    assert.deepEqual(report.priceSnapshots.map((item) => item.amountMinor), [2_000, 1_500])
    assert.deepEqual(latest.priceSnapshots.map((item) => item.amountMinor), [2_000, 1_500])
    const feed = report.sourceRuns.find((run) => run.sourceId === 'openai-news')
    assert.equal(feed.source, 'OpenAI News')
    assert.equal(feed.status, 'ok')
    assert.equal(feed.count, 1)
    const failed = report.sourceRuns.find((run) => run.sourceId === 'ollama-releases')
    assert.equal(failed.status, 'error')
    assert.doesNotMatch(failed.error, /cookie|token|secret|response body|https?:/i)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('worker preserves inherited prices when the current official pricing source fails', async () => {
  let latest = { date: '2026-08-30', topics: [], sourceRuns: [], priceSnapshots: [previousPrice()] }
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('sensitive body', { status: 502, statusText: 'secret' })
  try {
    const response = await worker.fetch(new Request('https://signalroom.test/api/crawl?summary=off', { method: 'POST' }), {
      REPORTS: { get: async () => latest, put: async (_key, value) => { latest = JSON.parse(value) } },
      OFFICIAL_SOURCES: JSON.stringify(['openai-chatgpt-plus-usd']),
    })
    const report = await response.json()

    assert.equal(report.priceSnapshots.length, 1)
    assert.equal(report.priceSnapshots[0].amountMinor, 1_500)
    assert.equal(report.sourceRuns[0].status, 'error')
    assert.equal(report.sourceRuns[0].sourceId, 'openai-chatgpt-plus-usd')
  } finally {
    globalThis.fetch = originalFetch
  }
})
