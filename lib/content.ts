import { getCloudflareContext } from '@opennextjs/cloudflare'
import { cache } from 'react'
import { mapScriptToArticle } from '@/lib/utils'
import {
  buildEpisodeIndexKey,
  buildRssCacheKey,
  updateEpisodeIndexDates,
} from '@/workflow/efficiency'

export { buildEpisodeIndexKey, buildRssCacheKey }

interface ContentEnv {
  HACKER_NEWS_KV: KVNamespace
  NEXTJS_ENV?: string
}

export async function getArticleByDate(env: ContentEnv, date: string, variant = 'hacker-news') {
  const runEnv = env.NEXTJS_ENV || 'production'
  const normalizedVariant = variant === 'main' ? 'hacker-news' : variant
  const scriptKey = `script:${runEnv}:${normalizedVariant}:${date}`
  const scriptData = await env.HACKER_NEWS_KV.get(scriptKey, 'json')

  if (scriptData) {
    return mapScriptToArticle(scriptData, runEnv, normalizedVariant)
  }

  if (normalizedVariant !== 'hacker-news') {
    return null
  }

  return (await env.HACKER_NEWS_KV.get(`content:${runEnv}:hacker-news:${date}`, 'json')) as Article | null
}

export const getRequestArticleByDate = cache(async (date: string, variant = 'hacker-news') => {
  const { env } = await getCloudflareContext({ async: true })
  return getArticleByDate(env, date, variant)
})

export async function getEpisodeDates(
  env: ContentEnv,
  variant = 'hacker-news',
  forceRefresh = false,
): Promise<string[]> {
  const runEnv = env.NEXTJS_ENV || 'production'
  const normalizedVariant = variant === 'main' ? 'hacker-news' : variant
  const indexKey = buildEpisodeIndexKey(runEnv, normalizedVariant)

  if (!forceRefresh) {
    const cachedDates = await env.HACKER_NEWS_KV.get<string[]>(indexKey, 'json')
    if (Array.isArray(cachedDates) && cachedDates.length > 0) {
      return cachedDates
    }
  }

  // Fallback: 若尚無索引，掃描一次 KV 建立歷史清單並持久化儲存
  const dateSet = new Set<string>()

  let scriptCursor: string | undefined
  do {
    const scriptList = await env.HACKER_NEWS_KV.list({
      prefix: `script:${runEnv}:${normalizedVariant}:`,
      cursor: scriptCursor,
    })
    for (const key of scriptList.keys) {
      const date = key.name.split(':').pop()
      if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
        dateSet.add(date)
      }
    }
    scriptCursor = scriptList.list_complete ? undefined : scriptList.cursor
  } while (scriptCursor)

  if (normalizedVariant === 'hacker-news') {
    let contentCursor: string | undefined
    do {
      const contentList = await env.HACKER_NEWS_KV.list({
        prefix: `content:${runEnv}:hacker-news:`,
        cursor: contentCursor,
      })
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
      contentCursor = contentList.list_complete ? undefined : contentList.cursor
    } while (contentCursor)
  }

  const sortedDates = Array.from(dateSet).sort((a, b) => b.localeCompare(a))

  if (sortedDates.length > 0) {
    try {
      await env.HACKER_NEWS_KV.put(indexKey, JSON.stringify(sortedDates))
    }
    catch (error) {
      console.warn('Failed to persist episode date index', error)
    }
  }

  return sortedDates
}

export async function appendEpisodeDateToIndex(
  env: ContentEnv,
  date: string,
  variant = 'hacker-news',
): Promise<string[]> {
  const runEnv = env.NEXTJS_ENV || 'production'
  const normalizedVariant = variant === 'main' ? 'hacker-news' : variant
  const indexKey = buildEpisodeIndexKey(runEnv, normalizedVariant)
  const existing = await env.HACKER_NEWS_KV.get<string[]>(indexKey, 'json')
  const nextDates = updateEpisodeIndexDates(existing, date)

  if (!existing || nextDates.length !== existing.length) {
    try {
      await env.HACKER_NEWS_KV.put(indexKey, JSON.stringify(nextDates))
    }
    catch (error) {
      console.warn('Failed to append episode date to index', error)
    }
  }

  return nextDates
}

export async function getHomepageArticles(env: ContentEnv, currentPage = 1, pageSize = 6) {
  const variant = 'hacker-news'
  const sortedDates = await getEpisodeDates(env, variant)
  const totalItems = sortedDates.length
  const totalPages = Math.ceil(totalItems / pageSize) || 1
  const startIndex = (currentPage - 1) * pageSize
  const currentDays = sortedDates.slice(startIndex, startIndex + pageSize)

  const posts = (await Promise.all(
    currentDays.map(async (day) => {
      const article = await getArticleByDate(env, day, variant)
      return article as Article | null
    }),
  )).filter(Boolean) as Article[]

  return {
    posts,
    totalPages,
  }
}

export function buildHomepageMarkdown(baseUrl: string, posts: Article[], currentPage: number, totalPages: number) {
  const lines = [
    '# DAVID888 Daily 每日放送',
    '',
    'AI-generated daily technology podcast episodes in Traditional Chinese.',
    '',
    `- Homepage: ${baseUrl}/`,
    `- RSS: ${baseUrl}/rss.xml`,
    `- API catalog: ${baseUrl}/.well-known/api-catalog`,
    `- Agent skills: ${baseUrl}/.well-known/agent-skills/index.json`,
    '',
    `## Episodes (page ${currentPage} of ${totalPages})`,
    '',
  ]

  for (const post of posts) {
    const summary = post.introContent || post.podcastContent?.split('\n')?.[0] || ''
    lines.push(`### [${post.title}](${baseUrl}/post/${post.date}${post.variant && post.variant !== 'hacker-news' ? `/${post.variant}` : ''})`)
    lines.push('')
    lines.push(`- Date: ${post.date}`)
    if (summary) {
      lines.push(`- Summary: ${summary}`)
    }
    if (post.audio) {
      lines.push(`- Audio: ${baseUrl}/${post.audio}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

export function buildArticleMarkdown(baseUrl: string, article: Article) {
  const lines = [
    `# ${article.title}`,
    '',
    `- Date: ${article.date}`,
    `- Audio: ${baseUrl}/${article.audio}`,
    '',
  ]

  if (article.introContent) {
    lines.push('## Summary', '', article.introContent, '')
  }

  if (article.blogContent) {
    lines.push('## Article', '', article.blogContent, '')
  }

  if (article.podcastContent) {
    lines.push('## Podcast Script', '', article.podcastContent, '')
  }

  if (article.stories?.length) {
    lines.push('## References', '')
    for (const story of article.stories) {
      lines.push(`- [${story.title}](${story.url ?? story.sourceUrl ?? '#'})`)
    }
    lines.push('')
  }

  return lines.join('\n')
}
