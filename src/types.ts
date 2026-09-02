export type Section = 'crypto' | 'ai'
export type SourceKind = 'Telegram' | 'Reddit' | 'X' | 'Threads'
export type BriefingContentType = 'product_update' | 'price_change' | 'discount_offer' | 'setup_tip' | 'community_opinion'
export type TrustTier = 'primary' | 'maintainer' | 'independent' | 'community'
export type ClaimStatus = 'confirmed' | 'reported' | 'disputed' | 'expired'
export type Freshness = 'fresh' | 'aging' | 'stale'

export interface Recurrence {
  authorCount: number
  publisherCount: number
  mentionCount: number
  firstSeenAt: string
  lastSeenAt: string
  windowHours: number
}

export interface Evidence {
  source: SourceKind
  label: string
  author: string
  excerpt: string
  time: string
  url: string
  sourceKey?: string
  publisherId?: string
  independenceKey?: string
  trustTier?: TrustTier
  contentHash?: string
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
  contentType?: BriefingContentType
  status?: ClaimStatus
  freshness?: Freshness
  lastVerifiedAt?: string
  priceKeys?: string[]
  recurrence?: Recurrence
}

export interface Source {
  id: string
  kind: SourceKind
  name: string
  detail: string
  status: 'Connected' | 'Needs setup' | 'Attention'
  count: string
}
