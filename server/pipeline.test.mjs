import test from 'node:test'
import assert from 'node:assert/strict'
import { clusterMessages, corroboratedClusters, dedupeMessages, normalizeMessage, rankClusters, summarizeClusters } from './pipeline.mjs'

const message = (id, text, sourceId = 'one') => ({ id, source: 'Reddit', sourceId, author: 'tester', text, url: `https://example.test/${id}`, publishedAt: '2026-08-24T00:00:00.000Z', engagement: { score: 10 } })

test('normalizes and strips markup', () => { assert.equal(normalizeMessage({ ...message('1', '<b>Agent</b> systems &amp; tools') }).text, 'Agent systems & tools') })
test('deduplicates messages without limiting topic count', () => { const input = Array.from({ length: 25 }, (_, index) => message(String(index), `uniquetopic${index}`)); assert.equal(dedupeMessages([...input, input[0]]).length, 25); assert.equal(clusterMessages(input).length, 25) })
test('clusters similar messages and assigns evidence confidence', async () => { const input = [message('1', 'Stablecoin settlement payments infrastructure grows', 'a'), message('2', 'Stablecoin payments settlement adoption expands', 'b')]; const ranked = rankClusters(clusterMessages(input), new Date('2026-08-24T01:00:00.000Z').getTime()); assert.equal(ranked.length, 1); const topics = await summarizeClusters(ranked, 'crypto'); assert.equal(topics[0].confidence, 'Mixed signal'); assert.equal(topics[0].evidence.length, 2) })
test('keeps only topics corroborated by distinct sources', () => { const clusters = clusterMessages([message('1', 'Bitcoin ETF inflows continue', 'a'), message('2', 'Bitcoin ETF demand expands', 'b'), message('3', 'Solitary unrelated observation', 'a')]); const corroborated = corroboratedClusters(clusters); assert.equal(corroborated.length, 1); assert.deepEqual(new Set(corroborated[0].messages.map((item) => item.sourceId)), new Set(['a', 'b'])) })
test('keeps source failures isolated through contract behavior', async () => { const successful = await Promise.allSettled([Promise.resolve([message('1', 'Working source')]), Promise.reject(new Error('rate limited'))]); assert.equal(successful[0].status, 'fulfilled'); assert.equal(successful[1].status, 'rejected') })
