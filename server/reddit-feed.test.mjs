import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fetchRedditHotFeed, parseRedditFeed, redditHotFeedUrl } from '../shared/reddit-feed.mjs'

const fixture = () => readFile(new URL('./fixtures/reddit-hot.xml', import.meta.url), 'utf8')

test('reddit feed url targets the public RSS endpoint with a bounded limit', () => {
  assert.equal(redditHotFeedUrl('LocalLLaMA'), 'https://www.reddit.com/r/LocalLLaMA/hot/.rss?limit=50')
  assert.equal(redditHotFeedUrl('Local LLM', 5), 'https://www.reddit.com/r/Local%20LLM/hot/.rss?limit=5')
  assert.equal(redditHotFeedUrl('LocalLLaMA', 'not-a-number'), 'https://www.reddit.com/r/LocalLLaMA/hot/.rss?limit=50')
})

test('parses atom entries into normalized reddit messages', async () => {
  const entries = parseRedditFeed(await fixture())

  assert.equal(entries.length, 2)
  assert.deepEqual(entries[0], {
    externalId: 't3_1wgcpww',
    author: 'u/rm-rf-rm',
    title: '[Bi-Weekly Megathread] Project Showcase',
    body: "Do you have something you'd like to share with the r/LocalLLaMA community. This is the place for it! Recommendation on presentation: Please share plain english description of what your project does and why people should care about it submitted by /u/rm-rf-rm [link]",
    url: 'https://www.reddit.com/r/LocalLLaMA/comments/1wgcpww/biweekly_megathread_project_showcase/',
    publishedAt: '2026-09-14T19:03:23.000Z',
  })
  assert.equal(entries[1].externalId, 't3_1wmga1r')
  assert.equal(entries[1].title, 'How it feels watching prices go up')
  assert.equal(entries[1].author, 'u/Hyacin75')
  assert.equal(entries[1].publishedAt, '2026-09-21T15:38:08.000Z')
})

test('decodes and strips entry html so message text stays plain', async () => {
  const entries = parseRedditFeed(await fixture())

  assert.ok(entries[0].body.startsWith("Do you have something you'd like to share"))
  assert.equal(entries[1].body, '')
  for (const entry of entries) {
    assert.doesNotMatch(entry.body, /[<>]/)
    assert.doesNotMatch(entry.body, /&(?:amp|quot|nbsp|#39);/)
  }
})

test('ignores malformed or incomplete feeds instead of throwing', () => {
  assert.deepEqual(parseRedditFeed(''), [])
  assert.deepEqual(parseRedditFeed('<feed><entry><title>Missing link and date</title></entry></feed>'), [])
  assert.deepEqual(parseRedditFeed('<entry><title>Bad date</title><link href="https://example.test/x" /><published>yesterday</published></entry>'), [])
  assert.deepEqual(parseRedditFeed('<feed><entry><link href="https://example.test/x" /><published>2026-09-01T00:00:00Z</published></entry></feed>'), [])
})

test('fetches the feed with the configured user agent and retries once on 429', async () => {
  const seen = []
  const responses = [
    new Response('', { status: 429, statusText: 'Too Many Requests' }),
    new Response('<feed><entry><title>ok</title></entry></feed>', { status: 200 }),
  ]
  const fetchImpl = async (url, init) => { seen.push({ url, userAgent: init.headers['User-Agent'] }); return responses.shift() }

  const xml = await fetchRedditHotFeed('https://www.reddit.com/r/x/hot/.rss?limit=1', { fetchImpl, userAgent: 'signalroom-test/1.0', retryDelayMs: 0 })

  assert.equal(seen.length, 2)
  assert.equal(seen[0].userAgent, 'signalroom-test/1.0')
  assert.equal(seen[1].url, 'https://www.reddit.com/r/x/hot/.rss?limit=1')
  assert.match(xml, /<title>ok<\/title>/)
})

test('surfaces non-retryable feed failures without retrying', async () => {
  let calls = 0
  const fetchImpl = async () => { calls += 1; return new Response('', { status: 403, statusText: 'Forbidden' }) }

  await assert.rejects(() => fetchRedditHotFeed('https://www.reddit.com/r/x/hot/.rss', { fetchImpl, retryDelayMs: 0 }), /403/)
  assert.equal(calls, 1)
})

test('gives up after the retry budget is spent', async () => {
  let calls = 0
  const fetchImpl = async () => { calls += 1; return new Response('', { status: 429, statusText: 'Too Many Requests' }) }

  await assert.rejects(() => fetchRedditHotFeed('https://www.reddit.com/r/x/hot/.rss', { fetchImpl, retryDelayMs: 0 }), /429/)
  assert.equal(calls, 2)
})
