'use client'

import { Pause, Play, Share2 } from 'lucide-react'
import MarkdownIt from 'markdown-it'
import Link from 'next/link'
import React, { useEffect, useMemo, useState } from 'react'
import { useAudioPlayer, useAudioTime } from '@/components/audio-player-context'
import { Card, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { dictionaries } from '@/lib/i18n'
import {
  buildPlaybackShareUrl,
  formatPlaybackTimestamp,
  getArticlePath,
  getPlaybackStartFromHash,
} from '@/lib/playback-share'
import { cn } from '@/lib/utils'

const markdownRenderer = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
})

const defaultLinkRenderer = markdownRenderer.renderer.rules.link_open
  ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))

markdownRenderer.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  token.attrSet('target', '_blank')
  token.attrSet('rel', 'nofollow noopener noreferrer')
  return defaultLinkRenderer(tokens, idx, options, env, self)
}

function ActivePlaybackTimer() {
  const { currentTime, duration } = useAudioTime()
  return (
    <span className="font-mono text-xs opacity-80 tabular-nums ml-1">
      {formatPlaybackTimestamp(currentTime)}
      {duration > 0 && ` / ${formatPlaybackTimestamp(duration)}`}
    </span>
  )
}

interface ArticleCardProps {
  article: Article
  staticHost: string
  showSummary?: boolean
  showFooter?: boolean
}

