'use client'

import type { ArticleTab } from '@/lib/playback-share'
import { Check, Pause, Play, Share2 } from 'lucide-react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { useAudioPlayer } from '@/components/audio-player-context'
import { Card, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { dictionaries } from '@/lib/i18n'
import {
  buildPlaybackShareUrl,
  copyTextToClipboard,
  formatPlaybackTimestamp,
  getArticlePath,
  getPlaybackStartFromHash,
  isEpisodePath,
  isValidArticleTab,
  parseTabFromUrl,
  sanitizeExternalUrl,
} from '@/lib/playback-share'
import {
  getEpisodeListenStatusServerSnapshot,
  getEpisodeListenStatusSnapshot,
  getEpisodeProgress,
  subscribeEpisodeListenStatus,
} from '@/lib/playback-storage'
import { cn } from '@/lib/utils'

const SyncTranscript = dynamic(
  () => import('@/components/sync-transcript').then(mod => mod.SyncTranscript),
)

const Comments = dynamic(
  () => import('@/components/comments').then(mod => mod.Comments),
)

interface ArticleCardProps {
  article: Article
  staticHost: string
  showSummary?: boolean
  showFooter?: boolean
  showComments?: boolean
  initialTab?: ArticleTab
}

export function ArticleCard({
  article,
  staticHost = '',
  showSummary = false,
  showFooter = false,
  showComments = true,
  initialTab,
}: ArticleCardProps) {
  const isEn = article.variant === 'en'
  const dict = isEn ? dictionaries.en : dictionaries.zh
  const defaultTab: ArticleTab = initialTab && isValidArticleTab(initialTab) ? initialTab : 'summary'
  const [shareMessage, setShareMessage] = useState('')
  const [hasCopied, setHasCopied] = useState(false)

  const subscribeArticleTab = useCallback((onStoreChange: () => void) => {
    if (typeof window === 'undefined') {
      return () => {}
    }
    window.addEventListener('popstate', onStoreChange)
    window.addEventListener('hashchange', onStoreChange)
    window.addEventListener('article-tab-change', onStoreChange)
    return () => {
      window.removeEventListener('popstate', onStoreChange)
      window.removeEventListener('hashchange', onStoreChange)
      window.removeEventListener('article-tab-change', onStoreChange)
    }
  }, [])

  const getArticleTabSnapshot = useCallback((): ArticleTab => {
    if (typeof window === 'undefined') {
      return defaultTab
    }
    if (isEpisodePath(window.location.pathname, article.date, article.variant)) {
      return parseTabFromUrl(window.location) ?? 'summary'
    }
    return defaultTab
  }, [article.date, article.variant, defaultTab])

  const activeTab = useSyncExternalStore(
    subscribeArticleTab,
    getArticleTabSnapshot,
    () => defaultTab,
  )

  const subscribeListenStatus = useCallback(
    (onStoreChange: () => void) => subscribeEpisodeListenStatus(article.date, article.variant, onStoreChange),
    [article.date, article.variant],
  )
  const getListenStatusSnapshot = useCallback(
    () => getEpisodeListenStatusSnapshot(article.date, article.variant),
    [article.date, article.variant],
  )
  const listenStatus = useSyncExternalStore(
    subscribeListenStatus,
    getListenStatusSnapshot,
    getEpisodeListenStatusServerSnapshot,
  )

  const audio = `${staticHost}/${article.audio}?t=${article.updatedAt}`
  const summary = article.introContent || article.podcastContent?.split('\n')?.[0]

  const {
    currentEpisode,
    isPlaying,
    playEpisode,
    togglePlayPause,
    seek,
    openPlayer,
    isPlayerVisible,
    hasError,
    getCurrentTime,
    updateCurrentEpisode,
  } = useAudioPlayer()

  const isSameEpisode = currentEpisode?.date === article.date
    && (currentEpisode?.variant ?? 'hacker-news') === (article.variant ?? 'hacker-news')
  const isCurrentEpisode = isSameEpisode && currentEpisode?.audioSrc === audio
  const isCurrentPlaying = isCurrentEpisode && isPlaying

  useEffect(() => {
    if (
      isSameEpisode
      && currentEpisode
      && currentEpisode.audioSrc !== audio
      && !isPlaying
    ) {
      updateCurrentEpisode({
        date: article.date,
        variant: article.variant,
        title: article.title,
        audioSrc: audio,
        updatedAt: article.updatedAt,
      })
    }
  }, [article.date, article.title, article.updatedAt, article.variant, audio, currentEpisode, isPlaying, isSameEpisode, updateCurrentEpisode])

  const handleTabChange = (value: string) => {
    if (!isValidArticleTab(value)) {
      return
    }

    if (typeof window !== 'undefined') {
      const newPath = getArticlePath(article.date, article.variant, value)
      // Preserve only valid playback timestamp hashes (#t=...); drop legacy tab hashes (#podcast, etc.)
      const playbackStart = getPlaybackStartFromHash(window.location.hash)
      const nextHash = playbackStart !== null ? `#t=${playbackStart}` : ''
      const newUrl = `${newPath}${nextHash}`
      const currentUrl = window.location.pathname + window.location.hash

      if (currentUrl !== newUrl) {
        window.history.pushState(null, '', newUrl)
        window.dispatchEvent(new Event('article-tab-change'))
      }
    }
  }

  const renderedBlogHtml = article.blogContent ? (article.blogHtml ?? '') : ''

  useEffect(() => {
    if (!isCurrentEpisode) {
      return
    }

    const handleHashChange = () => {
      if (!isEpisodePath(window.location.pathname, article.date, article.variant)) {
        return
      }
      const start = getPlaybackStartFromHash(window.location.hash)
      if (start !== null) {
        seek(start)
      }
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [article.date, article.variant, isCurrentEpisode, seek])

  const handlePlayToggle = async () => {
    let start: number | undefined
    if (typeof window !== 'undefined' && isEpisodePath(window.location.pathname, article.date, article.variant)) {
      const hashStart = getPlaybackStartFromHash(window.location.hash)
      if (hashStart !== null) {
        start = hashStart
      }
    }

    if (start === undefined) {
      const savedProgress = getEpisodeProgress(article.date, article.variant)
      if (savedProgress > 0) {
        start = savedProgress
      }
    }

    if (isCurrentEpisode) {
      if (!isPlayerVisible) {
        openPlayer()
      }
      const current = getCurrentTime()
      if (start !== undefined && Math.abs(current - start) > 1) {
        seek(start)
      }
      togglePlayPause()
      return
    }

    await playEpisode({
      date: article.date,
      variant: article.variant,
      title: article.title,
      audioSrc: audio,
      updatedAt: article.updatedAt,
    }, start)
  }

  const handleShare = async () => {
    const time = isCurrentEpisode
      ? getCurrentTime()
      : (typeof window !== 'undefined' ? (getPlaybackStartFromHash(window.location.hash) ?? getEpisodeProgress(article.date, article.variant)) : 0)
    const url = buildPlaybackShareUrl(window.location.origin, article.date, article.variant, time, activeTab)

    try {
      // Delegates to shared copyTextToClipboard (uses navigator.clipboard?.writeText with fallback)
      await copyTextToClipboard(url)
      setHasCopied(true)
      setShareMessage(dict.linkCopied)
      setTimeout(() => {
        setHasCopied(false)
        setShareMessage('')
      }, 2500)
    }
    catch {
      setShareMessage(dict.shareError)
      setTimeout(setShareMessage, 2500, '')
    }
  }

  const stickyHeader = (
    <div className={`sticky top-0 z-30 bg-white/95 backdrop-blur-xl ${showFooter ? 'border-b border-zinc-200/80 rounded-t-2xl shadow-xs' : 'rounded-2xl'}`}>
      <CardHeader className="pb-2">
        <CardTitle>
          <div className="flex flex-wrap items-center justify-between gap-2.5 mb-1.5">
            <Link href={getArticlePath(article.date, article.variant)} title={article.title} className="text-zinc-900 hover:text-pantone-blue transition-colors flex-1 min-w-[240px]">
              <h2 className="text-xl font-bold tracking-tight leading-tight">{article.title}</h2>
            </Link>
            {listenStatus.status === 'completed' && (
              <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800/60 select-none">
                <Check className="size-3.5 stroke-[2.5]" aria-hidden="true" />
                <span>{dict.completed}</span>
              </span>
            )}
          </div>
          {showSummary && (
            <p className="text-base py-3 text-zinc-700 font-medium leading-relaxed">
              {summary}
            </p>
          )}
        </CardTitle>
      </CardHeader>

      <div className={cn('px-3 sm:px-6 py-2.5 flex items-center justify-between gap-2 sm:gap-3', showFooter && 'pb-3')}>
        {/* Play toggle button (Left: icon-only on mobile, text on desktop) */}
        <div className="shrink-0 flex items-center">
          <button
            type="button"
            onClick={() => void handlePlayToggle()}
            className={cn(
              'inline-flex items-center justify-center gap-2 rounded-full p-2.5 sm:px-4 sm:py-2 text-sm font-semibold transition-all duration-200 shadow-xs min-h-[44px] min-w-[44px] touch-manipulation select-none',
              isCurrentPlaying
                ? 'bg-pantone-blue text-white hover:bg-pantone-blue/90 shadow-md ring-2 ring-pantone-blue/30 active:scale-95'
                : isCurrentEpisode
                  ? 'bg-pantone-blue/10 text-pantone-blue border border-pantone-blue/30 hover:bg-pantone-blue/20 active:scale-95'
                  : 'bg-zinc-100 hover:bg-zinc-200/80 text-zinc-900 border border-zinc-200/80 active:scale-95',
            )}
            aria-label={isCurrentPlaying ? dict.pauseEpisode : (isCurrentEpisode ? dict.resumeEpisode : dict.playEpisode)}
            title={isCurrentPlaying ? dict.pauseEpisode : (isCurrentEpisode ? dict.resumeEpisode : dict.playEpisode)}
          >
            {isCurrentPlaying
              ? (
                  <>
                    <Pause className="size-4.5 sm:size-4 fill-current" />
                    <span className="hidden sm:inline">{dict.pauseEpisode}</span>
                  </>
                )
              : (
                  <>
                    <Play className="size-4.5 sm:size-4 fill-current ml-0.5" />
                    <span className="hidden sm:inline">
                      {isCurrentEpisode
                        ? dict.resumeEpisode
                        : listenStatus.status === 'in_progress'
                          ? `${dict.resumeEpisode} (${formatPlaybackTimestamp(listenStatus.progress)})`
                          : listenStatus.status === 'completed'
                            ? dict.relisten
                            : dict.playEpisode}
                    </span>
                  </>
                )}
          </button>
        </div>

        {/* Center: TabsList (when showFooter is true) */}
        {showFooter && (
          <div className="flex-1 flex justify-center min-w-0">
            <TabsList className="bg-zinc-100/80 p-0.5 sm:p-1 border border-zinc-200/60 rounded-xl">
              <TabsTrigger value="summary" className="font-semibold text-xs sm:text-sm px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg data-[state=active]:bg-pantone-blue data-[state=active]:text-white data-[state=active]:shadow-xs">{dict.tabs.summary}</TabsTrigger>
              <TabsTrigger value="podcast" className="font-semibold text-xs sm:text-sm px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg data-[state=active]:bg-pantone-blue data-[state=active]:text-white data-[state=active]:shadow-xs">{dict.tabs.podcast}</TabsTrigger>
              <TabsTrigger value="references" className="font-semibold text-xs sm:text-sm px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg data-[state=active]:bg-pantone-blue data-[state=active]:text-white data-[state=active]:shadow-xs">{dict.tabs.references}</TabsTrigger>
            </TabsList>
          </div>
        )}

        {/* Right: Share Button & Status */}
        <div className="shrink-0 flex items-center gap-2">
          {shareMessage && (
            <span className="hidden sm:inline text-xs text-emerald-600 dark:text-emerald-400 font-medium animate-in fade-in" aria-live="polite">
              {shareMessage}
            </span>
          )}
          {isCurrentEpisode && hasError && (
            <span className="text-xs text-amber-600 font-medium">
              ⚠️
              {' '}
              {dict.audioNotReady}
            </span>
          )}
          <button
            type="button"
            onClick={() => void handleShare()}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-full p-2.5 sm:px-3 sm:py-2 text-sm font-medium transition-all min-h-[44px] min-w-[44px] touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500',
              hasCopied
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-xs'
                : 'text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950',
            )}
            aria-label={dict.shareMoment}
            title={dict.shareMoment}
          >
            {hasCopied
              ? (
                  <Check className="size-4.5 sm:size-4 text-emerald-600 stroke-[2.5]" aria-hidden="true" />
                )
              : (
                  <Share2 className="size-4.5 sm:size-4" aria-hidden="true" />
                )}
            <span className="hidden sm:inline font-semibold">{hasCopied ? dict.linkCopied : dict.shareMoment}</span>
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <Card className="mb-6 glass border-zinc-200/80 hover:shadow-xl transition-all duration-300 group rounded-2xl">
      {showFooter
        ? (
            <>
              <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
                {stickyHeader}
                <CardFooter className={cn('flex-col pt-4 bg-white/40', !showComments && 'rounded-b-2xl')}>
                  <TabsContent value="summary" className="w-full prose prose-zinc max-w-none py-6 prose-headings:text-zinc-900 prose-headings:font-bold prose-p:text-zinc-800 prose-p:leading-relaxed prose-a:text-pantone-blue prose-a:font-semibold hover:prose-a:underline">
                    {renderedBlogHtml && (
                      // Pre-rendered server-side via markdown-it (html: false, sanitized links)
                      // eslint-disable-next-line react/dom-no-dangerously-set-innerhtml
                      <div dangerouslySetInnerHTML={{ __html: renderedBlogHtml }} />
                    )}
                  </TabsContent>
                  <TabsContent value="podcast" className="w-full py-4">
                    <SyncTranscript article={article} audioSrc={audio} />
                  </TabsContent>
                  <TabsContent value="references" className="w-full py-6 space-y-3">
                    {article.stories?.map((story) => {
                      const sourceLabel = (() => {
                        switch (story.source) {
                          case 'hacker-news': return dict.sources.comment
                          case 'github-trending': return dict.sources.github
                          case 'product-hunt': return dict.sources.productHunt
                          case 'dev-to': return dict.sources.devto
                          case 'reddit': return story.subreddit ? `r/${story.subreddit}` : dict.sources.reddit
                          default: return null
                        }
                      })()

                      const storyHref = sanitizeExternalUrl(story.url ?? story.sourceUrl) ?? '#'
                      const sourceLink = sanitizeExternalUrl((() => {
                        if (story.source === 'hacker-news') {
                          return story.hackerNewsUrl ?? story.sourceUrl ?? (story.id ? `https://news.ycombinator.com/item?id=${story.id}` : undefined)
                        }
                        return story.sourceUrl ?? story.url
                      })())

                      return (
                        <div key={`${story.id}-${story.source}`} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-white/60 transition-colors group/item border border-transparent hover:border-zinc-200/60">
                          <Link
                            href={storyHref}
                            className="text-md text-zinc-800 hover:text-pantone-blue transition-colors line-clamp-1 flex-1 font-semibold"
                            title={story.title}
                            rel="nofollow noopener noreferrer"
                            target="_blank"
                          >
                            {story.title}
                          </Link>
                          {sourceLabel && sourceLink && (
                            <Link
                              href={sourceLink}
                              className="text-xs px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-700 hover:bg-zinc-200 hover:text-zinc-900 transition-all font-bold tracking-wide uppercase"
                              title={sourceLabel}
                              rel="nofollow noopener noreferrer"
                              target="_blank"
                            >
                              {sourceLabel}
                            </Link>
                          )}
                        </div>
                      )
                    })}
                  </TabsContent>
                </CardFooter>
              </Tabs>
              {showComments && (
                <div className="border-t border-zinc-200/80 bg-white/60 p-4 sm:p-6 rounded-b-2xl">
                  <Comments
                    date={article.date}
                    title={article.title}
                    variant={article.variant}
                    published={new Date(article.date).toISOString()}
                    showHeader
                  />
                </div>
              )}
            </>
          )
        : (
            stickyHeader
          )}
    </Card>
  )
}
