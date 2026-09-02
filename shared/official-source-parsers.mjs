import { isAllowedOfficialSourceUrl, resolveOfficialSource } from './official-source-catalog.mjs'
import { amountToMinorUnits, normalizePriceObservation } from './price-snapshots.mjs'

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])
const MAX_RESPONSE_BYTES = 2_000_000

export async function collectOfficialSource(configuredSource, { since, observedAt = new Date().toISOString(), fetchImpl = globalThis.fetch } = {}) {
  const source = resolveOfficialSource(configuredSource)
  if (typeof fetchImpl !== 'function') throw new Error('Official source fetch is unavailable')
  let url = source.url
  for (let redirectCount = 0; redirectCount <= 4; redirectCount++) {
    let response
    try {
      response = await fetchImpl(url, {
        redirect: 'manual',
        headers: { Accept: 'application/atom+xml, application/rss+xml, application/feed+json, application/json, text/html;q=0.9' },
        signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(15_000) : undefined,
      })
    } catch {
      throw new Error('Official source request failed')
    }
    if (REDIRECT_STATUSES.has(response.status)) {
      if (redirectCount === 4) throw new Error('Official source exceeded the redirect limit')
      const location = response.headers.get('location')
      let redirected
      try { redirected = new URL(location || '', url).href } catch { throw new Error('Official source redirect was invalid') }
      if (!location || !isAllowedOfficialSourceUrl(source, redirected)) throw new Error('Official source redirect was not allowlisted')
      url = redirected
      continue
    }
    if (!response.ok) throw new Error(`Official source request failed with HTTP ${response.status}`)
    const declaredSize = Number(response.headers.get('content-length') || 0)
    if (Number.isFinite(declaredSize) && declaredSize > MAX_RESPONSE_BYTES) throw new Error('Official source response exceeded the size limit')
    const body = await response.text()
    if (new TextEncoder().encode(body).byteLength > MAX_RESPONSE_BYTES) throw new Error('Official source response exceeded the size limit')
    return { source, ...parseOfficialSource(source, body, since, observedAt) }
  }
  throw new Error('Official source collection failed')
}

export function parseOfficialFeed(source, body, since) {
  if (source?.parserKey !== 'feed' || source?.kind !== 'OfficialFeed') throw new Error('Official source is not a feed')
  const raw = String(body || '').trim()
  if (!raw) throw new Error('Official feed response was empty')
  const items = raw.startsWith('{') || raw.startsWith('[') ? parseJsonFeed(raw) : parseXmlFeed(raw)
  return normalizeFeedItems(source, items, since)
}

export function parseOfficialPage(source, body, since) {
  if (source?.kind !== 'OfficialPage') throw new Error('Unsupported official page parser')
  if (source.parserKey === 'lmstudio-changelog') return parseLmStudioChangelog(source, body, since)
  if (source.parserKey !== 'json-ld-article') throw new Error('Unsupported official page parser')
  const articles = []
  const pattern = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  for (const match of String(body || '').matchAll(pattern)) {
    try {
      for (const item of flattenJsonLd(JSON.parse(decodeHtmlEntities(match[1])))) {
        const types = Array.isArray(item?.['@type']) ? item['@type'] : [item?.['@type']]
        if (!types.some((type) => ['Article', 'NewsArticle', 'TechArticle'].includes(type))) continue
        articles.push({
          id: item['@id'] || item.url || source.url,
          title: item.headline || item.name,
          summary: item.description || item.abstract,
          url: isAllowedOfficialSourceUrl(source, item.url) ? item.url : source.url,
          publishedAt: item.dateModified || item.datePublished,
        })
      }
    } catch {
      // Ignore unrelated invalid structured-data blocks; zero articles fails below.
    }
  }
  if (!articles.length) throw new Error('Official page parser found no article metadata')
  return normalizeFeedItems(source, articles, since)
}

