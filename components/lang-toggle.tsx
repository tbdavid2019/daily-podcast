'use client'

import { Globe } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'

export function getAlternateLangPath(pathname: string): { isEn: boolean, nextPath: string } {
  if (pathname === '/en' || pathname === '/en/') {
    return { isEn: true, nextPath: '/' }
  }
  if (pathname === '/' || pathname === '') {
    return { isEn: false, nextPath: '/en' }
  }

  const segments = pathname.replace(/^\/+|\/+$/g, '').split('/')
  if (segments[0] === 'post' && segments[1]) {
    const date = segments[1]
    const remaining = segments.slice(2)
    const hasEn = remaining.includes('en')
    const tabs = remaining.filter(s => s !== 'en')
    const tab = tabs[0]

    if (hasEn) {
      const nextTab = tab && tab !== 'summary' ? `/${tab}` : ''
      return { isEn: true, nextPath: `/post/${date}${nextTab}` }
    }
    const nextTab = tab && tab !== 'summary' ? `/${tab}` : ''
    return { isEn: false, nextPath: `/post/${date}/en${nextTab}` }
  }

  const isEn = pathname.startsWith('/en') || pathname.includes('/en/') || pathname.endsWith('/en')
  if (isEn) {
    return { isEn: true, nextPath: '/' }
  }
  return { isEn: false, nextPath: '/en' }
}

export function LangToggle() {
  const pathname = usePathname()
  const router = useRouter()
  const { isEn, nextPath } = getAlternateLangPath(pathname || '/')

  const toggleLanguage = () => {
    router.push(nextPath)
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
