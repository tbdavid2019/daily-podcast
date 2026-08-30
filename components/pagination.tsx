'use client'

import type React from 'react'
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CornerDownLeft,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface PaginationProps {
  currentPage: number
  totalPages: number
  className?: string
}

export function Pagination({ currentPage, totalPages, className }: PaginationProps) {
  const router = useRouter()
  const [jumpPage, setJumpPage] = useState('')

  if (totalPages <= 1) {
    return null
  }

  const hasPrev = currentPage > 1
  const hasNext = currentPage < totalPages

  // 產生分頁按鈕清單（包含前後頁碼與省略號）
  const getPageItems = () => {
    const delta = 2 // 當前頁面前後顯示幾頁
    const range: number[] = []
    const items: Array<{ key: string, type: 'page' | 'dots', value?: number }> = []
    let l: number | undefined

    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) {
        range.push(i)
      }
    }

    for (const i of range) {
      if (l !== undefined) {
        if (i - l === 2) {
          items.push({ key: `page-${l + 1}`, type: 'page', value: l + 1 })
        }
        else if (i - l !== 1) {
          items.push({ key: `dots-after-${l}`, type: 'dots' })
        }
      }
      items.push({ key: `page-${i}`, type: 'page', value: i })
      l = i
    }

    return items
  }

  const pageItems = getPageItems()

  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const pageNum = Number.parseInt(jumpPage.trim(), 10)
    if (!Number.isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
      router.push(`/?page=${pageNum}`)
      setJumpPage('')
    }
  }

  return (
    <nav
      aria-label="分頁導航"
      className={cn(
        'w-full flex flex-col items-center justify-center gap-3.5 py-8 px-2',
        className,
      )}
    >
      {/* 第 1 行：核心分頁導航列（不折行，保持整齊單行） */}
      <div className="flex items-center justify-center gap-1 sm:gap-1.5 p-1.5 rounded-2xl glass backdrop-blur-xl bg-white/75 dark:bg-zinc-900/75 border border-zinc-200/60 dark:border-zinc-800/60 shadow-lg shadow-zinc-950/5 max-w-full overflow-x-auto">
        {/* 第一頁按鈕 */}
        {hasPrev
          ? (
              <Link
                href="/?page=1"
                title="前往第一頁"
                className="inline-flex items-center justify-center size-8 sm:size-9 rounded-xl text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
                aria-label="第一頁"
              >
                <ChevronsLeft className="size-4" />
              </Link>
            )
          : (
              <span className="inline-flex items-center justify-center size-8 sm:size-9 rounded-xl text-zinc-300 dark:text-zinc-700 cursor-not-allowed">
                <ChevronsLeft className="size-4" />
              </span>
            )}

        {/* 上一頁按鈕 */}
        {hasPrev
          ? (
              <Link
                href={`/?page=${currentPage - 1}`}
                title="上一頁"
                className="inline-flex items-center gap-1 h-8 sm:h-9 px-2 sm:px-3 rounded-xl text-xs sm:text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-950 dark:hover:text-zinc-50 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
                aria-label="上一頁"
              >
                <ChevronLeft className="size-4" />
                <span className="hidden sm:inline">上一頁</span>
              </Link>
            )
          : (
              <span className="inline-flex items-center gap-1 h-8 sm:h-9 px-2 sm:px-3 rounded-xl text-xs sm:text-sm font-medium text-zinc-300 dark:text-zinc-700 cursor-not-allowed">
                <ChevronLeft className="size-4" />
                <span className="hidden sm:inline">上一頁</span>
              </span>
            )}

        {/* 數字頁碼 pills */}
        <div className="flex items-center gap-1">
          {pageItems.map((item) => {
            if (item.type === 'dots') {
              return (
                <span
                  key={item.key}
                  className="inline-flex items-center justify-center size-8 sm:size-9 text-xs text-zinc-400 font-semibold select-none"
                >
                  •••
                </span>
              )
            }

            const pageNum = item.value!
            const isActive = pageNum === currentPage

            return isActive
              ? (
                  <span
                    key={item.key}
                    aria-current="page"
                    className="inline-flex items-center justify-center min-w-8 sm:min-w-9 h-8 sm:h-9 px-2.5 sm:px-3 rounded-xl text-xs sm:text-sm font-bold bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950 shadow-md shadow-zinc-950/10 ring-2 ring-zinc-900/10 dark:ring-zinc-100/20 select-none"
                  >
                    {pageNum}
                  </span>
                )
              : (
                  <Link
                    key={item.key}
                    href={`/?page=${pageNum}`}
                    className="inline-flex items-center justify-center min-w-8 sm:min-w-9 h-8 sm:h-9 px-2.5 sm:px-3 rounded-xl text-xs sm:text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-950 dark:hover:text-zinc-50 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
                  >
                    {pageNum}
                  </Link>
                )
          })}
        </div>

        {/* 下一頁按鈕 */}
        {hasNext
          ? (
              <Link
                href={`/?page=${currentPage + 1}`}
                title="下一頁"
                className="inline-flex items-center gap-1 h-8 sm:h-9 px-2 sm:px-3 rounded-xl text-xs sm:text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-950 dark:hover:text-zinc-50 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
                aria-label="下一頁"
              >
                <span className="hidden sm:inline">下一頁</span>
                <ChevronRight className="size-4" />
              </Link>
            )
          : (
              <span className="inline-flex items-center gap-1 h-8 sm:h-9 px-2 sm:px-3 rounded-xl text-xs sm:text-sm font-medium text-zinc-300 dark:text-zinc-700 cursor-not-allowed">
                <span className="hidden sm:inline">下一頁</span>
                <ChevronRight className="size-4" />
              </span>
            )}

        {/* 最後一頁按鈕 */}
        {hasNext
          ? (
              <Link
                href={`/?page=${totalPages}`}
                title={`前往最後一頁 (第 ${totalPages} 頁)`}
                className="inline-flex items-center justify-center size-8 sm:size-9 rounded-xl text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
                aria-label="最後一頁"
              >
                <ChevronsRight className="size-4" />
              </Link>
            )
          : (
              <span className="inline-flex items-center justify-center size-8 sm:size-9 rounded-xl text-zinc-300 dark:text-zinc-700 cursor-not-allowed">
                <ChevronsRight className="size-4" />
              </span>
            )}
      </div>

      {/* 第 2 行：快速跳頁輸入工具（獨立置中） */}
      <form
        onSubmit={handleJumpSubmit}
        className="flex items-center gap-2 px-4 py-2 rounded-2xl glass backdrop-blur-xl bg-white/75 dark:bg-zinc-900/75 border border-zinc-200/60 dark:border-zinc-800/60 shadow-sm text-xs font-medium text-zinc-600 dark:text-zinc-400"
      >
        <span className="whitespace-nowrap">跳至第</span>
        <div className="relative flex items-center">
          <input
            type="number"
            min={1}
            max={totalPages}
            value={jumpPage}
            onChange={e => setJumpPage(e.target.value)}
            placeholder={String(currentPage)}
            className="w-14 h-7 text-center text-xs font-semibold text-zinc-900 dark:text-zinc-100 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            aria-label="跳至指定頁數"
          />
        </div>
        <span className="whitespace-nowrap">
          頁 / 共
          {' '}
          {totalPages}
          {' '}
          頁
        </span>
        <button
          type="submit"
          disabled={!jumpPage.trim()}
          className="inline-flex items-center justify-center gap-1 h-7 px-2.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 cursor-pointer"
          title="前往指定頁數"
        >
          <span>前往</span>
          <CornerDownLeft className="size-3.5" />
        </button>
      </form>
    </nav>
  )
}
