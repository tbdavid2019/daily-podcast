import { getRequestArticleByDate } from '@/lib/content'
import { calculateCueTimings, generateWebVTT, parseDialogueLines } from '@/lib/transcript'

export const revalidate = 3600

export async function GET(_: Request, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params
  const article = await getRequestArticleByDate(date, 'hacker-news')

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
    },
  })
}
