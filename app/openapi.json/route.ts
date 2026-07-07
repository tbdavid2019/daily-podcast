import { buildOpenApiSpec, getBaseUrl } from '@/lib/discovery'

export async function GET() {
  return new Response(JSON.stringify(buildOpenApiSpec(getBaseUrl()), null, 2), {
    headers: {
      'Content-Type': 'application/openapi+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
