'use client'
import MarkdownIt from 'markdown-it'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const AudioPlayer = dynamic(() => import('player.style/tailwind-audio/react'), {
  ssr: false,
  loading: () => <Skeleton className="w-full h-24" />,
})

const markdownRenderer = new MarkdownIt({
  html: true,
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
  const audio = `${staticHost}/${article.audio}?t=${article.updatedAt}`
  const summary = article.introContent || article.podcastContent?.split('\n')?.[0]

  return (
    <Card className="mb-6 glass border-zinc-200/50 hover:shadow-xl transition-all duration-500 group">
      <CardHeader className="pb-2">
        <CardTitle>
          <Link href={`/post/${article.date}`} title={article.title} className="text-zinc-900 hover:text-zinc-700 transition-colors">
            <h2 className="text-xl font-bold tracking-tight leading-tight">{article.title}</h2>
          </Link>
          {showSummary && (
            <p className="text-md py-3 text-zinc-600 font-medium leading-relaxed opacity-90">
              {summary}
            </p>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0 sticky top-0 z-30 bg-white/90 backdrop-blur-md border-y border-zinc-200/30">
        <div className="px-6 py-2">
          <AudioPlayer
            className="w-full"
            style={{
              '--media-primary-color': '#18181b',
              '--media-secondary-color': 'rgba(242, 242, 243, 0.5)',
              '--media-accent-color': '#18181b',
            } as React.CSSProperties}
          >
            <audio
              slot="media"
              src={audio}
              preload="metadata"
              playsInline
              crossOrigin="anonymous"
              tabIndex={article.updatedAt || -1}
            />
          </AudioPlayer>
        </div>
      </CardContent>
      {showFooter && (
        <CardFooter className="flex-col pt-4 bg-zinc-50/20 rounded-b-lg">
          <Tabs defaultValue="summary" className="w-full">
            <TabsList className="bg-zinc-100/50 p-1">
              <TabsTrigger value="summary" className="font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm">總結</TabsTrigger>
              <TabsTrigger value="podcast" className="font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm">播客</TabsTrigger>
              <TabsTrigger value="references" className="font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm">參考</TabsTrigger>
            </TabsList>
            <TabsContent value="summary" className="prose prose-zinc max-w-none py-6 prose-a:no-underline hover:prose-a:underline prose-p:leading-relaxed">
              {article.blogContent && (
                <div dangerouslySetInnerHTML={{ __html: markdownRenderer.render(article.blogContent) }} />
              )}
            </TabsContent>
            <TabsContent value="podcast" className="prose prose-zinc max-w-none whitespace-pre-line py-6 leading-relaxed text-zinc-700">
              {article.podcastContent}
            </TabsContent>
            <TabsContent value="references" className="py-6 space-y-3">
              {article.stories?.map((story) => {
                const sourceLabel = (() => {
                  switch (story.source) {
                    case 'hacker-news': return '評論'
                    case 'github-trending': return 'GitHub'
                    case 'product-hunt': return 'Product Hunt'
                    case 'dev-to': return 'Dev.to'
                    case 'reddit': return story.subreddit ? `r/${story.subreddit}` : 'Reddit'
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
                  <div key={`${story.id}-${story.source}`} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-white/40 transition-colors group/item border border-transparent hover:border-zinc-200/50">
                    <Link
                      href={story.url ?? story.sourceUrl ?? '#'}
                      className="text-md text-zinc-800 hover:text-zinc-950 transition-colors line-clamp-1 flex-1 font-semibold"
                      title={story.title}
                      rel="nofollow"
                      target="_blank"
                    >
                      {story.title}
                    </Link>
                    {sourceLabel && sourceLink && (
                      <Link
                        href={sourceLink}
                        className="text-xs px-2.5 py-1 rounded-full bg-zinc-100/80 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 transition-all font-bold tracking-wide uppercase"
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
          </Tabs>
        </CardFooter>
      )}
    </Card>
  )
}
