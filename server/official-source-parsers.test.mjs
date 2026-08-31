import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  getOfficialSource,
  isAllowedOfficialSourceUrl,
  listOfficialSources,
  resolveOfficialSource,
} from '../shared/official-source-catalog.mjs'
import { collectOfficialSource, parseOfficialFeed, parseOfficialPage, parseOfficialPricing } from '../shared/official-source-parsers.mjs'

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

test('official collection refuses an allowlisted source redirect to a private URL', async () => {
  const requested = []
  const fetchImpl = async (url) => {
    requested.push(String(url))
    return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } })
  }

  await assert.rejects(() => collectOfficialSource(
    { kind: 'OfficialFeed', config: { catalogId: 'openai-news', url: 'https://attacker.example/feed' } },
    { since: '2026-08-30T00:00:00.000Z', fetchImpl },
  ), /redirect was not allowlisted/i)
  assert.deepEqual(requested, ['https://openai.com/news/rss.xml'])
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

test('normalizes the latest LM Studio changelog release from its official page', async () => {
  const source = getOfficialSource('lmstudio-changelog')
  const messages = parseOfficialPage(source, await fixture('lmstudio-changelog.html'), '2026-08-20T00:00:00.000Z')

  assert.equal(messages.length, 1)
  assert.equal(messages[0].externalId, 'lm-studio-0.4.23')
  assert.equal(messages[0].text, 'LM Studio 0.4.23 Improve reliability of Qwen 3.8 Flash Next')
  assert.equal(messages[0].publishedAt, '2026-08-28T00:00:00.000Z')
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

test('extracts ChatGPT Plus KRW from its scoped official pricing card', async () => {
  const source = getOfficialSource('openai-chatgpt-plus-krw')
  const parsed = parseOfficialPricing(source, await fixture('pricing-chatgpt-kr.html'), '2026-08-31T10:00:00.000Z')

  assert.equal(parsed.observations.length, 1)
  assert.equal(parsed.observations[0].currency, 'KRW')
  assert.equal(parsed.observations[0].amountMinor, 29_000)
})

test('OpenAI pricing fails closed when Plus is missing and another plan remains', () => {
  const usd = getOfficialSource('openai-chatgpt-plus-usd')
  const krw = getOfficialSource('openai-chatgpt-plus-krw')
  const usdDrifted = '<h1>What is ChatGPT Plus?</h1><p>Pricing temporarily unavailable.</p><h2>Business</h2><p>$25 / seat / month</p>'
  const krwDrifted = '<h2>Plus</h2><p>Pricing temporarily unavailable.</p><h2>Business</h2><p>₩35,000 / seat / month</p>'

  assert.throws(() => parseOfficialPricing(usd, usdDrifted, '2026-08-31T10:00:00.000Z'), /none of the required plans/i)
  assert.throws(() => parseOfficialPricing(krw, krwDrifted, '2026-08-31T10:00:00.000Z'), /none of the required plans/i)
})

test('OpenAI user pricing rejects seat qualifiers after the billing period', () => {
  const usd = getOfficialSource('openai-chatgpt-plus-usd')
  const krw = getOfficialSource('openai-chatgpt-plus-krw')
  const usdSuffixes = [
    '<h1>What is ChatGPT Plus?</h1><p>ChatGPT Plus costs $25 per month per seat.</p>',
    '<h1>What is ChatGPT Plus?</h1><p>ChatGPT Plus costs $25 / month / seat.</p>',
  ]
  const krwSuffixes = [
    '<h2>Plus</h2><p>ChatGPT Plus costs ₩35,000 per month per seat.</p>',
    '<h2>Plus</h2><p>ChatGPT Plus costs ₩35,000 / 월 / seat.</p>',
  ]

  for (const body of usdSuffixes) assert.throws(() => parseOfficialPricing(usd, body, '2026-08-31T10:00:00.000Z'), /none of the required plans/i)
  for (const body of krwSuffixes) assert.throws(() => parseOfficialPricing(krw, body, '2026-08-31T10:00:00.000Z'), /none of the required plans/i)
})

test('extracts Claude Pro USD monthly and annual pricing from the official Anthropic page fixture', async () => {
  const source = getOfficialSource('anthropic-claude-pro-usd')
  const page = await fixture('pricing-claude-us.html')
  const parsed = parseOfficialPricing(source, `<nav>Pro plan ${'navigation '.repeat(300)}</nav>${page}`, '2026-08-31T10:00:00.000Z')

  assert.equal(parsed.observations.length, 2)
  const monthly = parsed.observations.find((item) => item.billingPeriod === 'month')
  const annual = parsed.observations.find((item) => item.billingPeriod === 'year')
  assert.equal(monthly.vendor, 'Anthropic')
  assert.equal(monthly.product, 'Claude')
  assert.equal(monthly.plan, 'Pro')
  assert.equal(monthly.amountMinor, 2_000)
  assert.equal(annual.plan, 'Pro annual')
  assert.equal(annual.amountMinor, 20_000)
  assert.deepEqual(annual.promotion, { kind: 'discount', label: 'Annual subscription discount', originalAmountMinor: 24_000 })
})

test('extracts Ollama cloud subscription prices and annual discount from the official pricing fixture', async () => {
  const source = getOfficialSource('ollama-cloud-pricing')
  const parsed = parseOfficialPricing(source, await fixture('pricing-local-llm.html'), '2026-08-31T10:00:00.000Z')

  assert.equal(parsed.warnings.length, 0)
  assert.equal(parsed.observations.length, 3)
  const proMonthly = parsed.observations.find((item) => item.plan === 'Pro' && item.billingPeriod === 'month')
  const proAnnual = parsed.observations.find((item) => item.plan === 'Pro annual')
  const team = parsed.observations.find((item) => item.plan === 'Team')
  assert.equal(proMonthly.amountMinor, 2_000)
  assert.equal(proAnnual.amountMinor, 20_000)
  assert.deepEqual(proAnnual.promotion, { kind: 'discount', label: 'Annual billing', originalAmountMinor: 24_000 })
  assert.equal(team.amountMinor, 2_500)
  assert.equal(team.unit, 'seat')
  assert.deepEqual(team.promotion, { kind: 'introductory', label: 'Introductory pricing' })
  assert.throws(() => parseOfficialPricing(source, '<html><h1>Pricing temporarily unavailable</h1></html>', '2026-08-31T10:00:00.000Z'), /none of the required plans/i)
})

test('official pricing fails closed per plan card instead of borrowing another plan price', () => {
  const source = getOfficialSource('ollama-cloud-pricing')
  const drifted = '<section><h2>Pro</h2><p>Pricing temporarily unavailable</p></section><section><h2>Team</h2><p>Introductory pricing: $25 / seat / mo</p></section>'
  const parsed = parseOfficialPricing(source, drifted, '2026-08-31T10:00:00.000Z')

  assert.equal(parsed.observations.some((item) => item.plan === 'Pro'), false)
  assert.equal(parsed.observations.find((item) => item.plan === 'Team')?.amountMinor, 2_500)
  assert.ok(parsed.warnings.includes('Missing required plan: Pro'))
})
