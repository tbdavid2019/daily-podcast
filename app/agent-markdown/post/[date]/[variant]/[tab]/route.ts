import { getCloudflareContext } from '@opennextjs/cloudflare'
import { buildArticleMarkdown, getArticleByDate } from '@/lib/content'
import { getBaseUrl, withMarkdownHeaders } from '@/lib/discovery'
import { isValidArticleTab } from '@/lib/playback-share'

export async function GET(_: Request, { params }: { params: Promise<{ date: string, variant: string, tab: string }> }) {
  const { env } = await getCloudflareContext({ async: true })
  const { date, variant, tab } = await params

  if (!isValidArticleTab(tab)) {
    return new Response('Not found', { status: 404 })
  }

  const episodeVariant = variant === 'main' ? 'hacker-news' : variant
  const article = await getArticleByDate(env, date, episodeVariant)

  if (!article) {
    return new Response('Not found', { status: 404 })
  }

  return withMarkdownHeaders(buildArticleMarkdown(getBaseUrl(), article), {
    headers: {
      'Cache-Control': 'public, max-age=600',
    },
  })
}
