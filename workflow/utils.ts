import puppeteer from '@cloudflare/puppeteer'
import * as cheerio from 'cheerio'

type StorySource = NonNullable<Story['source']>
interface StoryFetchOptions {
  limits?: Partial<Record<StorySource, number>>
}

async function getContentFromJina(url: string, format: 'html' | 'markdown', selector?: { include?: string, exclude?: string }, JINA_KEY?: string) {
  const jinaHeaders: HeadersInit = {
    'X-Retain-Images': 'none',
    'X-Return-Format': format,
  }

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
  const response = await fetch(`https://r.jina.ai/${url}`, {
    headers: jinaHeaders,
  })
  if (response.ok) {
    const text = await response.text()
    return text
  }
  else {
    console.error(`get content from jina failed: ${response.statusText} ${url}`)
    return ''
  }
}

async function getContentFromFirecrawl(url: string, format: 'html' | 'markdown', selector?: { include?: string, exclude?: string }, FIRECRAWL_KEY?: string) {
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
  const result = await response.json() as { success: boolean, data: Record<string, string> }
  if (result.success) {
    return result.data[format] || ''
  }
  else {
    console.error(`get content from firecrawl failed: ${response.statusText} ${url}`)
    return ''
  }
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
  const headers: HeadersInit = {
    'X-Retain-Images': 'none',
  }

  if (JINA_KEY) {
    headers.Authorization = `Bearer ${JINA_KEY}`
  }

  // 根據來源類型處理不同的內容獲取邏輯
  if (story.source === 'hacker-news') {
    const [article, comments] = await Promise.all([
      getContentFromJina(story.url!, 'markdown', {}, JINA_KEY)
        .catch(() => getContentFromFirecrawl(story.url!, 'markdown', {}, FIRECRAWL_KEY)),
      getContentFromJina(`https://news.ycombinator.com/item?id=${story.id}`, 'markdown', { include: '#pagespace + tr', exclude: '.navs' }, JINA_KEY)
        .catch(() => getContentFromFirecrawl(`https://news.ycombinator.com/item?id=${story.id}`, 'markdown', { include: '#pagespace + tr', exclude: '.navs' }, FIRECRAWL_KEY)),
    ])

    return [
      story.title ? `<title>${story.title}</title>` : '',
      article ? `<article>${article.substring(0, maxTokens * 4)}</article>` : '',
      comments ? `<comments>${comments.substring(0, maxTokens * 4)}</comments>` : '',
    ].filter(Boolean).join('\n\n---\n\n')
  }
  else {
    // 對於其他來源，只獲取主要內容
    const article = await getContentFromJina(story.url!, 'markdown', {}, JINA_KEY)
      .catch(() => getContentFromFirecrawl(story.url!, 'markdown', {}, FIRECRAWL_KEY))

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
    USE_DEEPWIKI: true, // 是否使用 deepwiki 替代原始 GitHub URL
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

  return stories.slice(0, GITHUB_CONFIG.MAX_REPOS)
}

export async function getProductHuntStories({ JINA_KEY, FIRECRAWL_KEY }: { JINA_KEY?: string, FIRECRAWL_KEY?: string }) {
  console.info('Fetching Product Hunt stories...')

  // Product Hunt 抓取設定
  const PRODUCT_HUNT_CONFIG = {
    MAX_PRODUCTS: 5, // 最多返回的產品數量
    REMOVE_RANKING: true, // 是否移除標題中的排名編號
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

    return {
      id: href.split('/').pop() || `ph-${i}`,
      title: `${title} (${votes} 👍)`,
      url: `https://www.producthunt.com${href}`,
      source: 'product-hunt' as const,
      sourceUrl: `https://www.producthunt.com${href}`,
      description,
      votes,
    }
  }).get().filter(Boolean) as Story[]

  console.info('Product Hunt stories processed:', stories.length)
  return stories.slice(0, PRODUCT_HUNT_CONFIG.MAX_PRODUCTS)
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
  const { limits = {} } = options

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
      ? getRedditStories({ JINA_KEY, FIRECRAWL_KEY }).catch((err) => {
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

export async function getRedditStories({ JINA_KEY: _JINA_KEY, FIRECRAWL_KEY: _FIRECRAWL_KEY }: { JINA_KEY?: string, FIRECRAWL_KEY?: string }) {
  console.info('Fetching Reddit stories...')

  // Reddit 抓取設定 - 統一管理所有數量參數
  const REDDIT_CONFIG = {
    API_LIMIT: 15, // Reddit API 每次請求的文章數量上限（增加以獲取更多選擇）
    PER_SUBREDDIT: 3, // 每個 subreddit 實際使用的文章數量（從 2 增加到 3）
    FINAL_TOP_STORIES: 10, // 最終返回的熱門文章數量（從 5 增加到 10）
    MIN_UPVOTES: 50, // 最低 upvotes 門檻
  }

  // 選擇科技相關的熱門 subreddits
  const subreddits = [
    'technology',
    'programming',
    'webdev',
    'MachineLearning',
    'artificial',
    'startups',
  ]

  const allStories: Story[] = []

  for (const subreddit of subreddits) {
    try {
      const url = `https://www.reddit.com/r/${subreddit}/hot/.json?limit=${REDDIT_CONFIG.API_LIMIT}`

      console.info(`Fetching from r/${subreddit}...`)

      // Reddit API 不需要 Jina/Firecrawl，直接使用 JSON API
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
          // 過濾掉置頂帖、廣告和被刪除的帖子
          return !postData.stickied
            && !postData.is_self
            && !postData.removed_by_category
            && postData.url
            && postData.ups > REDDIT_CONFIG.MIN_UPVOTES
        })
        .slice(0, REDDIT_CONFIG.PER_SUBREDDIT)
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

      allStories.push(...stories)
      console.info(`Fetched ${stories.length} stories from r/${subreddit}`)
    }
    catch (error) {
      console.error(`Error fetching r/${subreddit}:`, error)
    }
  }

  // 按 upvotes 排序，取前 N 個
  const topStories = allStories
    .sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0))
    .slice(0, REDDIT_CONFIG.FINAL_TOP_STORIES)

  console.info('Reddit stories processed:', topStories.length)
  return topStories
}
