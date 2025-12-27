import type { ClassValue } from 'clsx'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const ONE_DAY = 24 * 60 * 60 * 1000

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
    if (!data) return null;
    
    // Construct audio path based on new workflow convention
    // Path: {yyyy}/{mm}/{dd}/{env}/{variant}-{date}.mp3
    // Note: The audio workflow uploads to: `${displayDate.replaceAll('-', '/')}/${runEnv}/${variant}-${displayDate}.mp3`
    const audioPath = `${data.displayDate.replace(/-/g, '/')}/${runEnv}/${variant}-${data.displayDate}.mp3`

    // Format dialogue as string for the frontend
    const podcastContent = Array.isArray(data.dialogue) 
        ? data.dialogue.map((line: any) => `${line.speaker}: ${line.text}`).join('\n\n')
        : data.dialogue

    return {
        title: `David888 Daily ${data.displayDate}`, // Default title
        date: data.displayDate,
        updatedAt: Date.now(), // Use current time or retrieval time
        introContent: data.introContent,
        blogContent: data.blogContent,
        podcastContent: podcastContent,
        stories: data.stories || [],
        audio: audioPath,
        variant: variant
    }
}
