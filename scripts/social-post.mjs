#!/usr/bin/env node

import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { chromium } from 'playwright-core'

// 預設發布網站來源
const BASE_URL = process.env.HACKER_NEWS_WORKER_URL || 'https://podcast.david888.com'
const SESSION_DIR = path.resolve(process.cwd(), '.social-session')

// 解析命令列參數
function parseArgs() {
  const args = process.argv.slice(2)
  const options = {
    date: '',
    dryRun: false,
    loginOnly: false,
    target: 'both', // 'x', 'threads', 'both'
    headless: false,
    maxStories: 5,
    copyFile: '',
  }

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--dry-run') {
      options.dryRun = true
    }
    else if (arg === '--login') {
      options.loginOnly = true
    }
    else if (arg === '--headless') {
      options.headless = true
    }
    else if (arg === '--date' && args[i + 1]) {
      options.date = args[i + 1]
      i += 1
    }
    else if (arg === '--target' && args[i + 1]) {
      options.target = args[i + 1].toLowerCase()
      i += 1
    }
    else if (arg === '--max-stories' && args[i + 1]) {
      options.maxStories = Number.parseInt(args[i + 1], 10) || 5
      i += 1
    }
    else if (arg === '--copy-file' && args[i + 1]) {
      options.copyFile = args[i + 1]
      i += 1
    }
  }

  return options
}

// 取得台北時間 YYYY-MM-DD
function getTaipeiDate() {
  const now = new Date()
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000)
  const taipei = new Date(utc + (3600000 * 8))
  return taipei.toISOString().split('T')[0]
}

