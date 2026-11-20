'use client'

import { Image as ImageIcon, ImageOff } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import {
  getBgEnabledServerSnapshot,
  getBgEnabledSnapshot,
  setBgEnabledPreference,
  subscribeBgEnabled,
} from '@/lib/bg-preference'
import { cn } from '@/lib/utils'

export function BgToggle() {
  const enabled = useSyncExternalStore(
    subscribeBgEnabled,
    getBgEnabledSnapshot,
    getBgEnabledServerSnapshot,
  )

  const toggle = () => {
    setBgEnabledPreference(!enabled)
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
