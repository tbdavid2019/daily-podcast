import type { WorkflowEvent, WorkflowStep, WorkflowStepConfig } from 'cloudflare:workers'
import { createOpenAI } from '@ai-sdk/openai'
import { generateObject, generateText } from 'ai'
import { WorkflowEntrypoint } from 'cloudflare:workers'
import { z } from 'zod'
import { podcastTitle } from '@/config'
import { introPrompt, podcastScriptPrompt, summarizeBlogPrompt, summarizeStoryPrompt } from './prompt'
import synthesize from './tts'
import { getAllStories, getHackerNewsStory } from './utils'

interface PodcastDialogueLine {
  speaker: '男' | '女'
  text: string
}

interface PodcastScriptResponse {
  dialogue: PodcastDialogueLine[]
}

interface Params {
  today?: string
  force?: boolean
}

interface Env extends CloudflareEnv {
  OPENAI_BASE_URL: string
  OPENAI_API_KEY: string
  OPENAI_MODEL: string
  OPENAI_THINKING_MODEL?: string
  OPENAI_MAX_TOKENS?: string
  OPENAI_MAX_COMPLETION_TOKENS?: string
  JINA_KEY?: string
  WORKER_ENV?: string
  HACKER_NEWS_WORKER_URL: string
  HACKER_NEWS_R2_BUCKET_URL: string
  HACKER_NEWS_WORKFLOW: Workflow
  BROWSER: Fetcher
  // 新增時區配置
  TIMEZONE_OFFSET?: string // 時區偏移，例如："+8" (台北) 或 "-5" (美東標準) 或 "-4" (美東夏令)
  TIMEZONE_NAME?: string // 時區名稱，用於日誌顯示，例如："Asia/Taipei" 或 "America/New_York"
}

const retryConfig: WorkflowStepConfig = {
  retries: {
    limit: 5,
    delay: '10 seconds',
    backoff: 'exponential',
  },
  timeout: '3 minutes',
}

