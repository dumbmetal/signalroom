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

test('manual crawl requires the report import bearer token', async () => {
  const response = await worker.fetch(new Request('https://example.com/api/crawl', { method: 'POST' }), { REPORTS: {}, REPORT_IMPORT_TOKEN: 'test-token' })
  assert.equal(response.status, 401)
})

test('evidence always contains every corroborating channel before extra posts', () => {
  const manyAlpha = Array.from({ length: 7 }, (_, index) => post('alpha', `BTC ETF inflow update ${index}`, 20 - index, index + 1))
  const topics = buildTopics([...manyAlpha, post('beta', 'BTC ETF inflow update confirmed', 10, 99)])
  assert.equal(topics.length, 1)
  assert.deepEqual(new Set(topics[0].evidence.map((item) => item.label)), new Set(['alpha', 'beta']))
})
