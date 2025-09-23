import type { Metadata } from 'next'
import process from 'node:process'
import { Github, Rss } from 'lucide-react'
import Link from 'next/link'
import { podcastDescription, podcastTitle } from '@/config'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: process.env.NEXT_PUBLIC_BASE_URL ? new URL(process.env.NEXT_PUBLIC_BASE_URL) : undefined,
  title: podcastTitle,
  description: podcastDescription,
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
            <a
              href="https://github.com/ccbikai/hacker-news"
              className="text-zinc-700 hover:text-zinc-900 transition-colors ml-2"
              title="GitHub"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Github className="w-6 h-6 font-bold" />
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
      </body>
    </html>
  )
}
