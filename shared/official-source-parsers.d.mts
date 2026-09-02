import type { OfficialSource } from './official-source-catalog.d.mts'

export interface CollectedSourceResult {
  source?: OfficialSource
  messages: any[]
  observations?: any[]
  warnings?: string[]
}

export declare function collectOfficialSource(
  configuredSource: unknown,
  options?: { since?: string; observedAt?: string; fetchImpl?: typeof globalThis.fetch },
): Promise<CollectedSourceResult>
export declare function parseOfficialFeed(source: unknown, body: string, since?: string): any[]
export declare function parseOfficialPage(source: unknown, body: string, since?: string): any[]
export declare function parseOfficialPricing(source: unknown, body: string, observedAt?: string): any[]
export declare function parseOfficialSource(source: unknown, body: string, since?: string, observedAt?: string): any[]