export function parseOfficialPricing(source, body, observedAt = new Date().toISOString()) {
  if (source?.kind !== 'OfficialPricing' || source?.parserKey !== 'subscription-pricing' || !source?.pricing) throw new Error('Unsupported official pricing parser')
  const observations = []
  const warnings = []
  for (const plan of source.pricing.plans || []) {
    const planText = extractPricingCard(body, plan.cardHeading)
    const amount = findPlanAmount(planText, plan.aliases || [plan.plan], source.pricing.currency, plan.billingPeriod, plan.amountPosition, plan.unitPattern, plan.forbidUnitPattern)
    if (amount === null) {
      if (plan.required !== false) warnings.push(`Missing required plan: ${plan.plan}`)
      continue
    }
    observations.push(normalizePriceObservation({
      vendor: source.pricing.vendor,
      product: source.pricing.product,
      plan: plan.plan,
      region: source.pricing.region,
      currency: source.pricing.currency,
      amountMinor: amountToMinorUnits(amount, source.pricing.currency),
      billingPeriod: plan.billingPeriod,
      unit: plan.unit,
      taxMode: source.pricing.taxMode,
      observedAt,
      lastVerifiedAt: observedAt,
      sourceUrl: source.url,
      sourceKey: source.id,
      publisherId: source.publisherId,
      trustTier: source.trustTier,
      ...(plan.promotion ? { promotion: plan.promotion } : {}),
    }))
  }
  const requiredCount = (source.pricing.plans || []).filter((plan) => plan.required !== false).length
  const foundRequiredCount = observations.filter((observation) => (source.pricing.plans || []).some((plan) => plan.plan === observation.plan && plan.required !== false)).length
  if (requiredCount > 0 && foundRequiredCount === 0) throw new Error('Official pricing parser found none of the required plans')
  return { observations, warnings }
}

export function parseOfficialSource(source, body, since, observedAt = new Date().toISOString()) {
  if (source?.kind === 'OfficialFeed') return { messages: parseOfficialFeed(source, body, since), observations: [], warnings: [] }
  if (source?.kind === 'OfficialPage') return { messages: parseOfficialPage(source, body, since), observations: [], warnings: [] }
  if (source?.kind === 'OfficialPricing') return { messages: [], ...parseOfficialPricing(source, body, observedAt) }
  throw new Error('Unsupported official source kind')
}

function parseJsonFeed(raw) {
  let feed
  try { feed = JSON.parse(raw) } catch { throw new Error('Official JSON Feed was invalid') }
  if (!Array.isArray(feed?.items)) throw new Error('Official JSON Feed must contain items')
  return feed.items.map((item) => ({
    id: item.id || item.url || item.external_url,
    title: item.title,
    summary: item.content_text || item.summary || item.content_html,
    url: item.url || item.external_url,
    publishedAt: item.date_published || item.date_modified,
  }))
}

function parseXmlFeed(raw) {
  const isAtom = /<feed\b/i.test(raw)
  const blocks = [...raw.matchAll(isAtom ? /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi : /<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map((match) => match[1])
  if (!blocks.length) throw new Error('Official XML feed contained no entries')
  return blocks.map((block) => ({
    id: tagText(block, isAtom ? ['id'] : ['guid']) || tagText(block, ['link']),
    title: tagText(block, ['title']),
    summary: tagText(block, isAtom ? ['content', 'summary'] : ['description', 'content:encoded']),
    url: isAtom ? atomLink(block) : tagText(block, ['link']),
    publishedAt: tagText(block, isAtom ? ['published', 'updated'] : ['pubDate', 'dc:date']),
  }))
}

function normalizeFeedItems(source, items, since) {
  const sinceTime = Date.parse(String(since || ''))
  if (!Number.isFinite(sinceTime)) throw new Error('Official source since value is invalid')
  return items.flatMap((item) => {
    const publishedTime = Date.parse(String(item.publishedAt || ''))
    if (!Number.isFinite(publishedTime) || publishedTime < sinceTime) return []
    const title = cleanMarkup(item.title)
    const summary = cleanMarkup(item.summary)
    const text = [title, summary && summary !== title ? summary : ''].filter(Boolean).join(' ').trim()
    const url = isAllowedOfficialSourceUrl(source, item.url) ? new URL(item.url).href : source.url
    if (!text) return []
    return [{
      externalId: String(item.id || url),
      source: source.kind,
      sourceId: source.name,
      author: source.publisher,
      text,
      url,
      publishedAt: new Date(publishedTime).toISOString(),
      engagement: {},
    }]
  })
}

function parseLmStudioChangelog(source, body, since) {
  const text = cleanMarkup(body)
  const releases = [...text.matchAll(/\bLM Studio (\d+\.\d+\.\d+)\b/g)]
  if (!releases.length) throw new Error('LM Studio changelog parser found no releases')
  const items = releases.flatMap((match, index) => {
    const start = (match.index || 0) + match[0].length
    const end = releases[index + 1]?.index || text.length
    const block = text.slice(start, end)
    const date = block.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4}\b/)
    if (!date) return []
    const summary = block.slice(0, date.index).trim().replace(/^(?:Build\s+\d+\s*)+/i, '').trim()
    return [{
      id: `lm-studio-${match[1]}`,
      title: `LM Studio ${match[1]}`,
      summary,
      url: source.url,
      publishedAt: `${date[0]} 00:00:00 UTC`,
    }]
  })
  if (!items.length) throw new Error('LM Studio changelog parser found no dated releases')
  return normalizeFeedItems(source, items, since)
}

