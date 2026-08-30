export type Section = 'crypto' | 'ai'
export type SourceKind = 'Telegram' | 'Reddit' | 'X' | 'Threads'

export interface Evidence {
  source: SourceKind
  label: string
  author: string
  excerpt: string
  time: string
  url: string
}

export interface Topic {
  id: string
  rank: number
  section: Section
  title: string
  summary: string
  signal: string
  sources: string[]
  confidence: 'High confidence' | 'Mixed signal' | 'Early signal'
  evidence: Evidence[]
}

export interface Source {
  id: string
  kind: SourceKind
  name: string
  detail: string
  status: 'Connected' | 'Needs setup' | 'Attention'
  count: string
}
