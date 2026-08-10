import { buildLlmsFullTxt, getBaseUrl, withMarkdownHeaders } from '@/lib/discovery'

export async function GET() {
  return withMarkdownHeaders(buildLlmsFullTxt(getBaseUrl()), {
    headers: {
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
