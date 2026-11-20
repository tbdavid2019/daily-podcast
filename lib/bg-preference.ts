export const BG_ENABLED_STORAGE_KEY = 'bing-bg-enabled'
export const BG_TOGGLE_EVENT = 'bing-bg-toggle'

let memoryBgEnabled: boolean | null = null

export function getBgEnabledServerSnapshot(): boolean {
  return true
}

export function getBgEnabledSnapshot(): boolean {
  if (typeof window === 'undefined') {
    return true
  }
  if (memoryBgEnabled !== null) {
    return memoryBgEnabled
  }
  try {
    const saved = localStorage.getItem(BG_ENABLED_STORAGE_KEY)
    return saved === null ? true : saved === 'true'
  }
  catch {
    return true
  }
}

export function setBgEnabledPreference(enabled: boolean): void {
  if (typeof window === 'undefined') {
    return
  }
  memoryBgEnabled = enabled
  try {
    localStorage.setItem(BG_ENABLED_STORAGE_KEY, String(enabled))
  }
  catch {
    // Ignore storage quota or private browsing errors; in-memory preference still updates listeners
  }
  window.dispatchEvent(new CustomEvent(BG_TOGGLE_EVENT, {
    detail: { enabled },
  }))
}

export function subscribeBgEnabled(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {}
  }
  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === BG_ENABLED_STORAGE_KEY) {
      onStoreChange()
    }
  }
  window.addEventListener(BG_TOGGLE_EVENT, onStoreChange)
  window.addEventListener('storage', handleStorage)
  return () => {
    window.removeEventListener(BG_TOGGLE_EVENT, onStoreChange)
    window.removeEventListener('storage', handleStorage)
  }
}
