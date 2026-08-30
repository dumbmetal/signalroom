import { createAdapters } from './adapters.mjs'
import { clusterMessages, corroboratedClusters, dedupeMessages, rankClusters, summarizeClusters } from './pipeline.mjs'
import { annotateMessage, normalizeSourceDefinition } from '../shared/briefing-contract.mjs'

export class ReportService {
  constructor(store, env = process.env) { this.store = store; this.env = env; this.adapters = createAdapters(env); this.inFlight = null }
  async generate(date = localDate(new Date(), 'Europe/London'), force = false) {
    if (this.inFlight) return this.inFlight
    this.inFlight = this.#generate(date, force).finally(() => { this.inFlight = null })
    return this.inFlight
  }
  async #generate(date, force = false) {
    const data = await this.store.read()
    const existing = data.reports.find((report) => report.date === date)
    if (existing && !force) return existing
    const since = localMidnightUtc(date, 'Europe/London')
    const grouped = { crypto: [], ai: [] }
    const sourceRuns = []
    for (const source of data.sources.filter((item) => item.enabled !== false)) {
      const adapter = this.adapters[source.kind]
      if (!adapter) { sourceRuns.push({ sourceId: source.id, ok: false, count: 0, error: `No adapter for ${source.kind}` }); continue }
      try { const normalizedSource = normalizeSourceDefinition(source); const messages = (await adapter.fetchSince(source, since)).map((message) => annotateMessage(message, normalizedSource)); grouped[source.section || (source.kind === 'Telegram' ? 'crypto' : 'ai')].push(...messages); sourceRuns.push({ sourceId: source.id, ok: true, count: messages.length }) }
      catch (error) { sourceRuns.push({ sourceId: source.id, ok: false, count: 0, error: error.message }) }
    }
    const provider = createSummaryProvider(this.env)
    const topics = []
    for (const section of ['crypto', 'ai']) {
      const messages = dedupeMessages(grouped[section])
      const clusters = rankClusters(corroboratedClusters(clusterMessages(messages)))
      topics.push(...await summarizeClusters(clusters, section, provider))
    }
    const report = { date, generatedAt: new Date().toISOString(), topics, sourceRuns, delivery: { telegram: 'pending' } }
    await this.store.update((current) => { current.reports = current.reports.filter((item) => item.date !== date); current.reports.unshift(report); current.reports = current.reports.slice(0, 90); return current })
    if (data.settings.telegramEnabled) await this.deliver(report)
    return report
  }
  async deliver(report) {
    if (!this.env.TELEGRAM_BOT_TOKEN || !this.env.TELEGRAM_REPORT_CHAT_ID) return this.#deliveryState(report, 'failed', 'Telegram delivery credentials are not configured')
    const text = formatTelegramReport(report)
    try {
      const response = await fetch(`https://api.telegram.org/bot${this.env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: this.env.TELEGRAM_REPORT_CHAT_ID, text, disable_web_page_preview: true }), signal: AbortSignal.timeout(15_000) })
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
      return this.#deliveryState(report, 'sent')
    } catch (error) { return this.#deliveryState(report, 'failed', error.message) }
  }
  async #deliveryState(report, telegram, error) { report.delivery = { telegram, ...(error ? { error } : {}) }; await this.store.update((data) => { const index = data.reports.findIndex((item) => item.date === report.date); if (index >= 0) data.reports[index] = report; return data }); return report }
  sourceHealth(source) { const adapter = this.adapters[source.kind]; return adapter ? adapter.health(source) : { ok: false, message: `No adapter for ${source.kind}` } }
}

function createSummaryProvider(env) {
  if (!env.SUMMARY_PROVIDER_URL || !env.SUMMARY_PROVIDER_API_KEY) return null
  return async (clusters, section) => {
    const response = await fetch(env.SUMMARY_PROVIDER_URL, { method: 'POST', headers: { Authorization: `Bearer ${env.SUMMARY_PROVIDER_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: env.SUMMARY_PROVIDER_MODEL, section, clusters: clusters.map((cluster) => cluster.messages.slice(0, 20)) }), signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
    const body = await response.json(); if (!Array.isArray(body.topics)) throw new Error('Provider response must contain topics[]'); return body.topics
  }
}
function formatTelegramReport(report) { const lines = [`Signalroom — ${report.date}`, '']; for (const section of ['crypto', 'ai']) { lines.push(section === 'crypto' ? 'CRYPTO' : 'AI'); const topics = report.topics.filter((topic) => topic.section === section); if (!topics.length) lines.push('No verified topics today.'); topics.forEach((topic, index) => lines.push(`${index + 1}. ${topic.title}\n${topic.summary.slice(0, 350)}`)); lines.push('') } return lines.join('\n').slice(0, 4000) }
export function localDate(date, timezone) { return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date) }
export function localMidnightUtc(date, timezone) {
  const guess = new Date(`${date}T00:00:00.000Z`)
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(guess).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  const wall = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second))
  return new Date(guess.getTime() - (wall - guess.getTime())).toISOString()
}
