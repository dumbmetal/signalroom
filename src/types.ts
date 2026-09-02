export type Section = 'crypto' | 'ai'
export type SourceKind = 'Telegram' | 'Reddit' | 'X' | 'Threads'
export type BriefingContentType = 'product_update' | 'price_change' | 'discount_offer' | 'setup_tip' | 'community_opinion'
export type TrustTier = 'primary' | 'maintainer' | 'independent' | 'community'
export type ClaimStatus = 'confirmed' | 'reported' | 'disputed' | 'expired'
export type Freshness = 'fresh' | 'aging' | 'stale'
export type SourceRunStatus = 'ok' | 'partial' | 'error'

export interface Evidence {
  source: string
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
  independentSourceCount?: number
}

export interface Recurrence {
  authorCount: number
  publisherCount: number
  mentionCount: number
  firstSeenAt: string
  lastSeenAt: string
  windowHours: number
}

export interface PricePromotion {
  kind: 'discount' | 'trial' | 'introductory'
  label: string
  originalAmountMinor?: number
  endsAt?: string
}

export interface PriceObservation {
  key: string
  vendor: string
  product: string
  plan: string
  region: string
  currency: string
  amountMinor: number
  billingPeriod: 'month' | 'year' | 'one_time' | 'usage'
  unit: string
  taxMode: 'included' | 'excluded' | 'unknown'
  observedAt: string
  lastVerifiedAt: string
  sourceUrl: string
  sourceKey: string
  publisherId: string
  trustTier: 'primary' | 'maintainer'
  contentHash: string
  promotion?: PricePromotion
}

export interface SourceRun {
  source: string
  kind?: string
  status: SourceRunStatus
  count: number
  checkedAt?: string
  warnings: string[]
  error?: string
}

export interface BriefingReport {
  date: string
  generatedAt: string
  topics: Topic[]
  priceSnapshots: PriceObservation[]
  sourceRuns: SourceRun[] | null
}

export interface Source {
  id: string
  kind: SourceKind
  name: string
  detail: string
  status: 'Connected' | 'Needs setup' | 'Attention'
  count: string
}
