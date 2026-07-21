import process from 'node:process'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import React from 'react'
import { ArticleCard } from '@/components/article-card'
import { GoogleAd } from '@/components/google-ad'
import { Pagination } from '@/components/pagination'
import { getHomepageArticles } from '@/lib/content'

export const revalidate = 598
const PAGE_SIZE = 6

interface HomeProps {
  searchParams: Promise<{
    page?: string
  }>
}

export default async function Home({ searchParams }: HomeProps) {
  const { env } = await getCloudflareContext({ async: true })

  const resolvedSearchParams = await searchParams
  // Parse page number
  const currentPage = Number(resolvedSearchParams?.page) || 1
  const { posts, totalPages } = await getHomepageArticles(env, currentPage, PAGE_SIZE)

  return (
    <>
      {posts.map((post, index) => (
        <React.Fragment key={post.date}>
          <ArticleCard
            article={post}
            staticHost={env.NEXT_STATIC_HOST || process.env.NEXT_STATIC_HOST}
            showSummary
          />
          {(index + 1) % 2 === 0 && (
            <div className="my-8 w-full flex flex-col items-center">
              <div className="text-xs text-gray-400 mb-2">Advertisement</div>
              <GoogleAd slot="7008136098" className="w-full flex justify-center" />
            </div>
          )}
        </React.Fragment>
      ))}

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        className="mt-8"
      />
    </>
  )
}
