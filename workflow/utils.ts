import puppeteer from '@cloudflare/puppeteer'
import * as cheerio from 'cheerio'
import {
  buildRedditCombinedFeedUrl,
  buildRedditPostFeedUrl,
  isPoliticalRedditStory,
  isRedditUrl,
  parseRedditListingFeed,
  parseRedditPostFeed,
  selectRedditStories,
} from './reddit'

type StorySource = NonNullable<Story['source']>
interface StoryFetchOptions {
  limits?: Partial<Record<StorySource, number>>
  excludeRedditIds?: Set<string>
}

const SELF_HOSTED_MARKDOWN_NODES = [
  'https://2md.aiurl.tw', // Primary
  'https://2md.glsoft.ai', // Secondary
  'https://create360.ai', // Fallback
]

const PRIMARY_READER_BATCH_URL = 'https://2md.aiurl.tw/v1/batch'
const MIN_READER_CONTENT_CHARS = 50

interface BatchReaderPage {
  url?: unknown
  content?: unknown
  warning?: unknown
}

function normalizeReaderUrl(value: string): string {
  try {
    return new URL(value).toString()
  }
  catch {
    return value
  }
}

function parseBatchReaderPages(value: unknown): BatchReaderPage[] {
  if (!value || typeof value !== 'object') {
    return []
  }
  const outerData = (value as { data?: unknown }).data
  const pages = outerData && typeof outerData === 'object'
    ? (outerData as { data?: unknown }).data
    : undefined
  return Array.isArray(pages) ? pages as BatchReaderPage[] : []
}

export async function getContentFromReaderBatch(urls: readonly string[]): Promise<Map<string, string>> {
  const uniqueUrls = [...new Set(urls.filter(Boolean))]
  if (uniqueUrls.length < 2) {
    return new Map()
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 45000)
  try {
    const response = await fetch(PRIMARY_READER_BATCH_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Respond-With': 'markdown',
        'X-Retain-Images': 'none',
      },
      body: JSON.stringify({ urls: uniqueUrls }),
      signal: controller.signal,
    })

    if (!response.ok) {
      console.warn('[Reader batch] Primary node failed:', response.status, response.statusText)
      return new Map()
    }

    const pages = parseBatchReaderPages(await response.json())
    const contents = new Map<string, string>()
    for (const [index, page] of pages.entries()) {
      const requestedUrl = uniqueUrls[index]
      const content = typeof page?.content === 'string' ? page.content.trim() : ''
      if (!requestedUrl || content.length < MIN_READER_CONTENT_CHARS) {
        if (requestedUrl) {
          console.warn('[Reader batch] Insufficient content for URL', {
            url: requestedUrl,
            warning: typeof page?.warning === 'string' ? page.warning : undefined,
          })
        }
        continue
      }

      contents.set(requestedUrl, content)
      contents.set(normalizeReaderUrl(requestedUrl), content)
      const returnedUrl = typeof page?.url === 'string' ? normalizeReaderUrl(page.url) : ''
      if (returnedUrl) {
        contents.set(returnedUrl, content)
      }
    }

    console.info('[Reader batch] Primary node completed', {
      requested: uniqueUrls.length,
      successful: uniqueUrls.filter(url => contents.has(normalizeReaderUrl(url))).length,
    })
    return contents
  }
  catch (error) {
    console.warn('[Reader batch] Primary node error:', error)
    return new Map()
  }
  finally {
    clearTimeout(timeoutId)
  }
}

