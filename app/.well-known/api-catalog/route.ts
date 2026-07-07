import { buildApiCatalog, getBaseUrl } from '@/lib/discovery'

export async function GET() {
  return new Response(JSON.stringify(buildApiCatalog(getBaseUrl()), null, 2), {
    headers: {
      'Content-Type': 'application/linkset+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
