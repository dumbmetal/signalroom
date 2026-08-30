import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { JsonStore } from './store.mjs'
import { ReportService, localDate } from './report-service.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const store = new JsonStore(path.join(root, 'data', 'store.json'))
const reports = new ReportService(store)
const port = Number(process.env.PORT || 8787)

const server = http.createServer(async (request, response) => {
  try { await route(request, response) }
  catch (error) { console.error(error); json(response, 500, { error: 'Internal server error' }) }
})

async function route(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`)
  if (url.pathname === '/api/health') return json(response, 200, { ok: true, time: new Date().toISOString() })
  if (url.pathname === '/api/settings' && request.method === 'GET') return json(response, 200, (await store.read()).settings)
  if (url.pathname === '/api/settings' && request.method === 'PUT') { const body = await readJson(request); if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.reportTime || '')) return json(response, 400, { error: 'reportTime must be HH:MM' }); const data = await store.update((current) => { current.settings = { ...current.settings, reportTime: body.reportTime, timezone: String(body.timezone || current.settings.timezone), telegramEnabled: Boolean(body.telegramEnabled) }; return current }); return json(response, 200, data.settings) }
  if (url.pathname === '/api/sources' && request.method === 'GET') { const data = await store.read(); return json(response, 200, data.sources.map((source) => ({ ...source, health: reports.sourceHealth(source) }))) }
  if (url.pathname === '/api/sources' && request.method === 'POST') { const body = await readJson(request); if (!['Telegram', 'Reddit', 'X', 'Threads'].includes(body.kind) || !body.name) return json(response, 400, { error: 'kind and name are required' }); const source = { id: crypto.randomUUID(), kind: body.kind, name: String(body.name), detail: String(body.detail || ''), section: body.section === 'crypto' ? 'crypto' : 'ai', enabled: body.enabled !== false, config: safeConfig(body.config) }; await store.update((data) => { data.sources.push(source); return data }); return json(response, 201, source) }
  if (url.pathname.startsWith('/api/sources/') && request.method === 'PATCH') { const id = url.pathname.split('/').pop(); const body = await readJson(request); let updated; await store.update((data) => { const index = data.sources.findIndex((source) => source.id === id); if (index < 0) return data; updated = data.sources[index] = { ...data.sources[index], ...pick(body, ['name', 'detail', 'section', 'enabled']), ...(body.config ? { config: safeConfig(body.config) } : {}) }; return data }); return updated ? json(response, 200, updated) : json(response, 404, { error: 'Source not found' }) }
  if (url.pathname === '/api/reports' && request.method === 'GET') { const data = await store.read(); return json(response, 200, data.reports.map(({ date, generatedAt, topics, sourceRuns, delivery }) => ({ date, generatedAt, topicCount: topics.length, sourceRuns, delivery, headline: topics[0]?.title || 'No verified topics' }))) }
  if (url.pathname === '/api/report' && request.method === 'GET') { const data = await store.read(); const report = url.searchParams.get('date') ? data.reports.find((item) => item.date === url.searchParams.get('date')) : data.reports[0]; return report ? json(response, 200, report) : json(response, 404, { error: 'Report not found' }) }
  if (url.pathname === '/api/reports/generate' && request.method === 'POST') { const body = await readJson(request); const date = body.date || localDate(new Date(), (await store.read()).settings.timezone); return json(response, 200, await reports.generate(date, Boolean(body.force))) }
  if (url.pathname === '/api/delivery/telegram' && request.method === 'POST') { const body = await readJson(request); const data = await store.read(); const report = data.reports.find((item) => item.date === body.date) || data.reports[0]; return report ? json(response, 200, await reports.deliver(report)) : json(response, 404, { error: 'Report not found' }) }
  return serveStatic(url.pathname, response)
}

async function serveStatic(pathname, response) {
  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
  const distRoot = path.resolve(root, 'dist')
  let file = path.resolve(distRoot, requested)
  const relative = path.relative(distRoot, file)
  if (relative.startsWith('..') || path.isAbsolute(relative)) return json(response, 403, { error: 'Forbidden' })
  try { if (!(await stat(file)).isFile()) throw new Error('not file') } catch { file = path.resolve(root, 'dist', 'index.html') }
  const ext = path.extname(file); const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' }
  response.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable' }); response.end(await readFile(file))
}
function json(response, status, value) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(value)); }
async function readJson(request) { const chunks = []; let size = 0; for await (const chunk of request) { size += chunk.length; if (size > 1_000_000) throw new Error('Payload too large'); chunks.push(chunk) } if (!chunks.length) return {}; try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return {} } }
function pick(value, keys) { return Object.fromEntries(keys.filter((key) => value[key] !== undefined).map((key) => [key, value[key]])) }
function safeConfig(config) { const allowed = ['subreddit', 'query', 'userId', 'chatId', 'limit']; return pick(config || {}, allowed) }

setInterval(async () => {
  const data = await store.read(); const now = new Date(); const timezone = data.settings.timezone || 'Europe/London'; const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])); const date = localDate(now, timezone)
  if (`${parts.hour}:${parts.minute}` === data.settings.reportTime && data.lastScheduledDate !== date) { await store.update((current) => { current.lastScheduledDate = date; return current }); reports.generate(date).catch((error) => console.error('Scheduled report failed', error)) }
}, 30_000).unref()

server.listen(port, '127.0.0.1', () => console.log(`Signalroom listening on http://127.0.0.1:${port}`))
