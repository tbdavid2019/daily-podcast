import { getBaseUrl } from '@/lib/discovery'

export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json({
    service: 'daily-podcast',
    status: 'ok',
    version: '1.0.0',
    rss: `${getBaseUrl()}/rss.xml`,
  }, {
    headers: {
      'Cache-Control': 'public, max-age=300',
    },
  })
}
