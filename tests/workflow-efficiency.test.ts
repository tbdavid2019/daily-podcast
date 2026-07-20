import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import {
  AI_SDK_MAX_RETRIES,
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
  isAudioCheckpointForInstance,
  parseStoryContentCheckpoint,
  STORY_CONTENT_CHECKPOINT_ROOT,
  updateRedditDedupeIndex,
} from '../workflow/efficiency'

describe('workflow retry budgets', () => {
  it('keeps expensive AI and TTS work to one retry layer', () => {
    assert.equal(AI_SDK_MAX_RETRIES, 0)
    assert.equal(CONTENT_FETCH_STEP_CONFIG.retries?.limit, 2)
    assert.equal(AUDIO_BATCH_STEP_CONFIG.retries?.limit, 2)
    assert.ok(MAX_DIALOGUE_LINES * Math.ceil(MAX_DIALOGUE_LINE_CHARS / MAX_TTS_SEGMENT_CHARS) < 1000)
  })

  it('derives replay-sensitive dates from the durable Workflow event', async () => {
    for (const path of ['../workflow/index.ts', '../workflow/audio.ts']) {
      const source = await readFile(new URL(path, import.meta.url), 'utf8')
      assert.match(source, /event\.timestamp/)
      assert.doesNotMatch(source, /const now = new Date\(\)/)
    }
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
