import type {
  BriefingContentType,
  BriefingReport,
  ClaimStatus,
  Evidence,
  Freshness,
  PriceObservation,
  PricePromotion,
  Recurrence,
  SourceRun,
  SourceRunStatus,
  Topic,
  TrustTier,
} from './types'

export const BRIEFING_CACHE_KEY = 'signalroom.saved-report.v1'
const CACHE_VERSION = 1

const CONTENT_TYPES = new Set<BriefingContentType>(['product_update', 'price_change', 'discount_offer', 'setup_tip', 'community_opinion'])
const CLAIM_STATUSES = new Set<ClaimStatus>(['confirmed', 'reported', 'disputed', 'expired'])
const FRESHNESS_VALUES = new Set<Freshness>(['fresh', 'aging', 'stale'])
const TRUST_TIERS = new Set<TrustTier>(['primary', 'maintainer', 'independent', 'community'])
const SOURCE_RUN_STATUSES = new Set<SourceRunStatus>(['ok', 'partial', 'error'])
const CONFIDENCE_VALUES = new Set<Topic['confidence']>(['High confidence', 'Mixed signal', 'Early signal'])
const BILLING_PERIODS = new Set<PriceObservation['billingPeriod']>(['month', 'year', 'one_time', 'usage'])
const TAX_MODES = new Set<PriceObservation['taxMode']>(['included', 'excluded', 'unknown'])
const PROMOTION_KINDS = new Set<NonNullable<PricePromotion>['kind']>(['discount', 'trial', 'introductory'])

interface StorageReader { getItem(key: string): string | null }
interface StorageWriter { setItem(key: string, value: string): void }

export interface BriefingGroup {
  id: 'product-updates' | 'pricing-offers' | 'setup-tips' | 'community-patterns' | 'legacy-signals'
  title: string
  description: string
  topics: Topic[]
}

export interface PriceChangeView {
  key: string
  kind: 'change' | 'first-observed'
  current: PriceObservation
  previous?: PriceObservation
  percentChange?: number
}

export interface SourceHealthSummary {
  available: boolean
  total: number
  ok: number
  partial: number
  error: number
  checkedAt: string | null
}

export function normalizeLiveReport(input: unknown): BriefingReport | null {
  if (!isRecord(input)) return null
  const date = calendarDate(input.date)
  const generatedAt = isoDate(input.generatedAt)
  if (!date || !generatedAt || !Array.isArray(input.topics)) return null

  const topics: Topic[] = []
  for (const item of input.topics) {
    const normalized = normalizeTopic(item)
    if (!normalized) return null
    topics.push(normalized)
  }
  if (new Set(topics.map((topic) => topic.id)).size !== topics.length) return null

  if (input.priceSnapshots !== undefined && !Array.isArray(input.priceSnapshots)) return null
  const priceSnapshots: PriceObservation[] = []
  if (Array.isArray(input.priceSnapshots)) {
    for (const item of input.priceSnapshots) {
      const normalized = normalizePriceObservation(item)
      if (!normalized) return null
      priceSnapshots.push(normalized)
    }
  }

  if (input.sourceRuns !== undefined && input.sourceRuns !== null && !Array.isArray(input.sourceRuns)) return null
  let sourceRuns: SourceRun[] | null = null
  if (Array.isArray(input.sourceRuns)) {
    sourceRuns = []
    for (const item of input.sourceRuns) {
      const normalized = normalizeSourceRun(item)
      if (!normalized) return null
      sourceRuns.push(normalized)
    }
  }

  return { date, generatedAt, topics, priceSnapshots, sourceRuns }
}

