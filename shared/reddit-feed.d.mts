export interface RedditFeedEntry {
  externalId: string
  author: string
  title: string
  body: string
  url: string
  publishedAt: string
}

export declare function redditHotFeedUrl(subreddit: string, limit?: number): string
export declare function fetchRedditHotFeed(url: string, options?: {
  fetchImpl?: typeof globalThis.fetch
  userAgent?: string
  retries?: number
  retryDelayMs?: number
}): Promise<string>
export declare function parseRedditFeed(xml: string): RedditFeedEntry[]
