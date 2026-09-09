import type { WorkflowStepConfig } from 'cloudflare:workers'
import type { Story } from './types'

export const AI_SDK_MAX_RETRIES = 0
export const MAX_DIALOGUE_LINES = 34
export const MAX_DIALOGUE_LINE_CHARS = 380
export const MAX_TTS_SEGMENT_CHARS = 400
export const STORY_CONTENT_CHECKPOINT_ROOT = 'workflow-state/story-content/'

export interface DialoguePlan {
  targetLines: number
  minLines: number
  maxLines: number
}

export function getScheduledStoryLimits(dayOfWeek: number): Record<NonNullable<Story['source']>, number> {
  return {
    'hacker-news': dayOfWeek === 0 ? 10 : 7,
    'reddit': 3,
    'github-trending': (dayOfWeek === 1 || dayOfWeek === 4) ? 2 : 0,
    'product-hunt': (dayOfWeek === 2 || dayOfWeek === 5) ? 2 : 0,
    'dev-to': dayOfWeek === 3 ? 3 : 0,
  }
}

export function getDialoguePlan(storyCount: number): DialoguePlan {
  const count = Math.max(1, Math.floor(storyCount))
  const targetLines = Math.min(32, Math.max(8, count * 2 + 4))
  const minLines = Math.min(targetLines, Math.max(6, count * 2))
  const maxLines = Math.min(MAX_DIALOGUE_LINES, Math.max(targetLines, count * 3 + 4))

  return { targetLines, minLines, maxLines }
}

export function splitDialogueText(text: string, maxChars = MAX_DIALOGUE_LINE_CHARS): string[] {
  if (!Number.isInteger(maxChars) || maxChars < 1) {
    throw new Error('maxChars must be a positive integer')
  }

  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return []
  }
  if (normalized.length <= maxChars) {
    return [normalized]
  }

  const sentences = normalized.match(/[^。！？!?；;]+[。！？!?；;]?/gu) || [normalized]
  const segments: string[] = []
  let current = ''

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim()
    if (!trimmedSentence) {
      continue
    }

    if ((current + trimmedSentence).length <= maxChars) {
      current += trimmedSentence
      continue
    }

    if (current) {
      segments.push(current)
      current = ''
    }

    if (trimmedSentence.length <= maxChars) {
      current = trimmedSentence
      continue
    }

    for (let offset = 0; offset < trimmedSentence.length; offset += maxChars) {
      const chunk = trimmedSentence.slice(offset, offset + maxChars).trim()
      if (chunk) {
        segments.push(chunk)
      }
    }
  }

  if (current) {
    segments.push(current)
  }

  return segments
}

export const IO_STEP_CONFIG = {
  retries: {
    limit: 3,
    delay: '5 seconds',
    backoff: 'exponential',
  },
  timeout: '3 minutes',
} satisfies WorkflowStepConfig

export const CONTENT_FETCH_STEP_CONFIG = {
  retries: {
    limit: 2,
    delay: '10 seconds',
    backoff: 'exponential',
  },
  timeout: '3 minutes',
} satisfies WorkflowStepConfig

export const AI_STEP_CONFIG = {
  retries: {
    limit: 1,
    delay: '20 seconds',
    backoff: 'exponential',
  },
  timeout: '12 minutes',
} satisfies WorkflowStepConfig

export const AUDIO_BATCH_STEP_CONFIG = {
  retries: {
    limit: 1,
    delay: '10 seconds',
    backoff: 'exponential',
  },
  timeout: '15 minutes',
} satisfies WorkflowStepConfig

export interface RedditDedupeIndex {
  version: 1
  entries: Array<{ date: string, ids: string[] }>
}

export interface StoryContentCheckpoint {
  id: string
  title: string
  content: string
  source?: Story['source']
}

const STORY_SOURCES = new Set<Story['source']>([
  'hacker-news',
  'github-trending',
  'product-hunt',
  'dev-to',
  'reddit',
])

