import { canonicalizeUrl, contentHashFor, countIndependentCorroboration, fingerprintText, independenceKeyFor, normalizeContentText, normalizeIdentityKey } from './briefing-contract.mjs'

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
const RELEASE_PATTERN = /\b(?:release(?:d|s| notes?)?|changelog|launch(?:ed|es)?|introduc(?:e|es|ed|ing)|now available|announc(?:e|es|ed|ing)|update(?:d|s)?|version\s+v?\d|v\d+(?:\.\d+)+)\b/i

export function classifyContent(topic = {}, context = {}) {
  const evidence = Array.isArray(topic.evidence) ? topic.evidence : []
  const priceSnapshots = matchingPriceSnapshots(topic, context.priceSnapshots)
  const hasPricingMetadata = priceSnapshots.length > 0 || hasSourceKind(evidence, 'OfficialPricing')
  if (hasPricingMetadata) return priceSnapshots.some((snapshot) => snapshot?.promotion) || topic?.promotion ? 'discount_offer' : 'price_change'

  const text = topicText(topic)
  if (SETUP_PATTERN.test(text) && (hasOfficialEvidence(evidence) || countIndependentCorroboration(evidence) >= 2)) return 'setup_tip'
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
  if (qualifiesAsCommunityPattern(topic.recurrence)) return 'confirmed'
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

export function dedupeNearDuplicates(messages, options = {}) {
  const threshold = Number.isFinite(options.threshold) ? options.threshold : 0.82
  const minimumTokens = Number.isFinite(options.minimumTokens) ? options.minimumTokens : 6
  const kept = []
  for (const message of messages) {
    const normalizedText = duplicateText(message)
    if (!normalizedText) continue
    const publisher = independenceKeyFor(message)
    const tokens = duplicateTokens(normalizedText)
    const canonicalUrl = canonicalizeUrl(message?.canonicalUrl || message?.url)
    const duplicateIndex = kept.findIndex((candidate) => candidate.publisher === publisher && (
      normalizedText === candidate.normalizedText
      || Boolean(canonicalUrl && canonicalUrl === candidate.canonicalUrl)
      || hasHighTokenOverlap(tokens, candidate.tokens, threshold, minimumTokens)
    ))
    if (duplicateIndex < 0) {
      kept.push({ message, publisher, normalizedText, tokens, canonicalUrl })
    } else if (precedesDuplicate(message, kept[duplicateIndex].message)) {
      kept[duplicateIndex] = { message, publisher, normalizedText, tokens, canonicalUrl }
    }
  }
  return kept.map((entry) => entry.message)
}

export function topicFingerprint(topic = {}) {
  const section = String(topic?.section || 'unknown').toLowerCase()
  const idTokens = stableIdTokens(topic?.id)
  if (idTokens.length >= 2) return `topic-${fingerprintText(`${section}:${idTokens.join(':')}`)}`

  const evidence = Array.isArray(topic?.evidence) ? topic.evidence : []
  const tokenCounts = new Map()
  for (const item of evidence) {
    for (const token of fingerprintTokens(item?.excerpt || item?.text || '')) tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1)
  }
  const sharedThreshold = evidence.length >= 2 ? 2 : 1
  let terms = [...tokenCounts.entries()].filter(([, count]) => count >= sharedThreshold)
  if (terms.length < 2) terms = [...tokenCounts.entries()]
  const strongest = terms.sort((left, right) => right[1] - left[1] || compareText(left[0], right[0])).slice(0, 6).map(([term]) => term)
  if (strongest.length) return `topic-${fingerprintText(`${section}:${strongest.join(':')}`)}`
  return `topic-${fingerprintText(`${section}:${normalizeContentText(topic?.title || topic?.summary || topic?.id || 'unknown')}`)}`
}

export function updateTopicHistory(previousHistory, topics, options = {}) {
  const now = dateFrom(options.now ?? Date.now())
  const reportDate = validReportDate(options.reportDate) || londonDate(now)
  const current = (Array.isArray(topics) ? topics : []).flatMap((topic) => historyRecordsForTopic(topic, { now, reportDate }))
  return compactTopicHistory([...(Array.isArray(previousHistory) ? previousHistory : []), ...current], now)
}

