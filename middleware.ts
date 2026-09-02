import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { HOMEPAGE_LINK_HEADER } from '@/lib/discovery'

const ROUTER_HEADERS = ['rsc', 'next-router-state-tree', 'next-router-prefetch', 'next-router-segment-prefetch']

function wantsMarkdown(request: NextRequest) {
  if (request.nextUrl.searchParams.has('_rsc') || ROUTER_HEADERS.some(h => request.headers.has(h))) {
    return false
  }
  const accept = request.headers.get('accept') || ''
  if (/text\/markdown\s*;\s*q=0(?:\.0+)?(?=[,;]|$)/i.test(accept)) {
    return false
  }
  return accept.includes('text/markdown')
}

function withDiscoveryHeaders(response: NextResponse, addLinkHeader: boolean) {
  response.headers.append('Vary', 'Accept')

  if (addLinkHeader) {
    response.headers.set('Link', HOMEPAGE_LINK_HEADER)
  }

  return response
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname === '/') {
    if (wantsMarkdown(request)) {
      const url = request.nextUrl.clone()
      url.pathname = '/agent-markdown'
      return withDiscoveryHeaders(NextResponse.rewrite(url), true)
    }

    return withDiscoveryHeaders(NextResponse.next(), true)
  }

  if (pathname.startsWith('/post/')) {
    if (wantsMarkdown(request)) {
      const url = request.nextUrl.clone()
      url.pathname = `/agent-markdown${pathname}`
      return withDiscoveryHeaders(NextResponse.rewrite(url), false)
    }

    return withDiscoveryHeaders(NextResponse.next(), false)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/', '/post/:path*'],
}
