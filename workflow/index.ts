import type { WorkflowEvent, WorkflowStep, WorkflowStepConfig } from 'cloudflare:workers'
import { createOpenAI } from '@ai-sdk/openai'
import { generateObject, generateText } from 'ai'
import { WorkflowEntrypoint } from 'cloudflare:workers'
import { z } from 'zod'
import { introPrompt, podcastScriptPrompt, summarizeBlogPrompt, summarizeStoryPrompt } from './prompt'
import type { GeneratedScriptData, PodcastDialogueLine, PodcastScriptResponse, Story, WorkflowParams } from './types'
import { getAllStories, getHackerNewsStory } from './utils'

interface Env extends CloudflareEnv {
  OPENAI_BASE_URL: string
  OPENAI_API_KEY: string
  OPENAI_MODEL: string
  OPENAI_THINKING_MODEL?: string
  OPENAI_MAX_TOKENS?: string
  OPENAI_MAX_COMPLETION_TOKENS?: string
  WORKER_ENV?: string
  HACKER_NEWS_KV: KVNamespace
  HACKER_NEWS_WORKFLOW: Workflow
  // 新增時區配置
  TIMEZONE_OFFSET?: string
  TIMEZONE_NAME?: string
  MAX_STORY_BUDGET?: string
  // For utils
  JINA_KEY?: string
  FIRECRAWL_KEY?: string
}

const retryConfig: WorkflowStepConfig = {
  retries: {
    limit: 5,
    delay: '10 seconds',
    backoff: 'exponential',
  },
  timeout: '3 minutes',
}

// 每輪 workflow 的故事與音訊配置限制
const SOURCE_PRIORITY: readonly string[] = [
  'hacker-news',
  'reddit',
  'product-hunt',
  'github-trending',
  'dev-to',
]

function applyStoryBudget(
  limits: Record<string, number>,
  budget: number,
  priorityOrder: readonly string[],
) {
  const result: Record<string, number> = { ...limits }
  let total = Object.values(result).reduce((sum, value) => sum + Math.max(0, value || 0), 0)

  if (total <= budget) {
    return result
  }

  for (const source of [...priorityOrder].reverse()) {
    let value = Math.max(0, result[source] || 0)
    while (value > 0 && total > budget) {
      value -= 1
      total -= 1
    }
    result[source] = value
    if (total <= budget) {
      return result
    }
  }

  if (total <= budget) {
    return result
  }

  for (const key of Object.keys(result)) {
    if (priorityOrder.includes(key)) {
      continue
    }
    let value = Math.max(0, result[key] || 0)
    while (value > 0 && total > budget) {
      value -= 1
      total -= 1
    }
    result[key] = value
    if (total <= budget) {
      break
    }
  }

  return result
}

