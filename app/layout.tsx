import type { Metadata } from 'next'
import process from 'node:process'
import { Rss } from 'lucide-react'
import { Inter } from 'next/font/google'
import Link from 'next/link'
import Script from 'next/script'
import { BgToggle } from '@/components/bg-toggle'
import { BingBackground } from '@/components/bing-background'
import { GoogleAd } from '@/components/google-ad'
import { podcastDescription, podcastTitle } from '@/config'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'https://daily-podcast.oobwei.workers.dev'),
  title: podcastTitle,
  description: podcastDescription,
  openGraph: {
    title: podcastTitle,
    description: podcastDescription,
    type: 'website',
    locale: 'zh_TW',
  },
  twitter: {
    card: 'summary_large_image',
    title: podcastTitle,
    description: podcastDescription,
  },
  alternates: {
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
      { url: '/icon.png', type: 'image/png', sizes: '512x512' },
    ],
    shortcut: ['/favicon.ico'],
    apple: [
      { url: '/icons/apple-touch-icon.png', type: 'image/png', sizes: '180x180' },
    ],
  },
  manifest: '/manifest.webmanifest',
  themeColor: '#111827',
}

const inter = Inter({ subsets: ['latin'] })

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.className} antialiased`}
      >
        <Script
          id="adsbygoogle-init"
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5210017545918559"
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />

        <BingBackground />
        <BgToggle />

        <div className="flex justify-center min-h-screen relative">
          {/* Left Sidebar - PC Only */}
          <aside className="hidden xl:block w-[160px] sticky top-4 h-fit pt-20 mr-4">
            <div className="text-xs text-center text-gray-400 mb-2">Advertisement</div>
            <GoogleAd slot="7008136098" style={{ display: 'inline-block', width: '160px', height: '600px' }} />
          </aside>

          {/* Main Content */}
          <div className="w-full max-w-3xl flex-shrink-0 z-10">
            <header className="max-w-3xl mx-auto p-4 py-8 glass rounded-xl mb-4">
              <div className="flex items-center justify-start">
                <Link href="/" title="Home" className="hover:opacity-80 transition-opacity">
                  <h1 className="text-3xl font-black tracking-tight text-zinc-900 drop-shadow-sm">{podcastTitle}</h1>
                </Link>
                <a
                  href="/rss.xml"
                  className="text-orange-500 hover:text-orange-600 transition-all hover:scale-110 ml-3"
                  title="RSS Feed"
                >
                  <Rss className="w-7 h-7 font-bold" />
                </a>
              </div>
              <p className="text-lg text-gray-600/80 mt-4 leading-relaxed max-w-2xl font-medium">{podcastDescription}</p>
            </header>
            <main className="max-w-3xl mx-auto px-4">
              <div className="max-w-3xl mx-auto space-y-6">
                {children}
              </div>
            </main>
            <footer className="max-w-3xl mx-auto p-4 py-12 border-t mt-12 border-zinc-200/50 glass rounded-xl">
              <div className="text-sm text-gray-400 font-medium">
                由
                {' '}
                <a href="https://david888.com" target="_blank" rel="noopener noreferrer" className="hover:text-zinc-600 underline transition-colors">david888.com</a>
                {' '}
                製作
              </div>
            </footer>
          </div>

          {/* Right Sidebar - PC Only */}
          <aside className="hidden xl:block w-[160px] sticky top-4 h-fit pt-20 ml-4">
            <div className="text-xs text-center text-gray-400 mb-2">Advertisement</div>
            <GoogleAd slot="7008136098" style={{ display: 'inline-block', width: '160px', height: '600px' }} />
          </aside>
        </div>
      </body>
    </html>
  )
}