async function getContentFromReader(url: string, format: 'html' | 'markdown', selector?: { include?: string, exclude?: string }) {
  const readerHeaders: HeadersInit = {
    'X-Retain-Images': 'none',
    'X-Return-Format': format,
  }

  if (selector?.include) {
    readerHeaders['X-Target-Selector'] = selector.include
  }

  if (selector?.exclude) {
    readerHeaders['X-Remove-Selector'] = selector.exclude
  }

  console.info('get content from self-hosted reader', url)

  // Try nodes in order
  for (const node of SELF_HOSTED_MARKDOWN_NODES) {
    try {
      const targetUrl = `${node}/${url}`
      console.info(`Trying self-hosted reader node: ${node}`)

      // Use a timeout for self-hosted nodes to fail fast
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000) // 15s timeout

      const response = await fetch(targetUrl, {
        headers: readerHeaders,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (response.ok) {
        const text = await response.text()
        if (text.trim().length >= MIN_READER_CONTENT_CHARS) {
          return text
        }
        console.warn(`Self-hosted reader node ${node} returned insufficient content`)
        continue
      }

      console.warn(`Self-hosted reader node ${node} failed: ${response.status} ${response.statusText}`)
      // Don't break immediately on 4xx/5xx from one node, try next one
    }
    catch (error) {
      console.warn(`Self-hosted reader node ${node} error:`, error)
    }
  }

  // If all nodes failed
  console.error(`All self-hosted reader nodes failed for ${url}`)
  return ''
}

export async function getHackerNewsTopStories(today: string) {
  console.info('[Hacker News] Fetching stories for date:', today)

  // 優先使用 RSS feed，更穩定可靠
  try {
    const rssUrl = 'https://news.ycombinator.com/rss'
    console.info('[Hacker News] Fetching RSS from:', rssUrl)

    const response = await fetch(rssUrl)
    const rssText = await response.text()

    console.info('[Hacker News] RSS feed length:', rssText.length)

    const $ = cheerio.load(rssText, { xmlMode: true })
    const items = $('item')

    console.info('[Hacker News] Found RSS items:', items.length)

    const stories: Story[] = items.map((i: number, el: any) => {
      const $item = $(el)
      const link = $item.find('link').text()
      const title = $item.find('title').text()
      const commentsLink = $item.find('comments').text()

      // 從 comments link 提取 ID: https://news.ycombinator.com/item?id=12345
      const idMatch = commentsLink.match(/id=(\d+)/)
      const id = idMatch ? idMatch[1] : ''

      return {
        id,
        title,
        url: link,
        hackerNewsUrl: commentsLink,
      }
    }).get()

    const filteredStories = stories
      .filter(story => story.id && story.url && story.title)
      .map(story => ({
        ...story,
        source: 'hacker-news' as const,
        sourceUrl: story.hackerNewsUrl,
      }))

    console.info(`[Hacker News] RSS returned ${filteredStories.length} stories (filtered from ${stories.length} raw items)`)

    if (filteredStories.length > 0) {
      return filteredStories
    }

    console.warn('[Hacker News] RSS returned 0 stories, falling back to web scraping...')
  }
  catch (error) {
    console.error('[Hacker News] RSS fetch failed:', error)
    console.info('[Hacker News] Falling back to web scraping...')
  }

  // Fallback: 使用原有的網頁抓取方式
  const url = `https://news.ycombinator.com/front?day=${today}`

  console.info('[Hacker News] Fetching from web page:', url)

  const html = await getContentFromReader(url, 'html', {})

  console.info('[Hacker News] HTML length from self-hosted reader:', html.length)

  const $ = cheerio.load(html)
  const items = $('.athing.submission')

  console.info('[Hacker News] Found items from self-hosted reader:', items.length)

  const stories: Story[] = items.map((i: number, el: any) => ({
    id: $(el).attr('id'),
    title: $(el).find('.titleline > a').text(),
    url: $(el).find('.titleline > a').attr('href'),
    hackerNewsUrl: `https://news.ycombinator.com/item?id=${$(el).attr('id')}`,
  })).get()

  const filteredStories = stories.filter(story => story.id && story.url).map(story => ({
    ...story,
    source: 'hacker-news' as const,
    sourceUrl: story.hackerNewsUrl,
  }))

  console.info(`[Hacker News] Web scraping returned ${filteredStories.length} stories (filtered from ${stories.length} raw items)`)

  return filteredStories
}

export async function getHackerNewsStory(
  story: Story,
  maxTokens: number,
  _config?: unknown,
  prefetchedArticle = '',
) {
  console.info(`[Content Fetch] Processing story: ${story.title}`)
  console.info(`[Content Fetch] Source: ${story.source}, URL: ${story.url}`)

  // 根據來源類型使用不同的內容取得方式
  if (story.source === 'hacker-news') {
    console.info(`[Hacker News] Fetching article and comments for story ID: ${story.id}`)

    // 先嘗試抓取原始文章內容
    let article = prefetchedArticle.trim()
    if (article.length >= MIN_READER_CONTENT_CHARS) {
      console.info(`[Hacker News] Using batch-fetched article - length: ${article.length}`)
    }
    else {
      article = ''
      try {
        console.info(`[Hacker News] Trying self-hosted reader for article: ${story.url}`)
        article = await getContentFromReader(story.url!, 'markdown', {})
        if (!article || article.trim().length < MIN_READER_CONTENT_CHARS) {
          throw new Error('Self-hosted readers returned empty or too short content')
        }
        console.info(`[Hacker News] Self-hosted reader success - article length: ${article.length}`)
      }
      catch (readerError) {
        console.warn(`[Hacker News] Self-hosted readers failed for article: ${readerError}`)
        article = ''
      }
    }

    // 再抓取 Hacker News 評論（評論可選，失敗不影響文章處理）
    let comments = ''
    try {
      console.info(`[Hacker News] Fetching comments for ID: ${story.id}`)
      comments = await getContentFromReader(
        `https://news.ycombinator.com/item?id=${story.id}`,
        'markdown',
        { include: '.comment-tree', exclude: '.navs' },
      )
      if (!comments || comments.trim().length < 30) {
        throw new Error('Comments content too short')
      }
      console.info(`[Hacker News] Comments fetched successfully - length: ${comments.length}`)
    }
    catch (commentsError) {
      console.warn(`[Hacker News] Comments unavailable (non-critical): ${commentsError}`)
      comments = '' // 評論失敗不影響文章處理
    }

    const articleLength = article.trim().length
    const commentsLength = comments.trim().length

    if (articleLength + commentsLength < 50) {
      console.error(`[Hacker News] ⚠️ SKIP: Combined article/comments content too short for "${story.title}"`)
      console.error(`[Hacker News] URL: ${story.url}`)
      return ''
    }

    console.info(`[Hacker News] ✅ Successfully fetched content - Article: ${articleLength} chars, Comments: ${commentsLength} chars`)

    return [
      story.title ? `<title>${story.title}</title>` : '',
      articleLength ? `<article>${article.substring(0, maxTokens * 4)}</article>` : '',
      commentsLength ? `<comments>${comments.substring(0, maxTokens * 4)}</comments>` : '',
    ].filter(Boolean).join('\n\n---\n\n')
  }
  else if (story.source === 'reddit') {
    console.info('[Reddit] Fetching article and comments')

    let article = ''
    let comments = ''

    try {
      const redditFeedUrl = buildRedditPostFeedUrl(story)
      console.info('[Reddit] Fetching post and comments RSS:', redditFeedUrl)
      const response = await fetch(redditFeedUrl, {
        headers: {
          'Accept': 'application/atom+xml',
          'User-Agent': 'DailyPodcast/1.0 (for tech news aggregation)',
        },
      })
      if (!response.ok) {
        throw new Error(`Reddit RSS returned ${response.status}; retry after ${response.headers.get('x-ratelimit-reset') || 'unknown'} seconds`)
      }
      const feedContent = parseRedditPostFeed(await response.text())
      article = feedContent.article
      comments = feedContent.comments
      console.info('[Reddit] RSS content fetched', {
        articleLength: article.length,
        commentsLength: comments.length,
      })
    }
    catch (error) {
      console.warn(`[Reddit] RSS fetch failed: ${error}`)
    }

    // 連結貼文的 RSS 只有貼文資訊；外部文章正文仍由自架 reader 取得。
    if (story.url && !isRedditUrl(story.url)) {
      try {
        console.info('[Reddit] Trying self-hosted reader for article:', story.url)
        const externalArticle = await getContentFromReader(story.url, 'markdown', {})
        if (!externalArticle || externalArticle.trim().length < 50) {
          throw new Error('Self-hosted readers returned empty or too short content')
        }
        article = externalArticle
        console.info(`[Reddit] Self-hosted reader success - article length: ${article.length}`)
      }
      catch (readerError) {
        console.warn(`[Reddit] Self-hosted readers failed for article: ${readerError}`)
        article = ''
      }
    }

    const articleLength = article.trim().length
    const commentsLength = comments.trim().length

    if (articleLength + commentsLength < 50) {
      console.error(`[Reddit] ⚠️ SKIP: Combined article/comments content too short for "${story.title}"`)
      console.error(`[Reddit] URL: ${story.url}`)
      return ''
    }

    console.info(`[Reddit] ✅ Successfully fetched content - Article: ${articleLength} chars, Comments: ${commentsLength} chars`)

    return [
      story.title ? `<title>${story.title}</title>` : '',
      articleLength ? `<article>${article.substring(0, maxTokens * 4)}</article>` : '',
      commentsLength ? `<comments>${comments.substring(0, maxTokens * 4)}</comments>` : '',
    ].filter(Boolean).join('\n\n---\n\n')
  }
  else {
    // 對於其他來源（Product Hunt、GitHub、Dev.to、Reddit），取得主要內容
    console.info(`[${story.source}] Fetching content for: ${story.title}`)

    let article = prefetchedArticle.trim()
    if (article.length >= MIN_READER_CONTENT_CHARS) {
      console.info(`[${story.source}] Using batch-fetched article - length: ${article.length}`)
    }
    else {
      article = ''
      try {
        console.info(`[${story.source}] Trying self-hosted reader for: ${story.url}`)
        article = await getContentFromReader(story.url!, 'markdown', {})
        if (!article || article.trim().length < MIN_READER_CONTENT_CHARS) {
          throw new Error('Self-hosted readers returned empty or too short content')
        }
        console.info(`[${story.source}] Self-hosted reader success - length: ${article.length}`)
      }
      catch (readerError) {
        console.warn(`[${story.source}] Self-hosted readers failed: ${readerError}`)
        article = ''
      }
    }

    // 對於非 Hacker News 來源，如果抓取失敗也直接過濾掉
    if (!article || article.trim().length < 50) {
      console.error(`[${story.source}] ⚠️ SKIP: No content for "${story.title}" - story will be filtered out`)
      console.error(`[${story.source}] URL: ${story.url}`)
      return '' // 回傳空字串，讓上層過濾
    }

    console.info(`[${story.source}] ✅ Successfully fetched content - length: ${article.length}`)

    return [
      story.title ? `<title>${story.title}</title>` : '',
      story.description ? `<description>${story.description}</description>` : '',
      story.source ? `<source>${story.source}</source>` : '',
      article ? `<article>${article.substring(0, maxTokens * 4)}</article>` : '',
    ].filter(Boolean).join('\n\n---\n\n')
  }
}

export async function concatAudioFiles(audioFiles: string[], BROWSER: Fetcher, { workerUrl }: { workerUrl: string }) {
  const browser = await puppeteer.launch(BROWSER)
  const page = await browser.newPage()
  await page.goto(`${workerUrl}/audio`)

  console.info('start concat audio files', audioFiles)
  const fileUrl = await page.evaluate(async (audioFiles: string[]) => {
    // 這段 JS 在瀏覽器中執行
    // @ts-expect-error 瀏覽器內的物件
    const blob = await concatAudioFilesOnBrowser(audioFiles)

    const result = new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
    return await result
  }, audioFiles) as string

  console.info('concat audio files result', fileUrl.substring(0, 100))

  await browser.close()

  const response = await fetch(fileUrl)
  return await response.blob()
}

export async function getGitHubTrendingStories() {
  // GitHub Trending 抓取設定
  const GITHUB_CONFIG = {
    MAX_REPOS: 10, // 最多回傳的 repo 數量
    USE_DEEPWIKI: false, // 暫時關閉 deepwiki，直接使用 GitHub 原始連結
  }

  const url = 'https://github.com/trending'

  const html = await getContentFromReader(url, 'html', {})

  const $ = cheerio.load(html)
  const repos = $('.Box-row')

  const stories: Story[] = repos.map((i: number, el: any) => {
    const $el = $(el)
    const titleLink = $el.find('h2 a')
    const repoName = titleLink.attr('href')?.replace('/', '') || ''
    const title = titleLink.text().trim()
    const description = $el.find('p').text().trim()
    const starsText = $el.find('.octicon-star').parent().text().trim()
    const stars = Number.parseInt(starsText.replace(/,/g, '')) || 0

    if (!repoName || !title)
      return null

    const originalUrl = `https://github.com${titleLink.attr('href')}`
    const targetUrl = GITHUB_CONFIG.USE_DEEPWIKI
      ? `https://deepwiki.com${titleLink.attr('href')}`
      : originalUrl

    return {
      id: repoName.replace('/', '-'),
      title: `${title} (${stars} ⭐)`,
      url: targetUrl,
      source: 'github-trending' as const,
      sourceUrl: originalUrl,
      description,
      stars,
    }
  }).get().filter(Boolean) as Story[]

  // 隨機從前 10 名中挑選
  const pool = stories.slice(0, 10)
  const shuffled = pool.sort(() => 0.5 - Math.random())

  console.info(`[GitHub] Selected ${GITHUB_CONFIG.MAX_REPOS} stories randomly from top ${pool.length}`)
  return shuffled.slice(0, GITHUB_CONFIG.MAX_REPOS)
}

export async function getProductHuntStories() {
  console.info('Fetching Product Hunt stories...')

  // Product Hunt 抓取設定
  const PRODUCT_HUNT_CONFIG = {
    MAX_PRODUCTS: 5, // 最多回傳的產品數量
    REMOVE_RANKING: true, // 是否移除標題中的排名編號
  }

  // 優先使用 RSS Feed (更穩定)
  try {
    const rssUrl = 'https://www.producthunt.com/feed'
    console.info('[Product Hunt] Fetching RSS from:', rssUrl)

    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'DailyPodcast/1.0 (for tech news aggregation)',
      },
    })

    if (response.ok) {
      const rssText = await response.text()
      const $ = cheerio.load(rssText, { xmlMode: true })
      const entries = $('entry')

      console.info('[Product Hunt] Found RSS entries:', entries.length)

      const rssStories: Story[] = entries.map((i: number, el: any) => {
        const $el = $(el)
        const title = $el.find('title').text().trim()
        const link = $el.find('link').attr('href')
        const content = $el.find('content').text()
        const id = $el.find('id').text()

        if (!title || !link)
          return null

        // 從 content 中嘗試提取描述 (通常是一段 HTML)
        const $content = cheerio.load(content)
        const description = $content.text().trim().substring(0, 200)

        return {
          id: id.split('/').pop() || `ph-rss-${i}`,
          title,
          url: link,
          source: 'product-hunt' as const,
          sourceUrl: link,
          description,
        }
      }).get().filter(Boolean) as Story[]

      console.info(`[Product Hunt] RSS returned ${rssStories.length} valid stories`)

      if (rssStories.length > 0) {
        // 隨機從前 10 名中挑選
        const pool = rssStories.slice(0, 10)
        const shuffled = pool.sort(() => 0.5 - Math.random())

        console.info(`[Product Hunt RSS] Selected ${PRODUCT_HUNT_CONFIG.MAX_PRODUCTS} stories randomly from top ${pool.length}`)
        return shuffled.slice(0, PRODUCT_HUNT_CONFIG.MAX_PRODUCTS)
      }
    }
    else {
      console.warn(`[Product Hunt] RSS Error ${response.status}: ${response.statusText}`)
    }
  }
  catch (error) {
    console.warn('[Product Hunt] RSS Fetch failed, falling back to scraping:', error)
  }

  const url = 'https://www.producthunt.com'

  const html = await getContentFromReader(url, 'html', {})

  if (!html) {
    console.error('Failed to get HTML content from self-hosted readers for Product Hunt')
    throw new Error('No HTML content available for Product Hunt')
  }

  console.info('Product Hunt HTML length:', html.length)

  const $ = cheerio.load(html)
  // 使用修正後的選擇器：尋找所有包含 post-item 的元素
  const products = $('[data-test*="post-item"]')

  console.info('Product Hunt products found:', products.length)

  const stories: Story[] = products.map((i: number, el: any) => {
    const $el = $(el)

    // 找第一個連結，這通常是產品連結
    const firstLink = $el.find('a').first()
    const href = firstLink.attr('href')
    let title = firstLink.text().trim()

    // 移除排名編號 (如 "1. " "2. ")
    if (PRODUCT_HUNT_CONFIG.REMOVE_RANKING) {
      title = title.replace(/^\d+\.\s*/, '')
    }

    // 尋找投票按鈕並取得投票數
    const votesText = $el.find('[data-test*="vote-button"]').text().trim()
    const votes = Number.parseInt(votesText) || 0

    // 嘗試找描述 - 可能在不同的位置
    let description = $el.find('[data-test*="post-description"]').text().trim()
    if (!description) {
      // 如果沒有描述，嘗試從其他地方取得
      description = $el.find('.text-sm, .description, p').first().text().trim()
    }

    if (!title || !href) {
      console.warn('Product Hunt item missing title or href:', { title, href, index: i })
      return null
    }

    console.info('Product Hunt story found:', { title, votes, href })

    // 檢查 href 是否已經是完整 URL，避免重複前綴
    const fullUrl = href.startsWith('http') ? href : `https://www.producthunt.com${href}`

    return {
      id: href.split('/').pop() || `ph-${i}`,
      title: `${title} (${votes} 👍)`,
      url: fullUrl,
      source: 'product-hunt' as const,
      sourceUrl: fullUrl,
      description,
      votes,
    }
  }).get().filter(Boolean) as Story[]

  console.info('Product Hunt stories processed:', stories.length)

  // 隨機從前 10 名中挑選
  const pool = stories.slice(0, 10)
  const shuffled = pool.sort(() => 0.5 - Math.random())

  console.info(`[Product Hunt Web] Selected ${PRODUCT_HUNT_CONFIG.MAX_PRODUCTS} stories randomly from top ${pool.length}`)
  return shuffled.slice(0, PRODUCT_HUNT_CONFIG.MAX_PRODUCTS)
}

