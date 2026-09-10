import type { WorkflowParams } from '../workflow/types'
import type { NormalizedWorkflowParams } from './workflow-security'
import {
  authenticateWorkflowRequest,
  buildWorkflowInstanceId,
  createIdempotentWorkflowInstance,
  getCalendarDate,
  parseTimezoneOffset,
  parseWorkflowRequest,
  resolveOperationDate,
} from './workflow-security'

export { PodcastAudioWorkflow } from '../workflow/audio'
export { PodcastScriptWorkflow } from '../workflow/index'

interface Env extends CloudflareEnv {
  HACKER_NEWS_WORKFLOW: Workflow<WorkflowParams>
  HACKER_NEWS_AUDIO_WORKFLOW: Workflow<WorkflowParams>
  HACKER_NEWS_KV: KVNamespace
  BROWSER: Fetcher
  ASSETS: Fetcher
  API_SECRET_TOKEN?: string
  WORKER_ENV?: string
  TIMEZONE_OFFSET?: string
}

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...headers,
    },
  })
}

function requestErrorResponse(error: {
  status: number
  code: string
  message: string
}) {
  const headers: HeadersInit = {}
  if (error.status === 401) {
    headers['WWW-Authenticate'] = 'Bearer realm="workflow"'
  }

  return jsonResponse({
    error: {
      code: error.code,
      message: error.message,
    },
  }, error.status, headers)
}

async function startWorkflow(
  params: NormalizedWorkflowParams,
  env: Env,
  idempotencyKey?: string | null,
) {
  const runEnv = env.WORKER_ENV || 'production'
  const timezoneOffset = parseTimezoneOffset(env.TIMEZONE_OFFSET)
  const operationDate = resolveOperationDate(params.today, new Date(), timezoneOffset)
  const workflowParams: NormalizedWorkflowParams = {
    ...params,
    today: operationDate,
  }

  let instanceId: string
  try {
    instanceId = await buildWorkflowInstanceId({
      runEnv,
      operationDate,
      params,
      idempotencyKey,
    })
  }
  catch {
    return requestErrorResponse({
      status: 400,
      code: 'INVALID_IDEMPOTENCY_KEY',
      message: params.force
        ? 'A valid Idempotency-Key is required when force is true'
        : 'Idempotency-Key is invalid',
    })
  }

  const workflow = params.phase === 'audio'
    ? env.HACKER_NEWS_AUDIO_WORKFLOW
    : env.HACKER_NEWS_WORKFLOW

  try {
    const { instance, duplicateDetected } = await createIdempotentWorkflowInstance(workflow, {
      id: instanceId,
      params: workflowParams,
    })
    const instanceDetails = {
      id: instance.id,
      params: workflowParams,
      details: await instance.status(),
    }

    if (duplicateDetected) {
      console.info('Returning existing Workflow instance', { id: instance.id, params })
      return jsonResponse({
        message: 'Workflow instance already exists for this operation',
        existingInstance: instanceDetails,
        duplicateDetected: true,
      })
    }

    console.info('Created Workflow instance', { id: instance.id, params })
    return jsonResponse({
      ...instanceDetails,
      duplicateDetected: false,
    }, 202)
  }
  catch (error) {
    console.error('Failed to create or retrieve Workflow instance', {
      instanceId,
      phase: params.phase,
      error,
    })
    return requestErrorResponse({
      status: 503,
      code: 'WORKFLOW_UNAVAILABLE',
      message: 'Workflow could not be started',
    })
  }
}

export default {
  async getScript(request: Request, env: Env) {
    const url = new URL(request.url)
    const today = url.searchParams.get('today')
    const variant = url.searchParams.get('variant') || url.searchParams.get('type') || 'hacker-news'

    const runEnv = env.WORKER_ENV || 'production'

    // Calculate date if not provided
    let displayDate = today
    if (!displayDate) {
      displayDate = getCalendarDate(new Date(), parseTimezoneOffset(env.TIMEZONE_OFFSET))
    }

    const normalizedVariant = variant === 'main' ? 'hacker-news' : variant
    const scriptKey = `script:${runEnv}:${normalizedVariant}:${displayDate}`

    const data = await env.HACKER_NEWS_KV.get(scriptKey)

    if (!data) {
      return new Response(JSON.stringify({ error: 'Script not found', key: scriptKey }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return new Response(data, {
      headers: { 'Content-Type': 'application/json' },
    })
  },

  async fetch(request: Request, env: Env) {
    const url = new URL(request.url)

    if (url.pathname === '/workflow') {
      if (request.method !== 'POST') {
        return jsonResponse({
          error: {
            code: 'METHOD_NOT_ALLOWED',
            message: 'Use POST to trigger a Workflow',
          },
        }, 405, { Allow: 'POST' })
      }

      const authResult = authenticateWorkflowRequest(request, env.API_SECRET_TOKEN)
      if (!authResult.ok) {
        if (authResult.code === 'AUTH_NOT_CONFIGURED') {
          console.error('API_SECRET_TOKEN is not configured')
        }
        return requestErrorResponse(authResult)
      }

      const parseResult = await parseWorkflowRequest(request)
      if (!parseResult.ok) {
        return requestErrorResponse(parseResult)
      }

      return startWorkflow(
        parseResult.params,
        env,
        request.headers.get('idempotency-key'),
      )
    }

    // Handle script preview endpoint
    if (url.pathname === '/script') {
      return this.getScript(request, env)
    }

    if (url.pathname === '/audio') {
      const assetUrl = new URL('/audio.html', request.url)
      const assetRequest = new Request(assetUrl, request)
      return env.ASSETS.fetch(assetRequest)
    }

    // Redirect to our Web application instead of the original author's site
    return Response.redirect('https://daily-podcast.oobwei.workers.dev/')
  },
  async scheduled(event: ScheduledEvent, env: Env) {
    console.info('scheduled event', event.cron)
    const response = await startWorkflow({
      variant: 'hacker-news',
      phase: 'script',
      force: false,
    }, env)

    if (!response.ok) {
      throw new Error(`Scheduled Workflow trigger failed with status ${response.status}`)
    }
  },
}
