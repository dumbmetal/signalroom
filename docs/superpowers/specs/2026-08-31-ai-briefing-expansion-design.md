# AI Briefing Expansion Design

**Status:** Approved for implementation on 2026-08-31

## Goal

Extend Signalroom from a repeated-conversation report into an evidence-first AI briefing with four lanes:

1. AI product launches and updates
2. Subscription price changes and discounts for ChatGPT, Claude, and local-LLM tools
3. Practical setup tips
4. Recurring community opinions

PR 1 (`feat/briefing-evidence-contract`) is the common base. It already separates display labels from independent publishers and prevents exact copied posts from becoming false corroboration.

## Delivery shape

The expansion is delivered as three stacked PRs developed in isolated worktrees:

- PR 2: official sources and price observations
- PR 3: classification, near-duplicate handling, recurrence, and trust decisions
- PR 4: four-lane briefing UI, offline fallback, and source-health presentation

The branches may be implemented concurrently, but the final review order is PR 2, PR 3 rebased on PR 2, then PR 4 rebased on PR 3. Deployment and merging to `main` remain manual review steps.

## Shared report contract

Existing fields remain valid. New fields are optional so stored reports and imported reports continue to render.

```ts
type BriefingContentType =
  | 'product_update'
  | 'price_change'
  | 'discount_offer'
  | 'setup_tip'
  | 'community_opinion'

type ClaimStatus = 'confirmed' | 'reported' | 'disputed' | 'expired'
type Freshness = 'fresh' | 'aging' | 'stale'

interface PriceObservation {
  key: string
  vendor: string
  product: string
  plan: string
  region: 'KR' | 'US' | string
  currency: 'KRW' | 'USD' | string
  amountMinor: number
  billingPeriod: 'month' | 'year' | 'one_time' | 'usage'
  unit: string
  taxMode: 'included' | 'excluded' | 'unknown'
  observedAt: string
  lastVerifiedAt: string
  sourceUrl: string
  sourceKey: string
  publisherId: string
  trustTier: 'primary' | 'maintainer'
  contentHash: string
  promotion?: {
    kind: 'discount' | 'trial' | 'introductory'
    label: string
    originalAmountMinor?: number
    endsAt?: string
  }
}

interface Recurrence {
  authorCount: number
  publisherCount: number
  mentionCount: number
  firstSeenAt: string
  lastSeenAt: string
  windowHours: number
}
```

Reports may add `priceSnapshots?: PriceObservation[]`. Topics may add `contentType`, `status`, `freshness`, `lastVerifiedAt`, `priceKeys?: string[]`, and `recurrence?: Recurrence`.

For each price key, a report retains at most the two newest distinct observations. Seeing the same value again updates `lastVerifiedAt`; it does not create a fake change. Region, currency, billing period, and unit are part of the key and are never compared across one another.

## PR 2: official collection and prices

PR 2 adds an allowlisted source catalog rather than accepting arbitrary URLs. Supported source kinds are `OfficialFeed`, `OfficialPage`, and `OfficialPricing`; transport details remain internal to the catalog.

Initial source families are official OpenAI/ChatGPT, Anthropic/Claude, Google Gemini, Ollama, llama.cpp, LM Studio, and Open WebUI release or pricing surfaces. A source is enabled only after its current official endpoint and parser contract are verified. KRW is never inferred from USD with an exchange rate. If an official KRW value is unavailable, the KR source reports a safe partial/error state.

RSS, Atom, JSON Feed, and GitHub release feeds share a parser. Pricing extraction is vendor-specific and fixture-tested because pricing HTML is more fragile. Redirects must stay on the catalog allowlist. Arbitrary user URLs, private-network targets, response bodies, tokens, and cookies never enter error output.

All sources run independently. A source may be `ok`, `partial`, or `error`; successful messages and prices survive failures elsewhere. Zero extracted prices from a pricing page is parser drift, not a successful empty result.

## PR 3: editorial decisions

Classification is deterministic first and model-assisted only as an optional summary enhancement:

- Official pricing observations produce `price_change` or `discount_offer`.
- Official release feeds and changelogs default to `product_update`.
- Documentation/configuration/install patterns may produce `setup_tip`.
- Recurring community clusters produce `community_opinion` only after recurrence thresholds are met.

The core corroboration rule stays intact:

- `confirmed`: at least two independent publishers support the claim.
- `reported`: a primary or maintainer source reports it, but it lacks independent corroboration.
- `disputed`: current independent evidence contains an explicit conflict.
- `expired`: a promotion has ended or the claim is no longer current.

A single official page can therefore appear as an explicitly labelled report, but it is never described as independently confirmed.

Near-duplicate detection is conservative. Exact normalized copies remain collapsed by PR 1. High token overlap collapses items only within the same publisher; similar items from different publishers remain evidence for a cluster. Topic recurrence uses stable fingerprints across a rolling history, with community promotion requiring at least three authors, two independent publishers, and two observation days inside seven days. Counts are derived from evidence, not invented by a model.

Default freshness windows are content-specific: prices/discounts 3 days fresh and 14 days aging, product updates 7/30 days, setup tips 30/90 days, and community patterns 7/30 days. An explicit promotion end date overrides the generic window.

## PR 4: briefing experience

The existing editorial list remains; no generic SaaS card grid is introduced. AI topics are grouped in a fixed order:

1. Product updates
2. Pricing & offers
3. Setup tips
4. Community patterns

Legacy topics without `contentType` remain visible in a separate legacy section and are not guessed into a lane.

Topic rows expose content type, claim status, freshness, confidence, independent source count, and last verification time. Price topics show before/now only when observations share key dimensions. First observations say “First observed”; incompatible currencies or periods never get a percentage comparison. Community topics show author, publisher, mention, and time-window counts.

The client validates incoming report shapes and normalizes both `source` and `sourceId` source-run formats. The last valid report is stored in a versioned `localStorage` entry. A failed live request shows that saved report with its generation time; it does not replace it with an empty array.

Keyboard expansion uses `aria-expanded` and `aria-controls`, focus remains visible, mobile targets are at least 44px, and reduced-motion settings are respected.

## Verification

Every behavior change follows red-green-refactor with network fixtures. Each PR runs `pnpm --ignore-workspace test` and `pnpm --ignore-workspace build`. PR 4 additionally requires browser checks at 1440px and 390px, keyboard-only expansion, offline fallback, partial-source failure, and reduced motion.

No PR claims live deployment. Live crawl validation is separate from fixture tests, build success, and browser rendering.
