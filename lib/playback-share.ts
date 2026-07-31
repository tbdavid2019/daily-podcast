const PLAYBACK_START_PARAMETER = 't'

function normalizePlaybackSecond(currentTime: number) {
  if (!Number.isFinite(currentTime) || currentTime < 0) {
    return 0
  }

  return Math.floor(currentTime)
}

export function getArticlePath(date: string, variant?: string) {
  const episodePath = `/post/${encodeURIComponent(date)}`
  return variant && variant !== 'hacker-news'
    ? `${episodePath}/${encodeURIComponent(variant)}`
    : episodePath
}

export function buildPlaybackShareUrl(origin: string, date: string, variant: string | undefined, currentTime: number) {
  const url = new URL(getArticlePath(date, variant), origin)
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
