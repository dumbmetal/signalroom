import { annotateMessage, countIndependentCorroboration, independenceKeyFor, normalizeIdentityKey, normalizeSourceDefinition, selectCorroboratingEvidence } from '../shared/briefing-contract.mjs'
import { getOfficialSource, OFFICIAL_SOURCE_KINDS } from '../shared/official-source-catalog.mjs'
import { collectOfficialSource } from '../shared/official-source-parsers.mjs'
import { mergePriceSnapshots } from '../shared/price-snapshots.mjs'
import { dedupeNearDuplicates, enrichTopicsWithHistory, isReportableTopic, topicHistoryFromReports } from '../shared/briefing-quality.mjs'

interface Env {
  REPORTS: KVNamespace
  X_BEARER_TOKEN?: string
  THREADS_ACCESS_TOKEN?: string
  TELEGRAM_BOT_TOKEN?: string
  TELEGRAM_CHAT_IDS?: string
  OPENAI_API_KEY?: string
  OPENAI_MODEL?: string
  REPORT_IMPORT_TOKEN?: string
  AI_SOURCES?: string
  TELEGRAM_SOURCES?: string
  OFFICIAL_SOURCES?: string
}

type Message = { source: string; sourceId: string; externalId?: string; sourceKey?: string; publisherId?: string; independenceKey?: string; trustTier?: string; canonicalUrl?: string; contentHash?: string; author?: string; priceKeys?: string[]; text: string; url: string; publishedAt: string; engagement: number }
type TopicCluster = { terms: Set<string>; posts: Message[]; postTerms: Array<{ sourceId: string; independenceKey: string; terms: string[] }> }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() })
    if (url.pathname === '/api/health') return json({ ok: true, runtime: 'cloudflare-worker', time: new Date().toISOString() })
    if (url.pathname === '/api/report') {
      const report = await env.REPORTS.get('latest', 'json')
      return report ? json(normalizeReport(report)) : json({ error: 'No crawl has completed yet' }, 404)
    }
    if (url.pathname === '/api/report/import' && request.method === 'POST') {
      if (!env.REPORT_IMPORT_TOKEN || !await hasValidBearerToken(request, env.REPORT_IMPORT_TOKEN)) return json({ error: 'Unauthorized' }, 401)
      const report = await request.json() as any
      if (!Array.isArray(report?.topics) || !Array.isArray(report?.sourceRuns) || !report?.date) return json({ error: 'Invalid report payload' }, 400)
      const imported = { ...normalizeReport(report), generatedAt: new Date().toISOString(), summaryProvider: 'mtplx-gateway' }
      await env.REPORTS.put('latest', JSON.stringify(imported), { expirationTtl: 60 * 60 * 24 * 90 })
      return json(imported)
    }
    if (url.pathname === '/api/crawl' && request.method === 'POST') return json(await crawl(env, url.searchParams.get('summary') !== 'off'))
    return new Response('Signalroom crawler is online. Use the Pages website for the dashboard.', { headers: { 'content-type': 'text/plain; charset=utf-8' } })
  },
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const londonHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23' }).format(new Date()))
    if (londonHour === 8) ctx.waitUntil(runFallbackCrawl(env))
  },
}

async function runFallbackCrawl(env: Env) {
  const latest = await env.REPORTS.get<any>('latest', 'json')
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date())
  if (latest?.date === today && latest?.summaryProvider === 'mtplx-gateway') return latest
  return crawl(env)
}