export async function getDevToStories() {
  // Dev.to 抓取設定
  const DEV_TO_CONFIG = {
    MAX_ARTICLES: 10, // 最多回傳的文章數量
    ENABLE_FILTER: true, // 是否啟用活動文章過濾
    // 需要過濾的關鍵字 - 活動、挑戰、比賽類型文章
    FILTER_KEYWORDS: [
      'hacktoberfest',
      'devchallenge',
      'challenge',
      'contest',
      'winners',
      'congrats',
      'competition',
      'featured dev posts',
      'top 7',
      'spotlight',
      'writing challenge',
      'judge',
      'submissions',
    ],
  }

  const url = 'https://dev.to/top/week'

  // 嘗試使用 RSS Feed (更穩定)
  try {
    const rssUrl = 'https://dev.to/feed'
    console.info('[Dev.to] Fetching RSS from:', rssUrl)

    const response = await fetch(rssUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
    })

    if (!response.ok) {
      throw new Error(`RSS Error ${response.status}: ${response.statusText}`)
    }

    const rssText = await response.text()

    const $ = cheerio.load(rssText, { xmlMode: true })
    const items = $('item')

    console.info('[Dev.to] Found RSS items:', items.length)

    const rssStories: Story[] = items.map((i: number, el: any) => {
      if (i >= DEV_TO_CONFIG.MAX_ARTICLES * 2)
        return null // Optimization

      const $item = $(el)
      const title = $item.find('title').text()
      const link = $item.find('link').text()
      const author = $item.find('dc\\:creator').text() || $item.find('creator').text()
      // Use categories as description/tags
      const categories = $item.find('category').map((_: number, c: any) => $(c).text()).get().join(', ')

      if (!title || !link)
        return null

      // Filter logic
      if (DEV_TO_CONFIG.ENABLE_FILTER) {
        const titleLower = title.toLowerCase()
        const descLower = categories.toLowerCase()
        const shouldFilter = DEV_TO_CONFIG.FILTER_KEYWORDS.some(keyword =>
          titleLower.includes(keyword) || descLower.includes(keyword),
        )
        if (shouldFilter)
          return null
      }

      return {
        id: link.split('/').pop() || `dev-rss-${i}`,
        title: `${title} by ${author}`,
        url: link,
        source: 'dev-to' as const,
        sourceUrl: link,
        description: categories,
      }
    }).get().filter(Boolean) as Story[]

    console.info(`[Dev.to] RSS returned ${rssStories.length} valid stories`)

    if (rssStories.length > 0) {
      return rssStories.slice(0, DEV_TO_CONFIG.MAX_ARTICLES)
    }
  }
  catch (error) {
    console.warn('[Dev.to] RSS Fetch failed, falling back to scraping:', error)
  }

  const html = await getContentFromReader(url, 'html', {})

  const $ = cheerio.load(html)
  const articles = $('.crayons-story')

  const stories: Story[] = articles.map((i: number, el: any) => {
    const $el = $(el)
    const titleLink = $el.find('.crayons-story__title a')
    const title = titleLink.text().trim()
    const href = titleLink.attr('href')
    const description = $el.find('.crayons-story__tags').text().trim()
    const author = $el.find('.crayons-story__secondary .crayons-link').first().text().trim()

    if (!title || !href)
      return null

    // 檢查標題和描述是否包含活動類型關鍵字
    if (DEV_TO_CONFIG.ENABLE_FILTER) {
      const titleLower = title.toLowerCase()
      const descriptionLower = description.toLowerCase()
      const shouldFilter = DEV_TO_CONFIG.FILTER_KEYWORDS.some(keyword =>
        titleLower.includes(keyword) || descriptionLower.includes(keyword),
      )

      // 如果包含活動關鍵字，跳過這篇文章
      if (shouldFilter) {
        console.info(`[Dev.to Filter] 過濾活動文章: ${title}`)
        return null
      }
    }

    return {
      id: href.split('/').pop() || `dev-${i}`,
      title: `${title} by ${author}`,
      url: href.startsWith('http') ? href : `https://dev.to${href}`,
      source: 'dev-to' as const,
      sourceUrl: href.startsWith('http') ? href : `https://dev.to${href}`,
      description,
    }
  }).get().filter(Boolean) as Story[]

  console.info(`[Dev.to] 原始文章數: ${articles.length}, 過濾後: ${stories.length}`)
  return stories.slice(0, DEV_TO_CONFIG.MAX_ARTICLES)
}

