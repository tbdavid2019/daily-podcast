'use client'

import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
}

export function PwaInstallButton() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  }, [])

  if (!installPrompt)
    return null

  return (
    <button
      type="button"
      className="ml-3 rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-bold text-white transition-opacity hover:opacity-80"
      onClick={() => {
        void installPrompt.prompt().finally(() => setInstallPrompt(null))
      }}
    >
      安裝 App
    </button>
  )
}
