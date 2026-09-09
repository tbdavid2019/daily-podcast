import type {
  DedupeStoryItem,
  StoryDedupeIndex,
  TopicArchiveEntry,
  TopicArchiveIndex,
  TopicArchiveTopic,
} from '../workflow/efficiency'
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import {
  buildStoryDedupeKey,
  buildTopicArchiveKey,
  extractKeywords,
  normalizeDedupeUrl,
} from '../workflow/efficiency'

const ACCOUNT_ID = '379570860738dd1757ba7f67ef2bdffe'
const RUN_ENV = 'production'
const VARIANT = 'hacker-news'
const DATES = [
  '2026-09-03',
  '2026-09-04',
  '2026-09-05',
  '2026-09-06',
  '2026-09-07',
  '2026-09-08',
  '2026-09-09',
]

async function main() {
  console.info('Starting backfill for dates:', DATES)

  const topicEntries: TopicArchiveEntry[] = []
  const dedupeEntries: Array<{ date: string, items: DedupeStoryItem[] }> = []

  for (const date of DATES) {
    console.info(`Fetching script for ${date}...`)
    const res = await fetch(`https://daily-podcast-worker.oobwei.workers.dev/script?today=${date}`)
    if (!res.ok) {
      console.warn(`Failed to fetch script for ${date}: HTTP ${res.status}`)
      continue
    }

    const data = await res.json() as {
      title?: string
      blogContent?: string
      stories?: Array<{ id?: string, title?: string, url?: string, source?: string, hackerNewsUrl?: string }>
      storySummaries?: string[]
    }

    const blogTitleMap = new Map<string, string>()
    if (data.blogContent) {
      for (const line of data.blogContent.split('\n')) {
        const match = line.match(/^##\s+\[(.*?)\]\((.*?)\)/)
        if (match) {
          blogTitleMap.set(match[2].trim(), match[1].trim())
        }
      }
    }

    const stories = data.stories || []
    const summaries = data.storySummaries || []

    const topics: TopicArchiveTopic[] = stories.map((story, index) => {
      const summaryText = summaries[index] || ''
      const coreMatch = summaryText.match(/\*\*核心焦點\*\*：([^\n]+)/)
      const coreFocus = coreMatch ? coreMatch[1].trim() : ''

      const chineseTitle = (story.hackerNewsUrl && blogTitleMap.get(story.hackerNewsUrl))
        || (story.url && blogTitleMap.get(story.url))
        || story.title
        || '未命名主題'

      const keywords = extractKeywords(`${chineseTitle} ${coreFocus}`)

      return {
        title: chineseTitle,
        keywords,
        summary: coreFocus || chineseTitle,
        source: story.source,
        sourceUrl: story.url || story.hackerNewsUrl,
      }
    })

    topicEntries.push({
      date,
      episodeTitle: data.title || `[${date}] 科技新聞彙整`,
      topics,
    })

    const dedupeItems: DedupeStoryItem[] = []
    const seen = new Set<string>()
    for (const story of stories) {
      const source = story.source || 'unknown'
      const id = story.id || ''
      const url = normalizeDedupeUrl(story.url)
      const key = `${source}:${id}:${url}`
      if (!seen.has(key) && (id || url)) {
        seen.add(key)
        dedupeItems.push({
          source,
          id,
          ...(url ? { url } : {}),
        })
      }
    }

    dedupeEntries.push({
      date,
      items: dedupeItems,
    })

    console.info(`Processed ${date}: ${topics.length} topics, ${dedupeItems.length} dedupe items`)
  }

  topicEntries.sort((a, b) => b.date.localeCompare(a.date))
  dedupeEntries.sort((a, b) => b.date.localeCompare(a.date))

  const topicArchiveIndex: TopicArchiveIndex = {
    version: 1,
    entries: topicEntries,
  }

  const storyDedupeIndex: StoryDedupeIndex = {
    version: 1,
    entries: dedupeEntries,
  }

  const topicArchiveKey = buildTopicArchiveKey(RUN_ENV, VARIANT)
  const storyDedupeKey = buildStoryDedupeKey(RUN_ENV, VARIANT)

  const tmpTopicPath = join(tmpdir(), 'topic-archive.json')
  const tmpDedupePath = join(tmpdir(), 'story-dedupe.json')

  writeFileSync(tmpTopicPath, JSON.stringify(topicArchiveIndex), 'utf8')
  writeFileSync(tmpDedupePath, JSON.stringify(storyDedupeIndex), 'utf8')

  console.info(`Wrote temporary files: ${tmpTopicPath}, ${tmpDedupePath}`)

  console.info(`Uploading ${topicArchiveKey} to remote KV...`)
  execSync(
    `CLOUDFLARE_ACCOUNT_ID=${ACCOUNT_ID} npx wrangler kv key put --binding HACKER_NEWS_KV --config wrangler.jsonc --remote "${topicArchiveKey}" --path "${tmpTopicPath}"`,
    { stdio: 'inherit' },
  )

  console.info(`Uploading ${storyDedupeKey} to remote KV...`)
  execSync(
    `CLOUDFLARE_ACCOUNT_ID=${ACCOUNT_ID} npx wrangler kv key put --binding HACKER_NEWS_KV --config wrangler.jsonc --remote "${storyDedupeKey}" --path "${tmpDedupePath}"`,
    { stdio: 'inherit' },
  )

  console.info('✅ Backfill successfully completed!')
}

main().catch((err) => {
  console.error('Backfill failed:', err)
  process.exit(1)
})
