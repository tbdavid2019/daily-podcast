'use client'
import { Share2 } from 'lucide-react'
import MarkdownIt from 'markdown-it'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { Card, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { dictionaries } from '@/lib/i18n'
import {
  applyPlaybackStart,
  buildPlaybackShareUrl,
  getArticlePath,
  getPlaybackStartFromHash,
} from '@/lib/playback-share'

const AudioPlayer = dynamic(() => import('player.style/tailwind-audio/react'), {
  ssr: false,
  loading: () => <Skeleton className="w-full h-24" />,
})

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

interface ArticleCardProps {
  article: Article
  staticHost: string
  showSummary?: boolean
  showFooter?: boolean
}

export function ArticleCard({ article, staticHost = '', showSummary = false, showFooter = false }: ArticleCardProps) {
  const isEn = article.variant === 'en'
  const dict = isEn ? dictionaries.en : dictionaries.zh
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null)
  const [shareMessage, setShareMessage] = useState('')
  const [audioError, setAudioError] = useState(false)
  const audio = `${staticHost}/${article.audio}?t=${article.updatedAt}`
  const summary = article.introContent || article.podcastContent?.split('\n')?.[0]

  const setAudioRef = useCallback((element: HTMLAudioElement | null) => {
    setAudioElement(element)
  }, [])

  useEffect(() => {
    if (!audioElement || window.location.pathname !== getArticlePath(article.date, article.variant)) {
      return
    }

    const start = getPlaybackStartFromHash(window.location.hash)
    if (start === null) {
      return
    }

    const seekToSharedStart = () => applyPlaybackStart(audioElement, start)
    if (audioElement.readyState >= HTMLMediaElement.HAVE_METADATA) {
      seekToSharedStart()
      return
    }

    audioElement.addEventListener('loadedmetadata', seekToSharedStart, { once: true })
    return () => audioElement.removeEventListener('loadedmetadata', seekToSharedStart)
  }, [article.date, article.variant, audioElement])

  useEffect(() => {
    if (!audioElement) {
      return
    }

    const parent = audioElement.parentElement
    if (!parent) {
      return
    }

    const setupSeekButtons = () => {
      const shadow = parent.shadowRoot
      if (!shadow) {
        return false
      }

      const backwardBtn = shadow.querySelector('media-seek-backward-button')
      const forwardBtn = shadow.querySelector('media-seek-forward-button')
      if (!backwardBtn || !forwardBtn) {
        return false
      }

      if (!shadow.querySelector('#seek-buttons-enhanced-style')) {
        const style = document.createElement('style')
        style.id = 'seek-buttons-enhanced-style'
        style.textContent = `
          media-seek-backward-button,
          media-seek-forward-button {
            min-width: 44px !important;
            min-height: 44px !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            cursor: pointer !important;
            touch-action: manipulation !important;
            -webkit-tap-highlight-color: transparent !important;
          }
        `
        shadow.appendChild(style)
      }

      return true
    }

    if (!setupSeekButtons()) {
      const interval = setInterval(() => {
        if (setupSeekButtons()) {
          clearInterval(interval)
        }
      }, 50)
      return () => clearInterval(interval)
    }
  }, [audioElement])

  const handleShare = async () => {
    const currentTime = audioElement?.currentTime ?? 0
    const url = buildPlaybackShareUrl(window.location.origin, article.date, article.variant, currentTime)

    try {
      if (navigator.share) {
        await navigator.share({ url })
        setShareMessage(dict.linkCopied)
        return
      }

      await navigator.clipboard.writeText(url)
      setShareMessage(dict.linkCopied)
    }
    catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return
      }

      setShareMessage(dict.shareError)
    }
  }

  const stickyHeader = (
    <div className={`sticky top-0 z-30 bg-white/95 backdrop-blur-xl ${showFooter ? 'border-b border-zinc-200/80 rounded-t-2xl shadow-sm' : 'rounded-2xl'}`}>
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
      <div className="px-6 py-2">
        <AudioPlayer
          className="w-full"
          style={{
            '--media-primary-color': '#0F4C81',
            '--media-secondary-color': 'rgba(226, 232, 240, 0.8)',
            '--media-accent-color': '#F25C05',
          } as React.CSSProperties}
        >
          <audio
            ref={setAudioRef}
            slot="media"
            src={audio}
            preload="metadata"
            playsInline
            tabIndex={article.updatedAt || -1}
            onError={() => setAudioError(true)}
            onPlay={() => {
              if (audioError) {
                setShareMessage(dict.audioNotReady)
              }
            }}
          />
        </AudioPlayer>
        {audioError && (
          <p className="mt-1 text-xs text-amber-600 font-medium flex items-center gap-1">
            <span>⚠️</span>
            {' '}
            {dict.audioNotReady}
          </p>
        )}
        <div className="mt-2 flex items-center justify-end gap-2">
          {shareMessage && <span className="text-xs text-zinc-500" aria-live="polite">{shareMessage}</span>}
          <button
            type="button"
            onClick={() => void handleShare()}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
            title={dict.shareMoment}
          >
            <Share2 className="size-4" aria-hidden="true" />
            {dict.shareMoment}
          </button>
        </div>
      </div>
      {showFooter && (
        <div className="px-6 pb-3 pt-1">
          <TabsList className="bg-zinc-100/80 p-1 border border-zinc-200/60 rounded-xl">
            <TabsTrigger value="summary" className="font-semibold rounded-lg data-[state=active]:bg-pantone-blue data-[state=active]:text-white data-[state=active]:shadow-sm">{dict.tabs.summary}</TabsTrigger>
            <TabsTrigger value="podcast" className="font-semibold rounded-lg data-[state=active]:bg-pantone-blue data-[state=active]:text-white data-[state=active]:shadow-sm">{dict.tabs.podcast}</TabsTrigger>
            <TabsTrigger value="references" className="font-semibold rounded-lg data-[state=active]:bg-pantone-blue data-[state=active]:text-white data-[state=active]:shadow-sm">{dict.tabs.references}</TabsTrigger>
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
                  {article.blogContent && (
                    <div dangerouslySetInnerHTML={{ __html: markdownRenderer.render(article.blogContent) }} />
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
