export const BROWSER_CACHE_CONTROL = 'public, max-age=60'
export const EDGE_CACHE_CONTROL = 'public, max-age=600, stale-while-revalidate=1800, stale-if-error=86400'
export const PRIVATE_CACHE_CONTROL = 'private, no-store'

export const WEB_CACHE_VARY = [
  'Accept',
  'RSC',
  'Next-Router-State-Tree',
  'Next-Router-Prefetch',
  'Next-Router-Segment-Prefetch',
].join(', ')

const ROUTER_REQUEST_HEADERS = [
  'rsc',
  'next-router-state-tree',
  'next-router-prefetch',
  'next-router-segment-prefetch',
]

interface CachePolicyRequest {
  method: string
  headers: Headers
  url: string
}

export function getWebPageCachePolicy(request: CachePolicyRequest) {
  const isRead = request.method === 'GET' || request.method === 'HEAD'
  const hasRscQuery = new URL(request.url).searchParams.has('_rsc')
  const hasRouterHeader = ROUTER_REQUEST_HEADERS.some(header => request.headers.has(header))
  const isNegotiatedMarkdown = request.headers.get('accept')?.includes('text/markdown')
    && !new URL(request.url).pathname.startsWith('/agent-markdown')
  const isRouterRequest = hasRscQuery || hasRouterHeader

  if (!isRead || isRouterRequest || isNegotiatedMarkdown) {
    return {
      browser: PRIVATE_CACHE_CONTROL,
      edge: PRIVATE_CACHE_CONTROL,
    }
  }

  return {
    browser: BROWSER_CACHE_CONTROL,
    edge: EDGE_CACHE_CONTROL,
  }
}

export function applyWebPageCacheHeaders(request: CachePolicyRequest, response: Response) {
  if (response.status === 304) {
    return response
  }

  const contentType = response.headers.get('Content-Type')?.toLowerCase() ?? ''
  const isHtml = contentType.startsWith('text/html')
  const isMarkdown = contentType.startsWith('text/markdown')
  const isRsc = contentType.startsWith('text/x-component')
  const isSuccessful = response.status >= 200 && response.status < 300

  if (isSuccessful && !isHtml && !isMarkdown && !isRsc) {
    return response
  }

  const policy = isRsc || !isSuccessful
    ? { browser: PRIVATE_CACHE_CONTROL, edge: PRIVATE_CACHE_CONTROL }
    : getWebPageCachePolicy(request)
  const headers = new Headers(response.headers)

  headers.set('Cache-Control', policy.browser)
  headers.set('Cloudflare-CDN-Cache-Control', policy.edge)
  headers.set('Vary', WEB_CACHE_VARY)

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  })
}
