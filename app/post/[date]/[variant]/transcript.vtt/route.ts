import { getRequestArticleByDate } from '@/lib/content'
import { calculateCueTimings, generateWebVTT, parseDialogueLines } from '@/lib/transcript'

export const revalidate = 3600

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept',
    },
  })
}

export async function GET(_: Request, { params }: { params: Promise<{ date: string, variant: string }> }) {
  const { date, variant } = await params
  const episodeVariant = variant === 'main' ? 'hacker-news' : variant
  const article = await getRequestArticleByDate(date, episodeVariant)

  if (!article) {
    return new Response('Episode not found', { status: 404 })
  }

  const cues = parseDialogueLines(article.podcastContent, article.dialogue)
  const timedCues = calculateCueTimings(cues)
  const vtt = generateWebVTT(timedCues, article.title)

  return new Response(vtt, {
    headers: {
      'Content-Type': 'text/vtt; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    },
  })
}
