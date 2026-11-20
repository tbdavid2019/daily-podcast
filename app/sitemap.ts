import type { MetadataRoute } from 'next'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getEpisodeDates } from '@/lib/content'
import { getBaseUrl } from '@/lib/discovery'

export const revalidate = 3600

function toValidDate(day: string): Date | undefined {
  const parsed = new Date(`${day}T00:00:00.000Z`)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getBaseUrl()
  const { env } = await getCloudflareContext({ async: true })
  const [zhDates, enDates] = await Promise.all([
    getEpisodeDates(env, 'hacker-news'),
    getEpisodeDates(env, 'en'),
  ])

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/en`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
    ...zhDates.map(day => ({
      url: `${baseUrl}/post/${day}`,
      ...(toValidDate(day) ? { lastModified: toValidDate(day) } : {}),
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...enDates.map(day => ({
      url: `${baseUrl}/post/${day}/en`,
      ...(toValidDate(day) ? { lastModified: toValidDate(day) } : {}),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ]
}