export function parseStoryContentCheckpoint(value: unknown): StoryContentCheckpoint | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const { id, title, content, source } = value as Record<string, unknown>
  if (typeof id !== 'string' || typeof title !== 'string' || typeof content !== 'string') {
    return null
  }
  if (source !== undefined && (typeof source !== 'string' || !STORY_SOURCES.has(source as Story['source']))) {
    return null
  }

  return {
    id,
    title,
    content,
    ...(source ? { source: source as Story['source'] } : {}),
  }
}

export function getDateDaysBefore(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() - days)
  return value.toISOString().slice(0, 10)
}

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids.filter(id => typeof id === 'string' && id.length > 0))]
}

function retainedEntries(index: RedditDedupeIndex, displayDate: string, retentionDays: number) {
  const cutoff = getDateDaysBefore(displayDate, retentionDays)
  return index.entries
    .filter(entry => entry.date >= cutoff && entry.date <= displayDate)
    .map(entry => ({ date: entry.date, ids: uniqueIds(entry.ids) }))
    .filter(entry => entry.ids.length > 0)
}

export function parseRedditDedupeIndex(value: unknown): RedditDedupeIndex {
  if (!value || typeof value !== 'object' || (value as { version?: unknown }).version !== 1) {
    return { version: 1, entries: [] }
  }

  const entries = (value as { entries?: unknown }).entries
  if (!Array.isArray(entries)) {
    return { version: 1, entries: [] }
  }

  return {
    version: 1,
    entries: entries.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') {
        return []
      }
      const { date, ids } = entry as { date?: unknown, ids?: unknown }
      if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(ids)) {
        return []
      }
      return [{ date, ids: uniqueIds(ids.filter(id => typeof id === 'string')) }]
    }),
  }
}

export function getExcludedRedditIds(
  index: RedditDedupeIndex,
  displayDate: string,
  retentionDays = 7,
): Set<string> {
  return new Set(
    retainedEntries(index, displayDate, retentionDays)
      .filter(entry => entry.date < displayDate)
      .flatMap(entry => entry.ids),
  )
}

export function updateRedditDedupeIndex(
  index: RedditDedupeIndex,
  displayDate: string,
  redditIds: readonly string[],
  retentionDays = 7,
): RedditDedupeIndex {
  const entries = retainedEntries(index, displayDate, retentionDays)
    .filter(entry => entry.date !== displayDate)
  const currentIds = uniqueIds(redditIds)

  if (currentIds.length > 0) {
    entries.push({ date: displayDate, ids: currentIds })
  }

  entries.sort((left, right) => right.date.localeCompare(left.date))
  return { version: 1, entries }
}

export interface DedupeStoryItem {
  source: string
  id: string
  url?: string
}

export interface StoryDedupeIndex {
  version: 1
  entries: Array<{ date: string, items: DedupeStoryItem[] }>
}

export function normalizeDedupeUrl(url: string | undefined | null): string {
  if (!url || typeof url !== 'string') {
    return ''
  }
  try {
    const parsed = new URL(url.trim())
    parsed.hash = ''
    for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'source']) {
      parsed.searchParams.delete(key)
    }
    let normalized = parsed.toString()
    if (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1)
    }
    return normalized.toLowerCase()
  }
  catch {
    return url.trim().toLowerCase()
  }
}

export function buildStoryDedupeKey(runEnv: string, variant = 'hacker-news'): string {
  const normalizedVariant = variant === 'main' ? 'hacker-news' : variant
  return `dedupe:${runEnv}:${normalizedVariant}:stories`
}

export function parseStoryDedupeIndex(value: unknown): StoryDedupeIndex {
  if (!value || typeof value !== 'object' || (value as { version?: unknown }).version !== 1) {
    return { version: 1, entries: [] }
  }

  const entries = (value as { entries?: unknown }).entries
  if (!Array.isArray(entries)) {
    return { version: 1, entries: [] }
  }

  return {
    version: 1,
    entries: entries.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') {
        return []
      }
      const { date, items } = entry as { date?: unknown, items?: unknown }
      if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(items)) {
        return []
      }
      const validItems: DedupeStoryItem[] = []
      for (const item of items) {
        if (!item || typeof item !== 'object')
          continue
        const { source, id, url } = item as { source?: unknown, id?: unknown, url?: unknown }
        if (typeof source === 'string' && typeof id === 'string') {
          validItems.push({
            source,
            id,
            ...(typeof url === 'string' && url ? { url: normalizeDedupeUrl(url) } : {}),
          })
        }
      }
      return validItems.length > 0 ? [{ date, items: validItems }] : []
    }),
  }
}