export function groupBriefingTopics(topics: Topic[]): BriefingGroup[] {
  const definitions: Array<Omit<BriefingGroup, 'topics'> & { accepts: (type: BriefingContentType | undefined) => boolean }> = [
    { id: 'product-updates', title: 'Product updates', description: 'Launches, releases, and official product changes.', accepts: (type) => type === 'product_update' },
    { id: 'pricing-offers', title: 'Pricing & offers', description: 'Verified subscription changes, discounts, and promotions.', accepts: (type) => type === 'price_change' || type === 'discount_offer' },
    { id: 'setup-tips', title: 'Setup tips', description: 'Practical installation, configuration, and workflow guidance.', accepts: (type) => type === 'setup_tip' },
    { id: 'community-patterns', title: 'Community patterns', description: 'Opinions that recur across authors, publishers, and days.', accepts: (type) => type === 'community_opinion' },
    { id: 'legacy-signals', title: 'Legacy signals', description: 'Earlier signals kept visible without a guessed briefing type.', accepts: (type) => type === undefined },
  ]
  return definitions
    .map(({ accepts, ...definition }) => ({ ...definition, topics: topics.filter((topic) => accepts(topic.contentType)) }))
    .filter((group) => group.topics.length > 0)
}

export function priceChangeView(topic: Topic, observations: PriceObservation[]): PriceChangeView[] {
  const keys = [...new Set(topic.priceKeys ?? [])]
  const changes: PriceChangeView[] = []
  for (const key of keys) {
    const ordered = observations
      .filter((observation) => observation.key === key)
      .sort(comparePriceObservations)
    const current = ordered[0]
    if (!current) continue
    const currentSignature = priceObservationSignature(current)
    const previous = ordered.find((candidate) => compatiblePriceDimensions(current, candidate) && priceObservationSignature(candidate) !== currentSignature)
    if (!previous) {
      changes.push({ key, kind: 'first-observed', current })
      continue
    }
    const percentChange = previous.amountMinor === 0 || previous.amountMinor === current.amountMinor
      ? undefined
      : Math.round(((current.amountMinor - previous.amountMinor) / previous.amountMinor) * 1000) / 10
    changes.push({ key, kind: 'change', current, previous, ...(percentChange === undefined ? {} : { percentChange }) })
  }
  return changes
}

export function sourceHealthSummary(sourceRuns: SourceRun[] | null): SourceHealthSummary {
  if (sourceRuns === null) return { available: false, total: 0, ok: 0, partial: 0, error: 0, checkedAt: null }
  const checkedAt = sourceRuns
    .map((run) => run.checkedAt)
    .filter((value): value is string => value !== undefined)
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null
  return {
    available: true,
    total: sourceRuns.length,
    ok: sourceRuns.filter((run) => run.status === 'ok').length,
    partial: sourceRuns.filter((run) => run.status === 'partial').length,
    error: sourceRuns.filter((run) => run.status === 'error').length,
    checkedAt,
  }
}

export function topicDisclosureIds(topicId: string) {
  const normalized = topicId.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const slug = normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'signal'
  const hash = stableHash(topicId)
  const base = `topic-${slug}-${hash}`
  return { buttonId: `${base}-toggle`, panelId: `${base}-panel` }
}

export function readCachedReport(storage: StorageReader): BriefingReport | null {
  try {
    const raw = storage.getItem(BRIEFING_CACHE_KEY)
    if (!raw) return null
    const envelope: unknown = JSON.parse(raw)
    if (!isRecord(envelope) || envelope.version !== CACHE_VERSION) return null
    return normalizeLiveReport(envelope.report)
  } catch {
    return null
  }
}

export function writeCachedReport(storage: StorageWriter, input: unknown): boolean {
  const report = normalizeLiveReport(input)
  if (!report) return false
  try {
    storage.setItem(BRIEFING_CACHE_KEY, JSON.stringify({ version: CACHE_VERSION, report }))
    return true
  } catch {
    return false
  }
}

