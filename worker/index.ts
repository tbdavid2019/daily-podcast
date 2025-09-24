export * from '../workflow'

interface Env extends CloudflareEnv {
  HACKER_NEWS_WORKFLOW: Workflow
  BROWSER: Fetcher
}

export default {
  async runWorkflow(event: ScheduledEvent | Request, env: Env, _ctx: ExecutionContext) {
    console.info('trigger event by:', event)

    const instance = await env.HACKER_NEWS_WORKFLOW.create()

    const instanceDetails = {
      id: instance.id,
      details: await instance.status(),
    }

    console.info('instance detail:', instanceDetails)
    return new Response(JSON.stringify(instanceDetails))
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
