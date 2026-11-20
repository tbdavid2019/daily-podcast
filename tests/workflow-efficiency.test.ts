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
  buildEpisodeCatalogKey,
  buildEpisodeIndexKey,
  buildRssCacheKey,
  buildStoryArticleCheckpointKey,
  buildStoryContentCacheKey,
  buildStoryContentCheckpointKey,
  buildStoryContentCheckpointPrefix,
  buildStoryDedupeKey,
  buildStoryDossierCheckpointKey,
  buildTopicArchiveKey,
  findRelevantHistoricalTopics,
  formatHistoricalCallbacksContext,
  DEFAULT_ALL_SOURCE_CANDIDATE_LIMITS,
  DEFAULT_PLAN_B_CURATION_CAPS,
  DEFAULT_PLAN_B_MAX_STORY_BUDGET,
  DEFAULT_PLAN_B_MIN_STORY_BUDGET,
  DEFAULT_PLAN_B_STORY_BUDGET,
  getDateDaysBefore,
  getDialoguePlan,
  getExcludedRedditIds,
  getExcludedStoryIdentifiers,
  getPlanBCurationCaps,
  isAudioCheckpointForInstance,
  normalizeDedupeUrl,
  parseEpisodeCatalogIndex,
  parseStoryContentCheckpoint,
  parseStoryDedupeIndex,
  parseTopicArchiveIndex,
  splitDialogueText,
  STORY_CONTENT_CHECKPOINT_ROOT,
  updateEpisodeIndexDates,
  updateRedditDedupeIndex,
  updateStoryDedupeIndex,
  updateTopicArchiveIndex,
  upsertEpisodeCatalogEntry,
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

    // English sentence boundary and decimal preservation
    const englishSentences = 'The failure rate ticked up to 1.73 percent. David, the big takeaway is here.'
    assert.deepEqual(splitDialogueText(englishSentences, 50), [
      'The failure rate ticked up to 1.73 percent.',
      'David, the big takeaway is here.',
    ])

    // Oversized English sentence without splitting words across boundaries
    const longEnglish = 'The architecture here is remarkably disciplined. The author offloaded the three-body gravitational simulation directly into compute shaders. If the satellites were rendered at true physical scale, they would be sub-pixel invisibles.'
    const chunks = splitDialogueText(longEnglish, 100)
    assert.ok(chunks.every(c => c.length <= 100))
    for (const word of ['architecture', 'remarkably', 'disciplined', 'author', 'offloaded', 'gravitational', 'simulation', 'compute', 'satellites', 'rendered', 'physical', 'sub-pixel', 'invisibles']) {
      assert.ok(chunks.some(c => c.includes(word)), `Word ${word} must be intact`)
    }
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

    assert.match(source, /'https:\/\/2md\.aiurl\.tw'/)
    assert.match(source, /'https:\/\/2md\.glsoft\.ai'/)
    assert.match(source, /'https:\/\/create360\.ai'/)
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
    assert.match(source, /約 18-24 分鐘節目/)
    assert.match(source, /參考總字數 \$\{targetMinChars\}-\$\{targetMaxChars\} 字/)
    assert.match(source, /任何發言不得超過 \$\{MAX_DIALOGUE_LINE_CHARS\} 字/)
    assert.match(source, /每個 dialogue 項目都會產生一次 TTS 請求/)
    assert.doesNotMatch(source, /text: z\.string\(\)\.min\(1\)\.max\(MAX_DIALOGUE_LINE_CHARS\)/)
    assert.doesNotMatch(source, /\}\)\)\.min\(1\)\.max\(MAX_DIALOGUE_LINES\)/)
    assert.doesNotMatch(source, /每輪專注討論 2-3 個故事/)
  })


  it('provides open candidate pools and bounded curation caps under Plan B', () => {
    // All 5 sources are fetched daily under Plan B (HN expanded to 35)
    assert.equal(DEFAULT_ALL_SOURCE_CANDIDATE_LIMITS['hacker-news'], 35)
    assert.equal(DEFAULT_ALL_SOURCE_CANDIDATE_LIMITS.reddit, 6)
    assert.equal(DEFAULT_ALL_SOURCE_CANDIDATE_LIMITS['github-trending'], 5)
    assert.equal(DEFAULT_ALL_SOURCE_CANDIDATE_LIMITS['product-hunt'], 5)
    assert.equal(DEFAULT_ALL_SOURCE_CANDIDATE_LIMITS['dev-to'], 6)

    // Dynamic quality-driven budget range: 11 ~ 14 stories (default 13)
    assert.equal(DEFAULT_PLAN_B_MIN_STORY_BUDGET, 11)
    assert.equal(DEFAULT_PLAN_B_MAX_STORY_BUDGET, 14)
    assert.equal(DEFAULT_PLAN_B_STORY_BUDGET, 13)

    // Curation caps prevent single-source domination while preserving HN dominance (10 HN, up to 4 guest)
    const defaultCaps = getPlanBCurationCaps()
    assert.equal(defaultCaps['hacker-news'], 10)
    assert.equal(defaultCaps.reddit, 2)
    assert.equal(defaultCaps['github-trending'], 1)
    assert.equal(defaultCaps['product-hunt'], 1)
    assert.equal(defaultCaps['dev-to'], 1)

    // Proportional scaling for higher budgets (e.g. 16 stories)
    const scaledCaps = getPlanBCurationCaps(16)
    assert.equal(scaledCaps['hacker-news'], 11)
    assert.equal(scaledCaps.reddit, 2)
    assert.equal(scaledCaps['github-trending'], 1)
    assert.equal(scaledCaps['product-hunt'], 1)
    assert.equal(scaledCaps['dev-to'], 1)
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
    assert.equal(
      buildStoryArticleCheckpointKey(first, 'workflow-instance-1'),
      checkpoint.replace(/\.json$/, '.primary.md'),
    )
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

describe('episode index and RSS cache keys', () => {
  it('builds canonical episode index key and normalizes the main variant', () => {
    assert.equal(buildEpisodeIndexKey('production', 'hacker-news'), 'index:production:hacker-news:dates')
    assert.equal(buildEpisodeIndexKey('production', 'main'), 'index:production:hacker-news:dates')
    assert.equal(buildEpisodeIndexKey('staging', 'dev-to'), 'index:staging:dev-to:dates')
  })

  it('builds canonical RSS cache key and normalizes the main variant', () => {
    assert.equal(buildRssCacheKey('production', 'hacker-news'), 'cache:production:hacker-news:rss.xml')
    assert.equal(buildRssCacheKey('production', 'main'), 'cache:production:hacker-news:rss.xml')
  })

  it('updates episode index dates in descending order and avoids duplicate entries', () => {
    const initial = updateEpisodeIndexDates(null, '2026-09-01')
    assert.deepEqual(initial, ['2026-09-01'])

    const withNewer = updateEpisodeIndexDates(initial, '2026-09-03')
    assert.deepEqual(withNewer, ['2026-09-03', '2026-09-01'])

    const withMiddle = updateEpisodeIndexDates(withNewer, '2026-09-02')
    assert.deepEqual(withMiddle, ['2026-09-03', '2026-09-02', '2026-09-01'])

    const withDuplicate = updateEpisodeIndexDates(withMiddle, '2026-09-02')
    assert.deepEqual(withDuplicate, ['2026-09-03', '2026-09-02', '2026-09-01'])
  })

  it('ignores malformed date strings in updateEpisodeIndexDates', () => {
    const updated = updateEpisodeIndexDates(['2026-09-01', 'not-a-date'], 'invalid')
    assert.deepEqual(updated, ['2026-09-01'])
  })
})

describe('full-source story dedupe index', () => {
  it('normalizes dedupe URLs by stripping tracking parameters and trailing slashes', () => {
    assert.equal(
      normalizeDedupeUrl('https://example.com/post/?utm_source=twitter&utm_medium=social'),
      'https://example.com/post',
    )
    assert.equal(normalizeDedupeUrl('https://example.com/app/'), 'https://example.com/app')
    assert.equal(normalizeDedupeUrl(undefined), '')
  })

  it('builds canonical story dedupe key and normalizes main variant', () => {
    assert.equal(buildStoryDedupeKey('production', 'hacker-news'), 'dedupe:production:hacker-news:stories')
    assert.equal(buildStoryDedupeKey('production', 'main'), 'dedupe:production:hacker-news:stories')
  })

  it('deduplicates across sources by ID and URL within the 7-day retention window', () => {
    const existing = parseStoryDedupeIndex({
      version: 1,
      entries: [
        {
          date: '2026-09-07',
          items: [
            { source: 'hacker-news', id: '49554622', url: 'https://example.com/ancient-stew' },
            { source: 'hacker-news', id: '49591876', url: 'https://example.com/1024b-python' },
          ],
        },
      ],
    })

    const { ids, urls } = getExcludedStoryIdentifiers(existing, '2026-09-08')
    assert.ok(ids.has('49554622'))
    assert.ok(ids.has('hacker-news:49554622'))
    assert.ok(ids.has('49591876'))
    assert.ok(urls.has('https://example.com/ancient-stew'))
    assert.ok(urls.has('https://example.com/1024b-python'))

    // When updating today (2026-09-08), it records new stories
    const updated = updateStoryDedupeIndex(existing, '2026-09-08', [
      { id: '12345678', source: 'hacker-news', title: 'New Story', url: 'https://example.com/new' },
    ])
    assert.equal(updated.entries.length, 2)
    assert.equal(updated.entries[0].date, '2026-09-08')
    assert.equal(updated.entries[0].items[0].id, '12345678')
  })
})

describe('topic archive and historical callbacks', () => {
  it('builds canonical topic archive key and normalizes main variant', () => {
    assert.equal(buildTopicArchiveKey('production', 'hacker-news'), 'topics:archive:production:hacker-news')
    assert.equal(buildTopicArchiveKey('production', 'main'), 'topics:archive:production:hacker-news')
  })

  it('manages rolling 30-day topic archive entries', () => {
    const initial = parseTopicArchiveIndex(null)
    assert.deepEqual(initial.entries, [])

    const entry = {
      date: '2026-09-07',
      episodeTitle: '[2026-09-07] GrapheneOS 挑戰私有 RCS 枷鎖',
      topics: [
        {
          title: 'GrapheneOS 大幅翻新預設應用與剪貼簿安全',
          keywords: ['GrapheneOS', 'RCS', '隱私'],
          summary: '自研開源 RCS 客戶端對抗閉源生態',
          source: 'hacker-news',
        },
      ],
    }

    const updated = updateTopicArchiveIndex(initial, entry)
    assert.equal(updated.entries.length, 1)
    assert.equal(updated.entries[0].date, '2026-09-07')
  })

  it('matches historical topics by keyword overlap strictly from past dates', () => {
    const archive = parseTopicArchiveIndex({
      version: 1,
      entries: [
        {
          date: '2026-09-07',
          episodeTitle: '[2026-09-07] GrapheneOS 挑戰私有 RCS 枷鎖',
          topics: [
            {
              title: 'GrapheneOS 大幅翻新預設應用與剪貼簿安全',
              keywords: ['GrapheneOS', 'RCS', '隱私'],
              summary: '自研開源 RCS 客戶端對抗閉源生態',
              source: 'hacker-news',
            },
          ],
        },
      ],
    })

    const currentStories = [
      {
        id: 'new-story-1',
        title: 'GrapheneOS announces new security updates for RCS',
        source: 'hacker-news' as const,
      },
    ]

    const callbacks = findRelevantHistoricalTopics(archive, currentStories, '2026-09-08')
    assert.equal(callbacks.length, 1)
    assert.equal(callbacks[0].pastDate, '2026-09-07')
    assert.equal(callbacks[0].matchedTopic.title, 'GrapheneOS 大幅翻新預設應用與剪貼簿安全')

    const context = formatHistoricalCallbacksContext(callbacks)
    assert.match(context, /2026-09-07 集/)
    assert.match(context, /GrapheneOS 大幅翻新預設應用與剪貼簿安全/)
    assert.match(context, /自研開源 RCS 客戶端對抗閉源生態/)
  })

  it('enforces replay determinism, durable metadata publishing, and endpoint auth guardrails', async () => {
    const audioSource = await readFile(new URL('../workflow/audio.ts', import.meta.url), 'utf8')
    assert.doesNotMatch(audioSource, /Date\.now\(\)/)
    assert.match(audioSource, /resolveTtsProvider\(this\.env\.TTS_PROVIDER\)/)
    assert.match(audioSource, /step\.do\('publish final audio metadata'/)

    const indexSource = await readFile(new URL('../workflow/index.ts', import.meta.url), 'utf8')
    const forceClearBlock = indexSource.slice(
      indexSource.indexOf("step.do('force clear script cache'"),
      indexSource.indexOf("step.do('force clear script cache'") + 450,
    )
    assert.doesNotMatch(forceClearBlock, /kvDelete\(scriptKey\)/)
    assert.match(indexSource, /parseStoryDossiers/)
    assert.match(indexSource, /buildStoryDossierCheckpointKey/)
    assert.doesNotMatch(indexSource, /65 seconds/)

    const zhDossierKey = buildStoryDossierCheckpointKey(
      'content:production:hacker-news:2026-11-20:story-contents:hacker-news:0123456789abcdef01234567',
      'production',
    )
    const enDossierKey = buildStoryDossierCheckpointKey(
      'content:production:en:2026-11-20:story-contents:hacker-news:0123456789abcdef01234567',
      'production',
    )
    assert.equal(zhDossierKey, enDossierKey)
    assert.equal(zhDossierKey, 'workflow-state/story-content/2026/11/20/dossier/production/0123456789abcdef01234567.md')

    const utilsSource = await readFile(new URL('../workflow/utils.ts', import.meta.url), 'utf8')
    assert.match(utilsSource, /MAX_STORY_CONTENT_CHARS\s*=\s*32_000/)
    assert.match(utilsSource, /Math\.min\(safeMaxTokens \* 4,\s*MAX_STORY_CONTENT_CHARS\)/)

    const workerSource = await readFile(new URL('../worker/index.ts', import.meta.url), 'utf8')
    const getScriptSection = workerSource.slice(
      workerSource.indexOf('async getScript('),
      workerSource.indexOf('async fetch('),
    )
    assert.match(getScriptSection, /authenticateWorkflowRequest/)
    assert.doesNotMatch(getScriptSection, /key:\s*scriptKey/)
    assert.doesNotMatch(workerSource, /oobwei\.workers\.dev/)
  })
})

describe('episode catalog index and cold-start backfill', () => {
  it('builds canonical catalog key, parses entries safely, and upserts sorted deduplicated entries', () => {
    assert.equal(buildEpisodeCatalogKey('production', 'hacker-news'), 'catalog:production:hacker-news:episodes')
    assert.equal(buildEpisodeCatalogKey('production', 'main'), 'catalog:production:hacker-news:episodes')
    assert.equal(buildEpisodeCatalogKey('staging', 'en'), 'catalog:staging:en:episodes')

    const invalid = parseEpisodeCatalogIndex({ version: 2, entries: [] })
    assert.deepEqual(invalid, { version: 1, entries: [] })

    const parsed = parseEpisodeCatalogIndex({
      version: 1,
      entries: [
        { date: '2026-11-18', title: 'Old', introContent: 'Intro 18', audio: 'a18.mp3', updatedAt: 100, variant: 'main' },
        { date: 'bad-date', title: 'Skip', introContent: '', audio: 'x.mp3', updatedAt: 1, variant: 'en' },
        { date: '2026-11-20', title: 'New', introContent: 'Intro 20', audio: 'a20.mp3', updatedAt: 200, variant: 'hacker-news', audioDurationSec: 900 },
      ],
    })
    assert.deepEqual(parsed.entries.map(e => e.date), ['2026-11-20', '2026-11-18'])
    assert.equal(parsed.entries[1].variant, 'hacker-news')

    const upserted = upsertEpisodeCatalogEntry(parsed, {
      date: '2026-11-18',
      title: 'Updated 18',
      introContent: 'Updated Intro',
      audio: 'a18-new.mp3',
      updatedAt: 300,
      variant: 'hacker-news',
      audioDurationSec: 640,
    })
    assert.equal(upserted.entries.length, 2)
    assert.equal(upserted.entries[1].title, 'Updated 18')
    assert.equal(upserted.entries[1].audioDurationSec, 640)
  })

  it('serves homepage articles in 1 KV read when seeded and safely slices unseeded/cold archives without KV writes', async () => {
    const { buildEpisodeCatalogKey, parseEpisodeCatalogIndex, upsertEpisodeCatalogEntry } = await import('../workflow/efficiency')
    const { getEpisodeCatalog, getHomepageArticles } = await import('../lib/content')

    const kvStore = new Map<string, unknown>()
    const kvGets: string[] = []
    const kvPuts: string[] = []

    kvStore.set('index:production:hacker-news:dates', ['2026-11-20', '2026-11-19', '2026-11-18'])
    kvStore.set('script:production:hacker-news:2026-11-20', {
      displayDate: '2026-11-20',
      title: 'EP 20',
      introContent: 'Summary 20',
      blogContent: '# Full Blog 20',
      dialogue: [{ speaker: '女', text: 'Hi' }],
      stories: [{ id: '1', title: 'Story 1' }],
      generatedAt: 2000,
      audio: '2026/11/20/production/hacker-news-2026-11-20.mp3',
      audioDurationSec: 600,
    })
    kvStore.set('script:production:hacker-news:2026-11-19', {
      displayDate: '2026-11-19',
      title: 'EP 19',
      introContent: '',
      blogContent: '# Full Blog 19',
      dialogue: [{ speaker: '男', text: 'Fallback intro line' }],
      stories: [],
      generatedAt: 1000,
      audio: '2026/11/19/production/hacker-news-2026-11-19.mp3',
    })
    kvStore.set('script:production:hacker-news:2026-11-18', {
      displayDate: '2026-11-18',
      title: 'EP 18',
      introContent: 'Summary 18',
      blogContent: '# Full Blog 18',
      dialogue: [{ speaker: '女', text: 'Hey' }],
      stories: [],
      generatedAt: 500,
      audio: '2026/11/18/production/hacker-news-2026-11-18.mp3',
    })

    // Simulate Workflow writing an unseeded 1-entry catalog BEFORE full archive seeding
    kvStore.set(buildEpisodeCatalogKey('production', 'hacker-news'), {
      version: 1,
      entries: [{
        date: '2026-11-20',
        title: 'EP 20',
        introContent: 'Summary 20',
        audio: '2026/11/20/production/hacker-news-2026-11-20.mp3',
        updatedAt: 2000,
        variant: 'hacker-news',
        audioDurationSec: 600,
      }],
    })

    const env = {
      NEXTJS_ENV: 'production',
      HACKER_NEWS_KV: {
        get: async (key: string) => {
          kvGets.push(key)
          return kvStore.get(key) ?? null
        },
        put: async (key: string, value: string) => {
          kvPuts.push(key)
          kvStore.set(key, JSON.parse(value))
        },
        list: async () => ({ keys: [], list_complete: true }),
      } as unknown as KVNamespace,
    }

    // Unseeded partial catalog: must NOT hide history, writes 0 KV entries during GET, and reads <= 1 page
    const unseededPage = await getHomepageArticles(env, 99, 1, 'hacker-news')
    assert.equal(kvPuts.length, 0)
    assert.equal(unseededPage.totalPages, 3)
    assert.equal(unseededPage.currentPage, 3)
    assert.equal(unseededPage.posts[0].date, '2026-11-18')

    // Once Workflow/backfill marks catalog seeded=true, getHomepageArticles executes 1 KV read total (O(1))
    const seededIndex = ['2026-11-20', '2026-11-19', '2026-11-18'].reduce(
      (idx, day, pos) => upsertEpisodeCatalogEntry(idx, {
        date: day,
        title: `EP ${20 - pos}`,
        introContent: day === '2026-11-19' ? '男: Fallback intro line' : `Summary ${20 - pos}`,
        audio: `2026/11/${20 - pos}/production/hacker-news-${day}.mp3`,
        updatedAt: 3000 - pos,
        variant: 'hacker-news',
      }),
      parseEpisodeCatalogIndex(null),
    )
    kvStore.set(buildEpisodeCatalogKey('production', 'hacker-news'), { ...seededIndex, seeded: true })

    kvGets.length = 0
    const catalog = await getEpisodeCatalog(env, 'hacker-news')
    assert.equal(catalog.seeded, true)
    assert.equal(catalog.entries.length, 3)

    kvGets.length = 0
    const warmPage = await getHomepageArticles(env, 2, 1, 'hacker-news')
    assert.deepEqual(kvGets, ['catalog:production:hacker-news:episodes'])
    assert.equal(warmPage.posts[0].date, '2026-11-19')
    assert.equal(warmPage.posts[0].introContent, '男: Fallback intro line')
  })
})
