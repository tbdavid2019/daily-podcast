'use client'

import { ExternalLink, Radio, Rss } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { podcastTitle, podcastTitleEn } from '@/config'
import { dictionaries } from '@/lib/i18n'

export function SiteFooter() {
  const pathname = usePathname()
  const isEn = pathname.startsWith('/en') || pathname.endsWith('/en')
  const dict = isEn ? dictionaries.en : dictionaries.zh
  const title = isEn ? podcastTitleEn : podcastTitle

  return (
    <footer className="max-w-3xl mx-auto mt-14 mb-8 glass rounded-2xl p-6 sm:p-8 border border-zinc-200/80 shadow-lg">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-200/70 pb-6">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-gradient-to-br from-[#0F4C81] to-[#1E3A8A] flex items-center justify-center text-white shadow-sm shadow-[#0F4C81]/30">
            <Radio className="size-5" />
          </div>
          <div>
            <h3 className="font-bold text-zinc-900 text-base leading-tight">{title}</h3>
            <p className="text-xs text-zinc-600 font-medium mt-1">{dict.footerTagline}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href="/rss.xml"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 hover:text-orange-800 transition-colors"
            title="繁體中文 RSS Feed"
          >
            <Rss className="size-3.5 text-pantone-tangerine" />
            RSS 繁中
          </a>
          <a
            href="/rss-en.xml"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 hover:text-blue-800 transition-colors"
            title="English RSS Feed for YouTube / Apple Podcasts"
          >
            <Rss className="size-3.5 text-pantone-blue" />
            RSS EN
          </a>
          <a
            href="/docs/api"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-100 text-zinc-700 border border-zinc-200 hover:bg-zinc-200 transition-colors"
          >
            {dict.apiDocs}
          </a>
        </div>
      </div>

      <div className="pt-5 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-700">
        <div className="flex items-center gap-1.5 font-medium">
          <span>{dict.builtBy}</span>
          <a
            href="https://david888.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-bold text-[#0F4C81] hover:text-[#0A2540] underline underline-offset-4 decoration-[#0F4C81]/50 hover:decoration-[#0F4C81] transition-colors"
          >
            david888.com
            <ExternalLink className="size-3" />
          </a>
          {dict.maintain && <span>{dict.maintain}</span>}
        </div>
        <div className="flex items-center gap-3 text-zinc-600 font-medium">
          <Link href="/" className="hover:text-zinc-900 transition-colors">繁中首頁</Link>
          <span>·</span>
          <Link href="/en" className="hover:text-zinc-900 transition-colors">English</Link>
          <span>·</span>
          <a href="/robots.txt" className="hover:text-zinc-900 transition-colors">Robots</a>
          <span>·</span>
          <a href="/llms.txt" className="hover:text-zinc-900 transition-colors">llms.txt</a>
        </div>
      </div>
    </footer>
  )
}
