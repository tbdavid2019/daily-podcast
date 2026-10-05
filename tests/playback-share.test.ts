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

  it('copies timestamp URL directly to clipboard in article card', async () => {
    const source = await readFile(new URL('../components/article-card.tsx', import.meta.url), 'utf8')

    assert.match(source, /navigator\.clipboard\?\.writeText/)
    assert.match(source, /hasCopied/)
  })

  it('positions tabs list in the center of the control row and keeps play button icon-only on mobile', async () => {
    const source = await readFile(new URL('../components/article-card.tsx', import.meta.url), 'utf8')

    // TabsList sits in center of the single row
    assert.match(source, /flex-1\s+flex\s+justify-center/)
    // Play button hides text on mobile to avoid pushing tabs to second line
    assert.match(source, /<span className="hidden sm:inline">\{isCurrentEpisode \? dict\.resumeEpisode : dict\.playEpisode\}<\/span>/)
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

  it('renders official podcast cover artwork in global player without generic HN placeholder', async () => {
    const source = await readFile(new URL('../components/global-bottom-player.tsx', import.meta.url), 'utf8')
    assert.match(source, /podcast-cover-en\.png/)
    assert.match(source, /podcast-cover\.png/)
    assert.doesNotMatch(source, /\{\s*isEn \? 'EN' : 'HN'\s*\}/)
  })

  it('provides dedicated 10s rewind and forward icons without stroke obstruction', async () => {
    const source = await readFile(new URL('../components/global-bottom-player.tsx', import.meta.url), 'utf8')
    assert.match(source, /Rewind10Icon/)
    assert.match(source, /Forward10Icon/)
  })

  it('copies timestamped share URL directly to clipboard with visual feedback', async () => {
    const source = await readFile(new URL('../components/global-bottom-player.tsx', import.meta.url), 'utf8')
    assert.match(source, /navigator\.clipboard\?\.writeText/)
    assert.match(source, /hasCopied/)
  })

  it('configures distinct English podcast cover art for Apple Podcasts and RSS subscribers', async () => {
    const rssEnSource = await readFile(new URL('../app/rss-en.xml/route.ts', import.meta.url), 'utf8')
    assert.match(rssEnSource, /podcast-cover-en\.png/)

    const { stat } = await import('node:fs/promises')
    const fileStat = await stat(new URL('../public/podcast-cover-en.png', import.meta.url))
    assert.ok(fileStat.size > 10000, 'podcast-cover-en.png should exist with substantial size')
  })

  it('hides episode title and close button on mobile while keeping clickable artwork and core controls', async () => {
    const source = await readFile(new URL('../components/global-bottom-player.tsx', import.meta.url), 'utf8')
    // Title/date container is hidden on mobile, visible from sm up
    assert.match(source, /className="hidden sm:block min-w-0 flex-1"/)
    // Close button is hidden on mobile, visible from sm up
    assert.match(source, /className="hidden sm:inline-flex items-center/)
    // Artwork thumbnail is wrapped in link pointing to episode
    assert.match(source, /<Link\s+href=\{getArticlePath\(currentEpisode\.date,\s*currentEpisode\.variant\)\}\s+className="relative flex-shrink-0/)
  })
})


