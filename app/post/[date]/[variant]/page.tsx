import type { Metadata } from 'next'
import type { ArticleTab } from '@/lib/playback-share'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { notFound } from 'next/navigation'
import { ArticleCard } from '@/components/article-card'
import { podcastTitle } from '@/config'
import { getRequestArticleByDate } from '@/lib/content'
import { isValidArticleTab } from '@/lib/playback-share'

export const revalidate = 3600

interface PostVariantPageProps {
  params: Promise<{ date: string, variant: string }>
  searchParams?: Promise<{ tab?: string }>
}

function resolveEpisodeAndTab(paramVariant: string, searchTab?: string): { episodeVariant: string, selectedTab: ArticleTab, isDirectTabRoute: boolean } {
  if (isValidArticleTab(paramVariant)) {
    return {
      episodeVariant: 'hacker-news',
      selectedTab: paramVariant,
      isDirectTabRoute: true,
    }
  }

  const normalizedVariant = paramVariant === 'main' ? 'hacker-news' : paramVariant
  const selectedTab = isValidArticleTab(searchTab) ? searchTab : 'summary'
  return {
    episodeVariant: normalizedVariant,
    selectedTab,
    isDirectTabRoute: false,
  }
}

// 產生頁面的中繼資料
export async function generateMetadata({ params, searchParams }: PostVariantPageProps): Promise<Metadata> {
  const { env } = await getCloudflareContext({ async: true })
  const resolvedParams = await params
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const { episodeVariant, selectedTab, isDirectTabRoute } = resolveEpisodeAndTab(resolvedParams.variant, resolvedSearchParams?.tab)

  const post = await getRequestArticleByDate(resolvedParams.date, episodeVariant)

  if (!post) {
    return notFound()
  }

  const isEn = episodeVariant === 'en'
  const tabSuffix = selectedTab === 'podcast'
    ? ' - Podcast'
    : selectedTab === 'references'
      ? (isEn ? ' - References' : ' - 參考來源')
      : isDirectTabRoute
        ? (isEn ? ' - Summary' : ' - 重點總結')
        : ''

  const title = `${post.title}${tabSuffix}`
  const description = post.introContent || post.podcastContent?.slice(0, 200) || post.title
  const url = isDirectTabRoute
    ? `${env.NEXT_STATIC_HOST}/post/${post.date}/${selectedTab}`
    : `${env.NEXT_STATIC_HOST}/post/${post.date}/${episodeVariant}`

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

export default async function PostVariantPage({ params, searchParams }: PostVariantPageProps) {
  const { env } = await getCloudflareContext({ async: true })
  const resolvedParams = await params
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const { episodeVariant, selectedTab } = resolveEpisodeAndTab(resolvedParams.variant, resolvedSearchParams?.tab)

  const post = await getRequestArticleByDate(resolvedParams.date, episodeVariant)

  if (!post) {
    return notFound()
  }

  return (
    <ArticleCard
      key={`${post.date}-${episodeVariant}-${selectedTab}`}
      article={post}
      staticHost={env.NEXT_STATIC_HOST}
      showFooter
      initialTab={selectedTab}
    />
  )
}
