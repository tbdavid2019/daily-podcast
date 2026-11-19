import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { normalizePodcastSpeaker, parsePodcastScriptResponse, repairDialogueJson } from '../workflow/script-parser'

describe('podcast script response parser', () => {
  it('parses clean JSON responses and normalizes speaker labels including parenthetical variants', async () => {
    const result = await parsePodcastScriptResponse(JSON.stringify({
      title: '[2026-11-19] NGINX HTTP/2 雙漏洞',
      dialogue: [
        { speaker: 'Cordelia（女）', text: '歡迎收聽今天節目。' },
        { speaker: 'David／男', text: '我們來看看細節。' },
        { speaker: '女主持人', text: '補充一個重點。' },
        { speaker: '男聲', text: '沒問題。' },
      ],
    }))

    assert.equal(result.title, '[2026-11-19] NGINX HTTP/2 雙漏洞')
    assert.deepEqual(result.dialogue, [
      { speaker: '女', text: '歡迎收聽今天節目。' },
      { speaker: '男', text: '我們來看看細節。' },
      { speaker: '女', text: '補充一個重點。' },
      { speaker: '男', text: '沒問題。' },
    ])
  })

  it('extracts JSON wrapped in markdown fences, top-level arrays, or surrounding prose', async () => {
    const fenced = 'Here is the JSON:\n```json\n{"title": null, "dialogue": [{"speaker": "女", "text": "開場白"}]}\n```\nDone.'
    const parsed = await parsePodcastScriptResponse(fenced)
    assert.equal(parsed.title, undefined)
    assert.deepEqual(parsed.dialogue, [{ speaker: '女', text: '開場白' }])

    const prose = 'Sure!\n{"title": "Test Title", "dialogue": [{"speaker": "男", "text": "Hello"}]}\nThanks.'
    const parsedProse = await parsePodcastScriptResponse(prose, true)
    assert.equal(parsedProse.title, 'Test Title')
    assert.deepEqual(parsedProse.dialogue, [{ speaker: '男', text: 'Hello' }])

    const arrayOnly = '[{"speaker": "Cordelia", "text": "Opening"}, {"speaker": "David", "text": "Follow up"}]'
    const parsedArray = await parsePodcastScriptResponse(arrayOnly, true)
    assert.deepEqual(parsedArray.dialogue, [
      { speaker: '女', text: 'Opening' },
      { speaker: '男', text: 'Follow up' },
    ])
  })

  it('repairs JSON with literal newlines, trailing commas, or truncated tails without misreading "title" as a speaker', async () => {
    const dirtyJson = `{
  "title": "[2026-11-19] 焦點新聞",
  "dialogue": [
    {"speaker": "女", "text": "第一行
第二行"},
    {"speaker": "男", "text": "回應內容",},
  ]
}`
    const parsedDirty = await parsePodcastScriptResponse(dirtyJson)
    assert.equal(parsedDirty.title, '[2026-11-19] 焦點新聞')
    assert.deepEqual(parsedDirty.dialogue, [
      { speaker: '女', text: '第一行 第二行' },
      { speaker: '男', text: '回應內容' },
    ])

    const truncatedJson = `{
  "title": "[2026-11-19] 截斷測試",
  "dialogue": [
    {"speaker": "女", "text": "正常的第一段"},
    {"speaker": "男", "text": "正常的第二段"},
    {"speaker": "女", "text": "被截斷的第三段`
    const parsedTruncated = await parsePodcastScriptResponse(truncatedJson)
    assert.equal(parsedTruncated.title, '[2026-11-19] 截斷測試')
    assert.deepEqual(parsedTruncated.dialogue, [
      { speaker: '女', text: '正常的第一段' },
      { speaker: '男', text: '正常的第二段' },
    ])
  })

  it('repairs speaker-prefixed dialogue text while skipping metadata/header lines', async () => {
    const plain = [
      '日期：2026-11-19',
      '標題：[2026-11-19] 焦點新聞',
      '【開場】：以下開始',
      '**Cordelia（女）**：大家好，今天有很多技術新聞。',
      'David：沒錯，先看第一個故事。',
    ].join('\n')

    const repaired = await repairDialogueJson({ text: plain })
    const parsed = await parsePodcastScriptResponse(repaired)
    assert.equal(parsed.title, '[2026-11-19] 焦點新聞')
    assert.deepEqual(parsed.dialogue, [
      { speaker: '女', text: '大家好，今天有很多技術新聞。' },
      { speaker: '男', text: '沒錯，先看第一個故事。' },
    ])
  })

  it('rejects empty, invalid speaker, or empty dialogue responses with diagnostic speaker context', async () => {
    assert.equal(normalizePodcastSpeaker('Narrator'), null)
    await assert.rejects(parsePodcastScriptResponse('   '), /empty/)
    await assert.rejects(
      parsePodcastScriptResponse(JSON.stringify({ dialogue: [] })),
    )
    await assert.rejects(
      parsePodcastScriptResponse(JSON.stringify({
        dialogue: [{ speaker: 'Narrator', text: 'Invalid speaker' }],
      })),
      /invalid dialogue line at index 0 \(speaker="Narrator"/,
    )
  })
})
