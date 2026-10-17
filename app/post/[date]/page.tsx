import type { Metadata } from 'next'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { notFound } from 'next/navigation'
import { ArticleCard } from '@/components/article-card'
import { podcastTitle } from '@/config'
import { getRequestArticleByDate } from '@/lib/content'
import { isValidArticleTab } from '@/lib/playback-share'

export const revalidate = 3600

interface PostPageProps {
  params: Promise<{ date: string }>
  searchParams?: Promise<{ tab?: string }>
}

// 產生頁面的中繼資料
export async function generateMetadata({ params, searchParams }: PostPageProps): Promise<Metadata> {
  const { env } = await getCloudflareContext({ async: true })
  const date = (await params).date
  const variant = 'hacker-news'
  const post = await getRequestArticleByDate(date, variant)

  if (!post) {
    return notFound()
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const tab = isValidArticleTab(resolvedSearchParams?.tab) ? resolvedSearchParams.tab : undefined

  const tabSuffix = tab === 'podcast' ? ' - Podcast' : tab === 'references' ? ' - 參考來源' : ''
  const title = `${post.title}${tabSuffix}`
  const description = post.introContent || post.podcastContent?.slice(0, 200) || post.title
  const url = tab ? `${env.NEXT_STATIC_HOST}/post/${post.date}/${tab}` : `${env.NEXT_STATIC_HOST}/post/${post.date}`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      type: 'article',
      publishedTime: new Date(post.date).toISOString(),
      authors: [podcastTitle],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  }
}

export default async function PostPage({ params, searchParams }: PostPageProps) {
  const { env } = await getCloudflareContext({ async: true })
  const date = (await params).date
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const initialTab = isValidArticleTab(resolvedSearchParams?.tab) ? resolvedSearchParams.tab : 'summary'
  const variant = 'hacker-news'
  const post = await getRequestArticleByDate(date, variant)

  if (!post) {
    return notFound()
  }

  return (
    <ArticleCard
      key={post.date}
      article={post}
      staticHost={env.NEXT_STATIC_HOST}
      showFooter
      initialTab={initialTab}
    />
  )
}
