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
})
