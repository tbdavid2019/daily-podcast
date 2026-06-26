import puppeteer from '@cloudflare/puppeteer'
import * as cheerio from 'cheerio'

type StorySource = NonNullable<Story['source']>
interface StoryFetchOptions {
  limits?: Partial<Record<StorySource, number>>
  excludeRedditIds?: Set<string>
}

const breakerState = {
  jinaFailures: 0,
  firecrawlFailures: 0,
}

const BREAKER_THRESHOLD = 2

const SELF_HOSTED_JINA_NODES = [
  'https://create360.ai', // Primary
  'http://git.glsoft.ai:8083', // Secondary
  'http://60.248.142.126:8083', // Fallback
]

async function getContentFromJina(url: string, format: 'html' | 'markdown', selector?: { include?: string, exclude?: string }, JINA_KEY?: string) {
  if (breakerState.jinaFailures >= BREAKER_THRESHOLD) {
    console.warn('Jina circuit breaker open - skipping request')
    return ''
  }

  const jinaHeaders: HeadersInit = {
    'X-Retain-Images': 'none',
    'X-Return-Format': format,
  }

  // Self-hosted likely doesn't need auth, but keeping logic just in case user passes it for a reason
  // or if they switch back to official endpoint later.
  if (JINA_KEY) {
    jinaHeaders.Authorization = `Bearer ${JINA_KEY}`
  }

  if (selector?.include) {
    jinaHeaders['X-Target-Selector'] = selector.include
  }

  if (selector?.exclude) {
    jinaHeaders['X-Remove-Selector'] = selector.exclude
  }

  console.info('get content from jina', url)

  // Try nodes in order
  for (const node of SELF_HOSTED_JINA_NODES) {
    try {
      const targetUrl = `${node}/${url}`
      console.info(`Trying Jina node: ${node}`)

      // Use a timeout for self-hosted nodes to fail fast
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 15000) // 15s timeout

      const response = await fetch(targetUrl, {
        headers: jinaHeaders,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (response.ok) {
        breakerState.jinaFailures = 0 // Reset on success
        const text = await response.text()
        return text
      }

      console.warn(`Jina node ${node} failed: ${response.statusText}`)
      // Don't break immediately on 4xx/5xx from one node, try next one
    }
    catch (error) {
      console.warn(`Jina node ${node} error:`, error)
    }
  }

  // If all nodes failed
  console.error(`All Jina nodes failed for ${url}`)
  breakerState.jinaFailures++
  return ''
}

async function getContentFromFirecrawl(url: string, format: 'html' | 'markdown', selector?: { include?: string, exclude?: string }, FIRECRAWL_KEY?: string) {
  if (breakerState.firecrawlFailures >= BREAKER_THRESHOLD) {
    console.warn('Firecrawl circuit breaker open - skipping request')
    return ''
  }

  const firecrawlHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${FIRECRAWL_KEY}`,
  }

  console.info('get content from firecrawl', url)
  const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: firecrawlHeaders,
    body: JSON.stringify({
      url,
      formats: [format],
      onlyMainContent: true,
      include_tags: selector?.include ? [selector.include] : undefined,
      exclude_tags: selector?.exclude ? [selector.exclude] : undefined,
    }),
  })

  if (response.ok) {
    breakerState.firecrawlFailures = 0 // Reset on success
    const result = await response.json() as { success: boolean, data: Record<string, string> }
    if (result.success) {
      return result.data[format] || ''
    }
  }

  console.error(`get content from firecrawl failed: ${response.statusText} ${url}`)
  if (response.status === 402 || response.status === 429) {
    breakerState.firecrawlFailures++
    console.warn(`Firecrawl failure count: ${breakerState.firecrawlFailures}`)
  }
  return ''
}

export async function getHackerNewsTopStories(today: string, { JINA_KEY, FIRECRAWL_KEY }: { JINA_KEY?: string, FIRECRAWL_KEY?: string }) {
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

  const html = await getContentFromJina(url, 'html', {}, JINA_KEY)

  console.info('[Hacker News] HTML length from Jina:', html.length)

  let $ = cheerio.load(html)
  let items = $('.athing.submission')

  console.info('[Hacker News] Found items from Jina:', items.length)

  if (!items.length) {
    console.warn('[Hacker News] No items from Jina, trying Firecrawl...')
    const firecrawlHtml = await getContentFromFirecrawl(url, 'html', {}, FIRECRAWL_KEY)

    console.info('[Hacker News] HTML length from Firecrawl:', firecrawlHtml.length)

    $ = cheerio.load(firecrawlHtml)
    items = $('.athing.submission')

    console.info('[Hacker News] Found items from Firecrawl:', items.length)
  }

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

export async function getHackerNewsStory(story: Story, maxTokens: number, { JINA_KEY, FIRECRAWL_KEY }: { JINA_KEY?: string, FIRECRAWL_KEY?: string }) {
  console.info(`[Content Fetch] Processing story: ${story.title}`)
  console.info(`[Content Fetch] Source: ${story.source}, URL: ${story.url}`)

  // 根據來源類型處理不同的內容獲取邏輯
  if (story.source === 'hacker-news') {
    console.info(`[Hacker News] Fetching article and comments for story ID: ${story.id}`)

    // 先嘗試抓取原始文章內容
    let article = ''
    try {
      console.info(`[Hacker News] Trying Jina for article: ${story.url}`)
      article = await getContentFromJina(story.url!, 'markdown', {}, JINA_KEY)
      if (!article || article.trim().length < 50) {
        throw new Error('Jina returned empty or too short content')
      }
      console.info(`[Hacker News] Jina success - article length: ${article.length}`)
    }
    catch (jinaError) {
      console.warn(`[Hacker News] Jina failed for article: ${jinaError}`)
      try {
        console.info(`[Hacker News] Trying Firecrawl for article: ${story.url}`)
        article = await getContentFromFirecrawl(story.url!, 'markdown', {}, FIRECRAWL_KEY)
        if (!article || article.trim().length < 50) {
          throw new Error('Firecrawl returned empty or too short content')
        }
        console.info(`[Hacker News] Firecrawl success - article length: ${article.length}`)
      }
      catch (firecrawlError) {
        console.error(`[Hacker News] Both Jina and Firecrawl failed for article: ${firecrawlError}`)
        article = ''
      }
    }

    // 再抓取 Hacker News 評論（評論可選，失敗不影響文章處理）
    let comments = ''
    try {
      console.info(`[Hacker News] Fetching comments for ID: ${story.id}`)
      comments = await getContentFromJina(
        `https://news.ycombinator.com/item?id=${story.id}`,
        'markdown',
        { include: '#pagespace + tr', exclude: '.navs' },
        JINA_KEY,
      )
      if (!comments || comments.trim().length < 30) {
        throw new Error('Comments content too short')
      }
      console.info(`[Hacker News] Comments fetched successfully - length: ${comments.length}`)
    }
    catch (commentsError) {
      console.warn(`[Hacker News] Failed to fetch comments: ${commentsError}`)
      try {
        comments = await getContentFromFirecrawl(
          `https://news.ycombinator.com/item?id=${story.id}`,
          'markdown',
          { include: '#pagespace + tr', exclude: '.navs' },
          FIRECRAWL_KEY,
        )
        console.info(`[Hacker News] Comments fetched via Firecrawl - length: ${comments.length}`)
      }
      catch (fallbackError) {
        console.warn(`[Hacker News] Comments unavailable (non-critical): ${fallbackError}`)
        comments = '' // 評論失敗不影響文章處理
      }
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
    let isSelfPost = false

    // 1. 嘗試透過 JSON API 獲取內容 (如果是 Self Post) 與評論
    // 這是比 Jina 更清晰的資料來源，特別是針對純文字討論
    const sourceUrl = story.sourceUrl ? story.sourceUrl.replace(/\/$/, '') : ''

    if (sourceUrl) {
      try {
        const redditJsonUrl = `${sourceUrl}.json?sort=top&limit=30`
        console.info('[Reddit] Fetching JSON:', redditJsonUrl)

        const response = await fetch(redditJsonUrl, {
          headers: {
            'User-Agent': 'DailyPodcast/1.0 (for tech news aggregation)',
          },
        })

        if (response.ok) {
          const json = await response.json() as any

          // 處理文章本體 (Self Text)
          const postData = Array.isArray(json) ? json[0]?.data?.children?.[0]?.data : null
          if (postData) {
            if (postData.is_self && postData.selftext) {
              article = postData.selftext
              isSelfPost = true
              console.info(`[Reddit] Used selftext from JSON - length: ${article.length}`)
            }
          }

          // 處理評論
          const commentListing = Array.isArray(json) ? json[1]?.data?.children || [] : []
          const commentLines = commentListing
            .filter((item: any) => item?.kind === 't1' && item?.data?.body)
            .map((item: any) => {
              const body = item.data?.body || ''
              const score = item.data?.score
              const sanitizedBody = body.replace(/\s+/g, ' ').trim()
              if (!sanitizedBody)
                return null
              if (typeof score === 'number') {
                return `- (${score}) ${sanitizedBody}`
              }
              return `- ${sanitizedBody}`
            })
            .filter(Boolean)
            .slice(0, 20)

          comments = commentLines.join('\n')
          if (comments.trim().length > 0) {
            console.info(`[Reddit] Comments fetched successfully - count: ${commentLines.length}`)
          }
        }
      }
      catch (error) {
        console.warn(`[Reddit] JSON fetch failed: ${error}`)
      }
    }

    // 2. 如果 JSON 沒抓到文章內容 (例如是連結貼文，或 JSON 失敗)，則使用 Jina 抓取外部連結
    if (!article && !isSelfPost && story.url) {
      try {
        console.info('[Reddit] Trying Jina for article:', story.url)
        article = await getContentFromJina(story.url!, 'markdown', {}, JINA_KEY)
        if (!article || article.trim().length < 50) {
          throw new Error('Jina returned empty or too short content')
        }
        console.info(`[Reddit] Jina success - article length: ${article.length}`)
      }
      catch (jinaError) {
        console.warn(`[Reddit] Jina failed for article: ${jinaError}`)
        try {
          console.info('[Reddit] Trying Firecrawl for article:', story.url)
          article = await getContentFromFirecrawl(story.url!, 'markdown', {}, FIRECRAWL_KEY)
          if (!article || article.trim().length < 50) {
            throw new Error('Firecrawl returned empty or too short content')
          }
          console.info(`[Reddit] Firecrawl success - article length: ${article.length}`)
        }
        catch (firecrawlError) {
          console.error(`[Reddit] Both Jina and Firecrawl failed for article: ${firecrawlError}`)
          article = ''
        }
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
    // 對於其他來源（Product Hunt, GitHub, Dev.to, Reddit），獲取主要內容
    console.info(`[${story.source}] Fetching content for: ${story.title}`)

    let article = ''
    try {
      console.info(`[${story.source}] Trying Jina for: ${story.url}`)
      article = await getContentFromJina(story.url!, 'markdown', {}, JINA_KEY)
      if (!article || article.trim().length < 50) {
        throw new Error('Jina returned empty or too short content')
      }
      console.info(`[${story.source}] Jina success - length: ${article.length}`)
    }
    catch (jinaError) {
      console.warn(`[${story.source}] Jina failed: ${jinaError}`)
      try {
        console.info(`[${story.source}] Trying Firecrawl for: ${story.url}`)
        article = await getContentFromFirecrawl(story.url!, 'markdown', {}, FIRECRAWL_KEY)
        if (!article || article.trim().length < 50) {
          throw new Error('Firecrawl returned empty or too short content')
        }
        console.info(`[${story.source}] Firecrawl success - length: ${article.length}`)
      }
      catch (firecrawlError) {
        console.error(`[${story.source}] Both services failed: ${firecrawlError}`)
        article = ''
      }
    }

    // 對於非 Hacker News 來源，如果抓取失敗也直接過濾掉
    if (!article || article.trim().length < 50) {
      console.error(`[${story.source}] ⚠️ SKIP: No content for "${story.title}" - story will be filtered out`)
      console.error(`[${story.source}] URL: ${story.url}`)
      return '' // 返回空字串，讓上層過濾
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
    // 此处 JS 运行在浏览器中
    // @ts-expect-error 浏览器内的对象
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

export async function getGitHubTrendingStories({ JINA_KEY, FIRECRAWL_KEY }: { JINA_KEY?: string, FIRECRAWL_KEY?: string }) {
  // GitHub Trending 抓取設定
  const GITHUB_CONFIG = {
    MAX_REPOS: 10, // 最多返回的 repo 數量
    USE_DEEPWIKI: false, // 暫時關閉 deepwiki，直接使用 GitHub 原始連結
  }

  const url = 'https://github.com/trending'

  let html = await getContentFromJina(url, 'html', {}, JINA_KEY)

  if (!html) {
    html = await getContentFromFirecrawl(url, 'html', {}, FIRECRAWL_KEY)
  }

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

export async function getProductHuntStories({ JINA_KEY, FIRECRAWL_KEY }: { JINA_KEY?: string, FIRECRAWL_KEY?: string }) {
  console.info('Fetching Product Hunt stories...')

  // Product Hunt 抓取設定
  const PRODUCT_HUNT_CONFIG = {
    MAX_PRODUCTS: 5, // 最多返回的產品數量
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

  let html = await getContentFromJina(url, 'html', {}, JINA_KEY)

  if (!html) {
    console.info('Jina failed, trying Firecrawl for Product Hunt...')
    html = await getContentFromFirecrawl(url, 'html', {}, FIRECRAWL_KEY)
  }

  if (!html) {
    console.error('Failed to get HTML content from both Jina and Firecrawl for Product Hunt')
    throw new Error('No HTML content available for Product Hunt')
  }

  console.info('Product Hunt HTML length:', html.length)

  const $ = cheerio.load(html)
  // 使用修正後的選擇器：尋找所有包含 post-item 的元素
  const products = $('[data-test*="post-item"]')

  console.info('Product Hunt products found:', products.length)

  const stories: Story[] = products.map((i: number, el: any) => {
    const $el = $(el)

    // 找第一個鏈接，這通常是產品鏈接
    const firstLink = $el.find('a').first()
    const href = firstLink.attr('href')
    let title = firstLink.text().trim()

    // 移除排名編號 (如 "1. " "2. ")
    if (PRODUCT_HUNT_CONFIG.REMOVE_RANKING) {
      title = title.replace(/^\d+\.\s*/, '')
    }

    // 尋找投票按鈕獲取投票數
    const votesText = $el.find('[data-test*="vote-button"]').text().trim()
    const votes = Number.parseInt(votesText) || 0

    // 嘗試找描述 - 可能在不同的位置
    let description = $el.find('[data-test*="post-description"]').text().trim()
    if (!description) {
      // 如果沒有描述，嘗試從其他地方獲取
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

export async function getDevToStories({ JINA_KEY, FIRECRAWL_KEY }: { JINA_KEY?: string, FIRECRAWL_KEY?: string }) {
  // Dev.to 抓取設定
  const DEV_TO_CONFIG = {
    MAX_ARTICLES: 10, // 最多返回的文章數量
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

  let html = await getContentFromJina(url, 'html', {}, JINA_KEY)

  if (!html) {
    html = await getContentFromFirecrawl(url, 'html', {}, FIRECRAWL_KEY)
  }

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

export async function getAllStories(today: string, { JINA_KEY, FIRECRAWL_KEY }: { JINA_KEY?: string, FIRECRAWL_KEY?: string }, options: StoryFetchOptions = {}) {
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
      ? getHackerNewsTopStories(today, { JINA_KEY, FIRECRAWL_KEY })
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
      ? getGitHubTrendingStories({ JINA_KEY, FIRECRAWL_KEY }).catch((err) => {
          console.error('Failed to get GitHub trending stories:', err)
          return []
        })
      : Promise.resolve([]),
    'product-hunt': shouldFetchSource('product-hunt')
      ? getProductHuntStories({ JINA_KEY, FIRECRAWL_KEY }).catch((err) => {
          console.error('Failed to get Product Hunt stories:', err)
          return []
        })
      : Promise.resolve([]),
    'dev-to': shouldFetchSource('dev-to')
      ? getDevToStories({ JINA_KEY, FIRECRAWL_KEY }).catch((err) => {
          console.error('Failed to get Dev.to stories:', err)
          return []
        })
      : Promise.resolve([]),
    'reddit': shouldFetchSource('reddit')
      ? getRedditStories({ JINA_KEY, FIRECRAWL_KEY }, { excludeRedditIds }).catch((err) => {
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

export async function getRedditStories({ JINA_KEY: _JINA_KEY, FIRECRAWL_KEY: _FIRECRAWL_KEY }: { JINA_KEY?: string, FIRECRAWL_KEY?: string }, options: { excludeRedditIds?: Set<string> } = {}) {
  console.info('Fetching Reddit stories...')

  const { excludeRedditIds } = options

  // Reddit 抓取設定 - 統一管理所有數量參數
  const REDDIT_CONFIG = {
    API_LIMIT: 10, // 每次請求抓少一點，我們只需要頭幾名
    FINAL_TOP_STORIES: 6, // 最終總共要幾篇 (依照使用者需求 5~6 篇)
    MIN_UPVOTES: 50, // 最低 upvotes 門檻
    TOP_PER_SUBREDDIT: 3, // 每個版面保留前幾名，避免太隨機
  }

  // 選擇科技相關的熱門 subreddits
  // 調整順序：將較為專業/硬技術的版面放在前面，確保它們優先入選
  // 選擇含金量高的技術討論版 (High Signal Technical Subreddits)
  // 替換掉原本容易有政治口水或太淺的版面
  const subreddits = [
    'LocalLLaMA', // AI/LLM 最前線，深度夠
    'coding', // 專注程式設計，無水文
    'netsec', // 網路安全 Hacker News 等級
    'sysadmin', // 系統管理實務
    'dataengineering', // 數據架構深度討論
  ]

  const politicalKeywords = [
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

  const isPoliticalPost = (title: string, url: string) => {
    const haystack = `${title} ${url}`.toLowerCase()
    return politicalKeywords.some(keyword => haystack.includes(keyword.toLowerCase()))
  }

  const storiesBySubreddit: Record<string, Story[]> = {}

  // 隨機選擇排序方式，避免連續幾天抓到一樣的熱門文章
  const sortMethods = ['hot', 'rising', 'top']
  const selectedSort = sortMethods[Math.floor(Math.random() * sortMethods.length)]
  const timeQuery = selectedSort === 'top' ? '&t=day' : ''

  console.info(`[Reddit] Fetching stories with sort: ${selectedSort}${timeQuery}`)

  for (const subreddit of subreddits) {
    try {
      // 建構 URL
      const url = `https://www.reddit.com/r/${subreddit}/${selectedSort}/.json?limit=${REDDIT_CONFIG.API_LIMIT}${timeQuery}`
      console.info(`Fetching from r/${subreddit} (${selectedSort})...`)

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'DailyPodcast/1.0 (for tech news aggregation)',
        },
      })

      if (!response.ok) {
        console.warn(`Failed to fetch r/${subreddit}: ${response.status}`)
        continue
      }

      const data = await response.json() as any
      const posts = data?.data?.children || []

      const stories: Story[] = posts
        .filter((post: any) => {
          const postData = post.data
          const title = postData.title || ''
          const url = postData.url || ''
          return !postData.stickied // 排除置頂
            && !postData.distinguished // 排除管理員發文
            && !postData.removed_by_category // 排除被移除的
            && url
            && postData.ups > REDDIT_CONFIG.MIN_UPVOTES
            && !isPoliticalPost(title, url)
            && !(excludeRedditIds?.has(postData.id))
        })
        .map((post: any) => {
          const postData = post.data
          return {
            id: postData.id,
            title: `${postData.title} (r/${subreddit})`,
            url: postData.url,
            source: 'reddit' as const,
            sourceUrl: `https://www.reddit.com${postData.permalink}`,
            description: postData.selftext?.substring(0, 200) || '',
            upvotes: postData.ups,
            subreddit,
          }
        })

      if (stories.length > 0) {
        // 雖然 Reddit 預設就是熱門排序，但保險起見還是該版面內排一次
        storiesBySubreddit[subreddit] = stories.sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0))
        console.info(`Fetched ${stories.length} candidates from r/${subreddit}`)
      }
    }
    catch (error) {
      console.error(`Error fetching r/${subreddit}:`, error)
    }
  }

  const storyPool = subreddits.flatMap(subreddit =>
    (storiesBySubreddit[subreddit] || []).slice(0, REDDIT_CONFIG.TOP_PER_SUBREDDIT),
  )
  for (let i = storyPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[storyPool[i], storyPool[j]] = [storyPool[j], storyPool[i]]
  }

  const selectedStories = storyPool.slice(0, REDDIT_CONFIG.FINAL_TOP_STORIES)

  console.info('Reddit stories processed (Randomized):', selectedStories.length)
  // 列印選出的來源分佈，方便觀察
  const distribution = selectedStories.reduce((acc, story) => {
    const title = story.title || ''
    const sub = title.match(/\(r\/(.*?)\)/)?.[1] || 'unknown'
    acc[sub] = (acc[sub] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  console.info('Reddit source distribution:', distribution)

  return selectedStories
}
