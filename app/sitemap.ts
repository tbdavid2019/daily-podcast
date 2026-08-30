import type { MetadataRoute } from 'next'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getBaseUrl } from '@/lib/discovery'

export const dynamic = 'force-dynamic'
export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getBaseUrl()
  const { env } = await getCloudflareContext({ async: true })
  const runEnv = env.NEXTJS_ENV || 'production'

  const dateSet = new Set<string>()

  // 1. 抓取所有現代 script: 格式的歷史集數（永久典藏，無天數上限）
  const scriptList = await env.HACKER_NEWS_KV.list({ prefix: `script:${runEnv}:hacker-news:` })
  for (const key of scriptList.keys) {
    const date = key.name.split(':').pop()
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      dateSet.add(date)
    }
  }

  // 2. 抓取所有舊版 content: 格式的歷史集數（永久保留歷史資產）
  const contentList = await env.HACKER_NEWS_KV.list({ prefix: `content:${runEnv}:hacker-news:` })
  for (const key of contentList.keys) {
    if (key.name.includes(':story-contents:')) {
      continue
    }
    const parts = key.name.split(':')
    const date = parts[3]
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      dateSet.add(date)
    }
  }

  // 由新到舊排序所有歷史集數
  const sortedDates = Array.from(dateSet).sort((a, b) => b.localeCompare(a))

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
