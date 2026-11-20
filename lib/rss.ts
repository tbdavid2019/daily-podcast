/**
 * Checks whether RSS candidate episodes already have published audio objects in R2.
 * Uses bounded concurrency so feed generation avoids serial head() latency while
 * keeping simultaneous subrequests within Cloudflare Workers limits.
 */
export interface VerifiedRssPost {
  post: Article
  audioSize: number
  contentType?: string
}

export interface CheckedRssPostsResult {
  verifiedPosts: VerifiedRssPost[]
  hasRecentPendingAudio: boolean
}

const RSS_AUDIO_HEAD_CONCURRENCY = 6
const RECENT_PENDING_AUDIO_WINDOW = 2

export async function checkRssPostsAudio(
  posts: readonly Article[],
  bucket: Pick<R2Bucket, 'head'>,
  concurrency = RSS_AUDIO_HEAD_CONCURRENCY,
): Promise<CheckedRssPostsResult> {
  const verifiedPosts: VerifiedRssPost[] = []
  let hasRecentPendingAudio = false
  const batchSize = Math.max(1, Math.min(concurrency, 6))

  for (let start = 0; start < posts.length; start += batchSize) {
    const batch = posts.slice(start, start + batchSize)
    const heads = await Promise.all(
      batch.map(async (post) => {
        if (!post.audio) {
          return null
        }
        try {
          return await bucket.head(post.audio)
        }
        catch (error) {
          console.warn(`RSS: R2 head failed for ${post.audio}`, error)
          return null
        }
      }),
    )

    heads.forEach((audioInfo, offset) => {
      const postIndex = start + offset
      const post = batch[offset]
      if (!audioInfo) {
        if (post.audio) {
          console.warn(`RSS: Audio file not found in R2 for ${post.date}: ${post.audio}`)
        }
        if (postIndex < RECENT_PENDING_AUDIO_WINDOW) {
          hasRecentPendingAudio = true
        }
        return
      }

      verifiedPosts.push({
        post,
        audioSize: audioInfo.size || 0,
        contentType: audioInfo.httpMetadata?.contentType,
      })
    })
  }

  return {
    verifiedPosts,
    hasRecentPendingAudio,
  }
}

export const RSS_CACHE_TTL_READY_SECONDS = 60 * 60 * 24 * 7
export const RSS_CACHE_TTL_PENDING_SECONDS = 60
