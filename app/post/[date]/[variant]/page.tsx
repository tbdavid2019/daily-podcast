import type { Metadata } from 'next'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { notFound } from 'next/navigation'
import { ArticleCard } from '@/components/article-card'
import { podcastTitle } from '@/config'

export const revalidate = 3600

// Helper to map new script data to Article interface
function mapScriptToArticle(data: any, date: string, runEnv: string, variant: string): any {
    if (!data) return null;
    
    // Construct audio path based on new workflow convention
    // Path: {yyyy}/{mm}/{dd}/{env}/{variant}-{date}.mp3
    const audioPath = `${data.displayDate.replace(/-/g, '/')}/${runEnv}/${variant}-${data.displayDate}.mp3`

    // Format dialogue as string for the frontend
    const podcastContent = Array.isArray(data.dialogue) 
        ? data.dialogue.map((line: any) => `${line.speaker}: ${line.text}`).join('\n\n')
        : data.dialogue

    return {
        title: `David888 Daily ${data.displayDate} (${variant})`, 
        date: data.displayDate,
        updatedAt: Date.now(),
        introContent: data.introContent,
        blogContent: data.blogContent,
        podcastContent: podcastContent,
        stories: data.stories || [],
        audio: audioPath,
        variant: variant
    }
}

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
      post = mapScriptToArticle(scriptData, date, runEnv, variant)
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
      post = mapScriptToArticle(scriptData, date, runEnv, variant)
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
