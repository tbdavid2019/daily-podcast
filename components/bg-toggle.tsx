'use client'

import { useState, useEffect } from 'react'
import { Image as ImageIcon, ImageOff } from 'lucide-react'
import { cn } from '@/lib/utils'

export function BgToggle() {
  const [enabled, setEnabled] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem('bing-bg-enabled')
    if (saved !== null) {
      setEnabled(saved === 'true')
    } else {
      setEnabled(true)
    }
  }, [])

  const toggle = () => {
    const newState = !enabled
    setEnabled(newState)
    localStorage.setItem('bing-bg-enabled', String(newState))
    
    // Dispatch custom event to notify BingBackground
    window.dispatchEvent(new CustomEvent('bing-bg-toggle', { 
      detail: { enabled: newState } 
    }))
  }

  return (
    <button
      onClick={toggle}
      className={cn(
        "fixed top-4 right-4 z-50 p-2 rounded-full transition-all duration-300",
        "glass border border-white/20 hover:scale-110",
        enabled ? "text-primary bg-white/60" : "text-gray-400 bg-white/20"
      )}
      title={enabled ? "關閉背景" : "開啟背景"}
    >
      {enabled ? <ImageIcon className="w-5 h-5" /> : <ImageOff className="w-5 h-5" />}
    </button>
  )
}
