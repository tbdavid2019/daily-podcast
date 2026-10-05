import type { Metadata, Viewport } from 'next'
import process from 'node:process'
import localFont from 'next/font/local'
import Script from 'next/script'
import { AudioPlayerProvider } from '@/components/audio-player-context'
import { BgToggle } from '@/components/bg-toggle'
import { BingBackground } from '@/components/bing-background'
import { GlobalBottomPlayer } from '@/components/global-bottom-player'
import { GoogleAd } from '@/components/google-ad'
import { PwaInstallButton } from '@/components/pwa-install-button'
import { PwaServiceWorker } from '@/components/pwa-service-worker'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
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
        <AudioPlayerProvider>
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
              <SiteHeader installButton={<PwaInstallButton />} />
              <main className="max-w-3xl mx-auto px-4 pb-28">
                <div className="max-w-3xl mx-auto space-y-6">
                  {children}
                </div>
              </main>
              <SiteFooter />
            </div>

            {/* Right Sidebar - PC Only */}
            <aside className="hidden xl:block w-[160px] sticky top-4 h-fit pt-20 ml-4">
              <div className="glass p-2.5 rounded-2xl border border-zinc-200/80 shadow-md">
                <div className="text-[11px] font-bold text-center text-zinc-500 mb-2 uppercase tracking-wider">Advertisement</div>
                <GoogleAd slot="7008136098" style={{ display: 'inline-block', width: '136px', height: '600px' }} />
              </div>
            </aside>
          </div>

          <GlobalBottomPlayer />
        </AudioPlayerProvider>
      </body>
    </html>
  )
}
