import { getRequestArticleByDate } from '@/lib/content'
import { createTranscriptOptionsResponse, createTranscriptResponse } from '@/lib/transcript'

export const revalidate = 3600

export async function OPTIONS() {
  return createTranscriptOptionsResponse()
}

export async function GET(_: Request, { params }: { params: Promise<{ date: string, variant: string }> }) {
  const { date, variant } = await params
  const episodeVariant = variant === 'main' ? 'hacker-news' : variant
  const article = await getRequestArticleByDate(date, episodeVariant)
  return createTranscriptResponse(article, 'vtt')
}
