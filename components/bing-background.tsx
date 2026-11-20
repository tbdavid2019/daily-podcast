'use client'

import Image from 'next/image'
import { useEffect, useState, useSyncExternalStore } from 'react'
import {
  getBgEnabledServerSnapshot,
  getBgEnabledSnapshot,
  subscribeBgEnabled,
} from '@/lib/bg-preference'
import { cn } from '@/lib/utils'

const FALLBACK_BING_URL = 'https://cn.bing.com/th?id=OHR.HathawayCottage_EN-US1795877015_UHD.jpg'

export function BingBackground() {
  const [isLoaded, setIsLoaded] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const isEnabled = useSyncExternalStore(
    subscribeBgEnabled,
    getBgEnabledSnapshot,
    getBgEnabledServerSnapshot,
  )

  useEffect(() => {
    if (!isEnabled || imageUrl) {
      return
    }

    let cancelled = false
    const fetchRandomImage = async () => {
      try {
        const response = await fetch('https://raw.githubusercontent.com/v5tech/bing-wallpaper/main/bing-wallpaper.md')
        const text = await response.text()
        const matches = text.match(/https:\/\/cn\.bing\.com\/th\?id=[^)]+/g)
        const selectedUrl = matches && matches.length > 0
          ? matches[Math.floor(Math.random() * matches.length)]
          : FALLBACK_BING_URL
        if (!cancelled) {
          setImageUrl(selectedUrl)
        }
      }
      catch (error) {
        console.error('Failed to fetch Bing wallpaper list:', error)
        if (!cancelled) {
          setImageUrl(FALLBACK_BING_URL)
        }
      }
    }

    void fetchRandomImage()
    return () => {
      cancelled = true
    }
  }, [isEnabled, imageUrl])

  if (!isEnabled || !imageUrl) {
    return null
  }

  return (
    <div
      className={cn(
        'fixed inset-0 -z-50 overflow-hidden transition-opacity duration-1000 ease-in-out',
        isLoaded ? 'opacity-100' : 'opacity-0',
      )}
    >
      <Image
        src={imageUrl}
        alt="Bing Wallpaper"
        fill
        unoptimized
        sizes="100vw"
        className={cn(
          'object-cover',
          isLoaded && 'animate-zoom-out',
        )}
        onLoad={() => setIsLoaded(true)}
      />
      {/* Overlay to ensure readability */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
    </div>
  )
}
