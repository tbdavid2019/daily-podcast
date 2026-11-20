import { Podcast } from 'podcast'
import { podcastOwner, rssDays } from '@/config'
import { buildRssCacheKey, getArticleByDate, getEpisodeDates } from '@/lib/content'
import { getBaseUrl } from '@/lib/discovery'
import { getArticleTimestamp } from '@/lib/utils'
import { EDGE_CACHE_CONTROL } from '@/lib/web-cache-policy'

/**
 * Checks whether RSS candidate episodes already have published audio objects in R2.
 * Uses bounded concurrency so feed generation avoids serial head() latency while
 * keeping simultaneous subrequests within Cloudflare Workers limits.
 */
export interface VerifiedRssPost {
  post: Article
  audioSize: number
  contentType?: string
}

export interface CheckedRssPostsResult {
  verifiedPosts: VerifiedRssPost[]
  hasRecentPendingAudio: boolean
}

const RSS_AUDIO_HEAD_CONCURRENCY = 6
const RECENT_PENDING_AUDIO_WINDOW = 2

export async function checkRssPostsAudio(
  posts: readonly Article[],
  bucket: Pick<R2Bucket, 'head'>,
  concurrency = RSS_AUDIO_HEAD_CONCURRENCY,
): Promise<CheckedRssPostsResult> {
  const verifiedPosts: VerifiedRssPost[] = []
  let hasRecentPendingAudio = false
  const batchSize = Math.max(1, Math.min(concurrency, 6))

  for (let start = 0; start < posts.length; start += batchSize) {
    const batch = posts.slice(start, start + batchSize)
    const heads = await Promise.all(
      batch.map(async (post) => {
        if (!post.audio) {
          return null
        }
        try {
          return await bucket.head(post.audio)
        }
        catch (error) {
          console.warn(`RSS: R2 head failed for ${post.audio}`, error)
          return null
        }
      }),
    )

    heads.forEach((audioInfo, offset) => {
      const postIndex = start + offset
      const post = batch[offset]
      if (!audioInfo) {
        if (post.audio) {
          console.warn(`RSS: Audio file not found in R2 for ${post.date}: ${post.audio}`)
        }
        if (postIndex < RECENT_PENDING_AUDIO_WINDOW) {
          hasRecentPendingAudio = true
        }
        return
      }

      verifiedPosts.push({
        post,
        audioSize: audioInfo.size || 0,
        contentType: audioInfo.httpMetadata?.contentType,
      })
    })
  }

  return {
    verifiedPosts,
    hasRecentPendingAudio,
  }
}

export const RSS_CACHE_TTL_READY_SECONDS = 60 * 60 * 24 * 7
export const RSS_CACHE_TTL_PENDING_SECONDS = 60

// YouTube trims episode descriptions above ~4000 chars; keep buffer to avoid warnings.
const MAX_DESCRIPTION_LENGTH = 3800

function ensureDescriptionLength(value: string): string {
  if (!value || value.length <= MAX_DESCRIPTION_LENGTH) {
    return value
  }
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

function sanitizeRssUrl(url: string | undefined | null): string {
  if (!url) {
    return ''
  }
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

export const RSS_REVALIDATE_SECONDS = 600

export const RSS_RESPONSE_HEADERS = {
  'Content-Type': 'application/xml',
  'Cache-Control': `public, max-age=${RSS_REVALIDATE_SECONDS}`,
  'Cloudflare-CDN-Cache-Control': EDGE_CACHE_CONTROL,
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
} as const

export interface RssFeedEnv {
  HACKER_NEWS_KV: KVNamespace
  HACKER_NEWS_R2: Pick<R2Bucket, 'head'>
  NEXTJS_ENV?: string
  NEXT_STATIC_HOST?: string
}

export interface RssFeedOptions {
  variant: string
  title: string
  description: string
  feedPath: string
  sitePath: string
  coverImagePath: string
  language: string
  categories: string[]
  webLinkLabel: string
  linksHeading: string
}

export function createRssOptionsResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: RSS_RESPONSE_HEADERS,
  })
}

