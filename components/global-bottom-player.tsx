'use client'

import * as SliderPrimitive from '@radix-ui/react-slider'
import {
  Check,
  ChevronUp,
  Headphones,
  Pause,
  Play,
  Share2,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import React, { useEffect, useRef, useState } from 'react'
import { useAudioPlayer, useAudioTime } from '@/components/audio-player-context'
import { Slider } from '@/components/ui/slider'
import { dictionaries } from '@/lib/i18n'
import { buildPlaybackShareUrl, formatPlaybackTimestamp, getArticlePath } from '@/lib/playback-share'
import { cn } from '@/lib/utils'

function Rewind10Icon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M11.99 5V1l-5 5 5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6h-2c0 4.42 3.58 8 8 8s8-3.58 8-8S16.41 5 11.99 5z" />
      <path d="M10.89 16h-.85v-3.26l-1.01.31v-.69l1.77-.63h.09V16z" />
      <path d="M15.17 14.24c0 .32-.03.6-.1.82s-.17.42-.29.57-.28.26-.45.33-.37.1-.59.1-.41-.03-.59-.1-.33-.18-.46-.33-.23-.34-.3-.57-.11-.5-.11-.82v-.74c0-.32.03-.6.1-.82s.17-.42.29-.57.28-.26.45-.33.37-.1.59-.1.41.03.59.1c.18.07.33.18.46.33s.23.34.3.57.11.5.11.82v.74zm-.85-.86c0-.19-.01-.35-.04-.48s-.07-.23-.12-.31-.11-.14-.19-.17-.16-.05-.25-.05-.18.02-.25.05-.14.09-.19.17-.09.18-.12.31-.04.29-.04.48v.97c0 .19.01.35.04.48s.07.24.12.32.11.14.19.17.16.05.25.05.18-.02.25-.05.14-.09.19-.17.09-.19.11-.32.04-.29.04-.48v-.97z" />
    </svg>
  )
}

function Forward10Icon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M18 13c0 3.31-2.69 6-6 6s-6-2.69-6-6 2.69-6 6-6v4l5-5-5-5v4c-4.42 0-8 3.58-8 8 0 4.42 3.58 8 8 8s8-3.58 8-8h-2z" />
      <path d="M10.86 15.94v-4.27h-.09L9 12.3v.69l1.01-.31v3.26h.85z" />
      <path d="M12.25 13.44v.74c0 1.9 1.31 1.82 1.44 1.82s1.44.09 1.44-1.82v-.74c0-1.9-1.31-1.82-1.44-1.82s-1.44-.09-1.44 1.82zm2.04-.12v.97c0 .77-.21 1.03-.59 1.03s-.6-.26-.6-1.03v-.97c0-.75.22-1.01.59-1.01s.6.26.6 1.01z" />
    </svg>
  )
}

