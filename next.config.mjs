import process from 'node:process'
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'

if (process.env.NODE_ENV === 'development') {
  initOpenNextCloudflareForDev()
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  expireTime: 3600,
  rewrites: () => [
    {
      source: '/blog.xml',
      destination: '/rss.xml',
    },
  ],
}

export default nextConfig