// 抓取指定集數的 Markdown
async function fetchEpisodeData(date) {
  const episodeUrl = `${BASE_URL}/post/${date}`
  console.info(`🌐 正在抓取節目資料：${episodeUrl}`)

  const res = await fetch(episodeUrl, {
    headers: { Accept: 'text/markdown' },
  })

  if (!res.ok) {
    throw new Error(`無法取得 ${date} 節目資料 (HTTP ${res.status}): ${episodeUrl}`)
  }

  const md = await res.text()

  const lines = md.split('\n')
  let rawTitle = ''
  let currentSection = ''
  let currentStory = null
  const summaryLines = []
  const rawStories = []

  for (const line of lines) {
    if (!rawTitle && line.startsWith('# ')) {
      rawTitle = line.slice(2).trim()
      continue
    }

    if (line.startsWith('## Summary')) {
      currentSection = 'summary'
      continue
    }

    if (line.startsWith('## Article')) {
      currentSection = 'article'
      continue
    }

    const storyHeaderMatch = line.match(/^##\s+\[([^\]]+)\]\(([^)]+)\)/)
    if (storyHeaderMatch) {
      if (currentStory) {
        rawStories.push(currentStory)
      }
      currentStory = {
        title: storyHeaderMatch[1].trim(),
        link: storyHeaderMatch[2].trim(),
        contentLines: [],
      }
      currentSection = 'story'
      continue
    }

    if (line.startsWith('## ')) {
      if (currentStory) {
        rawStories.push(currentStory)
        currentStory = null
      }
      currentSection = 'other'
      continue
    }

    if (currentSection === 'summary') {
      summaryLines.push(line)
    }
    else if (currentSection === 'story' && currentStory) {
      currentStory.contentLines.push(line)
    }
  }

  if (currentStory) {
    rawStories.push(currentStory)
  }

  const cleanTitle = rawTitle.replace(/^\[\d{4}-\d{2}-\d{2}\]\s*/, '')
  const summary = summaryLines.join(' ').replace(/\s+/g, ' ').trim()

  const stories = rawStories.map((story) => {
    const rawContent = story.contentLines.join(' ').replace(/\s+/g, ' ').replace(/[#*`_]/g, '').trim()
    const shortDesc = rawContent.slice(0, 90).trim()
    return {
      title: story.title,
      link: story.link,
      desc: shortDesc ? `${shortDesc}...` : '',
    }
  })

  return {
    date,
    rawTitle,
    cleanTitle,
    summary,
    stories,
    episodeUrl,
  }
}

// 格式化 X (Twitter) 串文（每則小於 270 字元）
function formatXTweets(data, maxStories = 5) {
  const tweets = []

  // 1. 首則推文：節目主要標題與精華
  const headerTweet = `🎙️ DAVID888 Daily 科技廣播【${data.date}】\n${data.cleanTitle}\n\n#DAVID888Daily #科技新聞 #Podcast\n\n今日精選科技議題整理 🧵👇\n🎧 線上收聽與完整報導：\n${data.episodeUrl}`
  tweets.push(headerTweet)

  // 2. 子故事推文
  const selectedStories = data.stories.slice(0, maxStories)
  selectedStories.forEach((story, idx) => {
    const num = `${idx + 1}/${selectedStories.length}`
    let tweet = `${num} 📌 ${story.title}\n\n${story.desc}`
    if (story.link && story.link.startsWith('http')) {
      tweet = `${tweet}\n🔗 原文：${story.link}`
    }
    // 確保單則不超過 270 字元
    if (tweet.length > 270) {
      tweet = `${tweet.slice(0, 267)}...`
    }
    tweets.push(tweet)
  })

  // 3. 收尾推文
  const footerTweet = `以上是今日精選！\n歡迎造訪官網收聽完整語音對話與更多深度討論：\n${data.episodeUrl}\n\n明天同一時間再見！👋`
  tweets.push(footerTweet)

  return tweets
}

// 每篇新聞各佔一則，與節目介紹組成 Threads 串文。
export function formatThreadsPosts(data, maxStories = 5) {
  const selectedStories = data.stories.slice(0, maxStories)
  const posts = [`🎙️ DAVID888 Daily 科技廣播【${data.date}】\n${data.cleanTitle}\n\n今日精選科技議題 🧵👇\n🎧 收聽完整節目：\n${data.episodeUrl}`]
  for (const [index, story] of selectedStories.entries()) {
    const prefix = `${index + 1}/${selectedStories.length} 📌 ${story.title}`
    const link = story.link?.startsWith('http') ? `\n🔗 原文：${story.link}` : ''
    const remaining = 500 - Array.from(`${prefix}\n\n${link}`).length
    if (remaining < 0)
      throw new Error('Threads 新聞標題或連結過長，無法建立貼文')
    const description = Array.from(story.desc).slice(0, remaining).join('')
    posts.push(`${prefix}\n\n${description}${link}`)
  }
  if (posts.some(post => Array.from(post).length > 500)) {
    throw new Error('Threads 貼文超過 500 字元')
  }
  return posts
}

function loadSocialCopy(filePath, data) {
  if (!filePath)
    return null

  const copy = JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'))
  const validatePosts = (posts, platform, maxLength) => {
    if (!Array.isArray(posts) || posts.some(post => typeof post !== 'string' || !post.trim())) {
      throw new Error(`${platform} 文案必須是非空字串陣列`)
    }
    if (posts.some(post => Array.from(post).length > maxLength)) {
      throw new Error(`${platform} 單篇文案超過 ${maxLength} 字元`)
    }
  }

  if (copy.date !== data.date)
    throw new Error(`文案日期 ${copy.date || '(空白)'} 與節目日期 ${data.date} 不符`)
  validatePosts(copy.xTweets, 'X', 270)
  validatePosts(copy.threadsPosts, 'Threads', 500)
  for (const [platform, posts] of [['X', copy.xTweets], ['Threads', copy.threadsPosts]]) {
    if (posts.length === 0 || posts.some(post => !post.includes(data.episodeUrl)))
      throw new Error(`${platform} 每篇文案都必須包含今日節目連結`)
    if (new Set(posts).size !== posts.length)
      throw new Error(`${platform} 文案包含重複貼文`)
  }

  return copy
}

// 啟動瀏覽器
async function initBrowser(headless = false) {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true })
  }

  console.info(`🚀 啟動 Chrome（設定檔目錄：${SESSION_DIR}）`)
  const context = await chromium.launchPersistentContext(SESSION_DIR, {
    channel: 'chrome',
    headless,
    viewport: { width: 1280, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  })

  return context
}

// A durable intent is written before clicking Post. An interrupted submission must
// be reconciled by a person; blindly retrying an ambiguous click can duplicate it.
export async function publishIndependentPosts({ posts, journal, publish, verify }) {
  if (journal.hasPending?.())
    throw new Error('此平台有送出狀態待確認的貼文，請先核對現存貼文與紀錄')
  for (let i = 0; i < posts.length; i += 1) {
    const key = createHash('sha256').update(posts[i]).digest('hex')
    const entry = journal.get(key)
    if (entry?.status === 'pending')
      throw new Error(`第 ${i + 1} 篇送出狀態待確認，請檢查平台後處理紀錄，避免重複發布`)
    if (entry?.status === 'verified') {
      await verify(posts[i], entry.url)
      console.info(`↪ 已確認第 ${i + 1} 篇：${entry.url}`)
      continue
    }
    journal.set(key, { status: 'pending' })
    const url = await publish(posts[i], i)
    journal.set(key, { status: 'pending', url })
    await verify(posts[i], url)
    journal.set(key, { status: 'verified', url })
    console.info(`✅ 第 ${i + 1}/${posts.length} 篇已確認：${url}`)
  }
}

function openJournal(date, platform) {
  const file = path.join(SESSION_DIR, `social-publication-${date}-${platform}.json`)
  const entries = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {}
  return {
    get: key => entries[key],
    hasPending: () => Object.values(entries).some(entry => entry.status === 'pending'),
    set(key, entry) {
      entries[key] = entry
      const temp = `${file}.tmp`
      fs.writeFileSync(temp, JSON.stringify(entries, null, 2), { mode: 0o600 })
      fs.renameSync(temp, file)
    },
  }
}

function markerFor(post) {
  return Array.from(post).slice(0, 40).join('')
}

async function findProfilePost(page, profileUrl, post, platform) {
  // The profile can lag behind the submission. Refresh, then stop safely if it
  // remains unavailable; the pending journal prevents an automatic duplicate.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(3000)
    if (platform === 'x') {
      const article = page.locator('article').filter({ hasText: markerFor(post) })
      if (await article.count() > 1)
        throw new Error('X 個人頁找到重複貼文，請人工核對')
      if (await article.count() === 1) {
        const href = await article.locator('a[href*="/status/"]').first().getAttribute('href')
        if (href)
          return new URL(href, profileUrl).href
      }
    }
    else {
      const match = page.getByText(markerFor(post), { exact: false }).first()
      if (await match.count()) {
        const card = match.locator('xpath=ancestor::div[6]')
        const href = await card.locator('a[href*="/post/"]').first().getAttribute('href').catch(() => null)
        if (href)
          return new URL(href, profileUrl).href
      }
    }
  }
  throw new Error(`${platform} 個人頁尚未找到貼文；送出狀態待確認`)
}

