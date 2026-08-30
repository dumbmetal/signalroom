import test from 'node:test'
import assert from 'node:assert/strict'
import { canonicalizeUrl, annotateMessage, independenceKeyFor, normalizeSourceDefinition } from '../shared/briefing-contract.mjs'

test('canonicalizes tracking URLs without removing meaningful query parameters', () => {
  assert.equal(canonicalizeUrl('https://Example.com/release/?utm_source=x&plan=pro#details'), 'https://example.com/release?plan=pro')
})

test('annotates a message with stable source and independence identities', () => {
  const source = normalizeSourceDefinition({ id: 'openai-news', kind: 'RSS', name: 'OpenAI Product', publisherId: 'openai', independenceKey: 'openai', trustTier: 'primary' })
  const item = annotateMessage({ id: '42', source: 'RSS', sourceId: 'OpenAI Product', text: 'Release note', url: 'https://openai.com/news/?utm_medium=email', publishedAt: '2026-08-31T00:00:00.000Z', engagement: {} }, source)
  assert.equal(item.sourceKey, 'openai-news')
  assert.equal(item.independenceKey, 'openai')
  assert.equal(item.canonicalUrl, 'https://openai.com/news')
  assert.ok(item.contentHash)
})

test('normalizes source identity keys before they count as independent publishers', () => {
  const source = normalizeSourceDefinition({ id: ' OpenAI-News ', kind: 'RSS', name: 'OpenAI Product', publisherId: ' OpenAI ', independenceKey: ' OPENAI ', trustTier: 'PRIMARY' })
  assert.equal(source.sourceKey, 'openai-news')
  assert.equal(source.publisherId, 'openai')
  assert.equal(source.independenceKey, 'openai')
  assert.equal(source.trustTier, 'primary')
})

test('uses the same publisher fallback for messages without an explicit independence key', () => {
  assert.equal(independenceKeyFor({ source: 'Reddit', sourceId: 'LocalLLaMA', publisherId: ' Reddit ' }), 'reddit')
})
