import puppeteer from '@cloudflare/puppeteer'
import * as cheerio from 'cheerio'

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
    sourceUrl: story.hackerNewsUrl
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
  } else {
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
    const stars = parseInt(starsText.replace(/,/g, '')) || 0
    
    if (!repoName || !title) return null

    const originalUrl = `https://github.com${titleLink.attr('href')}`
    const deepwikiUrl = `https://deepwiki.com${titleLink.attr('href')}`
    
    return {
      id: repoName.replace('/', '-'),
      title: `${title} (${stars} ⭐)`,
      url: deepwikiUrl, // 使用 deepwiki 替代原始 GitHub URL
      source: 'github-trending' as const,
      sourceUrl: originalUrl,
      description,
      stars
    }
  }).get().filter(Boolean) as Story[]

  return stories.slice(0, 10) // 取前 10 個
}

export async function getProductHuntStories({ JINA_KEY, FIRECRAWL_KEY }: { JINA_KEY?: string, FIRECRAWL_KEY?: string }) {
  const url = 'https://www.producthunt.com'
  
  let html = await getContentFromJina(url, 'html', {}, JINA_KEY)
  
  if (!html) {
    html = await getContentFromFirecrawl(url, 'html', {}, FIRECRAWL_KEY)
  }

  const $ = cheerio.load(html)
  const products = $('[data-test="homepage-section-0"] [data-test*="post-item"]')

  const stories: Story[] = products.map((i: number, el: cheerio.Element) => {
    const $el = $(el)
    const titleEl = $el.find('a[data-test="post-name"]')
    const title = titleEl.text().trim()
    const description = $el.find('[data-test="post-description"]').text().trim()
    const votesText = $el.find('[data-test="vote-button"]').text().trim()
    const votes = parseInt(votesText) || 0
    const href = titleEl.attr('href')
    
    if (!title || !href) return null

    return {
      id: href.split('/').pop() || `ph-${i}`,
      title: `${title} (${votes} 👍)`,
      url: `https://www.producthunt.com${href}`,
      source: 'product-hunt' as const,
      sourceUrl: `https://www.producthunt.com${href}`,
      description,
      votes
    }
  }).get().filter(Boolean) as Story[]

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

  const stories: Story[] = articles.map((i: number, el: cheerio.Element) => {
    const $el = $(el)
    const titleLink = $el.find('.crayons-story__title a')
    const title = titleLink.text().trim()
    const href = titleLink.attr('href')
    const description = $el.find('.crayons-story__tags').text().trim()
    const author = $el.find('.crayons-story__secondary .crayons-link').first().text().trim()
    
    if (!title || !href) return null

    return {
      id: href.split('/').pop() || `dev-${i}`,
      title: `${title} by ${author}`,
      url: href.startsWith('http') ? href : `https://dev.to${href}`,
      source: 'dev-to' as const,
      sourceUrl: href.startsWith('http') ? href : `https://dev.to${href}`,
      description
    }
  }).get().filter(Boolean) as Story[]

  return stories.slice(0, 10) // 取前 10 個
}

export async function getAllStories(today: string, { JINA_KEY, FIRECRAWL_KEY }: { JINA_KEY?: string, FIRECRAWL_KEY?: string }) {
  const [hackerNewsStories, githubStories, productHuntStories, devToStories] = await Promise.all([
    getHackerNewsTopStories(today, { JINA_KEY, FIRECRAWL_KEY }),
    getGitHubTrendingStories({ JINA_KEY, FIRECRAWL_KEY }).catch(err => {
      console.error('Failed to get GitHub trending stories:', err)
      return []
    }),
    getProductHuntStories({ JINA_KEY, FIRECRAWL_KEY }).catch(err => {
      console.error('Failed to get Product Hunt stories:', err)
      return []
    }),
    getDevToStories({ JINA_KEY, FIRECRAWL_KEY }).catch(err => {
      console.error('Failed to get Dev.to stories:', err)
      return []
    })
  ])

  return [
    ...hackerNewsStories.slice(0, 15), // 取前 15 個 HN 故事
    ...githubStories,
    ...productHuntStories,
    ...devToStories
  ]
}
