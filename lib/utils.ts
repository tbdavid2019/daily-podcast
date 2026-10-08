import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const ONE_DAY = 24 * 60 * 60 * 1000

export function getArticleTimestamp(articleDate: string, fallback?: number) {
  if (typeof fallback === 'number' && Number.isFinite(fallback)) {
    return fallback
  }

  const parsed = Date.parse(`${articleDate}T00:00:00+08:00`)
  return Number.isNaN(parsed) ? Date.now() : parsed
}

export function getPastDays(days: number, timezoneOffset: number = 8) {
  return Array.from({ length: days }, (_, index) => {
    const now = new Date()
    // 計算指定時區的時間
    const localTime = new Date(now.getTime() + timezoneOffset * 60 * 60 * 1000)
    // 從當地時間減去天數
    const targetTime = new Date(localTime.getTime() - index * ONE_DAY)
    return targetTime.toISOString().split('T')[0]
  })
}
// Helper to map new script data to Article interface
export function mapScriptToArticle(data: any, runEnv: string, variant: string = 'hacker-news'): any {
  if (!data)
    return null

  // Construct audio path based on new workflow convention
  // Path: {yyyy}/{mm}/{dd}/{env}/{variant}-{date}.mp3
  // Note: The audio workflow uploads to: `${displayDate.replaceAll('-', '/')}/${runEnv}/${variant}-${displayDate}.mp3`
  const audioPath = data.audio || `${data.displayDate.replace(/-/g, '/')}/${runEnv}/${variant}-${data.displayDate}.mp3`

  // Format dialogue as string for the frontend
  const isEnglish = variant === 'en'
  const podcastContent = Array.isArray(data.dialogue)
    ? data.dialogue.map((line: any) => {
        let speaker = line.speaker
        if (isEnglish) {
          if (speaker === '女' || speaker?.toLowerCase() === 'cordelia') {
            speaker = 'Cordelia'
          }
          else if (speaker === '男' || speaker?.toLowerCase() === 'david') {
            speaker = 'David'
          }
        }
        else {
          if (speaker?.toLowerCase() === 'cordelia') {
            speaker = '女'
          }
          else if (speaker?.toLowerCase() === 'david') {
            speaker = '男'
          }
        }
        return `${speaker}: ${line.text}`
      }).join('\n\n')
    : data.dialogue

  // Use the generated title if available (new format), otherwise fallback to constructed title
  let finalTitle = data.title

  if (!finalTitle) {
    const storyTitles = (data.stories || [])
      .slice(0, 3)
      .map((s: any) => s.title)
      .join(' | ')

    finalTitle = storyTitles
      ? `[備用標題] ${data.displayDate} | ${storyTitles}`
      : `[備用標題] ${data.displayDate}`
  }

  return {
    title: finalTitle,
    date: data.displayDate,
    updatedAt: getArticleTimestamp(data.displayDate, data.generatedAt),
    introContent: data.introContent,
    blogContent: data.blogContent,
    podcastContent,
    stories: data.stories || [],
    audio: audioPath,
    variant,
  }
}
