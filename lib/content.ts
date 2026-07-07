import { keepDays } from '@/config'
import { getPastDays, mapScriptToArticle } from '@/lib/utils'

interface ContentEnv {
  HACKER_NEWS_KV: KVNamespace
  NEXTJS_ENV?: string
}

export async function getArticleByDate(env: ContentEnv, date: string, variant = 'hacker-news') {
  const runEnv = env.NEXTJS_ENV || 'production'
  const scriptKey = `script:${runEnv}:${variant}:${date}`
  const scriptData = await env.HACKER_NEWS_KV.get(scriptKey, 'json')

  if (scriptData) {
    return mapScriptToArticle(scriptData, runEnv, variant)
  }

  if (variant !== 'hacker-news') {
    return null
  }

  return (await env.HACKER_NEWS_KV.get(`content:${runEnv}:hacker-news:${date}`, 'json')) as Article | null
}

export async function getHomepageArticles(env: ContentEnv, currentPage = 1, pageSize = 6) {
  const variant = 'hacker-news'
  const allPastDays = getPastDays(keepDays, 8)
  const totalItems = allPastDays.length
  const totalPages = Math.ceil(totalItems / pageSize)
  const startIndex = (currentPage - 1) * pageSize
  const currentDays = allPastDays.slice(startIndex, startIndex + pageSize)

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
