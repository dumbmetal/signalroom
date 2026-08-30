import { countIndependentCorroboration, normalizeContentText } from './briefing-contract.mjs'

const DAY = 86_400_000
const CONTENT_TYPES = new Set(['product_update', 'price_change', 'discount_offer', 'setup_tip', 'community_opinion'])
const FRESHNESS_WINDOWS = {
  price_change: [3, 14],
  discount_offer: [3, 14],
  product_update: [7, 30],
  setup_tip: [30, 90],
  community_opinion: [7, 30],
}
const SETUP_PATTERN = /\b(?:how[\s-]?to|install(?:ation|ing|ed)?|configur(?:e|ation|ing|ed)?|set[\s-]?up|setup|getting started|quickstart|guide|docker|environment variable|api key)\b/i
const RELEASE_PATTERN = /\b(?:release(?:d|s| notes?)?|changelog|launch(?:ed|es)?|version\s+v?\d|v\d+(?:\.\d+)+)\b/i

export function classifyContent(topic = {}, context = {}) {
  const evidence = Array.isArray(topic.evidence) ? topic.evidence : []
  const priceSnapshots = matchingPriceSnapshots(topic, context.priceSnapshots)
  const hasPricingMetadata = priceSnapshots.length > 0 || hasSourceKind(evidence, 'OfficialPricing')
  if (hasPricingMetadata) return priceSnapshots.some((snapshot) => snapshot?.promotion) || topic?.promotion ? 'discount_offer' : 'price_change'

  const text = topicText(topic)
  if (SETUP_PATTERN.test(text) && hasOfficialEvidence(evidence)) return 'setup_tip'
  if (RELEASE_PATTERN.test(text) && hasOfficialReleaseEvidence(evidence)) return 'product_update'
  if (qualifiesAsCommunityPattern(topic.recurrence)) return 'community_opinion'
  return null
}

export function claimStatusFor(topic = {}, options = {}) {
  const now = timestamp(options.now ?? Date.now())
  const promotionEndsAt = promotionEndFor(topic, options.priceSnapshots)
  if (promotionEndsAt !== null && promotionEndsAt <= now) return 'expired'
  const evidence = Array.isArray(topic.evidence) ? topic.evidence : []
  if (hasIndependentConflict(topic, evidence)) return 'disputed'
  return countIndependentCorroboration(evidence) >= 2 ? 'confirmed' : 'reported'
}

export function freshnessFor(contentType, lastVerifiedAt, options = {}) {
  const promotionEnd = timestamp(options.promotionEndsAt)
  const now = timestamp(options.now ?? Date.now())
  if (promotionEnd !== null && promotionEnd <= now) return 'stale'
  const verifiedAt = timestamp(lastVerifiedAt)
  const window = FRESHNESS_WINDOWS[contentType]
  if (verifiedAt === null || now === null || !window) return 'stale'
  const age = Math.max(0, now - verifiedAt)
  if (age <= window[0] * DAY) return 'fresh'
  if (age <= window[1] * DAY) return 'aging'
  return 'stale'
}

export function enrichTopic(topic, options = {}) {
  const contentType = classifyContent(topic, options)
  if (!CONTENT_TYPES.has(contentType)) return { ...topic }
  const lastVerifiedAt = lastVerifiedAtFor(topic, options.priceSnapshots)
  const promotionEndsAt = promotionEndFor(topic, options.priceSnapshots)
  return {
    ...topic,
    contentType,
    status: claimStatusFor(topic, options),
    freshness: freshnessFor(contentType, lastVerifiedAt, { now: options.now, promotionEndsAt }),
    ...(lastVerifiedAt ? { lastVerifiedAt } : {}),
  }
}

function matchingPriceSnapshots(topic, priceSnapshots) {
  if (!Array.isArray(priceSnapshots)) return []
  const keys = new Set(Array.isArray(topic?.priceKeys) ? topic.priceKeys.map(String) : [])
  if (!keys.size) return []
  return priceSnapshots.filter((snapshot) => keys.has(String(snapshot?.key || '')))
}

function sourceKindFor(item) {
  return String(item?.sourceKind || item?.kind || item?.officialSourceKind || item?.source || '').toLowerCase()
}

function hasSourceKind(evidence, kind) {
  const expected = kind.toLowerCase()
  return evidence.some((item) => sourceKindFor(item) === expected)
}

function hasOfficialEvidence(evidence) {
  return evidence.some((item) => ['primary', 'maintainer'].includes(String(item?.trustTier || '').toLowerCase()) || sourceKindFor(item).startsWith('official'))
}

function hasOfficialReleaseEvidence(evidence) {
  return evidence.some((item) => sourceKindFor(item) === 'officialfeed' && hasOfficialEvidence([item]))
}

function topicText(topic) {
  return normalizeContentText([
    topic?.title,
    topic?.summary,
    ...(Array.isArray(topic?.evidence) ? topic.evidence.flatMap((item) => [item?.excerpt, item?.text]) : []),
  ].filter(Boolean).join(' '))
}

function qualifiesAsCommunityPattern(recurrence) {
  if (!recurrence || Number(recurrence.authorCount) < 3 || Number(recurrence.publisherCount) < 2) return false
  if (Number(recurrence.observationDayCount) >= 2) return true
  if (Array.isArray(recurrence.reportDates) && new Set(recurrence.reportDates).size >= 2) return true
  const firstDate = londonDate(recurrence.firstSeenAt)
  const lastDate = londonDate(recurrence.lastSeenAt)
  return Boolean(firstDate && lastDate && firstDate !== lastDate)
}

function hasIndependentConflict(topic, evidence) {
  if (topic?.disputed === true || topic?.hasConflict === true) return true
  const conflicts = evidence.filter((item) => item?.disputed === true || item?.conflictsWith || item?.claimStatus === 'disputed')
  return countIndependentCorroboration(conflicts) >= 2
}

function promotionEndFor(topic, priceSnapshots) {
  const direct = timestamp(topic?.promotionEndsAt || topic?.promotion?.endsAt)
  if (direct !== null) return direct
  const ends = matchingPriceSnapshots(topic, priceSnapshots)
    .map((snapshot) => timestamp(snapshot?.promotion?.endsAt))
    .filter((value) => value !== null)
  return ends.length ? Math.min(...ends) : null
}

function lastVerifiedAtFor(topic, priceSnapshots) {
  const candidates = [
    topic?.lastVerifiedAt,
    ...matchingPriceSnapshots(topic, priceSnapshots).flatMap((snapshot) => [snapshot?.lastVerifiedAt, snapshot?.observedAt]),
    ...(Array.isArray(topic?.evidence) ? topic.evidence.flatMap((item) => [item?.publishedAt, item?.observedAt, item?.time]) : []),
  ].map(timestamp).filter((value) => value !== null)
  return candidates.length ? new Date(Math.max(...candidates)).toISOString() : undefined
}

function timestamp(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function londonDate(value) {
  const parsed = timestamp(value)
  if (parsed === null) return ''
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(parsed))
}