async function crawl(env: Env, useOpenAI = true) {
  const now = new Date()
  const previous = await readLatestReport(env)
  const latest = previous
  const reportDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(now)
  const statuses: Array<{ sourceId: string; source: string; kind: string; ok: boolean; status: 'ok' | 'partial' | 'error'; count: number; checkedAt: string; warnings: string[]; error?: string }> = []
  const messages: Message[] = []
  const observations: any[] = []
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const sources = parseSources(env.AI_SOURCES, env.TELEGRAM_SOURCES, env.OFFICIAL_SOURCES)
  for (const configuredSource of sources) {
    const source = normalizeSourceDefinition(configuredSource)
    try {
      const fetched = await fetchSource(source, env, since)
      const result = Array.isArray(fetched) ? { messages: fetched, observations: [], warnings: [] } : fetched
      const sourceDefinition = normalizeSourceDefinition(result.source || source)
      const normalizedMessages = (Array.isArray(result.messages) ? result.messages : []).map((item: any) => annotateMessage({ ...item, id: item.id || item.externalId, engagement: typeof item.engagement === 'number' ? item.engagement : 0 }, sourceDefinition))
      const last24Hours = normalizedMessages.filter((message: Message) => Date.parse(message.publishedAt) >= now.getTime() - 24 * 60 * 60 * 1000)
      const prices = Array.isArray(result.observations) ? result.observations : []
      const warnings = Array.isArray(result.warnings) ? result.warnings.map(sanitizeSourceMessage) : []
      messages.push(...last24Hours)
      observations.push(...prices)
      statuses.push(workerSourceRun(source, { catalogSource: result.source, count: last24Hours.length + prices.length, warnings }))
    } catch (error) {
      statuses.push(workerSourceRun(source, { error }))
    }
  }
  const priceSnapshots = mergePriceSnapshots(previous?.priceSnapshots || [], observations)
  const quality = buildTopicsWithHistory(messages, {
    now,
    reportDate,
    topicHistory: topicHistoryFromReports(latest ? [latest] : [], { now }),
    priceSnapshots,
  })
  let topics = quality.topics
  if (useOpenAI && env.OPENAI_API_KEY && topics.length) {
    try { topics = applyModelSummaries(topics, await summarizeWithOpenAI(topics, env)) } catch (error) { statuses.push(workerSourceRun({ id: 'openai-summarization', name: 'OpenAI summarization', kind: 'Summary' }, { error })) }
  }
  const report = { date: reportDate, generatedAt: now.toISOString(), topics, topicHistory: quality.topicHistory, sourceRuns: statuses, priceSnapshots, summaryProvider: useOpenAI && env.OPENAI_API_KEY && !statuses.some((run) => run.source === 'OpenAI summarization' && !run.ok) ? 'openai' : 'deterministic' }
  await env.REPORTS.put('latest', JSON.stringify(report), { expirationTtl: 60 * 60 * 24 * 90 })
  return report
}

function parseSources(raw?: string, telegramRaw?: string, officialRaw?: string) {
  const parsed = parseArray(raw)
  const telegram = parseArray(telegramRaw)
  const official = parseArray(officialRaw).flatMap((catalogId) => {
    if (typeof catalogId !== 'string' || !catalogId.trim()) return []
    try {
      const source = getOfficialSource(catalogId)
      return [{ id: source.id, kind: source.kind, name: source.name, section: 'ai', enabled: true, config: { catalogId: source.id } }]
    } catch {
      const id = catalogId.trim().toLowerCase()
      return [{ id, kind: 'OfficialFeed', name: id, section: 'ai', enabled: true, config: { catalogId: id } }]
    }
  })
  return [...parsed, ...telegram, ...official].filter((source) => ['Telegram', 'Reddit', 'X', 'Threads', ...OFFICIAL_SOURCE_KINDS].includes(source.kind) && source.enabled !== false)
}

