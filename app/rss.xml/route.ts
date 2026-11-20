import { getCloudflareContext } from '@opennextjs/cloudflare'
import { podcastCoverImage, podcastDescription, podcastTitle } from '@/config'
import { buildRssFeedResponse, createRssOptionsResponse } from '@/lib/rss'

export const revalidate = 600

export async function OPTIONS() {
  return createRssOptionsResponse()
}

export async function GET() {
  const { env } = await getCloudflareContext({ async: true })
  return buildRssFeedResponse(env, {
    variant: 'hacker-news',
    title: podcastTitle,
    description: podcastDescription,
    feedPath: '/rss.xml',
    sitePath: '',
    coverImagePath: podcastCoverImage,
    language: 'zh-TW',
    categories: ['technology', 'news'],
    webLinkLabel: '詳細網頁版與參考連結：',
    linksHeading: '相關連結：',
  })
}
