import process from 'node:process'
import { getCloudflareContext } from '@opennextjs/cloudflare'

import { NextResponse } from 'next/server'
import { Podcast } from 'podcast'
import { podcastDescription, podcastOwner, podcastTitle, rssDays } from '@/config'
import { getArticleByDate } from '@/lib/content'
import { getArticleTimestamp, getPastDays } from '@/lib/utils'
import { EDGE_CACHE_CONTROL } from '@/lib/web-cache-policy'

// YouTube trims episode descriptions above ~4000 chars; keep buffer to avoid warnings.
const MAX_DESCRIPTION_LENGTH = 3800

function ensureDescriptionLength(value: string) {
  if (!value)
    return value
  if (value.length <= MAX_DESCRIPTION_LENGTH)
    return value
  return `${value.slice(0, MAX_DESCRIPTION_LENGTH - 3).trimEnd()}...`
}

export const revalidate = 600

const rssHeaders = {
  'Content-Type': 'application/xml',
  'Cache-Control': `public, max-age=${revalidate}`,
  'Cloudflare-CDN-Cache-Control': EDGE_CACHE_CONTROL,
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: rssHeaders,
  })
}

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? ''

  // 如果没有缓存，生成新的响应
  const feed = new Podcast({
    title: podcastTitle,
    description: podcastDescription,
    feedUrl: `${baseUrl}/rss.xml`,
    siteUrl: baseUrl,
    imageUrl: `${baseUrl}/podcast-cover.png`,
    language: 'zh-CN',
    pubDate: new Date(),
    ttl: 60,
    generator: podcastTitle,
    author: podcastTitle,
    categories: ['technology', 'news'],
    itunesImage: `${baseUrl}/podcast-cover.png`,
    itunesCategory: [{ text: 'Technology' }, { text: 'News' }],
    itunesOwner: {
      name: podcastOwner.name,
      email: podcastOwner.email,
    },
    customNamespaces: {
      podcast: 'https://podcastindex.org/namespace/1.0',
    },
  })

  const { env } = await getCloudflareContext({ async: true })
  const variant = 'hacker-news'
  const pastDays = getPastDays(rssDays, 8)
  const posts = (await Promise.all(
    pastDays.map(day => getArticleByDate(env, day, variant)),
  )).filter(Boolean)

  for (const post of posts) {
    const audioInfo = await env.HACKER_NEWS_R2.head(post.audio)

    // 如果音檔還沒上傳完成，暫時不顯示在 RSS 中，避免 YouTube 抓取失敗
    if (!audioInfo) {
      console.warn(`Audio not ready for ${post.title}, skipping`)
      continue
    }

    const postUrl = `${baseUrl}/post/${post.date}`
    const webLinkText = `詳細網頁版與參考連結：${postUrl}`
    const webLinkHtml = `<p><b>詳細網頁版與參考連結：</b><a href="${postUrl}">${postUrl}</a></p>`

    const introText = post.introContent || (post.podcastContent ? `${post.podcastContent.slice(0, 300)}...` : '')
    const plainDescription = `${webLinkText}\n\n${introText}`
    const description = ensureDescriptionLength(plainDescription)

    const introHtml = post.introContent ? `<p>${post.introContent}</p>` : ''
    const links = post.stories.map((s: any) => `<li><a href="${s.hackerNewsUrl || s.url || ''}">${s.title || ''}</a></li>`).join('')
    const linkContent = `<p><b>相關連結：</b></p><ul>${links}</ul>`
    const finalContent = `<div>${webLinkHtml}${introHtml}<hr/>${linkContent}</div>`
    const updatedAt = getArticleTimestamp(post.date, post.updatedAt)

    feed.addItem({
      title: post.title || '',
      description,
      content: finalContent,
      url: postUrl,
      guid: postUrl,
      date: new Date(updatedAt),
      enclosure: {
        url: `${env.NEXT_STATIC_HOST}/${post.audio}?t=${updatedAt}`,
        type: 'audio/mpeg',
        size: audioInfo?.size,
      },
    })
  }

  const response = new NextResponse(feed.buildXml(), {
    headers: rssHeaders,
  })

  return response
}
