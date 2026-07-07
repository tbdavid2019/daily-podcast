import { getCloudflareContext } from '@opennextjs/cloudflare'
import React from 'react'
import { ArticleCard } from '@/components/article-card'
import { GoogleAd } from '@/components/google-ad'
import { Pagination } from '@/components/pagination'
import { keepDays } from '@/config'
import { getPastDays, mapScriptToArticle } from '@/lib/utils'

export const revalidate = 600
const PAGE_SIZE = 6

interface HomeProps {
  searchParams: Promise<{
    page?: string
  }>
}

export default async function Home({ searchParams }: HomeProps) {
  const { env } = await getCloudflareContext({ async: true })
  const runEnv = env.NEXTJS_ENV || 'production'
  const variant = 'hacker-news'

  const resolvedSearchParams = await searchParams
  // Parse page number
  const currentPage = Number(resolvedSearchParams?.page) || 1

  // 使用台北時區（UTC+8）來匹配後端的 KV key 生成邏輯
  const allPastDays = getPastDays(keepDays, 8)
  const totalItems = allPastDays.length
  const totalPages = Math.ceil(totalItems / PAGE_SIZE)

  // Calculate slice range for current page
  const startIndex = (currentPage - 1) * PAGE_SIZE
  const endIndex = startIndex + PAGE_SIZE
  const currentDays = allPastDays.slice(startIndex, endIndex)

  const posts = (await Promise.all(
    currentDays.map(async (day) => {
      // Try fetching new script format first
      const scriptKey = `script:${runEnv}:${variant}:${day}`
      const scriptData = await env.HACKER_NEWS_KV.get(scriptKey, 'json')

      if (scriptData) {
        return mapScriptToArticle(scriptData, runEnv, variant)
      }

      // Fallback to old content format
      const post = await env.HACKER_NEWS_KV.get(`content:${runEnv}:hacker-news:${day}`, 'json')
      return post as unknown as Article
    }),
  )).filter(Boolean) as Article[]

  return (
    <>
      {posts.map((post, index) => (
        <React.Fragment key={post.date}>
          <ArticleCard
            article={post}
            staticHost={env.NEXT_STATIC_HOST}
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