function normalizeTopic(input: unknown): Topic | null {
  if (!isRecord(input)) return null
  const id = requiredText(input.id)
  const rank = nonNegativeInteger(input.rank, false)
  const section = input.section === 'crypto' || input.section === 'ai' ? input.section : null
  const title = requiredText(input.title)
  const summary = requiredText(input.summary)
  const signal = requiredText(input.signal)
  const confidence = typeof input.confidence === 'string' && CONFIDENCE_VALUES.has(input.confidence as Topic['confidence']) ? input.confidence as Topic['confidence'] : null
  if (!id || rank === null || rank < 1 || !section || !title || !summary || !signal || !confidence || !Array.isArray(input.sources) || !Array.isArray(input.evidence)) return null

  const sources = uniqueTextArray(input.sources)
  if (!sources) return null
  const evidence: Evidence[] = []
  for (const item of input.evidence) {
    const normalized = normalizeEvidence(item)
    if (!normalized) return null
    evidence.push(normalized)
  }
  if (evidence.length === 0) return null

  const contentType = optionalEnum(input.contentType, CONTENT_TYPES)
  const status = optionalEnum(input.status, CLAIM_STATUSES)
  const freshness = optionalEnum(input.freshness, FRESHNESS_VALUES)
  const lastVerifiedAt = optionalIsoDate(input.lastVerifiedAt)
  const priceKeys = input.priceKeys === undefined ? undefined : uniqueTextArray(input.priceKeys)
  const recurrence = input.recurrence === undefined ? undefined : normalizeRecurrence(input.recurrence)
  if (contentType === null || status === null || freshness === null || lastVerifiedAt === null || priceKeys === null || recurrence === null) return null

  const explicitIndependentCount = input.independentSourceCount === undefined ? undefined : nonNegativeInteger(input.independentSourceCount)
  if (input.independentSourceCount !== undefined && explicitIndependentCount === null) return null
  const evidenceIdentities = evidence.map((item) => item.publisherId || item.independenceKey || item.sourceKey).filter((value): value is string => Boolean(value))
  const independentSourceCount = explicitIndependentCount ?? (evidenceIdentities.length ? new Set(evidenceIdentities).size : undefined)

  return {
    id, rank, section, title, summary, signal, sources, confidence, evidence,
    ...(contentType === undefined ? {} : { contentType }),
    ...(status === undefined ? {} : { status }),
    ...(freshness === undefined ? {} : { freshness }),
    ...(lastVerifiedAt === undefined ? {} : { lastVerifiedAt }),
    ...(priceKeys === undefined ? {} : { priceKeys }),
    ...(recurrence === undefined ? {} : { recurrence }),
    ...(independentSourceCount === undefined ? {} : { independentSourceCount }),
  }
}

function normalizeEvidence(input: unknown): Evidence | null {
  if (!isRecord(input)) return null
  const source = requiredText(input.source)
  const label = requiredText(input.label)
  const author = requiredText(input.author)
  const excerpt = typeof input.excerpt === 'string' ? input.excerpt.trim() : null
  const time = requiredText(input.time)
  const url = safeHttpUrl(input.url)
  if (!source || !label || !author || excerpt === null || !time || !url) return null
  const sourceKey = optionalText(input.sourceKey)
  const publisherId = optionalText(input.publisherId)
  const independenceKey = optionalText(input.independenceKey)
  const trustTier = optionalEnum(input.trustTier, TRUST_TIERS)
  const contentHash = optionalText(input.contentHash)
  if (sourceKey === null || publisherId === null || independenceKey === null || trustTier === null || contentHash === null) return null
  return {
    source, label, author, excerpt, time, url,
    ...(sourceKey === undefined ? {} : { sourceKey }),
    ...(publisherId === undefined ? {} : { publisherId }),
    ...(independenceKey === undefined ? {} : { independenceKey }),
    ...(trustTier === undefined ? {} : { trustTier }),
    ...(contentHash === undefined ? {} : { contentHash }),
  }
}

