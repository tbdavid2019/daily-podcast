import { getCloudflareContext } from '@opennextjs/cloudflare'
import { NextResponse } from 'next/server'
import { Podcast } from 'podcast'
import { podcastDescriptionEn, podcastOwner, podcastTitleEn, rssDays } from '@/config'
import { buildRssCacheKey, getArticleByDate, getEpisodeDates } from '@/lib/content'
import { getBaseUrl } from '@/lib/discovery'
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

export async function GET(request: Request) {
  const url = new URL(request.url)
  const force = url.searchParams.get('force') === 'true'

  const { env } = await getCloudflareContext({ async: true })
  const runEnv = env.NEXTJS_ENV || 'production'
  const variant = 'en'
  const rssCacheKey = buildRssCacheKey(runEnv, variant)

  if (!force) {
    const cachedXml = await env.HACKER_NEWS_KV.get(rssCacheKey, 'text')
    if (cachedXml) {
      return new NextResponse(cachedXml, {
        headers: rssHeaders,
      })
    }
  }

  const baseUrl = getBaseUrl()

  const feed = new Podcast({
    title: podcastTitleEn,
    description: podcastDescriptionEn,
    feedUrl: `${baseUrl}/rss-en.xml`,
    siteUrl: `${baseUrl}/en`,
    imageUrl: `${baseUrl}/podcast-cover.png`,
    language: 'en-US',
    pubDate: new Date(),
    ttl: 60,
    generator: podcastTitleEn,
    author: podcastTitleEn,
    categories: ['Technology', 'Tech News'],
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

  const allEpisodeDates = await getEpisodeDates(env, variant)
  const targetDates = allEpisodeDates.slice(0, rssDays)

  const posts = (await Promise.all(
    targetDates.map(day => getArticleByDate(env, day, variant)),
  )).filter(Boolean) as Article[]

  for (const post of posts) {
    const audioInfo = await env.HACKER_NEWS_R2.head(post.audio)

    if (!audioInfo) {
      console.warn(`Audio not ready for ${post.title}, skipping`)
      continue
    }

    const postUrl = `${baseUrl}/post/${post.date}/en`
    const webLinkText = `Detailed episode notes & references: ${postUrl}`
    const webLinkHtml = `<p><b>Detailed episode notes & references:</b> <a href="${postUrl}">${postUrl}</a></p>`

    const introText = post.introContent || (post.podcastContent ? `${post.podcastContent.slice(0, 300)}...` : '')
    const plainDescription = `${webLinkText}\n\n${introText}`
    const description = ensureDescriptionLength(plainDescription)

    const introHtml = post.introContent ? `<p>${escapeHtml(post.introContent)}</p>` : ''
    const links = (post.stories || [])
      .map((s: any) => {
        const targetUrl = sanitizeUrl(s.hackerNewsUrl || s.url)
        const title = escapeHtml(s.title || '')
        return targetUrl ? `<li><a href="${targetUrl}">${title}</a></li>` : `<li>${title}</li>`
      })
      .join('')
    const linkContent = `<p><b>Relevant Links:</b></p><ul>${links}</ul>`
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

  const xml = feed.buildXml()

  try {
    await env.HACKER_NEWS_KV.put(rssCacheKey, xml, {
      expirationTtl: 60 * 60 * 24 * 7,
    })
  }
  catch (error) {
    console.warn('Failed to cache English RSS XML in KV', error)
  }

  return new NextResponse(xml, {
    headers: rssHeaders,
  })
}
