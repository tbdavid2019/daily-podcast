'use client'

import { Globe } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'

export function LangToggle() {
  const pathname = usePathname()
  const router = useRouter()

  const isEn = pathname.startsWith('/en') || pathname.endsWith('/en')

  const toggleLanguage = () => {
    if (isEn) {
      if (pathname === '/en') {
        router.push('/')
      }
      else if (pathname.endsWith('/en')) {
        router.push(pathname.replace(/\/en$/, ''))
      }
      else {
        router.push('/')
      }
    }
    else {
      if (pathname === '/') {
        router.push('/en')
      }
      else if (pathname.startsWith('/post/')) {
        router.push(`${pathname}/en`)
      }
      else {
        router.push('/en')
      }
    }
  }

  return (
    <button
      type="button"
      onClick={toggleLanguage}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold glass border border-zinc-200/80 text-zinc-700 hover:text-zinc-950 hover:bg-white shadow-sm transition-all hover:scale-105 active:scale-95 ml-2"
      title={isEn ? '切換為繁體中文' : 'Switch to English'}
      aria-label={isEn ? '切換為繁體中文' : 'Switch to English'}
    >
      <Globe className="size-3.5 text-[#0F4C81]" />
      <span>{isEn ? '繁體中文' : 'English'}</span>
    </button>
  )
}
