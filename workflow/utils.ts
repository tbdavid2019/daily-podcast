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
  const url = `https://news.ycombinator.com/front?day=${today}`

  const html = await getContentFromJina(url, 'html', {}, JINA_KEY)

  let $ = cheerio.load(html)
  let items = $('.athing.submission')

  if (!items.length) {
    const html = await getContentFromFirecrawl(url, 'html', {}, FIRECRAWL_KEY)

    $ = cheerio.load(html)
    items = $('.athing.submission')
  }

  const stories: Story[] = items.map((i: number, el: cheerio.Element) => ({
    id: $(el).attr('id'),
    title: $(el).find('.titleline > a').text(),
    url: $(el).find('.titleline > a').attr('href'),
    hackerNewsUrl: `https://news.ycombinator.com/item?id=${$(el).attr('id')}`,
  })).get()

  return stories.filter(story => story.id && story.url).map(story => ({
    ...story,
    source: 'hacker-news' as const,
    sourceUrl: story.hackerNewsUrl,
  }))
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
  const url = 'https://github.com/trending'

  let html = await getContentFromJina(url, 'html', {}, JINA_KEY)

  if (!html) {
    html = await getContentFromFirecrawl(url, 'html', {}, FIRECRAWL_KEY)
  }

  const $ = cheerio.load(html)
  const repos = $('.Box-row')

  const stories: Story[] = repos.map((i: number, el: cheerio.Element) => {
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
    const deepwikiUrl = `https://deepwiki.com${titleLink.attr('href')}`

    return {
      id: repoName.replace('/', '-'),
      title: `${title} (${stars} ⭐)`,
      url: deepwikiUrl, // 使用 deepwiki 替代原始 GitHub URL
      source: 'github-trending' as const,
      sourceUrl: originalUrl,
      description,
      stars,
    }
  }).get().filter(Boolean) as Story[]

  return stories.slice(0, 10) // 取前 10 個
}

export async function getProductHuntStories({ JINA_KEY, FIRECRAWL_KEY }: { JINA_KEY?: string, FIRECRAWL_KEY?: string }) {
  console.info('Fetching Product Hunt stories...')
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
    title = title.replace(/^\d+\.\s*/, '')

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
  return stories.slice(0, 5) // 取前 5 個
}

export async function getDevToStories({ JINA_KEY, FIRECRAWL_KEY }: { JINA_KEY?: string, FIRECRAWL_KEY?: string }) {
  const url = 'https://dev.to/top/week'

  let html = await getContentFromJina(url, 'html', {}, JINA_KEY)

  if (!html) {
    html = await getContentFromFirecrawl(url, 'html', {}, FIRECRAWL_KEY)
  }

  const $ = cheerio.load(html)
  const articles = $('.crayons-story')

  // 定義需要過濾的關鍵字 - 活動、挑戰、比賽類型文章
  const filterKeywords = [
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
  ]

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
    const titleLower = title.toLowerCase()
    const descriptionLower = description.toLowerCase()
    const shouldFilter = filterKeywords.some(keyword =>
      titleLower.includes(keyword) || descriptionLower.includes(keyword),
    )

    // 如果包含活動關鍵字，跳過這篇文章
    if (shouldFilter) {
      console.info(`[Dev.to Filter] 過濾活動文章: ${title}`)
      return null
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
  return stories.slice(0, 10) // 取前 10 個
}

export async function getAllStories(today: string, { JINA_KEY, FIRECRAWL_KEY }: { JINA_KEY?: string, FIRECRAWL_KEY?: string }, options: StoryFetchOptions = {}) {
  const { limits = {} } = options

  console.info('Starting to fetch stories from all sources...', { limits })

  // 並行抓取所有來源的內容
  const [hackerNewsStories, githubStories, productHuntStories, devToStories, redditStories] = await Promise.all([
    getHackerNewsTopStories(today, { JINA_KEY, FIRECRAWL_KEY }),
    getGitHubTrendingStories({ JINA_KEY, FIRECRAWL_KEY }).catch((err) => {
      console.error('Failed to get GitHub trending stories:', err)
      return []
    }),
    getProductHuntStories({ JINA_KEY, FIRECRAWL_KEY }).catch((err) => {
      console.error('Failed to get Product Hunt stories:', err)
      return []
    }),
    getDevToStories({ JINA_KEY, FIRECRAWL_KEY }).catch((err) => {
      console.error('Failed to get Dev.to stories:', err)
      return []
    }),
    getRedditStories({ JINA_KEY, FIRECRAWL_KEY }).catch((err) => {
      console.error('Failed to get Reddit stories:', err)
      return []
    }),
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
      const url = `https://www.reddit.com/r/${subreddit}/hot/.json?limit=5`

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
            && postData.ups > 50 // 至少 50 個 upvotes
        })
        .slice(0, 2) // 每個 subreddit 取 2 個
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

  // 按 upvotes 排序，取前 5 個
  const topStories = allStories
    .sort((a, b) => (b.upvotes || 0) - (a.upvotes || 0))
    .slice(0, 5)

  console.info('Reddit stories processed:', topStories.length)
  return topStories
}
