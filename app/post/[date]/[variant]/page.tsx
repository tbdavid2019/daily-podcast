import type { Metadata } from 'next'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { notFound } from 'next/navigation'
import { ArticleCard } from '@/components/article-card'
import { podcastTitle } from '@/config'
import { mapScriptToArticle } from '@/lib/utils'

export const revalidate = 3600

// 生成页面的元数据
export async function generateMetadata({ params }: { params: Promise<{ date: string, variant: string }> }): Promise<Metadata> {
  const { env } = await getCloudflareContext({ async: true })
  const runEnv = env.NEXTJS_ENV || 'production'
  const resolvedParams = await params
  const date = resolvedParams.date
  const variant = resolvedParams.variant

  const scriptKey = `script:${runEnv}:${variant}:${date}`
  const scriptData = await env.HACKER_NEWS_KV.get(scriptKey, 'json')
  
  let post: any = null
  
  if (scriptData) {
      post = mapScriptToArticle(scriptData, runEnv, variant)
  }

  if (!post) {
    return notFound()
  }

  const title = post.title
  const description = post.introContent || post.podcastContent?.slice(0, 200) || title
  const url = `${env.NEXT_STATIC_HOST}/post/${post.date}/${variant}`

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
      card: 'summary',
      title,
      description,
    },
  }
}

export default async function PostVariantPage({ params }: { params: Promise<{ date: string, variant: string }> }) {
  const { env } = await getCloudflareContext({ async: true })
  const runEnv = env.NEXTJS_ENV || 'production'

  const resolvedParams = await params
  const date = resolvedParams.date
  const variant = resolvedParams.variant

  const scriptKey = `script:${runEnv}:${variant}:${date}`
  const scriptData = await env.HACKER_NEWS_KV.get(scriptKey, 'json')

  let post: any = null
  
  if (scriptData) {
      post = mapScriptToArticle(scriptData, runEnv, variant)
  }

  if (!post) {
    return notFound()
  }

  return (
    <ArticleCard
      key={`${post.date}-${variant}`}
      article={post}
      staticHost={env.NEXT_STATIC_HOST}
      showFooter
    />
  )
}