function findPlanAmount(text, aliases, currency, billingPeriod, amountPosition = 'after', unitPattern = '', forbidUnitPattern = '') {
  if (!text) return null
  const periods = billingPeriod === 'month' ? String.raw`(?:\/\s*(?:(?:seat|user)\s*\/\s*)?(?:month|mo|월)|per\s+month|monthly|if\s+billed\s+monthly|billed\s+monthly)` : billingPeriod === 'year' ? String.raw`(?:\/\s*(?:(?:seat|user)\s*\/\s*)?(?:year|yr|년)|per\s+year|annually|billed\s+up\s+front)` : ''
  const suffixUnit = String.raw`(?:\s*(?:\/\s*|per\s+)(?:seat|user))?`
  const amountPattern = String(currency).toUpperCase() === 'KRW'
    ? `(?:₩\\s*([0-9][0-9,]*(?:\\.\\d+)?)|([0-9][0-9,]*(?:\\.\\d+)?)\\s*원)\\s*${periods}${suffixUnit}`
    : `(?:US\\s*)?\\$\\s*([0-9][0-9,]*(?:\\.\\d+)?)\\s*${periods}${suffixUnit}`
  for (const alias of aliases) {
    const haystack = text.toLowerCase()
    const needle = String(alias).toLowerCase()
    let offset = 0
    while (needle && offset < haystack.length) {
      const index = haystack.indexOf(needle, offset)
      if (index < 0) break
      const window = amountPosition === 'before'
        ? text.slice(Math.max(0, index - 2_000), index + needle.length)
        : text.slice(index, index + 2_000)
      const matches = [...window.matchAll(new RegExp(amountPattern, 'ig'))]
      const match = amountPosition === 'before' ? matches.at(-1) : matches[0]
      const matchedText = match?.[0]?.toLowerCase() || ''
      if (match && (!unitPattern || matchedText.includes(String(unitPattern).toLowerCase())) && (!forbidUnitPattern || !matchedText.includes(String(forbidUnitPattern).toLowerCase()))) return match.slice(1).find(Boolean) || null
      offset = index + needle.length
    }
  }
  return null
}

function extractPricingCard(body, heading) {
  const escapedHeading = String(heading || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (!escapedHeading) return ''
  const headingPattern = new RegExp(`<h([1-6])\\b[^>]*>\\s*${escapedHeading}\\s*</h\\1\\s*>`, 'i')
  const match = headingPattern.exec(String(body || ''))
  if (!match) return ''
  const nextHeadingPattern = /<h[1-6]\b[^>]*>/ig
  nextHeadingPattern.lastIndex = match.index + match[0].length
  const next = nextHeadingPattern.exec(String(body || ''))
  return cleanMarkup(String(body || '').slice(match.index, next?.index || String(body || '').length))
}

function tagText(block, names) {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = block.match(new RegExp(`<${escaped}\\b[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'i'))
    if (match) return cleanMarkup(match[1])
  }
  return ''
}
function atomLink(block) {
  const links = [...block.matchAll(/<link\b([^>]*)\/?\s*>/gi)]
  const alternate = links.find(([, attributes]) => !/\brel=["'](?!alternate["'])/i.test(attributes)) || links[0]
  return attribute(alternate?.[1], 'href')
}
function attribute(attributes = '', name) {
  const match = attributes.match(new RegExp(`\\b${name}=["']([^"']+)["']`, 'i'))
  return match ? decodeHtmlEntities(match[1]) : ''
}
function cleanMarkup(value) {
  return decodeHtmlEntities(String(value || '').replace(/^<!\[CDATA\[|\]\]>$/g, '').replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]*>/g, ' ')).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}
function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
}
function flattenJsonLd(value) {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd)
  if (!value || typeof value !== 'object') return []
  return [value, ...flattenJsonLd(value['@graph'])]
}
