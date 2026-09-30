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

