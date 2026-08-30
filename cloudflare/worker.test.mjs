import test from 'node:test'
import assert from 'node:assert/strict'
import worker, { buildTopics, normalizeReport } from './worker.ts'

const post = (sourceId, text, hour, id) => ({
  source: 'Telegram', sourceId, text, engagement: 100, publishedAt: `2026-08-27T${String(hour).padStart(2, '0')}:00:00.000Z`, url: `https://t.me/${sourceId}/${id}`,
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

test('worker evidence preserves every qualifying independent publisher before extra labels', () => {
  const publisherA = Array.from({ length: 6 }, (_, index) => ({ ...post(`channel-a-${index}`, `MODEL subscription price update ${index}`, 20 - index, index + 1), independenceKey: 'vendor-a' }))
  const publisherB = { ...post('channel-b', 'MODEL subscription price update confirmed', 10, 99), independenceKey: 'vendor-b' }
  const topics = buildTopics([...publisherA, publisherB])
  assert.equal(topics.length, 1)
  assert.deepEqual(new Set(topics[0].evidence.map((item) => item.independenceKey)), new Set(['vendor-a', 'vendor-b']))
})

test('worker crawl propagates configured independence keys into corroborating evidence', async () => {
  const originalFetch = globalThis.fetch
  const now = Math.floor(Date.now() / 1000)
  const reports = new Map()
  globalThis.fetch = async (url) => new Response(JSON.stringify({ data: { children: [{ data: { name: String(url).includes('alpha') ? 'a' : 'b', title: 'Model subscription price changed today', selftext: '', permalink: String(url).includes('alpha') ? '/r/alpha/a' : '/r/beta/b', created_utc: now, score: 1 } }] } }))
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
  } finally {
    globalThis.fetch = originalFetch
  }
})
