import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { checkRssPostsAudio } from '../lib/rss'
import {
  EDGE_CACHE_CONTROL,
  PRIVATE_CACHE_CONTROL,
  WEB_CACHE_VARY,
  applyWebPageCacheHeaders,
  getWebPageCachePolicy,
} from '../lib/web-cache-policy'

const rootUrl = new URL('../', import.meta.url)

function request(method = 'GET', headers: HeadersInit = {}) {
  return new Request('https://podcast.example/', { method, headers })
}

describe('Web page cache policy', () => {
  it('caches ordinary document requests at the edge without sharing the browser TTL', () => {
    const policy = getWebPageCachePolicy(request())

    assert.equal(policy.browser, 'public, max-age=60')
    assert.equal(policy.edge, EDGE_CACHE_CONTROL)
    assert.doesNotMatch(policy.edge, /s-maxage/)
    assert.match(policy.edge, /max-age=600/)
    assert.match(policy.edge, /stale-while-revalidate=1800/)
  })

  it('bypasses shared caches for RSC and router-prefetch requests', () => {
    const routerHeaders: Array<Record<string, string>> = [
      { RSC: '1' },
      { 'Next-Router-State-Tree': '["",{}]' },
      { 'Next-Router-Prefetch': '1' },
      { 'Next-Router-Segment-Prefetch': '/post' },
    ]

    for (const headers of routerHeaders) {
      const policy = getWebPageCachePolicy(request('GET', headers))
      assert.equal(policy.browser, PRIVATE_CACHE_CONTROL)
      assert.equal(policy.edge, PRIVATE_CACHE_CONTROL)
    }
  })

  it('bypasses shared caches when OpenNext preserves only the RSC query marker', () => {
    const rscRequest = new Request('https://podcast.example/?_rsc=review')
    const policy = getWebPageCachePolicy(rscRequest)

    assert.equal(policy.browser, PRIVATE_CACHE_CONTROL)
    assert.equal(policy.edge, PRIVATE_CACHE_CONTROL)
  })

  it('overrides upstream public headers for an RSC response at the Worker boundary', () => {
    const upstream = new Response('rsc payload', {
      headers: {
        'Cache-Control': 'public, max-age=60',
        'Cloudflare-CDN-Cache-Control': EDGE_CACHE_CONTROL,
        'Content-Type': 'text/x-component',
      },
    })
    const response = applyWebPageCacheHeaders(request(), upstream)

    assert.equal(response.headers.get('Cache-Control'), PRIVATE_CACHE_CONTROL)
    assert.equal(response.headers.get('Cloudflare-CDN-Cache-Control'), PRIVATE_CACHE_CONTROL)
  })

  it('isolates negotiated Markdown representation from shared Edge cache to prevent cache collapsing', () => {
    const upstream = new Response('# Podcast', {
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    })
    const response = applyWebPageCacheHeaders(request('GET', { Accept: 'text/markdown' }), upstream)

    assert.equal(response.headers.get('Cloudflare-CDN-Cache-Control'), 'private, no-store')
  })

  it('does not cache error pages while content may still be generated', () => {
    const upstream = new Response('Not found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
    const response = applyWebPageCacheHeaders(request(), upstream)

    assert.equal(response.headers.get('Cache-Control'), PRIVATE_CACHE_CONTROL)
    assert.equal(response.headers.get('Cloudflare-CDN-Cache-Control'), PRIVATE_CACHE_CONTROL)
  })

  it('preserves 304 revalidation responses for the platform cache', () => {
    const upstream = new Response(null, {
      status: 304,
      headers: { ETag: '"episode"' },
    })
    const response = applyWebPageCacheHeaders(request(), upstream)

    assert.equal(response, upstream)
    assert.equal(response.headers.get('Cache-Control'), null)
  })

  it('bypasses shared caches for non-read methods', () => {
    const policy = getWebPageCachePolicy(request('POST'))

    assert.equal(policy.browser, PRIVATE_CACHE_CONTROL)
    assert.equal(policy.edge, PRIVATE_CACHE_CONTROL)
  })

  it('varies cached documents across markdown and Next router representations', () => {
    for (const header of [
      'Accept',
      'RSC',
      'Next-Router-State-Tree',
      'Next-Router-Prefetch',
      'Next-Router-Segment-Prefetch',
    ]) {
      assert.match(WEB_CACHE_VARY, new RegExp(`(?:^|, )${header}(?:,|$)`, 'i'))
    }
  })
})

describe('Web cache deployment guardrails', () => {
  it('enables pre-invocation Workers caching without sharing entries across deployments', async () => {
    const wranglerConfig = await readFile(new URL('wrangler.jsonc', rootUrl), 'utf8')

    assert.match(wranglerConfig, /"cache"\s*:\s*\{[\s\S]*?"enabled"\s*:\s*true/)
    assert.match(wranglerConfig, /"cross_version_cache"\s*:\s*false/)
    assert.match(wranglerConfig, /"main"\s*:\s*"worker\.js"/)
  })

  it('applies response-aware cache headers outside the generated OpenNext Worker', async () => {
    const workerSource = await readFile(new URL('worker.js', rootUrl), 'utf8')

    assert.match(workerSource, /applyWebPageCacheHeaders\(request, response\)/)
  })

  it('rewrites Markdown negotiation to a routable App Router segment', async () => {
    const proxySource = await readFile(new URL('proxy.ts', rootUrl), 'utf8')
    const markdownRoute = await readFile(new URL('app/agent-markdown/route.ts', rootUrl), 'utf8')

    assert.match(proxySource, /export function proxy\(/)
    assert.match(proxySource, /isTranscriptPath/)
    assert.match(proxySource, /url\.pathname = '\/agent-markdown'/)
    assert.doesNotMatch(proxySource, /\/__markdown/)
    assert.match(markdownRoute, /buildHomepageMarkdown/)
  })

  it('does not retain KV payloads in an unbounded module-global Map', async () => {
    const utilsSource = await readFile(new URL('lib/utils.ts', rootUrl), 'utf8')

    assert.doesNotMatch(utilsSource, /kvMemoryCache|new Map<string,\s*\{\s*data:/)
  })

  it('lets OpenNext select the regional-cache refresh mode that matches cache purge', async () => {
    const openNextConfig = await readFile(new URL('open-next.config.ts', rootUrl), 'utf8')

    assert.doesNotMatch(openNextConfig, /shouldLazilyUpdateOnCacheHit\s*:\s*true/)
  })

  it('bounds RSS R2 head concurrency and skips 7-day KV caching while recent audio is pending', async () => {
    let activeHeads = 0
    let maxActiveHeads = 0
    const posts = Array.from({ length: 10 }, (_, idx) => ({
      date: `2026-11-${String(20 - idx).padStart(2, '0')}`,
      title: `Episode ${idx}`,
      stories: [],
      podcastContent: '',
      blogContent: '',
      introContent: '',
      audio: `2026/11/20/production/hacker-news-${idx}.mp3`,
      updatedAt: 1000 + idx,
    }))

    const bucket = {
      async head(key: string) {
        activeHeads += 1
        maxActiveHeads = Math.max(maxActiveHeads, activeHeads)
        await new Promise(resolve => setTimeout(resolve, 5))
        activeHeads -= 1
        if (key.endsWith('-0.mp3')) {
          return null
        }
        return { size: 12345, httpMetadata: { contentType: 'audio/wav' } } as unknown as R2Object
      },
    }

    const result = await checkRssPostsAudio(posts, bucket, 6)
    assert.ok(maxActiveHeads <= 6, `Expected <= 6 concurrent R2 heads, got ${maxActiveHeads}`)
    assert.equal(result.hasRecentPendingAudio, true)
    assert.equal(result.verifiedPosts.length, 9)
  })

  it('enforces RSS cache safety, zh-TW metadata, and timestamped static audio patterns', async () => {
    const rssSource = await readFile(new URL('app/rss.xml/route.ts', rootUrl), 'utf8')
    const rssEnSource = await readFile(new URL('app/rss-en.xml/route.ts', rootUrl), 'utf8')
    const staticSource = await readFile(new URL('app/static/[...path]/route.ts', rootUrl), 'utf8')

    assert.match(rssSource, /language:\s*'zh-TW'/)
    assert.doesNotMatch(rssSource, /searchParams\.get\('force'\)/)
    assert.doesNotMatch(rssEnSource, /searchParams\.get\('force'\)/)
    assert.match(staticSource, /\(\?:-\\d\{10,14\}\)\?/)
    assert.match(staticSource, /file\.httpMetadata\?\.cacheControl/)
  })

  it('renders sanitized server-side markdown HTML, builds RSS feed responses, and copies text to clipboard', async () => {
    const { renderArticleMarkdownHtml, withRenderedBlogHtml } = await import('../lib/markdown')
    const { buildRssFeedResponse } = await import('../lib/rss')
    const { copyTextToClipboard } = await import('../lib/playback-share')

    const html = renderArticleMarkdownHtml('Visit [Safe](https://example.com), [Internal](/post/2026-11-19), [Anchor](#references), and [Bad](ftp://example.com) and <script>x</script>')
    assert.match(html, /href="https:\/\/example\.com\/"/)
    assert.match(html, /href="\/post\/2026-11-19"/)
    assert.match(html, /href="#references"/)
    assert.match(html, /href="#"/)
    assert.match(html, /target="_blank"/)
    assert.match(html, /rel="nofollow noopener noreferrer"/)
    assert.doesNotMatch(html, /ftp:/)
    assert.doesNotMatch(html, /<script>/)

    const enriched = withRenderedBlogHtml({
      date: '2026-11-20',
      title: 'Test',
      stories: [],
      podcastContent: '',
      blogContent: '# Heading',
      introContent: '',
      audio: 'a.mp3',
      updatedAt: 1,
    })
    assert.match(enriched.blogHtml ?? '', /<h1>Heading<\/h1>/)

    const kvPuts: Array<{ key: string, value: string }> = []
    const rssRes = await buildRssFeedResponse({
      NEXTJS_ENV: 'production',
      NEXT_STATIC_HOST: 'https://static.example.com',
      HACKER_NEWS_KV: {
        get: async (key: string) => {
          if (key === 'index:production:hacker-news:dates')
            return ['2026-11-20']
          if (key === 'script:production:hacker-news:2026-11-20') {
            return {
              displayDate: '2026-11-20',
              title: 'RSS Episode',
              introContent: 'Intro',
              blogContent: 'Body',
              dialogue: [{ speaker: '女', text: 'Hi' }],
              stories: [{ title: 'Story', url: 'https://news.ycombinator.com/item?id=1' }],
              generatedAt: 1234,
              audio: '2026/11/20/production/hacker-news-2026-11-20.mp3',
            }
          }
          return null
        },
        put: async (key: string, value: string) => {
          kvPuts.push({ key, value })
        },
      } as unknown as KVNamespace,
      HACKER_NEWS_R2: {
        head: async () => ({ size: 4096, httpMetadata: { contentType: 'audio/wav' } }) as unknown as R2Object,
      },
    }, {
      variant: 'hacker-news',
      title: 'Feed Title',
      description: 'Feed Desc',
      feedPath: '/rss.xml',
      sitePath: '',
      coverImagePath: '/podcast-cover.png',
      language: 'zh-TW',
      categories: ['technology'],
      webLinkLabel: 'Link: ',
      linksHeading: 'Links:',
    })
    assert.equal(rssRes.status, 200)
    assert.equal(rssRes.headers.get('Content-Type'), 'application/xml')
    const xml = await rssRes.text()
    assert.match(xml, /RSS Episode/)
    assert.match(xml, /audio\/wav/)
    assert.equal(kvPuts.length, 1)

    let copiedText = ''
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        clipboard: {
          writeText: async (text: string) => {
            copiedText = text
          },
        },
      },
    })
    try {
      await copyTextToClipboard('https://podcast.david888.com/post/2026-11-20#t=15')
      assert.equal(copiedText, 'https://podcast.david888.com/post/2026-11-20#t=15')
    }
    finally {
      if (originalDescriptor) {
        Object.defineProperty(globalThis, 'navigator', originalDescriptor)
      }
      else {
        Reflect.deleteProperty(globalThis, 'navigator')
      }
    }
  })
})
