import type { Metadata } from 'next'
import process from 'node:process'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import React from 'react'
import { ArticleCard } from '@/components/article-card'
import { GoogleAd } from '@/components/google-ad'
import { Pagination } from '@/components/pagination'
import { podcastDescriptionEn, podcastTitleEn } from '@/config'
import { getHomepageArticles } from '@/lib/content'

export const revalidate = 598
const PAGE_SIZE = 6

export const metadata: Metadata = {
  title: `${podcastTitleEn} - English Edition`,
  description: podcastDescriptionEn,
  alternates: {
    canonical: '/en',
    types: {
      'application/rss+xml': [
        {
          url: '/rss-en.xml',
          title: podcastTitleEn,
        },
      ],
    },
  },
  openGraph: {
    title: `${podcastTitleEn} - English Edition`,
    description: podcastDescriptionEn,
    url: '/en',
    locale: 'en_US',
    siteName: podcastTitleEn,
  },
}

interface EnHomeProps {
  searchParams: Promise<{
    page?: string
  }>
}

export default async function EnHome({ searchParams }: EnHomeProps) {
  const { env } = await getCloudflareContext({ async: true })

  const resolvedSearchParams = await searchParams
  const currentPage = Number(resolvedSearchParams?.page) || 1
  const { posts, totalPages } = await getHomepageArticles(env, currentPage, PAGE_SIZE, 'en')

  return (
    <>
      {posts.length === 0 && (
        <div className="glass p-8 rounded-2xl text-center border border-zinc-200/80 shadow-md my-6">
          <h2 className="text-xl font-bold text-zinc-900 mb-2">English Episodes Coming Soon</h2>
          <p className="text-sm text-zinc-600 max-w-md mx-auto leading-relaxed">
            We are curating daily English technology podcast episodes from Hacker News, GitHub Trending, and Product Hunt.
            You can subscribe to the dedicated English RSS feed below.
          </p>
          <div className="mt-5">
            <a
              href="/rss-en.xml"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 transition-colors"
            >
              Subscribe to English RSS Feed
            </a>
          </div>
        </div>
      )}

      {posts.map((post, index) => (
        <React.Fragment key={post.date}>
          <ArticleCard
            article={post}
            staticHost={env.NEXT_STATIC_HOST || process.env.NEXT_STATIC_HOST}
            showSummary
          />
          {(index + 1) % 2 === 0 && (
            <div className="my-8 w-full flex flex-col items-center">
              <div className="w-full glass p-3.5 rounded-2xl border border-zinc-200/80 shadow-sm flex flex-col items-center">
                <div className="text-[11px] font-bold text-center text-zinc-500 mb-2 uppercase tracking-wider">Advertisement</div>
                <GoogleAd slot="7008136098" className="w-full flex justify-center" />
              </div>
            </div>
          )}
        </React.Fragment>
      ))}

      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          basePath="/en"
          className="mt-8"
        />
      )}
    </>
  )
}
