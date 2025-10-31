'use client'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import Markdown from 'react-markdown'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const AudioPlayer = dynamic(() => import('player.style/tailwind-audio/react'), {
  ssr: false,
  loading: () => <Skeleton className="w-full h-24" />,
})

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
    <Card className="mb-4">
      <CardHeader>
        <CardTitle>
          <Link href={`/post/${article.date}`} title={article.title} className="text-zinc-800">
            <h2 className="text-lg">{article.title}</h2>
          </Link>
          {showSummary && <p className="text-base py-4 text-zinc-500 font-normal">{summary}</p>}
        </CardTitle>
      </CardHeader>
      <CardContent className="h-32">
        <AudioPlayer
          className="w-full"
          style={{ '--media-primary-color': '#18181b', '--media-secondary-color': '#f2f2f3', '--media-accent-color': '#18181b' } as React.CSSProperties}
        >
          <audio
            slot="media"
            src={audio}
            preload="metadata"
            playsInline
            crossOrigin="anonymous"
            tabIndex={article.updatedAt || -1}
          >
          </audio>
        </AudioPlayer>
      </CardContent>
      {showFooter && (
        <CardFooter className="flex-col">

          <Tabs defaultValue="summary" className="w-full">
            <TabsList>
              <TabsTrigger value="summary" className="font-bold">總結</TabsTrigger>
              <TabsTrigger value="podcast" className="font-bold">播客</TabsTrigger>
              <TabsTrigger value="references" className="font-bold">參考</TabsTrigger>
            </TabsList>
            <TabsContent value="summary" className="prose prose-zinc max-w-none py-4 prose-a:no-underline hover:prose-a:underline">
              <Markdown>{article.blogContent}</Markdown>
            </TabsContent>
            <TabsContent value="podcast" className="prose prose-zinc max-w-none whitespace-pre-line py-4">
              {article.podcastContent}
            </TabsContent>
            <TabsContent value="references" className="py-4">
              {article.stories?.map((story) => {
                const sourceLabel = (() => {
                  switch (story.source) {
                    case 'hacker-news':
                      return '評論'
                    case 'github-trending':
                      return 'GitHub'
                    case 'product-hunt':
                      return 'Product Hunt'
                    case 'dev-to':
                      return 'Dev.to'
                    case 'reddit':
                      return story.subreddit ? `r/${story.subreddit}` : 'Reddit'
                    default:
                      return null
                  }
                })()

                const sourceLink = (() => {
                  if (story.source === 'hacker-news') {
                    return story.hackerNewsUrl ?? story.sourceUrl ?? (story.id ? `https://news.ycombinator.com/item?id=${story.id}` : undefined)
                  }
                  return story.sourceUrl ?? story.url
                })()

                return (
                  <div key={`${story.id}-${story.source}`} className="flex items-center gap-2 py-1 group">
                    <Link
                      href={story.url ?? story.sourceUrl ?? '#'}
                      className="text-base text-zinc-800 hover:text-zinc-950 transition-colors line-clamp-1 flex-1 font-semibold hover:underline"
                      title={story.title}
                      rel="nofollow"
                      target="_blank"
                    >
                      {story.title}
                    </Link>
                    {sourceLabel && sourceLink && (
                      <Link
                        href={sourceLink}
                        className="text-sm px-2 py-1 rounded-md bg-zinc-100 text-zinc-500 hover:bg-zinc-200 transition-all"
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
