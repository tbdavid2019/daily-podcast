import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { HOMEPAGE_LINK_HEADER } from '@/lib/discovery'

function wantsMarkdown(request: NextRequest) {
  const accept = request.headers.get('accept') || ''
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
      url.pathname = '/__markdown'
      return withDiscoveryHeaders(NextResponse.rewrite(url), true)
    }

    return withDiscoveryHeaders(NextResponse.next(), true)
  }

  if (pathname.startsWith('/post/')) {
    if (wantsMarkdown(request)) {
      const url = request.nextUrl.clone()
      url.pathname = `/__markdown${pathname}`
      return withDiscoveryHeaders(NextResponse.rewrite(url), false)
    }

    return withDiscoveryHeaders(NextResponse.next(), false)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/', '/post/:path*'],
}
