import test from 'node:test'
import assert from 'node:assert/strict'
import { clusterMessages, corroboratedClusters, dedupeMessages, normalizeMessage, rankClusters, summarizeClusters } from './pipeline.mjs'

const message = (id, text, sourceId = 'one') => ({ id, source: 'Reddit', sourceId, author: 'tester', text, url: `https://example.test/${id}`, publishedAt: '2026-08-24T00:00:00.000Z', engagement: { score: 10 } })

test('normalizes and strips markup', () => { assert.equal(normalizeMessage({ ...message('1', '<b>Agent</b> systems &amp; tools') }).text, 'Agent systems & tools') })
test('deduplicates messages without limiting topic count', () => { const input = Array.from({ length: 25 }, (_, index) => message(String(index), `uniquetopic${index}`)); assert.equal(dedupeMessages([...input, input[0]]).length, 25); assert.equal(clusterMessages(input).length, 25) })
test('clusters similar messages and assigns evidence confidence', async () => { const input = [message('1', 'Stablecoin settlement payments infrastructure grows', 'a'), message('2', 'Stablecoin payments settlement adoption expands', 'b')]; const ranked = rankClusters(clusterMessages(input), new Date('2026-08-24T01:00:00.000Z').getTime()); assert.equal(ranked.length, 1); const topics = await summarizeClusters(ranked, 'crypto'); assert.equal(topics[0].confidence, 'Mixed signal'); assert.equal(topics[0].evidence.length, 2) })
test('keeps only topics corroborated by distinct sources', () => { const clusters = clusterMessages([message('1', 'Bitcoin ETF inflows continue', 'a'), message('2', 'Bitcoin ETF demand expands', 'b'), message('3', 'Solitary unrelated observation', 'a')]); const corroborated = corroboratedClusters(clusters); assert.equal(corroborated.length, 1); assert.deepEqual(new Set(corroborated[0].messages.map((item) => item.sourceId)), new Set(['a', 'b'])) })
test('does not corroborate two labels belonging to one publisher', () => {
  const clusters = clusterMessages([
    { ...message('1', 'Model price changed today', 'channel-a'), independenceKey: 'vendor-copy' },
    { ...message('2', 'Model price changed today', 'channel-b'), independenceKey: 'vendor-copy' },
  ])
  assert.equal(corroboratedClusters(clusters).length, 0)
})
test('does not corroborate identical cross-posts from different source labels', () => {
  const clusters = clusterMessages([
    message('1', 'Forwarded model subscription price update', 'channel-a'),
    message('2', 'Forwarded model subscription price update', 'channel-b'),
  ])
  assert.equal(corroboratedClusters(clusters).length, 0)
})
test('evidence preserves every qualifying independent publisher before extra posts', async () => {
  const publisherA = Array.from({ length: 6 }, (_, index) => ({ ...message(`a-${index}`, `Model subscription price changed today ${index}`, `channel-a-${index}`), independenceKey: 'vendor-a' }))
  const publisherB = { ...message('b', 'Model subscription price changed today confirmed', 'channel-b'), independenceKey: 'vendor-b' }
  const topic = (await summarizeClusters(corroboratedClusters(clusterMessages([...publisherA, publisherB])), 'ai'))[0]
  assert.deepEqual(new Set(topic.evidence.map((item) => item.independenceKey)), new Set(['vendor-a', 'vendor-b']))
})
test('near-deduplicates within a publisher while preserving cross-publisher corroboration', async () => {
  const shared = 'Model subscription pricing changed today for enterprise customers in Europe with annual billing'
  const input = [
    { ...message('a-first', shared, 'channel-a'), independenceKey: 'publisher-a', publishedAt: '2026-08-24T08:00:00.000Z' },
    { ...message('a-near-copy', `${shared} details`, 'channel-a-copy'), independenceKey: 'publisher-a', publishedAt: '2026-08-24T09:00:00.000Z' },
    { ...message('b-independent', `${shared} independently confirmed`, 'channel-b'), independenceKey: 'publisher-b', publishedAt: '2026-08-24T10:00:00.000Z' },
  ]
  const deduped = dedupeMessages(input)
  assert.deepEqual(deduped.map((item) => item.id), ['a-first', 'b-independent'])
  const topics = await summarizeClusters(corroboratedClusters(clusterMessages(deduped)), 'ai')
  assert.equal(topics.length, 1)
  assert.deepEqual(new Set(topics[0].evidence.map((item) => item.independenceKey)), new Set(['publisher-a', 'publisher-b']))
})
test('allows model summaries to update only title and summary', async () => {
  const input = [message('1', 'Stablecoin settlement payments infrastructure grows', 'a'), message('2', 'Stablecoin payments settlement adoption expands', 'b')]
  const clusters = rankClusters(clusterMessages(input), new Date('2026-08-24T01:00:00.000Z').getTime())
  const topics = await summarizeClusters(clusters, 'ai', async () => [{
    title: 'Editorial title',
    summary: 'Editorial summary',
    evidence: [],
    status: 'confirmed',
    freshness: 'fresh',
    recurrence: { authorCount: 99 },
    priceKeys: ['invented-price'],
  }])
  assert.equal(topics[0].title, 'Editorial title')
  assert.equal(topics[0].summary, 'Editorial summary')
  assert.equal(topics[0].evidence.length, 2)
  assert.equal(topics[0].status, undefined)
  assert.equal(topics[0].recurrence, undefined)
  assert.equal(topics[0].priceKeys, undefined)
})
test('keeps source failures isolated through contract behavior', async () => { const successful = await Promise.allSettled([Promise.resolve([message('1', 'Working source')]), Promise.reject(new Error('rate limited'))]); assert.equal(successful[0].status, 'fulfilled'); assert.equal(successful[1].status, 'rejected') })
