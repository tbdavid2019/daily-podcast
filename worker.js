import openNextWorker, {
  BucketCachePurge,
  DOQueueHandler,
  DOShardedTagCache,
} from './.open-next/worker.js'
import { applyWebPageCacheHeaders } from './lib/web-cache-policy'

export { BucketCachePurge, DOQueueHandler, DOShardedTagCache }

export default {
  async fetch(request, env, ctx) {
    const response = await openNextWorker.fetch(request, env, ctx)
    return applyWebPageCacheHeaders(request, response)
  },
}