function VolumeControl({ dict }: { dict: typeof dictionaries.zh | typeof dictionaries.en }) {
  const { volume, isMuted, setVolume, toggleMute } = useAudioPlayer()
  const [isHovered, setIsHovered] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    setIsHovered(true)
  }

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setIsHovered(false)
    }, 180)
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!isDragging) {
      return
    }
    const handleGlobalPointerUp = () => setIsDragging(false)
    window.addEventListener('pointerup', handleGlobalPointerUp)
    return () => window.removeEventListener('pointerup', handleGlobalPointerUp)
  }, [isDragging])

  const isOpen = isHovered || isDragging || isFocused
  const effectiveVolume = isMuted ? 0 : volume

  return (
    <div
      className={cn(
        'hidden sm:flex items-center rounded-full transition-all duration-300 ease-out select-none',
        isOpen
          ? 'bg-zinc-100 dark:bg-zinc-800/90 pl-3 pr-1 py-0.5 border border-zinc-200/80 dark:border-zinc-700/60 shadow-xs'
          : 'bg-transparent px-0 py-0 border-transparent',
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocusCapture={() => setIsFocused(true)}
      onBlurCapture={() => setIsFocused(false)}
    >
      {/* Expandable Volume Slider (positioned left of speaker icon, expanding outwards) */}
      <div
        className={cn(
          'transition-all duration-300 ease-out flex items-center overflow-hidden',
          isOpen ? 'w-20 md:w-24 opacity-100 mr-2 pointer-events-auto' : 'w-0 opacity-0 mr-0 pointer-events-none',
        )}
      >
        <SliderPrimitive.Root
          value={[Math.round(effectiveVolume * 100)]}
          max={100}
          step={1}
          onValueChange={([val]) => setVolume(val / 100)}
          onPointerDown={() => setIsDragging(true)}
          className="relative flex w-full touch-none select-none items-center cursor-pointer py-1.5"
          aria-label={dict.volume}
          aria-valuenow={Math.round(effectiveVolume * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
            <SliderPrimitive.Range className="absolute h-full bg-pantone-blue rounded-full" />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb
            className="block size-3.5 rounded-full border-2 border-pantone-blue bg-white shadow-xs transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pantone-blue"
            aria-label={dict.volume}
          />
        </SliderPrimitive.Root>
      </div>

      {/* Speaker Icon Button */}
      <button
        type="button"
        onClick={toggleMute}
        aria-label={isMuted || volume === 0 ? dict.unmute : dict.mute}
        title={`${dict.volume}: ${Math.round(effectiveVolume * 100)}% (${isMuted || volume === 0 ? dict.unmute : dict.mute})`}
        className={cn(
          'inline-flex items-center justify-center rounded-full transition-all touch-manipulation',
          isOpen
            ? 'size-8 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/60 dark:hover:bg-zinc-700/60'
            : 'size-10 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 min-w-[44px] min-h-[44px]',
        )}
      >
        {effectiveVolume === 0
          ? (
              <VolumeX className="size-4.5 text-zinc-400 dark:text-zinc-500" />
            )
          : effectiveVolume < 0.5
            ? (
                <Volume1 className="size-4.5" />
              )
            : (
                <Volume2 className="size-4.5" />
              )}
      </button>
    </div>
  )
}

export function GlobalBottomPlayer() {
  const {
    currentEpisode,
    isPlaying,
    playbackRate,
    isLoading,
    hasError,
    isPlayerVisible,
    togglePlayPause,
    seek,
    skip,
    setPlaybackRate,
    closePlayer,
  } = useAudioPlayer()

  const { currentTime, duration } = useAudioTime()

  const [speedMenuOpen, setSpeedMenuOpen] = useState(false)
  const [hasCopied, setHasCopied] = useState(false)
  const [shareFeedback, setShareFeedback] = useState('')
  const speedMenuRef = useRef<HTMLDivElement>(null)

  const isEn = currentEpisode?.variant === 'en'
  const dict = isEn ? dictionaries.en : dictionaries.zh

  // Close speed menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (speedMenuRef.current && !speedMenuRef.current.contains(event.target as Node)) {
        setSpeedMenuOpen(false)
      }
    }

    if (speedMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [speedMenuOpen])

  // Don't render if there is no episode or player is closed
  if (!currentEpisode || !isPlayerVisible) {
    return null
  }

  const handleCopyShareMoment = async () => {
    const url = buildPlaybackShareUrl(
      window.location.origin,
      currentEpisode.date,
      currentEpisode.variant,
      currentTime,
    )

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
      }
      else {
        const textarea = document.createElement('textarea')
        textarea.value = url
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      setHasCopied(true)
      setShareFeedback(dict.linkCopied)
      setTimeout(() => {
        setHasCopied(false)
        setShareFeedback('')
      }, 2500)
    }
    catch {
      setShareFeedback(dict.shareError)
      setTimeout(() => setShareFeedback(''), 2500)
    }
  }

  const isSlowPractice = playbackRate < 1.0

  return (
    <aside
      aria-label="全域播放器"
      className="fixed bottom-0 inset-x-0 z-50 transition-all duration-300 ease-out animate-in slide-in-from-bottom-6"
    >
      <div className="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border-t border-zinc-200/80 dark:border-zinc-800 shadow-[0_-10px_35px_-5px_rgba(0,0,0,0.1)] px-3 py-2 sm:px-6 sm:py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="max-w-4xl mx-auto flex flex-col gap-2">
          {/* Progress Slider (Scrubber) */}
          <div className="flex items-center gap-3 w-full">
            <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 tabular-nums min-w-[36px] text-right select-none">
              {formatPlaybackTimestamp(currentTime)}
            </span>
            <div className="flex-1 relative group py-1">
              <Slider
                value={[currentTime]}
                max={duration > 0 ? duration : 100}
                step={1}
                onValueChange={([val]) => seek(val)}
                className="cursor-pointer"
                aria-label="播放進度"
              />
            </div>
            <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 tabular-nums min-w-[36px] select-none">
              {formatPlaybackTimestamp(duration)}
            </span>
          </div>

          {/* Main Controls Row */}
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            {/* Left: Episode Meta Info */}
            <div className="flex items-center gap-2.5 shrink-0 sm:min-w-0 sm:flex-1 sm:max-w-xs md:max-w-sm">
              {/* Podcast Artwork (Clickable on Mobile/Desktop) & Soundwave Animation */}
              <Link
                href={getArticlePath(currentEpisode.date, currentEpisode.variant)}
                className="relative flex-shrink-0 group block"
                aria-label={currentEpisode.title}
                title={currentEpisode.title}
              >
                <Image
                  src={isEn ? '/podcast-cover-en.png' : '/podcast-cover.png'}
                  alt={currentEpisode.title}
                  width={40}
                  height={40}
                  className="size-10 rounded-lg object-cover shadow-xs border border-zinc-200/80 dark:border-zinc-700/80 group-hover:scale-105 transition-transform"
                />
                {isPlaying && (
                  <span className="absolute -bottom-1 -right-1 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                  </span>
                )}
              </Link>

              {/* Title & Date (Hidden on mobile to keep player spacious and clutter-free) */}
              <div className="hidden sm:block min-w-0 flex-1">
                <Link
                  href={getArticlePath(currentEpisode.date, currentEpisode.variant)}
                  className="block text-xs sm:text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate hover:text-pantone-blue transition-colors"
                  title={currentEpisode.title}
                >
                  {currentEpisode.title}
                </Link>
                <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                  <span className="tabular-nums">{currentEpisode.date}</span>
                  {hasError && (
                    <span className="text-amber-600 font-medium">{dict.audioNotReady}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Center: Playback Controls */}
            <div className="flex items-center gap-1 sm:gap-2">
              {/* Rewind 10s */}
              <button
                type="button"
                onClick={() => skip(-10)}
                aria-label={dict.rewind10s}
                title={dict.rewind10s}
                className="inline-flex items-center justify-center size-11 sm:size-12 rounded-full text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 active:scale-95 transition-all touch-manipulation min-w-[44px] min-h-[44px]"
              >
                <Rewind10Icon className="size-8" />
              </button>

              {/* Play / Pause Toggle */}
              <button
                type="button"
                onClick={togglePlayPause}
                aria-label={isPlaying ? dict.pauseEpisode : dict.playEpisode}
                title={isPlaying ? dict.pauseEpisode : dict.playEpisode}
                className="inline-flex items-center justify-center size-11 sm:size-12 rounded-full bg-pantone-blue text-white shadow-md hover:bg-pantone-blue/90 active:scale-95 transition-all touch-manipulation min-w-[44px] min-h-[44px]"
              >
                {isLoading
                  ? (
                      <span className="size-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    )
                  : isPlaying
                    ? (
                        <Pause className="size-5 fill-current" />
                      )
                    : (
                        <Play className="size-5 fill-current ml-0.5" />
                      )}
              </button>

              {/* Forward 10s */}
              <button
                type="button"
                onClick={() => skip(10)}
                aria-label={dict.forward10s}
                title={dict.forward10s}
                className="inline-flex items-center justify-center size-11 sm:size-12 rounded-full text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 active:scale-95 transition-all touch-manipulation min-w-[44px] min-h-[44px]"
              >
                <Forward10Icon className="size-8" />
              </button>
            </div>

            {/* Right: Volume, Speed Menu, Share & Dismiss */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              {/* Volume Hover Control */}
              <VolumeControl dict={dict} />

              {/* Speed Popover Trigger */}
              <div className="relative" ref={speedMenuRef}>
                <button
                  type="button"
                  onClick={() => setSpeedMenuOpen(prev => !prev)}
                  aria-expanded={speedMenuOpen}
                  aria-haspopup="true"
                  aria-label={`${dict.playbackSpeed}: ${playbackRate}x`}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-bold transition-all touch-manipulation min-h-[44px]',
                    isSlowPractice
                      ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60 shadow-xs'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700',
                  )}
                  title={isSlowPractice ? `${playbackRate}x (${dict.listeningPractice})` : `${playbackRate}x`}
                >
                  {isSlowPractice && (
                    <Headphones className="size-3 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                  )}
                  <span className="tabular-nums">
                    {playbackRate}
                    ×
                  </span>
                  <ChevronUp
                    className={cn(
                      'size-3 opacity-60 transition-transform duration-200',
                      speedMenuOpen ? 'rotate-180' : '',
                    )}
                  />
                </button>

                {/* Speed Menu Popover */}
                {speedMenuOpen && (
                  <div
                    role="menu"
                    aria-orientation="vertical"
                    className="absolute right-0 bottom-full mb-3 w-56 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150"
                  >
                    {/* Slow listening practice section */}
                    <div className="px-2.5 py-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5 bg-amber-50/60 dark:bg-amber-950/40 rounded-lg mb-1">
                      <Headphones className="size-3.5" />
                      <span>{isEn ? 'Listening Practice' : '英聽訓練專用慢速'}</span>
                    </div>

                    <div className="space-y-0.5">
                      {([0.5, 0.75, 0.9] as const).map(rate => (
                        <button
                          key={rate}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setPlaybackRate(rate)
                            setSpeedMenuOpen(false)
                          }}
                          className={cn(
                            'w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors min-h-[44px]',
                            playbackRate === rate
                              ? 'bg-amber-500 text-white'
                              : 'text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800',
                          )}
                        >
                          <span className="flex items-center gap-2">
                            <span className="tabular-nums font-bold">
                              {rate}
                              ×
                            </span>
                            <span className="text-[11px] font-normal opacity-85">
                              {rate === 0.5
                                ? (isEn ? 'Slow' : '慢速練習')
                                : rate === 0.75
                                  ? (isEn ? 'Practice' : '聽力首選')
                                  : (isEn ? 'Gentle' : '微慢適應')}
                            </span>
                          </span>
                          {playbackRate === rate && <Check className="size-4 stroke-[2.5]" />}
                        </button>
                      ))}
                    </div>

                    {/* Standard & Fast speeds */}
                    <div className="px-2.5 py-1 text-[11px] font-semibold text-zinc-400 dark:text-zinc-500 mt-2 mb-0.5">
                      {isEn ? 'Standard & Fast' : '常規與倍速'}
                    </div>

                    <div className="space-y-0.5">
                      {([1.0, 1.25, 1.5, 2.0] as const).map(rate => (
                        <button
                          key={rate}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setPlaybackRate(rate)
                            setSpeedMenuOpen(false)
                          }}
                          className={cn(
                            'w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-colors min-h-[44px]',
                            playbackRate === rate
                              ? 'bg-pantone-blue text-white'
                              : 'text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800',
                          )}
                        >
                          <span className="flex items-center gap-2">
                            <span className="tabular-nums font-bold">
                              {rate}
                              ×
                            </span>
                            <span className="text-[11px] font-normal opacity-85">
                              {rate === 1.0
                                ? (isEn ? 'Normal' : '標準速度')
                                : rate === 1.25
                                  ? (isEn ? 'Fast' : '微快')
                                  : rate === 1.5
                                    ? (isEn ? 'Faster' : '快速')
                                    : (isEn ? '2x' : '兩倍速')}
                            </span>
                          </span>
                          {playbackRate === rate && <Check className="size-4 stroke-[2.5]" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Share Timestamp Button (Direct Copy) */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => void handleCopyShareMoment()}
                  aria-label={dict.shareMoment}
                  title={`${dict.shareMoment} (${formatPlaybackTimestamp(currentTime)})`}
                  className={cn(
                    'inline-flex items-center justify-center gap-1 size-10 rounded-full transition-all touch-manipulation min-w-[44px] min-h-[44px]',
                    hasCopied
                      ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/60 shadow-xs'
                      : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 active:scale-95',
                  )}
                >
                  {hasCopied
                    ? (
                        <Check className="size-4.5 text-emerald-600 dark:text-emerald-400 stroke-[2.5]" />
                      )
                    : (
                        <Share2 className="size-4.5" />
                      )}
                </button>
                {shareFeedback && (
                  <span
                    role="status"
                    className="absolute right-0 bottom-full mb-2 whitespace-nowrap px-2.5 py-1 rounded-md bg-zinc-900 text-white text-[11px] font-medium shadow-lg animate-in fade-in z-50 pointer-events-none"
                  >
                    {shareFeedback}
                  </span>
                )}
              </div>

              {/* Close Button (Desktop/Tablet only; hidden on mobile for clean breathing room) */}
              <button
                type="button"
                onClick={closePlayer}
                aria-label={dict.closePlayer}
                title={dict.closePlayer}
                className="hidden sm:inline-flex items-center justify-center size-10 rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all touch-manipulation min-w-[44px] min-h-[44px]"
              >
                <X className="size-4.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
