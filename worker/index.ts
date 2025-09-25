export * from '../workflow'

interface Env extends CloudflareEnv {
  HACKER_NEWS_WORKFLOW: Workflow
  BROWSER: Fetcher
  ASSETS: Fetcher
}

interface WorkflowParams {
  today?: string
  force?: boolean
}

function parseBoolean(value: string | null): boolean | undefined {
  if (value === null) {
    return undefined
  }
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false
  }
  return undefined
}

async function extractParamsFromRequest(request: Request): Promise<WorkflowParams | undefined> {
  const url = new URL(request.url)
  const params: WorkflowParams = {}

  const todayFromQuery = url.searchParams.get('today')?.trim()
  if (todayFromQuery) {
    params.today = todayFromQuery
  }

  const forceFromQuery = parseBoolean(url.searchParams.get('force'))
  if (forceFromQuery !== undefined) {
    params.force = forceFromQuery
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const contentType = request.headers.get('content-type') || ''

    if (contentType.includes('application/json')) {
      try {
        const body = await request.clone().json() as Partial<WorkflowParams>
        if (body.today) {
          params.today = String(body.today).trim()
        }
        if (typeof body.force === 'boolean') {
          params.force = body.force
        }
      }
      catch (error) {
        console.warn('Failed to parse workflow request JSON body', { error })
      }
    }
  }

  return Object.keys(params).length ? params : undefined
}

export default {
  async runWorkflow(event: ScheduledEvent | Request, env: Env, _ctx: ExecutionContext) {
    console.info('trigger event by:', event)

    let params: WorkflowParams | undefined

    if (event instanceof Request) {
      params = await extractParamsFromRequest(event)
    }

    const instance = await env.HACKER_NEWS_WORKFLOW.create(params ? { params } : undefined)

    const instanceDetails = {
      id: instance.id,
      params: params ?? null,
      details: await instance.status(),
    }

    console.info('instance detail:', instanceDetails)
    return new Response(JSON.stringify(instanceDetails), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
    })
  },
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url)

    // Handle workflow trigger endpoint
    if (url.pathname === '/workflow' || request.method === 'POST') {
      return this.runWorkflow(request, env, ctx)
    }

    if (url.pathname === '/audio') {
      const assetUrl = new URL('/audio.html', request.url)
      const assetRequest = new Request(assetUrl, request)
      return env.ASSETS.fetch(assetRequest)
    }

    // Redirect to our Web application instead of the original author's site
    return Response.redirect('https://daily-podcast.oobwei.workers.dev/')
  },
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    return this.runWorkflow(event, env, ctx)
  },
}
