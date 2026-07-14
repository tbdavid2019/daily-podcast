import type { Metadata } from 'next'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { notFound } from 'next/navigation'
import { ArticleCard } from '@/components/article-card'
import { podcastTitle } from '@/config'
import { mapScriptToArticle } from '@/lib/utils'

export const revalidate = 3600

// 生成页面的元数据
export async function generateMetadata({ params }: { params: Promise<{ date: string }> }): Promise<Metadata> {
  const { env } = await getCloudflareContext({ async: true })
  const runEnv = env.NEXTJS_ENV || 'production'
  const date = (await params).date

  // Try new key format first (Script Workflow) - Default to hacker-news variant for now
  // In the future, we might want to support variant selection via URL
  const variant = 'hacker-news'
  const scriptKey = `script:${runEnv}:${variant}:${date}`
  const scriptData = await env.HACKER_NEWS_KV.get(scriptKey, 'json')

  let post: any = null

  if (scriptData) {
    post = mapScriptToArticle(scriptData, runEnv, variant)
  }
  else {
    // Fallback to old key format
    post = (await env.HACKER_NEWS_KV.get(`content:${runEnv}:hacker-news:${date}`, 'json')) as unknown as any
  }

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
  const runEnv = env.NEXTJS_ENV || 'production'

  const date = (await params).date

  // Try new key format first
  const variant = 'hacker-news'
  const scriptKey = `script:${runEnv}:${variant}:${date}`
  const scriptData = await env.HACKER_NEWS_KV.get(scriptKey, 'json')

  let post: any = null

  if (scriptData) {
    post = mapScriptToArticle(scriptData, runEnv, variant)
  }
  else {
    // Fallback to old key format
    post = (await env.HACKER_NEWS_KV.get(`content:${runEnv}:hacker-news:${date}`, 'json')) as unknown as any
  }

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