export function getExcludedStoryIdentifiers(
  index: StoryDedupeIndex,
  displayDate: string,
  retentionDays = 7,
): { ids: Set<string>, urls: Set<string> } {
  const cutoff = getDateDaysBefore(displayDate, retentionDays)
  const ids = new Set<string>()
  const urls = new Set<string>()

  for (const entry of index.entries) {
    if (entry.date >= cutoff && entry.date < displayDate) {
      for (const item of entry.items) {
        if (item.id) {
          ids.add(item.id)
          ids.add(`${item.source}:${item.id}`)
        }
        if (item.url) {
          urls.add(item.url)
        }
      }
    }
  }

  return { ids, urls }
}

export function updateStoryDedupeIndex(
  index: StoryDedupeIndex,
  displayDate: string,
  stories: readonly Story[],
  retentionDays = 7,
): StoryDedupeIndex {
  const cutoff = getDateDaysBefore(displayDate, retentionDays)
  const entries = index.entries.filter(entry => entry.date >= cutoff && entry.date !== displayDate)

  const currentItems: DedupeStoryItem[] = []
  const seen = new Set<string>()

  for (const story of stories) {
    const source = story.source || 'unknown'
    const id = story.id || ''
    const url = normalizeDedupeUrl(story.url)
    const key = `${source}:${id}:${url}`
    if (!seen.has(key) && (id || url)) {
      seen.add(key)
      currentItems.push({
        source,
        id,
        ...(url ? { url } : {}),
      })
    }
  }

  if (currentItems.length > 0) {
    entries.push({ date: displayDate, items: currentItems })
  }

  entries.sort((left, right) => right.date.localeCompare(left.date))
  return { version: 1, entries }
}

export interface TopicArchiveTopic {
  title: string
  keywords?: string[]
  summary: string
  source?: string
  sourceUrl?: string
}

export interface TopicArchiveEntry {
  date: string
  episodeTitle: string
  topics: TopicArchiveTopic[]
}

export interface TopicArchiveIndex {
  version: 1
  entries: TopicArchiveEntry[]
}

export function buildTopicArchiveKey(runEnv: string, variant = 'hacker-news'): string {
  const normalizedVariant = variant === 'main' ? 'hacker-news' : variant
  return `topics:archive:${runEnv}:${normalizedVariant}`
}

export function parseTopicArchiveIndex(value: unknown): TopicArchiveIndex {
  if (!value || typeof value !== 'object' || (value as { version?: unknown }).version !== 1) {
    return { version: 1, entries: [] }
  }

  const entries = (value as { entries?: unknown }).entries
  if (!Array.isArray(entries)) {
    return { version: 1, entries: [] }
  }

  return {
    version: 1,
    entries: entries.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') {
        return []
      }
      const { date, episodeTitle, topics } = entry as { date?: unknown, episodeTitle?: unknown, topics?: unknown }
      if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Array.isArray(topics)) {
        return []
      }
      const validTopics: TopicArchiveTopic[] = []
      for (const t of topics) {
        if (!t || typeof t !== 'object')
          continue
        const { title, keywords, summary, source, sourceUrl } = t as Record<string, unknown>
        if (typeof title === 'string' && title.trim()) {
          validTopics.push({
            title: title.trim(),
            keywords: Array.isArray(keywords) ? keywords.filter(k => typeof k === 'string') : [],
            summary: typeof summary === 'string' ? summary.trim() : '',
            source: typeof source === 'string' ? source : undefined,
            sourceUrl: typeof sourceUrl === 'string' ? sourceUrl : undefined,
          })
        }
      }
      return validTopics.length > 0
        ? [{
            date,
            episodeTitle: typeof episodeTitle === 'string' ? episodeTitle : `[${date}]`,
            topics: validTopics,
          }]
        : []
    }),
  }
}

