import { isAllowedOfficialSourceUrl } from './official-source-catalog.mjs'
import { amountToMinorUnits, normalizePriceObservation } from './price-snapshots.mjs'

export function parseOfficialFeed(source, body, since) {
  if (source?.parserKey !== 'feed' || source?.kind !== 'OfficialFeed') throw new Error('Official source is not a feed')
  const raw = String(body || '').trim()
  if (!raw) throw new Error('Official feed response was empty')
  const items = raw.startsWith('{') || raw.startsWith('[') ? parseJsonFeed(raw) : parseXmlFeed(raw)
  return normalizeFeedItems(source, items, since)
}

export function parseOfficialPage(source, body, since) {
  if (source?.kind !== 'OfficialPage' || source?.parserKey !== 'json-ld-article') throw new Error('Unsupported official page parser')
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
  if (source?.kind !== 'OfficialPricing' || source?.parserKey !== 'openai-subscription-pricing' || !source?.pricing) throw new Error('Unsupported official pricing parser')
  const text = cleanMarkup(body)
  const observations = []
  const warnings = []
  for (const plan of source.pricing.plans || []) {
    const amount = findPlanAmount(text, plan.aliases || [plan.plan], source.pricing.currency, plan.billingPeriod)
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

function findPlanAmount(text, aliases, currency, billingPeriod) {
  const periods = billingPeriod === 'month' ? '(?:\/\s*(?:month|mo|월)|per\s+month|monthly)' : billingPeriod === 'year' ? '(?:\/\s*(?:year|yr|년)|per\s+year|annually)' : ''
  const amountPattern = String(currency).toUpperCase() === 'KRW'
    ? `(?:₩\\s*([0-9][0-9,]*(?:\\.\\d+)?)|([0-9][0-9,]*(?:\\.\\d+)?)\\s*원)\\s*${periods}`
    : `(?:US\\s*)?\\$\\s*([0-9][0-9,]*(?:\\.\\d+)?)\\s*${periods}`
  for (const alias of aliases) {
    const index = text.toLowerCase().indexOf(String(alias).toLowerCase())
    if (index < 0) continue
    const match = text.slice(index, index + 2_000).match(new RegExp(amountPattern, 'i'))
    if (match) return match.slice(1).find(Boolean) || null
  }
  return null
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
