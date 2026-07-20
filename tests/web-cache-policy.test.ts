import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
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

  it('caches the Markdown representation at the Worker boundary with Accept variance', () => {
    const upstream = new Response('# Podcast', {
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    })
    const response = applyWebPageCacheHeaders(request('GET', { Accept: 'text/markdown' }), upstream)

    assert.equal(response.headers.get('Cloudflare-CDN-Cache-Control'), EDGE_CACHE_CONTROL)
    assert.match(response.headers.get('Vary') ?? '', /(?:^|, )Accept(?:,|$)/i)
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
    const middlewareSource = await readFile(new URL('middleware.ts', rootUrl), 'utf8')
    const markdownRoute = await readFile(new URL('app/agent-markdown/route.ts', rootUrl), 'utf8')

    assert.match(middlewareSource, /url\.pathname = '\/agent-markdown'/)
    assert.doesNotMatch(middlewareSource, /\/__markdown/)
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
})