export function updateTopicArchiveIndex(
  index: TopicArchiveIndex,
  entry: TopicArchiveEntry,
  retentionDays = 30,
): TopicArchiveIndex {
  const cutoff = getDateDaysBefore(entry.date, retentionDays)
  const entries = index.entries.filter(e => e.date >= cutoff && e.date !== entry.date)

  if (entry.topics.length > 0) {
    entries.push(entry)
  }

  entries.sort((left, right) => right.date.localeCompare(left.date))
  return { version: 1, entries }
}

const DEDUPE_STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'by',
  'from',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'this',
  'that',
  'these',
  'those',
  'it',
  'its',
  'how',
  'why',
  'what',
  'when',
  'who',
  'which',
  'new',
  'post',
  'show',
  'ask',
  'hn',
  '與',
  '及',
  '和',
  '在',
  '之',
  '的',
  '了',
  '是',
  '於',
  '從',
  '到',
  '以',
  '對',
  '或',
  '這個',
  '那個',
  '我們',
  '今天',
  '目前',
  '探討',
  '分析',
  '解析',
  '介紹',
  '討論',
  '報導',
  '相關',
  '問題',
  '系統',
  '技術',
  '全面',
  '深入',
  '帶來',
  '最新',
  '架構',
  '專案',
])

