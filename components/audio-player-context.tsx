'use client'

import React, { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { applyPlaybackStart } from '@/lib/playback-share'

export interface AudioEpisode {
  date: string
  variant?: string
  title: string
  audioSrc: string
  updatedAt?: number
  duration?: number
}

export const PLAYBACK_RATES = [0.5, 0.75, 0.9, 1.0, 1.25, 1.5, 2.0] as const
export type PlaybackRate = typeof PLAYBACK_RATES[number]

export interface AudioPlayerContextType {
  currentEpisode: AudioEpisode | null
  isPlaying: boolean
  playbackRate: PlaybackRate
  isLoading: boolean
  hasError: boolean
  isPlayerVisible: boolean
  playEpisode: (episode: AudioEpisode, startTime?: number) => Promise<void>
  togglePlayPause: () => void
  seek: (time: number) => void
  skip: (seconds: number) => void
  setPlaybackRate: (rate: PlaybackRate) => void
  closePlayer: () => void
  openPlayer: () => void
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

const SPEED_STORAGE_KEY = 'daily_podcast_speed'

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

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const pendingSeekRef = useRef<number | null>(null)

  const setPlaybackRate = useCallback((rate: PlaybackRate) => {
    setPlaybackRateState(rate)
    if (audioRef.current) {
      audioRef.current.playbackRate = rate
    }
    try {
      localStorage.setItem(SPEED_STORAGE_KEY, String(rate))
    }
    catch {
      // Ignore localStorage write failures
    }
  }, [])

  const seek = useCallback((time: number) => {
    const audio = audioRef.current
    if (!audio) {
      return
    }

    const maxDuration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duration
    const clamped = Math.max(0, Math.min(time, maxDuration || time))
    audio.currentTime = clamped
    setCurrentTime(clamped)
  }, [duration])

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

    const isDifferent = !currentEpisode || currentEpisode.audioSrc !== episode.audioSrc

    if (isDifferent) {
      setCurrentEpisode(episode)
      setCurrentTime(0)
      setDuration(0)
      setIsLoading(true)

      audio.src = episode.audioSrc
      audio.playbackRate = playbackRate

      if (startTime !== undefined && startTime > 0) {
        pendingSeekRef.current = startTime
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
      if (startTime !== undefined) {
        applyPlaybackStart(audio, startTime)
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
  }, [currentEpisode, playbackRate])

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current
    if (!audio || !currentEpisode) {
      return
    }

    if (isPlaying) {
      audio.pause()
    }
    else {
      setIsPlayerVisible(true)
      audio.play().catch((error) => {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.warn('Audio toggle play error:', error)
        }
      })
    }
  }, [currentEpisode, isPlaying])

  const closePlayer = useCallback(() => {
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause()
    }
    setIsPlaying(false)
    setIsPlayerVisible(false)
  }, [])

  const openPlayer = useCallback(() => {
    if (currentEpisode) {
      setIsPlayerVisible(true)
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
        { src: '/icon.png', sizes: '512x512', type: 'image/png' },
        { src: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
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
    }
    audio.playbackRate = playbackRate

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

  const playerContextValue = useMemo<AudioPlayerContextType>(() => ({
    currentEpisode,
    isPlaying,
    playbackRate,
    isLoading,
    hasError,
    isPlayerVisible,
    playEpisode,
    togglePlayPause,
    seek,
    skip,
    setPlaybackRate,
    closePlayer,
    openPlayer,
    audioRef,
    getCurrentTime,
    getDuration,
  }), [
    currentEpisode,
    isPlaying,
    playbackRate,
    isLoading,
    hasError,
    isPlayerVisible,
    playEpisode,
    togglePlayPause,
    seek,
    skip,
    setPlaybackRate,
    closePlayer,
    openPlayer,
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
          onWaiting={() => setIsLoading(true)}
          onPlaying={() => setIsLoading(false)}
          onCanPlay={() => setIsLoading(false)}
          onEnded={() => setIsPlaying(false)}
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