async function fetchSource(source: any, env: Env, since: string): Promise<any> {
  if (OFFICIAL_SOURCE_KINDS.includes(source.kind)) return collectOfficialSource(source, { since })
  if (source.kind === 'Telegram') {
    try { return await fetchTelegramPublicChannel(source) } catch (publicError) {
      if (!env.TELEGRAM_BOT_TOKEN) throw publicError
    }
    const response = await request(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getUpdates?limit=100&timeout=0`)
    const chatId = String(source.config?.chatId || source.detail || '')
    return (response.result || []).map((update: any) => update.channel_post || update.message).filter(Boolean).filter((post: any) => String(post.chat?.id) === chatId || `@${post.chat?.username || ''}`.toLowerCase() === chatId.toLowerCase()).map((post: any) => ({ externalId: String(post.message_id), source: 'Telegram', sourceId: source.name, author: post.author_signature || post.from?.username || post.chat?.username || source.name, text: post.text || post.caption || '', url: post.chat?.username ? `https://t.me/${post.chat.username}/${post.message_id}` : '', publishedAt: new Date(post.date * 1000).toISOString(), engagement: 0 })).filter((post: Message) => post.text)
  }
  if (source.kind === 'Reddit') {
    const subreddit = source.config?.subreddit || source.name
    const response = await request(`https://www.reddit.com/r/${encodeURIComponent(subreddit)}/hot.json?limit=50`, { headers: { 'User-Agent': 'signalroom-cloudflare/1.0' } })
    return (response.data?.children || []).map(({ data }: any) => ({ externalId: data.name, source: 'Reddit', sourceId: `r/${subreddit}`, author: data.author || `r/${subreddit}`, text: `${data.title}. ${data.selftext || ''}`, url: `https://reddit.com${data.permalink}`, publishedAt: new Date(data.created_utc * 1000).toISOString(), engagement: data.score || 0 }))
  }
  if (source.kind === 'X') {
    if (!env.X_BEARER_TOKEN) throw new Error('X_BEARER_TOKEN missing')
    const params = new URLSearchParams({ query: source.config?.query || source.detail, max_results: '50', 'tweet.fields': 'created_at,public_metrics,author_id' })
    const response = await request(`https://api.x.com/2/tweets/search/recent?${params}`, { headers: { Authorization: `Bearer ${env.X_BEARER_TOKEN}` } })
    return (response.data || []).map((post: any) => ({ externalId: post.id, source: 'X', sourceId: source.name, author: post.author_id || source.name, text: post.text, url: `https://x.com/i/status/${post.id}`, publishedAt: post.created_at, engagement: post.public_metrics?.like_count || 0 }))
  }
  if (!env.THREADS_ACCESS_TOKEN || !source.config?.userId) throw new Error('Threads access token or userId missing')
  const params = new URLSearchParams({ fields: 'id,text,timestamp,permalink,username', access_token: env.THREADS_ACCESS_TOKEN, limit: '50' })
  const response = await request(`https://graph.threads.net/v1.0/${encodeURIComponent(source.config.userId)}/threads?${params}`)
  return (response.data || []).map((post: any) => ({ externalId: post.id, source: 'Threads', sourceId: source.name, author: post.username || source.name, text: post.text, url: post.permalink, publishedAt: post.timestamp, engagement: 0 }))
}

async function readLatestReport(env: Env) {
  try {
    const value = await env.REPORTS.get<any>('latest', 'json')
    if (typeof value === 'string') return JSON.parse(value)
    return value && typeof value === 'object' ? value : null
  } catch {
    return null
  }
}

function parseArray(value?: string) {
  if (!value) return []
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : [] } catch { return [] }
}

function workerSourceRun(source: any, { catalogSource, count = 0, warnings = [], error }: { catalogSource?: any; count?: number; warnings?: string[]; error?: unknown } = {}) {
  const failed = error !== undefined
  return {
    sourceId: String(source.id || source.sourceKey || source.name || 'unknown-source'),
    source: String(catalogSource?.name || source.name || source.id || 'Unknown source'),
    kind: String(source.kind || catalogSource?.kind || 'Unknown'),
    ok: !failed,
    status: failed ? 'error' as const : warnings.length ? 'partial' as const : 'ok' as const,
    count: failed ? 0 : count,
    checkedAt: new Date().toISOString(),
    warnings: failed ? [] : warnings,
    ...(failed ? { error: sanitizeSourceMessage(error) } : {}),
  }
}

