import type { LanguageModel } from 'ai'
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers'
import type { StoryContentCheckpoint } from './efficiency'
import type { GeneratedScriptData, PodcastDialogueLine, PodcastScriptResponse, Story, WorkflowParams } from './types'
import { generateObject, generateText } from 'ai'
import { WorkflowEntrypoint } from 'cloudflare:workers'
import { z } from 'zod'
import { podcastTitle } from '@/config'
import { buildChildWorkflowInstanceId, createIdempotentWorkflowInstance } from '@/worker/workflow-security'
import {
  AI_SDK_MAX_RETRIES,
  AI_STEP_CONFIG,
  buildEpisodeIndexKey,
  buildRssCacheKey,
  buildStoryArticleCheckpointKey,
  buildStoryContentCacheKey,
  buildStoryContentCheckpointKey,
  buildStoryContentCheckpointPrefix,
  CONTENT_FETCH_STEP_CONFIG,
  getDateDaysBefore,
  getDialoguePlan,
  getExcludedRedditIds,
  getScheduledStoryLimits,
  IO_STEP_CONFIG,
  MAX_DIALOGUE_LINE_CHARS,
  parseRedditDedupeIndex,
  parseStoryContentCheckpoint,
  splitDialogueText,
  STORY_CONTENT_CHECKPOINT_ROOT,
  updateEpisodeIndexDates,
  updateRedditDedupeIndex,
} from './efficiency'
import { createLlmClients, getLlmModel, runWithLlmFallback } from './llm'
import { introPrompt, podcastScriptPrompt, summarizeBlogPrompt, summarizeStoryPrompt } from './prompt'
import { REDDIT_RSS_RATE_LIMIT_DELAY } from './reddit'
import { getAllStories, getContentFromReaderBatch, getHackerNewsStory } from './utils'

interface Env extends CloudflareEnv {
  OPENAI_BASE_URL?: string
  OPENAI_API_KEY?: string
  OPENAI_API_SECRET?: string
  OPENAI_MODEL?: string
  OPENAI_THINKING_MODEL?: string
  OPENAI_MAX_TOKENS?: string
  OPENAI_MAX_COMPLETION_TOKENS?: string
  WORKER_ENV?: string
  HACKER_NEWS_KV: KVNamespace
  HACKER_NEWS_R2: R2Bucket
  HACKER_NEWS_WORKFLOW: Workflow<WorkflowParams>
  HACKER_NEWS_AUDIO_WORKFLOW: Workflow<WorkflowParams>
  // 新增時區設定
  TIMEZONE_OFFSET?: string
  TIMEZONE_NAME?: string
  MAX_STORY_BUDGET?: string
}

function createKvRequestLogger() {
  let count = 0
  const checkpoint = (label: string) => {
    console.info('KV request checkpoint', { label, count })
  }
  const logKv = (action: 'get' | 'put' | 'delete' | 'list' | 'getWithMetadata', key?: string) => {
    count += 1
    const detail: Record<string, unknown> = {}
    if (key)
      detail.key = key
    console.info('KV request', { count, action, ...detail })
  }
  return { checkpoint, logKv }
}