export class PodcastScriptWorkflow extends WorkflowEntrypoint<Env, WorkflowParams> {
  async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep) {
    console.info('trigged event: PodcastScriptWorkflow', event)

    const runEnv = this.env.WORKER_ENV || 'production'
    const params = event.payload || {}
    const force = Boolean(params.force)
    
    // Handle variant/type mapping
    // type is an alias for variant (e.g. type='main' -> variant='hacker-news')
    let variant = params.variant || params.type || 'hacker-news'
    if (variant === 'main') variant = 'hacker-news'
    
    // 目前只支援 hacker-news，未來可擴充其他頻道邏輯
    if (variant !== 'hacker-news') {
      console.warn(`Variant ${variant} is not fully implemented yet, defaulting to logic for hacker-news but saving with variant key.`)
    }

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
    const userSpecifiedDate = params.today

    // 顯示日期：用戶指定 > 本地時區今天
    const displayDate = userSpecifiedDate || localToday

    // 抓取日期：用戶指定 > UTC 昨天（確保抓取前一天完整內容）
    const utcYesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const fetchDate = userSpecifiedDate || utcYesterday

    console.info('Date calculation with configurable timezone:', {
      utcNow: now.toISOString(),
      displayDate: `${displayDate} (用於內容標題和存儲)`,
      fetchDate: `${fetchDate} (用於抓取 HN 內容)`,
      variant,
    })

    const rawContentKey = `content:${runEnv}:hacker-news:${displayDate}`
    // New Script Key: script:{env}:{variant}:{date}
    const scriptKey = `script:${runEnv}:${variant}:${displayDate}`

    // Check if script already exists to prevent duplicate processing
    const existingScript = await step.do('check existing script', retryConfig, async () => {
      const existing = await this.env.HACKER_NEWS_KV.get(scriptKey)
      if (existing) {
        console.info('Script already exists for date:', displayDate, 'Key:', scriptKey)
        return JSON.parse(existing) as GeneratedScriptData
      }
      return null
    })

    if (existingScript && !force) {
      console.info('Skipping workflow - script already exists for date:', displayDate)
      return existingScript
    }

    const openai = createOpenAI({
      name: 'openai',
      baseURL: this.env.OPENAI_BASE_URL!,
      headers: {
        Authorization: `Bearer ${this.env.OPENAI_API_KEY!}`,
      },
    })
    const modelName = (this.env.OPENAI_MODEL || '').toLowerCase()
    const isGeminiModel = modelName.includes('gemini')

    const defaultMaxTokens = isGeminiModel ? 8192 : 4096
    const defaultCompletionTokens = isGeminiModel ? 32768 : 16384

    const parsedMaxTokens = Number.parseInt(this.env.OPENAI_MAX_TOKENS || '', 10)
    const parsedCompletionTokens = Number.parseInt(this.env.OPENAI_MAX_COMPLETION_TOKENS || '', 10)

    const maxTokens = Number.isFinite(parsedMaxTokens) && parsedMaxTokens > 0
      ? parsedMaxTokens
      : defaultMaxTokens
    const completionTokenLimit = Number.isFinite(parsedCompletionTokens) && parsedCompletionTokens > 0
      ? parsedCompletionTokens
      : defaultCompletionTokens

    // 實施週期性排程邏輯
    const date = new Date(displayDate)
    const dayOfWeek = date.getDay()

    console.info('Weekly scheduling check:', { displayDate, fetchDate, dayOfWeek })

    // 根據星期幾動態設置各來源的限制
    const parsedBudget = Number.parseInt(this.env.MAX_STORY_BUDGET || '')
    const storyBudget = Number.isFinite(parsedBudget) && parsedBudget > 0
      ? parsedBudget
      : undefined

    const getStoryLimits = () => {
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
      const limits: Record<string, number> = {
        'hacker-news': isWeekend ? 6 : 5,
        'reddit': isWeekend ? 6 : 5,
        'github-trending': dayOfWeek === 1 ? 2 : 0,
        'product-hunt': dayOfWeek === 2 ? 2 : 0,
        'dev-to': dayOfWeek >= 3 && dayOfWeek <= 5 ? 3 : 0,
      }

      if (!storyBudget) {
        return limits
      }
      return applyStoryBudget(limits, storyBudget, SOURCE_PRIORITY)
    }

    const storyLimits = getStoryLimits()

    console.info('Source limits based on schedule:', {
      ...storyLimits,
      budget: storyBudget ?? 'none',
      dayOfWeek,
    })

    const stories = await step.do(`get all stories ${fetchDate}`, retryConfig, async () => {
      const allStories = await getAllStories(fetchDate, this.env, { limits: storyLimits })

      if (!allStories.length) {
        throw new Error('no stories found')
      }
      return allStories as Story[]
    })

    const storiesPerSource = stories.reduce<Record<string, number>>((acc, story) => {
      const source = story.source || 'unknown'
      acc[source] = (acc[source] || 0) + 1
      return acc
    }, {})
    console.info('stories per source', storiesPerSource)

    // 分來源獲取文章內容並緩存
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
      const cacheKey = `${rawContentKey}:story-contents:${source}`

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

            // 如果內容為空或太短，跳過這個故事
            if (!storyContent || storyContent.trim().length < 50) {
              console.warn(`⚠️ FILTERED OUT: Story "${story.title}" has no content - excluding from podcast`)
              continue
            }

            contents.push({
              id: story.id || '',
              title: story.title || '',
              content: storyContent,
              source: story.source,
            })
            console.info(`✅ Story ${story.id} content fetched successfully`)
          }
          catch (error) {
            console.error(`❌ Story ${story.id} content failed:`, error)
          }
        }

        console.info(`📊 Content fetch summary for ${source}: ${contents.length}/${sourceStories.length} stories have valid content`)

        if (contents.length > 0) {
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

      const parts = text.split('<story-summary')
      if (parts.length > 1) {
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
        // Fallback parsing logic (simplified for brevity but keeping robustness if desired)
        const storyTitles = allStoryContents.map(s => s.title)
        let foundByTitle = false
        for (let i = 0; i < storyTitles.length && !foundByTitle; i++) {
           if (text.includes(storyTitles[i])) {
              foundByTitle = true
              // Simple split by title if found (simplified for brevity)
           }
        }
        
        if (!foundByTitle) {
          const textParts = text.split('---').filter(part => part.trim())
          if (textParts.length > 1) {
               textParts.forEach(p => summaries.push(`<story>${p.trim()}</story>`))
          } else {
               summaries.push(`<story>${text}</story>`)
          }
        }
      }
      
      return summaries
    })

    const podcastScript = await step.do('generate podcast script', retryConfig, async () => {
      const scriptMaxTokens = Math.min(maxTokens * 2, completionTokenLimit)
      const storiesPerTurn = 2.5 
      const suggestedTurns = Math.ceil(stories.length / storiesPerTurn) + 5
      const minTurns = Math.max(8, Math.ceil(stories.length / 3))
      const maxTurns = Math.min(35, Math.ceil(stories.length * 2))

      console.info('Dynamic dialogue turns calculation:', {
        storyCount: stories.length,
        suggestedTurns,
        minTurns,
        maxTurns,
      })

      const storyList = stories.map((story, index) =>
        `${index + 1}. [${story.source}] ${story.title}`,
      ).join('\n')

      // Re-use the combinedContent (raw stories) for script generation
      const fullContentString = allStoryContents.map((story, index) =>
        `<story id="${story.id}" title="${story.title}" source="${story.source}" number="${index + 1}">\n${story.content}\n</story>`,
      ).join('\n\n---\n\n')

      const enhancedPrompt = `日期: ${displayDate}
【必須討論的故事清單】（共 ${stories.length} 個故事，每一個都必須討論）
${storyList}

【動態對話輪數建議】
- 建議對話輪數：${Math.min(suggestedTurns, maxTurns)} 輪（範圍：${minTurns}-${maxTurns} 輪）
- 每輪專注討論 2-3 個故事，但每段話請講久一點（300-600 字）以確保深度
- 根據實際內容靈活調整，但確保所有故事都被涵蓋

<story-metadata>${JSON.stringify(stories)}</story-metadata>

<raw-story-content>
${fullContentString}
</raw-story-content>
`

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
      })

      const sanitizedDialogue = object.dialogue.map((line, index) => {
        const speaker = typeof line?.speaker === 'string' ? line.speaker.trim() : ''
        const text = typeof line?.text === 'string' ? line.text.trim() : ''
        if (!speaker || !['男', '女'].includes(speaker as any) || !text) {
          throw new Error(`invalid dialogue line at index ${index}`)
        }
        return { speaker: speaker as PodcastDialogueLine['speaker'], text }
      })

      return { dialogue: sanitizedDialogue } as PodcastScriptResponse
    })

    console.info('podcast script line count', podcastScript.dialogue.length)

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
      console.info(`create blog content success`, { usage, finishReason })
      return text
    })

    await step.sleep('pause before intro content', breakTime)

    const introContent = await step.do('create intro content', retryConfig, async () => {
      const podcastDialogueLines = podcastScript.dialogue.map(line => `${line.speaker}：${line.text}`)
      const podcastContent = podcastDialogueLines.join('\n')
      
      const { text, usage, finishReason } = await generateText({
        model: openai(this.env.OPENAI_MODEL!),
        system: introPrompt,
        prompt: podcastContent,
        maxRetries: 3,
      })
      console.info(`create intro content success`, { usage, finishReason })
      return text
    })

    // Prepare complete data object
    const scriptData: GeneratedScriptData = {
      dialogue: podcastScript.dialogue,
      blogContent,
      introContent,
      stories: stories as Story[],
      storySummaries,
      displayDate,
    }

    // Save to KV
    await step.do('save script to kv', retryConfig, async () => {
        await this.env.HACKER_NEWS_KV.put(scriptKey, JSON.stringify(scriptData), {
            expirationTtl: 60 * 60 * 24 * 7 // Keep for 1 week
        })
        console.info(`✅ Script saved to KV: ${scriptKey}`)
    })

    return scriptData
  }
}