export function extractKeywords(text: string): string[] {
  if (!text)
    return []
  const matches = text.match(/[A-Z0-9+#.-]{3,}|[\u4E00-\u9FA5]{2,4}/gi) || []
  const keywords = new Set<string>()
  for (const m of matches) {
    const lower = m.toLowerCase()
    if (!DEDUPE_STOP_WORDS.has(lower) && lower.length >= 2) {
      keywords.add(m)
    }
  }
  return [...keywords]
}

export interface HistoricalTopicCallback {
  pastDate: string
  episodeTitle: string
  matchedTopic: TopicArchiveTopic
  relatedCurrentStory: Story
  overlapKeywords: string[]
}

export function findRelevantHistoricalTopics(
  archive: TopicArchiveIndex,
  currentStories: readonly Story[],
  currentDisplayDate: string,
  maxCallbacks = 3,
): HistoricalTopicCallback[] {
  const results: HistoricalTopicCallback[] = []
  const seenPastTopicKeys = new Set<string>()

  // Only check past entries (strictly before currentDisplayDate)
  const pastEntries = archive.entries.filter(e => e.date < currentDisplayDate)

  for (const story of currentStories) {
    if (results.length >= maxCallbacks)
      break
    const currentText = `${story.title || ''}`
    const currentKeywords = new Set(extractKeywords(currentText).map(k => k.toLowerCase()))
    if (currentKeywords.size === 0)
      continue

    for (const pastEntry of pastEntries) {
      if (results.length >= maxCallbacks)
        break
      for (const pastTopic of pastEntry.topics) {
        const pastTopicKey = `${pastEntry.date}:${pastTopic.title}`
        if (seenPastTopicKeys.has(pastTopicKey))
          continue

        const pastKeywords = (pastTopic.keywords && pastTopic.keywords.length > 0)
          ? pastTopic.keywords
          : extractKeywords(`${pastTopic.title} ${pastTopic.summary}`)

        const overlap: string[] = []
        for (const kw of pastKeywords) {
          if (currentKeywords.has(kw.toLowerCase())) {
            overlap.push(kw)
          }
        }

        // Match if 2+ keywords match, or 1 long distinctive keyword (length >= 5 e.g. GrapheneOS, Chromium)
        const isStrongMatch = overlap.length >= 2 || (overlap.length === 1 && overlap[0].length >= 5)
        if (isStrongMatch) {
          seenPastTopicKeys.add(pastTopicKey)
          results.push({
            pastDate: pastEntry.date,
            episodeTitle: pastEntry.episodeTitle,
            matchedTopic: pastTopic,
            relatedCurrentStory: story,
            overlapKeywords: overlap,
          })
          break // Match at most 1 past topic per current story
        }
      }
    }
  }

  return results
}

export function formatHistoricalCallbacksContext(
  callbacks: readonly HistoricalTopicCallback[],
): string {
  if (!callbacks || callbacks.length === 0) {
    return ''
  }

  const items = callbacks.map((cb) => {
    return `- ${cb.pastDate} 集（《${cb.episodeTitle}》）：
  - 歷史主題：「${cb.matchedTopic.title}」
  - 前情摘要：${cb.matchedTopic.summary || '（曾探討此技術背景）'}
  - 今日關聯故事：[${cb.relatedCurrentStory.source || 'tech'}] ${cb.relatedCurrentStory.title}
  - 關聯關鍵字：${cb.overlapKeywords.join(', ')}`
  }).join('\n\n')

  return `
【相關歷史集數參考（主持人前情提要依據，嚴禁捏造不存在的集數或日期！）】
${items}
`.trim()
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function buildStoryContentCacheKey(rawContentKey: string, story: Story): Promise<string> {
  const identity = JSON.stringify({
    source: story.source || 'unknown',
    id: story.id || '',
    url: story.url || '',
    title: story.title || '',
  })
  const digest = await sha256Hex(identity)
  return `${rawContentKey}:story-contents:${story.source || 'unknown'}:${digest.slice(0, 24)}`
}

interface AudioBatchKeyInput {
  displayDate: string
  runEnv: string
  variant: string
  instanceId: string
  batchIndex: number
}

interface AudioSegmentKeyInput extends AudioBatchKeyInput {
  segmentIndex: number
}

function safePathPart(value: string): string {
  return value.replace(/[^\w.-]/g, '-')
}

export function buildStoryContentCheckpointKey(cacheKey: string, instanceId: string): string {
  const match = cacheKey.match(/:(\d{4}-\d{2}-\d{2}):story-contents:[^:]+:([a-f0-9]{24})$/)
  if (!match) {
    throw new Error('Invalid story content cache key')
  }
  return `${buildStoryContentCheckpointPrefix(match[1])}${safePathPart(instanceId)}/${match[2]}.json`
}

export function buildStoryArticleCheckpointKey(cacheKey: string, instanceId: string): string {
  return buildStoryContentCheckpointKey(cacheKey, instanceId).replace(/\.json$/, '.primary.md')
}

export function buildStoryContentCheckpointPrefix(date: string): string {
  return `${STORY_CONTENT_CHECKPOINT_ROOT}${date.replaceAll('-', '/')}/`
}

function audioTempPrefix(input: AudioBatchKeyInput): string {
  return `${input.displayDate.replaceAll('-', '/')}/${safePathPart(input.runEnv)}/temp/${safePathPart(input.instanceId)}`
}

export function buildAudioBatchKey(input: AudioBatchKeyInput): string {
  return `${audioTempPrefix(input)}/${safePathPart(input.variant)}-batch-${input.batchIndex}.mp3`
}

export function buildAudioSegmentKey(input: AudioSegmentKeyInput): string {
  return `${audioTempPrefix(input)}/${safePathPart(input.variant)}-batch-${input.batchIndex}-segment-${input.segmentIndex}.mp3`
}

export function buildAudioMultipartStateKey(input: AudioBatchKeyInput): string {
  return `${audioTempPrefix(input)}/${safePathPart(input.variant)}-multipart.json`
}

export function isAudioCheckpointForInstance(
  object: { customMetadata?: Record<string, string> } | null,
  instanceId: string,
): boolean {
  return object?.customMetadata?.workflowInstanceId === instanceId
}

export function buildEpisodeIndexKey(runEnv: string, variant = 'hacker-news'): string {
  const normalizedVariant = variant === 'main' ? 'hacker-news' : variant
  return `index:${runEnv}:${normalizedVariant}:dates`
}

export function buildRssCacheKey(runEnv: string, variant = 'hacker-news'): string {
  const normalizedVariant = variant === 'main' ? 'hacker-news' : variant
  return `cache:${runEnv}:${normalizedVariant}:rss.xml`
}

export function updateEpisodeIndexDates(
  existingDates: readonly string[] | null | undefined,
  newDate: string,
): string[] {
  const validDates = new Set<string>()
  if (/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
    validDates.add(newDate)
  }
  if (Array.isArray(existingDates)) {
    for (const d of existingDates) {
      if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
        validDates.add(d)
      }
    }
  }
  return Array.from(validDates).sort((a, b) => b.localeCompare(a))
}
