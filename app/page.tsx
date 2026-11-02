import process from 'node:process'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import React from 'react'
import { ArticleCard } from '@/components/article-card'
import { Comments } from '@/components/comments'
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
          {index === 0 && currentPage === 1 && (
            <div className="my-6 glass p-4 sm:p-6 rounded-2xl border border-zinc-200/80 shadow-sm">
              <div className="flex items-center gap-2 mb-4 pb-3 border-b border-zinc-200/80">
                <span className="size-2.5 rounded-full bg-pantone-blue animate-pulse" />
                <h3 className="text-base font-bold text-zinc-900 tracking-tight">本日單集讀者討論</h3>
                <span className="text-xs text-zinc-500 font-medium truncate">{`(${post.title})`}</span>
              </div>
              <Comments
                date={post.date}
                title={post.title}
                variant={post.variant}
                published={new Date(post.date).toISOString()}
                showHeader={false}
              />
            </div>
          )}
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

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        className="mt-8"
      />
    </>
  )
}
