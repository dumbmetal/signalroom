import test from 'node:test'
import assert from 'node:assert/strict'
import { safeSourceConfig } from './source-config.mjs'

test('keeps source identity metadata while discarding unapproved source config', () => {
  assert.deepEqual(safeSourceConfig({ subreddit: 'LocalLLaMA', publisherId: 'reddit', independenceKey: 'reddit', trustTier: 'community', apiKey: 'must-not-persist' }), {
    subreddit: 'LocalLLaMA', publisherId: 'reddit', independenceKey: 'reddit', trustTier: 'community',
  })
})

test('rejects blank or non-string identity metadata at the API boundary', () => {
  assert.deepEqual(safeSourceConfig({ publisherId: ' Vendor ', independenceKey: '  ', trustTier: 'PRIMARY', sourceKey: 'not-accepted', apiKey: 'must-not-persist' }), {
    publisherId: 'Vendor', trustTier: 'primary',
  })
})

test('official source config keeps only a verified catalog id', () => {
  assert.deepEqual(safeSourceConfig({ catalogId: 'openai-news', url: 'http://127.0.0.1/private', headers: { cookie: 'secret' } }, 'OfficialFeed'), {
    catalogId: 'openai-news',
  })
})

test('official source config rejects unknown ids and catalog kind mismatches', () => {
  assert.throws(() => safeSourceConfig({ catalogId: 'not-in-catalog' }, 'OfficialFeed'), /unknown official source/i)
  assert.throws(() => safeSourceConfig({ catalogId: 'openai-news' }, 'OfficialPricing'), /kind does not match/i)
})
