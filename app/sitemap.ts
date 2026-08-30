import type { MetadataRoute } from 'next'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { sitemapDays } from '@/config'
import { getArticleByDate } from '@/lib/content'
import { getBaseUrl } from '@/lib/discovery'
import { getPastDays } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getBaseUrl()
  const { env } = await getCloudflareContext({ async: true })
  const candidateDays = getPastDays(sitemapDays, 8)

  const existingDays = (
    await Promise.all(
      candidateDays.map(async (day) => {
        const article = await getArticleByDate(env, day, 'hacker-news')
        return article ? day : null
      }),
    )
  ).filter(Boolean) as string[]

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    ...existingDays.map(day => ({
      url: `${baseUrl}/post/${day}`,
      lastModified: new Date(day),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ]
}
