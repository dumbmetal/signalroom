import test from 'node:test'
import assert from 'node:assert/strict'
import { ReportService, localMidnightUtc } from './report-service.mjs'

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
