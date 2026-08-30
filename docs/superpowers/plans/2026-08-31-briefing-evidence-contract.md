# Briefing Evidence Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make source provenance and independent corroboration explicit in both the local Node pipeline and Cloudflare Worker while preserving existing reports.

**Architecture:** Add a dependency-free shared JavaScript contract that normalizes source identity, canonical URLs, text fingerprints, and evidence metadata. The Node service and Worker annotate collected messages with that contract, then use `independenceKey` rather than the UI-facing source label to qualify and score corroboration.

**Tech Stack:** Node 26 ESM tests, Cloudflare Worker TypeScript, Vite/React TypeScript.

---

### Task 1: Define and prove the portable evidence contract

**Files:**
- Create: `shared/briefing-contract.mjs`
- Create: `server/briefing-contract.test.mjs`

- [x] **Step 1: Write the failing contract tests**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { canonicalizeUrl, annotateMessage, normalizeSourceDefinition } from '../shared/briefing-contract.mjs'

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
```

- [x] **Step 2: Run the test to verify it fails for the missing module**

Run: `node --test server/briefing-contract.test.mjs`

Expected: `ERR_MODULE_NOT_FOUND` for `shared/briefing-contract.mjs`.

- [x] **Step 3: Implement the minimal shared contract**

```js
export const BRIEFING_CONTENT_TYPES = ['product_update', 'price_change', 'discount_offer', 'setup_tip', 'community_opinion']
export const TRUST_TIERS = ['primary', 'maintainer', 'independent', 'community']
export const CLAIM_STATUSES = ['confirmed', 'reported', 'disputed', 'expired']

