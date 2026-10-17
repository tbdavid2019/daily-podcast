import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  calculateCueTimings,
  formatSrtTimestamp,
  formatVttTimestamp,
  generateSRT,
  generateWebVTT,
  getTranscriptPath,
  parseDialogueLines,
} from '../lib/transcript'

describe('podcast transcript and subtitles', () => {
  it('formats WebVTT and SRT timestamps with proper separators', () => {
    assert.equal(formatVttTimestamp(0), '00:00:00.000')
    assert.equal(formatVttTimestamp(65.123), '00:01:05.123')
    assert.equal(formatVttTimestamp(3665.456), '01:01:05.456')

    assert.equal(formatSrtTimestamp(0), '00:00:00,000')
    assert.equal(formatSrtTimestamp(65.123), '00:01:05,123')
    assert.equal(formatSrtTimestamp(3665.456), '01:01:05,456')
  })

  it('parses dialogue from structured array or colon-delimited text', () => {
    const rawDialogue = [
      { speaker: '女', text: '歡迎收聽！' },
      { speaker: '男', text: '大家早安。' },
    ]
    const parsedFromArray = parseDialogueLines(undefined, rawDialogue)
    assert.equal(parsedFromArray.length, 2)
    assert.equal(parsedFromArray[0].speaker, '女')
    assert.equal(parsedFromArray[0].text, '歡迎收聽！')
    assert.equal(parsedFromArray[1].speaker, '男')
    assert.equal(parsedFromArray[1].text, '大家早安。')

    const rawText = 'Cordelia: Hello everyone.\n\nDavid: Good morning.'
    const parsedFromText = parseDialogueLines(rawText)
    assert.equal(parsedFromText.length, 2)
    assert.equal(parsedFromText[0].speaker, 'Cordelia')
    assert.equal(parsedFromText[0].text, 'Hello everyone.')
    assert.equal(parsedFromText[1].speaker, 'David')
    assert.equal(parsedFromText[1].text, 'Good morning.')
  })

  it('calculates monotonic cue timings spanning the full duration', () => {
    const cues = [
      { id: 1, speaker: '女', text: '第一句話。' },
      { id: 2, speaker: '男', text: '第二句話更長一些，有很多詳細內容。' },
      { id: 3, speaker: '女', text: '第三句總結。' },
    ]
    const timed = calculateCueTimings(cues, 60)
    assert.equal(timed.length, 3)
    assert.equal(timed[0].start, 0)
    assert.ok(timed[0].end <= timed[1].start + 0.05)
    assert.ok(timed[1].end <= timed[2].start + 0.05)
    assert.equal(timed[2].end, 60)
    // Longer sentence gets longer time
    assert.ok(timed[1].duration > timed[0].duration)
  })

  it('generates valid WebVTT and SRT formats', () => {
    const cues = [
      { id: 1, speaker: '女', text: '歡迎收聽！', start: 0, end: 5.5, duration: 5.5 },
      { id: 2, speaker: '男', text: '大家早安。', start: 5.5, end: 12.0, duration: 6.5 },
    ]

    const vtt = generateWebVTT(cues, '科技日報')
    assert.match(vtt, /^WEBVTT/)
    assert.match(vtt, /00:00:00\.000 --> 00:00:05\.500/)
    assert.match(vtt, /<v 女>歡迎收聽！/)

    const srt = generateSRT(cues)
    assert.match(srt, /^1\n00:00:00,000 --> 00:00:05,500\n女: 歡迎收聽！/)
    assert.match(srt, /\n2\n00:00:05,500 --> 00:00:12,000\n男: 大家早安。/)
  })

  it('builds canonical transcript endpoint paths for default and named variants', () => {
    assert.equal(getTranscriptPath('2026-10-17', 'hacker-news', 'vtt'), '/post/2026-10-17/transcript.vtt')
    assert.equal(getTranscriptPath('2026-10-17', 'hacker-news', 'srt'), '/post/2026-10-17/transcript.srt')
    assert.equal(getTranscriptPath('2026-10-17', 'en', 'vtt'), '/post/2026-10-17/en/transcript.vtt')
    assert.equal(getTranscriptPath('2026-10-17', 'en', 'srt'), '/post/2026-10-17/en/transcript.srt')
  })
})
