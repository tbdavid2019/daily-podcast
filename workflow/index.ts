import type { WorkflowEvent, WorkflowStep, WorkflowStepConfig } from 'cloudflare:workers'
import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { WorkflowEntrypoint } from 'cloudflare:workers'
import { podcastTitle } from '@/config'
import { introPrompt, summarizeBlogPrompt, summarizePodcastPrompt, summarizeStoryPrompt } from './prompt'
import synthesize from './tts'
import { concatAudioFiles, getAllStories, getHackerNewsStory } from './utils'

interface Params {
  today?: string
}

interface Env extends CloudflareEnv {
  OPENAI_BASE_URL: string
  OPENAI_API_KEY: string
  OPENAI_MODEL: string
  OPENAI_THINKING_MODEL?: string
  OPENAI_MAX_TOKENS?: string
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

    if (existingContent) {
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
    const maxTokens = Number.parseInt(this.env.OPENAI_MAX_TOKENS || '4096')

    const stories = await step.do(`get all stories ${today}`, retryConfig, async () => {
      const allStories = await getAllStories(today, this.env)

      if (!allStories.length) {
        throw new Error('no stories found')
      }

      return allStories
    })

    stories.length = Math.min(stories.length, isDev ? 3 : 10)
    console.info('top stories', isDev ? stories : JSON.stringify(stories))

    // 一次性獲取所有文章內容
    const allStoryContents = await step.do('get all story contents', retryConfig, async () => {
      const contents: Array<{ id: string, title: string, content: string }> = []

      for (const story of stories) {
        try {
          const storyContent = await getHackerNewsStory(story, maxTokens, this.env)
          contents.push({
            id: story.id || '',
            title: story.title || '',
            content: storyContent,
          })
          console.info(`get story ${story.id} content success`)
        }
        catch (error) {
          console.error(`get story ${story.id} content failed:`, error)
        }
      }

      return contents
    })

    // 一次性處理所有文章摘要
    const allStories = await step.do('summarize all stories', retryConfig, async () => {
      const summaries: string[] = []

      const combinedContent = allStoryContents.map(story =>
        `<story id="${story.id}" title="${story.title}">\n${story.content}\n</story>`,
      ).join('\n\n---\n\n')

      const { text, usage, finishReason } = await generateText({
        model: openai(this.env.OPENAI_MODEL!),
        system: `${summarizeStoryPrompt}\n\n請為每篇文章生成摘要，用 <story-summary id="文章ID"> 標籤包裹每個摘要。`,
        prompt: combinedContent,
        maxTokens: maxTokens * 2,
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

    const podcastContent = await step.do('create podcast content', retryConfig, async () => {
      const { text, usage, finishReason } = await generateText({
        model: openai(this.env.OPENAI_THINKING_MODEL || this.env.OPENAI_MODEL!),
        system: summarizePodcastPrompt,
        prompt: allStories.join('\n\n---\n\n'),
        maxTokens,
        maxRetries: 3,
      })

      console.info(`create hacker news podcast content success`, { text, usage, finishReason })

      return text
    })

    console.info('podcast content:\n', isDev ? podcastContent : podcastContent.slice(0, 100))

    await step.sleep('pause before blog content', breakTime)

    const blogContent = await step.do('create blog content', retryConfig, async () => {
      const { text, usage, finishReason } = await generateText({
        model: openai(this.env.OPENAI_THINKING_MODEL || this.env.OPENAI_MODEL!),
        system: summarizeBlogPrompt,
        prompt: `<stories>${JSON.stringify(stories)}</stories>\n\n---\n\n${allStories.join('\n\n---\n\n')}`,
        maxTokens,
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

    const conversations = podcastContent.split('\n').filter(Boolean)

    const audioFiles: string[] = []
    for (const [index, conversation] of conversations.entries()) {
      await step.do(`create podcast audio #${index + 1}`, { ...retryConfig, timeout: '5 minutes' }, async () => {
        if (
          !(conversation.startsWith('男') || conversation.startsWith('女'))
          || !conversation.substring(2).trim()
        ) {
          console.warn('conversation is not valid', { index, conversation })
          return null
        }

        console.info('create conversation audio', conversation)
        const audio = await synthesize(conversation.substring(2), conversation[0], this.env)

        if (!audio.size) {
          throw new Error('podcast audio size is 0')
        }

        await this.env.HACKER_NEWS_R2.put(`tmp/${podcastKey}-${index}.mp3`, audio)

        const audioFile = `${this.env.HACKER_NEWS_R2_BUCKET_URL}/tmp/${podcastKey}-${index}.mp3?t=${Date.now()}`
        audioFiles.push(audioFile)
        return audioFile
      })
    }

    if (!audioFiles.length) {
      console.error('No valid audio files were generated from podcast content')
      throw new Error('no audio files generated for podcast')
    }

    await step.do('concat audio files', retryConfig, async () => {
      if (!this.env.BROWSER) {
        console.warn('browser is not configured, skip concat audio files')
        return null
      }

      try {
        const blob = await concatAudioFiles(audioFiles, this.env.BROWSER, { workerUrl: this.env.HACKER_NEWS_WORKER_URL })
        await this.env.HACKER_NEWS_R2.put(podcastKey, blob)

        return `${this.env.HACKER_NEWS_R2_BUCKET_URL}/${podcastKey}?t=${Date.now()}`
      }
      catch (error) {
        console.error('Failed to concat audio files:', error)
        // Continue without audio concatenation - individual files are still available
        return null
      }
    })

    console.info('save podcast to r2 success')

    await step.do('delete temp files', retryConfig, async () => {
      const cleanupPromises = audioFiles.map(async (_, index) => {
        try {
          await Promise.race([
            this.env.HACKER_NEWS_R2.delete(`tmp/${podcastKey}-${index}.mp3`),
            new Promise(resolve => setTimeout(resolve, 1000)), // Timeout after 1 second
          ])
        }
        catch (error) {
          console.warn(`delete temp file ${index} failed:`, error)
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
