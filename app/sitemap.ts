import type { MetadataRoute } from 'next'
import process from 'node:process'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { sitemapDays } from '@/config'
import { getArticleByDate } from '@/lib/content'
import { getPastDays } from '@/lib/utils'

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? ''
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
