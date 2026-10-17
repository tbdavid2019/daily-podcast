'use client'

import type { TimedCue } from '@/lib/transcript'
import { Check, Copy, Download, Play, Radio, Volume2 } from 'lucide-react'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useAudioPlayer, useAudioTime } from '@/components/audio-player-context'
import { formatPlaybackTimestamp } from '@/lib/playback-share'
import {
  calculateCueTimings,
  getTranscriptPath,
  parseDialogueLines,
} from '@/lib/transcript'
import { cn } from '@/lib/utils'

interface SyncTranscriptProps {
  article: Article
  audioSrc: string
}

export function SyncTranscript({ article, audioSrc }: SyncTranscriptProps) {
  const {
    currentEpisode,
    isPlaying,
    playEpisode,
    togglePlayPause,
    seek,
  } = useAudioPlayer()

  const { currentTime, duration: playerDuration } = useAudioTime()
  const [autoScroll, setAutoScroll] = useState(true)
  const [hasCopied, setHasCopied] = useState(false)
  const cueRefs = useRef<(HTMLDivElement | null)[]>([])

  const isCurrentEpisode = currentEpisode?.date === article.date
    && (currentEpisode?.variant ?? 'hacker-news') === (article.variant ?? 'hacker-news')

  // Parse raw dialogue lines or podcastContent
  const rawCues = useMemo(
    () => parseDialogueLines(article.podcastContent, article.dialogue),
    [article.podcastContent, article.dialogue],
  )

  // Use player's real duration if playing this episode, otherwise estimate
  const effectiveDuration = isCurrentEpisode && playerDuration > 0 ? playerDuration : 0
  const timedCues: TimedCue[] = useMemo(
    () => calculateCueTimings(rawCues, effectiveDuration > 0 ? effectiveDuration : undefined),
    [rawCues, effectiveDuration],
  )

  // Find currently active cue
  const activeIndex = useMemo(() => {
    if (!isCurrentEpisode || currentTime < 0) {
      return -1
    }
    return timedCues.findIndex(cue => cue.start <= currentTime && currentTime < cue.end)
  }, [isCurrentEpisode, currentTime, timedCues])

  // Smoothly scroll to active cue if autoScroll is enabled
  useEffect(() => {
    if (!autoScroll || activeIndex === -1 || !isPlaying) {
      return
    }

    const element = cueRefs.current[activeIndex]
    if (element) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      })
    }
  }, [activeIndex, autoScroll, isPlaying])

  const handleCueClick = async (start: number) => {
    if (isCurrentEpisode) {
      seek(start)
      if (!isPlaying) {
        togglePlayPause()
      }
    }
    else {
      await playEpisode({
        date: article.date,
        variant: article.variant,
        title: article.title,
        audioSrc,
        updatedAt: article.updatedAt,
      }, start)
    }
  }

  const handleCopyText = async () => {
    const text = article.podcastContent || timedCues.map(c => `${c.speaker ? `${c.speaker}: ` : ''}${c.text}`).join('\n\n')
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      }
      else {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      setHasCopied(true)
      setTimeout(() => setHasCopied(false), 2000)
    }
    catch {
      // ignore
    }
  }

  const vttUrl = getTranscriptPath(article.date, article.variant, 'vtt')
  const srtUrl = getTranscriptPath(article.date, article.variant, 'srt')

  if (timedCues.length === 0) {
    return (
      <div className="w-full whitespace-pre-line py-6 leading-relaxed text-zinc-800 font-normal">
        {article.podcastContent}
      </div>
    )
  }

  return (
    <div className="w-full space-y-4 py-2">
      {/* Transcript Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-zinc-200/70 text-xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAutoScroll(!autoScroll)}
            className={cn(
              'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-semibold transition-all select-none',
              autoScroll
                ? 'bg-pantone-blue/10 text-pantone-blue border border-pantone-blue/30'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 border border-zinc-200/70',
            )}
            title={autoScroll ? '點擊暫停自動滾動跟隨' : '點擊啟用自動滾動跟隨'}
          >
            <Radio className={cn('size-3.5', autoScroll && isPlaying ? 'animate-pulse text-pantone-blue' : '')} />
            <span>{autoScroll ? '同步跟隨中' : '手動捲動'}</span>
          </button>

          {isCurrentEpisode && isPlaying && (
            <span className="hidden sm:inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
              <Volume2 className="size-3.5 animate-pulse" />
              <span>點擊任一段落可即時跳轉</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void handleCopyText()}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 transition-colors font-medium select-none"
            title="複製逐字稿文字"
          >
            {hasCopied
              ? (
                  <>
                    <Check className="size-3.5 text-emerald-600" />
                    <span>已複製</span>
                  </>
                )
              : (
                  <>
                    <Copy className="size-3.5" />
                    <span>複製逐字稿</span>
                  </>
                )}
          </button>

          <a
            href={srtUrl}
            download={`podcast-${article.date}.srt`}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 transition-colors font-medium select-none"
            title="下載 SRT 字幕（可直接上傳 YouTube Studio）"
          >
            <Download className="size-3.5" />
            <span>SRT</span>
          </a>

          <a
            href={vttUrl}
            download={`podcast-${article.date}.vtt`}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 transition-colors font-medium select-none"
            title="下載 WebVTT 字幕（符合 Podcasting 2.0 / Apple Podcasts）"
          >
            <Download className="size-3.5" />
            <span>VTT</span>
          </a>
        </div>
      </div>

      {/* Synchronized Dialogue Cue List */}
      <div className="space-y-3 pt-1">
        {timedCues.map((cue, index) => {
          const isActive = index === activeIndex
          const speakerLower = cue.speaker.toLowerCase()
          const isFemale = cue.speaker === '女' || speakerLower === 'cordelia'
          const isMale = cue.speaker === '男' || speakerLower === 'david'

          return (
            <div
              key={`${cue.id}-${cue.start}`}
              ref={(el) => {
                cueRefs.current[index] = el
              }}
              onClick={() => void handleCueClick(cue.start)}
              className={cn(
                'group relative p-3.5 sm:p-4 rounded-xl transition-all duration-200 cursor-pointer border',
                isActive
                  ? 'bg-pantone-blue/[0.08] dark:bg-pantone-blue/20 border-pantone-blue/50 shadow-xs ring-1 ring-pantone-blue/30 scale-[1.005]'
                  : 'bg-white/40 hover:bg-white/80 border-zinc-200/60 hover:border-zinc-300 shadow-2xs',
              )}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5 select-none">
                <div className="flex items-center gap-2">
                  {cue.speaker && (
                    <span
                      className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold tracking-wide uppercase shadow-2xs',
                        isFemale && 'bg-rose-50 text-rose-700 border border-rose-200/80',
                        isMale && 'bg-sky-50 text-sky-700 border border-sky-200/80',
                        !isFemale && !isMale && 'bg-zinc-100 text-zinc-700 border border-zinc-200/80',
                      )}
                    >
                      {cue.speaker}
                    </span>
                  )}

                  {isActive && isPlaying && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-pantone-blue animate-pulse">
                      <Volume2 className="size-3" />
                      <span>正在播放</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 text-xs text-zinc-600 font-mono font-semibold group-hover:text-pantone-blue transition-colors">
                  <Play className={cn('size-3 fill-current opacity-0 group-hover:opacity-100 transition-opacity', isActive && 'opacity-100 text-pantone-blue')} />
                  <span>{formatPlaybackTimestamp(cue.start)}</span>
                </div>
              </div>

              <p
                className={cn(
                  'text-base leading-relaxed tracking-normal transition-colors',
                  isActive
                    ? 'font-medium text-zinc-950 dark:text-zinc-50'
                    : 'text-zinc-800 dark:text-zinc-200 group-hover:text-zinc-950',
                )}
              >
                {cue.text}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
