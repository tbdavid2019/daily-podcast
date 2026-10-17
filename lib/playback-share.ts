const PLAYBACK_START_PARAMETER = 't'

interface PlaybackMedia {
  currentTime: number
  duration: number
}

function normalizePlaybackSecond(currentTime: number) {
  if (!Number.isFinite(currentTime) || currentTime < 0) {
    return 0
  }

  return Math.floor(currentTime)
}

export type ArticleTab = 'summary' | 'podcast' | 'references'

export const VALID_ARTICLE_TABS: readonly ArticleTab[] = ['summary', 'podcast', 'references'] as const

export function isValidArticleTab(value: unknown): value is ArticleTab {
  return typeof value === 'string' && (VALID_ARTICLE_TABS as readonly string[]).includes(value)
}

export function getArticlePath(date: string, variant?: string, tab?: ArticleTab) {
  const episodePath = `/post/${encodeURIComponent(date)}`
  const hasVariant = variant && variant !== 'hacker-news'
  const isDefaultTab = !tab || tab === 'summary'

  if (hasVariant) {
    return isDefaultTab
      ? `${episodePath}/${encodeURIComponent(variant)}`
      : `${episodePath}/${encodeURIComponent(variant)}/${encodeURIComponent(tab)}`
  }

  return isDefaultTab
    ? episodePath
    : `${episodePath}/${encodeURIComponent(tab)}`
}

export function isEpisodePath(pathname: string, date: string, variant?: string): boolean {
  const normalizedPath = pathname.replace(/\/+$/, '')
  const hasVariant = variant && variant !== 'hacker-news'
  const basePath = `/post/${encodeURIComponent(date)}`

  if (hasVariant) {
    const variantBase = `${basePath}/${encodeURIComponent(variant)}`
    if (normalizedPath === variantBase) {
      return true
    }
    return VALID_ARTICLE_TABS.some(t => normalizedPath === `${variantBase}/${t}`)
  }

  if (normalizedPath === basePath) {
    return true
  }
  return VALID_ARTICLE_TABS.some(t => normalizedPath === `${basePath}/${t}`)
}

export function getTabFromPath(pathname: string): ArticleTab | null {
  const segments = pathname.replace(/\/+$/, '').split('/')
  const lastSegment = segments[segments.length - 1]
  if (isValidArticleTab(lastSegment)) {
    return lastSegment
  }
  return null
}

export function parseTabFromUrl(urlLike: { pathname?: string, search?: string, hash?: string }): ArticleTab | null {
  if (urlLike.pathname) {
    const fromPath = getTabFromPath(urlLike.pathname)
    if (fromPath) {
      return fromPath
    }
  }

  if (urlLike.search) {
    const params = new URLSearchParams(urlLike.search)
    const tabParam = params.get('tab')
    if (isValidArticleTab(tabParam)) {
      return tabParam
    }
  }

  if (urlLike.hash) {
    const cleanHash = urlLike.hash.replace(/^#/, '')
    if (isValidArticleTab(cleanHash)) {
      return cleanHash
    }
    const hashParams = new URLSearchParams(cleanHash)
    const tabParam = hashParams.get('tab')
    if (isValidArticleTab(tabParam)) {
      return tabParam
    }
    const firstPart = cleanHash.split(/[?&=]/)[0]
    if (isValidArticleTab(firstPart)) {
      return firstPart
    }
  }

  return null
}

export function buildPlaybackShareUrl(
  origin: string,
  date: string,
  variant: string | undefined,
  currentTime: number,
  tab?: ArticleTab,
) {
  const url = new URL(getArticlePath(date, variant, tab), origin)
  url.hash = `${PLAYBACK_START_PARAMETER}=${normalizePlaybackSecond(currentTime)}`
  return url.toString()
}

export function parsePlaybackStart(value: string | null) {
  if (!value || !/^\d+$/.test(value)) {
    return null
  }

  const start = Number(value)
  return Number.isSafeInteger(start) ? start : null
}

export function getPlaybackStartFromHash(hash: string) {
  return parsePlaybackStart(new URLSearchParams(hash.replace(/^#/, '')).get(PLAYBACK_START_PARAMETER))
}

export function applyPlaybackStart(media: PlaybackMedia, start: number) {
  media.currentTime = Number.isFinite(media.duration)
    ? Math.min(start, Math.max(0, media.duration))
    : start
}

export function formatPlaybackTimestamp(currentTime: number) {
  const totalSeconds = normalizePlaybackSecond(currentTime)
  const seconds = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const minutes = totalMinutes % 60
  const hours = Math.floor(totalMinutes / 60)
  const paddedSeconds = String(seconds).padStart(2, '0')

  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${paddedSeconds}`
    : `${minutes}:${paddedSeconds}`
}