export class HackerNewsWorkflow extends WorkflowEntrypoint<Env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    console.info('trigged event: HackerNewsWorkflow', event)

    const runEnv = this.env.WORKER_ENV || 'production'
    const force = Boolean(event.payload?.force)
    const isDev = runEnv !== 'production'
    const breakTime = isDev ? '2 seconds' : '5 seconds'

    // 時區處理邏輯 - 支援配置化時區
    const now = new Date()
    const utcToday = now.toISOString().split('T')[0] // UTC 今天

    // 從環境變數讀取時區配置，預設為台北時間（UTC+8）
    const timezoneOffset = Number.parseInt(this.env.TIMEZONE_OFFSET || '+8')
    const timezoneName = this.env.TIMEZONE_NAME || 'Asia/Taipei'

    // 計算指定時區的時間
    const localTime = new Date(now.getTime() + timezoneOffset * 60 * 60 * 1000)
    const localToday = localTime.toISOString().split('T')[0]

    // 用戶可以手動指定日期，否則使用自動計算
    const userSpecifiedDate = event.payload?.today

    // 顯示日期：用戶指定 > 本地時區今天
    const displayDate = userSpecifiedDate || localToday

    // 抓取日期：用戶指定 > UTC 昨天（確保抓取前一天完整內容）
    const utcYesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const fetchDate = userSpecifiedDate || utcYesterday

    console.info('Date calculation with configurable timezone:', {
      utcNow: now.toISOString(),
      utcToday,
      utcYesterday,
      timezoneOffset,
      timezoneName,
      localTime: localTime.toISOString(),
      localToday,
      userSpecified: userSpecifiedDate,
      displayDate: `${displayDate} (用於內容標題和存儲)`,
      fetchDate: `${fetchDate} (用於抓取 HN 內容)`,
    })

    const contentKey = `content:${runEnv}:hacker-news:${displayDate}`

    // Check if content already exists to prevent duplicate processing
    const existingContent = await step.do('check existing content', retryConfig, async () => {
      const existing = await this.env.HACKER_NEWS_KV.get(contentKey)
      if (existing) {
        console.info('Content already exists for date:', displayDate, 'Key:', contentKey)
        return JSON.parse(existing)
      }
      console.info('No existing content found for date:', displayDate, 'Key:', contentKey)
      return null
    })

    if (existingContent && !force) {
      console.info('Skipping workflow - content already exists for date:', displayDate)
      return existingContent
    }

    const openai = createOpenAI({
      name: 'openai',
      baseURL: this.env.OPENAI_BASE_URL!,
      headers: {
        Authorization: `Bearer ${this.env.OPENAI_API_KEY!}`,
      },
    })
    const maxTokens = Number.parseInt(this.env.OPENAI_MAX_TOKENS || '4096') || 4096
    const completionTokenLimit = Number.parseInt(this.env.OPENAI_MAX_COMPLETION_TOKENS || '16384') || 16384

    // 實施週期性排程邏輯
    const date = new Date(displayDate)
    const dayOfWeek = date.getDay() // 0: 週日, 1: 週一, 2: 週二, 3: 週三, 4: 週四, 5: 週五, 6: 週六

    console.info('Weekly scheduling check:', { displayDate, fetchDate, dayOfWeek })

    // 根據星期幾動態設置各來源的限制
    const getStoryLimits = () => {
      const baseLimit = isDev ? 2 : 5
      const hackerNewsLimit = isDev ? 3 : 10
      const redditLimit = isDev ? 3 : 10 // 從 5 增加到 10

      return {
        'hacker-news': hackerNewsLimit, // 每日更新
        'github-trending': dayOfWeek === 4 ? baseLimit : 0, // 週四
        'product-hunt': dayOfWeek === 3 ? baseLimit : 0, // 週三
        'dev-to': dayOfWeek === 1 ? (isDev ? 2 : 10) : 0, // 週一
        'reddit': redditLimit, // 每日更新
      }
    }

    const storyLimits = getStoryLimits()

    console.info('Source limits based on schedule:', storyLimits)

    const stories = await step.do(`get all stories ${fetchDate}`, retryConfig, async () => {
      const allStories = await getAllStories(fetchDate, this.env, { limits: storyLimits })

      if (!allStories.length) {
        throw new Error('no stories found')
      }

      return allStories
    })

    const storiesPerSource = stories.reduce<Record<string, number>>((acc, story) => {
      const source = story.source || 'unknown'
      acc[source] = (acc[source] || 0) + 1
      return acc
    }, {})
    console.info('stories per source', storiesPerSource)

    // 分來源獲取文章內容並緩存，避免單一步驟超時
    const storyGroups = stories.reduce<Record<string, Story[]>>((groups, story) => {
      const source = story.source || 'unknown'
      if (!groups[source]) {
        groups[source] = []
      }
      groups[source].push(story)
      return groups
    }, {})

    const allStoryContents: Array<{ id: string, title: string, content: string, source?: string }> = []

    for (const [source, sourceStories] of Object.entries(storyGroups)) {
      const stepName = `get ${source} story contents`
      const cacheKey = `${contentKey}:story-contents:${source}`

      const contentsForSource = await step.do(stepName, retryConfig, async () => {
        const cached = await this.env.HACKER_NEWS_KV.get(cacheKey)
        if (cached) {
          try {
            const parsed = JSON.parse(cached) as Array<{ id: string, title: string, content: string, source?: string }>
            if (parsed.length === sourceStories.length) {
              console.info(`use cached story contents for ${source}`)
              return parsed
            }
          }
          catch (error) {
            console.warn(`failed to parse cached contents for ${source}`, error)
          }
        }

        const contents: Array<{ id: string, title: string, content: string, source?: string }> = []

        for (const story of sourceStories) {
          try {
            const storyContent = await getHackerNewsStory(story, maxTokens, this.env)
            contents.push({
              id: story.id || '',
              title: story.title || '',
              content: storyContent,
              source: story.source,
            })
            console.info(`get story ${story.id} content success`)
          }
          catch (error) {
            console.error(`get story ${story.id} content failed:`, error)
          }
        }

        if (contents.length === sourceStories.length && contents.length > 0) {
          try {
            await this.env.HACKER_NEWS_KV.put(cacheKey, JSON.stringify(contents), { expirationTtl: 60 * 60 * 24 })
            console.info(`cached story contents for ${source}`, { count: contents.length })
          }
          catch (error) {
            console.error(`cache story contents for ${source} failed:`, error)
          }
        }

        return contents
      })

      allStoryContents.push(...contentsForSource)
    }

    // 一次性處理所有文章摘要
    const summarizationMaxTokens = Math.min(maxTokens * 2, completionTokenLimit)

    const storySummaries = await step.do('summarize all stories', { ...retryConfig, timeout: '12 minutes' }, async () => {
      const summaries: string[] = []
      const expectedCount = allStoryContents.length

      console.info('Starting batch summarization', {
        storyCount: expectedCount,
        maxTokens: summarizationMaxTokens,
      })

      const combinedContent = allStoryContents.map((story, index) =>
        `<story id="${story.id}" title="${story.title}" number="${index + 1}">\n${story.content}\n</story>`,
      ).join('\n\n---\n\n')

      const { text, usage, finishReason } = await generateText({
        model: openai(this.env.OPENAI_MODEL!),
        system: `${summarizeStoryPrompt}\n\n請為每篇文章生成摘要。**重要：你必須為所有 ${expectedCount} 篇文章都生成摘要**。請用 <story-summary id="文章ID"> 標籤包裹每個摘要，確保數量正確。`,
        prompt: combinedContent,
        maxTokens: summarizationMaxTokens,
      })

      console.info('batch summarize all stories success', { usage, finishReason, responseLength: text.length })

      // 解析批次摘要結果 - 使用簡單的字符串匹配而非正則
      const parts = text.split('<story-summary')
      if (parts.length > 1) {
        console.info('Parsing story-summary tags', { foundTags: parts.length - 1 })
        for (let i = 1; i < parts.length; i++) {
          const endIndex = parts[i].indexOf('</story-summary>')
          if (endIndex !== -1) {
            const content = parts[i].substring(parts[i].indexOf('>') + 1, endIndex).trim()
            summaries.push(`<story>${content}</story>`)
          }
        }
      }
      else {
        console.warn('No story-summary tags found, using fallback parsing')
        // 如果格式不正確，嘗試按照文章標題或編號分割
        const storyTitles = allStoryContents.map(s => s.title)

        // 嘗試用標題來分割
        let foundByTitle = false
        for (let i = 0; i < storyTitles.length && !foundByTitle; i++) {
          if (text.includes(storyTitles[i])) {
            foundByTitle = true
            console.info('Attempting to split by story titles')
            // 如果包含標題，嘗試更智能的分割
            let remainingText = text
            for (const title of storyTitles) {
              const titleIndex = remainingText.indexOf(title)
              if (titleIndex !== -1) {
                const nextTitleIndex = storyTitles.slice(storyTitles.indexOf(title) + 1)
                  .map(t => remainingText.indexOf(t))
                  .find(idx => idx > titleIndex)

                const segment = nextTitleIndex
                  ? remainingText.substring(titleIndex, nextTitleIndex)
                  : remainingText.substring(titleIndex)

                if (segment.trim()) {
                  summaries.push(`<story>${segment.trim()}</story>`)
                }

                if (nextTitleIndex) {
                  remainingText = remainingText.substring(nextTitleIndex)
                }
              }
            }
          }
        }

        // 如果標題分割失敗，按 --- 分割
        if (!foundByTitle) {
          console.info('Attempting to split by --- delimiter')
          const textParts = text.split('---').filter(part => part.trim())
          textParts.forEach((part) => {
            if (part.trim()) {
              summaries.push(`<story>${part.trim()}</story>`)
            }
          })
        }

        // 如果還是數量不對且只有 1 個，嘗試用編號分割
        if (summaries.length <= 1 && expectedCount > 1) {
          console.warn('Fallback: attempting to split by story numbers')
          summaries.length = 0
          for (let i = 1; i <= expectedCount; i++) {
            const nextNum = i + 1
            const pattern1 = `${i}.`
            const pattern2 = `${i}、`
            const pattern3 = `第${i}`

            let startIdx = -1
            let endIdx = -1

            if (text.includes(pattern1))
              startIdx = text.indexOf(pattern1)
            else if (text.includes(pattern2))
              startIdx = text.indexOf(pattern2)
            else if (text.includes(pattern3))
              startIdx = text.indexOf(pattern3)

            if (startIdx !== -1) {
              if (nextNum <= expectedCount) {
                const nextPattern1 = `${nextNum}.`
                const nextPattern2 = `${nextNum}、`
                const nextPattern3 = `第${nextNum}`

                if (text.includes(nextPattern1))
                  endIdx = text.indexOf(nextPattern1)
                else if (text.includes(nextPattern2))
                  endIdx = text.indexOf(nextPattern2)
                else if (text.includes(nextPattern3))
                  endIdx = text.indexOf(nextPattern3)
              }

              const segment = endIdx !== -1
                ? text.substring(startIdx, endIdx)
                : text.substring(startIdx)

              if (segment.trim()) {
                summaries.push(`<story>${segment.trim()}</story>`)
              }
            }
          }
        }

        // 最後的保底：如果還是只有少量摘要，直接使用整個文本
        if (summaries.length < expectedCount * 0.3) { // 少於 30% 的預期數量
          console.error('Failed to parse summaries correctly, using full text as single summary', {
            expected: expectedCount,
            parsed: summaries.length,
          })
          summaries.length = 0
          summaries.push(`<story>${text}</story>`)
        }
      }

      console.info('Summary parsing complete', {
        expected: expectedCount,
        actual: summaries.length,
        ratio: `${Math.round(summaries.length / expectedCount * 100)}%`,
      })

      // 如果摘要數量明顯不對，記錄警告
      if (summaries.length < expectedCount * 0.5) {
        console.warn('⚠️  Summary count is significantly lower than expected!', {
          expected: expectedCount,
          actual: summaries.length,
          stories: allStoryContents.map(s => ({ id: s.id, title: s.title })),
        })
      }

      return summaries
    })

    const podcastScript = await step.do('generate podcast script', retryConfig, async () => {
      const scriptMaxTokens = Math.min(maxTokens * 2, completionTokenLimit)

      // 根據故事數量動態計算建議的對話輪數
      // 公式：每 2-3 個故事需要 1 輪對話，再加上開場和結尾
      const storiesPerTurn = 2.5 // 平均每輪討論 2-3 個故事
      const suggestedTurns = Math.ceil(stories.length / storiesPerTurn) + 4 // +4 為開場和結尾
      const minTurns = Math.max(8, Math.ceil(stories.length / 4)) // 最少輪數，調整公式減少輪數
      const maxTurns = Math.min(25, Math.ceil(stories.length / 2)) // 最多輪數，降低上限避免過長

      console.info('Dynamic dialogue turns calculation:', {
        storyCount: stories.length,
        suggestedTurns,
        minTurns,
        maxTurns,
      })

      // 準備更詳細的 prompt，明確列出所有故事
      const storyList = stories.map((story, index) =>
        `${index + 1}. [${story.source}] ${story.title}`,
      ).join('\n')

      const enhancedPrompt = `日期: ${displayDate}

【必須討論的故事清單】（共 ${stories.length} 個故事，每一個都必須討論）
${storyList}

【動態對話輪數建議】
- 建議對話輪數：${Math.min(suggestedTurns, maxTurns)} 輪（範圍：${minTurns}-${maxTurns} 輪）
- 每輪應涵蓋 2-4 個相關故事，每段話 120-300 字
- ⚠️ **重要限制**：為避免 TTS API 調用過多，請控制對話輪數不超過 ${maxTurns} 輪
- 根據實際內容靈活調整，但確保所有故事都被涵蓋

<story-metadata>${JSON.stringify(stories)}</story-metadata>

<story-summaries>
${storySummaries.join('\n\n---\n\n')}
</story-summaries>

⚠️ 重要提醒：請確保對話中涵蓋上述所有 ${stories.length} 個故事，不要遺漏任何一個。建議按順序逐一討論。`

      console.info('Generating podcast script for', stories.length, 'stories')
      console.info('Story sources distribution:', storiesPerSource)
      console.info('Suggested dialogue structure:', { suggestedTurns, minTurns, maxTurns })

      const { object, usage, finishReason } = await generateObject({
        model: openai(this.env.OPENAI_THINKING_MODEL || this.env.OPENAI_MODEL!),
        system: podcastScriptPrompt,
        prompt: enhancedPrompt,
        maxTokens: scriptMaxTokens,
        maxRetries: 3,
        schema: z.object({
          dialogue: z.array(z.object({
            speaker: z.enum(['男', '女']),
            text: z.string().min(1),
          })).min(1),
        }),
      })

      console.info('generate podcast script success', {
        usage,
        finishReason,
        dialogueLength: object.dialogue.length,
        expectedStories: stories.length,
      })

      if (!object || !Array.isArray(object.dialogue) || !object.dialogue.length) {
        console.error('Generated podcast script object is empty', { object })
        throw new Error('podcast script dialogue is empty')
      }

      const sanitizedDialogue = object.dialogue.map((line, index) => {
        const speaker = typeof line?.speaker === 'string' ? line.speaker.trim() : ''
        const text = typeof line?.text === 'string' ? line.text.trim() : ''

        if (!speaker || !['男', '女'].includes(speaker as PodcastDialogueLine['speaker']) || !text) {
          throw new Error(`invalid dialogue line at index ${index}`)
        }

        return { speaker: speaker as PodcastDialogueLine['speaker'], text }
      })

      // 驗證對話是否涵蓋所有故事來源
      const dialogueText = sanitizedDialogue.map(line => line.text).join(' ')
      const mentionedSources = new Set<string>()

      stories.forEach((story) => {
        // 檢查標題關鍵字是否在對話中出現
        const titleWords = story.title?.split(' ').filter(w => w.length > 3) || []
        const isMentioned = titleWords.some(word =>
          dialogueText.toLowerCase().includes(word.toLowerCase()),
        ) || dialogueText.includes(story.source || '')

        if (isMentioned) {
          mentionedSources.add(story.source || 'unknown')
        }
      })

      console.info('Coverage check:', {
        totalStories: stories.length,
        sourcesInDialogue: Array.from(mentionedSources),
        allSources: Object.keys(storiesPerSource),
        coverageRate: `${Math.round(mentionedSources.size / Object.keys(storiesPerSource).length * 100)}%`,
      })

      // 如果覆蓋率太低，記錄警告
      if (mentionedSources.size < Object.keys(storiesPerSource).length * 0.7) {
        console.warn('⚠️ Low coverage detected! Some sources may be missing from the dialogue.')
        console.warn('Missing sources:', Object.keys(storiesPerSource).filter(s => !mentionedSources.has(s)),
        )
      }

      return { dialogue: sanitizedDialogue } as PodcastScriptResponse
    })

    console.info('podcast script line count', podcastScript.dialogue.length)

    const podcastDialogueLines = podcastScript.dialogue.map(line => `${line.speaker}：${line.text}`)
    const podcastContent = podcastDialogueLines.join('\n')

    console.info('podcast content preview:\n', isDev ? podcastContent : podcastContent.slice(0, 200))

    await step.sleep('pause before blog content', breakTime)

    const blogContent = await step.do('create blog content', retryConfig, async () => {
      const blogMaxTokens = Math.min(maxTokens, completionTokenLimit)
      const { text, usage, finishReason } = await generateText({
        model: openai(this.env.OPENAI_THINKING_MODEL || this.env.OPENAI_MODEL!),
        system: summarizeBlogPrompt,
        prompt: `<stories>${JSON.stringify(stories)}</stories>\n\n---\n\n${storySummaries.join('\n\n---\n\n')}`,
        maxTokens: blogMaxTokens,
        maxRetries: 3,
      })

      console.info(`create hacker news daily blog content success`, { text, usage, finishReason })

      return text
    })

    console.info('blog content:\n', isDev ? blogContent : blogContent.slice(0, 100))

    await step.sleep('pause before intro content', breakTime)

    const introContent = await step.do('create intro content', retryConfig, async () => {
      const { text, usage, finishReason } = await generateText({
        model: openai(this.env.OPENAI_MODEL!),
        system: introPrompt,
        prompt: podcastContent,
        maxRetries: 3,
      })

      console.info(`create intro content success`, { text, usage, finishReason })

      return text
    })

    const podcastKey = `${displayDate.replaceAll('-', '/')}/${runEnv}/hacker-news-${displayDate}.mp3`

    const { tempKeys } = await step.do('create podcast audio files', { ...retryConfig, timeout: '12 minutes' }, async () => {
      const tempKeys: string[] = []
      const batchSize = 2 // 降低併發數量從 4 到 2

      for (let start = 0; start < podcastScript.dialogue.length; start += batchSize) {
        const chunk = podcastScript.dialogue.slice(start, start + batchSize)

        // 添加批次間延遲以避免 subrequest 限制
        if (start > 0) {
          console.info(`Waiting between batches to avoid subrequest limit...`)
          await new Promise(resolve => setTimeout(resolve, 1000)) // 1秒延遲
        }

        console.info(`Processing audio batch ${Math.floor(start / batchSize) + 1}/${Math.ceil(podcastScript.dialogue.length / batchSize)}`, { start, end: start + batchSize, total: podcastScript.dialogue.length })

        const results = await Promise.all(chunk.map(async (line, offset) => {
          const index = start + offset
          const text = line.text.trim()

          if (!text) {
            console.warn('dialogue line text is empty', { index, line })
            return null
          }

          console.info('create conversation audio', { index, speaker: line.speaker, preview: text.slice(0, 40) })
          const audio = await synthesize(text, line.speaker, this.env)

          if (!audio.size) {
            throw new Error('podcast audio size is 0')
          }

          const tempKey = `tmp/${podcastKey}-${index}.mp3`
          await this.env.HACKER_NEWS_R2.put(tempKey, audio)
          console.info('uploaded temp audio chunk', { index, key: tempKey, size: audio.size })

          return { tempKey }
        }))

        for (const result of results) {
          if (!result) {
            continue
          }
          tempKeys.push(result.tempKey)
        }
      }

      console.info(`Audio generation complete: ${tempKeys.length} files created`)
      return { tempKeys }
    })

    if (!tempKeys.length) {
      console.error('No valid audio files were generated from podcast content')
      throw new Error('no audio files generated for podcast')
    }

    await step.do('concat audio files', retryConfig, async () => {
      const chunkBuffers: Uint8Array[] = []

      for (const [index, tempKey] of tempKeys.entries()) {
        try {
          const chunk = await this.env.HACKER_NEWS_R2.get(tempKey)
          if (!chunk) {
            console.warn('audio chunk not found', { index, key: tempKey })
            continue
          }

          const buffer = new Uint8Array(await chunk.arrayBuffer())
          console.info('loaded audio chunk', { index, key: tempKey, size: buffer.byteLength })
          chunkBuffers.push(buffer)
        }
        catch (error) {
          console.error('load audio chunk failed', { index, key: tempKey, error })
        }
      }

      if (!chunkBuffers.length) {
        throw new Error('failed to load any podcast audio chunks')
      }

      const totalLength = chunkBuffers.reduce((total, buffer) => total + buffer.byteLength, 0)
      const combined = new Uint8Array(totalLength)

      let offset = 0
      for (const buffer of chunkBuffers) {
        combined.set(buffer, offset)
        offset += buffer.byteLength
      }

      await this.env.HACKER_NEWS_R2.put(podcastKey, combined.buffer)
      console.info('combined audio chunks', { chunks: chunkBuffers.length, totalLength })

      return `${this.env.HACKER_NEWS_R2_BUCKET_URL}/${podcastKey}?t=${Date.now()}`
    })

    console.info('save podcast to r2 success')

    await step.do('delete temp files', retryConfig, async () => {
      const cleanupPromises = tempKeys.map(async (tempKey) => {
        try {
          await Promise.race([
            this.env.HACKER_NEWS_R2.delete(tempKey),
            new Promise(resolve => setTimeout(resolve, 1000)), // Timeout after 1 second
          ])
        }
        catch (error) {
          console.warn(`delete temp file ${tempKey} failed:`, error)
        }
      })

      await Promise.allSettled(cleanupPromises)
      return 'cleanup completed'
    })

    await step.do('save content to kv', retryConfig, async () => {
      await this.env.HACKER_NEWS_KV.put(contentKey, JSON.stringify({
        date: displayDate,
        title: `${podcastTitle} ${displayDate}`,
        stories,
        podcastContent,
        podcastScript,
        blogContent,
        introContent,
        audio: podcastKey,
        updatedAt: Date.now(),
      }))

      return introContent
    })

    console.info('save content to kv success')
  }
}