function sanitizeSourceMessage(value: unknown) {
  const message = value instanceof Error ? value.message : String(value || 'Unknown error')
  return message
    .replace(/https?:\/\/[^\s)\]}]+/gi, '[redacted-url]')
    .replace(/\b(bearer)\s+\S+/gi, '$1 [redacted]')
    .replace(/\b(authorization|cookie|token|secret|api[_-]?key)\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .replace(/[\r\n\t]+/g, ' ')
    .slice(0, 240)
}

async function fetchTelegramPublicChannel(source: any): Promise<Message[]> {
  const chatId = String(source.config?.chatId || source.detail || '')
  const username = chatId.replace(/^@/, '').trim()
  if (!username || !/^[a-zA-Z0-9_]+$/.test(username)) throw new Error('Telegram public username is invalid')
  const html = await requestText(`https://t.me/s/${encodeURIComponent(username)}`)
  const posts: Message[] = []
  const pattern = /<div class="tgme_widget_message text_not_supported_wrap js-widget_message" data-post="([^"]+)"/g
  const matches = [...html.matchAll(pattern)]
  for (const [index, match] of matches.entries()) {
    const [channel, messageId] = match[1].split('/')
    const start = match.index || 0
    const end = matches[index + 1]?.index || html.length
    const block = html.slice(start, end)
    const textMatch = block.match(/<div class="tgme_widget_message_text js-message_text"[^>]*>([\s\S]*?)<\/div>/)
    const dateMatch = block.match(/<time datetime="([^"]+)"/)
    if (!textMatch || !dateMatch) continue
    const text = decodeTelegramHtml(textMatch[1])
    if (!text) continue
    const viewMatch = block.match(/tgme_widget_message_views">([\d.,KMB]+)/)
    posts.push({ externalId: messageId, source: 'Telegram', sourceId: source.name, author: source.name, text, url: `https://t.me/${channel}/${messageId}`, publishedAt: dateMatch[1], engagement: parseTelegramViews(viewMatch?.[1]) })
  }
  return posts
}

function decodeTelegramHtml(html: string) {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))).replace(/\s+/g, ' ').trim()
}

function parseTelegramViews(value?: string) {
  if (!value) return 0
  const numeric = Number.parseFloat(value.replace(/,/g, ''))
  const multiplier = value.endsWith('K') ? 1_000 : value.endsWith('M') ? 1_000_000 : value.endsWith('B') ? 1_000_000_000 : 1
  return Number.isFinite(numeric) ? Math.round(numeric * multiplier) : 0
}

type TopicBuildOptions = { now?: Date | string | number; reportDate?: string; topicHistory?: any[]; priceSnapshots?: any[] }

export function buildTopics(messages: Message[], options: TopicBuildOptions = {}) {
  return buildTopicsWithHistory(messages, options).topics
}

export function buildTopicsWithHistory(messages: Message[], options: TopicBuildOptions = {}) {
  const now = workerDate(options.now)
  const reportDate = /^\d{4}-\d{2}-\d{2}$/.test(options.reportDate || '')
    ? String(options.reportDate)
    : new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(now)
  const candidates = buildCandidateTopics(messages)
  const enriched = enrichTopicsWithHistory(candidates, Array.isArray(options.topicHistory) ? options.topicHistory : [], { now, reportDate, priceSnapshots: options.priceSnapshots })
  return {
    topics: enriched.topics.filter(isReportableTopic).map((topic: any, index: number) => ({ ...topic, rank: index + 1 })),
    topicHistory: enriched.topicHistory,
  }
}

