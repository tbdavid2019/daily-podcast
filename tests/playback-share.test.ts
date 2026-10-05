import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import {
  applyPlaybackStart,
  buildPlaybackShareUrl,
  formatPlaybackTimestamp,
  getArticlePath,
  getPlaybackStartFromHash,
  parsePlaybackStart,
} from '../lib/playback-share'

describe('timestamped playback sharing', () => {
  it('builds a canonical episode link at the current whole-second position', () => {
    assert.equal(
      buildPlaybackShareUrl('https://podcast.example', '2026-07-31', 'hacker-news', 379.8),
      'https://podcast.example/post/2026-07-31#t=379',
    )
  })

  it('keeps a non-default variant in the shared episode path', () => {
    assert.equal(getArticlePath('2026-07-31', 'product-hunt'), '/post/2026-07-31/product-hunt')
  })

  it('accepts only non-negative whole-second start values', () => {
    assert.equal(parsePlaybackStart('379'), 379)
    assert.equal(parsePlaybackStart('0'), 0)
    assert.equal(parsePlaybackStart('-1'), null)
    assert.equal(parsePlaybackStart('6:19'), null)
    assert.equal(parsePlaybackStart('1.5'), null)
  })

  it('reads a playback start from a URL hash without creating a server cache key', () => {
    assert.equal(getPlaybackStartFromHash('#t=379'), 379)
    assert.equal(getPlaybackStartFromHash('#section=summary'), null)
  })

  it('applies a shared start after audio metadata becomes available', () => {
    const audio = { currentTime: 0, duration: 300 }

    applyPlaybackStart(audio, 379)

    assert.equal(audio.currentTime, 300)
  })

  it('formats the shared position for people', () => {
    assert.equal(formatPlaybackTimestamp(379.8), '6:19')
    assert.equal(formatPlaybackTimestamp(3_845), '1:04:05')
  })

  it('shares only the timestamp URL without a separate description', async () => {
    const source = await readFile(new URL('../components/article-card.tsx', import.meta.url), 'utf8')

    assert.match(source, /navigator\.share\(\{ url \}\)/)
  })

  it('does not enforce crossOrigin on media element for mobile compatibility', async () => {
    const source = await readFile(new URL('../components/article-card.tsx', import.meta.url), 'utf8')

    assert.doesNotMatch(source, /crossOrigin=/)
  })
})

describe('mapScriptToArticle speaker mapping', () => {
  it('maps Chinese speaker labels to Cordelia and David for English variant', async () => {
    const { mapScriptToArticle } = await import('../lib/utils')
    const article = mapScriptToArticle({
      displayDate: '2026-09-30',
      title: 'English Episode',
      dialogue: [
        { speaker: '女', text: 'Welcome to the show.' },
        { speaker: '男', text: 'Thanks Cordelia.' },
      ],
    }, 'production', 'en')

    assert.equal(article.podcastContent, 'Cordelia: Welcome to the show.\n\nDavid: Thanks Cordelia.')
  })

  it('preserves or normalizes Chinese speaker labels for default variant', async () => {
    const { mapScriptToArticle } = await import('../lib/utils')
    const article = mapScriptToArticle({
      displayDate: '2026-09-30',
      title: '中文節目',
      dialogue: [
        { speaker: 'Cordelia', text: '歡迎收聽。' },
        { speaker: 'David', text: '大家早安。' },
      ],
    }, 'production', 'hacker-news')

    assert.equal(article.podcastContent, '女: 歡迎收聽。\n\n男: 大家早安。')
  })
})

describe('playback rate presets and global player', () => {
  it('includes 0.5x, 0.75x, and 0.9x listening practice speeds alongside standard rates', async () => {
    const { PLAYBACK_RATES } = await import('../components/audio-player-context')
    assert.deepEqual(Array.from(PLAYBACK_RATES), [0.5, 0.75, 0.9, 1.0, 1.25, 1.5, 2.0])
  })

  it('provides dedicated slower speeds for English listening practice', async () => {
    const { PLAYBACK_RATES } = await import('../components/audio-player-context')
    const slowerPracticeRates = PLAYBACK_RATES.filter(r => r < 1.0)
    assert.deepEqual(slowerPracticeRates, [0.5, 0.75, 0.9])
  })

  it('keeps global player free of crossOrigin restrictions for audio elements', async () => {
    const source = await readFile(new URL('../components/audio-player-context.tsx', import.meta.url), 'utf8')
    assert.doesNotMatch(source, /crossOrigin=/)
  })

  it('reopens player from article card when toggling play for an existing episode', async () => {
    const source = await readFile(new URL('../components/article-card.tsx', import.meta.url), 'utf8')
    assert.match(source, /openPlayer\(\)/)
  })

  it('seeks to shared timestamp when active episode toggles play or hash changes', async () => {
    const source = await readFile(new URL('../components/article-card.tsx', import.meta.url), 'utf8')
    assert.match(source, /hashchange/)
    assert.match(source, /seek\(start\)/)
  })
})


