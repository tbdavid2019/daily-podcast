import type { Metadata } from 'next'
import type { ArticleTab } from '@/lib/playback-share'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { notFound } from 'next/navigation'
import { ArticleCard } from '@/components/article-card'
import { podcastTitle } from '@/config'
import { getRequestArticleByDate } from '@/lib/content'
import { getBaseUrl } from '@/lib/discovery'
import { withRenderedBlogHtml } from '@/lib/markdown'
import { isValidArticleTab } from '@/lib/playback-share'

export const revalidate = 3600

interface PostVariantTabPageProps {
  params: Promise<{ date: string, variant: string, tab: string }>
}

export async function generateMetadata({ params }: PostVariantTabPageProps): Promise<Metadata> {
  const { date, variant, tab } = await params

  if (!isValidArticleTab(tab)) {
    return notFound()
  }

  const episodeVariant = variant === 'main' ? 'hacker-news' : variant
  const post = await getRequestArticleByDate(date, episodeVariant)

  if (!post) {
    return notFound()
  }

  const isEn = episodeVariant === 'en'
  const tabSuffix = tab === 'podcast'
    ? ' - Podcast'
    : tab === 'references'
      ? (isEn ? ' - References' : ' - 參考來源')
      : (isEn ? ' - Summary' : ' - 重點總結')

  const title = `${post.title}${tabSuffix}`
  const description = post.introContent || post.podcastContent?.slice(0, 200) || post.title
  const url = `${getBaseUrl()}/post/${post.date}/${episodeVariant}/${tab}`

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
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

export default async function PostVariantTabPage({ params }: PostVariantTabPageProps) {
  const { env } = await getCloudflareContext({ async: true })
  const { date, variant, tab } = await params

  if (!isValidArticleTab(tab)) {
    return notFound()
  }

  const episodeVariant = variant === 'main' ? 'hacker-news' : variant
  const post = await getRequestArticleByDate(date, episodeVariant)

  if (!post) {
    return notFound()
  }

  return (
    <ArticleCard
      key={`${post.date}-${episodeVariant}-${tab}`}
      article={withRenderedBlogHtml(post)}
      staticHost={env.NEXT_STATIC_HOST}
      showFooter
      initialTab={tab as ArticleTab}
    />
  )
}
