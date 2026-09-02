export interface OfficialSource {
  id: string
  kind: 'OfficialFeed' | 'OfficialPage' | 'OfficialPricing'
  name: string
  section?: string
  url?: string
  publisherId?: string
  trustTier?: 'primary' | 'maintainer' | 'independent' | 'community'
  config?: Record<string, unknown>
}

export declare const OFFICIAL_SOURCE_KINDS: readonly string[]
export declare function getOfficialSource(id: string): OfficialSource
export declare function listOfficialSources(ids?: readonly string[]): OfficialSource[]
export declare function resolveOfficialSource(configuredSource: unknown): OfficialSource
export declare function isAllowedOfficialSourceUrl(source: OfficialSource, value: unknown): boolean