export async function buildRssFeedResponse(env: RssFeedEnv, options: RssFeedOptions): Promise<Response> {
  const runEnv = env.NEXTJS_ENV || 'production'
  const rssCacheKey = buildRssCacheKey(runEnv, options.variant)

  const cachedXml = await env.HACKER_NEWS_KV.get(rssCacheKey, 'text')
  if (cachedXml) {
    return new Response(cachedXml, {
      headers: RSS_RESPONSE_HEADERS,
    })
  }

  const baseUrl = getBaseUrl()
  const isNamedVariant = options.variant !== 'hacker-news'

  const feed = new Podcast({
    title: options.title,
    description: options.description,
    feedUrl: `${baseUrl}${options.feedPath}`,
    siteUrl: `${baseUrl}${options.sitePath}`,
    imageUrl: `${baseUrl}${options.coverImagePath}`,
    language: options.language,
    pubDate: new Date(),
    ttl: 60,
    generator: options.title,
    author: options.title,
    categories: options.categories,
    itunesImage: `${baseUrl}${options.coverImagePath}`,
    itunesCategory: [{ text: 'Technology' }, { text: 'News' }],
    itunesOwner: {
      name: podcastOwner.name,
      email: podcastOwner.email,
    },
    customNamespaces: {
      podcast: 'https://podcastindex.org/namespace/1.0',
    },
  })

  const allEpisodeDates = await getEpisodeDates(env, options.variant)
  const targetDates = allEpisodeDates.slice(0, rssDays)

  const posts = (await Promise.all(
    targetDates.map(day => getArticleByDate(env, day, options.variant)),
  )).filter(Boolean) as Article[]

  const { verifiedPosts, hasRecentPendingAudio } = await checkRssPostsAudio(posts, env.HACKER_NEWS_R2)
  const staticHost = (env.NEXT_STATIC_HOST || '').replace(/\/+$/, '')

  for (const { post, audioSize, contentType } of verifiedPosts) {
    const postPath = isNamedVariant ? `/post/${post.date}/${options.variant}` : `/post/${post.date}`
    const postUrl = `${baseUrl}${postPath}`
    const transcriptUrl = `${postUrl}/transcript.vtt`
    const trimmedLabel = options.webLinkLabel.trimEnd()
    const webLinkText = `${trimmedLabel}${isNamedVariant ? ' ' : ''}${postUrl}`
    const webLinkHtml = `<p><b>${escapeHtml(trimmedLabel)}</b>${isNamedVariant ? ' ' : ''}<a href="${postUrl}">${postUrl}</a></p>`

    const introText = post.introContent || (post.podcastContent ? `${post.podcastContent.slice(0, 300)}...` : '')
    const plainDescription = `${webLinkText}\n\n${introText}`
    const description = ensureDescriptionLength(plainDescription)

    const introHtml = post.introContent ? `<p>${escapeHtml(post.introContent)}</p>` : ''
    const links = (post.stories || [])
      .map((story) => {
        const targetUrl = sanitizeRssUrl(story.hackerNewsUrl || story.url)
        const title = escapeHtml(story.title || '')
        return targetUrl ? `<li><a href="${targetUrl}">${title}</a></li>` : `<li>${title}</li>`
      })
      .join('')
    const linkContent = `<p><b>${escapeHtml(options.linksHeading)}</b></p><ul>${links}</ul>`
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
        url: `${staticHost}/${post.audio}?t=${updatedAt}`,
        type: contentType || (post.audio.endsWith('.wav') ? 'audio/wav' : 'audio/mpeg'),
        size: audioSize,
      },
      customElements: [
        {
          'podcast:transcript': {
            _attr: {
              url: transcriptUrl,
              type: 'text/vtt',
              language: options.language,
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
    console.warn(`Failed to cache ${options.variant} RSS XML in KV`, error)
  }

  return new Response(xml, {
    headers: RSS_RESPONSE_HEADERS,
  })
}
