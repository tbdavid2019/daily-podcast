import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parsePodcastScriptResponse, repairDialogueJson } from '../workflow/script-parser'

describe('podcast script response parser', () => {
  it('parses clean JSON responses and normalizes speaker labels', async () => {
    const result = await parsePodcastScriptResponse(JSON.stringify({
      title: '[2026-11-18] GPT-6.2 Astra、Java4Shell 漏洞',
      dialogue: [
        { speaker: 'Cordelia', text: '歡迎收聽今天節目。' },
        { speaker: 'David', text: '我們來看看細節。' },
      ],
    }))

    assert.equal(result.title, '[2026-11-18] GPT-6.2 Astra、Java4Shell 漏洞')
    assert.deepEqual(result.dialogue, [
      { speaker: '女', text: '歡迎收聽今天節目。' },
      { speaker: '男', text: '我們來看看細節。' },
    ])
  })

  it('extracts JSON wrapped in markdown fences or surrounding prose', async () => {
    const fenced = 'Here is the JSON:\n```json\n{"title": null, "dialogue": [{"speaker": "女", "text": "開場白"}]}\n```\nDone.'
    const parsed = await parsePodcastScriptResponse(fenced)
    assert.equal(parsed.title, undefined)
    assert.deepEqual(parsed.dialogue, [{ speaker: '女', text: '開場白' }])

    const prose = 'Sure!\n{"title": "Test Title", "dialogue": [{"speaker": "男", "text": "Hello"}]}\nThanks.'
    const parsedProse = await parsePodcastScriptResponse(prose, true)
    assert.equal(parsedProse.title, 'Test Title')
    assert.deepEqual(parsedProse.dialogue, [{ speaker: '男', text: 'Hello' }])
  })

  it('repairs speaker-prefixed dialogue text when JSON is omitted', async () => {
    const plain = [
      '標題：[2026-11-18] 焦點新聞',
      '**Cordelia**：大家好，今天有很多技術新聞。',
      'David：沒錯，先看第一個故事。',
    ].join('\n')

    const repaired = await repairDialogueJson({ text: plain })
    const parsed = await parsePodcastScriptResponse(repaired)
    assert.equal(parsed.title, '[2026-11-18] 焦點新聞')
    assert.deepEqual(parsed.dialogue, [
      { speaker: '女', text: '大家好，今天有很多技術新聞。' },
      { speaker: '男', text: '沒錯，先看第一個故事。' },
    ])
  })

  it('rejects empty, invalid speaker, or empty dialogue responses so fallback can run', async () => {
    await assert.rejects(parsePodcastScriptResponse('   '), /empty/)
    await assert.rejects(
      parsePodcastScriptResponse(JSON.stringify({ dialogue: [] })),
    )
    await assert.rejects(
      parsePodcastScriptResponse(JSON.stringify({
        dialogue: [{ speaker: 'Narrator', text: 'Invalid speaker' }],
      })),
      /invalid dialogue line/,
    )
  })
})
