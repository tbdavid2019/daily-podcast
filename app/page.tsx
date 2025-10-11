import { getCloudflareContext } from '@opennextjs/cloudflare'
import { ArticleCard } from '@/components/article-card'
import { keepDays } from '@/config'
import { getPastDays } from '@/lib/utils'

export const revalidate = 600

export default async function Home() {
  const { env } = await getCloudflareContext({ async: true })
  const runEnv = env.NEXTJS_ENV
  // 使用台北時區（UTC+8）來匹配後端的 KV key 生成邏輯
  const pastDays = getPastDays(keepDays, 8)
  const posts = (await Promise.all(
    pastDays.map(async (day) => {
      const post = await env.HACKER_NEWS_KV.get(`content:${runEnv}:hacker-news:${day}`, 'json')
      return post as unknown as Article
    }),
  )).filter(Boolean)

  return (
    <>
      {posts.map(post => (
        <ArticleCard
          key={post.date}
          article={post}
          staticHost={env.NEXT_STATIC_HOST}
          showSummary
        />
      ))}
    </>
  )
}
