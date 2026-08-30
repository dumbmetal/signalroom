import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  getOfficialSource,
  isAllowedOfficialSourceUrl,
  listOfficialSources,
  resolveOfficialSource,
} from '../shared/official-source-catalog.mjs'
import { parseOfficialFeed, parseOfficialPage, parseOfficialPricing } from '../shared/official-source-parsers.mjs'

const fixture = (name) => readFile(new URL(`./fixtures/official/${name}`, import.meta.url), 'utf8')

test('official sources are selected by catalog id and runtime URLs are ignored', () => {
  const source = resolveOfficialSource({
    id: 'runtime-id',
    kind: 'OfficialFeed',
    name: 'Runtime label',
    detail: 'http://127.0.0.1/private',
    config: { catalogId: 'openai-news', url: 'https://attacker.example/feed' },
  })

  assert.equal(source.id, 'openai-news')
  assert.equal(source.url, 'https://openai.com/news/rss.xml')
  assert.equal(source.publisherId, 'openai')
  assert.equal(source.trustTier, 'primary')
  assert.equal('config' in source, false)
})

test('unknown catalog ids and kind mismatches are rejected', () => {
  assert.throws(() => getOfficialSource('unknown-source'), /unknown official source/i)
  assert.throws(() => listOfficialSources(['openai-news', 'unknown-source']), /unknown official source/i)
  assert.throws(() => resolveOfficialSource({ kind: 'OfficialPricing', config: { catalogId: 'openai-news' } }), /kind does not match/i)
})

test('official redirects stay HTTPS and inside the catalog host allowlist', () => {
  const source = getOfficialSource('openai-news')
  assert.equal(isAllowedOfficialSourceUrl(source, source.url), true)
  assert.equal(isAllowedOfficialSourceUrl(source, 'https://www.openai.com/news/rss.xml'), true)
  assert.equal(isAllowedOfficialSourceUrl(source, 'https://attacker.example/openai.xml'), false)
  assert.equal(isAllowedOfficialSourceUrl(source, 'http://openai.com/news/rss.xml'), false)
  assert.equal(isAllowedOfficialSourceUrl(source, 'http://127.0.0.1/admin'), false)
})

test('normalizes Atom entries and excludes entries older than since', async () => {
  const body = await fixture('release-feed.xml')
  const source = getOfficialSource('ollama-releases')
  const messages = parseOfficialFeed(source, body, '2026-08-30T00:00:00.000Z')

  assert.equal(messages.length, 1)
  assert.deepEqual(messages[0], {
    externalId: 'tag:github.com,2008:Repository/658928958/v0.12.3',
    source: 'OfficialFeed',
    sourceId: 'Ollama releases',
    author: 'Ollama',
    text: 'Ollama v0.12.3 New model support & safer downloads.',
    url: 'https://github.com/ollama/ollama/releases/tag/v0.12.3',
    publishedAt: '2026-08-31T09:30:00.000Z',
    engagement: {},
  })
})

test('normalizes RSS and JSON Feed items with the same since boundary', () => {
  const source = getOfficialSource('openai-news')
  const rss = `<?xml version="1.0"?><rss><channel><item><guid>release-1</guid><title>New model</title><description><![CDATA[<p>Faster &amp; safer.</p>]]></description><link>https://openai.com/index/new-model/</link><pubDate>Sun, 30 Aug 2026 12:00:00 GMT</pubDate></item><item><guid>old</guid><title>Old</title><link>https://openai.com/old</link><pubDate>Sat, 29 Aug 2026 23:59:59 GMT</pubDate></item></channel></rss>`
  const jsonFeed = JSON.stringify({ version: 'https://jsonfeed.org/version/1.1', items: [{ id: 'json-1', title: 'JSON release', content_html: '<p>Tools &amp; fixes</p>', url: 'https://openai.com/json-release', date_published: '2026-08-30T00:00:00Z' }] })

  assert.equal(parseOfficialFeed(source, rss, '2026-08-30T00:00:00.000Z')[0].text, 'New model Faster & safer.')
  assert.equal(parseOfficialFeed(source, jsonFeed, '2026-08-30T00:00:00.000Z')[0].externalId, 'json-1')
})

test('normalizes a catalog-selected official article page', () => {
  const source = getOfficialSource('openai-chatgpt-release-notes')
  const body = `<html><head><script type="application/ld+json">{"@type":"Article","headline":"ChatGPT release notes","description":"A new tools update.","dateModified":"2026-08-31T08:00:00Z","url":"https://help.openai.com/en/articles/6825453-chatgpt-release-notes"}</script></head></html>`
  const messages = parseOfficialPage(source, body, '2026-08-30T00:00:00.000Z')

  assert.equal(messages.length, 1)
  assert.equal(messages[0].text, 'ChatGPT release notes A new tools update.')
  assert.equal(messages[0].publishedAt, '2026-08-31T08:00:00.000Z')
})

test('extracts required official USD plans and fails closed after parser drift', async () => {
  const source = getOfficialSource('openai-chatgpt-plus-usd')
  const parsed = parseOfficialPricing(source, await fixture('pricing-us.html'), '2026-08-31T10:00:00.000Z')

  assert.equal(parsed.warnings.length, 0)
  assert.equal(parsed.observations.length, 1)
  assert.equal(parsed.observations[0].plan, 'Plus')
  assert.equal(parsed.observations[0].currency, 'USD')
  assert.equal(parsed.observations[0].amountMinor, 2_000)
  assert.throws(() => parseOfficialPricing(source, '<html><h1>Pricing temporarily unavailable</h1></html>', '2026-08-31T10:00:00.000Z'), /none of the required plans/i)
})
