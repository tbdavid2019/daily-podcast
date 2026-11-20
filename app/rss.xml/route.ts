import { getCloudflareContext } from '@opennextjs/cloudflare'

import { NextResponse } from 'next/server'
import { Podcast } from 'podcast'
import { podcastCoverImage, podcastDescription, podcastOwner, podcastTitle, rssDays } from '@/config'
import { buildRssCacheKey, getArticleByDate, getEpisodeDates } from '@/lib/content'
import { getBaseUrl } from '@/lib/discovery'
import { checkRssPostsAudio, RSS_CACHE_TTL_PENDING_SECONDS, RSS_CACHE_TTL_READY_SECONDS } from '@/lib/rss'
import { getArticleTimestamp } from '@/lib/utils'
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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function sanitizeUrl(url: string | undefined | null): string {
  if (!url)
    return ''
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return escapeHtml(parsed.href)
    }
  }
  catch {
    // invalid URL
  }
  return ''
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
  const { env } = await getCloudflareContext({ async: true })
  const runEnv = env.NEXTJS_ENV || 'production'
  const variant = 'hacker-news'
  const rssCacheKey = buildRssCacheKey(runEnv, variant)

  const cachedXml = await env.HACKER_NEWS_KV.get(rssCacheKey, 'text')
  if (cachedXml) {
    return new NextResponse(cachedXml, {
      headers: rssHeaders,
    })
  }

  const baseUrl = getBaseUrl()

  // 如果沒有快取，產生新的回應
  const feed = new Podcast({
    title: podcastTitle,
    description: podcastDescription,
    feedUrl: `${baseUrl}/rss.xml`,
    siteUrl: baseUrl,
    imageUrl: `${baseUrl}${podcastCoverImage}`,
    language: 'zh-TW',
    pubDate: new Date(),
    ttl: 60,
    generator: podcastTitle,
    author: podcastTitle,
    categories: ['technology', 'news'],
    itunesImage: `${baseUrl}${podcastCoverImage}`,
    itunesCategory: [{ text: 'Technology' }, { text: 'News' }],
    itunesOwner: {
      name: podcastOwner.name,
      email: podcastOwner.email,
    },
    customNamespaces: {
      podcast: 'https://podcastindex.org/namespace/1.0',
    },
  })

  // 從 Episode Index 抓取現存歷史日期，不進行 90 天盲搜
  const allEpisodeDates = await getEpisodeDates(env, variant)
  const targetDates = allEpisodeDates.slice(0, rssDays)

  const posts = (await Promise.all(
    targetDates.map(day => getArticleByDate(env, day, variant)),
  )).filter(Boolean) as Article[]

  const { verifiedPosts, hasRecentPendingAudio } = await checkRssPostsAudio(posts, env.HACKER_NEWS_R2)

  for (const { post, audioSize, contentType } of verifiedPosts) {
    const postUrl = `${baseUrl}/post/${post.date}`
    const webLinkText = `詳細網頁版與參考連結：${postUrl}`
    const webLinkHtml = `<p><b>詳細網頁版與參考連結：</b><a href="${postUrl}">${postUrl}</a></p>`

    const introText = post.introContent || (post.podcastContent ? `${post.podcastContent.slice(0, 300)}...` : '')
    const plainDescription = `${webLinkText}\n\n${introText}`
    const description = ensureDescriptionLength(plainDescription)

    const introHtml = post.introContent ? `<p>${escapeHtml(post.introContent)}</p>` : ''
    const links = post.stories
      .map((s: any) => {
        const targetUrl = sanitizeUrl(s.hackerNewsUrl || s.url)
        const title = escapeHtml(s.title || '')
        return targetUrl ? `<li><a href="${targetUrl}">${title}</a></li>` : `<li>${title}</li>`
      })
      .join('')
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
        type: contentType || (post.audio.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg'),
        size: audioSize,
      },
      customElements: [
        {
          'podcast:transcript': {
            _attr: {
              url: `${baseUrl}/post/${post.date}/transcript.vtt`,
              type: 'text/vtt',
              language: 'zh-TW',
            },
          },
        },
      ],
    })
  }

  const xml = feed.buildXml()

  try {
    await env.HACKER_NEWS_KV.put(rssCacheKey, xml, {
      expirationTtl: hasRecentPendingAudio ? RSS_CACHE_TTL_PENDING_SECONDS : RSS_CACHE_TTL_READY_SECONDS,
    })
  }
  catch (error) {
    console.warn('Failed to cache RSS XML in KV', error)
  }

  const response = new NextResponse(xml, {
    headers: rssHeaders,
  })

  return response
}
