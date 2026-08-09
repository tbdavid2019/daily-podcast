import type { Story } from './types'
import * as cheerio from 'cheerio'

export const REDDIT_RSS_RATE_LIMIT_DELAY = '40 seconds'
export const REDDIT_SUBREDDITS = [
  'LocalLLaMA',
  'coding',
  'netsec',
  'sysadmin',
  'dataengineering',
] as const

const POLITICAL_KEYWORDS = [
  'trump',
  'donald trump',
  'biden',
  'white house',
  '共和黨',
  '民主黨',
  '川普',
  '特朗普',
  '拜登',
  '白宮',
  'gop',
  'maga',
  'election',
  '選舉',
  '大選',
  'congress',
  'senate',
  'house speaker',
  'impeachment',
]

export interface RedditPostFeedContent {
  article: string
  comments: string
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function htmlToText(html: string): string {
  if (!html) {
    return ''
  }
  const $ = cheerio.load(html)
  $('script, style, noscript').remove()
  return normalizeWhitespace($.root().text())
}

function absoluteRedditUrl(value: string): string {
  if (!value) {
    return ''
  }
  try {
    return new URL(value, 'https://www.reddit.com').toString()
  }
  catch {
    return ''
  }
}

export function buildRedditCombinedFeedUrl(subreddits: readonly string[] = REDDIT_SUBREDDITS): string {
  const names = subreddits.map(name => name.trim()).filter(Boolean)
  if (!names.length) {
    throw new Error('At least one subreddit is required')
  }
  return `https://www.reddit.com/r/${names.join('+')}/.rss`
}

export function buildRedditPostFeedUrl(story: Pick<Story, 'id' | 'sourceUrl'>): string {
  const id = story.id?.replace(/^t3_/, '').trim()
  if (id) {
    return `https://www.reddit.com/comments/${encodeURIComponent(id)}/.rss`
  }

  const sourceUrl = story.sourceUrl?.replace(/\/$/, '')
  if (!sourceUrl) {
    throw new Error('Reddit story is missing an ID and source URL')
  }
  return `${sourceUrl}/.rss`
}

export function isRedditUrl(value?: string): boolean {
  if (!value) {
    return false
  }
  try {
    const hostname = new URL(value).hostname.toLowerCase()
    return hostname === 'redd.it' || hostname === 'reddit.com' || hostname.endsWith('.reddit.com')
  }
  catch {
    return false
  }
}

export function isPoliticalRedditStory(story: Pick<Story, 'title' | 'url'>): boolean {
  const haystack = `${story.title || ''} ${story.url || ''}`.toLowerCase()
  return POLITICAL_KEYWORDS.some(keyword => haystack.includes(keyword.toLowerCase()))
}

export function parseRedditListingFeed(xml: string): Story[] {
  const $ = cheerio.load(xml, { xmlMode: true })
  const stories: Story[] = []

  $('entry').each((_, entry) => {
    const $entry = $(entry)
    const rawId = normalizeWhitespace($entry.find('id').first().text())
    const id = rawId.replace(/^t3_/, '')
    const rawTitle = normalizeWhitespace($entry.find('title').first().text())
    const subreddit = normalizeWhitespace($entry.find('category').first().attr('term') || '')
    const sourceUrl = absoluteRedditUrl($entry.find('link').first().attr('href') || '')
    const contentHtml = $entry.find('content').first().text()
    const contentPage = cheerio.load(contentHtml)
    const articleLink = contentPage('a').toArray().find(element =>
      normalizeWhitespace(contentPage(element).text()).toLowerCase() === '[link]',
    )
    const articleUrl = absoluteRedditUrl(articleLink ? contentPage(articleLink).attr('href') || '' : sourceUrl)
    const description = htmlToText(contentHtml).slice(0, 500)
    const publishedAt = Date.parse($entry.find('published').first().text())

    if (!id || !rawTitle || !sourceUrl || !subreddit) {
      return
    }

    stories.push({
      id,
      title: `${rawTitle} (r/${subreddit})`,
      url: articleUrl || sourceUrl,
      source: 'reddit',
      sourceUrl,
      description,
      subreddit,
      ...(Number.isFinite(publishedAt) ? { time: Math.floor(publishedAt / 1000) } : {}),
    })
  })

  return stories
}

export function parseRedditPostFeed(xml: string, maxComments = 20): RedditPostFeedContent {
  const $ = cheerio.load(xml, { xmlMode: true })
  let article = ''
  const comments: string[] = []

  $('entry').each((_, entry) => {
    const $entry = $(entry)
    const id = normalizeWhitespace($entry.find('id').first().text())
    const text = htmlToText($entry.find('content').first().text())
    if (!text) {
      return
    }
    if (id.startsWith('t3_') && !article) {
      article = text
    }
    else if (id.startsWith('t1_') && comments.length < maxComments) {
      comments.push(`- ${text}`)
    }
  })

  return { article, comments: comments.join('\n') }
}

export function selectRedditStories(
  stories: readonly Story[],
  today: string,
  finalCount = 6,
  topPerSubreddit = 3,
): Story[] {
  const bySubreddit = new Map<string, Story[]>()
  for (const story of stories) {
    const subreddit = story.subreddit || ''
    if (!subreddit) {
      continue
    }
    const group = bySubreddit.get(subreddit) || []
    if (group.length < topPerSubreddit) {
      group.push(story)
      bySubreddit.set(subreddit, group)
    }
  }

  const dateSeed = [...today].reduce((sum, character) => sum + character.charCodeAt(0), 0)
  const offset = dateSeed % REDDIT_SUBREDDITS.length
  const orderedSubreddits = [
    ...REDDIT_SUBREDDITS.slice(offset),
    ...REDDIT_SUBREDDITS.slice(0, offset),
  ]
  const selected: Story[] = []

  for (let round = 0; round < topPerSubreddit && selected.length < finalCount; round += 1) {
    for (const subreddit of orderedSubreddits) {
      const story = bySubreddit.get(subreddit)?.[round]
      if (story) {
        selected.push(story)
      }
      if (selected.length >= finalCount) {
        break
      }
    }
  }

  return selected
}
