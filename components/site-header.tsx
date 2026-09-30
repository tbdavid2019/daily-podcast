'use client'

import { Rss } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { LangToggle } from '@/components/lang-toggle'
import { PwaInstallButton } from '@/components/pwa-install-button'
import {
  podcastDescription,
  podcastDescriptionEn,
  podcastTitle,
  podcastTitleEn,
} from '@/config'

interface SiteHeaderProps {
  installButton?: React.ReactNode
}

export function SiteHeader({ installButton }: SiteHeaderProps = {}) {
  const pathname = usePathname()
  const isEn = pathname.startsWith('/en') || pathname.endsWith('/en')

  useEffect(() => {
    document.documentElement.lang = isEn ? 'en' : 'zh-TW'
  }, [isEn])

  const title = isEn ? podcastTitleEn : podcastTitle
  const description = isEn ? podcastDescriptionEn : podcastDescription
  const homeHref = isEn ? '/en' : '/'
  const rssHref = isEn ? '/rss-en.xml' : '/rss.xml'
  const rssTitle = isEn ? 'English RSS Feed' : 'RSS 訂閱'

  return (
    <header className="max-w-3xl mx-auto p-6 sm:p-8 glass rounded-2xl mb-6">
      <div className="flex items-center justify-start flex-wrap gap-2">
        <Link href={homeHref} title={isEn ? 'Home' : '首頁'} className="hover:opacity-85 transition-opacity">
          <h1 className="text-3xl font-black tracking-tight text-zinc-900 drop-shadow-sm">{title}</h1>
        </Link>
        <a
          href={rssHref}
          className="text-pantone-tangerine hover:text-[#EA580C] transition-all hover:scale-110 ml-2 p-1 rounded-lg hover:bg-orange-50"
          title={rssTitle}
        >
          <Rss className="w-7 h-7 font-bold" />
        </a>
        {installButton ?? <PwaInstallButton />}
        <LangToggle />
      </div>
      <p className="text-base sm:text-lg text-zinc-700 mt-4 leading-relaxed max-w-2xl font-medium">{description}</p>
    </header>
  )
}
