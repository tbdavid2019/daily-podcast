'use client'

import { MessageSquare } from 'lucide-react'
import React, { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

export interface CommentsProps {
  date: string
  title?: string
  url?: string
  slug?: string
  variant?: string
  published?: string
  className?: string
  showHeader?: boolean
}

const GARRUL_API = 'https://garrul.ai360.workers.dev'
const GARRUL_SCRIPT_SRC = 'https://garrul.ai360.workers.dev/embed.js'
const GARRUL_SCRIPT_ID = 'garrul-embed-script'

export function Comments({
  date,
  title,
  url,
  slug,
  variant,
  published,
  className,
  showHeader = true,
}: CommentsProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isEn = variant === 'en'
  const lang = isEn ? 'en' : 'zh-Hant'
  const defaultSlug = variant && variant !== 'hacker-news' ? `podcast:${date}:${variant}` : `podcast:${date}`
  const finalSlug = slug || defaultSlug
  const canonicalUrl = url || (typeof window !== 'undefined'
    ? `${window.location.origin}/post/${date}${variant && variant !== 'hacker-news' ? `/${variant}` : ''}`
    : `https://podcast.david888.com/post/${date}${variant && variant !== 'hacker-news' ? `/${variant}` : ''}`)
  const publishedDate = published || (date ? new Date(date).toISOString() : undefined)

  useEffect(() => {
    // 1. Safety check for host element in DOM
    const existingHost = document.getElementById('garrul')

    // If an existing #garrul already has a shadowRoot (e.g. from Strict Mode double-invoke or client navigation),
    // replace it with a fresh node so host.attachShadow() doesn't throw DOMException.
    if (existingHost && existingHost.shadowRoot && containerRef.current) {
      const freshHost = document.createElement('div')
      freshHost.id = 'garrul'
      freshHost.dataset.api = GARRUL_API
      freshHost.dataset.slug = finalSlug
      if (title) {
        freshHost.dataset.title = title
      }
      if (canonicalUrl) {
        freshHost.dataset.url = canonicalUrl
      }
      if (publishedDate) {
        freshHost.dataset.published = publishedDate
      }
      if (lang) {
        freshHost.dataset.lang = lang
      }
      freshHost.style.minHeight = '220px'
      existingHost.replaceWith(freshHost)
    }

    // 2. Remove any previously injected script to prevent duplicate tags
    const existingScript = document.getElementById(GARRUL_SCRIPT_ID)
    if (existingScript) {
      existingScript.remove()
    }

    // 3. Inject embed.js script dynamically
    const script = document.createElement('script')
    script.id = GARRUL_SCRIPT_ID
    script.src = GARRUL_SCRIPT_SRC
    script.async = true
    document.body.appendChild(script)

    return () => {
      // Cleanup script on unmount
      const currentScript = document.getElementById(GARRUL_SCRIPT_ID)
      if (currentScript) {
        currentScript.remove()
      }
    }
  }, [finalSlug, title, canonicalUrl, publishedDate, lang])

  return (
    <div
      ref={containerRef}
      className={cn('w-full', className)}
      style={{
        '--garrul-font': 'var(--font-jetbrains-mono), var(--font-gen-jyuu-gothic), system-ui, -apple-system, sans-serif',
        '--garrul-accent': '#0F4C81',
        '--garrul-accent-hover': '#0a365c',
        '--garrul-link': '#0F4C81',
        '--garrul-radius': '12px',
        '--garrul-border': '#e4e4e7',
        '--garrul-muted': '#71717a',
        '--garrul-fg': '#18181b',
        '--garrul-input-bg': '#ffffff',
        '--garrul-badge-bg': '#e0f2fe',
        '--garrul-badge-fg': '#0369a1',
      } as React.CSSProperties}
    >
      {showHeader && (
        <div className="flex items-center gap-2 mb-4 pb-2 border-b border-zinc-200/60">
          <MessageSquare className="size-4.5 text-pantone-blue stroke-[2.2]" aria-hidden="true" />
          <h3 className="text-base font-bold text-zinc-900 tracking-tight">
            {isEn ? 'Discussion' : '留言討論'}
          </h3>
        </div>
      )}
      <div
        key={finalSlug}
        id="garrul"
        data-api={GARRUL_API}
        data-slug={finalSlug}
        data-title={title}
        data-url={canonicalUrl}
        data-published={publishedDate}
        data-lang={lang}
        style={{ minHeight: '220px' }}
      />
    </div>
  )
}
