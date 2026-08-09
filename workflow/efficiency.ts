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
