export const BRIEFING_CONTENT_TYPES = ['product_update', 'price_change', 'discount_offer', 'setup_tip', 'community_opinion']
export const TRUST_TIERS = ['primary', 'maintainer', 'independent', 'community']
export const CLAIM_STATUSES = ['confirmed', 'reported', 'disputed', 'expired']

const TRACKING_PARAMETER = /^(utm_|fbclid$|gclid$|mc_[ce]id$)/i

export function canonicalizeUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    const url = new URL(raw)
    if (!['http:', 'https:'].includes(url.protocol)) return raw
    url.protocol = url.protocol.toLowerCase()
    url.hostname = url.hostname.toLowerCase()
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) if (TRACKING_PARAMETER.test(key)) url.searchParams.delete(key)
    const pathname = url.pathname.replace(/\/+$/, '') || '/'
    const query = url.searchParams.toString()
    return `${url.protocol}//${url.host}${pathname === '/' ? '' : pathname}${query ? `?${query}` : ''}`
  } catch {
    return raw
  }
}

export function fingerprintText(value) {
  let hash = 2166136261
  for (const character of normalizeContentText(value)) {
    hash ^= character.codePointAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export function normalizeContentText(value) {
  return String(value || '').normalize('NFKC')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeIdentityKey(value) {
  return typeof value === 'string' ? value.normalize('NFKC').trim().toLowerCase() : ''
}

function firstIdentity(...values) {
  return values.map(normalizeIdentityKey).find(Boolean) || ''
}

export function normalizeSourceDefinition(source) {
  const sourceKey = firstIdentity(source?.id, `${source?.kind || 'Unknown'}:${source?.name || 'source'}`)
  const publisherId = firstIdentity(source?.publisherId, source?.config?.publisherId, sourceKey)
  const independenceKey = firstIdentity(source?.independenceKey, source?.config?.independenceKey, publisherId)
  const requestedTrustTier = normalizeIdentityKey(source?.trustTier || source?.config?.trustTier)
  const trustTier = TRUST_TIERS.includes(requestedTrustTier) ? requestedTrustTier : 'community'
  return { ...source, sourceKey, publisherId, independenceKey, trustTier }
}

export function independenceKeyFor(message) {
  return firstIdentity(message?.independenceKey, message?.publisherId, message?.sourceKey, `${message?.source || 'Unknown'}:${message?.sourceId || 'source'}`)
}

export function contentHashFor(message) {
  if (message?.contentHash) return String(message.contentHash)
  const content = String(message?.text || message?.excerpt || '').trim()
  if (content) return fingerprintText(content)
  const url = canonicalizeUrl(message?.canonicalUrl || message?.url)
  if (url) return `url:${url}`
  return `identity:${independenceKeyFor(message)}:${String(message?.externalId || message?.id || message?.sourceId || '')}`
}

export function selectIndependentEvidence(messages) {
  const representativeByContentHash = new Map()
  for (const message of messages) {
    const contentHash = contentHashFor(message)
    const current = representativeByContentHash.get(contentHash)
    if (!current || precedesRepresentative(message, current)) representativeByContentHash.set(contentHash, message)
  }
  const selected = []
  const selectedIndependenceKeys = new Set()
  for (const message of representativeByContentHash.values()) {
    const independenceKey = independenceKeyFor(message)
    if (selectedIndependenceKeys.has(independenceKey)) continue
    selected.push(message)
    selectedIndependenceKeys.add(independenceKey)
  }
  return selected
}

function precedesRepresentative(candidate, current) {
  const candidateTime = Date.parse(candidate?.publishedAt || '')
  const currentTime = Date.parse(current?.publishedAt || '')
  const normalizedCandidateTime = Number.isFinite(candidateTime) ? candidateTime : Number.POSITIVE_INFINITY
  const normalizedCurrentTime = Number.isFinite(currentTime) ? currentTime : Number.POSITIVE_INFINITY
  if (normalizedCandidateTime !== normalizedCurrentTime) return normalizedCandidateTime < normalizedCurrentTime
  const key = (message) => `${canonicalizeUrl(message?.canonicalUrl || message?.url)}\u0000${independenceKeyFor(message)}\u0000${String(message?.sourceId || '')}`
  return key(candidate) < key(current)
}

export function countIndependentCorroboration(messages) {
  return selectIndependentEvidence(messages).length
}

export function selectCorroboratingEvidence(messages, limit = 6) {
  const selected = []
  const selectedIndependenceKeys = new Set()
  const selectedSourceIds = new Set()
  const selectedUrls = new Set()
  const add = (message) => {
    const key = independenceKeyFor(message)
    const sourceId = String(message?.sourceId || '')
    const url = canonicalizeUrl(message?.canonicalUrl || message?.url) || String(message?.url || '')
    selected.push(message)
    selectedIndependenceKeys.add(key)
    selectedSourceIds.add(sourceId)
    if (url) selectedUrls.add(url)
  }
  for (const message of selectIndependentEvidence(messages)) {
    if (selected.length >= limit) break
    add(message)
  }
  for (const message of messages) {
    if (selected.length >= limit) break
    const sourceId = String(message?.sourceId || '')
    const url = canonicalizeUrl(message?.canonicalUrl || message?.url) || String(message?.url || '')
    if (!selectedSourceIds.has(sourceId) && (!url || !selectedUrls.has(url))) add(message)
  }
  for (const message of messages) {
    if (selected.length >= limit) break
    const url = canonicalizeUrl(message?.canonicalUrl || message?.url) || String(message?.url || '')
    if (!url || !selectedUrls.has(url)) add(message)
  }
  return selected
}

export function annotateMessage(message, source) {
  const normalizedSource = normalizeSourceDefinition(source)
  const canonicalUrl = canonicalizeUrl(message?.url)
  const contentHash = fingerprintText(message?.text)
  return {
    ...message,
    externalId: String(message?.externalId || message?.id || canonicalUrl || contentHash),
    sourceId: String(message?.sourceId || normalizedSource.name || normalizedSource.sourceKey),
    sourceKey: normalizedSource.sourceKey,
    publisherId: normalizedSource.publisherId,
    independenceKey: normalizedSource.independenceKey,
    trustTier: normalizedSource.trustTier,
    canonicalUrl,
    contentHash,
  }
}