function buildCandidateTopics(messages: Message[]) {
  const deduped = dedupeNearDuplicates(messages) as Message[]
  const clusters: TopicCluster[] = []
  for (const post of deduped.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))) {
    const terms = topicTerms(post.text)
    let best: typeof clusters[number] | undefined; let bestScore = 0
    for (const cluster of clusters) {
      let clusterScore = 0
      for (const candidate of cluster.postTerms) {
        const overlap = terms.filter((term) => candidate.terms.includes(term))
        const distinctiveOverlap = overlap.filter(isDistinctiveTerm)
        const koreanOverlap = overlap.filter((term) => /[가-힣]/u.test(term))
        const crossSource = candidate.independenceKey !== independentKey(post)
        const score = overlap.length / Math.max(1, Math.min(terms.length, candidate.terms.length))
        const enoughSharedTerms = distinctiveOverlap.length >= 1 || koreanOverlap.length >= 2
        if (crossSource && !enoughSharedTerms) continue
        clusterScore = Math.max(clusterScore, score)
      }
      if (clusterScore > bestScore) { best = cluster; bestScore = clusterScore }
    }
    if (best && bestScore >= 0.34) {
      best.posts.push(post)
      best.postTerms.push({ sourceId: post.sourceId, independenceKey: independentKey(post), terms })
      terms.forEach((term) => best?.terms.add(term))
    } else clusters.push({ terms: new Set(terms), posts: [post], postTerms: [{ sourceId: post.sourceId, independenceKey: independentKey(post), terms }] })
  }

  return clusters.map((cluster) => {
    const sources = [...new Set(cluster.posts.map((post) => post.sourceId))]
    const engagement = cluster.posts.reduce((sum, post) => sum + post.engagement, 0)
    const newest = Math.max(...cluster.posts.map((post) => Date.parse(post.publishedAt)))
    const sourceCount = countIndependentCorroboration(cluster.posts)
    const score = sourceCount * 10_000 + cluster.posts.length * 100 + Math.log10(engagement + 1) * 10 + newest / 1e13
    const term = strongestTerm(cluster)
    const section = cluster.posts.every((post) => post.source === 'Telegram') ? 'crypto' : 'ai'
    const priceKeys = [...new Set(cluster.posts.flatMap((post) => Array.isArray(post.priceKeys) ? post.priceKeys : []).filter(Boolean))]
    return {
      id: `${section}-${slug(term)}-${newest}`,
      rank: 0,
      section,
      title: `${term.toUpperCase()} · ${sourceCount}개 독립 출처 동시 언급`,
      summary: cluster.posts.slice(0, 3).map((post) => post.text).join(' ').slice(0, 500),
      signal: `${cluster.posts.length} posts across ${sourceCount} independent source${sourceCount === 1 ? '' : 's'}`,
      sources,
      confidence: sourceCount >= 3 ? 'High confidence' : sourceCount === 2 ? 'Mixed signal' : 'Early signal',
      evidence: selectEvidence(cluster.posts),
      ...(priceKeys.length ? { priceKeys } : {}),
      score,
    }
  }).sort((a, b) => b.score - a.score).map(({ score: _score, ...topic }, index) => ({ ...topic, rank: index + 1 }))
}

