// @ts-expect-error Node's built-in TypeScript test runner requires the explicit extension.
import { normalizeLiveReport } from './briefing-view.ts'
import type { BriefingReport, Source, SourceKind } from './types'

export interface SettingsState { reportTime: string; timezone: string; telegramEnabled: boolean }
export type LiveReport = BriefingReport

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  if (!(response.headers.get('content-type') || '').includes('application/json')) throw new Error('API is unavailable')
  return response.json() as Promise<T>
}

export async function loadSources(): Promise<Source[]> {
  const rows = await jsonRequest<Array<{ id: string; kind: SourceKind; name: string; detail: string; health: { ok: boolean; message?: string } }>>('/api/sources')
  return rows.map((row) => ({ id: row.id, kind: row.kind, name: row.name, detail: row.detail, status: row.health.ok ? 'Connected' : row.health.message?.includes('missing') ? 'Needs setup' : 'Attention', count: row.health.message || 'Ready' }))
}

export function addSource(input: { kind: SourceKind; name: string; detail: string; section: 'crypto' | 'ai'; config?: Record<string, string> }) {
  return jsonRequest('/api/sources', { method: 'POST', body: JSON.stringify(input) })
}

export function loadSettings() { return jsonRequest<SettingsState>('/api/settings') }
export function saveSettings(settings: SettingsState) { return jsonRequest<SettingsState>('/api/settings', { method: 'PUT', body: JSON.stringify(settings) }) }
export async function loadLiveReport() {
  const raw = await jsonRequest<unknown>('https://signalroom-crawler.wbvcos.workers.dev/api/report')
  const report = normalizeLiveReport(raw)
  if (!report) throw new Error('Invalid live report')
  return report
}
