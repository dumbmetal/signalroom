const DEFAULT_LIMIT = 50
const DEFAULT_USER_AGENT = 'signalroom/0.1'
const REQUEST_TIMEOUT_MS = 15_000
const RETRY_DELAY_MS = 2_000
const RETRYABLE_STATUS = new Set([429, 503])

export function redditHotFeedUrl(subreddit, limit = DEFAULT_LIMIT) {
  const parsed = Number(limit)
  const safeLimit = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_LIMIT
  return `https://www.reddit.com/r/${encodeURIComponent(String(subreddit || ''))}/hot/.rss?limit=${safeLimit}`
}

export async function fetchRedditHotFeed(url, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch
  const retries = Number.isFinite(Number(options.retries)) ? Number(options.retries) : 1
  const retryDelayMs = Number.isFinite(Number(options.retryDelayMs)) ? Number(options.retryDelayMs) : RETRY_DELAY_MS
  let lastError
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetchImpl(url, {
      headers: { 'User-Agent': options.userAgent || DEFAULT_USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (response.ok) return response.text()
    lastError = new Error(`${response.status} ${response.statusText}`)
    if (!RETRYABLE_STATUS.has(response.status) || attempt === retries) throw lastError
    if (retryDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
  }
  throw lastError
}

export function parseRedditFeed(xml) {
  const entries = [...String(xml || '').matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map((match) => match[1])
  return entries.flatMap((entry) => {
    const title = tagText(entry, 'title')
    const url = linkHref(entry)
    const publishedAt = toIsoTimestamp(tagText(entry, 'published') || tagText(entry, 'updated'))
    if (!title || !url || !publishedAt) return []
    return [{
      externalId: tagText(entry, 'id'),
      author: tagText(entry, 'name').replace(/^\/+/, ''),
      title,
      body: cleanText(tagText(entry, 'content')),
      url,
      publishedAt,
    }]
  })
}

function tagText(block, name) {
  const match = String(block || '').match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i'))
  return match ? decodeEntities(match[1]).trim() : ''
}

function linkHref(block) {
  const element = String(block || '').match(/<link\b([^>]*)\/?>/i)
  const href = element ? element[1].match(/\bhref=["']([^"']+)["']/i) : null
  return href ? decodeEntities(href[1]).trim() : ''
}

function cleanText(value) {
  const decoded = decodeEntities(decodeEntities(String(value || '').replace(/^<!\[CDATA\[|\]\]>$/g, '')))
  return decoded.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function toIsoTimestamp(value) {
  const time = Date.parse(String(value || ''))
  return Number.isFinite(time) ? new Date(time).toISOString() : ''
}

function decodeEntities(value) {
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
