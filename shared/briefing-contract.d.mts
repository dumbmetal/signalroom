export type TrustTier = 'primary' | 'maintainer' | 'independent' | 'community'

export interface BriefingMessage {
  source: string
  sourceId?: string | number
  externalId?: string | number
  id?: string | number
  sourceKey?: string
  publisherId?: string
  independenceKey?: string
  trustTier?: string
  canonicalUrl?: string
  contentHash?: string
  text?: string
  excerpt?: string
  url?: string
  publishedAt?: string
}

export interface NormalizedIdentity {
  sourceKey: string
  publisherId: string
  independenceKey: string
  trustTier: TrustTier
}

export declare const BRIEFING_CONTENT_TYPES: readonly string[]
export declare const TRUST_TIERS: readonly string[]
export declare const CLAIM_STATUSES: readonly string[]

export declare function canonicalizeUrl(value: unknown): string
export declare function fingerprintText(value: unknown): string
export declare function normalizeContentText(value: unknown): string
export declare function normalizeIdentityKey(value: unknown): string
export declare function normalizeSourceDefinition<T extends object>(source: T): T & NormalizedIdentity
export declare function independenceKeyFor(message: Partial<BriefingMessage> | null | undefined): string
export declare function contentHashFor(message: Partial<BriefingMessage> | null | undefined): string
export declare function selectIndependentEvidence<T extends BriefingMessage>(messages: readonly T[]): T[]
export declare function countIndependentCorroboration(messages: readonly BriefingMessage[]): number
export declare function selectCorroboratingEvidence<T extends BriefingMessage>(messages: readonly T[], limit?: number): T[]
export declare function annotateMessage<T extends object>(
  message: T,
  source: unknown,
): T & { externalId: string; sourceId: string; canonicalUrl: string; contentHash: string } & NormalizedIdentity
