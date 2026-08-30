import test from 'node:test'
import assert from 'node:assert/strict'
import { claimStatusFor, classifyContent, enrichTopic, freshnessFor } from '../shared/briefing-quality.mjs'

const DAY = 86_400_000
const NOW = new Date('2026-08-31T12:00:00.000Z')

function evidence(publisherId, overrides = {}) {
  return {
    source: 'OfficialFeed',
    label: publisherId,
    author: publisherId,
    excerpt: `${publisherId} independently describes the change`,
    time: '2026-08-31T08:00:00.000Z',
    url: `https://${publisherId}.example/change`,
    sourceKey: `${publisherId}-feed`,
    publisherId,
    independenceKey: publisherId,
    trustTier: 'independent',
    contentHash: `hash-${publisherId}`,
    ...overrides,
  }
}

test('classifies all five briefing content types deterministically', () => {
  const recurrence = { authorCount: 3, publisherCount: 2, mentionCount: 4, observationDayCount: 2, firstSeenAt: '2026-08-27T08:00:00.000Z', lastSeenAt: '2026-08-31T08:00:00.000Z', windowHours: 96 }
  const cases = [
    {
      name: 'official price metadata',
      topic: { priceKeys: ['chatgpt-plus-usd-month'], evidence: [evidence('openai', { source: 'OfficialPricing', trustTier: 'primary' })] },
      context: { priceSnapshots: [{ key: 'chatgpt-plus-usd-month', amountMinor: 2000 }] },
      expected: 'price_change',
    },
    {
      name: 'official discount metadata',
      topic: { priceKeys: ['claude-pro-usd-month'], evidence: [evidence('anthropic', { source: 'OfficialPricing', trustTier: 'primary' })] },
      context: { priceSnapshots: [{ key: 'claude-pro-usd-month', amountMinor: 1700, promotion: { kind: 'discount', label: 'Annual offer' } }] },
      expected: 'discount_offer',
    },
    {
      name: 'official release feed',
      topic: { evidence: [evidence('ollama', { source: 'OfficialFeed', trustTier: 'maintainer', excerpt: 'Ollama v0.14 release notes and changelog' })] },
      expected: 'product_update',
    },
    {
      name: 'documentation setup guidance',
      topic: { evidence: [evidence('open-webui-docs', { source: 'OfficialPage', trustTier: 'maintainer', excerpt: 'How to install and configure Open WebUI with Ollama' })] },
      expected: 'setup_tip',
    },
    {
      name: 'qualified recurring community pattern',
      topic: { evidence: [evidence('reddit'), evidence('forum')], recurrence },
      expected: 'community_opinion',
    },
  ]

  for (const { name, topic, context, expected } of cases) {
    assert.equal(classifyContent(topic, context), expected, name)
  }
})

test('does not classify one-off community chatter as a recurring opinion', () => {
  const recurrence = { authorCount: 2, publisherCount: 2, mentionCount: 2, observationDayCount: 1, firstSeenAt: '2026-08-31T08:00:00.000Z', lastSeenAt: '2026-08-31T09:00:00.000Z', windowHours: 1 }
  assert.equal(classifyContent({ evidence: [evidence('reddit'), evidence('forum')], recurrence }), null)
})

test('reports a single primary claim and confirms only independent corroboration', () => {
  const primary = evidence('openai', { trustTier: 'primary', contentHash: 'primary-account' })
  assert.equal(claimStatusFor({ evidence: [primary] }, { now: NOW }), 'reported')
  assert.equal(claimStatusFor({ evidence: [primary, evidence('independent-news')] }, { now: NOW }), 'confirmed')
  assert.equal(claimStatusFor({ evidence: [primary, evidence('openai-blog', { independenceKey: 'openai', publisherId: 'openai' })] }, { now: NOW }), 'reported')
})

test('expired promotion overrides corroboration and generic freshness', () => {
  const topic = { priceKeys: ['chatgpt-plus-offer'], evidence: [evidence('openai', { trustTier: 'primary' }), evidence('independent-news')] }
  const priceSnapshots = [{ key: 'chatgpt-plus-offer', lastVerifiedAt: '2026-08-31T10:00:00.000Z', promotion: { kind: 'discount', label: 'Launch offer', endsAt: '2026-08-31T11:59:59.000Z' } }]
  assert.equal(claimStatusFor(topic, { now: NOW, priceSnapshots }), 'expired')
  assert.equal(freshnessFor('discount_offer', '2026-08-31T10:00:00.000Z', { now: NOW, promotionEndsAt: priceSnapshots[0].promotion.endsAt }), 'stale')
})

test('uses inclusive content-specific freshness boundaries', () => {
  const cases = [
    ['price_change', 3, 14],
    ['discount_offer', 3, 14],
    ['product_update', 7, 30],
    ['setup_tip', 30, 90],
    ['community_opinion', 7, 30],
  ]

  for (const [contentType, freshDays, agingDays] of cases) {
    const atFreshBoundary = new Date(NOW.getTime() - freshDays * DAY).toISOString()
    const afterFreshBoundary = new Date(NOW.getTime() - freshDays * DAY - 1).toISOString()
    const atAgingBoundary = new Date(NOW.getTime() - agingDays * DAY).toISOString()
    const afterAgingBoundary = new Date(NOW.getTime() - agingDays * DAY - 1).toISOString()
    assert.equal(freshnessFor(contentType, atFreshBoundary, { now: NOW }), 'fresh', `${contentType} fresh boundary`)
    assert.equal(freshnessFor(contentType, afterFreshBoundary, { now: NOW }), 'aging', `${contentType} aging start`)
    assert.equal(freshnessFor(contentType, atAgingBoundary, { now: NOW }), 'aging', `${contentType} aging boundary`)
    assert.equal(freshnessFor(contentType, afterAgingBoundary, { now: NOW }), 'stale', `${contentType} stale start`)
  }
})

test('enriches a classifiable topic without replacing editorial text or evidence', () => {
  const topic = {
    id: 'release',
    title: 'Original title',
    summary: 'Original summary',
    evidence: [
      evidence('ollama', { source: 'OfficialFeed', trustTier: 'maintainer', excerpt: 'Ollama v0.14 release changelog', time: '2026-08-30T12:00:00.000Z' }),
    ],
  }
  const enriched = enrichTopic(topic, { now: NOW })
  assert.equal(enriched.contentType, 'product_update')
  assert.equal(enriched.status, 'reported')
  assert.equal(enriched.freshness, 'fresh')
  assert.equal(enriched.lastVerifiedAt, '2026-08-30T12:00:00.000Z')
  assert.equal(enriched.title, topic.title)
  assert.equal(enriched.summary, topic.summary)
  assert.deepEqual(enriched.evidence, topic.evidence)
})
