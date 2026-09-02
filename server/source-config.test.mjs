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
  assert.throws(() => safeSourceConfig({ catalogId: 'constructor' }, 'OfficialFeed'), /unknown official source/i)
  assert.throws(() => safeSourceConfig({ catalogId: 'openai-news' }, 'OfficialPricing'), /kind does not match/i)
})

test('source creation canonicalizes official catalog sources without persisting runtime URLs or headers', async () => {
  const sourceConfig = await import('./source-config.mjs')
  assert.equal(typeof sourceConfig.createSourceRecord, 'function')
  if (typeof sourceConfig.createSourceRecord !== 'function') return

  assert.deepEqual(sourceConfig.createSourceRecord({
    kind: 'OfficialFeed',
    name: 'Untrusted runtime label',
    detail: 'http://127.0.0.1/private',
    section: 'crypto',
    url: 'http://127.0.0.1/private',
    headers: { cookie: 'must-not-persist' },
    config: {
      catalogId: 'openai-news',
      url: 'http://127.0.0.1/private',
      headers: { authorization: 'must-not-persist' },
    },
  }, 'official-id'), {
    id: 'official-id',
    kind: 'OfficialFeed',
    name: 'OpenAI News',
    detail: 'OpenAI',
    section: 'ai',
    enabled: true,
    config: { catalogId: 'openai-news' },
  })
})

test('source creation rejects unknown catalog ids and official kind mismatches', async () => {
  const { createSourceRecord } = await import('./source-config.mjs')
  assert.equal(typeof createSourceRecord, 'function')
  if (typeof createSourceRecord !== 'function') return

  assert.throws(() => createSourceRecord({ kind: 'OfficialFeed', config: { catalogId: 'not-in-catalog' } }, 'bad-id'), /unknown official source/i)
  assert.throws(() => createSourceRecord({ kind: 'OfficialPricing', config: { catalogId: 'openai-news' } }, 'bad-kind'), /kind does not match/i)
})

test('source patch validates config against the stored kind and keeps official fields canonical', async () => {
  const { patchSourceRecord } = await import('./source-config.mjs')
  assert.equal(typeof patchSourceRecord, 'function')
  if (typeof patchSourceRecord !== 'function') return

  const existing = {
    id: 'official-id', kind: 'OfficialFeed', name: 'OpenAI News', detail: 'OpenAI', section: 'ai', enabled: true,
    config: { catalogId: 'openai-news' },
  }
  assert.throws(() => patchSourceRecord(existing, { config: { catalogId: 'openai-chatgpt-plus-usd' } }), /kind does not match/i)
  assert.deepEqual(patchSourceRecord(existing, {
    name: 'Spoofed name', detail: 'https://attacker.example', section: 'crypto', headers: { cookie: 'must-not-persist' },
    config: { catalogId: 'ollama-releases', url: 'https://attacker.example', headers: { cookie: 'must-not-persist' } },
  }), {
    id: 'official-id',
    kind: 'OfficialFeed',
    name: 'Ollama releases',
    detail: 'Ollama',
    section: 'ai',
    enabled: true,
    config: { catalogId: 'ollama-releases' },
  })
})

test('source creation and patch preserve existing community API behavior', async () => {
  const { createSourceRecord, patchSourceRecord } = await import('./source-config.mjs')
  assert.equal(typeof createSourceRecord, 'function')
  assert.equal(typeof patchSourceRecord, 'function')
  if (typeof createSourceRecord !== 'function' || typeof patchSourceRecord !== 'function') return

  const created = createSourceRecord({
    kind: 'Reddit', name: 'r/LocalLLaMA', detail: 'LocalLLaMA', section: 'ai', enabled: false,
    config: { subreddit: 'LocalLLaMA', limit: 25, publisherId: 'Reddit', apiKey: 'must-not-persist' },
  }, 'reddit-id')
  assert.deepEqual(created, {
    id: 'reddit-id', kind: 'Reddit', name: 'r/LocalLLaMA', detail: 'LocalLLaMA', section: 'ai', enabled: false,
    config: { subreddit: 'LocalLLaMA', limit: 25, publisherId: 'Reddit' },
  })
  assert.deepEqual(patchSourceRecord(created, {
    detail: 'LocalLLaMA and LocalLLM', enabled: true,
    config: { subreddit: 'LocalLLM', limit: 50, token: 'must-not-persist' },
  }), {
    ...created,
    detail: 'LocalLLaMA and LocalLLM',
    enabled: true,
    config: { subreddit: 'LocalLLM', limit: 50 },
  })
})

test('source API normalizers classify catalog misuse as a safe client error', async () => {
  const { createSourceRecord, patchSourceRecord, SourceConfigError } = await import('./source-config.mjs')
  const existing = {
    id: 'reddit-id', kind: 'Reddit', name: 'r/LocalLLaMA', detail: 'LocalLLaMA', section: 'ai', enabled: true,
    config: { subreddit: 'LocalLLaMA' },
  }

  assert.throws(() => createSourceRecord({
    kind: 'Reddit', name: 'r/LocalLLaMA', config: { catalogId: 'openai-news' },
  }, 'bad-create'), SourceConfigError)
  assert.throws(() => patchSourceRecord(existing, {
    config: { catalogId: 'openai-news' },
  }), SourceConfigError)
})
