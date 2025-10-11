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
