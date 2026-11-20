import type { PodcastSpeakerProfile } from '../workflow/script-parser'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_PODCAST_CAST,
  normalizePodcastSpeaker,
  parsePodcastScriptResponse,
  parseStoryDossiers,
  parseStorySummaries,
  parseXmlPodcastScript,
  repairDialogueJson,
} from '../workflow/script-parser'

describe('podcast script XML harness & parser', () => {
  it('parses the primary XML <title>/<turn> protocol even with unescaped quotes, colons, and newlines', async () => {
    const xml = `
<title>[2026-11-19] NGINX HTTP/2 爆 "雙 RCE" 漏洞</title>
<turn speaker="女">歡迎收聽，今天聊 "CVE-2026-123633"：只要開 HTTP/2 就可能中標。</turn>
<turn speaker="男">對，程式碼裡 ngx_reusable_connection(c, 1) 沒移出佇列，
直接造成 Use-After-Free &amp; RCE。</turn>
`
    const result = await parsePodcastScriptResponse(xml, {
      minTurns: 2,
      requireMultipleSpeakers: true,
    })

    assert.equal(result.format, 'xml')
    assert.equal(result.title, '[2026-11-19] NGINX HTTP/2 爆 "雙 RCE" 漏洞')
    assert.deepEqual(result.speakers, ['女', '男'])
    assert.deepEqual(result.dialogue, [
      { speaker: '女', text: '歡迎收聽，今天聊 "CVE-2026-123633"：只要開 HTTP/2 就可能中標。' },
      { speaker: '男', text: '對，程式碼裡 ngx_reusable_connection(c, 1) 沒移出佇列， 直接造成 Use-After-Free & RCE。' },
    ])
  })

  it('handles wrapped <podcast-script>, markdown fences, and truncated trailing </turn>', async () => {
    const fencedTruncated = '```xml\n<podcast-script>\n<title>[2026-11-19] 測試</title>\n<turn speaker="Cordelia（女）">第一段完整發言。</turn>\n<turn speaker="David／男">第二段尾端未閉合'
    const parsed = await parsePodcastScriptResponse(fencedTruncated)

    assert.equal(parsed.format, 'xml')
    assert.equal(parsed.title, '[2026-11-19] 測試')
    assert.deepEqual(parsed.dialogue, [
      { speaker: '女', text: '第一段完整發言。' },
      { speaker: '男', text: '第二段尾端未閉合' },
    ])
    assert.ok(parseXmlPodcastScript(fencedTruncated))
  })

  it('supports extending the cast to 3+ hosts/guests via custom cast profiles or dynamic speakers', async () => {
    type ThreeHostId = '女' | '男' | '來賓'
    const threeHostCast: readonly PodcastSpeakerProfile<ThreeHostId>[] = [
      ...DEFAULT_PODCAST_CAST,
      {
        id: '來賓',
        name: 'Alex',
        aliases: ['來賓', 'guest', 'alex', '特別來賓'],
        voiceRole: 'custom',
        voiceId: 'Puck',
      },
    ]

    const xml = `
<title>[2026-11-19] 三人特別企劃</title>
<turn speaker="女">今天我們邀請到特別來賓 Alex！</turn>
<turn speaker="特別來賓 Alex" voice="Puck">大家好，很高興來到節目。</turn>
<turn speaker="男">馬上進入技術深水區。</turn>
`
    const parsed = await parsePodcastScriptResponse<ThreeHostId>(xml, {
      cast: threeHostCast,
      minTurns: 3,
      requireMultipleSpeakers: true,
    })

    assert.equal(parsed.format, 'xml')
    assert.deepEqual(parsed.speakers, ['女', '來賓', '男'])
    assert.deepEqual(parsed.dialogue.map(line => line.speaker), ['女', '來賓', '男'])

    // Dynamic speaker mode for ad-hoc guests without pre-registering aliases
    const adHoc = await parsePodcastScriptResponse<string>(
      '<turn speaker="女">歡迎 Linus。</turn><turn speaker="Linus">Hello everyone.</turn><turn speaker="Herman">Boundary test.</turn>',
      { allowDynamicSpeakers: true },
    )
    assert.deepEqual(adHoc.dialogue.map(line => line.speaker), ['女', 'Linus', 'Herman'])

    // Boundary-aware matching prevents "female" from colliding with "male" alias
    assert.equal(normalizePodcastSpeaker('Cordelia (female)'), '女')
    assert.equal(normalizePodcastSpeaker('Herman'), null)
  })

  it('enforces minTurns and multi-speaker quality gates so broken outputs trigger fallback', async () => {
    const monologue = '<turn speaker="女">第一句</turn><turn speaker="女">第二句</turn>'
    await assert.rejects(
      parsePodcastScriptResponse(monologue, { requireMultipleSpeakers: true }),
      /only 1 distinct speaker/,
    )

    await assert.rejects(
      parsePodcastScriptResponse('<turn speaker="女">一</turn><turn speaker="男">二</turn>', { minTurns: 4 }),
      /too short/,
    )
  })

  it('remains backward compatible with clean JSON, fenced JSON, dirty JSON, and plain speaker lines', async () => {
    const cleanJson = await parsePodcastScriptResponse(JSON.stringify({
      title: '[2026-11-19] JSON 相容測試',
      dialogue: [
        { speaker: 'Cordelia（女）', text: '歡迎收聽今天節目。' },
        { speaker: 'David／男', text: '我們來看看細節。' },
      ],
    }))
    assert.equal(cleanJson.format, 'json')
    assert.deepEqual(cleanJson.dialogue, [
      { speaker: '女', text: '歡迎收聽今天節目。' },
      { speaker: '男', text: '我們來看看細節。' },
    ])

    const dirtyJson = `{
  "title": "[2026-11-19] 焦點新聞",
  "dialogue": [
    {"speaker": "女", "text": "第一行
第二行"},
    {"speaker": "男", "text": "回應內容",},
  ]
}`
    const parsedDirty = await parsePodcastScriptResponse(dirtyJson)
    assert.equal(parsedDirty.format, 'json')
    assert.equal(parsedDirty.title, '[2026-11-19] 焦點新聞')

    const plain = [
      '日期：2026-11-19',
      '標題：[2026-11-19] 純文字修復',
      '**Cordelia（女）**：大家好。',
      'David：開始吧。',
    ].join('\n')
    const repaired = await repairDialogueJson({ text: plain })
    const parsedPlain = await parsePodcastScriptResponse(repaired)
    assert.equal(parsedPlain.title, '[2026-11-19] 純文字修復')
    assert.deepEqual(parsedPlain.dialogue, [
      { speaker: '女', text: '大家好。' },
      { speaker: '男', text: '開始吧。' },
    ])
  })

  it('rejects empty or unrecognized speakers under strict 2-host mode with diagnostic context', async () => {
    assert.equal(normalizePodcastSpeaker('Narrator'), null)
    await assert.rejects(parsePodcastScriptResponse('   '), /empty/)
    await assert.rejects(
      parsePodcastScriptResponse('<turn speaker="Narrator">Invalid speaker</turn>'),
      /invalid dialogue line at index 0 \(speaker="Narrator"/,
    )
  })

  it('extracts story summaries across XML attributes, truncated tails, headings, and title splits', () => {
    const xmlWithAttrs = `
<story-summary id="1">第一篇摘要內容</story-summary>
<story-summary id="2">第二篇摘要（尾端截斷`
    assert.deepEqual(parseStorySummaries(xmlWithAttrs, ['One', 'Two']), [
      '第一篇摘要內容',
      '第二篇摘要（尾端截斷',
    ])

    const byTitles = 'First Story Title\nDetail A\nSecond Story Title\nDetail B'
    assert.deepEqual(parseStorySummaries(byTitles, ['First Story Title', 'Second Story Title']), [
      'First Story Title\nDetail A',
      'Second Story Title\nDetail B',
    ])

    const byHeadings = '## Summary 1\nBody 1\n## Summary 2\nBody 2'
    assert.deepEqual(parseStorySummaries(byHeadings, ['Unmatched']), [
      '## Summary 1\nBody 1',
      '## Summary 2\nBody 2',
    ])

    assert.throws(() => parseStorySummaries('   \n  ', ['Title']), /empty/)
  })

  it('parses inline <intro> in XML podcast script and <story-dossier> blocks', async () => {
    const xmlWithIntro = `
<title>[2026-11-20] NGINX HTTP/2 與 SQLite</title>
<intro>今日聚焦 NGINX HTTP/2 安全修補與 SQLite 效能基準測試的實務取捨。</intro>
<turn speaker="女">歡迎收聽，今天聊 NGINX HTTP/2。</turn>
<turn speaker="男">我是 David，一起看細節。</turn>
`
    const parsed = await parsePodcastScriptResponse(xmlWithIntro, {
      minTurns: 2,
      requireMultipleSpeakers: true,
    })
    assert.equal(parsed.intro, '今日聚焦 NGINX HTTP/2 安全修補與 SQLite 效能基準測試的實務取捨。')

    const dossiers = parseStoryDossiers(
      `<story-dossier id="101">### NGINX\n- Core Mechanism: KeepAlive UAF</story-dossier>
       <story-dossier id="102">### SQLite\n- Core Mechanism: WAL lock</story-dossier>`,
      ['NGINX', 'SQLite'],
    )
    assert.deepEqual(dossiers, [
      '### NGINX\n- Core Mechanism: KeepAlive UAF',
      '### SQLite\n- Core Mechanism: WAL lock',
    ])
  })

  it('resolves speakers, formats display names, and computes deterministic badge classes from CastRegistry', async () => {
    const {
      DEFAULT_CAST_REGISTRY,
      formatSpeakerDisplayName,
      getSpeakerBadgeClass,
      resolveCastSpeaker,
    } = await import('../lib/cast-registry')

    assert.equal(DEFAULT_CAST_REGISTRY.length, 2)
    assert.equal(resolveCastSpeaker('Cordelia（女）'), '女')
    assert.equal(resolveCastSpeaker('David'), '男')
    assert.equal(formatSpeakerDisplayName('女', true), 'Cordelia')
    assert.equal(formatSpeakerDisplayName('Cordelia', false), '女')
    assert.equal(formatSpeakerDisplayName('來賓 Alex', false), '來賓 Alex')

    assert.match(getSpeakerBadgeClass('女'), /bg-rose-50/)
    assert.match(getSpeakerBadgeClass('David'), /bg-sky-50/)
    const guestClassA = getSpeakerBadgeClass('Alex')
    const guestClassB = getSpeakerBadgeClass('alex')
    assert.equal(guestClassA, guestClassB)
    assert.match(guestClassA, /bg-(?:amber|emerald)-50/)
  })
})
