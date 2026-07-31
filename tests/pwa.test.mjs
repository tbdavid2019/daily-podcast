import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

const rootUrl = new URL('../', import.meta.url)

describe('PWA configuration', () => {
  it('provides an installable standalone manifest with Android icons', async () => {
    const manifest = await readFile(new URL('app/manifest.ts', rootUrl), 'utf8')

    assert.match(manifest, /id:\s*'\/'/)
    assert.match(manifest, /start_url:\s*'\/'/)
    assert.match(manifest, /display:\s*'standalone'/)
    assert.match(manifest, /sizes:\s*'192x192'/)
    assert.match(manifest, /sizes:\s*'512x512'/)
    assert.match(manifest, /purpose:\s*'maskable'/)
  })

  it('registers a service worker and provides Apple web-app metadata', async () => {
    const layout = await readFile(new URL('app/layout.tsx', rootUrl), 'utf8')

    assert.match(layout, /appleWebApp:\s*\{[\s\S]*?capable:\s*true/)
    assert.match(layout, /export const viewport: Viewport = \{[\s\S]*?themeColor: '#111827'/)
    assert.match(layout, /<html lang="zh-TW">/)
    assert.match(layout, /PwaServiceWorker/)
  })

  it('serves a conservative offline fallback without caching podcast data', async () => {
    const serviceWorkerUrl = new URL('public/sw.js', rootUrl)
    await access(serviceWorkerUrl)

    const serviceWorker = await readFile(serviceWorkerUrl, 'utf8')
    assert.match(serviceWorker, /addEventListener\('install'/)
    assert.match(serviceWorker, /addEventListener\('fetch'/)
    assert.match(serviceWorker, /request\.mode !== 'navigate'/)
    assert.match(serviceWorker, /OFFLINE_PAGE = '\/offline'/)
    assert.match(serviceWorker, /cache\.put\(OFFLINE_PAGE, new Response/)
    assert.match(serviceWorker, /text\/html; charset=utf-8/)
    assert.match(serviceWorker, /caches\.match\(OFFLINE_PAGE\)/)
    assert.doesNotMatch(serviceWorker, /\.mp3/)
    assert.match(serviceWorker, /目前沒有網路連線/)
  })
})
