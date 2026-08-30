import test from 'node:test'
import assert from 'node:assert/strict'
import { ReportService } from './report-service.mjs'

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
    fetchSince: async (source) => [{ id: source.id, source: 'Reddit', sourceId: source.name, author: source.name, text: 'Model subscription price changed today', url: `https://example.test/${source.id}`, publishedAt: '2026-08-24T00:00:00.000Z', engagement: {} }],
  }

  const report = await reports.generate('2026-08-24', true)
  assert.deepEqual(new Set(report.topics[0].evidence.map((item) => item.independenceKey)), new Set(['vendor-a', 'vendor-b']))
})