export function ArticleCard({ article, staticHost = '', showSummary = false, showFooter = false }: ArticleCardProps) {
  const isEn = article.variant === 'en'
  const dict = isEn ? dictionaries.en : dictionaries.zh
  const [shareMessage, setShareMessage] = useState('')
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
  } = useAudioPlayer()

  const isCurrentEpisode = currentEpisode?.date === article.date
    && (currentEpisode?.variant ?? 'hacker-news') === (article.variant ?? 'hacker-news')
  const isCurrentPlaying = isCurrentEpisode && isPlaying

  const renderedBlogHtml = useMemo(
    () => article.blogContent ? markdownRenderer.render(article.blogContent) : '',
    [article.blogContent],
  )

  useEffect(() => {
    if (!isCurrentEpisode) {
      return
    }

    const handleHashChange = () => {
      if (window.location.pathname !== getArticlePath(article.date, article.variant)) {
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
    if (typeof window !== 'undefined' && window.location.pathname === getArticlePath(article.date, article.variant)) {
      const hashStart = getPlaybackStartFromHash(window.location.hash)
      if (hashStart !== null) {
        start = hashStart
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
      : (typeof window !== 'undefined' ? (getPlaybackStartFromHash(window.location.hash) ?? 0) : 0)
    const url = buildPlaybackShareUrl(window.location.origin, article.date, article.variant, time)

    try {
      if (navigator.share) {
        await navigator.share({ url })
        setShareMessage(dict.linkCopied)
        setTimeout(() => setShareMessage(''), 2500)
        return
      }

      await navigator.clipboard.writeText(url)
      setShareMessage(dict.linkCopied)
      setTimeout(() => setShareMessage(''), 2500)
    }
    catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return
      }

      setShareMessage(dict.shareError)
      setTimeout(() => setShareMessage(''), 2500)
    }
  }

  const stickyHeader = (
    <div className={`sticky top-0 z-30 bg-white/95 backdrop-blur-xl ${showFooter ? 'border-b border-zinc-200/80 rounded-t-2xl shadow-xs' : 'rounded-2xl'}`}>
      <CardHeader className="pb-2">
        <CardTitle>
          <Link href={getArticlePath(article.date, article.variant)} title={article.title} className="text-zinc-900 hover:text-pantone-blue transition-colors">
            <h2 className="text-xl font-bold tracking-tight leading-tight">{article.title}</h2>
          </Link>
          {showSummary && (
            <p className="text-base py-3 text-zinc-700 font-medium leading-relaxed">
              {summary}
            </p>
          )}
        </CardTitle>
      </CardHeader>

      <div className="px-6 py-2.5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => void handlePlayToggle()}
          className={cn(
            'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 shadow-xs min-h-[44px] touch-manipulation select-none',
            isCurrentPlaying
              ? 'bg-pantone-blue text-white hover:bg-pantone-blue/90 shadow-md ring-2 ring-pantone-blue/30 active:scale-95'
              : isCurrentEpisode
                ? 'bg-pantone-blue/10 text-pantone-blue border border-pantone-blue/30 hover:bg-pantone-blue/20 active:scale-95'
                : 'bg-zinc-100 hover:bg-zinc-200/80 text-zinc-900 border border-zinc-200/80 active:scale-95',
          )}
          title={isCurrentPlaying ? dict.pauseEpisode : (isCurrentEpisode ? dict.resumeEpisode : dict.playEpisode)}
        >
          {isCurrentPlaying
            ? (
                <>
                  <Pause className="size-4 fill-current" />
                  <span>{dict.pauseEpisode}</span>
                  <ActivePlaybackTimer />
                </>
              )
            : (
                <>
                  <Play className="size-4 fill-current ml-0.5" />
                  <span>{isCurrentEpisode ? dict.resumeEpisode : dict.playEpisode}</span>
                </>
              )}
        </button>

        <div className="flex items-center gap-2">
          {shareMessage && (
            <span className="text-xs text-zinc-500 animate-in fade-in" aria-live="polite">
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
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 min-h-[44px] touch-manipulation"
            title={dict.shareMoment}
          >
            <Share2 className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline font-semibold">{dict.shareMoment}</span>
          </button>
        </div>
      </div>

      {showFooter && (
        <div className="px-6 pb-3 pt-1">
          <TabsList className="bg-zinc-100/80 p-1 border border-zinc-200/60 rounded-xl">
            <TabsTrigger value="summary" className="font-semibold rounded-lg data-[state=active]:bg-pantone-blue data-[state=active]:text-white data-[state=active]:shadow-xs">{dict.tabs.summary}</TabsTrigger>
            <TabsTrigger value="podcast" className="font-semibold rounded-lg data-[state=active]:bg-pantone-blue data-[state=active]:text-white data-[state=active]:shadow-xs">{dict.tabs.podcast}</TabsTrigger>
            <TabsTrigger value="references" className="font-semibold rounded-lg data-[state=active]:bg-pantone-blue data-[state=active]:text-white data-[state=active]:shadow-xs">{dict.tabs.references}</TabsTrigger>
          </TabsList>
        </div>
      )}
    </div>
  )

  return (
    <Card className="mb-6 glass border-zinc-200/80 hover:shadow-xl transition-all duration-300 group rounded-2xl">
      {showFooter
        ? (
            <Tabs defaultValue="summary" className="w-full">
              {stickyHeader}
              <CardFooter className="flex-col pt-4 bg-white/40 rounded-b-2xl">
                <TabsContent value="summary" className="w-full prose prose-zinc max-w-none py-6 prose-headings:text-zinc-900 prose-headings:font-bold prose-p:text-zinc-800 prose-p:leading-relaxed prose-a:text-pantone-blue prose-a:font-semibold hover:prose-a:underline">
                  {renderedBlogHtml && (
                    <div dangerouslySetInnerHTML={{ __html: renderedBlogHtml }} />
                  )}
                </TabsContent>
                <TabsContent value="podcast" className="w-full prose prose-zinc max-w-none whitespace-pre-line py-6 leading-relaxed text-zinc-800 font-normal">
                  {article.podcastContent}
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

                    const sourceLink = (() => {
                      if (story.source === 'hacker-news') {
                        return story.hackerNewsUrl ?? story.sourceUrl ?? (story.id ? `https://news.ycombinator.com/item?id=${story.id}` : undefined)
                      }
                      return story.sourceUrl ?? story.url
                    })()

                    return (
                      <div key={`${story.id}-${story.source}`} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-white/60 transition-colors group/item border border-transparent hover:border-zinc-200/60">
                        <Link
                          href={story.url ?? story.sourceUrl ?? '#'}
                          className="text-md text-zinc-800 hover:text-pantone-blue transition-colors line-clamp-1 flex-1 font-semibold"
                          title={story.title}
                          rel="nofollow"
                          target="_blank"
                        >
                          {story.title}
                        </Link>
                        {sourceLabel && sourceLink && (
                          <Link
                            href={sourceLink}
                            className="text-xs px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-700 hover:bg-zinc-200 hover:text-zinc-900 transition-all font-bold tracking-wide uppercase"
                            title={sourceLabel}
                            rel="nofollow"
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
          )
        : (
            stickyHeader
          )}
    </Card>
  )
}
