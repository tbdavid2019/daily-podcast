export * from '../workflow'

interface Env extends CloudflareEnv {
  HACKER_NEWS_WORKFLOW: Workflow
  BROWSER: Fetcher
}

export default {
  async runWorkflow(event: ScheduledEvent | Request, env: Env, ctx: ExecutionContext) {
    console.info('trigger event by:', event)

    const createWorkflow = async () => {
      const today = new Date().toISOString().split('T')[0]
      const lockKey = `workflow-lock:${today}`

      // Check if workflow is already running today
      const existingLock = await env.HACKER_NEWS_KV.get(lockKey)
      if (existingLock) {
        console.info('Workflow already running today, skipping...', existingLock)
        return { message: 'workflow already running', instanceId: existingLock }
      }

      const instance = await env.HACKER_NEWS_WORKFLOW.create()

      // Set lock with instance ID, expires in 1 hour
      await env.HACKER_NEWS_KV.put(lockKey, instance.id, { expirationTtl: 3600 })

      const instanceDetails = {
        id: instance.id,
        details: await instance.status(),
      }

      console.info('instance detail:', instanceDetails)
      return instanceDetails
    }

    const result = await createWorkflow()
    ctx.waitUntil(Promise.resolve())

    return new Response(JSON.stringify(result))
  },
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url)

    // Handle workflow trigger endpoint
    if (url.pathname === '/workflow' || request.method === 'POST') {
      return this.runWorkflow(request, env, ctx)
    }

    // Redirect to our Web application instead of the original author's site
    return Response.redirect('https://daily-podcast.oobwei.workers.dev/')
  },
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    return this.runWorkflow(event, env, ctx)
  },
}
