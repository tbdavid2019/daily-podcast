import type { EpisodeCatalogEntry } from '@/workflow/efficiency'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { cache } from 'react'
import { getArticleTimestamp, mapScriptToArticle } from '@/lib/utils'
import {
  buildEpisodeCatalogKey,
  buildEpisodeIndexKey,
  buildRssCacheKey,
  parseEpisodeCatalogIndex,
  updateEpisodeIndexDates,
} from '@/workflow/efficiency'

export { buildEpisodeCatalogKey, buildEpisodeIndexKey, buildRssCacheKey }

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

export function resolveCatalogIntroSummary(introContent?: string, podcastContent?: string): string {
  const trimmedIntro = introContent?.trim()
  if (trimmedIntro) {
    return trimmedIntro
  }
  const firstLine = podcastContent?.split('\n')?.[0]?.trim()
  return firstLine || ''
}

function catalogEntryToArticle(entry: EpisodeCatalogEntry, fallbackVariant: string): Article {
  return {
    date: entry.date,
    title: entry.title,
    stories: [],
    podcastContent: '',
    blogContent: '',
    introContent: entry.introContent,
    audio: entry.audio,
    updatedAt: entry.updatedAt,
    variant: entry.variant || fallbackVariant,
    ...(typeof entry.audioDurationSec === 'number' ? { audioDurationSec: entry.audioDurationSec } : {}),
  }
}

export function articleToCatalogEntry(article: Article, fallbackVariant: string): EpisodeCatalogEntry {
  return {
    date: article.date,
    title: article.title,
    introContent: resolveCatalogIntroSummary(article.introContent, article.podcastContent),
    audio: article.audio,
    updatedAt: getArticleTimestamp(article.date, article.updatedAt),
    variant: article.variant || fallbackVariant,
    ...(typeof article.audioDurationSec === 'number' ? { audioDurationSec: article.audioDurationSec } : {}),
  }
}

export async function getEpisodeCatalog(
  env: ContentEnv,
  variant = 'hacker-news',
): Promise<{ entries: EpisodeCatalogEntry[], seeded: boolean }> {
  const runEnv = env.NEXTJS_ENV || 'production'
  const normalizedVariant = variant === 'main' ? 'hacker-news' : variant
  const catalogKey = buildEpisodeCatalogKey(runEnv, normalizedVariant)
  const cached = await env.HACKER_NEWS_KV.get<unknown>(catalogKey, 'json')
  const parsed = parseEpisodeCatalogIndex(cached)
  return {
    entries: parsed.entries,
    seeded: Boolean(parsed.seeded),
  }
}

export async function getHomepageArticles(env: ContentEnv, currentPage = 1, pageSize = 6, variant = 'hacker-news') {
  const normalizedVariant = variant === 'main' ? 'hacker-news' : variant
  const safePageSize = Number.isFinite(pageSize) && pageSize >= 1 ? Math.floor(pageSize) : 6
  const catalog = await getEpisodeCatalog(env, normalizedVariant)

  if (catalog.seeded && catalog.entries.length > 0) {
    const totalItems = catalog.entries.length
    const totalPages = Math.ceil(totalItems / safePageSize) || 1
    const normalizedPage = Number.isFinite(currentPage) && currentPage >= 1
      ? Math.min(Math.floor(currentPage), totalPages)
      : 1
    const startIndex = (normalizedPage - 1) * safePageSize
    const currentEntries = catalog.entries.slice(startIndex, startIndex + safePageSize)

    return {
      posts: currentEntries.map(entry => catalogEntryToArticle(entry, normalizedVariant)),
      totalPages,
      currentPage: normalizedPage,
    }
  }

  // Fallback when catalog is unseeded or incomplete: read ONLY the requested page slice (<= pageSize KV reads),
  // overlaying any newer catalog entries without performing unbounded full-history scans or GET KV writes.
  const sortedDates = await getEpisodeDates(env, normalizedVariant)
  const totalItems = sortedDates.length
  const totalPages = Math.ceil(totalItems / safePageSize) || 1
  const normalizedPage = Number.isFinite(currentPage) && currentPage >= 1
    ? Math.min(Math.floor(currentPage), totalPages)
    : 1
  const startIndex = (normalizedPage - 1) * safePageSize
  const currentDays = sortedDates.slice(startIndex, startIndex + safePageSize)

  const catalogByDate = new Map(catalog.entries.map(entry => [entry.date, entry]))
  const missingDays = currentDays.filter(day => !catalogByDate.has(day))
  const fetchedArticles = missingDays.length > 0
    ? await Promise.all(missingDays.map(day => getArticleByDate(env, day, normalizedVariant)))
    : []
  const fetchedByDate = new Map<string, Article>()
  missingDays.forEach((day, idx) => {
    const article = fetchedArticles[idx]
    if (article) {
      fetchedByDate.set(day, article)
    }
  })

  const posts: Article[] = []
  for (const day of currentDays) {
    const catalogEntry = catalogByDate.get(day)
    if (catalogEntry) {
      posts.push(catalogEntryToArticle(catalogEntry, normalizedVariant))
      continue
    }
    const article = fetchedByDate.get(day)
    if (article) {
      posts.push(article)
    }
  }

  return {
    posts,
    totalPages,
    currentPage: normalizedPage,
  }
}

export function buildHomepageMarkdown(baseUrl: string, posts: Article[], currentPage: number, totalPages: number, staticHost?: string) {
  const audioHost = (staticHost || baseUrl).replace(/\/+$/, '')
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
      lines.push(`- Audio: ${audioHost}/${post.audio}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

export function buildArticleMarkdown(baseUrl: string, article: Article, staticHost?: string) {
  const lines = [
    `# ${article.title}`,
    '',
    `- Date: ${article.date}`,
    ...(article.audio ? [`- Audio: ${(staticHost || baseUrl).replace(/\/+$/, '')}/${article.audio}`] : []),
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
