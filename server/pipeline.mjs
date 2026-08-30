import { canonicalizeUrl, countIndependentCorroboration, fingerprintText, independenceKeyFor, normalizeIdentityKey, selectCorroboratingEvidence } from '../shared/briefing-contract.mjs'
import { dedupeNearDuplicates } from '../shared/briefing-quality.mjs'

const STOP_WORDS = new Set(['about', 'after', 'again', 'also', 'and', 'are', 'been', 'before', 'being', 'between', 'but', 'can', 'could', 'from', 'have', 'into', 'more', 'most', 'not', 'over', 'that', 'the', 'their', 'there', 'they', 'this', 'through', 'today', 'very', 'what', 'when', 'where', 'which', 'while', 'with', 'would', 'your'])

export function normalizeMessage(input) {
  if (!input?.id || !input?.source || !input?.text || !input?.publishedAt) throw new Error('Message requires id, source, text, and publishedAt')
  const sourceId = String(input.sourceId || '')
  const sourceKey = normalizeIdentityKey(input.sourceKey) || normalizeIdentityKey(`${input.source}:${sourceId}`)
  const publisherId = normalizeIdentityKey(input.publisherId) || sourceKey
  const independenceKey = independenceKeyFor({ ...input, sourceId, sourceKey, publisherId })
  const canonicalUrl = input.canonicalUrl || canonicalizeUrl(input.url)
  const text = stripMarkup(String(input.text)).trim()
  return {
    id: String(input.id), externalId: String(input.externalId || input.id), source: input.source, sourceId, sourceKey, publisherId, independenceKey, trustTier: input.trustTier || 'community', author: String(input.author || 'unknown'),
    text, url: input.url || '', canonicalUrl, contentHash: input.contentHash || fingerprintText(text), publishedAt: new Date(input.publishedAt).toISOString(), engagement: input.engagement || {},
  }
}

export function dedupeMessages(messages) {
  return dedupeNearDuplicates(messages.map((message) => ({ ...message, ...normalizeMessage(message) })))
}

export function clusterMessages(messages) {
  const clusters = []
  for (const message of messages) {
    const terms = keywords(message.text)
    let best = null
    let bestScore = 0
    for (const cluster of clusters) {
      const overlap = terms.filter((term) => cluster.terms.has(term)).length
      const score = overlap / Math.max(1, Math.min(terms.length, cluster.terms.size))
      if (score > bestScore) { bestScore = score; best = cluster }
    }
    if (best && bestScore >= 0.34) {
      best.messages.push(message)
      terms.forEach((term) => best.terms.add(term))
    } else {
      clusters.push({ terms: new Set(terms), messages: [message] })
    }
  }
  return clusters
}

export function rankClusters(clusters, now = Date.now()) {
  return clusters.map((cluster) => {
    const sourceCount = countIndependentCorroboration(cluster.messages)
    const engagement = cluster.messages.reduce((sum, message) => sum + Object.values(message.engagement || {}).reduce((a, value) => a + (Number(value) || 0), 0), 0)
    const recency = cluster.messages.reduce((sum, message) => sum + Math.max(0, 1 - (now - new Date(message.publishedAt).getTime()) / 86_400_000), 0)
    return { ...cluster, score: cluster.messages.length * 3 + sourceCount * 4 + Math.log10(engagement + 1) * 2 + recency }
  }).sort((a, b) => b.score - a.score)
}

export function corroboratedClusters(clusters, minimumSources = 2) {
  return clusters.filter((cluster) => countIndependentCorroboration(cluster.messages) >= minimumSources)
}

export async function summarizeClusters(clusters, section, provider = null) {
  if (!clusters.length) return []
  const deterministic = clusters.map((cluster, index) => fallbackTopic(cluster, section, index))
  if (provider) {
    try { return applyEditorialSummaries(deterministic, await provider(clusters, section)) } catch (error) { console.warn(`Summary provider failed; using deterministic fallback: ${error.message}`) }
  }
  return deterministic
}

function applyEditorialSummaries(topics, summaries) {
  if (!Array.isArray(summaries)) return topics
  return topics.map((topic, index) => {
    const summary = summaries.find((candidate) => candidate?.id === topic.id)
      || summaries.find((candidate) => Number(candidate?.rank) === topic.rank)
      || summaries[index]
    if (!summary) return topic
    return {
      ...topic,
      title: typeof summary.title === 'string' && summary.title.trim() ? summary.title.trim() : topic.title,
      summary: typeof summary.summary === 'string' && summary.summary.trim() ? summary.summary.trim() : topic.summary,
    }
  })
}

function fallbackTopic(cluster, section, index) {
  const sortedTerms = [...cluster.terms].slice(0, 4)
  const priceKeys = [...new Set(cluster.messages.flatMap((message) => Array.isArray(message.priceKeys) ? message.priceKeys : []).filter(Boolean))]
  const evidence = selectCorroboratingEvidence(cluster.messages, 5).map((message) => ({
    source: message.source, label: message.sourceId, author: message.author, excerpt: message.text.slice(0, 240), time: message.publishedAt, url: message.url,
    sourceKey: message.sourceKey, publisherId: message.publisherId, independenceKey: independentKey(message), trustTier: message.trustTier, contentHash: message.contentHash,
  }))
  const sourceCount = countIndependentCorroboration(cluster.messages)
  const lead = cluster.messages[0]?.text || 'Emerging conversation'
  return {
    id: `${section}-${index + 1}-${sortedTerms.join('-')}`.slice(0, 80), rank: index + 1, section,
    title: sentenceTitle(lead), summary: cluster.messages.slice(0, 3).map((message) => message.text).join(' ').slice(0, 420),
    signal: `${cluster.messages.length} post${cluster.messages.length === 1 ? '' : 's'} across ${sourceCount} independent source${sourceCount === 1 ? '' : 's'}`,
    sources: [...new Set(cluster.messages.map((message) => message.sourceId))],
    confidence: sourceCount >= 3 ? 'High confidence' : sourceCount === 2 ? 'Mixed signal' : 'Early signal', evidence,
    ...(priceKeys.length ? { priceKeys } : {}),
  }
}
function independentKey(message) { return independenceKeyFor(message) }

function keywords(text) {
  return [...new Set(text.toLowerCase().match(/[a-z0-9]{3,}/g) || [])].filter((word) => !STOP_WORDS.has(word)).slice(0, 18)
}
function sentenceTitle(text) {
  const sentence = text.split(/[.!?\n]/)[0].trim()
  const clipped = sentence.split(/\s+/).slice(0, 12).join(' ')
  return clipped ? clipped[0].toUpperCase() + clipped.slice(1) : 'Emerging conversation'
}
function stripMarkup(text) { return text.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ') }
