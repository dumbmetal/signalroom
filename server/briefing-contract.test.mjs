import test from 'node:test'
import assert from 'node:assert/strict'
import { canonicalizeUrl, annotateMessage, countIndependentCorroboration, independenceKeyFor, normalizeSourceDefinition } from '../shared/briefing-contract.mjs'

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

test('attributes a copied text group to its earliest publisher regardless of input order', () => {
  const messages = [
    { source: 'Telegram', sourceId: 'alpha-followup', independenceKey: 'alpha', text: 'Model pricing followup with independent detail', publishedAt: '2026-08-31T11:00:00.000Z' },
    { source: 'Telegram', sourceId: 'beta-copy', independenceKey: 'beta', text: 'Original model pricing announcement', publishedAt: '2026-08-31T12:00:00.000Z' },
    { source: 'Telegram', sourceId: 'alpha-original', independenceKey: 'alpha', text: 'Original model pricing announcement', publishedAt: '2026-08-31T10:00:00.000Z' },
  ]
  assert.equal(countIndependentCorroboration(messages), 1)
})

test('breaks equal-time copy ties deterministically regardless of input order', () => {
  const followup = { source: 'Telegram', sourceId: 'alpha-followup', independenceKey: 'alpha', text: 'Model pricing followup with independent detail', url: 'https://t.me/alpha/2', publishedAt: '2026-08-31T11:00:00.000Z' }
  const alpha = { source: 'Telegram', sourceId: 'alpha-original', independenceKey: 'alpha', text: 'Original model pricing announcement', url: 'https://t.me/alpha/1', publishedAt: '2026-08-31T10:00:00.000Z' }
  const beta = { source: 'Telegram', sourceId: 'beta-copy', independenceKey: 'beta', text: 'Original model pricing announcement', url: 'https://t.me/beta/1', publishedAt: '2026-08-31T10:00:00.000Z' }
  assert.equal(countIndependentCorroboration([followup, beta, alpha]), 1)
  assert.equal(countIndependentCorroboration([alpha, beta, followup]), 1)
})

test('treats markup and entity variants as one copied text', () => {
  const messages = [
    { source: 'Reddit', sourceId: 'alpha', independenceKey: 'alpha', text: '<b>Model</b> pricing &amp; plans', publishedAt: '2026-08-31T10:00:00.000Z' },
    { source: 'Telegram', sourceId: 'beta', independenceKey: 'beta', text: 'Model pricing & plans', publishedAt: '2026-08-31T11:00:00.000Z' },
  ]
  assert.equal(countIndependentCorroboration(messages), 1)
})
