import { getRequestArticleByDate } from '@/lib/content'
import { calculateCueTimings, generateSRT, parseDialogueLines } from '@/lib/transcript'

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

export async function GET(_: Request, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params
  const article = await getRequestArticleByDate(date, 'hacker-news')

  if (!article) {
    return new Response('Episode not found', { status: 404 })
  }

  const cues = parseDialogueLines(article.podcastContent, article.dialogue)
  const timedCues = calculateCueTimings(cues)
  const srt = generateSRT(timedCues)

  return new Response(srt, {
    headers: {
      'Content-Type': 'application/x-subrip; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    },
  })
}
