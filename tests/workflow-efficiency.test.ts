import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import {
  AI_SDK_MAX_RETRIES,
  AI_STEP_CONFIG,
  AUDIO_BATCH_STEP_CONFIG,
  CONTENT_FETCH_STEP_CONFIG,
  MAX_DIALOGUE_LINES,
  MAX_DIALOGUE_LINE_CHARS,
  MAX_TTS_SEGMENT_CHARS,
  buildAudioBatchKey,
  buildAudioMultipartStateKey,
  buildAudioSegmentKey,
  buildStoryContentCacheKey,
  buildStoryContentCheckpointKey,
  buildStoryContentCheckpointPrefix,
  getExcludedRedditIds,
  getDateDaysBefore,
  getDialoguePlan,
  getScheduledStoryLimits,
  isAudioCheckpointForInstance,
  parseStoryContentCheckpoint,
  splitDialogueText,
  STORY_CONTENT_CHECKPOINT_ROOT,
  updateRedditDedupeIndex,
} from '../workflow/efficiency'

describe('workflow retry budgets', () => {
  it('keeps expensive AI and TTS work to one retry layer', () => {
    assert.equal(AI_SDK_MAX_RETRIES, 0)
    assert.equal(AI_STEP_CONFIG.retries?.limit, 1)
    assert.equal(CONTENT_FETCH_STEP_CONFIG.retries?.limit, 2)
    assert.equal(AUDIO_BATCH_STEP_CONFIG.retries?.limit, 1)
    assert.ok(MAX_DIALOGUE_LINES * Math.ceil(MAX_DIALOGUE_LINE_CHARS / MAX_TTS_SEGMENT_CHARS) < 1000)
  })

  it('accepts model length drift and splits dialogue locally for TTS', () => {
    const sentences = `${'甲'.repeat(250)}。${'乙'.repeat(250)}！`
    const punctuationChunks = splitDialogueText(sentences)
    assert.ok(punctuationChunks.length > 1)
    assert.ok(punctuationChunks.every(chunk => chunk.length <= MAX_DIALOGUE_LINE_CHARS))
    assert.equal(punctuationChunks.join(''), sentences)

    const longSentence = '測'.repeat(MAX_DIALOGUE_LINE_CHARS * 2 + 17)
    const hardChunks = splitDialogueText(longSentence)
    assert.deepEqual(hardChunks.map(chunk => chunk.length), [380, 380, 17])

    assert.deepEqual(splitDialogueText('  保留   合理空白。 '), ['保留 合理空白。'])
  })

  it('derives replay-sensitive dates from the durable Workflow event', async () => {
    for (const path of ['../workflow/index.ts', '../workflow/audio.ts']) {
      const source = await readFile(new URL(path, import.meta.url), 'utf8')
      assert.match(source, /event\.timestamp/)
      assert.doesNotMatch(source, /const now = new Date\(\)/)
    }
  })

  it('uses only the three self-hosted readers without forwarding authorization', async () => {
    const source = await readFile(new URL('../workflow/utils.ts', import.meta.url), 'utf8')
    const readerStart = source.indexOf('async function getContentFromReader')
    const readerEnd = source.indexOf('export async function getHackerNewsTopStories')
    const readerSource = source.slice(readerStart, readerEnd)

    assert.match(source, /'https:\/\/create360\.ai'/)
    assert.match(source, /'http:\/\/git\.glsoft\.ai:8083'/)
    assert.match(source, /'http:\/\/60\.248\.142\.126:8083'/)
    assert.doesNotMatch(source, /r\.jina\.ai/)
    assert.doesNotMatch(source, /Firecrawl|FIRECRAWL|firecrawl/)
    assert.doesNotMatch(readerSource, /Authorization/)
    assert.doesNotMatch(readerSource, /circuit breaker|BREAKER_THRESHOLD/)
    assert.match(source, /include: '\.comment-tree'/)
    assert.doesNotMatch(source, /#pagespace \+ tr/)
  })

  it('allocates a complete exchange per story without unbounded dialogue growth', async () => {
    assert.deepEqual(getDialoguePlan(10), {
      targetLines: 24,
      minLines: 20,
      maxLines: 34,
    })
    assert.deepEqual(getDialoguePlan(13), {
      targetLines: 30,
      minLines: 26,
      maxLines: 34,
    })
    assert.ok(getDialoguePlan(100).maxLines <= MAX_DIALOGUE_LINES)
    assert.ok(MAX_DIALOGUE_LINE_CHARS <= MAX_TTS_SEGMENT_CHARS)

    const source = await readFile(new URL('../workflow/index.ts', import.meta.url), 'utf8')
    assert.match(source, /每個故事至少要有一個完整來回/)
    assert.match(source, /David 在每個故事都要補充技術背景或核心原理/)
    assert.match(source, /約 15-20 分鐘節目/)
    assert.match(source, /參考總字數 \$\{targetMinChars\}-\$\{targetMaxChars\} 字/)
    assert.match(source, /任何發言不得超過 \$\{MAX_DIALOGUE_LINE_CHARS\} 字/)
    assert.match(source, /每個 dialogue 項目都會產生一次 TTS 請求/)
    assert.doesNotMatch(source, /text: z\.string\(\)\.min\(1\)\.max\(MAX_DIALOGUE_LINE_CHARS\)/)
    assert.doesNotMatch(source, /\}\)\)\.min\(1\)\.max\(MAX_DIALOGUE_LINES\)/)
    assert.doesNotMatch(source, /每輪專注討論 2-3 個故事/)
  })

  it('uses ten Hacker News stories on Sunday without expanding weekday quotas', () => {
    assert.deepEqual(getScheduledStoryLimits(0), {
      'hacker-news': 10,
      'reddit': 3,
      'github-trending': 0,
      'product-hunt': 0,
      'dev-to': 0,
    })
    assert.equal(getScheduledStoryLimits(1)['hacker-news'], 7)
    assert.equal(getScheduledStoryLimits(1)['github-trending'], 2)
    assert.equal(getScheduledStoryLimits(3)['dev-to'], 3)
  })

})

