'use client'

import type { AudioEpisode } from '@/lib/playback-storage'
import React, { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { applyPlaybackStart } from '@/lib/playback-share'
import {
  getEpisodeProgress,
  getLastEpisode,
  getVolumePreference,
  markEpisodeCompleted,
  markEpisodeProgress,
  saveLastEpisode,
  saveVolumePreference,
  SPEED_STORAGE_KEY,
} from '@/lib/playback-storage'

export type { AudioEpisode }

export const PLAYBACK_RATES = [0.5, 0.75, 0.9, 1.0, 1.25, 1.5, 2.0] as const
export type PlaybackRate = typeof PLAYBACK_RATES[number]

export interface AudioPlayerContextType {
  currentEpisode: AudioEpisode | null
  isPlaying: boolean
  playbackRate: PlaybackRate
  volume: number
  isMuted: boolean
  isLoading: boolean
  hasError: boolean
  isPlayerVisible: boolean
  playEpisode: (episode: AudioEpisode, startTime?: number) => Promise<void>
  togglePlayPause: () => void
  seek: (time: number) => void
  skip: (seconds: number) => void
  setPlaybackRate: (rate: PlaybackRate) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  closePlayer: () => void
  openPlayer: () => void
  updateCurrentEpisode: (episode: AudioEpisode) => void
  audioRef: React.RefObject<HTMLAudioElement | null>
  getCurrentTime: () => number
  getDuration: () => number
}

export interface AudioTimeContextType {
  currentTime: number
  duration: number
}

const AudioPlayerContext = createContext<AudioPlayerContextType | null>(null)
const AudioTimeContext = createContext<AudioTimeContextType>({ currentTime: 0, duration: 0 })

export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const [currentEpisode, setCurrentEpisode] = useState<AudioEpisode | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackRate, setPlaybackRateState] = useState<PlaybackRate>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(SPEED_STORAGE_KEY)
        if (saved) {
          const parsed = Number(saved)
          if (PLAYBACK_RATES.includes(parsed as PlaybackRate)) {
            return parsed as PlaybackRate
          }
        }
      }
      catch {
        // Ignore localStorage access failures during initial render
      }
    }
    return 1.0
  })
  const [isLoading, setIsLoading] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [isPlayerVisible, setIsPlayerVisible] = useState(false)
  const [volume, setVolumeState] = useState<number>(1.0)
  const [isMuted, setIsMutedState] = useState<boolean>(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const pendingSeekRef = useRef<number | null>(null)
  const lastSavedTimeRef = useRef<number>(0)
  const prevVolumeRef = useRef<number>(1.0)

  const playbackRateRef = useRef<PlaybackRate>(playbackRate)
  playbackRateRef.current = playbackRate

  // Restore last played episode, progress, and volume upon client mount
  useEffect(() => {
    try {
      const { volume: savedVol, isMuted: savedMuted } = getVolumePreference()
      setVolumeState(savedVol)
      setIsMutedState(savedMuted)
      if (savedVol > 0) {
        prevVolumeRef.current = savedVol
      }
      if (audioRef.current) {
        audioRef.current.volume = savedVol
        audioRef.current.muted = savedMuted
      }

      const { episode, isVisible } = getLastEpisode()
      if (episode) {
        const savedProgress = getEpisodeProgress(episode.date, episode.variant)
        setCurrentEpisode(episode)
        setIsPlayerVisible(isVisible)
        if (savedProgress > 0) {
          setCurrentTime(savedProgress)
          pendingSeekRef.current = savedProgress
        }
        if (episode.duration && episode.duration > 0) {
          setDuration(episode.duration)
        }
        if (audioRef.current) {
          audioRef.current.src = episode.audioSrc
          audioRef.current.playbackRate = playbackRateRef.current
        }
      }
    }
    catch {
      // Ignore storage read errors on initial mount
    }
  }, [])

  const setPlaybackRate = useCallback((rate: PlaybackRate) => {
    setPlaybackRateState(rate)
    playbackRateRef.current = rate
    if (audioRef.current) {
      try {
        audioRef.current.playbackRate = rate
        audioRef.current.defaultPlaybackRate = rate
      }
      catch (error) {
        console.warn('Failed to set audio playback rate:', error)
      }
    }
    try {
      localStorage.setItem(SPEED_STORAGE_KEY, String(rate))
    }
    catch {
      // Ignore localStorage write failures
    }
  }, [])

  const updateCurrentEpisode = useCallback((episode: AudioEpisode) => {
    setCurrentEpisode(episode)
    saveLastEpisode(episode, isPlayerVisible)
    if (audioRef.current && !isPlaying) {
      audioRef.current.src = episode.audioSrc
      audioRef.current.playbackRate = playbackRateRef.current
      setCurrentTime(0)
      setDuration(episode.duration || 0)
    }
  }, [isPlayerVisible, isPlaying])

  const seek = useCallback((time: number) => {
    const audio = audioRef.current
    if (!audio) {
      return
    }

    const maxDuration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duration
    const clamped = Math.max(0, Math.min(time, maxDuration || time))
    audio.currentTime = clamped
    setCurrentTime(clamped)
    if (currentEpisode) {
      markEpisodeProgress(currentEpisode.date, currentEpisode.variant, clamped, maxDuration)
    }
  }, [currentEpisode, duration])

  const skip = useCallback((seconds: number) => {
    const audio = audioRef.current
    const current = audio ? audio.currentTime : currentTime
    seek(current + seconds)
  }, [currentTime, seek])

  const playEpisode = useCallback(async (episode: AudioEpisode, startTime?: number) => {
    const audio = audioRef.current
    if (!audio) {
      return
    }

    setHasError(false)
    setIsPlayerVisible(true)
    saveLastEpisode(episode, true)

    let targetStart = startTime
    if (targetStart === undefined) {
      const saved = getEpisodeProgress(episode.date, episode.variant)
      if (saved > 0) {
        targetStart = saved
      }
    }

    const isDifferent = !currentEpisode || currentEpisode.audioSrc !== episode.audioSrc

    if (isDifferent) {
      setCurrentEpisode(episode)
      setCurrentTime(targetStart ?? 0)
      setDuration(0)
      setIsLoading(true)

      audio.src = episode.audioSrc
      audio.playbackRate = playbackRateRef.current
      audio.volume = volume
      audio.muted = isMuted

      if (targetStart !== undefined && targetStart > 0) {
        pendingSeekRef.current = targetStart
      }
      else {
        pendingSeekRef.current = null
      }

      try {
        await audio.play()
        setIsPlaying(true)
      }
      catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.warn('Audio play error:', error)
          setHasError(true)
        }
      }
    }
    else {
      if (targetStart !== undefined) {
        applyPlaybackStart(audio, targetStart)
        setCurrentTime(audio.currentTime)
      }

      try {
        await audio.play()
        setIsPlaying(true)
      }
      catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.warn('Audio play error:', error)
          setHasError(true)
        }
      }
    }
  }, [currentEpisode, isMuted, volume])

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !currentEpisode) {
      return
    }

    if (isPlaying) {
      audio.pause()
      markEpisodeProgress(currentEpisode.date, currentEpisode.variant, audio.currentTime, audio.duration || duration)
    }
    else {
      setIsPlayerVisible(true)
      saveLastEpisode(currentEpisode, true)
      audio.play().catch((error) => {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.warn('Audio toggle play error:', error)
        }
      })
    }
  }, [currentEpisode, duration, isPlaying])

  const closePlayer = useCallback(() => {
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause()
    }
    if (currentEpisode && audioRef.current) {
      markEpisodeProgress(currentEpisode.date, currentEpisode.variant, audioRef.current.currentTime, audioRef.current.duration || duration)
      saveLastEpisode(currentEpisode, false)
    }
    setIsPlaying(false)
    setIsPlayerVisible(false)
  }, [currentEpisode, duration])

  const openPlayer = useCallback(() => {
    if (currentEpisode) {
      setIsPlayerVisible(true)
      saveLastEpisode(currentEpisode, true)
    }
  }, [currentEpisode])

  const getCurrentTime = useCallback(() => {
    return audioRef.current?.currentTime ?? 0
  }, [])

  const getDuration = useCallback(() => {
    return audioRef.current?.duration ?? 0
  }, [])

  // Setup media session metadata
  useEffect(() => {
    if (typeof window === 'undefined' || !('mediaSession' in navigator) || !currentEpisode) {
      return
    }

    const isEn = currentEpisode.variant === 'en'
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentEpisode.title,
      artist: isEn ? 'DAVID888 Daily Tech' : 'DAVID888 Daily 每日放送',
      album: currentEpisode.date,
      artwork: [
        {
          src: isEn ? '/podcast-cover-en.png' : '/podcast-cover.png',
          sizes: '512x512',
          type: 'image/png',
        },
        {
          src: isEn ? '/podcast-cover-en.png' : '/icon.png',
          sizes: '192x192',
          type: 'image/png',
        },
      ],
    })

    navigator.mediaSession.setActionHandler('play', () => {
      audioRef.current?.play().catch(() => {})
    })
    navigator.mediaSession.setActionHandler('pause', () => {
      audioRef.current?.pause()
    })
    navigator.mediaSession.setActionHandler('seekbackward', () => {
      skip(-10)
    })
    navigator.mediaSession.setActionHandler('seekforward', () => {
      skip(10)
    })
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined) {
        seek(details.seekTime)
      }
    })
  }, [currentEpisode, seek, skip])

  const handleLoadedMetadata = () => {
    const audio = audioRef.current
    if (!audio) {
      return
    }

    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      setDuration(audio.duration)
      if (currentEpisode) {
        markEpisodeProgress(currentEpisode.date, currentEpisode.variant, audio.currentTime, audio.duration)
      }
    }
    audio.playbackRate = playbackRateRef.current

    if (pendingSeekRef.current !== null) {
      applyPlaybackStart(audio, pendingSeekRef.current)
      setCurrentTime(audio.currentTime)
      pendingSeekRef.current = null
    }
  }

  const handleTimeUpdate = () => {
    const audio = audioRef.current
    if (!audio) {
      return
    }
    setCurrentTime(audio.currentTime)
    if (currentEpisode && Math.abs(audio.currentTime - lastSavedTimeRef.current) >= 1) {
      lastSavedTimeRef.current = audio.currentTime
      markEpisodeProgress(currentEpisode.date, currentEpisode.variant, audio.currentTime, audio.duration || duration)
    }
  }

  const handleDurationChange = () => {
    const audio = audioRef.current
    if (!audio) {
      return
    }
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      setDuration(audio.duration)
    }
  }

  const handleAudioError = () => {
    setIsLoading(false)
    setHasError(true)
    setIsPlaying(false)
  }

  const setVolume = useCallback((newVolume: number) => {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(newVolume) ? newVolume : 1.0))
    setVolumeState(clamped)
    if (clamped > 0) {
      prevVolumeRef.current = clamped
      if (isMuted) {
        setIsMutedState(false)
        if (audioRef.current) {
          audioRef.current.muted = false
          audioRef.current.volume = clamped
        }
        saveVolumePreference(clamped, false)
        return
      }
    }
    else {
      setIsMutedState(true)
      if (audioRef.current) {
        audioRef.current.muted = true
        audioRef.current.volume = 0
      }
      saveVolumePreference(0, true)
      return
    }

    if (audioRef.current) {
      audioRef.current.volume = clamped
    }
    saveVolumePreference(clamped, isMuted)
  }, [isMuted])

  const toggleMute = useCallback(() => {
    setIsMutedState((prevMuted) => {
      const nextMuted = !prevMuted
      if (audioRef.current) {
        audioRef.current.muted = nextMuted
      }
      if (!nextMuted) {
        if (volume === 0) {
          const restored = prevVolumeRef.current > 0 ? prevVolumeRef.current : 1.0
          setVolumeState(restored)
          if (audioRef.current) {
            audioRef.current.volume = restored
          }
          saveVolumePreference(restored, false)
          return false
        }
      }
      saveVolumePreference(volume, nextMuted)
      return nextMuted
    })
  }, [volume])

  const handleVolumeChange = () => {
    const audio = audioRef.current
    if (!audio) {
      return
    }
    setVolumeState(audio.volume)
    setIsMutedState(audio.muted)
    saveVolumePreference(audio.volume, audio.muted)
  }

  const playerContextValue = useMemo<AudioPlayerContextType>(() => ({
    currentEpisode,
    isPlaying,
    playbackRate,
    volume,
    isMuted,
    isLoading,
    hasError,
    isPlayerVisible,
    playEpisode,
    togglePlayPause,
    seek,
    skip,
    setPlaybackRate,
    setVolume,
    toggleMute,
    closePlayer,
    openPlayer,
    updateCurrentEpisode,
    audioRef,
    getCurrentTime,
    getDuration,
  }), [
    currentEpisode,
    isPlaying,
    playbackRate,
    volume,
    isMuted,
    isLoading,
    hasError,
    isPlayerVisible,
    playEpisode,
    togglePlayPause,
    seek,
    skip,
    setPlaybackRate,
    setVolume,
    toggleMute,
    closePlayer,
    openPlayer,
    updateCurrentEpisode,
    getCurrentTime,
    getDuration,
  ])

  const timeContextValue = useMemo<AudioTimeContextType>(() => ({
    currentTime,
    duration,
  }), [currentTime, duration])

  return (
    <AudioPlayerContext value={playerContextValue}>
      <AudioTimeContext value={timeContextValue}>
        {children}
        <audio
          ref={audioRef}
          preload="metadata"
          playsInline
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={handleTimeUpdate}
          onDurationChange={handleDurationChange}
          onLoadedMetadata={handleLoadedMetadata}
          onVolumeChange={handleVolumeChange}
          onWaiting={() => setIsLoading(true)}
          onPlaying={() => setIsLoading(false)}
          onCanPlay={() => setIsLoading(false)}
          onEnded={() => {
            setIsPlaying(false)
            if (currentEpisode) {
              markEpisodeCompleted(currentEpisode.date, currentEpisode.variant, audioRef.current?.duration || duration)
            }
          }}
          onError={handleAudioError}
        />
      </AudioTimeContext>
    </AudioPlayerContext>
  )
}

export function useAudioPlayer() {
  const context = use(AudioPlayerContext)
  if (!context) {
    throw new Error('useAudioPlayer must be used within an AudioPlayerProvider')
  }
  return context
}

export function useAudioTime() {
  return use(AudioTimeContext)
}
