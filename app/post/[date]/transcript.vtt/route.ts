import { getRequestArticleByDate } from '@/lib/content'
import { createTranscriptOptionsResponse, createTranscriptResponse } from '@/lib/transcript'

export const revalidate = 3600

export async function OPTIONS() {
  return createTranscriptOptionsResponse()
}

export async function GET(_: Request, { params }: { params: Promise<{ date: string }> }) {
  const { date } = await params
  const article = await getRequestArticleByDate(date, 'hacker-news')
  return createTranscriptResponse(article, 'vtt')
}
