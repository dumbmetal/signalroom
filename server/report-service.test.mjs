import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { ReportService, localMidnightUtc } from './report-service.mjs'
import { getOfficialSource } from '../shared/official-source-catalog.mjs'
import { normalizePriceObservation } from '../shared/price-snapshots.mjs'

test('London report windows follow GMT and BST at local midnight', () => {
  assert.equal(localMidnightUtc('2026-01-15', 'Europe/London'), '2026-01-15T00:00:00.000Z')
  assert.equal(localMidnightUtc('2026-07-15', 'Europe/London'), '2026-07-14T23:00:00.000Z')
})

test('ReportService propagates configured independence keys into corroborating evidence', async () => {
  const state = {
    sources: [
      { id: 'source-a', kind: 'Reddit', name: 'alpha', section: 'ai', enabled: true, config: { independenceKey: ' Vendor-A ' } },
      { id: 'source-b', kind: 'Reddit', name: 'beta', section: 'ai', enabled: true, config: { independenceKey: 'Vendor-B' } },
    ],
    reports: [],
    settings: { telegramEnabled: false },
  }
  const store = { read: async () => state, update: async (change) => change(state) }
  const reports = new ReportService(store, {})
  reports.adapters.Reddit = {
    fetchSince: async (source) => [{ id: source.id, source: 'Reddit', sourceId: source.name, author: source.name, text: source.name === 'alpha' ? 'Model subscription billing changed for teams' : 'Model subscription billing changed for team plans', url: `https://example.test/${source.id}`, publishedAt: '2026-08-24T00:00:00.000Z', engagement: {} }],
  }

  const report = await reports.generate('2026-08-24', true)
  assert.deepEqual(new Set(report.topics[0].evidence.map((item) => item.independenceKey)), new Set(['vendor-a', 'vendor-b']))
})

test('ReportService persists official messages and price history while isolating a failed source', async () => {
  const previousPrice = normalizePriceObservation({
    vendor: 'OpenAI', product: 'ChatGPT', plan: 'Plus', region: 'US', currency: 'USD', amountMinor: 1_500,
    billingPeriod: 'month', unit: 'user', taxMode: 'unknown', observedAt: '2026-08-30T10:00:00.000Z', lastVerifiedAt: '2026-08-30T10:00:00.000Z',
    sourceUrl: 'https://help.openai.com/en/articles/6950777-what-is-chatgpt-plus', sourceKey: 'openai-chatgpt-plus-usd', publisherId: 'openai', trustTier: 'primary',
  })
  const state = {
    sources: [
      { id: 'configured-feed', kind: 'OfficialFeed', name: 'Runtime name', section: 'ai', enabled: true, config: { catalogId: 'openai-news', url: 'http://127.0.0.1/private' } },
      { id: 'configured-price', kind: 'OfficialPricing', name: 'Runtime price', section: 'ai', enabled: true, config: { catalogId: 'openai-chatgpt-plus-usd' } },
      { id: 'configured-failure', kind: 'OfficialFeed', name: 'Runtime failure', section: 'ai', enabled: true, config: { catalogId: 'ollama-releases' } },
    ],
    reports: [{ date: '2026-08-30', generatedAt: '2026-08-30T12:00:00.000Z', topics: [], sourceRuns: [], priceSnapshots: [previousPrice] }],
    settings: { telegramEnabled: false },
  }
  const store = { read: async () => state, update: async (change) => change(state) }
  const pricing = await readFile(new URL('./fixtures/official/pricing-us.html', import.meta.url), 'utf8')
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    const requested = String(url)
    if (requested === 'https://openai.com/news/rss.xml') return new Response(`<?xml version="1.0"?><rss><channel><item><guid>release-1</guid><title>New model tools</title><description>Official update.</description><link>https://openai.com/index/new-model-tools/</link><pubDate>Mon, 31 Aug 2026 12:00:00 GMT</pubDate></item></channel></rss>`)
    if (requested.includes('6950777')) return new Response(pricing)
    return new Response('TOKEN=do-not-leak response body', { status: 503, statusText: 'secret upstream failure' })
  }
  try {
    const report = await new ReportService(store, {}).generate('2026-08-31', true)
    assert.equal(report.priceSnapshots.length, 2)
    assert.deepEqual(report.priceSnapshots.map((item) => item.amountMinor), [2_000, 1_500])
    assert.equal(state.reports[0], report)
    assert.equal(report.sourceRuns.length, 3)

    const feedRun = report.sourceRuns.find((run) => run.sourceId === 'configured-feed')
    assert.equal(feedRun.source, 'OpenAI News')
    assert.equal(feedRun.kind, 'OfficialFeed')
    assert.equal(feedRun.ok, true)
    assert.equal(feedRun.status, 'ok')
    assert.equal(feedRun.count, 1)
    assert.deepEqual(feedRun.warnings, [])
    assert.ok(Number.isFinite(Date.parse(feedRun.checkedAt)))

    const failure = report.sourceRuns.find((run) => run.sourceId === 'configured-failure')
    assert.equal(failure.ok, false)
    assert.equal(failure.status, 'error')
    assert.equal(failure.count, 0)
    assert.doesNotMatch(failure.error, /token|secret|response body|https?:/i)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('ReportService marks useful official results with parser warnings as partial', async () => {
  const state = {
    sources: [{ id: 'price-source', kind: 'OfficialPricing', name: 'Runtime price', section: 'ai', enabled: true, config: { catalogId: 'openai-chatgpt-plus-usd' } }],
    reports: [],
    settings: { telegramEnabled: false },
  }
  const store = { read: async () => state, update: async (change) => change(state) }
  const reports = new ReportService(store, {})
  reports.adapters.OfficialPricing = {
    fetchSince: async () => ({
      source: getOfficialSource('openai-chatgpt-plus-usd'),
      messages: [],
      observations: [normalizePriceObservation({
        vendor: 'OpenAI', product: 'ChatGPT', plan: 'Plus', region: 'US', currency: 'USD', amountMinor: 2_000,
        billingPeriod: 'month', unit: 'user', taxMode: 'unknown', observedAt: '2026-08-31T10:00:00.000Z', lastVerifiedAt: '2026-08-31T10:00:00.000Z',
        sourceUrl: 'https://help.openai.com/en/articles/6950777-what-is-chatgpt-plus', sourceKey: 'openai-chatgpt-plus-usd', publisherId: 'openai', trustTier: 'primary',
      })],
      warnings: ['Missing required plan: Pro'],
    }),
  }

  const report = await reports.generate('2026-08-31', true)
  assert.deepEqual(report.sourceRuns[0], {
    sourceId: 'price-source', source: 'ChatGPT Plus USD pricing', kind: 'OfficialPricing', ok: true, status: 'partial', count: 1,
    checkedAt: report.sourceRuns[0].checkedAt, warnings: ['Missing required plan: Pro'],
  })
})
