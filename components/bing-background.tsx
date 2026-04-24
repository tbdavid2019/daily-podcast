'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

export function BingBackground() {
  const [isLoaded, setIsLoaded] = useState(false)
  const [isEnabled, setIsEnabled] = useState(true) // Default to ON
  const [imageUrl, setImageUrl] = useState('')

  useEffect(() => {
    // Check if enabled from localStorage, default to true if not set
    const saved = localStorage.getItem('bing-bg-enabled')
    if (saved !== null) {
      setIsEnabled(saved === 'true')
    } else {
      localStorage.setItem('bing-bg-enabled', 'true')
    }

    // Listen for custom toggle events
    const handleToggle = (e: any) => {
      setIsEnabled(e.detail.enabled)
    }
    window.addEventListener('bing-bg-toggle', handleToggle)

    // Fetch random image from GitHub source
    const fetchRandomImage = async () => {
      try {
        const response = await fetch('https://raw.githubusercontent.com/v5tech/bing-wallpaper/main/bing-wallpaper.md')
        const text = await response.text()
        const matches = text.match(/https:\/\/cn\.bing\.com\/th\?id=[^)]+/g)
        if (matches && matches.length > 0) {
          const randomUrl = matches[Math.floor(Math.random() * matches.length)]
          setImageUrl(randomUrl)
        } else {
          // Fallback
          setImageUrl('https://cn.bing.com/th?id=OHR.HathawayCottage_EN-US1795877015_UHD.jpg')
        }
      } catch (error) {
        console.error('Failed to fetch Bing wallpaper list:', error)
        setImageUrl('https://cn.bing.com/th?id=OHR.HathawayCottage_EN-US1795877015_UHD.jpg')
      }
    }

    fetchRandomImage()

    return () => window.removeEventListener('bing-bg-toggle', handleToggle)
  }, [])

  if (!isEnabled) return null

  return (
    <div 
      className={cn(
        "fixed inset-0 -z-50 overflow-hidden transition-opacity duration-1000 ease-in-out",
        isLoaded ? "opacity-100" : "opacity-0"
      )}
    >
      <img
        src={imageUrl}
        alt="Bing Wallpaper"
        className={cn(
          "h-full w-full object-cover",
          isLoaded && "animate-zoom-out"
        )}
        onLoad={() => setIsLoaded(true)}
      />
      {/* Overlay to ensure readability */}
      <div className="absolute inset-0 bg-black/10 backdrop-blur-[2px]" />
    </div>
  )
}
