import { getCloudflareContext } from '@opennextjs/cloudflare'

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const { env } = await getCloudflareContext({ async: true })

  const file = await env.HACKER_NEWS_R2.get(path.join('/'))
  return new Response(file?.body)
}
