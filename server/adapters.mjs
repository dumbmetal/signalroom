import { normalizeMessage } from './pipeline.mjs'
import { collectOfficialSource } from '../shared/official-source-parsers.mjs'
import { resolveOfficialSource } from '../shared/official-source-catalog.mjs'

export function createAdapters(env = process.env) {
  const officialAdapter = (kind) => ({
    kind,
    health: (source) => {
      try { const catalog = resolveOfficialSource(source); return { ok: true, message: `Allowlisted catalog source: ${catalog.name}` } }
      catch (error) { return { ok: false, message: error instanceof Error ? error.message : 'Official source is invalid' } }
    },
    fetchSince: (source, since) => collectOfficialSource(source, { since }),
  })
  return {
    Reddit: { kind: 'Reddit', health: () => ({ ok: true, message: 'Public JSON access' }), fetchSince: (source, since) => fetchReddit(source, since, env) },
    X: { kind: 'X', health: () => ({ ok: Boolean(env.X_BEARER_TOKEN), message: env.X_BEARER_TOKEN ? 'Configured' : 'X_BEARER_TOKEN missing' }), fetchSince: (source, since) => fetchX(source, since, env) },
    Threads: { kind: 'Threads', health: () => ({ ok: Boolean(env.THREADS_ACCESS_TOKEN), message: env.THREADS_ACCESS_TOKEN ? 'Configured' : 'THREADS_ACCESS_TOKEN missing' }), fetchSince: (source, since) => fetchThreads(source, since, env) },
    Telegram: { kind: 'Telegram', health: () => ({ ok: Boolean(env.TELEGRAM_BOT_TOKEN), message: env.TELEGRAM_BOT_TOKEN ? 'Bot configured' : 'TELEGRAM_BOT_TOKEN missing' }), fetchSince: (source, since) => fetchTelegram(source, since, env) },
    OfficialFeed: officialAdapter('OfficialFeed'),
    OfficialPage: officialAdapter('OfficialPage'),
    OfficialPricing: officialAdapter('OfficialPricing'),
  }
}

async function fetchReddit(source, since, env) {
  const subreddit = source.config?.subreddit || source.detail?.replace(/^r\//, '') || source.name
  const response = await request(`https://www.reddit.com/r/${encodeURIComponent(subreddit)}/hot.json?limit=${source.config?.limit || 50}`, { headers: { 'User-Agent': env.REDDIT_USER_AGENT || 'signalroom/0.1' } })
  return (response.data?.children || []).map(({ data }) => normalizeMessage({
    id: data.name, source: 'Reddit', sourceId: `r/${subreddit}`, author: `u/${data.author}`, text: `${data.title}. ${data.selftext || ''}`,
    url: `https://reddit.com${data.permalink}`, publishedAt: new Date(data.created_utc * 1000), engagement: { score: data.score, replies: data.num_comments },
  })).filter((message) => new Date(message.publishedAt) >= new Date(since))
}

async function fetchX(source, since, env) {
  if (!env.X_BEARER_TOKEN) throw new Error('X_BEARER_TOKEN is not configured')
  const query = source.config?.query || source.detail
  const params = new URLSearchParams({ query, max_results: String(source.config?.limit || 50), 'tweet.fields': 'created_at,public_metrics,author_id', start_time: new Date(since).toISOString() })
  const response = await request(`https://api.x.com/2/tweets/search/recent?${params}`, { headers: { Authorization: `Bearer ${env.X_BEARER_TOKEN}` } })
  return (response.data || []).map((post) => normalizeMessage({ id: post.id, source: 'X', sourceId: source.name, author: post.author_id, text: post.text, url: `https://x.com/i/status/${post.id}`, publishedAt: post.created_at, engagement: post.public_metrics }))
}

async function fetchThreads(source, since, env) {
  if (!env.THREADS_ACCESS_TOKEN) throw new Error('THREADS_ACCESS_TOKEN is not configured')
  const userId = source.config?.userId
  if (!userId) throw new Error('Threads source requires config.userId')
  const params = new URLSearchParams({ fields: 'id,text,timestamp,permalink,username', access_token: env.THREADS_ACCESS_TOKEN, limit: String(source.config?.limit || 50) })
  const response = await request(`https://graph.threads.net/v1.0/${encodeURIComponent(userId)}/threads?${params}`)
  return (response.data || []).map((post) => normalizeMessage({ id: post.id, source: 'Threads', sourceId: source.name, author: post.username, text: post.text, url: post.permalink, publishedAt: post.timestamp, engagement: {} })).filter((message) => new Date(message.publishedAt) >= new Date(since))
}

async function fetchTelegram(source, since, env) {
  if (!env.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is not configured')
  const response = await request(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getUpdates?limit=100&timeout=0`)
  const channel = source.config?.chatId || source.detail
  return (response.result || []).map((update) => update.channel_post || update.message).filter(Boolean).filter((message) => String(message.chat?.id) === String(channel) || message.chat?.username === String(channel).replace(/^@/, '')).map((message) => normalizeMessage({
    id: message.message_id, source: 'Telegram', sourceId: message.chat?.title || channel, author: message.author_signature || message.sender_chat?.title || 'channel', text: message.text || message.caption || '',
    url: message.chat?.username ? `https://t.me/${message.chat.username}/${message.message_id}` : '', publishedAt: new Date(message.date * 1000), engagement: {},
  })).filter((message) => message.text && new Date(message.publishedAt) >= new Date(since))
}

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  return response.json()
}
