import type { Story } from './types'
import * as cheerio from 'cheerio'
import { normalizeDedupeUrl } from './efficiency'

export const DEFAULT_HN_MIN_POINTS = 100
export const DEFAULT_HN_TARGET_COUNT = 7
export const HN_OFFICIAL_RSS_URL = 'https://news.ycombinator.com/rss'

export interface SelectHackerNewsStoriesOptions {
  excludeIds?: Set<string>
  excludeUrls?: Set<string>
  existingIds?: Set<string>
  existingUrls?: Set<string>
  targetCount?: number
}

/**
 * 驗證並解析 Hacker News points 門檻，若無效則回傳預設值
 */
export function parseHnMinPoints(value: unknown, defaultPoints = DEFAULT_HN_MIN_POINTS): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value))
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value.trim(), 10)
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.floor(parsed))
    }
  }
  return defaultPoints
}

/**
 * 建立 Hacker News hnrss.org 訂閱網址
 * 支援 points 門檻參數，若為 0 則使用全首頁，若無效則回退預設門檻
 */
export function buildHackerNewsFeedUrl(minPoints = DEFAULT_HN_MIN_POINTS): string {
  const points = parseHnMinPoints(minPoints, DEFAULT_HN_MIN_POINTS)
  if (points > 0) {
    return `https://hnrss.org/frontpage?points=${points}`
  }
  return 'https://hnrss.org/frontpage'
}

/**
 * 解析 Hacker News RSS XML（同時相容 hnrss.org 與 news.ycombinator.com/rss 格式）
 */
export function parseHackerNewsRss(rssText: string): Story[] {
  if (!rssText || typeof rssText !== 'string') {
    return []
  }

  const $ = cheerio.load(rssText, { xmlMode: true })
  const items = $('item')

  return items
    .map((_index: number, el: any) => {
      const $item = $(el)
      const title = $item.find('title').text().trim()
      const link = $item.find('link').text().trim()
      const commentsLink = $item.find('comments').text().trim()
      const guid = $item.find('guid').text().trim()
      const description = $item.find('description').text()

      const idMatch = (commentsLink || guid || link).match(/id=(\d+)/)
      const id = idMatch ? idMatch[1] : ''

      const pointsMatch = description.match(/Points:\s*(\d+)/i)
      const score = pointsMatch ? Number.parseInt(pointsMatch[1], 10) : undefined

      const commentsMatch = description.match(/#\s*Comments:\s*(\d+)/i)
      const comments = commentsMatch ? Number.parseInt(commentsMatch[1], 10) : undefined

      const fallbackUrl = commentsLink || (id ? `https://news.ycombinator.com/item?id=${id}` : '')
      const url = link || fallbackUrl

      return {
        id,
        title,
        url,
        hackerNewsUrl: commentsLink || fallbackUrl,
        score,
        comments,
      }
    })
    .get()
    .filter((story: Story) => Boolean(story.id && story.url && story.title))
}

/**
 * 依據去重規則挑選 Hacker News 文章，並防止重複選取
 */
export function selectHackerNewsStories(
  candidates: readonly Story[],
  options?: SelectHackerNewsStoriesOptions,
): Story[] {
  const seenIds = options?.existingIds ? new Set(options.existingIds) : new Set<string>()
  const seenUrls = options?.existingUrls ? new Set(options.existingUrls) : new Set<string>()
  const result: Story[] = []

  const isAllowed = (story: Story) => {
    if (story.id) {
      if (options?.excludeIds?.has(story.id) || options?.excludeIds?.has(`hacker-news:${story.id}`)) {
        return false
      }
      if (seenIds.has(story.id)) {
        return false
      }
    }
    if (story.url) {
      const normalized = normalizeDedupeUrl(story.url)
      if (options?.excludeUrls?.has(normalized) || seenUrls.has(normalized)) {
        return false
      }
    }
    return true
  }

  for (const story of candidates) {
    if (!story.id || !story.url || !story.title) {
      continue
    }
    if (!isAllowed(story)) {
      continue
    }
    seenIds.add(story.id)
    seenUrls.add(normalizeDedupeUrl(story.url))
    result.push({
      ...story,
      source: 'hacker-news' as const,
      sourceUrl: story.hackerNewsUrl,
    })
    if (typeof options?.targetCount === 'number' && result.length >= options.targetCount) {
      break
    }
  }

  return result
}