export function recurrenceFor(topic, history, options = {}) {
  const now = dateFrom(options.now ?? Date.now())
  const cutoff = now.getTime() - 7 * DAY
  const fingerprint = topicFingerprint(topic)
  const records = compactTopicHistory(history, now).filter((record) => {
    const seenAt = timestamp(record.seenAt)
    return record.fingerprint === fingerprint && seenAt !== null && seenAt >= cutoff && seenAt <= now.getTime()
  })
  if (!records.length) {
    const seenAt = now.toISOString()
    return recurrenceWithObservationDays({ authorCount: 0, publisherCount: 0, mentionCount: 0, firstSeenAt: seenAt, lastSeenAt: seenAt, windowHours: 0 }, 0)
  }
  const seenTimes = records.map((record) => timestamp(record.seenAt)).filter((value) => value !== null)
  const firstSeenAt = Math.min(...seenTimes)
  const lastSeenAt = Math.max(...seenTimes)
  return recurrenceWithObservationDays({
    authorCount: new Set(records.map((record) => record.authorKey).filter(Boolean)).size,
    publisherCount: new Set(records.map((record) => record.publisherId).filter(Boolean)).size,
    mentionCount: records.length,
    firstSeenAt: new Date(firstSeenAt).toISOString(),
    lastSeenAt: new Date(lastSeenAt).toISOString(),
    windowHours: Math.round(((lastSeenAt - firstSeenAt) / 3_600_000) * 100) / 100,
  }, new Set(records.map((record) => record.reportDate)).size)
}

export function enrichTopicsWithHistory(topics, previousHistory, options = {}) {
  const topicHistory = updateTopicHistory(previousHistory, topics, options)
  return {
    topics: (Array.isArray(topics) ? topics : []).map((topic) => {
      const recurrence = recurrenceFor(topic, topicHistory, options)
      return enrichTopic({ ...topic, recurrence }, options)
    }),
    topicHistory,
  }
}

export function isReportableTopic(topic) {
  if (topic?.contentType === 'community_opinion') return qualifiesAsCommunityPattern(topic?.recurrence)
  if (CONTENT_TYPES.has(topic?.contentType)) return true
  return countIndependentCorroboration(Array.isArray(topic?.evidence) ? topic.evidence : []) >= 2
}

