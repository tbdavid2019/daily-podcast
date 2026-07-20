import type { Metadata } from 'next'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { notFound } from 'next/navigation'
import { ArticleCard } from '@/components/article-card'
import { podcastTitle } from '@/config'
import { getRequestArticleByDate } from '@/lib/content'

export const revalidate = 3600

// 生成页面的元数据
export async function generateMetadata({ params }: { params: Promise<{ date: string }> }): Promise<Metadata> {
  const { env } = await getCloudflareContext({ async: true })
  const date = (await params).date
  const variant = 'hacker-news'
  const post = await getRequestArticleByDate(date, variant)

  if (!post) {
    return notFound()
  }

  const title = post.title
  const description = post.introContent || post.podcastContent?.slice(0, 200) || title
  const url = `${env.NEXT_STATIC_HOST}/post/${post.date}`

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

export default async function PostPage({ params }: { params: Promise<{ date: string }> }) {
  const { env } = await getCloudflareContext({ async: true })
  const date = (await params).date
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
    />
  )
}