export async function verifyPost(page, post, url, platform, episodeUrl) {
  if (!url)
    throw new Error(`${platform} 缺少貼文 permalink`)
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.getByText(markerFor(post), { exact: false }).first().waitFor({ state: 'visible', timeout: 30000 })
  const textWithoutLink = post.replace(episodeUrl, '').replace(/\s+/g, ' ').trim()
  // Rendered line breaks separate the post's paragraphs on Threads.
  // eslint-disable-next-line unicorn/prefer-dom-node-text-content
  const body = (await page.locator('body').evaluate(element => element.innerText)).replace(/\s+/g, ' ')
  if (!body.includes(textWithoutLink))
    throw new Error(`${platform} 貼文內容核對失敗：${url}`)
  // Profile discovery establishes that this is a top-level post. Confirm that
  // the post links to the requested episode, including X's t.co redirects.
  const links = await page.locator('a[href]').evaluateAll(anchors => anchors.map(a => a.href))
  let linkMatches = links.some((link) => {
    const target = new URL(link)
    return link === episodeUrl || (target.hostname === 'l.threads.com' && target.searchParams.get('u') === episodeUrl)
  })
  for (const link of links.filter(link => /^https:\/\/t\.co\//.test(link))) {
    if (linkMatches)
      break
    try {
      const response = await fetch(link, { signal: AbortSignal.timeout(10000) })
      linkMatches = response.url.split(/[?#]/)[0] === episodeUrl
    }
    catch {
      // A failed redirect is not evidence that the episode link is correct.
    }
  }
  if (!linkMatches)
    throw new Error(`${platform} 節目連結核對失敗：${url}`)
}

async function postToX(context, posts, episodeUrl, date) {
  const page = await context.newPage()
  try {
    await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 30000 })
    const profileLink = page.locator('a[aria-label="Profile"][href], a[data-testid="AppTabBar_Profile_Link"][href]').first()
    await profileLink.waitFor({ state: 'visible', timeout: 30000 })
    const href = await profileLink.getAttribute('href')
    if (!href)
      throw new Error('無法取得 X 個人頁，請檢查登入狀態')
    const profileUrl = new URL(href, 'https://x.com').href
    await publishIndependentPosts({
      posts,
      journal: openJournal(date, 'x'),
      publish: async (post) => {
        await page.goto('https://x.com/home', { waitUntil: 'domcontentloaded', timeout: 30000 })
        await page.locator('a[aria-label="Post"][href="/compose/post"], a[data-testid="SideNav_NewTweet_Button"]').first().click()
        const dialog = page.locator('[role="dialog"]').last()
        await dialog.waitFor({ state: 'visible', timeout: 15000 })
        const editor = dialog.locator('textarea, div[role="textbox"][contenteditable="true"]').first()
        await editor.fill(post)
        const value = await editor.evaluate(element => 'value' in element ? element.value : element.textContent)
        if (value !== post)
          throw new Error('X 草稿內容核對失敗')
        const button = dialog.locator('button[data-testid="tweetButton"]').last()
        await button.waitFor({ state: 'visible', timeout: 15000 })
        await button.click({ timeout: 10000 })
        await dialog.waitFor({ state: 'hidden', timeout: 30000 })
        return findProfilePost(page, profileUrl, post, 'x')
      },
      verify: (post, url) => verifyPost(page, post, url, 'X', episodeUrl),
    })
  }
  finally {
    await page.close().catch(() => {})
  }
}

async function postToThreads(context, posts, episodeUrl, date) {
  const page = await context.newPage()
  const profileUrl = 'https://www.threads.com/@david888.chiang'
  try {
    await publishIndependentPosts({
      posts,
      journal: openJournal(date, 'threads'),
      publish: async (post) => {
        await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
        const create = page.locator('div[role="button"]:has-text("有什麼新鮮事？"), div[role="button"]:has-text("新串文"), svg[aria-label="Create"], svg[aria-label="建立"]').filter({ visible: true }).first()
        await create.click({ timeout: 15000 })
        const dialog = page.getByRole('dialog').last()
        await dialog.waitFor({ state: 'visible', timeout: 15000 })
        const editor = dialog.locator('div[role="textbox"][contenteditable="true"]').first()
        await editor.fill(post)
        if (await editor.textContent() !== post)
          throw new Error('Threads 草稿內容核對失敗')
        await dialog.getByRole('button', { name: /^(發佈|發布|Post)$/i }).last().click({ timeout: 10000 })
        await dialog.waitFor({ state: 'hidden', timeout: 30000 })
        return findProfilePost(page, profileUrl, post, 'threads')
      },
      verify: (post, url) => verifyPost(page, post, url, 'Threads', episodeUrl),
    })
  }
  finally {
    await page.close().catch(() => {})
  }
}

// 主執行流程
async function main() {
  const options = parseArgs()
  const date = options.date || getTaipeiDate()

  console.info(`\n========================================`)
  console.info(`📢 DAVID888 Daily 社群自動發文工具`)
  console.info(`📅 日期：${date}`)
  console.info(`🎯 目標平台：${options.target}`)
  console.info(`========================================\n`)

  // 僅登入模式
  if (options.loginOnly) {
    console.info('🔑 進入登入引導模式...')
    const context = await initBrowser(false)
    const page = await context.newPage()
    await page.goto('https://x.com')
    const page2 = await context.newPage()
    await page2.goto('https://www.threads.net')
    console.info('\n✅ 已開啟 X 與 Threads 視窗。請手動完成登入。登入完成後直接關閉瀏覽器或按 Ctrl+C 結束即可。')
    return
  }

  // 1. 抓取節目資料
  const data = await fetchEpisodeData(date)
  const suppliedCopy = loadSocialCopy(options.copyFile, data)
  const xTweets = suppliedCopy?.xTweets || formatXTweets(data, options.maxStories)
  const threadsPosts = suppliedCopy?.threadsPosts || formatThreadsPosts(data, options.maxStories)

  // Dry-run 模式：僅在終端機預覽
  if (options.dryRun) {
    console.info('🔍 [Dry-Run 模式] 預覽即將發布的內容：\n')
    if (options.target === 'x' || options.target === 'both') {
      console.info('--- 🐦 X (Twitter) 獨立貼文預覽 ---')
      xTweets.forEach((t, i) => {
        console.info(`\n[推文 ${i + 1}/${xTweets.length}] (${Array.from(t).length} 字元)`)
        console.info(t)
      })
    }
    if (options.target === 'threads' || options.target === 'both') {
      console.info('\n--- 🧵 Threads 貼文預覽 ---')
      threadsPosts.forEach((post, i) => {
        console.info(`\n[貼文 ${i + 1}/${threadsPosts.length}] (${Array.from(post).length} 字元)`)
        console.info(post)
      })
    }
    console.info('\n✨ 預覽完成，未開啟瀏覽器或發送任何貼文。')
    return
  }

  if (!suppliedCopy)
    throw new Error('正式發布必須使用 --copy-file 提供已審核文案')

  // 2. 啟動瀏覽器並發布
  const context = await initBrowser(options.headless)

  try {
    if (options.target === 'x' || options.target === 'both') {
      await postToX(context, xTweets, data.episodeUrl, date)
    }
    if (options.target === 'threads' || options.target === 'both') {
      await postToThreads(context, threadsPosts, data.episodeUrl, date)
    }
    console.info('\n🎉 所有社群平台發布作業已順利完成！')
  }
  catch (err) {
    console.error('\n⚠️ 發布中斷：', err.message)
    process.exitCode = 1
  }
  finally {
    await context.close().catch(() => {})
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
}
