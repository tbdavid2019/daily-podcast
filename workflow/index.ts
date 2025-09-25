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
    const today = event.payload?.today || new Date().toISOString().split('T')[0]
    const contentKey = `content:${runEnv}:hacker-news:${today}`

    // Check if content already exists to prevent duplicate processing
    const existingContent = await step.do('check existing content', retryConfig, async () => {
      const existing = await this.env.HACKER_NEWS_KV.get(contentKey)
      if (existing) {
        console.info('Content already exists for date:', today, 'Key:', contentKey)
        return JSON.parse(existing)
      }
      console.info('No existing content found for date:', today, 'Key:', contentKey)
      return null
    })

    if (existingContent && !force) {
      console.info('Skipping workflow - content already exists for date:', today)
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

    const storyLimits = isDev
      ? { 'hacker-news': 3, 'github-trending': 2, 'product-hunt': 2, 'dev-to': 2 }
      : { 'hacker-news': 8, 'github-trending': 5, 'product-hunt': 5, 'dev-to': 5 }

    const stories = await step.do(`get all stories ${today}`, retryConfig, async () => {
      const allStories = await getAllStories(today, this.env, { limits: storyLimits })

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

      const combinedContent = allStoryContents.map(story =>
        `<story id="${story.id}" title="${story.title}">\n${story.content}\n</story>`,
      ).join('\n\n---\n\n')

      const { text, usage, finishReason } = await generateText({
        model: openai(this.env.OPENAI_MODEL!),
        system: `${summarizeStoryPrompt}\n\n請為每篇文章生成摘要，用 <story-summary id="文章ID"> 標籤包裹每個摘要。`,
        prompt: combinedContent,
        maxTokens: summarizationMaxTokens,
      })

      console.info('batch summarize all stories success', { usage, finishReason })

      // 解析批次摘要結果 - 使用簡單的字符串匹配而非正則
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
        // 如果格式不正確，按文章數量分割
        const textParts = text.split('---').filter(part => part.trim())
        textParts.forEach((part) => {
          if (part.trim()) {
            summaries.push(`<story>${part.trim()}</story>`)
          }
        })

        // 如果還是沒有合適的分割，直接使用整個回應
        if (summaries.length === 0) {
          summaries.push(`<story>${text}</story>`)
        }
      }

      return summaries
    })

    const podcastScript = await step.do('generate podcast script', retryConfig, async () => {
      const scriptMaxTokens = Math.min(maxTokens * 2, 8000, completionTokenLimit)
      const { object, usage, finishReason } = await generateObject({
        model: openai(this.env.OPENAI_THINKING_MODEL || this.env.OPENAI_MODEL!),
        system: podcastScriptPrompt,
        prompt: `日期: ${today}\n\n<story-metadata>${JSON.stringify(stories)}</story-metadata>\n\n<story-summaries>\n${storySummaries.join('\n\n---\n\n')}\n</story-summaries>`,
        maxTokens: scriptMaxTokens,
        maxRetries: 3,
        schema: z.object({
          dialogue: z.array(z.object({
            speaker: z.enum(['男', '女']),
            text: z.string().min(1),
          })).min(1),
        }),
      })

      console.info('generate podcast script success', { usage, finishReason })

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

    const podcastKey = `${today.replaceAll('-', '/')}/${runEnv}/hacker-news-${today}.mp3`

    const { tempKeys } = await step.do('create podcast audio files', { ...retryConfig, timeout: '12 minutes' }, async () => {
      const tempKeys: string[] = []
      const timestamp = Date.now()
      const batchSize = 4

      for (let start = 0; start < podcastScript.dialogue.length; start += batchSize) {
        const chunk = podcastScript.dialogue.slice(start, start + batchSize)
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
        date: today,
        title: `${podcastTitle} ${today}`,
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