const TOPIC_STOP_WORDS = new Set(['https', 'http', 't.me', 'link', '관련', '대한', '이번', '현재', '오늘', '어제', '그리고', '하지만', '있는', '하는', '합니다', '있습니다', '생각', '정도', 'the', 'and', 'for', 'with', 'from', 'this', 'that', 'crypto', 'new', 'news', 'price', 'market', 'token', 'coin', 'project', 'update', 'channel', 'telegram', 'report'])
function topicTerms(text: string) {
  const withoutUrls = text.replace(/https?:\/\/\S+/g, ' ')
  const rawTerms = withoutUrls.match(/[$#]?[a-z][a-z0-9._-]{1,}|[가-힣]{2,}/giu) || []
  const normalized: string[] = []
  for (const rawTerm of rawTerms) {
    const bare = rawTerm.replace(/^[$#]/, '')
    const term = bare.toLowerCase()
    if (!term || TOPIC_STOP_WORDS.has(term)) continue
    normalized.push(term)
    if (/^[$#]/.test(rawTerm) || (/^[A-Z][A-Z0-9._-]{1,9}$/.test(bare) && /[A-Z]/.test(bare))) normalized.push(`asset:${term}`)
  }
  return [...new Set(normalized)].slice(0, 40)
}
function isDistinctiveTerm(term: string) { return term.startsWith('asset:') || /^[a-z][a-z0-9._-]{3,}$/.test(term) }
function strongestTerm(cluster: { terms: Set<string>; posts: Message[] }) {
  const counts = new Map<string, number>()
  for (const post of cluster.posts) for (const term of topicTerms(post.text)) counts.set(term, (counts.get(term) || 0) + 1)
  const strongest = [...counts.entries()].sort((a, b) => b[1] - a[1] || Number(isDistinctiveTerm(b[0])) - Number(isDistinctiveTerm(a[0])) || b[0].length - a[0].length)[0]?.[0] || 'conversation'
  return strongest.replace(/^asset:/, '')
}
function selectEvidence(posts: Message[], limit = 6) {
  return selectCorroboratingEvidence(posts, limit).map((post: Message) => ({ source: post.source, label: post.sourceId, author: post.author || post.sourceId, excerpt: post.text.slice(0, 500), time: relativeTime(post.publishedAt), publishedAt: post.publishedAt, url: post.url, sourceKey: post.sourceKey, publisherId: post.publisherId, independenceKey: independentKey(post), trustTier: post.trustTier, contentHash: post.contentHash }))
}
function relativeTime(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 60_000))
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`
}
function slug(value: string) { return value.toLowerCase().replace(/[^a-z0-9가-힣]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40) || 'topic' }

function workerDate(value?: Date | string | number) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value ?? Date.now())
  return Number.isFinite(date.getTime()) ? date : new Date()
}

export function normalizeReport(report: any) {
  const topics = (Array.isArray(report?.topics) ? report.topics : []).map(normalizeTopic).filter(isReportableTopic).map((topic: any, index: number) => ({ ...topic, rank: index + 1 }))
  const topicHistory = topicHistoryFromReports([report], { now: report?.generatedAt || Date.now() })
  return { ...report, topics, ...(Array.isArray(report?.topicHistory) || topicHistory.length ? { topicHistory } : {}), sourceRuns: Array.isArray(report?.sourceRuns) ? report.sourceRuns : [] }
}

function normalizeTopic(topic: any, index = 0) {
  const evidence = Array.isArray(topic?.evidence) ? topic.evidence.map((item: any) => ({
    source: item.source || 'Telegram',
    label: item.label || item.sourceId || 'Unknown source',
    author: item.author || item.sourceId || 'Unknown author',
    excerpt: item.excerpt || item.text || '',
    time: item.time || relativeTime(item.publishedAt || new Date().toISOString()),
    publishedAt: validIsoDate(item.publishedAt) ? item.publishedAt : validIsoDate(item.time) ? item.time : undefined,
    url: item.url || '', sourceKey: normalizeIdentityKey(item.sourceKey), publisherId: normalizeIdentityKey(item.publisherId), independenceKey: independenceKeyFor({ source: item.source || 'Telegram', sourceId: item.label || item.sourceId || 'Unknown source', sourceKey: item.sourceKey, publisherId: item.publisherId, independenceKey: item.independenceKey }), trustTier: item.trustTier || 'community', contentHash: item.contentHash,
  })).filter((item: any) => item.excerpt || item.url) : []
  const sources = [...new Set(evidence.map((item: any) => item.label).filter((label: string) => label && label !== 'Unknown source'))]
  const independentSourceCount = countIndependentCorroboration(evidence)
  const normalized = { ...topic, id: topic?.id || `topic-${index + 1}`, rank: Number(topic?.rank || index + 1), sources, independentSourceCount, evidence }
  if (!BRIEFING_CONTENT_TYPES.includes(normalized.contentType)) delete normalized.contentType
  if (!CLAIM_STATUSES.includes(normalized.status)) delete normalized.status
  if (!['fresh', 'aging', 'stale'].includes(normalized.freshness)) delete normalized.freshness
  if (!validIsoDate(normalized.lastVerifiedAt)) delete normalized.lastVerifiedAt
  if (Array.isArray(normalized.priceKeys)) normalized.priceKeys = [...new Set(normalized.priceKeys.filter((key: unknown) => typeof key === 'string' && key.trim()).map((key: string) => key.trim()))]
  else delete normalized.priceKeys
  const recurrence = normalizeRecurrence(normalized.recurrence)
  if (recurrence) normalized.recurrence = recurrence
  else delete normalized.recurrence
  return normalized
}

function normalizeRecurrence(value: any) {
  if (!value) return null
  const counts = ['authorCount', 'publisherCount', 'mentionCount'].map((key) => Number(value[key]))
  const windowHours = Number(value.windowHours)
  if (counts.some((count) => !Number.isInteger(count) || count < 0) || !Number.isFinite(windowHours) || windowHours < 0 || !validIsoDate(value.firstSeenAt) || !validIsoDate(value.lastSeenAt)) return null
  return { authorCount: counts[0], publisherCount: counts[1], mentionCount: counts[2], firstSeenAt: value.firstSeenAt, lastSeenAt: value.lastSeenAt, windowHours }
}

function validIsoDate(value: unknown) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function independentKey(post: Pick<Message, 'source' | 'sourceId' | 'sourceKey' | 'publisherId' | 'independenceKey'>) { return independenceKeyFor(post) }

export function applyModelSummaries(topics: any[], modelTopics: any[]) {
  const summaries = new Map(modelTopics.filter((topic: any) => topic && typeof topic.id === 'string').map((topic: any) => [topic.id, topic]))
  return topics.map((topic) => {
    const modelTopic = summaries.get(topic.id)
    if (!modelTopic) return topic
    return { ...topic, title: typeof modelTopic.title === 'string' && modelTopic.title.trim() ? modelTopic.title.trim() : topic.title, summary: typeof modelTopic.summary === 'string' && modelTopic.summary.trim() ? modelTopic.summary.trim() : topic.summary }
  })
}

async function summarizeWithOpenAI(topics: any[], env: Env) {
  const response = await request('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: env.OPENAI_MODEL || 'gpt-5-mini', store: false, input: [{ role: 'system', content: 'You summarize conversation clusters. Return only valid JSON: an array of objects with rank, section, title, summary, signal, sources, evidence. Preserve evidence URLs and do not invent facts.' }, { role: 'user', content: JSON.stringify(topics) }] }) })
  const outputText = response.output_text || response.output?.flatMap((item: any) => item.content || []).map((part: any) => part.text || '').join('') || ''
  const parsed = JSON.parse(outputText)
  if (!Array.isArray(parsed)) throw new Error('OpenAI response was not an array')
  return parsed
}

async function request(url: string, init?: RequestInit) { const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) }); if (!response.ok) throw new Error(`${response.status} ${response.statusText}`); return response.json() }
async function requestText(url: string) { const response = await fetch(url, { headers: { 'User-Agent': 'Signalroom/1.0' }, signal: AbortSignal.timeout(15_000) }); if (!response.ok) throw new Error(`${response.status} ${response.statusText}`); return response.text() }
function corsHeaders() { return { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'content-type' } }
function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...corsHeaders() } }) }
async function hasValidBearerToken(request: Request, expected: string) {
  const actual = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  const encoder = new TextEncoder()
  const [actualHash, expectedHash] = await Promise.all([crypto.subtle.digest('SHA-256', encoder.encode(actual)), crypto.subtle.digest('SHA-256', encoder.encode(expected))])
  const a = new Uint8Array(actualHash); const b = new Uint8Array(expectedHash)
  let difference = 0
  for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index]
  return difference === 0 && actual.length > 0
}