function normalizeRecurrence(input: unknown): Recurrence | null {
  if (!isRecord(input)) return null
  const authorCount = nonNegativeInteger(input.authorCount)
  const publisherCount = nonNegativeInteger(input.publisherCount)
  const mentionCount = nonNegativeInteger(input.mentionCount)
  const firstSeenAt = isoDate(input.firstSeenAt)
  const lastSeenAt = isoDate(input.lastSeenAt)
  const windowHours = nonNegativeInteger(input.windowHours, false)
  if (authorCount === null || publisherCount === null || mentionCount === null || !firstSeenAt || !lastSeenAt || windowHours === null || windowHours < 1) return null
  return { authorCount, publisherCount, mentionCount, firstSeenAt, lastSeenAt, windowHours }
}

function normalizePriceObservation(input: unknown): PriceObservation | null {
  if (!isRecord(input)) return null
  const key = requiredText(input.key)
  const vendor = requiredText(input.vendor)
  const product = requiredText(input.product)
  const plan = requiredText(input.plan)
  const region = requiredText(input.region)
  const currency = requiredText(input.currency)
  const amountMinor = nonNegativeInteger(input.amountMinor)
  const billingPeriod = typeof input.billingPeriod === 'string' && BILLING_PERIODS.has(input.billingPeriod as PriceObservation['billingPeriod']) ? input.billingPeriod as PriceObservation['billingPeriod'] : null
  const unit = requiredText(input.unit)
  const taxMode = typeof input.taxMode === 'string' && TAX_MODES.has(input.taxMode as PriceObservation['taxMode']) ? input.taxMode as PriceObservation['taxMode'] : null
  const observedAt = isoDate(input.observedAt)
  const lastVerifiedAt = isoDate(input.lastVerifiedAt)
  const sourceUrl = safeHttpUrl(input.sourceUrl)
  const sourceKey = requiredText(input.sourceKey)
  const publisherId = requiredText(input.publisherId)
  const trustTier = input.trustTier === 'primary' || input.trustTier === 'maintainer' ? input.trustTier : null
  const contentHash = requiredText(input.contentHash)
  const promotion = input.promotion === undefined ? undefined : normalizePromotion(input.promotion)
  if (!key || !vendor || !product || !plan || !region || !currency || amountMinor === null || !billingPeriod || !unit || !taxMode || !observedAt || !lastVerifiedAt || !sourceUrl || !sourceKey || !publisherId || !trustTier || !contentHash || promotion === null) return null
  return { key, vendor, product, plan, region, currency, amountMinor, billingPeriod, unit, taxMode, observedAt, lastVerifiedAt, sourceUrl, sourceKey, publisherId, trustTier, contentHash, ...(promotion === undefined ? {} : { promotion }) }
}

function normalizePromotion(input: unknown): PricePromotion | null {
  if (!isRecord(input)) return null
  const kind = typeof input.kind === 'string' && PROMOTION_KINDS.has(input.kind as PricePromotion['kind']) ? input.kind as PricePromotion['kind'] : null
  const label = requiredText(input.label)
  const originalAmountMinor = input.originalAmountMinor === undefined ? undefined : nonNegativeInteger(input.originalAmountMinor)
  const endsAt = optionalIsoDate(input.endsAt)
  if (!kind || !label || originalAmountMinor === null || endsAt === null) return null
  return { kind, label, ...(originalAmountMinor === undefined ? {} : { originalAmountMinor }), ...(endsAt === undefined ? {} : { endsAt }) }
}

function normalizeSourceRun(input: unknown): SourceRun | null {
  if (!isRecord(input)) return null
  const source = requiredText(input.source) || requiredText(input.sourceId)
  if (!source) return null
  const explicitStatus = typeof input.status === 'string' && SOURCE_RUN_STATUSES.has(input.status as SourceRunStatus) ? input.status as SourceRunStatus : undefined
  const warningInputs = Array.isArray(input.warnings)
    ? input.warnings
    : input.warnings !== undefined
      ? [input.warnings]
      : input.warning === undefined ? [] : [input.warning]
  const warnings = warningInputs.map((warning) => safeSourceCopy(warning, 'Source returned a warning.')).filter((warning): warning is string => Boolean(warning))
  const status = explicitStatus ?? (input.ok === false || input.error !== undefined ? 'error' : warnings.length ? 'partial' : input.ok === true ? 'ok' : undefined)
  if (!status) return null
  const kind = optionalText(input.kind)
  const checkedAt = optionalIsoDate(input.checkedAt)
  if (kind === null || checkedAt === null) return null
  const count = nonNegativeInteger(input.count) ?? 0
  const error = status === 'error' ? safeSourceCopy(input.error, 'Source check failed.') ?? 'Source check failed.' : undefined
  return { source, status, count, warnings, ...(kind === undefined ? {} : { kind }), ...(checkedAt === undefined ? {} : { checkedAt }), ...(error === undefined ? {} : { error }) }
}