export async function getAllStories(today: string, _config: unknown, options: StoryFetchOptions = {}) {
  const { limits = {}, excludeRedditIds } = options

  console.info('Starting to fetch stories from all sources...', { limits })

  // 根據 limits 決定是否需要抓取該來源
  const shouldFetchSource = (source: StorySource) => {
    const limit = limits[source]
    return limit === undefined || limit > 0
  }

  // 只抓取需要的來源
  const fetchPromises: Record<StorySource, Promise<Story[]>> = {
    'hacker-news': shouldFetchSource('hacker-news')
      ? getHackerNewsTopStories(today)
          .then((stories) => {
            console.info(`[Hacker News] Fetched ${stories.length} stories successfully`)
            return stories
          })
          .catch((err) => {
            console.error('Failed to get Hacker News stories:', err)
            return []
          })
      : Promise.resolve([]),
    'github-trending': shouldFetchSource('github-trending')
      ? getGitHubTrendingStories().catch((err) => {
          console.error('Failed to get GitHub trending stories:', err)
          return []
        })
      : Promise.resolve([]),
    'product-hunt': shouldFetchSource('product-hunt')
      ? getProductHuntStories().catch((err) => {
          console.error('Failed to get Product Hunt stories:', err)
          return []
        })
      : Promise.resolve([]),
    'dev-to': shouldFetchSource('dev-to')
      ? getDevToStories().catch((err) => {
          console.error('Failed to get Dev.to stories:', err)
          return []
        })
      : Promise.resolve([]),
    'reddit': shouldFetchSource('reddit')
      ? getRedditStories({ excludeRedditIds, today }).catch((err) => {
          console.error('Failed to get Reddit stories:', err)
          return []
        })
      : Promise.resolve([]),
  }

  // 並行抓取所有需要的來源
  const [hackerNewsStories, githubStories, productHuntStories, devToStories, redditStories] = await Promise.all([
    fetchPromises['hacker-news'],
    fetchPromises['github-trending'],
    fetchPromises['product-hunt'],
    fetchPromises['dev-to'],
    fetchPromises.reddit,
  ])

  console.info('Stories fetched from all sources:', {
    'hacker-news': hackerNewsStories.length,
    'github-trending': githubStories.length,
    'product-hunt': productHuntStories.length,
    'dev-to': devToStories.length,
    'reddit': redditStories.length,
  })

  const applyLimit = (stories: Story[], source: StorySource) => {
    const limit = limits[source]
    const limitedStories = typeof limit === 'number' ? stories.slice(0, limit) : stories
    console.info(`Applied limit for ${source}:`, { original: stories.length, limit, final: limitedStories.length })
    return limitedStories
  }

  return [
    ...applyLimit(hackerNewsStories, 'hacker-news'),
    ...applyLimit(githubStories, 'github-trending'),
    ...applyLimit(productHuntStories, 'product-hunt'),
    ...applyLimit(devToStories, 'dev-to'),
    ...applyLimit(redditStories, 'reddit'),
  ]
}

