import openNextWorker, {
  BucketCachePurge,
  DOQueueHandler,
  DOShardedTagCache,
} from './.open-next/worker.js'
import { applyWebPageCacheHeaders } from './lib/web-cache-policy'

export { BucketCachePurge, DOQueueHandler, DOShardedTagCache }

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url)

    if (pathname === '/manifest.webmanifest') {
      return env.ASSETS.fetch(request)
    }

    const response = await openNextWorker.fetch(request, env, ctx)
    return applyWebPageCacheHeaders(request, response)
  },
}
