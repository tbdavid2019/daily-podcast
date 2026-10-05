'use client'

import {
  Check,
  ChevronUp,
  Headphones,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Share2,
  X,
} from 'lucide-react'
import Link from 'next/link'
import React, { useEffect, useRef, useState } from 'react'
import { useAudioPlayer, useAudioTime } from '@/components/audio-player-context'
import { Slider } from '@/components/ui/slider'
import { dictionaries } from '@/lib/i18n'
import { buildPlaybackShareUrl, formatPlaybackTimestamp, getArticlePath } from '@/lib/playback-share'
import { cn } from '@/lib/utils'

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

  const handleShare = async () => {
    const url = buildPlaybackShareUrl(
      window.location.origin,
      currentEpisode.date,
      currentEpisode.variant,
      currentTime,
    )

    try {
      if (navigator.share) {
        await navigator.share({ url })
        setShareFeedback(dict.linkCopied)
        setTimeout(() => setShareFeedback(''), 2500)
        return
      }

      await navigator.clipboard.writeText(url)
      setShareFeedback(dict.linkCopied)
      setTimeout(() => setShareFeedback(''), 2500)
    }
    catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return
      }
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
      <div className="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border-t border-zinc-200/80 dark:border-zinc-800 shadow-[0_-10px_35px_-5px_rgba(0,0,0,0.1)] px-4 py-2.5 sm:px-6 sm:py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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
            <div className="flex items-center gap-2.5 min-w-0 flex-1 max-w-[280px] sm:max-w-xs md:max-w-sm">
              {/* Variant Badge & Soundwave Animation */}
              <div className="relative flex-shrink-0">
                <span
                  className={cn(
                    'inline-flex items-center justify-center size-8 rounded-lg text-xs font-bold shadow-xs',
                    isEn
                      ? 'bg-emerald-600 text-white dark:bg-emerald-700'
                      : 'bg-pantone-blue text-white',
                  )}
                >
                  {isEn ? 'EN' : 'HN'}
                </span>
                {isPlaying && (
                  <span className="absolute -bottom-1 -right-1 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                  </span>
                )}
              </div>

              {/* Title & Date */}
              <div className="min-w-0 flex-1">
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
                className="inline-flex items-center justify-center size-10 rounded-full text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 active:scale-95 transition-all touch-manipulation min-w-[44px] min-h-[44px]"
              >
                <div className="relative flex items-center justify-center">
                  <RotateCcw className="size-4.5" />
                  <span className="absolute text-[8px] font-bold font-mono -bottom-0.5">10</span>
                </div>
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
                className="inline-flex items-center justify-center size-10 rounded-full text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 active:scale-95 transition-all touch-manipulation min-w-[44px] min-h-[44px]"
              >
                <div className="relative flex items-center justify-center">
                  <RotateCw className="size-4.5" />
                  <span className="absolute text-[8px] font-bold font-mono -bottom-0.5">10</span>
                </div>
              </button>
            </div>

            {/* Right: Speed Menu, Share & Dismiss */}
            <div className="flex items-center gap-1.5 sm:gap-2">
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

              {/* Share Timestamp Button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => void handleShare()}
                  aria-label={dict.shareMoment}
                  title={dict.shareMoment}
                  className="inline-flex items-center justify-center size-10 rounded-full text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 active:scale-95 transition-all touch-manipulation min-w-[44px] min-h-[44px]"
                >
                  <Share2 className="size-4.5" />
                </button>
                {shareFeedback && (
                  <span
                    role="status"
                    className="absolute right-0 bottom-full mb-2 whitespace-nowrap px-2.5 py-1 rounded-md bg-zinc-900 text-white text-[11px] font-medium shadow-lg animate-in fade-in"
                  >
                    {shareFeedback}
                  </span>
                )}
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={closePlayer}
                aria-label={dict.closePlayer}
                title={dict.closePlayer}
                className="inline-flex items-center justify-center size-10 rounded-full text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all touch-manipulation min-w-[44px] min-h-[44px]"
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