// 每輪 workflow 的故事與音訊設定限制
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

    const kvRequestLogger = createKvRequestLogger()
    kvRequestLogger.checkpoint('workflow start')

    const kvGet = async <T = string | null>(key: string, type?: 'text' | 'json' | 'arrayBuffer' | 'stream') => {
      kvRequestLogger.logKv('get', key)
      return this.env.HACKER_NEWS_KV.get(key, type as any) as Promise<T | null>
    }
    const kvPut = async (key: string, value: string | ArrayBuffer | ArrayBufferView | ReadableStream, options?: KVNamespacePutOptions) => {
      kvRequestLogger.logKv('put', key)
      return this.env.HACKER_NEWS_KV.put(key, value, options)
    }
    const kvDelete = async (key: string) => {
      kvRequestLogger.logKv('delete', key)
      return this.env.HACKER_NEWS_KV.delete(key)
    }
    const kvList = async (prefix: string, cursor?: string) => {
      kvRequestLogger.logKv('list', prefix)
      return this.env.HACKER_NEWS_KV.list({ prefix, cursor })
    }

    const runEnv = this.env.WORKER_ENV || 'production'
    const params = event.payload || {}
    const force = Boolean(params.force)

    // Handle variant/type mapping
    // type is an alias for variant (e.g. type='main' -> variant='hacker-news')
    let variant = params.variant || params.type || 'hacker-news'
    if (variant === 'main')
      variant = 'hacker-news'

    // 目前只支援 hacker-news，未來可擴充其他頻道邏輯
    if (variant !== 'hacker-news') {
      console.warn(`Variant ${variant} is not fully implemented yet, defaulting to logic for hacker-news but saving with variant key.`)
    }

    const isDev = runEnv !== 'production'
    const breakTime = isDev ? '2 seconds' : '5 seconds'

    // 時區處理邏輯 - 支援自訂時區
    const now = new Date(event.timestamp.getTime())
    // 從環境變數讀取時區設定，預設為台北時間（UTC+8）
    const timezoneOffset = Number.parseInt(this.env.TIMEZONE_OFFSET || '+8')

    // 計算指定時區的時間
    const localTime = new Date(now.getTime() + timezoneOffset * 60 * 60 * 1000)
    const localToday = localTime.toISOString().split('T')[0]

    // 使用者可以手動指定日期，否則使用自動計算
    const userSpecifiedDate = params.today

    // 顯示日期：使用者指定 > 本地時區今天
    const displayDate = userSpecifiedDate || localToday

    // 抓取日期：使用者指定 > UTC 昨天（確保抓取前一天完整內容）
    const utcYesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const fetchDate = userSpecifiedDate || utcYesterday

    console.info('Date calculation with configurable timezone:', {
      utcNow: now.toISOString(),
      displayDate: `${displayDate} (用於內容標題和儲存)`,
      fetchDate: `${fetchDate} (用於抓取 HN 內容)`,
      variant,
    })

    const rawContentKey = `content:${runEnv}:hacker-news:${displayDate}`
    // New Script Key: script:{env}:{variant}:{date}
    const scriptKey = `script:${runEnv}:${variant}:${displayDate}`
    const episodeIndexKey = buildEpisodeIndexKey(runEnv, variant)
    const rssCacheKey = buildRssCacheKey(runEnv, variant)

    const oldestRetainedCheckpointDate = getDateDaysBefore(localToday, 3)
    const oldestRetainedCheckpointPrefix = buildStoryContentCheckpointPrefix(oldestRetainedCheckpointDate)
    try {
      await step.do(`cleanup story checkpoints before ${oldestRetainedCheckpointDate}`, IO_STEP_CONFIG, async () => {
        let cursor: string | undefined
        do {
          const result = await this.env.HACKER_NEWS_R2.list({ prefix: STORY_CONTENT_CHECKPOINT_ROOT, cursor })
          const expiredKeys = result.objects
            .map(object => object.key)
            .filter(key => key < oldestRetainedCheckpointPrefix)
          if (expiredKeys.length > 0) {
            await this.env.HACKER_NEWS_R2.delete(expiredKeys)
          }
          cursor = result.truncated ? result.cursor : undefined
        } while (cursor)
      })
    }
    catch (error) {
      console.warn('Failed to cleanup expired story checkpoints', { oldestRetainedCheckpointDate, error })
    }

    if (force) {
      await step.do('force clear script cache', IO_STEP_CONFIG, async () => {
        await kvDelete(scriptKey)
        await kvDelete(rawContentKey)
        await kvDelete(rssCacheKey)

        const prefix = `${rawContentKey}:story-contents:`
        let cursor: string | undefined
        do {
          const listResult = await kvList(prefix, cursor)
          if (listResult.keys.length) {
            await Promise.all(listResult.keys.map(entry => kvDelete(entry.name)))
          }
          cursor = listResult.list_complete ? undefined : listResult.cursor
        } while (cursor)
      })
      kvRequestLogger.checkpoint('after force clear script cache')
    }

    // Check if script already exists to prevent duplicate processing
    const scriptExists = await step.do('check existing script', IO_STEP_CONFIG, async () => {
      const existing = await kvGet(scriptKey)
      if (existing) {
        console.info('Script already exists for date:', displayDate, 'Key:', scriptKey)
        return true
      }
      return false
    })

    kvRequestLogger.checkpoint('after check existing script')

    if (scriptExists && !force) {
      console.info('Skipping workflow - script already exists for date:', displayDate)
      kvRequestLogger.checkpoint('skip existing script')
      return { scriptKey, skipped: true }
    }

    const llmClients = createLlmClients(this.env)
    const runLlm = <T>(
      operation: string,
      kind: 'standard' | 'thinking',
      run: (model: LanguageModel) => Promise<T>,
    ) => runWithLlmFallback(llmClients, operation, client => run(getLlmModel(client, kind)))

    const modelName = (llmClients[0]?.model || '').toLowerCase()
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

    const scheduledStoryLimits = getScheduledStoryLimits(dayOfWeek)
    const storyLimits = storyBudget
      ? applyStoryBudget(scheduledStoryLimits, storyBudget, SOURCE_PRIORITY)
      : scheduledStoryLimits

    const getRecentDates = (baseDate: string, days: number) => {
      const base = new Date(`${baseDate}T00:00:00Z`)
      return Array.from({ length: days }, (_, index) => {
        const date = new Date(base)
        date.setUTCDate(date.getUTCDate() - (index + 1))
        return date.toISOString().split('T')[0]
      })
    }

    const redditDedupeKey = `dedupe:${runEnv}:${variant}:reddit`
    const redditDedupeIndex = await step.do('load reddit dedupe index', IO_STEP_CONFIG, async () => {
      const storedIndex = await kvGet<unknown>(redditDedupeKey, 'json')
      if (storedIndex) {
        return parseRedditDedupeIndex(storedIndex)
      }

      // One-time compatibility path for deployments that predate the compact index.
      // Future daily runs use one KV read instead of reading seven complete scripts.
      let rebuiltIndex = parseRedditDedupeIndex(null)
      const recentDates = getRecentDates(displayDate, 7).reverse()
      for (const recentDate of recentDates) {
        const scriptData = await kvGet<GeneratedScriptData>(`script:${runEnv}:${variant}:${recentDate}`, 'json')
        const redditIds = (scriptData?.stories || [])
          .filter(story => story.source === 'reddit' && story.id)
          .map(story => story.id as string)
        rebuiltIndex = updateRedditDedupeIndex(rebuiltIndex, recentDate, redditIds)
      }

      await kvPut(redditDedupeKey, JSON.stringify(rebuiltIndex), { expirationTtl: 60 * 60 * 24 * 14 })
      return rebuiltIndex
    })

    const excludeRedditIds = getExcludedRedditIds(redditDedupeIndex, displayDate)

    console.info('Reddit dedup window', {
      days: 7,
      excludedCount: excludeRedditIds.size,
    })

    console.info('Source limits based on schedule:', {
      ...storyLimits,
      budget: storyBudget ?? 'none',
      dayOfWeek,
    })

    const stories = await step.do(`get all stories ${fetchDate}`, CONTENT_FETCH_STEP_CONFIG, async () => {
      const allStories = await getAllStories(fetchDate, this.env, {
        limits: storyLimits,
        excludeRedditIds,
      })

      if (!allStories.length) {
        throw new Error('no stories found')
      }
      return allStories as Story[]
    })

    kvRequestLogger.checkpoint('after get all stories')

    const storiesPerSource = stories.reduce<Record<string, number>>((acc, story) => {
      const source = story.source || 'unknown'
      acc[source] = (acc[source] || 0) + 1
      return acc
    }, {})
    console.info('stories per source', storiesPerSource)

    // Fetch one story per durable step so a failure cannot replay every source item.
    // Large content is checkpointed in strongly-consistent R2; step state stores only keys.
    const storyContentPlan = await Promise.all(stories.map(async (story) => {
      const cacheKey = await buildStoryContentCacheKey(rawContentKey, story)
      return {
        cacheKey,
        contentCheckpointKey: buildStoryContentCheckpointKey(cacheKey, event.instanceId),
        articleCheckpointKey: buildStoryArticleCheckpointKey(cacheKey, event.instanceId),
        story,
      }
    }))
    const primaryArticleCandidateIndexes = await step.do('plan primary article batches', IO_STEP_CONFIG, async () => {
      const indexes: number[] = []
      for (const [index, plan] of storyContentPlan.entries()) {
        if (plan.story.source === 'reddit' || !plan.story.url) {
          continue
        }
        if (await this.env.HACKER_NEWS_R2.head(plan.contentCheckpointKey)) {
          continue
        }
        if (await this.env.HACKER_NEWS_R2.head(plan.articleCheckpointKey)) {
          continue
        }
        const cached = await kvGet(plan.cacheKey)
        if (cached) {
          try {
            if (parseStoryContentCheckpoint(JSON.parse(cached))) {
              continue
            }
          }
          catch (error) {
            console.warn('failed to parse cached story content while planning batch', { cacheKey: plan.cacheKey, error })
          }
        }
        indexes.push(index)
      }
      return indexes
    })

    const PRIMARY_READER_BATCH_SIZE = 5
    for (let offset = 0; offset < primaryArticleCandidateIndexes.length; offset += PRIMARY_READER_BATCH_SIZE) {
      const batchIndexes = primaryArticleCandidateIndexes.slice(offset, offset + PRIMARY_READER_BATCH_SIZE)
      const batchPlans = batchIndexes.map(index => storyContentPlan[index])
      if (batchPlans.length < 2) {
        continue
      }
      await step.do(`fetch primary article batch ${offset / PRIMARY_READER_BATCH_SIZE + 1}`, CONTENT_FETCH_STEP_CONFIG, async () => {
        const articles = await getContentFromReaderBatch(batchPlans.map(plan => plan.story.url!))
        await Promise.all(batchPlans.map(async (plan) => {
          const article = articles.get(plan.story.url!)
          if (article) {
            await this.env.HACKER_NEWS_R2.put(plan.articleCheckpointKey, article)
          }
        }))
        return { requested: batchPlans.length, stored: batchPlans.filter(plan => articles.has(plan.story.url!)).length }
      })
    }

    const allStoryContents: StoryContentCheckpoint[] = []
    let redditStoryIndex = 0

    for (const [storyIndex, story] of stories.entries()) {
      if (story.source === 'reddit') {
        redditStoryIndex += 1
        await step.sleep(`wait for reddit rss ${redditStoryIndex}`, REDDIT_RSS_RATE_LIMIT_DELAY)
      }
      const stepName = `get story content ${storyIndex + 1}`
      const { cacheKey, contentCheckpointKey, articleCheckpointKey } = storyContentPlan[storyIndex]

      kvRequestLogger.checkpoint(`before ${stepName}`)
      const checkpointKey = await step.do(stepName, CONTENT_FETCH_STEP_CONFIG, async () => {
        if (await this.env.HACKER_NEWS_R2.head(contentCheckpointKey)) {
          console.info('use R2 story checkpoint', { contentCheckpointKey })
          return contentCheckpointKey
        }

        let storyRecord: StoryContentCheckpoint | null = null
        const cached = await kvGet(cacheKey)
        if (cached) {
          try {
            storyRecord = parseStoryContentCheckpoint(JSON.parse(cached))
            if (storyRecord) {
              console.info('use cached story content', { cacheKey })
            }
          }
          catch (error) {
            console.warn('failed to parse cached story content', { cacheKey, error })
          }
        }

        if (!storyRecord) {
          const prefetchedArticle = await this.env.HACKER_NEWS_R2.get(articleCheckpointKey)
          const storyContent = await getHackerNewsStory(
            story,
            maxTokens,
            this.env,
            prefetchedArticle ? await prefetchedArticle.text() : '',
          )
          if (!storyContent || storyContent.trim().length < 50) {
            console.warn(`⚠️ FILTERED OUT: Story "${story.title}" has no content - excluding from podcast`)
            return null
          }

          storyRecord = {
            id: story.id || '',
            title: story.title || '',
            content: storyContent,
            source: story.source,
          }
        }

        const serialized = JSON.stringify(storyRecord)
        await Promise.all([
          kvPut(cacheKey, serialized, { expirationTtl: 60 * 60 * 24 }),
          this.env.HACKER_NEWS_R2.put(contentCheckpointKey, serialized),
        ])
        return contentCheckpointKey
      })

      kvRequestLogger.checkpoint(`after ${stepName}`)
      if (!checkpointKey) {
        continue
      }

      const checkpoint = await this.env.HACKER_NEWS_R2.get(checkpointKey)
      if (!checkpoint) {
        throw new Error(`Missing story content checkpoint: ${checkpointKey}`)
      }
      const storyRecord = parseStoryContentCheckpoint(await checkpoint.json<unknown>())
      if (!storyRecord) {
        throw new Error(`Invalid story content checkpoint: ${checkpointKey}`)
      }
      allStoryContents.push(storyRecord)
    }

    // 一次性處理所有文章摘要
    const summarizationMaxTokens = Math.min(maxTokens * 2, completionTokenLimit)

    const storySummaries = await step.do('summarize all stories', AI_STEP_CONFIG, async () => {
      const summaries: string[] = []
      const expectedCount = allStoryContents.length

      console.info('Starting batch summarization', {
        storyCount: expectedCount,
        maxTokens: summarizationMaxTokens,
      })

      const combinedContent = allStoryContents.map((story, index) =>
        `<story id="${story.id}" title="${story.title}" number="${index + 1}">\n${story.content}\n</story>`,
      ).join('\n\n---\n\n')

      const { text, usage, finishReason } = await runLlm('summarize all stories', 'standard', model => generateText({
        model,
        system: `${summarizeStoryPrompt}\n\n請為每篇文章產生摘要。**重要：你必須為所有 ${expectedCount} 篇文章都產生摘要**。請用 <story-summary id="文章ID"> 標籤包住每個摘要，確保數量正確。`,
        prompt: combinedContent,
        maxTokens: summarizationMaxTokens,
        maxRetries: AI_SDK_MAX_RETRIES,
      }))

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
          }
          else {
            summaries.push(`<story>${text}</story>`)
          }
        }
      }

      return summaries
    })

    kvRequestLogger.checkpoint('after summarize all stories')

    const podcastScript = await step.do('generate podcast script', AI_STEP_CONFIG, async () => {
      const scriptMaxTokens = Math.min(maxTokens * 2, completionTokenLimit)
      const dialoguePlan = getDialoguePlan(allStoryContents.length)
      const targetMinChars = Math.min(5600, Math.max(4800, allStoryContents.length * 430))
      const targetMaxChars = Math.min(6500, Math.max(5600, allStoryContents.length * 500))

      console.info('Dynamic dialogue lines calculation:', {
        storyCount: allStoryContents.length,
        ...dialoguePlan,
        targetMinChars,
        targetMaxChars,
      })

      const storyList = allStoryContents.map((story, index) =>
        `${index + 1}. [${story.source}] ${story.title}`,
      ).join('\n')

      const storyMetadata = allStoryContents.map((storyContent) => {
        const story = stories.find(candidate =>
          candidate.id === storyContent.id && candidate.source === storyContent.source,
        )
        return story || {
          id: storyContent.id,
          title: storyContent.title,
          source: storyContent.source,
        }
      })

      // Re-use the combinedContent (raw stories) for script generation
      const fullContentString = allStoryContents.map((story, index) =>
        `<story id="${story.id}" title="${story.title}" source="${story.source}" number="${index + 1}">\n${story.content}\n</story>`,
      ).join('\n\n---\n\n')

      const enhancedPrompt = `日期: ${displayDate}
【必須討論的故事清單】（共 ${allStoryContents.length} 個故事，每一個都必須完整討論）
${storyList}

【動態對話展開要求】
- 目標 ${dialoguePlan.targetLines} 段發言，允許範圍 ${dialoguePlan.minLines}-${dialoguePlan.maxLines} 段；JSON dialogue 中的一個項目就是一段發言
- 每個故事至少要有一個完整來回：Cordelia 與 David 都必須針對該故事各發言至少一次
- David 在每個故事都要補充技術背景或核心原理；最重要的故事至少安排一段完整機制解說，不能只做質疑與評論
- 最重要或最有爭議的 2-3 個故事可以增加來回；資訊較少的故事仍須解釋其價值或不足，不得略過
- 每段只深入一個故事；相關故事可以自然銜接，但順帶提及不算完成討論
- 以目前 TTS 語速製作約 15-20 分鐘節目，參考總字數 ${targetMinChars}-${targetMaxChars} 字；請靠具體內容達成，不要重複資訊或加入空話湊字數
- 實質討論通常控制在 220-360 字；必要的開場、追問或轉場可使用 100-180 字，但整集最多四段這類短發言；任何發言不得超過 ${MAX_DIALOGUE_LINE_CHARS} 字
- 不要為了湊互動增加無資訊短句；每個 dialogue 項目都會產生一次 TTS 請求，應在有限段數內優先保留具體事實、技術細節與有根據的觀點

<story-metadata>${JSON.stringify(storyMetadata)}</story-metadata>

<raw-story-content>
${fullContentString}
</raw-story-content>
`

      const { object, usage, finishReason } = await runLlm('generate podcast script', 'thinking', model => generateObject({
        model,
        system: podcastScriptPrompt,
        prompt: enhancedPrompt,
        maxTokens: scriptMaxTokens,
        maxRetries: AI_SDK_MAX_RETRIES,
        schema: z.object({
          title: z.string().optional(),
          dialogue: z.array(z.object({
            speaker: z.string().min(1),
            text: z.string().min(1),
          })).min(1),
        }),
      }))

      console.info('generate podcast script success', {
        usage,
        finishReason,
        title: object.title,
        dialogueLength: object.dialogue.length,
      })

      const sanitizedDialogue = object.dialogue.flatMap((line, index) => {
        const rawSpeaker = typeof line?.speaker === 'string' ? line.speaker.trim() : ''
        const text = typeof line?.text === 'string' ? line.text.trim() : ''
        const speaker = rawSpeaker === '女' || rawSpeaker.toLowerCase() === 'cordelia'
          ? '女'
          : rawSpeaker === '男' || rawSpeaker.toLowerCase() === 'david'
            ? '男'
            : null
        if (!speaker || !text) {
          throw new Error(`invalid dialogue line at index ${index}`)
        }
        return splitDialogueText(text).map(chunk => ({
          speaker: speaker as PodcastDialogueLine['speaker'],
          text: chunk,
        }))
      })

      return { title: object.title, dialogue: sanitizedDialogue } as PodcastScriptResponse
    })

    kvRequestLogger.checkpoint('after generate podcast script')

    if (!podcastScript.title || podcastScript.title.length < 5) {
      console.info('Title missing or too short, triggering dedicated beautification step')
      podcastScript.title = await step.do('beautify missing title', AI_STEP_CONFIG, async () => {
        const { text } = await runLlm('beautify missing title', 'standard', model => generateText({
          model,
          system: `你是 ${podcastTitle} 的總編輯。請根據提供的故事摘要，產生一個具體、有吸引力並忠於素材的台灣繁體中文標題。不得補造摘要未提供的數字、因果或災難性結論。\n格式："[日期] [具體亮點1]、[具體亮點2]"。只輸出標題。`,
          prompt: `日期: ${displayDate}\n今日故事內容摘要：\n${storySummaries.join('\n')}`,
          maxRetries: AI_SDK_MAX_RETRIES,
        }))
        return text.trim().replace(/^"|"$/g, '')
      })
    }

    console.info('podcast script line count', podcastScript.dialogue.length, 'title:', podcastScript.title)

    await step.sleep('pause before blog content', breakTime)

    const blogContent = await step.do('create blog content', AI_STEP_CONFIG, async () => {
      const blogMaxTokens = Math.min(maxTokens, completionTokenLimit)
      const { text, usage, finishReason } = await runLlm('create blog content', 'thinking', model => generateText({
        model,
        system: summarizeBlogPrompt,
        prompt: `<stories>${JSON.stringify(stories)}</stories>\n\n---\n\n${storySummaries.join('\n\n---\n\n')}`,
        maxTokens: blogMaxTokens,
        maxRetries: AI_SDK_MAX_RETRIES,
      }))
      console.info(`create blog content success`, { usage, finishReason })
      return text
    })

    kvRequestLogger.checkpoint('after create blog content')

    await step.sleep('pause before intro content', breakTime)

    const introContent = await step.do('create intro content', AI_STEP_CONFIG, async () => {
      const podcastDialogueLines = podcastScript.dialogue.map(line => `${line.speaker}：${line.text}`)
      const podcastContent = podcastDialogueLines.join('\n')

      const { text, usage, finishReason } = await runLlm('create intro content', 'standard', model => generateText({
        model,
        system: introPrompt,
        prompt: podcastContent,
        maxRetries: AI_SDK_MAX_RETRIES,
      }))
      console.info(`create intro content success`, { usage, finishReason })
      return text
    })

    kvRequestLogger.checkpoint('after create intro content')

    // Prepare complete data object
    const scriptData: GeneratedScriptData = {
      title: podcastScript.title,
      dialogue: podcastScript.dialogue,
      blogContent,
      introContent,
      stories: stories as Story[],
      storySummaries,
      displayDate,
      generatedAt: event.timestamp.getTime(),
    }

    const nextRedditDedupeIndex = updateRedditDedupeIndex(
      redditDedupeIndex,
      displayDate,
      stories.filter(story => story.source === 'reddit' && story.id).map(story => story.id as string),
    )

    // Save the final script, the compact Reddit index, and update the episode index.
    await step.do('save script to kv', IO_STEP_CONFIG, async () => {
      const existingDates = await kvGet<string[]>(episodeIndexKey, 'json')
      const nextDates = updateEpisodeIndexDates(existingDates, displayDate)

      await Promise.all([
        kvPut(scriptKey, JSON.stringify(scriptData)), // Permanent storage, never expires
        kvPut(redditDedupeKey, JSON.stringify(nextRedditDedupeIndex), {
          expirationTtl: 60 * 60 * 24 * 14,
        }),
        kvPut(episodeIndexKey, JSON.stringify(nextDates)),
      ])
      console.info(`✅ Script saved to KV: ${scriptKey}`)
    })

    kvRequestLogger.checkpoint('after save script to kv')

    // Trigger Audio Workflow
    const audioInstanceId = await step.do('trigger audio workflow', IO_STEP_CONFIG, async () => {
      const audioParams: WorkflowParams = {
        today: displayDate,
        variant,
        phase: 'audio',
      }
      const childInstanceId = await buildChildWorkflowInstanceId(event.instanceId)
      const { instance, duplicateDetected } = await createIdempotentWorkflowInstance(
        this.env.HACKER_NEWS_AUDIO_WORKFLOW,
        {
          id: childInstanceId,
          params: audioParams,
        },
      )

      console.info(
        duplicateDetected ? 'Audio Workflow already exists' : 'Triggered Audio Workflow from Script Workflow',
        { id: instance.id, params: audioParams },
      )
      return instance.id
    })

    kvRequestLogger.checkpoint('after trigger audio workflow')

    return {
      scriptKey,
      audioInstanceId,
      storyCount: stories.length,
      dialogueLines: scriptData.dialogue.length,
    }
  }
}