describe('workflow compact checkpoints', () => {
  it('builds stable story cache keys without embedding long URLs', async () => {
    const story = {
      id: 'item-42',
      source: 'hacker-news' as const,
      title: 'A durable story',
      url: 'https://example.com/an/extremely/long/path?with=query',
    }

    const first = await buildStoryContentCacheKey('content:production:hacker-news:2026-07-20', story)
    const retry = await buildStoryContentCacheKey('content:production:hacker-news:2026-07-20', story)
    const another = await buildStoryContentCacheKey('content:production:hacker-news:2026-07-20', { ...story, id: 'item-43' })

    assert.equal(first, retry)
    assert.notEqual(first, another)
    assert.match(first, /^content:production:hacker-news:2026-07-20:story-contents:hacker-news:[a-f0-9]{24}$/)
    const checkpoint = buildStoryContentCheckpointKey(first, 'workflow-instance-1')
    assert.match(
      checkpoint,
      /^workflow-state\/story-content\/2026\/07\/20\/workflow-instance-1\/[a-f0-9]{24}\.json$/,
    )
    assert.notEqual(checkpoint, buildStoryContentCheckpointKey(first, 'workflow-instance-2'))
    assert.equal(buildStoryContentCheckpointPrefix('2026-07-16'), 'workflow-state/story-content/2026/07/16/')
    assert.equal(STORY_CONTENT_CHECKPOINT_ROOT, 'workflow-state/story-content/')
    assert.equal(getDateDaysBefore('2026-07-20', 4), '2026-07-16')
  })

  it('uses deterministic batch and segment keys for step retries', () => {
    const input = {
      displayDate: '2026-07-20',
      runEnv: 'production',
      variant: 'hacker-news',
      instanceId: 'podcast-audio-child-abc123',
      batchIndex: 2,
    }

    assert.equal(buildAudioBatchKey(input), buildAudioBatchKey(input))
    assert.equal(
      buildAudioSegmentKey({ ...input, segmentIndex: 3 }),
      '2026/07/20/production/temp/podcast-audio-child-abc123/hacker-news-batch-2-segment-3.mp3',
    )
    assert.equal(
      buildAudioMultipartStateKey(input),
      '2026/07/20/production/temp/podcast-audio-child-abc123/hacker-news-multipart.json',
    )
  })

  it('reuses a completed final audio object only for the same Workflow instance', () => {
    const object = {
      customMetadata: { workflowInstanceId: 'audio-instance-1' },
    }

    assert.equal(isAudioCheckpointForInstance(object, 'audio-instance-1'), true)
    assert.equal(isAudioCheckpointForInstance(object, 'audio-instance-2'), false)
    assert.equal(isAudioCheckpointForInstance(null, 'audio-instance-1'), false)
  })

  it('rejects corrupted story checkpoints at storage boundaries', () => {
    assert.deepEqual(parseStoryContentCheckpoint({
      id: '42',
      title: 'Valid',
      content: 'Useful article content',
      source: 'hacker-news',
    }), {
      id: '42',
      title: 'Valid',
      content: 'Useful article content',
      source: 'hacker-news',
    })
    assert.equal(parseStoryContentCheckpoint({ title: 'Missing content' }), null)
    assert.equal(parseStoryContentCheckpoint({ id: '42', title: 'Bad source', content: 'text', source: 'unknown' }), null)
  })
})

describe('Reddit dedupe index', () => {
  it('replaces same-day entries and retains only the current plus seven prior days', () => {
    const existing = {
      version: 1 as const,
      entries: [
        { date: '2026-07-20', ids: ['old-current'] },
        { date: '2026-07-19', ids: ['recent-a'] },
        { date: '2026-07-13', ids: ['recent-b'] },
        { date: '2026-07-12', ids: ['expired'] },
      ],
    }

    const updated = updateRedditDedupeIndex(existing, '2026-07-20', ['new-current', 'new-current'])

    assert.deepEqual(updated.entries, [
      { date: '2026-07-20', ids: ['new-current'] },
      { date: '2026-07-19', ids: ['recent-a'] },
      { date: '2026-07-13', ids: ['recent-b'] },
    ])
  })

  it('does not exclude the current day during a force rerun', () => {
    const index = {
      version: 1 as const,
      entries: [
        { date: '2026-07-20', ids: ['same-day'] },
        { date: '2026-07-19', ids: ['previous-day'] },
      ],
    }

    assert.deepEqual([...getExcludedRedditIds(index, '2026-07-20')], ['previous-day'])
  })
})
