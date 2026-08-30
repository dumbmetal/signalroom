/**
 * Provider-agnostic contracts for the ingestion worker/API layer.
 * The browser demo uses `src/data.ts`; production adapters can implement these
 * interfaces without changing report rendering.
 */
import type { Section, SourceKind } from './types'

export interface NormalizedMessage {
  id: string
  source: SourceKind
  sourceId: string
  author: string
  text: string
  url?: string
  publishedAt: string
  engagement: { likes?: number; replies?: number; views?: number; score?: number }
}

export interface SourceAdapter {
  kind: SourceKind
  fetchSince(sourceId: string, since: string): Promise<NormalizedMessage[]>
  health(sourceId: string): Promise<{ ok: boolean; message?: string }>
}

export interface TopicDraft {
  section: Section
  title: string
  summary: string
  confidence: 'High confidence' | 'Mixed signal' | 'Early signal'
  messages: NormalizedMessage[]
}

export interface DailyReport {
  date: string
  generatedAt: string
  topics: TopicDraft[]
  sourceRuns: Array<{ sourceId: string; ok: boolean; count: number; error?: string }>
  delivery?: { telegram: 'pending' | 'sent' | 'failed'; error?: string }
}

export interface Summarizer {
  summarize(messages: NormalizedMessage[], section: Section): Promise<TopicDraft[]>
}

export async function buildDailyReport(
  adapters: SourceAdapter[],
  configuredSources: Array<{ id: string; kind: SourceKind; section: Section }>,
  summarizer: Summarizer,
  since: string,
): Promise<DailyReport> {
  const sourceRuns: DailyReport['sourceRuns'] = []
  const grouped: Record<Section, NormalizedMessage[]> = { crypto: [], ai: [] }

  for (const source of configuredSources) {
    const adapter = adapters.find((candidate) => candidate.kind === source.kind)
    if (!adapter) {
      sourceRuns.push({ sourceId: source.id, ok: false, count: 0, error: `No adapter registered for ${source.kind}` })
      continue
    }
    try {
      const messages = await adapter.fetchSince(source.id, since)
      grouped[source.section].push(...messages)
      sourceRuns.push({ sourceId: source.id, ok: true, count: messages.length })
    } catch (error) {
      sourceRuns.push({ sourceId: source.id, ok: false, count: 0, error: error instanceof Error ? error.message : 'Unknown source error' })
    }
  }

  const [cryptoTopics, aiTopics] = await Promise.all([
    summarizer.summarize(dedupe(grouped.crypto), 'crypto'),
    summarizer.summarize(dedupe(grouped.ai), 'ai'),
  ])

  return { date: since.slice(0, 10), generatedAt: new Date().toISOString(), topics: [...cryptoTopics, ...aiTopics], sourceRuns, delivery: { telegram: 'pending' } }
}

function dedupe(messages: NormalizedMessage[]) {
  const seen = new Set<string>()
  return messages.filter((message) => {
    const key = message.id || `${message.source}:${message.url || message.text.slice(0, 120)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