export async function getRedditStories(options: { excludeRedditIds?: Set<string>, today: string }) {
  console.info('Fetching Reddit stories...')

  const { excludeRedditIds, today } = options
  const feedUrl = buildRedditCombinedFeedUrl()
  console.info('[Reddit] Fetching combined subreddit RSS:', feedUrl)
  const response = await fetch(feedUrl, {
    headers: {
      'Accept': 'application/atom+xml',
      'User-Agent': 'DailyPodcast/1.0 (for tech news aggregation)',
    },
  })
  if (!response.ok) {
    throw new Error(`Reddit combined RSS returned ${response.status}; retry after ${response.headers.get('x-ratelimit-reset') || 'unknown'} seconds`)
  }

  const candidates = parseRedditListingFeed(await response.text())
    .filter(story => !excludeRedditIds?.has(story.id || ''))
    .filter(story => !isPoliticalRedditStory(story))
  const selectedStories = selectRedditStories(candidates, today)

  console.info('Reddit stories processed from combined RSS:', {
    candidates: candidates.length,
    selected: selectedStories.length,
  })
  const distribution = selectedStories.reduce((acc, story) => {
    const sub = story.subreddit || 'unknown'
    acc[sub] = (acc[sub] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  console.info('Reddit source distribution:', distribution)

  return selectedStories
}
