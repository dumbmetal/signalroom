export interface QualityTopic {
  id?: string
  contentType?: string
  status?: string
  lastVerifiedAt?: string
  evidence?: any[]
  sources?: string[]
  [key: string]: unknown
}

export interface TopicHistoryEntry {
  fingerprint: string
  firstSeenAt: string
  lastSeenAt: string
  authors?: string[]
  publishers?: string[]
  mentions?: number
}

export declare function classifyContent(topic?: unknown, context?: unknown): { contentType: string; confidence: string }
export declare function claimStatusFor(topic?: unknown, options?: unknown): string
export declare function freshnessFor(contentType: string, lastVerifiedAt: string, options?: unknown): 'fresh' | 'aging' | 'stale'
export declare function enrichTopic(topic: unknown, options?: unknown): Record<string, unknown>
export declare function dedupeNearDuplicates<T extends object>(messages: readonly T[], options?: unknown): T[]
export declare function topicFingerprint(topic: unknown): string
export declare function updateTopicHistory(previousHistory: readonly TopicHistoryEntry[], topics: readonly QualityTopic[], options?: unknown): TopicHistoryEntry[]
export declare function recurrenceFor(topic: unknown, history: readonly TopicHistoryEntry[], options?: unknown): Record<string, unknown>
export declare function enrichTopicsWithHistory(
  topics: readonly QualityTopic[],
  previousHistory: readonly TopicHistoryEntry[],
  options?: unknown,
): { topics: Record<string, unknown>[]; topicHistory: TopicHistoryEntry[] }
export declare function isReportableTopic(topic: unknown): boolean
export declare function topicHistoryFromReports(reports: readonly any[], options?: unknown): TopicHistoryEntry[]
