import test from 'node:test'
import assert from 'node:assert/strict'
import {
  claimStatusFor,
  classifyContent,
  dedupeNearDuplicates,
  enrichTopic,
  enrichTopicsWithHistory,
  freshnessFor,
  recurrenceFor,
  topicFingerprint,
  updateTopicHistory,
} from '../shared/briefing-quality.mjs'

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

test('classifies official announcement wording as a product update', () => {
  for (const excerpt of [
    'Introducing the new reasoning model',
    'The desktop app is now available',
    'Anthropic announces a new Claude capability',
    'Open WebUI updated its workspace controls',
  ]) {
    assert.equal(classifyContent({ evidence: [evidence('vendor', { source: 'OfficialFeed', trustTier: 'primary', excerpt })] }), 'product_update', excerpt)
  }
})

test('accepts corroborated community setup guidance but excludes a single community tip', () => {
  const first = evidence('reddit', { source: 'Reddit', trustTier: 'community', excerpt: 'How to configure Ollama context limits on macOS', contentHash: 'setup-reddit' })
  const second = evidence('forum', { source: 'Threads', trustTier: 'community', excerpt: 'Ollama context limit configuration guide for macOS', contentHash: 'setup-forum' })
  assert.equal(classifyContent({ evidence: [first] }), null)
  assert.equal(classifyContent({ evidence: [first, second] }), 'setup_tip')
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

test('collapses markup and case variants from the same publisher', () => {
  const messages = [
    { id: 'first', independenceKey: 'publisher-a', text: '<b>MODEL</b> pricing &amp; annual billing changed', publishedAt: '2026-08-31T08:00:00.000Z' },
    { id: 'second', independenceKey: 'publisher-a', text: 'model pricing & annual billing changed', publishedAt: '2026-08-31T09:00:00.000Z' },
  ]
  assert.deepEqual(dedupeNearDuplicates(messages).map((message) => message.id), ['first'])
})

test('suppresses only high-overlap posts within one publisher', () => {
  const shared = 'Model subscription pricing changed today for enterprise customers in Europe with annual billing'
  const messages = [
    { id: 'a-first', independenceKey: 'publisher-a', text: shared, publishedAt: '2026-08-31T08:00:00.000Z' },
    { id: 'a-near-copy', independenceKey: 'publisher-a', text: `${shared} details`, publishedAt: '2026-08-31T09:00:00.000Z' },
    { id: 'b-independent', independenceKey: 'publisher-b', text: `${shared} independently confirmed`, publishedAt: '2026-08-31T10:00:00.000Z' },
  ]
  assert.deepEqual(dedupeNearDuplicates(messages).map((message) => message.id), ['a-first', 'b-independent'])
})

test('does not collapse short or merely related posts', () => {
  const messages = [
    { id: 'one', independenceKey: 'publisher-a', text: 'Model price rose', publishedAt: '2026-08-31T08:00:00.000Z' },
    { id: 'two', independenceKey: 'publisher-a', text: 'Model price fell', publishedAt: '2026-08-31T09:00:00.000Z' },
  ]
  assert.equal(dedupeNearDuplicates(messages).length, 2)
})

function communityTopic(id, items) {
  return {
    id,
    section: 'ai',
    title: 'Local model memory pressure',
    summary: 'Developers compare local model memory pressure.',
    evidence: items.map(({ publisher, author, text, time, contentHash }) => evidence(publisher, {
      source: 'Reddit',
      trustTier: 'community',
      author,
      excerpt: text,
      time,
      url: `https://${publisher}.example/${contentHash}`,
      contentHash,
    })),
  }
}

test('creates a stable fingerprint across rank, ordering, markup, and extra detail changes', () => {
  const first = communityTopic('ai-1-local-model-memory-pressure', [
    { publisher: 'reddit', author: 'alice', text: 'Local model memory pressure affects long context sessions', time: '2026-08-30T08:00:00.000Z', contentHash: 'a' },
    { publisher: 'forum', author: 'bob', text: 'Long context local model memory pressure is widely reported', time: '2026-08-30T09:00:00.000Z', contentHash: 'b' },
  ])
  const second = communityTopic('ai-9-local-model-memory-pressure', [
    { publisher: 'forum', author: 'bob', text: '<b>Long context</b> local model memory pressure is widely reported with benchmarks', time: '2026-08-31T09:00:00.000Z', contentHash: 'c' },
    { publisher: 'reddit', author: 'alice', text: 'Local model memory pressure affects long context sessions today', time: '2026-08-31T08:00:00.000Z', contentHash: 'd' },
  ])
  assert.equal(topicFingerprint(first), topicFingerprint(second))
})

test('uses an inclusive rolling seven-day recurrence cutoff', () => {
  const now = new Date('2026-08-31T12:00:00.000Z')
  const old = communityTopic('ai-1-local-model-memory-pressure', [{ publisher: 'reddit', author: 'old', text: 'Local model memory pressure old mention', time: '2026-08-23T11:59:59.999Z', contentHash: 'old' }])
  const boundary = communityTopic('ai-2-local-model-memory-pressure', [{ publisher: 'reddit', author: 'boundary', text: 'Local model memory pressure boundary mention', time: '2026-08-24T12:00:00.000Z', contentHash: 'boundary' }])
  const current = communityTopic('ai-3-local-model-memory-pressure', [{ publisher: 'forum', author: 'current', text: 'Local model memory pressure current mention', time: now.toISOString(), contentHash: 'current' }])
  let history = updateTopicHistory([], [old], { now: new Date('2026-08-23T11:59:59.999Z'), reportDate: '2026-08-23' })
  history = updateTopicHistory(history, [boundary], { now: new Date('2026-08-24T12:00:00.000Z'), reportDate: '2026-08-24' })
  history = updateTopicHistory(history, [current], { now, reportDate: '2026-08-31' })
  const recurrence = recurrenceFor(current, history, { now })
  assert.equal(recurrence.mentionCount, 2)
  assert.equal(recurrence.authorCount, 2)
  assert.equal(recurrence.publisherCount, 2)
  assert.equal(recurrence.firstSeenAt, '2026-08-24T12:00:00.000Z')
})

test('derives unique recurrence counts from non-copied evidence across report dates', () => {
  const dayOne = communityTopic('ai-1-local-model-memory-pressure', [
    { publisher: 'reddit', author: 'alice', text: 'Local model memory pressure original observation', time: '2026-08-30T08:00:00.000Z', contentHash: 'original' },
    { publisher: 'forum', author: 'copycat', text: 'Local model memory pressure original observation', time: '2026-08-30T09:00:00.000Z', contentHash: 'original' },
    { publisher: 'reddit', author: 'alice', text: 'Local model memory pressure followup measurement', time: '2026-08-30T10:00:00.000Z', contentHash: 'followup' },
  ])
  const dayTwo = communityTopic('ai-2-local-model-memory-pressure', [
    { publisher: 'forum', author: 'bob', text: 'Local model memory pressure reproduced independently', time: '2026-08-31T08:00:00.000Z', contentHash: 'bob' },
    { publisher: 'reddit', author: 'carol', text: 'Local model memory pressure appears in another runtime', time: '2026-08-31T09:00:00.000Z', contentHash: 'carol' },
  ])
  let history = updateTopicHistory([], [dayOne], { now: new Date('2026-08-30T12:00:00.000Z'), reportDate: '2026-08-30' })
  const result = enrichTopicsWithHistory([dayTwo], history, { now: NOW, reportDate: '2026-08-31' })
  const recurrence = result.topics[0].recurrence
  assert.deepEqual(recurrence, {
    authorCount: 3,
    publisherCount: 2,
    mentionCount: 4,
    firstSeenAt: '2026-08-30T12:00:00.000Z',
    lastSeenAt: '2026-08-31T12:00:00.000Z',
    windowHours: 24,
  })
  assert.equal(result.topics[0].contentType, 'community_opinion')
  assert.equal(result.topics[0].status, 'confirmed')
})

test('rejects a community pattern below the author or multi-day threshold', () => {
  const oneDay = communityTopic('ai-1-local-model-memory-pressure', [
    { publisher: 'reddit', author: 'alice', text: 'Local model memory pressure alpha', time: '2026-08-31T08:00:00.000Z', contentHash: 'alpha' },
    { publisher: 'forum', author: 'bob', text: 'Local model memory pressure beta', time: '2026-08-31T09:00:00.000Z', contentHash: 'beta' },
    { publisher: 'reddit', author: 'carol', text: 'Local model memory pressure gamma', time: '2026-08-31T10:00:00.000Z', contentHash: 'gamma' },
  ])
  const oneDayResult = enrichTopicsWithHistory([oneDay], [], { now: NOW, reportDate: '2026-08-31' })
  assert.equal(oneDayResult.topics[0].contentType, undefined)

  const twoAuthors = communityTopic('ai-2-local-model-memory-pressure', [
    { publisher: 'reddit', author: 'alice', text: 'Local model memory pressure delta', time: '2026-08-30T08:00:00.000Z', contentHash: 'delta' },
  ])
  let history = updateTopicHistory([], [twoAuthors], { now: new Date('2026-08-30T12:00:00.000Z'), reportDate: '2026-08-30' })
  history = updateTopicHistory(history, [communityTopic('ai-3-local-model-memory-pressure', [
    { publisher: 'forum', author: 'bob', text: 'Local model memory pressure epsilon', time: '2026-08-31T08:00:00.000Z', contentHash: 'epsilon' },
  ])], { now: NOW, reportDate: '2026-08-31' })
  assert.equal(classifyContent({ evidence: [], recurrence: recurrenceFor(twoAuthors, history, { now: NOW }) }), null)
})

test('retains compact topic history for at most thirty days', () => {
  const old = communityTopic('ai-1-local-model-memory-pressure', [{ publisher: 'reddit', author: 'old', text: 'Local model memory pressure old', time: '2026-07-31T12:00:00.000Z', contentHash: 'old-30' }])
  const recent = communityTopic('ai-2-local-model-memory-pressure', [{ publisher: 'forum', author: 'recent', text: 'Local model memory pressure recent', time: '2026-08-31T12:00:00.000Z', contentHash: 'recent-30' }])
  let history = updateTopicHistory([], [old], { now: new Date('2026-07-31T12:00:00.000Z'), reportDate: '2026-07-31' })
  history = updateTopicHistory(history, [recent], { now: NOW, reportDate: '2026-08-31' })
  assert.deepEqual(history.map((record) => record.contentHash), ['recent-30'])
})
