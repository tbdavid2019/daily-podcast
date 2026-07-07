import Link from 'next/link'
import { cn } from '@/lib/utils'

interface PaginationProps {
  currentPage: number
  totalPages: number
  className?: string
}

export function Pagination({ currentPage, totalPages, className }: PaginationProps) {
  const hasPrev = currentPage > 1
  const hasNext = currentPage < totalPages

  if (!hasPrev && !hasNext) {
    return null
  }

  return (
    <div className={cn('flex justify-center gap-4 py-8', className)}>
      {hasPrev
        ? (
            <Link
              href={`/?page=${currentPage - 1}`}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              &larr; 上一頁
            </Link>
          )
        : (
            <span className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-50 border border-gray-300 rounded-md cursor-not-allowed">
              &larr; 上一頁
            </span>
          )}

      <span className="px-4 py-2 text-sm text-gray-500 flex items-center">
        第
        {' '}
        {currentPage}
        {' '}
        頁 / 共
        {' '}
        {totalPages}
        {' '}
        頁
      </span>

      {hasNext
        ? (
            <Link
              href={`/?page=${currentPage + 1}`}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              下一頁 &rarr;
            </Link>
          )
        : (
            <span className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-50 border border-gray-300 rounded-md cursor-not-allowed">
              下一頁 &rarr;
            </span>
          )}
    </div>
  )
}
