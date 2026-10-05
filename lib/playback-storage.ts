export interface AudioEpisode {
  date: string
  variant?: string
  title: string
  audioSrc: string
  updatedAt?: number
  duration?: number
}

export interface EpisodeProgressRecord {
  time: number
  duration: number
  updatedAt: number
}

export const SPEED_STORAGE_KEY = 'daily_podcast_speed'
export const LAST_EPISODE_STORAGE_KEY = 'daily_podcast_last_episode'
export const PLAYER_VISIBLE_STORAGE_KEY = 'daily_podcast_player_visible'

export function buildProgressStorageKey(date: string, variant?: string): string {
  const normalizedVariant = variant || 'hacker-news'
  return `daily_podcast_progress_${normalizedVariant}_${date}`
}

export function getEpisodeProgress(date: string, variant?: string): number {
  if (typeof window === 'undefined') {
    return 0
  }
  try {
    const key = buildProgressStorageKey(date, variant)
    const raw = localStorage.getItem(key)
    if (!raw) {
      return 0
    }
    const data = JSON.parse(raw) as Partial<EpisodeProgressRecord>
    const time = Number(data.time)
    const duration = Number(data.duration)
    if (!Number.isFinite(time) || time < 2) {
      return 0
    }
    // If the episode was within 5 seconds of the end or >= 98% completed, restart from beginning
    if (Number.isFinite(duration) && duration > 0 && (time >= duration - 5 || time / duration >= 0.98)) {
      return 0
    }
    return Math.floor(time)
  }
  catch {
    return 0
  }
}

export function saveEpisodeProgress(date: string, variant: string | undefined, time: number, duration?: number): void {
  if (typeof window === 'undefined') {
    return
  }
  try {
    const key = buildProgressStorageKey(date, variant)
    const record: EpisodeProgressRecord = {
      time: Math.floor(Math.max(0, time)),
      duration: duration && Number.isFinite(duration) && duration > 0 ? Math.floor(duration) : 0,
      updatedAt: Date.now(),
    }
    localStorage.setItem(key, JSON.stringify(record))
  }
  catch {
    // Ignore quota or private-browsing storage errors
  }
}

export function clearEpisodeProgress(date: string, variant?: string): void {
  if (typeof window === 'undefined') {
    return
  }
  try {
    const key = buildProgressStorageKey(date, variant)
    localStorage.removeItem(key)
  }
  catch {
    // Ignore
  }
}

export function saveLastEpisode(episode: AudioEpisode, isVisible = true): void {
  if (typeof window === 'undefined') {
    return
  }
  try {
    localStorage.setItem(LAST_EPISODE_STORAGE_KEY, JSON.stringify(episode))
    localStorage.setItem(PLAYER_VISIBLE_STORAGE_KEY, isVisible ? 'true' : 'false')
  }
  catch {
    // Ignore
  }
}

export function getLastEpisode(): { episode: AudioEpisode | null, isVisible: boolean } {
  if (typeof window === 'undefined') {
    return { episode: null, isVisible: false }
  }
  try {
    const raw = localStorage.getItem(LAST_EPISODE_STORAGE_KEY)
    const visibleRaw = localStorage.getItem(PLAYER_VISIBLE_STORAGE_KEY)
    if (!raw) {
      return { episode: null, isVisible: false }
    }
    const episode = JSON.parse(raw) as AudioEpisode
    if (!episode || !episode.date || !episode.audioSrc) {
      return { episode: null, isVisible: false }
    }
    return {
      episode,
      isVisible: visibleRaw !== 'false',
    }
  }
  catch {
    return { episode: null, isVisible: false }
  }
}

export const HISTORY_STORAGE_KEY = 'daily_podcast_listen_history'

export interface HistoryRecord {
  completed: boolean
  progress: number
  duration: number
  updatedAt: number
}

export type HistoryMap = Record<string, HistoryRecord>

export function getHistoryKey(date: string, variant?: string): string {
  const normalizedVariant = variant || 'hacker-news'
  return `${normalizedVariant}:${date}`
}

