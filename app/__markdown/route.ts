import { getCloudflareContext } from '@opennextjs/cloudflare'
import { buildHomepageMarkdown, getHomepageArticles } from '@/lib/content'
import { getBaseUrl, withMarkdownHeaders } from '@/lib/discovery'

export async function GET(request: Request) {
  const { env } = await getCloudflareContext({ async: true })
  const url = new URL(request.url)
  const currentPage = Number(url.searchParams.get('page')) || 1
  const { posts, totalPages } = await getHomepageArticles(env, currentPage)
  const markdown = buildHomepageMarkdown(getBaseUrl(), posts, currentPage, totalPages)

  return withMarkdownHeaders(markdown, {
    headers: {
      'Cache-Control': 'public, max-age=600',
      'link': '</.well-known/api-catalog>; rel="api-catalog"',
    },
  })
}
