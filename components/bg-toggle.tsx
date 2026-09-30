'use client'

import { Image as ImageIcon, ImageOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

export function BgToggle() {
  const [enabled, setEnabled] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem('bing-bg-enabled')
    if (saved !== null) {
      setEnabled(saved === 'true')
    }
    else {
      setEnabled(true)
    }
  }, [])

  const toggle = () => {
    const newState = !enabled
    setEnabled(newState)
    localStorage.setItem('bing-bg-enabled', String(newState))

    // Dispatch custom event to notify BingBackground
    window.dispatchEvent(new CustomEvent('bing-bg-toggle', {
      detail: { enabled: newState },
    }))
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        'fixed top-4 right-4 z-50 p-2.5 rounded-full transition-all duration-300 shadow-md',
        'glass border border-zinc-200/80 hover:scale-110 active:scale-95',
        enabled ? 'text-[#0F4C81] bg-white/95 hover:bg-white' : 'text-zinc-500 bg-white/90 hover:bg-white',
      )}
      title={enabled ? '關閉背景' : '開啟背景'}
    >
      {enabled ? <ImageIcon className="w-5 h-5" /> : <ImageOff className="w-5 h-5" />}
    </button>
  )
}