export function topicHistoryFromReports(reports, options = {}) {
  const now = dateFrom(options.now ?? Date.now())
  const records = []
  for (const report of Array.isArray(reports) ? reports : []) {
    if (Array.isArray(report?.topicHistory)) {
      records.push(...report.topicHistory)
      continue
    }
    const reportNow = dateFrom(report?.generatedAt || `${validReportDate(report?.date) || londonDate(now)}T12:00:00.000Z`)
    const reportDate = validReportDate(report?.date) || londonDate(reportNow)
    for (const topic of Array.isArray(report?.topics) ? report.topics : []) records.push(...historyRecordsForTopic(topic, { now: reportNow, reportDate }))
  }
  return compactTopicHistory(records, now)
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

function duplicateText(message) {
  return normalizeContentText(String(message?.text || message?.excerpt || '').replace(/https?:\/\/\S+/gi, ' '))
}

function duplicateTokens(text) {
  return new Set(text.match(/[\p{L}\p{N}][\p{L}\p{N}._-]*/gu) || [])
}

const FINGERPRINT_STOP_WORDS = new Set(['about', 'after', 'also', 'and', 'are', 'change', 'changed', 'community', 'conversation', 'current', 'details', 'for', 'from', 'has', 'have', 'independent', 'independently', 'model', 'new', 'news', 'now', 'report', 'reported', 'the', 'this', 'today', 'topic', 'update', 'updated', 'with'])

function stableIdTokens(value) {
  const tokens = normalizeContentText(value).split(/[^\p{L}\p{N}._]+/gu).filter(Boolean)
  if (['ai', 'crypto'].includes(tokens[0])) tokens.shift()
  if (/^\d+$/.test(tokens[0] || '')) tokens.shift()
  if (/^\d{10,}$/.test(tokens.at(-1) || '')) tokens.pop()
  return tokens.filter((token) => token.length >= 2 && !FINGERPRINT_STOP_WORDS.has(token)).slice(0, 6)
}

function fingerprintTokens(value) {
  return [...new Set(normalizeContentText(value).match(/[\p{L}\p{N}][\p{L}\p{N}._-]*/gu) || [])]
    .filter((token) => token.length >= 3 && !FINGERPRINT_STOP_WORDS.has(token) && !/^\d+$/.test(token))
}

function hasHighTokenOverlap(left, right, threshold, minimumTokens) {
  if (Math.min(left.size, right.size) < minimumTokens) return false
  let intersection = 0
  for (const token of left) if (right.has(token)) intersection += 1
  const union = left.size + right.size - intersection
  return union > 0 && intersection / union >= threshold
}

function precedesDuplicate(candidate, current) {
  const candidateTime = timestamp(candidate?.publishedAt || candidate?.observedAt || candidate?.time)
  const currentTime = timestamp(current?.publishedAt || current?.observedAt || current?.time)
  if (candidateTime !== null && currentTime !== null && candidateTime !== currentTime) return candidateTime < currentTime
  if (candidateTime !== null && currentTime === null) return true
  if (candidateTime === null && currentTime !== null) return false
  const key = (item) => `${canonicalizeUrl(item?.canonicalUrl || item?.url)}\u0000${String(item?.externalId || item?.id || item?.sourceId || '')}`
  return key(candidate) < key(current)
}

function historyRecordsForTopic(topic, { now, reportDate }) {
  const fingerprint = topicFingerprint(topic)
  return attributedEvidence(Array.isArray(topic?.evidence) ? topic.evidence : []).map((item) => {
    const publisherId = independenceKeyFor(item)
    const author = normalizeIdentityKey(item?.author)
    return {
      fingerprint,
      reportDate,
      seenAt: now.toISOString(),
      authorKey: author || `${publisherId}:unknown`,
      publisherId,
      contentHash: contentHashFor(item),
    }
  })
}

function attributedEvidence(evidence) {
  const representatives = new Map()
  for (const item of dedupeNearDuplicates(evidence)) {
    const contentHash = contentHashFor(item)
    const current = representatives.get(contentHash)
    if (!current || precedesDuplicate(item, current)) representatives.set(contentHash, item)
  }
  return [...representatives.values()]
}

function compactTopicHistory(history, now) {
  const cutoff = now.getTime() - 30 * DAY
  const byObservation = new Map()
  for (const input of Array.isArray(history) ? history : []) {
    const seenAt = timestamp(input?.seenAt)
    if (!input?.fingerprint || !input?.contentHash || seenAt === null || seenAt < cutoff || seenAt > now.getTime()) continue
    const record = {
      fingerprint: String(input.fingerprint),
      reportDate: validReportDate(input.reportDate) || londonDate(new Date(seenAt)),
      seenAt: new Date(seenAt).toISOString(),
      authorKey: normalizeIdentityKey(input.authorKey) || `${normalizeIdentityKey(input.publisherId) || 'unknown'}:unknown`,
      publisherId: normalizeIdentityKey(input.publisherId) || 'unknown',
      contentHash: String(input.contentHash),
    }
    const key = `${record.fingerprint}\u0000${record.contentHash}`
    const current = byObservation.get(key)
    if (!current || record.seenAt < current.seenAt || (record.seenAt === current.seenAt && historyRecordKey(record) < historyRecordKey(current))) byObservation.set(key, record)
  }
  return [...byObservation.values()].sort((left, right) => compareText(left.seenAt, right.seenAt) || compareText(historyRecordKey(left), historyRecordKey(right)))
}

function historyRecordKey(record) {
  return `${record.publisherId}\u0000${record.authorKey}\u0000${record.contentHash}`
}

function recurrenceWithObservationDays(recurrence, observationDayCount) {
  Object.defineProperty(recurrence, 'observationDayCount', { value: observationDayCount, enumerable: false })
  return recurrence
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

function qualifiesAsCommunityPattern(recurrence) {
  if (!recurrence || Number(recurrence.authorCount) < 3 || Number(recurrence.publisherCount) < 2) return false
  if (Number.isFinite(Number(recurrence.observationDayCount))) return Number(recurrence.observationDayCount) >= 2
  if (Array.isArray(recurrence.reportDates) && new Set(recurrence.reportDates).size >= 2) return true
  const firstDate = londonDate(recurrence.firstSeenAt)
  const lastDate = londonDate(recurrence.lastSeenAt)
  return Boolean(firstDate && lastDate && firstDate !== lastDate)
}

function hasIndependentConflict(topic, evidence) {
  if (topic?.disputed === true || topic?.hasConflict === true) return true
  const hasExplicitConflict = evidence.some((item) => item?.disputed === true || item?.conflictsWith || item?.claimStatus === 'disputed')
  return hasExplicitConflict && countIndependentCorroboration(evidence) >= 2
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

function dateFrom(value) {
  const parsed = timestamp(value)
  return new Date(parsed === null ? Date.now() : parsed)
}

function validReportDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ''
}

function londonDate(value) {
  const parsed = timestamp(value)
  if (parsed === null) return ''
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(parsed))
}
