import type { MetadataRoute } from 'next'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getEpisodeDates } from '@/lib/content'
import { getBaseUrl } from '@/lib/discovery'

export const dynamic = 'force-dynamic'
export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getBaseUrl()
  const { env } = await getCloudflareContext({ async: true })
  const sortedDates = await getEpisodeDates(env, 'hacker-news')

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    ...sortedDates.map(day => ({
      url: `${baseUrl}/post/${day}`,
      lastModified: new Date(day),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ]
}
