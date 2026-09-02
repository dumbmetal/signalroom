#!/usr/bin/env node

import { readFile } from 'node:fs/promises'

const workerUrl = process.env.SIGNALROOM_WORKER_URL || 'https://signalroom-crawler.wbvcos.workers.dev'
const gatewayUrl = process.env.MTPLX_GATEWAY_URL || 'http://127.0.0.1:8010/v1'
const model = process.env.MTPLX_MODEL || 'mtplx-qwen38-27b-optimized-speed-fp16'
const tokenPath = process.env.SIGNALROOM_IMPORT_TOKEN_FILE || `${process.env.HOME}/.config/signalroom/worker-import-token`
const token = (await readFile(tokenPath, 'utf8')).trim()

const draft = await fetchJson(`${workerUrl}/api/crawl?summary=off`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
if (!Array.isArray(draft.topics) || draft.topics.length === 0) {
  console.log(JSON.stringify({ ok: true, topics: 0, message: 'No topics to summarize' }))
  process.exit(0)
}

const compactTopics = draft.topics.map((topic) => ({
  id: topic.id,
  rank: topic.rank,
  sources: topic.sources,
  evidence: topic.evidence.slice(0, 4).map((item) => ({ source: item.label, text: item.excerpt.slice(0, 500) })),
}))

const completion = await fetchJson(`${gatewayUrl}/chat/completions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model,
    temperature: 0.1,
    max_tokens: 6000,
    messages: [
      { role: 'system', content: 'You are an editorial analyst for Korean crypto Telegram conversations. Return only a JSON array. For every input topic return exactly {"id":"unchanged","title":"concise Korean headline","summary":"2-3 concise Korean sentences"}. Prioritize what multiple distinct channels independently mention. Never invent facts or sources. State uncertainty when evidence disagrees.' },
      { role: 'user', content: JSON.stringify(compactTopics) },
    ],
  }),
}, 180_000)

const content = completion?.choices?.[0]?.message?.content
if (typeof content !== 'string') throw new Error('MTPLX returned no message content')
const summaries = parseJsonArray(content)
const byId = new Map(summaries.map((summary) => [summary.id, summary]))
const topics = draft.topics.map((topic) => {
  const summary = byId.get(topic.id)
  return summary ? { ...topic, title: String(summary.title || topic.title), summary: String(summary.summary || topic.summary) } : topic
})

const imported = await fetchJson(`${workerUrl}/api/report/import`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ ...draft, topics, summarizedAt: new Date().toISOString(), summaryModel: model }),
})

console.log(JSON.stringify({ ok: true, topics: imported.topics.length, provider: imported.summaryProvider, model }))

async function fetchJson(url, init = {}, timeout = 30_000) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeout) })
  const body = await response.text()
  if (!response.ok) throw new Error(`${url} returned ${response.status}: ${body.slice(0, 300)}`)
  return JSON.parse(body)
}

function parseJsonArray(value) {
  const cleaned = value.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  if (start < 0 || end < start) throw new Error('MTPLX response did not contain a JSON array')
  const parsed = JSON.parse(cleaned.slice(start, end + 1))
  if (!Array.isArray(parsed)) throw new Error('MTPLX response was not an array')
  return parsed
}