export function getListenHistoryMap(): HistoryMap {
  if (typeof window === 'undefined') {
    return {}
  }
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY)
    if (!raw) {
      return {}
    }
    return JSON.parse(raw) as HistoryMap
  }
  catch {
    return {}
  }
}

export function markEpisodeProgress(date: string, variant: string | undefined, time: number, duration?: number): void {
  saveEpisodeProgress(date, variant, time, duration)
  if (typeof window === 'undefined') {
    return
  }
  try {
    const map = getListenHistoryMap()
    const key = getHistoryKey(date, variant)
    const dur = duration && Number.isFinite(duration) && duration > 0 ? Math.floor(duration) : (map[key]?.duration || 0)
    const isCompleted = dur > 0 && (time >= dur - 5 || (dur > 30 && time / dur >= 0.98))
    map[key] = {
      completed: isCompleted || (map[key]?.completed ?? false),
      progress: Math.floor(Math.max(0, time)),
      duration: dur,
      updatedAt: Date.now(),
    }
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(map))
    window.dispatchEvent(new CustomEvent('podcast_history_updated', { detail: { key, record: map[key] } }))
  }
  catch {
    // Ignore storage quota errors
  }
}

export function markEpisodeCompleted(date: string, variant?: string, duration?: number): void {
  clearEpisodeProgress(date, variant)
  if (typeof window === 'undefined') {
    return
  }
  try {
    const map = getListenHistoryMap()
    const key = getHistoryKey(date, variant)
    const dur = duration && Number.isFinite(duration) && duration > 0 ? Math.floor(duration) : (map[key]?.duration || 0)
    map[key] = {
      completed: true,
      progress: 0,
      duration: dur,
      updatedAt: Date.now(),
    }
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(map))
    window.dispatchEvent(new CustomEvent('podcast_history_updated', { detail: { key, record: map[key] } }))
  }
  catch {
    // Ignore
  }
}

export function getEpisodeListenStatus(date: string, variant?: string): { status: 'unheard' | 'in_progress' | 'completed', progress: number, duration: number } {
  if (typeof window === 'undefined') {
    return { status: 'unheard', progress: 0, duration: 0 }
  }
  try {
    const map = getListenHistoryMap()
    const key = getHistoryKey(date, variant)
    const record = map[key]
    if (record) {
      if (record.completed) {
        return { status: 'completed', progress: record.progress, duration: record.duration }
      }
      if (record.progress >= 2) {
        return { status: 'in_progress', progress: record.progress, duration: record.duration }
      }
    }
    // Also check single progress key
    const singleProgress = getEpisodeProgress(date, variant)
    if (singleProgress >= 2) {
      return { status: 'in_progress', progress: singleProgress, duration: 0 }
    }
    return { status: 'unheard', progress: 0, duration: 0 }
  }
  catch {
    return { status: 'unheard', progress: 0, duration: 0 }
  }
}

export const VOLUME_STORAGE_KEY = 'daily_podcast_volume'
export const MUTED_STORAGE_KEY = 'daily_podcast_muted'

export function saveVolumePreference(volume: number, isMuted: boolean): void {
  if (typeof window === 'undefined') {
    return
  }
  try {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 1.0))
    localStorage.setItem(VOLUME_STORAGE_KEY, String(clamped))
    localStorage.setItem(MUTED_STORAGE_KEY, isMuted ? 'true' : 'false')
  }
  catch {
    // Ignore storage quota errors
  }
}

export function getVolumePreference(): { volume: number, isMuted: boolean } {
  if (typeof window === 'undefined') {
    return { volume: 1.0, isMuted: false }
  }
  try {
    const rawVolume = localStorage.getItem(VOLUME_STORAGE_KEY)
    const rawMuted = localStorage.getItem(MUTED_STORAGE_KEY)
    let volume = 1.0
    if (rawVolume !== null) {
      const parsed = Number(rawVolume)
      if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
        volume = parsed
      }
    }
    const isMuted = rawMuted === 'true'
    return { volume, isMuted }
  }
  catch {
    return { volume: 1.0, isMuted: false }
  }
}
