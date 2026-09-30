import type { Metadata, Viewport } from 'next'
import process from 'node:process'
import { ExternalLink, Radio, Rss } from 'lucide-react'
import localFont from 'next/font/local'
import Link from 'next/link'
import Script from 'next/script'
import { BgToggle } from '@/components/bg-toggle'
import { BingBackground } from '@/components/bing-background'
import { GoogleAd } from '@/components/google-ad'
import { LangToggle } from '@/components/lang-toggle'
import { PwaInstallButton } from '@/components/pwa-install-button'
import { PwaServiceWorker } from '@/components/pwa-service-worker'
import { WebMcpProvider } from '@/components/webmcp-provider'
import { podcastDescription, podcastTitle } from '@/config'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'https://podcast.david888.com'),
  title: podcastTitle,
  description: podcastDescription,
  openGraph: {
    title: podcastTitle,
    description: podcastDescription,
    url: 'https://podcast.david888.com',
    siteName: podcastTitle,
    type: 'website',
    locale: 'zh_TW',
    images: [
      {
        url: '/opengraph-image.png',
        width: 1200,
        height: 630,
        alt: podcastTitle,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: podcastTitle,
    description: podcastDescription,
    site: '@david888',
    images: [
      {
        url: '/twitter-image.png',
        width: 1200,
        height: 630,
        alt: podcastTitle,
      },
    ],
  },
  alternates: {
    canonical: 'https://podcast.david888.com',
    types: {
      'application/rss+xml': [
        {
          url: '/rss.xml',
          title: podcastTitle,
        },
      ],
    },
  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icon.png', type: 'image/png', sizes: '512x512' },
    ],
    shortcut: ['/favicon.ico'],
    apple: [
      { url: '/icons/apple-touch-icon.png', type: 'image/png', sizes: '180x180' },
    ],
  },
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: podcastTitle,
    statusBarStyle: 'black-translucent',
  },
}

export const viewport: Viewport = {
  themeColor: '#111827',
}

const jetbrainsMono = localFont({
  src: '../public/fonts/JetBrainsMono-Medium.woff2',
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

const genJyuuGothic = localFont({
  src: '../public/fonts/GenJyuuGothic-Medium.woff2',
  variable: '--font-gen-jyuu-gothic',
  display: 'swap',
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-TW">
      <body
        className={`${jetbrainsMono.variable} ${genJyuuGothic.variable} font-sans antialiased`}
      >
        <PwaServiceWorker />
        <WebMcpProvider />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              'name': podcastTitle,
              'description': podcastDescription,
              'url': 'https://podcast.david888.com',
            }),
          }}
        />
        <Script
          id="adsbygoogle-init"
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5210017545918559"
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
        <Script
          id="webtalk-widget"
          src="https://webtalk-nine.vercel.app/webtalk.js"
          data-webtalk-scope="origin"
          data-webtalk-ai-endpoint="https://webtalk-nine.vercel.app/api/webtalk/ai"
          strategy="lazyOnload"
        />

        <BingBackground />
        <BgToggle />

        <div className="flex justify-center min-h-screen relative">
          {/* Left Sidebar - PC Only */}
          <aside className="hidden xl:block w-[160px] sticky top-4 h-fit pt-20 mr-4">
            <div className="glass p-2.5 rounded-2xl border border-zinc-200/80 shadow-md">
              <div className="text-[11px] font-bold text-center text-zinc-500 mb-2 uppercase tracking-wider">Advertisement</div>
              <GoogleAd slot="7008136098" style={{ display: 'inline-block', width: '136px', height: '600px' }} />
            </div>
          </aside>

          {/* Main Content */}
          <div className="w-full max-w-3xl flex-shrink-0 z-10">
            <header className="max-w-3xl mx-auto p-6 sm:p-8 glass rounded-2xl mb-6">
              <div className="flex items-center justify-start flex-wrap gap-2">
                <Link href="/" title="Home" className="hover:opacity-85 transition-opacity">
                  <h1 className="text-3xl font-black tracking-tight text-zinc-900 drop-shadow-sm">{podcastTitle}</h1>
                </Link>
                <a
                  href="/rss.xml"
                  className="text-pantone-tangerine hover:text-[#EA580C] transition-all hover:scale-110 ml-2 p-1 rounded-lg hover:bg-orange-50"
                  title="RSS Feed"
                >
                  <Rss className="w-7 h-7 font-bold" />
                </a>
                <PwaInstallButton />
                <LangToggle />
              </div>
              <p className="text-base sm:text-lg text-zinc-700 mt-4 leading-relaxed max-w-2xl font-medium">{podcastDescription}</p>
            </header>
            <main className="max-w-3xl mx-auto px-4">
              <div className="max-w-3xl mx-auto space-y-6">
                {children}
              </div>
            </main>
            <footer className="max-w-3xl mx-auto mt-14 mb-8 glass rounded-2xl p-6 sm:p-8 border border-zinc-200/80 shadow-lg">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-200/70 pb-6">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-xl bg-gradient-to-br from-[#0F4C81] to-[#1E3A8A] flex items-center justify-center text-white shadow-sm shadow-[#0F4C81]/30">
                    <Radio className="size-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-zinc-900 text-base leading-tight">DAVID888 Daily 每日放送</h3>
                    <p className="text-xs text-zinc-600 font-medium mt-1">科技廣播 · Hacker News / GitHub / Product Hunt 精華</p>
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
                    API 文件
                  </a>
                </div>
              </div>

              <div className="pt-5 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-700">
                <div className="flex items-center gap-1.5 font-medium">
                  <span>由</span>
                  <a
                    href="https://david888.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-bold text-[#0F4C81] hover:text-[#0A2540] underline underline-offset-4 decoration-[#0F4C81]/50 hover:decoration-[#0F4C81] transition-colors"
                  >
                    david888.com
                    <ExternalLink className="size-3" />
                  </a>
                  <span>製作維護</span>
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
          </div>

          {/* Right Sidebar - PC Only */}
          <aside className="hidden xl:block w-[160px] sticky top-4 h-fit pt-20 ml-4">
            <div className="glass p-2.5 rounded-2xl border border-zinc-200/80 shadow-md">
              <div className="text-[11px] font-bold text-center text-zinc-500 mb-2 uppercase tracking-wider">Advertisement</div>
              <GoogleAd slot="7008136098" style={{ display: 'inline-block', width: '136px', height: '600px' }} />
            </div>
          </aside>
        </div>
      </body>
    </html>
  )
}
