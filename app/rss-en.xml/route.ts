import { getCloudflareContext } from '@opennextjs/cloudflare'
import { podcastDescriptionEn, podcastTitleEn } from '@/config'
import { buildRssFeedResponse, createRssOptionsResponse } from '@/lib/rss'

export const revalidate = 600

export async function OPTIONS() {
  return createRssOptionsResponse()
}

export async function GET() {
  const { env } = await getCloudflareContext({ async: true })
  return buildRssFeedResponse(env, {
    variant: 'en',
    title: podcastTitleEn,
    description: podcastDescriptionEn,
    feedPath: '/rss-en.xml',
    sitePath: '/en',
    coverImagePath: '/podcast-cover-en.png',
    language: 'en-US',
    categories: ['Technology', 'Tech News'],
    webLinkLabel: 'Detailed episode notes & references: ',
    linksHeading: 'Relevant Links:',
  })
}