const TRACKING_PARAMETER = /^(utm_|fbclid$|gclid$|mc_[ce]id$)/i
export function canonicalizeUrl(value) {
  if (!value) return ''
  try {
    const url = new URL(value)
    url.protocol = url.protocol.toLowerCase()
    url.hostname = url.hostname.toLowerCase()
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) if (TRACKING_PARAMETER.test(key)) url.searchParams.delete(key)
    const pathname = url.pathname.replace(/\/+$/, '') || '/'
    return `${url.protocol}//${url.host}${pathname === '/' ? '' : pathname}${url.search}`
  } catch { return String(value).trim() }
}
export function fingerprintText(value) {
  let hash = 2166136261
  for (const character of String(value).toLowerCase().replace(/\s+/g, ' ').trim()) { hash ^= character.codePointAt(0); hash = Math.imul(hash, 16777619) }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`
}
export function normalizeSourceDefinition(source) {
  const sourceKey = String(source.id || `${source.kind}:${source.name}`)
  const publisherId = String(source.publisherId || source.config?.publisherId || sourceKey)
  return { ...source, sourceKey, publisherId, independenceKey: String(source.independenceKey || source.config?.independenceKey || publisherId), trustTier: source.trustTier || source.config?.trustTier || 'community' }
}
export function annotateMessage(message, source) {
  return { ...message, externalId: String(message.externalId || message.id || message.url || fingerprintText(message.text)), sourceKey: source.sourceKey, publisherId: source.publisherId, independenceKey: source.independenceKey, trustTier: source.trustTier, canonicalUrl: canonicalizeUrl(message.url), contentHash: fingerprintText(message.text) }
}
```

- [x] **Step 4: Run the contract test to verify it passes**

Run: `node --test server/briefing-contract.test.mjs`

Expected: 2 passing tests.

### Task 2: Make the local Node pipeline count independent publishers

**Files:**
- Modify: `server/pipeline.mjs`
- Modify: `server/report-service.mjs`
- Modify: `server/pipeline.test.mjs`

- [x] **Step 1: Write the failing independent-corroboration test**

```js
test('does not corroborate two labels belonging to one publisher', () => {
  const clusters = clusterMessages([
    { ...message('1', 'Model price changed today', 'channel-a'), independenceKey: 'vendor-copy' },
    { ...message('2', 'Model price changed today', 'channel-b'), independenceKey: 'vendor-copy' },
  ])
  assert.equal(corroboratedClusters(clusters).length, 0)
})
```

- [x] **Step 2: Run the focused test and verify it fails**

Run: `node --test --test-name-pattern='does not corroborate' server/pipeline.test.mjs`

Expected: assertion failure because the existing code counts `sourceId` labels.

- [x] **Step 3: Annotate adapter messages and replace label counting with independence counting**

```js
import { annotateMessage, normalizeSourceDefinition } from '../shared/briefing-contract.mjs'

const normalizedSource = normalizeSourceDefinition(source)
const messages = (await adapter.fetchSince(source, since)).map((message) => annotateMessage(message, normalizedSource))
const independentKey = (message) => message.independenceKey || `${message.source}:${message.sourceId}`
const sourceCount = new Set(cluster.messages.map(independentKey)).size
export function corroboratedClusters(clusters, minimumSources = 2) {
  return clusters.filter((cluster) => new Set(cluster.messages.map(independentKey)).size >= minimumSources)
}
```

Keep `sources` and visible evidence labels based on `sourceId`. Use `sourceCount` for qualification, rank, confidence, and the signal text.

- [x] **Step 4: Run the focused test and then all Node tests**

Run: `node --test server/*.test.mjs`

Expected: all Node tests pass, including the new independent-corroboration case.

### Task 3: Apply the same contract to the Cloudflare Worker

**Files:**
- Modify: `cloudflare/worker.ts`
- Modify: `cloudflare/worker.test.mjs`

- [x] **Step 1: Write the failing Worker regression test**

```js
test('worker excludes matching posts from one independent publisher', () => {
  const topics = buildTopics([
    { ...post('channel-a', 'MODEL subscription price update', 20, 1), independenceKey: 'vendor-copy' },
    { ...post('channel-b', 'MODEL subscription price update', 19, 2), independenceKey: 'vendor-copy' },
  ])
  assert.equal(topics.length, 0)
})
```

- [x] **Step 2: Run the Worker test and verify it fails**

Run: `node --test --experimental-strip-types --test-name-pattern='one independent publisher' cloudflare/worker.test.mjs`

Expected: assertion failure because `buildTopics` currently filters on `sourceId`.

- [x] **Step 3: Normalize source definitions at ingestion and annotate every fetched post**

```ts
import { annotateMessage, normalizeSourceDefinition } from '../shared/briefing-contract.mjs'

type Message = { source: string; sourceId: string; externalId?: string; sourceKey?: string; publisherId?: string; independenceKey?: string; trustTier?: string; canonicalUrl?: string; contentHash?: string; text: string; url: string; publishedAt: string; engagement: number }

for (const configuredSource of parseSources(env.AI_SOURCES, env.TELEGRAM_SOURCES)) {
  const source = normalizeSourceDefinition(configuredSource)
  const fetched = (await fetchSource(source, env)).map((item) => annotateMessage(item, source))
  const last24Hours = fetched.filter((item) => Date.parse(item.publishedAt) >= Date.now() - 24 * 60 * 60 * 1000)
  messages.push(...last24Hours)
}

const independentKey = (post: Message) => post.independenceKey || `${post.source}:${post.sourceId}`
const independentCount = new Set(cluster.posts.map(independentKey)).size
const evidence = selected.slice(0, limit).map((post) => ({ source: post.source, label: post.sourceId, author: post.sourceId, excerpt: post.text.slice(0, 500), time: relativeTime(post.publishedAt), url: post.url, sourceKey: post.sourceKey, publisherId: post.publisherId, independenceKey: independentKey(post), trustTier: post.trustTier }))
```

Use `independentCount` in the Worker cluster filter, score, confidence, and imported-report filter. Keep the `sources` array and every evidence row keyed by the original display label.

- [x] **Step 4: Run all Worker tests**

Run: `node --test --experimental-strip-types cloudflare/*.test.mjs`

Expected: all Worker tests pass, including the new independent-publisher regression.

### Task 4: Expose the contract vocabulary without changing existing UI behaviour

**Files:**
- Modify: `src/types.ts`
- Modify: `server/server.mjs`
- Create: `server/source-config.mjs`
- Create: `server/source-config.test.mjs`

- [x] **Step 1: Add compile-time vocabulary for future briefing lanes**

```ts
export type BriefingContentType = 'product_update' | 'price_change' | 'discount_offer' | 'setup_tip' | 'community_opinion'
export type TrustTier = 'primary' | 'maintainer' | 'independent' | 'community'
export type ClaimStatus = 'confirmed' | 'reported' | 'disputed' | 'expired'
```

Add optional identity and trust fields to `Evidence` and optional `contentType`, `status`, and `freshness` fields to `Topic`, so existing reports remain valid.

- [x] **Step 2: Permit future source metadata at the local API boundary**

```js
import { safeSourceConfig } from './source-config.mjs'

export function safeSourceConfig(config) {
  const allowed = new Set(['subreddit', 'query', 'userId', 'chatId', 'limit', 'publisherId', 'independenceKey', 'trustTier'])
  return Object.fromEntries(Object.entries(config || {}).filter(([key]) => allowed.has(key)))
}
```

The test must prove that `publisherId`, `independenceKey`, and `trustTier` survive while unapproved fields such as `apiKey` are discarded.

- [x] **Step 3: Verify Node tests and production type-check**

Run: `node --test --experimental-strip-types server/*.test.mjs cloudflare/*.test.mjs && pnpm build`

Expected: tests pass; record any pnpm environment-hook failure separately rather than altering dependency approval settings.

Observed: the direct suite passed. The first `pnpm` attempt was absorbed by `/Users/sungha/pnpm-workspace.yaml` and inspected the unrelated home-level `opencode-ai` dependency. Running Signalroom with `--ignore-workspace` used this repository's frozen lockfile and required no global build-script approval.

### Task 5: Review and checkpoint the PR

**Files:**
- Modify: `.continuity/signalroom-briefing-evidence-contract/current.md`

- [x] **Step 1: Inspect the complete diff for accidental source, secret, or UI changes**

Run: `git diff --check && git diff --stat && git status --short`

Expected: only the evidence contract, tests, plan, and continuity files are changed.

- [x] **Step 2: Run the full direct test suite**

Run: `node --test --experimental-strip-types server/*.test.mjs cloudflare/*.test.mjs`

Expected: all tests pass with no failures.

Observed: 27 tests passed. The suite covers evidence-cap preservation, normalized identity keys, source-config validation, shared fallbacks, configured-source ingestion in both runtimes, exact cross-post rejection, deterministic copy-origin ordering, URL-only legacy reports, markup variants, and the pre-existing London DST window.

- [x] **Step 3: Commit the focused PR branch**

```bash
git add shared/briefing-contract.mjs server cloudflare src/types.ts docs/superpowers/plans .continuity
git commit -m "feat: add briefing evidence contract"
```

Expected: one focused commit on `feat/briefing-evidence-contract`; do not push or open a PR without an explicit request.

Observed: the original focused implementation commit was created locally; review follow-ups remain on the same branch. Nothing has been pushed and no pull request has been opened.

### Task 6: Close review gaps for copied content and baseline coverage

**Files:**
- Modify: `shared/briefing-contract.mjs`
- Modify: `server/pipeline.mjs`
- Modify: `server/pipeline.test.mjs`
- Modify: `server/report-service.test.mjs`
- Modify: `cloudflare/worker.ts`
- Modify: `cloudflare/worker.test.mjs`
- Modify: `src/types.ts`

- [x] **Step 1: Write failing regressions for identical cross-posts**

Run: `node --test --test-name-pattern='identical cross-posts' server/pipeline.test.mjs`

Run: `node --test --experimental-strip-types --test-name-pattern='identical cross-posts' cloudflare/worker.test.mjs`

Observed: both tests failed with `1 !== 0`, proving that different source labels still promoted identical copied text when no manual `independenceKey` was configured.

- [x] **Step 2: Count only distinct publisher and content evidence**

Add `contentHashFor`, `selectIndependentEvidence`, and `countIndependentCorroboration` to the shared contract. Collapse identical content to its earliest published representative before counting publishers, then use the shared count for Node and Worker qualification, ranking, confidence, signals, evidence metadata, and imported-report normalization.

- [x] **Step 3: Restore the removed London timezone regression**

Keep the original GMT/BST assertions in `server/report-service.test.mjs` alongside the new service integration test.

- [x] **Step 4: Run repository-isolated verification**

Run: `pnpm install --ignore-workspace --frozen-lockfile --ignore-scripts`

Run: `pnpm --ignore-workspace test`

Run: `pnpm --ignore-workspace build`

Observed: 27 tests passed; TypeScript and Vite production build completed successfully.

- [x] **Step 5: Resolve independent review findings**

Add RED tests for URL-only legacy evidence, equal-time/reversed-order duplicate attribution, and HTML/entity versus plain-text copies. Use canonical URL or evidence identity when text is absent, deterministic URL/source tie-breaking when timestamps match, and shared content normalization before hashing.
