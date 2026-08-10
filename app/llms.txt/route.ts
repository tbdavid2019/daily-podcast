import { buildLlmsTxt, getBaseUrl, withMarkdownHeaders } from '@/lib/discovery'

export async function GET() {
  return withMarkdownHeaders(buildLlmsTxt(getBaseUrl()), {
    headers: {
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