function compatiblePriceDimensions(left: PriceObservation, right: PriceObservation) {
  return left.key === right.key
    && left.vendor === right.vendor
    && left.product === right.product
    && left.plan === right.plan
    && left.region === right.region
    && left.currency === right.currency
    && left.billingPeriod === right.billingPeriod
    && left.unit === right.unit
    && left.taxMode === right.taxMode
}

function priceObservationSignature(observation: PriceObservation) {
  const promotion = observation.promotion
  return JSON.stringify([
    observation.amountMinor,
    promotion?.kind ?? null,
    promotion?.label ?? null,
    promotion?.originalAmountMinor ?? null,
    promotion?.endsAt ?? null,
  ])
}

function comparePriceObservations(left: PriceObservation, right: PriceObservation) {
  const verifiedDifference = Date.parse(right.lastVerifiedAt) - Date.parse(left.lastVerifiedAt)
  if (verifiedDifference !== 0) return verifiedDifference
  const observedDifference = Date.parse(right.observedAt) - Date.parse(left.observedAt)
  if (observedDifference !== 0) return observedDifference
  const leftSignature = priceObservationSignature(left)
  const rightSignature = priceObservationSignature(right)
  return leftSignature < rightSignature ? -1 : leftSignature > rightSignature ? 1 : 0
}

function safeSourceCopy(value: unknown, fallback: string): string | undefined {
  if (typeof value !== 'string') return value === undefined ? undefined : fallback
  const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text) return undefined
  if (/^[<{[]/.test(text) || /(?:response\s*body|authorization|bearer\s+|set-cookie|cookie\s*:|password\s*[=:]|(?:client[_ -]?)?secret\s*[=:]|session(?:id)?\s*[=:]|api[-_ ]?key|token\s*[=:]|private[-_ ]?key\s*[=:])/i.test(text)) return fallback
  const withoutUrls = text.replace(/https?:\/\/\S+/gi, '[link removed]')
  return withoutUrls.slice(0, 160)
}

function stableHash(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function optionalText(value: unknown): string | undefined | null {
  if (value === undefined) return undefined
  return requiredText(value)
}

function uniqueTextArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const texts = value.map(requiredText)
  if (texts.some((item) => item === null)) return null
  return [...new Set(texts as string[])]
}

function isoDate(value: unknown) {
  const text = requiredText(value)
  return text && Number.isFinite(Date.parse(text)) ? text : null
}

function calendarDate(value: unknown) {
  const text = requiredText(value)
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null
  const parsed = new Date(`${text}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text ? text : null
}

function optionalIsoDate(value: unknown): string | undefined | null {
  if (value === undefined) return undefined
  return isoDate(value)
}

function nonNegativeInteger(value: unknown, allowZero = true) {
  return typeof value === 'number' && Number.isSafeInteger(value) && (allowZero ? value >= 0 : value > 0) ? value : null
}

function safeHttpUrl(value: unknown) {
  const text = requiredText(value)
  if (!text) return null
  try {
    const url = new URL(text)
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password ? url.toString() : null
  } catch {
    return null
  }
}

function optionalEnum<T extends string>(value: unknown, allowed: Set<T>): T | undefined | null {
  if (value === undefined) return undefined
  return typeof value === 'string' && allowed.has(value as T) ? value as T : null
}
