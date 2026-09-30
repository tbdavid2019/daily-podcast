#!/usr/bin/env node

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

// 格式化 Threads 貼文（單則 500 字元內精華整理）
function formatThreadsPost(data, maxStories = 5) {
  const selectedStories = data.stories.slice(0, maxStories)
  const bullets = selectedStories.map(s => `🔹 ${s.title}`).join('\n')

  return `🎙️ DAVID888 Daily 科技廣播【${data.date}】
今日焦點：${data.cleanTitle}

【本日精華速覽】
${bullets}

🎧 完整語音節目與逐字稿：
${data.episodeUrl}

#DAVID888Daily #科技新聞 #工程師 #Podcast #AI`
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

// 發布到 X (Twitter)
async function postToX(context, tweets) {
  console.info('\n🐦 準備發布到 X (Twitter)...')
  const page = await context.newPage()

  try {
    await page.goto('https://x.com/compose/post', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(2000)

    // 檢查登入狀態
    if (page.url().includes('/login') || page.url().includes('/i/flow/login')) {
      console.warn('⚠️ 尚未登入 X (Twitter)！請在開啟的 Chrome 視窗手動登入...')
      console.info('👉 登入成功後，腳本會自動繼續執行。')
      await page.waitForURL(url => !url.href.includes('/login') && !url.href.includes('/i/flow/login'), { timeout: 180000 })
      await page.goto('https://x.com/compose/post', { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(2000)
    }

    console.info(`📝 正在填寫 X 串文（共 ${tweets.length} 則）...`)

    // 優先使用彈出對話框容器，若無則在頁面尋找
    const dialog = page.locator('[role="dialog"][aria-modal="true"]').first()
    const container = (await dialog.isVisible({ timeout: 5000 }).catch(() => false)) ? dialog : page
    const textareas = container.locator('div[role="textbox"][contenteditable="true"]')

    // 填寫第一則
    const firstBox = textareas.nth(0)
    await firstBox.waitFor({ state: 'attached', timeout: 15000 })
    await firstBox.fill(tweets[0])
    await page.waitForTimeout(800)

    // 連續加入後續推文
    for (let i = 1; i < tweets.length; i += 1) {
      console.info(`   ➕ 新增串文 [${i + 1}/${tweets.length}]`)
      const addButton = container.locator('button[data-testid="addButton"]').last()
      await addButton.click({ force: true })
      await page.waitForTimeout(1000)

      const nextBox = textareas.nth(i)
      await nextBox.waitFor({ state: 'attached', timeout: 15000 })
      await nextBox.fill(tweets[i])
      await page.waitForTimeout(800)
    }

    // 點擊全部發送按鈕
    console.info('🚀 點擊「全部發送 (Post all)」按鈕...')
    const postAllButton = container.locator('button[data-testid="tweetButton"]').last()
    await postAllButton.waitFor({ state: 'attached' })
    await postAllButton.click({ force: true })

    // 等待發送完成
    await page.waitForTimeout(6000)
    console.info('✅ X (Twitter) 串文發布成功！🎉')
  }
  catch (err) {
    console.error('❌ X 發布過程中發生錯誤：', err.message)
    throw err
  }
  finally {
    await page.close().catch(() => {})
  }
}

// 發布到 Meta Threads
async function postToThreads(context, postText) {
  console.info('\n🧵 準備發布到 Threads...')
  const page = await context.newPage()

  try {
    await page.goto('https://www.threads.net/', { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(2000)

    // 檢查登入狀態（如果頁面出現登入按鈕且沒有發文輸入區）
    const loginPrompt = page.locator('text=Log in').or(page.locator('text=登入')).first()
    const isLoginVisible = await loginPrompt.isVisible().catch(() => false)

    if (isLoginVisible) {
      console.warn('⚠️ 尚未登入 Threads！請在開啟的 Chrome 視窗手動登入...')
      console.info('👉 登入成功後，腳本會自動繼續執行。')
      await page.waitForTimeout(5000)
      // 等待進入首頁動態
      await page.waitForURL(url => !url.href.includes('/login'), { timeout: 180000 })
      await page.waitForTimeout(3000)
    }

    console.info('📝 正在尋找 Threads 發文框...')
    // 點擊「有什麼新鮮事？」或「新串文」按鈕展開輸入框
    const newThreadBtn = page.locator('div[role="button"]:has-text("有什麼新鮮事？")')
      .or(page.locator('div[role="button"]:has-text("新串文")'))
      .or(page.locator('svg[aria-label="Create"]'))
      .or(page.locator('svg[aria-label="建立"]'))
      .first()

    if (await newThreadBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
      await newThreadBtn.click()
      await page.waitForTimeout(1200)
    }

    // 定位可編輯輸入區域
    const editor = page.locator('div[role="textbox"]').first()
    await editor.waitFor({ state: 'visible', timeout: 15000 })
    await editor.fill(postText)
    await page.waitForTimeout(1000)

    // 點擊發布按鈕
    console.info('🚀 點擊「發佈 (Post)」按鈕...')
    const submitButton = page.locator('div[role="button"]:has-text("發佈")').or(page.locator('div[role="button"]:has-text("Post")')).last()
    await submitButton.waitFor({ state: 'visible', timeout: 10000 })
    await submitButton.click()

    await page.waitForTimeout(4000)
    console.info('✅ Threads 貼文發布成功！🎉')
  }
  catch (err) {
    console.error('❌ Threads 發布過程中發生錯誤：', err.message)
    throw err
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
  const xTweets = formatXTweets(data, options.maxStories)
  const threadsPost = formatThreadsPost(data, options.maxStories)

  // Dry-run 模式：僅在終端機預覽
  if (options.dryRun) {
    console.info('🔍 [Dry-Run 模式] 預覽即將發布的內容：\n')
    if (options.target === 'x' || options.target === 'both') {
      console.info('--- 🐦 X (Twitter) 串文預覽 ---')
      xTweets.forEach((t, i) => {
        console.info(`\n[推文 ${i + 1}/${xTweets.length}] (${t.length} 字元)`)
        console.info(t)
      })
    }
    if (options.target === 'threads' || options.target === 'both') {
      console.info('\n--- 🧵 Threads 貼文預覽 ---')
      console.info(threadsPost)
      console.info(`\n(總字數：${threadsPost.length} 字元)`)
    }
    console.info('\n✨ 預覽完成，未開啟瀏覽器或發送任何貼文。')
    return
  }

  // 2. 啟動瀏覽器並發布
  const context = await initBrowser(options.headless)

  try {
    if (options.target === 'x' || options.target === 'both') {
      await postToX(context, xTweets)
    }
    if (options.target === 'threads' || options.target === 'both') {
      await postToThreads(context, threadsPost)
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

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
