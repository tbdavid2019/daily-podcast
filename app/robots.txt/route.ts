import { buildRobotsTxt, getBaseUrl } from '@/lib/discovery'

export async function GET() {
  return new Response(buildRobotsTxt(getBaseUrl()), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
