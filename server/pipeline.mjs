const STOP_WORDS = new Set(['about', 'after', 'again', 'also', 'and', 'are', 'been', 'before', 'being', 'between', 'but', 'can', 'could', 'from', 'have', 'into', 'more', 'most', 'not', 'over', 'that', 'the', 'their', 'there', 'they', 'this', 'through', 'today', 'very', 'what', 'when', 'where', 'which', 'while', 'with', 'would', 'your'])

export function normalizeMessage(input) {
  if (!input?.id || !input?.source || !input?.text || !input?.publishedAt) throw new Error('Message requires id, source, text, and publishedAt')
  return {
    id: String(input.id), source: input.source, sourceId: String(input.sourceId || ''), author: String(input.author || 'unknown'),
    text: stripMarkup(String(input.text)).trim(), url: input.url || '', publishedAt: new Date(input.publishedAt).toISOString(),
    engagement: input.engagement || {},
  }
}

export function dedupeMessages(messages) {
  const seen = new Set()
  return messages.filter((message) => {
    const normalized = normalizeMessage(message)
    const textKey = normalized.text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 180)
    const key = normalized.url || `${normalized.source}:${textKey}`
    if (!textKey || seen.has(key)) return false
    seen.add(key)
    return true
  })
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
    const sourceCount = new Set(cluster.messages.map((message) => `${message.source}:${message.sourceId}`)).size
    const engagement = cluster.messages.reduce((sum, message) => sum + Object.values(message.engagement || {}).reduce((a, value) => a + (Number(value) || 0), 0), 0)
    const recency = cluster.messages.reduce((sum, message) => sum + Math.max(0, 1 - (now - new Date(message.publishedAt).getTime()) / 86_400_000), 0)
    return { ...cluster, score: cluster.messages.length * 3 + sourceCount * 4 + Math.log10(engagement + 1) * 2 + recency }
  }).sort((a, b) => b.score - a.score)
}

export function corroboratedClusters(clusters, minimumSources = 2) {
  return clusters.filter((cluster) => new Set(cluster.messages.map((message) => `${message.source}:${message.sourceId}`)).size >= minimumSources)
}

export async function summarizeClusters(clusters, section, provider = null) {
  if (!clusters.length) return []
  if (provider) {
    try { return await provider(clusters, section) } catch (error) { console.warn(`Summary provider failed; using deterministic fallback: ${error.message}`) }
  }
  return clusters.map((cluster, index) => fallbackTopic(cluster, section, index))
}

function fallbackTopic(cluster, section, index) {
  const sortedTerms = [...cluster.terms].slice(0, 4)
  const evidence = cluster.messages.slice(0, 5).map((message) => ({
    source: message.source, label: message.sourceId, author: message.author, excerpt: message.text.slice(0, 240), time: message.publishedAt, url: message.url,
  }))
  const sourceCount = new Set(cluster.messages.map((message) => message.sourceId)).size
  const lead = cluster.messages[0]?.text || 'Emerging conversation'
  return {
    id: `${section}-${index + 1}-${sortedTerms.join('-')}`.slice(0, 80), rank: index + 1, section,
    title: sentenceTitle(lead), summary: cluster.messages.slice(0, 3).map((message) => message.text).join(' ').slice(0, 420),
    signal: `${cluster.messages.length} post${cluster.messages.length === 1 ? '' : 's'} across ${sourceCount} source${sourceCount === 1 ? '' : 's'}`,
    sources: [...new Set(cluster.messages.map((message) => message.sourceId))],
    confidence: sourceCount >= 3 ? 'High confidence' : sourceCount === 2 ? 'Mixed signal' : 'Early signal', evidence,
  }
}

function keywords(text) {
  return [...new Set(text.toLowerCase().match(/[a-z0-9]{3,}/g) || [])].filter((word) => !STOP_WORDS.has(word)).slice(0, 18)
}
function sentenceTitle(text) {
  const sentence = text.split(/[.!?\n]/)[0].trim()
  const clipped = sentence.split(/\s+/).slice(0, 12).join(' ')
  return clipped ? clipped[0].toUpperCase() + clipped.slice(1) : 'Emerging conversation'
}
function stripMarkup(text) { return text.replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ') }
