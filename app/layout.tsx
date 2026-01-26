import type { Metadata } from 'next'
import process from 'node:process'
import { Github, Rss } from 'lucide-react'
import Link from 'next/link'
import { podcastDescription, podcastTitle } from '@/config'
import Script from 'next/script'
import { GoogleAd } from '@/components/google-ad'
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body
        className="antialiased"
      >
        <Script
          id="adsbygoogle-init"
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5210017545918559"
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />

        <div className="flex justify-center min-h-screen">
            {/* Left Sidebar - PC Only */}
            <aside className="hidden xl:block w-[160px] sticky top-4 h-fit pt-20 mr-4">
                <div className="text-xs text-center text-gray-400 mb-2">Advertisement</div>
                <GoogleAd slot="7008136098" style={{ display: 'inline-block', width: '160px', height: '600px' }} />
            </aside>

            {/* Main Content */}
            <div className="w-full max-w-3xl flex-shrink-0">
                <header className="max-w-3xl mx-auto p-4 py-8">
                  <div className="flex items-center justify-start">
                    <Link href="/" title="Home">
                      <h1 className="text-2xl font-bold text-zinc-800">{podcastTitle}</h1>
                    </Link>
                    <a
                      href="/rss.xml"
                      className="text-orange-500 hover:text-orange-700 transition-colors ml-2"
                      title="RSS Feed"
                    >
                      <Rss className="w-6 h-6 font-bold" />
                    </a>
                  </div>
                  <p className="text-md text-gray-500 my-4">{podcastDescription}</p>
                </header>
                <main className="max-w-3xl mx-auto px-4">
                  <div className="max-w-3xl mx-auto">
                    {children}
                  </div>
                </main>
                <footer className="max-w-3xl mx-auto p-4 py-8">
                  <div className="text-sm text-gray-500">
                    Not affiliated with, endorsed by, or associated with Hacker News.
                    &quot;Hacker News&quot; is a registered trademark of Y Combinator.
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
