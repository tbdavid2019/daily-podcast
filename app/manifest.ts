import type { MetadataRoute } from 'next'
import { podcastDescription, podcastTitle } from '@/config'

const themeColor = '#111827'
const backgroundColor = '#ffffff'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: podcastTitle,
    short_name: podcastTitle,
    description: podcastDescription,
    start_url: '/',
    display: 'standalone',
    background_color: backgroundColor,
    theme_color: themeColor,
    lang: 'zh-TW',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
