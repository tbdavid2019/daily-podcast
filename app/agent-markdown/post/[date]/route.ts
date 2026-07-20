import { getCloudflareContext } from '@opennextjs/cloudflare'
import { buildArticleMarkdown, getArticleByDate } from '@/lib/content'
import { getBaseUrl, withMarkdownHeaders } from '@/lib/discovery'

export async function GET(_: Request, { params }: { params: Promise<{ date: string }> }) {
  const { env } = await getCloudflareContext({ async: true })
  const { date } = await params
  const article = await getArticleByDate(env, date)

  if (!article) {
    return new Response('Not found', { status: 404 })
  }

  return withMarkdownHeaders(buildArticleMarkdown(getBaseUrl(), article), {
    headers: {
      'Cache-Control': 'public, max-age=600',
    },
  })
}
